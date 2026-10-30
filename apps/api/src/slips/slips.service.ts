import { createHash } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { assessBooking, codeExpiry } from '../catalog/catalog.policy';
import { BadRequestException, Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { collectionTitle, MARKET_REGISTRY, MARKET_REGISTRY_VERSION, resolveMarketIds, MODE_ODDS, RiskPreference, classifyVariance, clampOddsToMode, generatePublicId, matchDayKickoffWindow, promptMatchDay, readChatRequest, requestedTicketCount, previewOddsFromPrompt, type BookmakerBooking, type GenerationConfig, type ScoredSelection } from '@myodd/shared';
import { JobStatus, VarianceLevel, Prisma } from '@prisma/client';
import { BOOKMAKER_PROVIDER, type BookmakerProvider } from '../bookmaker/bookmaker.provider';
import { PredictionsService } from '../predictions/predictions.service';
import { AiClient } from '../ai/ai.client';
import { PrismaService } from '../prisma/prisma.service';
import { SlipValidatorService } from './slip-validator.service';
import { CREATE_BOOKING_QUEUE } from '../jobs/job.constants';
import { slipFingerprint } from './slip-fingerprint';

export interface GenerateRequest {
  userId?: string;
  requestId?: string;
  requestScope?: string;
  riskMode?: GenerationConfig['riskMode'];
  selectedMarketIds?: string[];
  instruction: string;
  bookingCode?: string;
  splitInto?: number;
  operation?: 'generate' | 'split';
  profileId?: string;
  ticketCount?: number;
  gamesPerTicket?: number;
  matchDate?: string;
  matchDateEnd?: string;
  minimumOdds?: number;
  maximumOdds?: number | null;
  /** Exact prediction-book outcomes to create and preserve as the source ticket. */
  pinnedSelections?: Array<{
    eventId: string;
    marketId: string;
    outcomeId: string;
    specifier?: string;
    odds?: number;
    marketName?: string;
    selectionName?: string;
    homeTeam?: string;
    awayTeam?: string;
    league?: string;
    kickoffAt?: string;
  }>;
}
export interface PrepareJob extends GenerateRequest { jobId: string; groupId: string }
export interface RankedCandidate { selections: ScoredSelection[]; rankOrder: number; slipScore: number }
export interface BookingJob {
  jobId: string; groupId: string; selections: ScoredSelection[]; config: GenerationConfig;
  rankOrder?: number; slipScore?: number;
  failure?: import('@myodd/shared').GenerationFailure;
}

function normalizeCandidates(candidates: RankedCandidate[] | ScoredSelection[][]): RankedCandidate[] {
  return candidates.map((candidate, index) => {
    if (Array.isArray(candidate)) {
      return { selections: candidate, rankOrder: index, slipScore: 0 };
    }
    return {
      selections: candidate.selections,
      rankOrder: candidate.rankOrder ?? index,
      slipScore: candidate.slipScore ?? 0,
    };
  });
}

@Injectable()
export class SlipsService implements OnModuleInit {
  constructor(
    @Inject(BOOKMAKER_PROVIDER) private readonly bookmaker: BookmakerProvider,
    private readonly predictions: PredictionsService,
    private readonly ai: AiClient,
    private readonly validator: SlipValidatorService,
    private readonly prisma: PrismaService,
    private readonly catalog: CatalogService,
    @InjectQueue(CREATE_BOOKING_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    // Rebuild missing Redis work from durable database plans after a restart or queue loss.
    const pending = await this.prisma.generationJob.findMany({ where: { status: { in: [JobStatus.PENDING, JobStatus.RUNNING] } }, orderBy: { createdAt: 'asc' } });
    for (const job of pending) {
      const request = await this.prisma.trainingEvent.findFirst({ where: { jobId: job.id, kind: 'REQUEST_ACCEPTED' }, orderBy: { createdAt: 'asc' } });
      if (!request || !job.groupId) continue;
      const input = { ...(request.payload as unknown as GenerateRequest), jobId: job.id, groupId: job.groupId };
      const plan = await this.prisma.trainingEvent.findFirst({ where: { jobId: job.id, kind: 'BOOKING_PLAN' }, orderBy: { createdAt: 'desc' } });
      if (plan) {
        for (let i = 0; i < job.total; i++) {
          const id = `booking-${job.id}-${i}`;
          if (job.completedTasks.includes(id)) continue;
          const queued = await this.queue.getJob(id);
          if (queued && await queued.getState() === 'failed') await queued.retry();
        }
        const prepared = plan.payload as unknown as { config: GenerationConfig; candidates: RankedCandidate[] | ScoredSelection[][] };
        await this.enqueueBookings(input, prepared.config, normalizeCandidates(prepared.candidates));
      } else {
        await this.queue.add('prepare-generation', input, { jobId: `prepare-${job.id}`, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: 100 });
      }
    }
  }

  async markets() {
    const fixtures = await this.upcomingFixtures();
    const options = MARKET_REGISTRY.map(item => ({ ...item, available: resolveMarketIds([item.id], fixtures).rules.length > 0 }));
    const observed = new Map<string, { id: string; category: string; label: string; available: boolean }>();
    for (const fixture of fixtures) for (const market of fixture.markets) {
      if (!['', '0', 'active', 'open'].includes(market.status.toLowerCase())) continue;
      for (const outcome of market.outcomes) if (outcome.isActive) {
        const id = `provider:${encodeURIComponent(JSON.stringify([market.marketId, market.specifier ?? '', outcome.outcomeId]))}`;
        observed.set(id, { id, category: /min|interval|minute/i.test(market.marketName) ? 'Goal Timing / Time-Based Draws' : 'Other Provider Markets', label: `${market.marketName} ${market.specifier ?? ''}: ${outcome.outcomeName}`, available: true });
      }
    }
    return { version: MARKET_REGISTRY_VERSION, options: [...options, ...observed.values()] };
  }

  private investorSystem(input: GenerateRequest) {
    return input.riskMode === 'INVESTOR' && !input.splitInto && !input.pinnedSelections?.length;
  }

  private explicitControls(config: GenerationConfig, input: GenerateRequest, fixtures: import('@myodd/shared').BookmakerFixture[]): GenerationConfig {
    if (this.investorSystem(input)) {
      const band = MODE_ODDS.INVESTOR;
      const notices = [...config.unhandledRequests];
      const note = (message: string) => { if (!notices.includes(message)) notices.push(message); };
      if (input.selectedMarketIds?.length) {
        note('Investor Mode chooses the markets. Requested markets were not applied.');
      }
      if (input.ticketCount || input.gamesPerTicket) {
        note('Investor Mode chooses the ticket count and games per ticket. Requested counts were not applied.');
      }
      if (input.minimumOdds != null || input.maximumOdds !== undefined) {
        note('Investor Mode kept its fixed ticket odds of 2 to 5. Requested odds were not applied.');
      }
      return {
        ...config,
        riskMode: 'INVESTOR',
        riskPreference: RiskPreference.VERY_LOW,
        minimumOdds: band.minimum,
        maximumOdds: band.maximum,
        allowOddsAdjustment: false,
        numberOfSlips: 10,
        minimumSelections: 1,
        maximumSelections: 50,
        markets: [],
        marketQueries: [],
        marketRules: [],
        relatedMarketRules: [],
        marketPolicy: 'prefer',
        unhandledRequests: notices,
      };
    }
    if (input.riskMode) {
      const band = MODE_ODDS[input.riskMode];
      const notices = config.riskMode && config.riskMode !== input.riskMode ? ['The explicit mode replaced the conflicting prompt mode.'] : [];
      const promptOdds = input.riskMode === 'LAGOS_LIFE' ? previewOddsFromPrompt(input.instruction) : null;
      config = { ...config, riskMode: input.riskMode, minimumOdds: input.minimumOdds ?? promptOdds?.minimum ?? band.minimum, maximumOdds: input.maximumOdds === undefined ? (promptOdds ? promptOdds.maximum : band.maximum) : input.maximumOdds, unhandledRequests: [...config.unhandledRequests, ...notices] };
    }
    if (input.selectedMarketIds?.length) {
      const ids = input.selectedMarketIds.filter(id => !id.startsWith('provider:'));
      const resolved = resolveMarketIds(ids, fixtures);
      for (const id of input.selectedMarketIds.filter(id => id.startsWith('provider:'))) {
        try {
          const [marketId, specifier, outcomeId] = JSON.parse(decodeURIComponent(id.slice(9)));
          if (!fixtures.some(f => f.markets.some(m => m.marketId === marketId && (m.specifier ?? '') === specifier && ['', '0', 'active', 'open'].includes(m.status.toLowerCase()) && m.outcomes.some(o => o.outcomeId === outcomeId && o.isActive)))) throw new Error();
          resolved.rules.push({ marketId, specifier, outcomeIds: [outcomeId] });
        } catch { resolved.unavailable.push('A selected provider market'); }
      }
      if (!resolved.rules.length) throw new BadRequestException('Requested markets are unavailable in the current provider catalog. Change your markets or match day.');
      config = { ...config, markets: [], marketQueries: [], marketRules: resolved.rules, relatedMarketRules: [], marketPolicy: 'only', unhandledRequests: [...config.unhandledRequests, 'Explicit market selections take precedence over prompt market preferences.', ...resolved.unavailable.map(name => `${name} is unavailable and was skipped.`)] };
    }
    return config;
  }

  async analyze(bookingCode: string, publicCatalog = true) {
    const booking = await this.bookmaker.getBooking(bookingCode);
    if (publicCatalog) await this.catalog.remember(bookingCode, 'private', undefined, booking);
    return { ...booking, selectionCount: booking.selections.length };
  }

  async startGeneration(req: GenerateRequest) {
    const requestedCount = requestedTicketCount(req.instruction);
    if ((requestedCount ?? 0) > 10 || (req.ticketCount ?? 0) > 10 || (req.splitInto ?? 0) > 10) throw new BadRequestException('You can generate up to 10 tickets at a time.');
    if (!req.userId && req.profileId && await this.prisma.appUser.findUnique({ where: { id: req.profileId } })) throw new BadRequestException('Sign in to use account preferences');
    if (req.riskMode === 'INVESTOR' && req.operation !== 'split' && !req.pinnedSelections?.length) {
      req = { ...req, operation: 'generate', splitInto: undefined, ticketCount: undefined, gamesPerTicket: undefined, minimumOdds: undefined, maximumOdds: undefined, selectedMarketIds: [] };
    }
    const investorSystem = req.riskMode === 'INVESTOR' && req.operation === 'generate' && !req.pinnedSelections?.length;
    const parsed = readChatRequest(req.instruction);
    const splitInto = req.operation === 'generate' ? undefined : req.splitInto ?? parsed.splitInto;
    if (req.operation !== 'generate' && (req.operation === 'split' || parsed.isSplit) && splitInto === undefined) throw new BadRequestException('How many parts should this code be split into? Add “into 5 parts”, or use the split count option.');
    if (splitInto !== undefined && (!Number.isInteger(splitInto) || splitInto < 1 || splitInto > 10)) throw new BadRequestException('Choose between 1 and 10 split parts.');
    if (!(parsed.bookingCode ?? req.bookingCode) && !req.pinnedSelections?.length && (splitInto !== undefined || /\boriginal\s+(?:matches|picks|selections)\b/i.test(req.instruction))) {
      throw new BadRequestException({ code: 'SOURCE_REQUIRED', message: 'Paste a source booking code to reuse its original matches.' });
    }
    req = { ...req, bookingCode: parsed.bookingCode ?? req.bookingCode, splitInto };
    const hash = (text: string) => createHash('sha256').update(text).digest('hex');
    const requestKey = req.requestId ? hash(`${req.userId ?? req.requestScope}:${req.requestId}`) : null;
    const { requestId: _id, requestScope: _scope, ...payload } = req;
    const payloadHash = hash(JSON.stringify(payload));
    const { group, job } = await this.prisma.$transaction(async tx => {
      if (requestKey) {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${requestKey}))::text`;
        const existing = await tx.generationJob.findUnique({ where: { requestKey }, include: { group: true } });
        if (existing) {
          if (existing.payloadHash !== payloadHash) throw new ConflictException('This request ID was already used with different settings. Start a new generation.');
          if (!existing.group) throw new ConflictException('This generation has expired. Start a new generation.');
          return { group: existing.group, job: existing };
        }
      }
      const group = await tx.slipGroup.create({ data: {
        publicId: generatePublicId(10),
        ownerId: req.userId ?? null,
        // Draft until the user explicitly saves; never auto-publish to history/public feeds.
        isPublic: false,
        userSaved: false,
        title: collectionTitle(req.instruction, req.riskMode?.replaceAll('_', ' ')),
        description: req.instruction, instruction: req.instruction,
        originalBookingCode: req.bookingCode?.toUpperCase() ?? null,
        expiresAt: codeExpiry(new Date()),
      } });
      const count = investorSystem ? 10 : req.splitInto ?? req.ticketCount ?? requestedCount ?? 10;
      const job = await tx.generationJob.create({ data: { groupId: group.id, requestKey, requestId: req.requestId, payloadHash, requestedCount: Math.min(10, Math.max(1, count)) } });
      await tx.trainingEvent.create({ data: { eventKey: `${job.id}:request`, groupId: group.id, jobId: job.id, profileId: req.profileId,
        kind: 'REQUEST_ACCEPTED', payload: { ...req, engineVersion: 'myodd-v5', acceptedAt: new Date().toISOString() } as Prisma.InputJsonValue } });
      return { group, job };
    });
    if (job.status !== JobStatus.PENDING) return { jobId: job.id, groupId: group.id, publicId: group.publicId };
    try {
      // Entire preparation pipeline is durable, rather than an untracked promise in HTTP.
      await this.queue.add('prepare-generation', { ...req, jobId: job.id, groupId: group.id }, {
        jobId: `prepare-${job.id}`, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true, removeOnFail: 100,
      });
    } catch (error) {
      await this.prisma.generationJob.update({ where: { id: job.id }, data: { status: JobStatus.FAILED, error: 'Could not queue generation. Please try again.' } });
      throw error;
    }
    return { jobId: job.id, groupId: group.id, publicId: group.publicId };
  }

  async prepareGeneration(input: PrepareJob) {
    const current = await this.prisma.generationJob.findUniqueOrThrow({ where: { id: input.jobId } });
    if (current.status === JobStatus.COMPLETED || current.status === JobStatus.FAILED) return;
    await this.prisma.generationJob.update({ where: { id: input.jobId }, data: { status: JobStatus.RUNNING } });
    await this.stage(input, 'READING', 'Loading your source code and available games');
    if (input.pinnedSelections?.length && !input.bookingCode) {
      await this.stage(input, 'READING', `Booking ${input.pinnedSelections.length} prediction picks on SportyBet`);
      const created = await this.bookmaker.createBooking(input.pinnedSelections.map((s) => ({
        eventId: s.eventId,
        marketId: s.marketId,
        outcomeId: s.outcomeId,
        specifier: s.specifier ?? '',
        odds: s.odds,
        marketName: s.marketName,
        selectionName: s.selectionName,
        homeTeam: s.homeTeam,
        awayTeam: s.awayTeam,
        league: s.league,
        kickoffAt: s.kickoffAt,
      })));
      input = { ...input, bookingCode: created.code };
      await this.prisma.slipGroup.update({
        where: { id: input.groupId },
        data: {
          originalBookingCode: created.code,
          title: collectionTitle(input.instruction),
        },
      });
    }
    // A fresh prompt has no implicit source: catalog templates may already be settled.
    const original = input.bookingCode ? await this.bookmaker.getBooking(input.bookingCode, { fresh: true }) : null;
    if (input.bookingCode && original && !input.userId) await this.catalog.remember(input.bookingCode, 'private', undefined, original);
    const promptDay = promptMatchDay(input.instruction);
    const matchDay = matchDayKickoffWindow(input.matchDate ?? promptDay?.start, new Date(), input.matchDateEnd ?? promptDay?.end);
    let fixtures = original?.selections.length
      ? await this.bookmaker.getFixtures({ eventIds: original.selections.map(selection => selection.eventId) })
      : await this.upcomingFixtures(matchDay);
    if (original && input.selectedMarketIds?.length) {
      const upcoming = await this.upcomingFixtures(matchDay);
      fixtures = [...new Map([...fixtures, ...upcoming].map(fixture => [fixture.eventId, fixture])).values()];
    }
    const memory = input.profileId ? await this.prisma.learningProfile.findUnique({ where: { id: input.profileId } }) : null;
    await this.audit(input, 'SOURCE_SNAPSHOT', { original, fixtures, matchDay, preferences: memory?.preferences ?? null, preferenceRevision: memory?.revision ?? null });
    const modelInfo = await this.ai.modelInfo();
    await this.audit(input, 'MODEL_CONFIGURATION', modelInfo);
    await this.stage(input, 'PLANNING', `Understanding your requested markets across ${fixtures.length} loaded games`);
    const investorSystem = this.investorSystem(input);
    const oddsSettings = !investorSystem && (input.minimumOdds != null || input.maximumOdds !== undefined)
      ? (input.maximumOdds == null ? `Ticket odds at least ${input.minimumOdds ?? 1.1}. No maximum ticket odds.` : `Ticket odds between ${input.minimumOdds ?? 1.1} and ${input.maximumOdds}.`)
      : '';
    const countSettings = [
      investorSystem ? 'Investor Mode system ticket. Choose the ticket count and games per ticket from the fixed Investor market list. Ticket odds between 2 and 5. Each selection between 1.10 and 1.50. Ignore requested markets, odds, and counts.' : '',
      !investorSystem && input.ticketCount && !input.splitInto ? `Generate ${input.ticketCount} tickets.` : '',
      !investorSystem && input.gamesPerTicket ? `Exactly ${input.gamesPerTicket} games per ticket.` : '',
      oddsSettings,
      !input.splitInto ? `Match day: ${matchDay.matchDate} (${matchDay.label}). Only games kicking off between ${matchDay.kickoffAfter} and ${matchDay.kickoffBefore}.` : '',
    ].filter(Boolean).join(' ');
    const requestInstruction = `${input.instruction}${countSettings ? `\nFinal request settings (take precedence): ${countSettings}` : ''}`;
    const intentInstruction = input.splitInto
      ? `${requestInstruction}\nFinal request settings (take precedence): Split this code into ${input.splitInto} parts. Keep the original selections.`
      : requestInstruction;
    let config = await this.ai.parse(intentInstruction + (input.riskMode ? `\nFinal request settings (take precedence): Risk mode: ${input.riskMode.replace('_', ' ')} Mode.` : ''), fixtures, memory?.preferences);
    config = this.explicitControls(config, input, fixtures);
    if (!original) config = { ...config, fixtureMode: 'upcoming', preserveOriginalSelections: false };
    if (input.splitInto) {
      if (!original) throw new BadRequestException('No verified source code is available to split. Paste a SportyBet code.');
      const explicitOdds = /\b(?:between|around|odds(?:\s+(?:of|above|below|over|under|from|at))?)\s+\d|\d(?:\.\d+)?\s*(?:to|-|and)\s*\d(?:\.\d+)?\s*odds|\d(?:\.\d+)?\s*odds/i.test(input.instruction);
      config = { ...config, numberOfSlips: input.splitInto, fixtureMode: 'original_only', preserveOriginalSelections: false,
        minimumSelections: /\bmin(?:imum)?\s+\d+\s*(?:selections?|legs?|picks?)/i.test(input.instruction) ? config.minimumSelections : 1,
        maximumSelections: /\bmax(?:imum)?\s+\d+\s*(?:selections?|legs?|picks?)/i.test(input.instruction) ? config.maximumSelections : 50,
        minimumOdds: explicitOdds || config.riskMode ? config.minimumOdds : 1.1, maximumOdds: explicitOdds || config.riskMode ? config.maximumOdds : null,
      };
    }
    if (!investorSystem && input.ticketCount && !input.splitInto) config.numberOfSlips = input.ticketCount;
    if (!input.splitInto && !investorSystem) config.numberOfSlips = Math.min(10, Math.max(1, config.numberOfSlips));
    if (!investorSystem && input.gamesPerTicket) config.minimumSelections = config.maximumSelections = input.gamesPerTicket;
    // Prediction book: keep the exact pinned outcomes; do not let mode odds bands reject them.
    if (input.pinnedSelections?.length && !input.splitInto) {
      const legs = input.gamesPerTicket ?? input.pinnedSelections.length;
      config = {
        ...config,
        fixtureMode: 'original_only',
        preserveOriginalSelections: true,
        minimumSelections: legs,
        maximumSelections: legs,
        minimumOdds: 1.1,
        maximumOdds: null,
        allowOddsAdjustment: false,
      };
    }
    // UI ticket-odds range is authoritative and always clamped into the selected mode band.
    if (!investorSystem && !input.splitInto && !input.pinnedSelections?.length && (input.minimumOdds != null || input.maximumOdds !== undefined)) {
      const clamped = clampOddsToMode(
        input.minimumOdds ?? config.minimumOdds,
        input.maximumOdds === undefined ? config.maximumOdds : input.maximumOdds,
        config.riskMode,
      );
      config = { ...config, minimumOdds: clamped.minimum, maximumOdds: clamped.maximum, allowOddsAdjustment: false };
    }
    // Date picker is authoritative for generate flows (default: today / next 24 hours).
    if (!input.splitInto && config.fixtureMode !== 'original_only') {
      config = { ...config, kickoffAfter: matchDay.kickoffAfter, kickoffBefore: matchDay.kickoffBefore };
      fixtures = fixtures.filter(fixture => {
        const kickoff = new Date(fixture.kickoffAt).getTime();
        return kickoff >= new Date(matchDay.kickoffAfter).getTime() && kickoff < new Date(matchDay.kickoffBefore).getTime();
      });
    }
    await this.audit(input, 'RESOLVED_INTENT', { config, matchDay, instruction: intentInstruction });
    await this.stage(input, 'BUILDING', `Searching ${fixtures.length} games for combinations that match your request`);
    if (!input.splitInto && config.fixtureMode === 'upcoming' && original) {
      fixtures = (await this.upcomingFixtures(matchDay)).filter(fixture => {
        const kickoff = new Date(fixture.kickoffAt).getTime();
        return kickoff >= new Date(matchDay.kickoffAfter).getTime() && kickoff < new Date(matchDay.kickoffBefore).getTime();
      });
      config = await this.ai.resolve(input.instruction, fixtures, config);
      config = { ...config, kickoffAfter: matchDay.kickoffAfter, kickoffBefore: matchDay.kickoffBefore };
    }
    config = this.explicitControls(config, input, fixtures);
    await this.audit(input, 'FIXTURE_SNAPSHOT', { fixtures, config });
    let result = input.splitInto
      ? await this.ai.split(fixtures, config, original!.selections, input.splitInto)
      : await this.ai.generate(fixtures, config, original?.selections);
    if (!input.splitInto && result.needsExpansion && config.fixtureMode === 'adaptive') {
      await this.stage(input, 'BUILDING', 'Looking for more upcoming games with your requested markets');
      const upcoming = await this.upcomingFixtures(matchDay);
      fixtures = [...new Map([...fixtures, ...upcoming].map(f => [f.eventId, f])).values()]
        .filter(fixture => {
          const kickoff = new Date(fixture.kickoffAt).getTime();
          return kickoff >= new Date(matchDay.kickoffAfter).getTime() && kickoff < new Date(matchDay.kickoffBefore).getTime();
        });
      // Resolve requested markets against the expanded catalog; keep the original hard constraints.
      const expanded = await this.ai.resolve(input.instruction, fixtures, config);
      config = { ...config, marketRules: expanded.marketRules, relatedMarketRules: expanded.relatedMarketRules, marketPolicy: expanded.marketPolicy, marketQueries: expanded.marketQueries, markets: expanded.markets,
        unhandledRequests: expanded.unhandledRequests, kickoffAfter: matchDay.kickoffAfter, kickoffBefore: matchDay.kickoffBefore };
      config = this.explicitControls(config, input, fixtures);
      await this.audit(input, 'EXPANDED_SNAPSHOT', { fixtures, config });
      await this.stage(input, 'BUILDING', `Searching ${fixtures.length} games; keeping your requested markets and periods`);
      result = await this.ai.generate(fixtures, config, original?.selections, true);
    }
    await this.audit(input, 'PREDICTION_AND_CANDIDATES', result);
    await this.stage(input, 'CHECKING', 'Checking each candidate against bookmaker availability');
    const effectiveConfig = !input.splitInto && config.fixtureMode !== 'original_only'
      ? { ...result.effectiveConfig, kickoffAfter: matchDay.kickoffAfter, kickoffBefore: matchDay.kickoffBefore }
      : result.effectiveConfig;
    await this.predictions.cacheScores(result.pool);
    const { pool: _pool, candidates: _candidates, ...report } = result;


    const usedSelections = new Set<string>();
    const unique = new Map<string, RankedCandidate>();
    for (const candidate of result.candidates) {
      const validated = await this.validator.validate(candidate.selections, effectiveConfig, fixtures);
      if (!validated) continue;
      const key = slipFingerprint(validated);
      if (unique.has(key)) continue;
      const keys = validated.map(selection => `${selection.eventId}|${selection.marketId}|${selection.outcomeId}|${selection.specifier ?? ''}`);
      if (!effectiveConfig.preserveOriginalSelections && keys.some(key => usedSelections.has(key))) continue;
      keys.forEach(key => usedSelections.add(key));
      unique.set(key, { selections: validated, rankOrder: unique.size, slipScore: candidate.slipScore ?? 0 });
    }
    const candidates = [...unique.values()].slice(0, config.numberOfSlips).map((candidate, index) => ({ ...candidate, rankOrder: index }));
    if (input.splitInto && candidates.length !== result.candidates.length) {
      candidates.splice(0);
      report.notices.push('A split part changed during validation. No parts were created; retry with current availability.');
    }
    if (candidates.length < result.candidates.length) {
      report.notices.push(`${result.candidates.length - candidates.length} candidates changed or failed final bookmaker validation.`);
    }
    if (candidates.length < config.numberOfSlips) report.notices.push('Fewer tickets are available without repeating exact selections or changing your constraints.');
    if (effectiveConfig.preserveOriginalSelections && candidates.length > 1) report.notices.push('Pinned original selections are intentionally shared across tickets.');
    report.diagnostics.foundSlips = candidates.length;
    await this.prisma.generationJob.update({ where: { id: input.jobId }, data: { requestedCount: config.numberOfSlips } });
    await this.prisma.slipGroup.update({ where: { id: input.groupId }, data: {
      generationReport: report as unknown as Prisma.InputJsonValue,
    } });
    if (!candidates.length) {
      await this.failPreparation(input.jobId, result.notices.join(' ') || 'No combinations satisfy the explicit constraints. Try different markets, a wider odds range, or allow new matches.', 'SHORTAGE');
      return;
    }
    // Replays after partial queue writes must not regenerate a different candidate set.
    // Retain the preparation payload's derived candidates before enqueueing any booking.
    await this.audit(input, 'BOOKING_PLAN', { config: effectiveConfig, candidates });
    return { config: effectiveConfig, candidates };
  }

  async audit(input: { jobId: string; groupId?: string; profileId?: string }, kind: string, payload: unknown, eventKey?: string) {
    const data = { jobId: input.jobId, groupId: input.groupId, profileId: input.profileId, kind,
      payload: JSON.parse(JSON.stringify(payload)), eventKey };
    if (eventKey) return this.prisma.trainingEvent.upsert({ where: { eventKey }, create: data, update: {} });
    return this.prisma.trainingEvent.create({ data });
  }

  async stage(input: { jobId: string; groupId?: string }, stage: string, stageDetail: string) {
    await this.prisma.$transaction([
      this.prisma.generationJob.update({ where: { id: input.jobId }, data: { stage, stageDetail } }),
      this.prisma.trainingEvent.create({ data: { jobId: input.jobId, groupId: input.groupId, kind: 'STAGE_CHANGED', payload: { stage, stageDetail } } }),
    ]);
  }

  private async upcomingFixtures(matchDay = matchDayKickoffWindow()) {
    const hoursUntilEnd = Math.max(1, Math.ceil((new Date(matchDay.kickoffBefore).getTime() - Date.now()) / 3600000));
    const timelineHours = Math.min(168, Math.max(24, hoursUntilEnd + 6));
    const pages = await Promise.all([1, 2].map(pageNum => this.bookmaker.getFixtures({
      timelineHours, pageSize: 60, pageNum, todayGames: false,
    })));
    const fixtures = [...new Map(pages.flat().map(fixture => [fixture.eventId, fixture])).values()]
      .filter(fixture => new Date(fixture.kickoffAt).getTime() > Date.now());
    // Detailed markets unlock handicaps, interval outcomes and alternate lines beyond the listing API.
    const details = fixtures.length ? await this.bookmaker.getFixtures({ eventIds: fixtures.slice(0, 24).map(f => f.eventId) }) : [];
    return [...new Map([...fixtures, ...details].map(fixture => [fixture.eventId, fixture])).values()];
  }

  async enqueueBookings(input: PrepareJob, config: GenerationConfig, candidates: RankedCandidate[]) {
    await this.prisma.generationJob.update({ where: { id: input.jobId }, data: { total: candidates.length, requestedCount: config.numberOfSlips } });
    await this.stage(input, 'BOOKING', `Creating and saving ${candidates.length} tickets`);
    await this.queue.addBulk(candidates.map((candidate, index) => ({
      name: 'create-booking',
      data: {
        jobId: input.jobId,
        groupId: input.groupId,
        selections: candidate.selections,
        config,
        rankOrder: candidate.rankOrder ?? index,
        slipScore: candidate.slipScore ?? 0,
      },
      opts: { jobId: `booking-${input.jobId}-${index}`, attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: false, removeOnFail: 100 },
    })));
  }

  async failPreparation(jobId: string, error: string, code: import('@myodd/shared').GenerationFailure['code'] = 'UNEXPECTED_ERROR') {
    await this.prisma.$transaction([
      this.prisma.generationJob.update({ where: { id: jobId }, data: { status: JobStatus.FAILED, stage: 'FAILED', error, failures: [{ code, message: error, retryable: code !== 'SHORTAGE' }] } }),
      this.prisma.trainingEvent.create({ data: { jobId, kind: 'PREPARATION_FAILED', payload: { error } } }),
    ]);
  }

  /** Settle each queue task once, atomically with its persisted slip and progress. */
  async settleBooking(taskId: string, input: BookingJob, booking?: BookmakerBooking, selections?: ScoredSelection[]) {
    await this.prisma.$transaction(async tx => {
      const claimed = await tx.generationJob.updateMany({
        where: { id: input.jobId, NOT: { completedTasks: { has: taskId } } },
        data: { completedTasks: { push: taskId }, progress: { increment: 1 }, failedCount: { increment: booking ? 0 : 1 } },
      });
      if (!claimed.count) return;
      await tx.trainingEvent.create({ data: { eventKey: `${input.jobId}:${taskId}:settled`, jobId: input.jobId, groupId: input.groupId,
        kind: booking ? 'BOOKING_SAVED' : 'BOOKING_FAILED', payload: JSON.parse(JSON.stringify({ taskId, config: input.config, requestedSelections: input.selections,
          confirmedBooking: booking ?? null, acceptedSelections: selections ?? null, recordedAt: new Date().toISOString() })) } });
      if (booking && selections) {
        const now = new Date();
        const code = booking.code.toUpperCase();
        const existing = await tx.bookingCode.findUnique({ where: { code } });
        const firstSeenAt = existing?.firstSeenAt ?? now;
        const assessment = assessBooking({ ...booking, selections }, firstSeenAt, now);
        const totalOdds = selections.reduce((acc, s) => acc * s.odds!, 1);
        const confidence = selections.reduce((sum, s) => sum + s.confidence, 0) / selections.length;
        await tx.generatedSlip.create({ data: {
          groupId: input.groupId, bookingCode: booking.code, shareUrl: booking.shareUrl,
          totalOdds: Math.round(totalOdds * 100) / 100, confidence,
          riskLevel: classifyVariance(totalOdds, confidence) as VarianceLevel,
          selectionCount: selections.length, fingerprint: slipFingerprint(selections),
          rankOrder: input.rankOrder ?? 0,
          slipScore: input.slipScore ?? 0,
          createdAt: now, expiresAt: assessment.expiresAt,
          selections: { create: selections.map(s => ({
            sportyEventId: s.eventId, marketId: s.marketId, outcomeId: s.outcomeId, specifier: s.specifier ?? '',
            homeTeam: s.homeTeam ?? '', awayTeam: s.awayTeam ?? '', league: s.league ?? '',
            marketName: s.marketName ?? '', selectionName: s.selectionName ?? '', odds: s.odds!,
            predictionProbability: s.probability, predictionScore: s.confidence, modelVersion: s.modelVersion,
            kickoffAt: s.kickoffAt ? new Date(s.kickoffAt) : null,
          })) },
        } });
        await tx.bookingCode.upsert({ where: { code }, create: {
          code, source: 'generated', firstSeenAt, ...assessment, checkedAt: now,
          snapshot: { ...booking, selections } as unknown as Prisma.InputJsonValue,
        }, update: { ...assessment, checkedAt: now, lastSeenAt: now, lastError: null,
          snapshot: { ...booking, selections } as unknown as Prisma.InputJsonValue } });
      }
      const job = await tx.generationJob.findUniqueOrThrow({ where: { id: input.jobId } });
      if (input.failure) await tx.generationJob.update({ where: { id: job.id }, data: { failures: [...(Array.isArray(job.failures) ? job.failures : []), { ...input.failure, taskId }] as Prisma.InputJsonValue } });
      if (job.total > 0 && job.progress >= job.total) {
        await tx.trainingEvent.create({ data: { jobId: job.id, groupId: input.groupId, kind: 'JOB_FINISHED', payload: { progress: job.progress, total: job.total, failedCount: job.failedCount } } });
        await tx.generationJob.update({ where: { id: job.id }, data: {
          status: job.failedCount === job.total ? JobStatus.FAILED : JobStatus.COMPLETED,
          stage: job.failedCount === job.total ? 'FAILED' : 'SAVED', stageDetail: `${job.total - job.failedCount} of ${job.total} tickets saved`,
          error: job.failedCount ? `${job.failedCount} of ${job.total} bookings could not be created. Markets may have changed.` : null,
        } });
      }
    });
  }
}
