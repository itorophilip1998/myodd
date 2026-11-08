import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { BookingCodeStatus, Prisma } from '@prisma/client';
import { Queue } from 'bullmq';
import type { BookmakerBooking } from '@myodd/shared';
import { PrismaService } from '../prisma/prisma.service';
import { BOOKMAKER_PROVIDER, type BookmakerProvider } from '../bookmaker/bookmaker.provider';
import { AiClient } from '../ai/ai.client';
import { assessBooking, codeExpiry } from './catalog.policy';

export const CATALOG_QUEUE = 'code-catalog';
const DEFAULT_SOURCE = 'https://www.sportybet.com/ng/m/code-hub/codes';

@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);
  constructor(private readonly prisma: PrismaService, private readonly ai: AiClient,
    @Inject(BOOKMAKER_PROVIDER) private readonly bookmaker: BookmakerProvider,
    @InjectQueue(CATALOG_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    const urls = (process.env.CODE_SOURCE_URLS ?? DEFAULT_SOURCE).split(',').map(s => s.trim()).filter(Boolean).slice(0, 8);
    await this.prisma.codeSource.updateMany({ where: { url: { notIn: urls } }, data: { enabled: false } });
    for (const url of urls) await this.prisma.codeSource.upsert({ where: { url }, create: { url }, update: { enabled: true } });
    const minutes = Math.max(15, Number(process.env.CODE_VALIDATION_INTERVAL_MINUTES ?? 60));
    await this.queue.upsertJobScheduler('catalog-maintenance', { every: minutes * 60000 }, {
      name: 'maintain', data: {}, opts: { removeOnComplete: 20, removeOnFail: 50, attempts: 2, backoff: { type: 'exponential', delay: 60000 } },
    });
    await this.refresh();
  }

  async refresh() {
    await this.queue.add('maintain', {}, { jobId: `refresh-${Math.floor(Date.now() / 60000)}`,
      removeOnComplete: 20, removeOnFail: 50, attempts: 2, backoff: { type: 'exponential', delay: 60000 } });
    return { queued: true };
  }

  async remember(code: string, source = 'user', sourceUrl?: string, booking?: BookmakerBooking) {
    const normalized = code.trim().toUpperCase();
    if (!/^[A-Z0-9_]{3,32}$/.test(normalized)) throw new Error('Invalid booking code format');
    const row = await this.prisma.bookingCode.upsert({ where: { code: normalized },
      create: { code: normalized, source, sourceUrl, expiresAt: codeExpiry(new Date()) },
      update: { lastSeenAt: new Date(), ...(['manual', 'crawl'].includes(source) ? { source } : {}) },
    });
    return booking ? this.validate(normalized, booking) : row;
  }

  async validate(code: string, supplied?: BookmakerBooking) {
    const row = await this.prisma.bookingCode.findUniqueOrThrow({ where: { code } });
    if (row.expiresAt <= new Date()) {
      return this.prisma.bookingCode.update({ where: { code }, data: { status: BookingCodeStatus.EXPIRED } });
    }
    try {
      // Fetch without the booking cache before declaring a code usable as a master.
      const booking = supplied ?? await this.bookmaker.getBooking(code, { fresh: true });
      const assessment = assessBooking(booking, row.firstSeenAt);
      await this.prisma.trainingEvent.create({ data: { kind: 'CATALOG_VALIDATED', payload: JSON.parse(JSON.stringify({ code, source: row.source, observedAt: new Date().toISOString(), booking, assessment })) } });
      return await this.prisma.bookingCode.update({ where: { code }, data: {
        ...assessment, checkedAt: new Date(), upstreamExpiresAt: booking.deadline ? new Date(booking.deadline) : null,
        snapshot: booking as unknown as Prisma.InputJsonValue, lastError: null,
      } });
    } catch (error) {
      const transient = !['NOT_FOUND', 'INVALID_BOOKING_CODE'].includes((error as { code?: string }).code ?? '')
        && (error as { getStatus?: () => number }).getStatus?.() !== 404;
      await this.prisma.trainingEvent.create({ data: { kind: 'CATALOG_CHECK_FAILED', payload: {
        code, observedAt: new Date().toISOString(), transient,
        errorCode: String((error as { code?: string }).code ?? 'UNCONFIRMED'),
      } } });
      return this.prisma.bookingCode.update({ where: { code }, data: {
        status: transient ? BookingCodeStatus.PENDING : BookingCodeStatus.INACTIVE,
        checkedAt: new Date(), lastError: 'Could not confirm this code with SportyBet',
      } });
    }
  }

  async importCode(code: string) {
    await this.remember(code, 'manual');
    const row = await this.validate(code.trim().toUpperCase());
    return { code: row.code, status: row.status, activeSelections: row.activeSelections, expiresAt: row.expiresAt };
  }

  async master() {
    await this.expire();
    // Prefer independently sourced/user codes and broad fixture coverage over generated two-leg slips.
    const candidates = await this.prisma.bookingCode.findMany({ where: {
      status: { in: [BookingCodeStatus.ACTIVE, BookingCodeStatus.PARTIAL] }, source: { in: ['crawl', 'manual', 'generated'] }, activeSelections: { gte: 2 }, expiresAt: { gt: new Date() },
    }, orderBy: [{ source: 'asc' }, { activeSelections: 'desc' }, { checkedAt: 'desc' }], take: 12 });
    const generatedCodes = candidates.filter(c => c.source === 'generated').map(c => c.code);
    const [privateUses, publicUses] = generatedCodes.length ? await Promise.all([
      this.prisma.generatedSlip.findMany({ where: { bookingCode: { in: generatedCodes }, group: { isPublic: false } }, select: { bookingCode: true } }),
      this.prisma.generatedSlip.findMany({ where: { bookingCode: { in: generatedCodes }, group: { isPublic: true, userSaved: true, deletedAt: null } }, select: { bookingCode: true } }),
    ]) : [[], []];
    const privateOnly = new Set(privateUses.map(s => s.bookingCode).filter(code => !publicUses.some(s => s.bookingCode === code)));
    const allowed = candidates.filter(c => !privateOnly.has(c.code) && (c.source !== 'generated' || publicUses.some(s => s.bookingCode === c.code)));
    allowed.sort((a, b) => Number(a.source === 'generated') - Number(b.source === 'generated'));
    for (const candidate of allowed.slice(0, 5)) {
      const verified = await this.validate(candidate.code);
      if ([BookingCodeStatus.ACTIVE, BookingCodeStatus.PARTIAL].includes(verified.status as 'ACTIVE' | 'PARTIAL') && verified.activeSelections >= 2) {
        await this.prisma.bookingCode.update({ where: { code: candidate.code }, data: { lastUsedAt: new Date() } });
        return { code: verified.code, booking: verified.snapshot as unknown as BookmakerBooking,
          expiresAt: verified.expiresAt, source: verified.source, activeSelections: verified.activeSelections };
      }
    }
    return null;
  }

  async displayStatus(codes: string[]) {
    const unique = [...new Set(codes.map(code => code.toUpperCase()))];
    const rows = await this.prisma.bookingCode.findMany({ where: { code: { in: unique } } });
    const byCode = new Map(rows.map(row => [row.code, row]));
    const valid = new Set<string>();
    const statuses = new Map<string, 'ACTIVE' | 'CHECKING' | 'PARTIAL' | 'UNAVAILABLE' | 'EXPIRED' | 'UNKNOWN'>();
    let checking = 0, unavailable = 0;
    for (const code of unique) {
      const row = byCode.get(code);
      if (!row) {
        statuses.set(code, 'UNKNOWN');
        unavailable++;
        continue;
      }
      if (row.expiresAt <= new Date()) {
        statuses.set(code, 'EXPIRED');
        unavailable++;
        continue;
      }
      const stale = !row.checkedAt || row.checkedAt.getTime() < Date.now() - 60000;
      const snapshot = row.snapshot as unknown as BookmakerBooking | null;
      const activeNow = snapshot ? assessBooking(snapshot, row.firstSeenAt) : null;
      const lastKnownActive = row.status === BookingCodeStatus.ACTIVE;
      if (stale) {
        checking++;
        statuses.set(code, 'CHECKING');
        // Keep last-known-active codes visible while a background refresh runs.
        if (lastKnownActive) valid.add(row.code);
        await this.queue.add('verify-display', { codes: [row.code] }, { jobId: `display-${row.code}-${Math.floor(Date.now() / 60000)}`,
          removeOnComplete: true, removeOnFail: 50, attempts: 2, backoff: { type: 'exponential', delay: 2000 } });
        continue;
      }
      if (row.status === BookingCodeStatus.ACTIVE && activeNow?.status === 'ACTIVE') {
        valid.add(row.code);
        statuses.set(code, 'ACTIVE');
      } else if (row.status === BookingCodeStatus.PARTIAL) {
        statuses.set(code, 'PARTIAL');
      } else if (row.status === BookingCodeStatus.PENDING) {
        statuses.set(code, 'CHECKING');
        checking++;
      } else {
        statuses.set(code, 'UNAVAILABLE');
        unavailable++;
      }
    }
    return { valid, checking, unavailable, statuses };
  }

  async verifyCodes(codes: string[]) {
    const valid: string[] = [];
    for (let i = 0; i < codes.length; i += 3) {
      const results = await Promise.all(codes.slice(i, i + 3).map(async code => {
        const row = await this.validate(code.toUpperCase());
        return row.status === BookingCodeStatus.ACTIVE ? row.code : null;
      }));
      valid.push(...results.filter((code): code is string => !!code));
    }
    return { codes: valid, unavailable: codes.length - valid.length, checkedAt: new Date().toISOString() };
  }

  async summary() {
    await this.expire();
    const [active, archived, latest] = await Promise.all([
      this.prisma.bookingCode.count({ where: { status: BookingCodeStatus.ACTIVE, expiresAt: { gt: new Date() } } }),
      this.prisma.bookingCode.count({ where: { status: { in: [BookingCodeStatus.EXPIRED, BookingCodeStatus.INACTIVE] } } }),
      this.prisma.codeCrawlRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    ]);
    return { active, archived, lastRefresh: latest?.completedAt ?? null };
  }

  private expire() {
    return this.prisma.bookingCode.updateMany({ where: { expiresAt: { lte: new Date() }, status: { not: BookingCodeStatus.EXPIRED } }, data: { status: BookingCodeStatus.EXPIRED } });
  }

  async maintain() {
    await this.expire();
    const run = await this.prisma.codeCrawlRun.create({ data: {} });
    const errors: string[] = [];
    let discovered = 0, verified = 0;
    try {
      const interval = Math.max(1, Number(process.env.CODE_DISCOVERY_INTERVAL_HOURS ?? 6)) * 3600000;
      const sources = await this.prisma.codeSource.findMany({ where: { enabled: true, OR: [
        { checkedAt: null }, { checkedAt: { lt: new Date(Date.now() - interval) } },
      ] }, take: 8 });
      if (sources.length) {
        const result = await this.ai.discoverCodes(sources.map(source => source.url));
        await this.prisma.trainingEvent.create({ data: { kind: 'CODE_DISCOVERY', payload: result as unknown as Prisma.InputJsonValue } });
        for (const source of result.sources) {
          await this.prisma.codeSource.update({ where: { url: source.url }, data: {
            checkedAt: new Date(), lastError: source.error, discovered: source.codes.length,
          } });
          if (source.error) errors.push(`${source.url}: ${source.error}`);
          for (const code of source.codes) {
            await this.remember(code, 'crawl', source.url);
            discovered++;
          }
        }
      }
      const due = await this.prisma.bookingCode.findMany({ where: {
        expiresAt: { gt: new Date() }, status: { not: BookingCodeStatus.EXPIRED },
        OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(Date.now() - 3600000) } }],
      }, orderBy: [{ checkedAt: 'asc' }, { firstSeenAt: 'desc' }], take: 100 });
      for (const code of due) {
        const checked = await this.validate(code.code);
        if (checked.status === BookingCodeStatus.ACTIVE) verified++;
      }
    } catch (error) {
      this.logger.warn('Code catalog maintenance could not complete');
      errors.push('Discovery or validation service unavailable; existing records retained');
      throw error;
    } finally {
      await this.prisma.codeCrawlRun.update({ where: { id: run.id }, data: {
        completedAt: new Date(), discovered, verified, errors: errors.length ? errors : Prisma.JsonNull,
      } });
    }
    return { discovered, verified };
  }
}
