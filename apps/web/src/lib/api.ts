// Empty = same origin (Next proxies /api → backend). Needed for public tunnels.
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

let sessionToken: () => Promise<string | null> = async () => null;
let signedIn = false;
export function configureApiAuth(getToken: () => Promise<string | null>, authenticated: boolean) { sessionToken = getToken; signedIn = authenticated; }

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await sessionToken();
  if (signedIn && !token) throw new Error('Your session needs to reconnect. Please sign in again before continuing.');
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      typeof (body as { message?: unknown }).message === 'string'
        ? ((body as { message: string }).message)
        : Array.isArray((body as { message?: unknown }).message)
          ? ((body as { message: string[] }).message).join(', ')
          : `Request failed (${res.status})`,
    );
  }
  return res.json() as Promise<T>;
}

export interface CreatorSummary { publicId: string; username: string | null; name: string }
export type CollectionPlayResult = 'ALL_PLAYED' | 'CUT' | 'MIXED' | 'LIVE' | 'OPEN' | 'UNKNOWN';
export type RiskMode = 'INVESTOR' | 'GAMBLER' | 'JAPA' | 'LAGOS_LIFE';
export type SlipPlayStatus = 'OPEN' | 'LIVE' | 'CUT' | 'ALL_PLAYED' | 'UNKNOWN';
export type LegPlayStatus = 'UPCOMING' | 'LIVE' | 'PLAYED' | 'CUT' | 'UNKNOWN';
export interface PlaySummary {
  tickets: number;
  open: number;
  live: number;
  cut: number;
  allPlayed: number;
  unknown: number;
  legsOpen: number;
  legsLive: number;
  legsPlayed: number;
  legsCut: number;
}
export interface CutLegDetail {
  homeTeam: string;
  awayTeam: string;
  marketName?: string;
  selectionName?: string;
  playNote?: string | null;
}

export interface CollectionSummary {
  publicId: string;
  title: string;
  createdAt: string;
  originalBookingCode?: string | null;
  slipCount: number;
  saved?: boolean;
  isPublic?: boolean;
  isOwner?: boolean;
  creator?: CreatorSummary | null;
  riskMode?: RiskMode | null;
  playResult?: CollectionPlayResult;
  playCheckedAt?: string | null;
  cut?: number;
  allPlayed?: number;
  open?: number;
  live?: number;
}

export interface GenerateResponse {
  jobId: string;
  groupId: string;
  publicId: string;
}

export interface JobProgress {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  createdAt?: string;
  updatedAt?: string;
  stage?: string;
  stageDetail?: string | null;
  progress: number;
  total: number;
  groupId: string | null;
  publicId: string | null;
  error: string | null;
  failedCount: number;
}

export interface SlipSelection {
  homeTeam: string;
  awayTeam: string;
  league: string;
  marketName: string;
  selectionName: string;
  odds: number;
  predictionProbability: number;
  predictionScore: number;
  modelVersion: string;
  kickoffAt: string | null;
  playStatus?: 'UPCOMING' | 'LIVE' | 'PLAYED' | 'CUT' | 'UNKNOWN';
  score?: string | null;
  playNote?: string | null;
}

export interface GeneratedSlip {
  id: string;
  bookingCode: string;
  shareUrl: string;
  totalOdds: number;
  confidence: number;
  riskLevel: 'LOWER' | 'MODERATE' | 'HIGHER';
  riskMode?: RiskMode | null;
  selectionCount: number;
  rankOrder?: number;
  slipScore?: number;
  playStatus?: 'OPEN' | 'LIVE' | 'CUT' | 'ALL_PLAYED' | 'UNKNOWN';
  playCheckedAt?: string | null;
  openLegs?: number;
  liveLegs?: number;
  playedLegs?: number;
  cutLegs?: number;
  cutSummary?: string | null;
  expiresAt: string | null;
  createdAt?: string;
  displayStatus?: 'ACTIVE' | 'CHECKING' | 'PARTIAL' | 'UNAVAILABLE' | 'EXPIRED' | 'UNKNOWN';
  selections: SlipSelection[];
  groupPublicId?: string;
  userSaved?: boolean;
  isPublic?: boolean;
}

export interface GenerationReport {
  operation?: 'split';
  splitDetails?: { requestedParts: number; originalSelections: number; eligibleSelections: number; skippedSelections: number; strategy: string };
  notices: string[];
  diagnostics: { requestedSlips: number; foundSlips: number; eligibleEvents: number; selectionPool: number;
    oddsBounds: { minimum: number; maximum: number } | null };
  effectiveConfig: { riskMode?: string | null; riskPreference?: string; numberOfSlips?: number; minimumOdds: number; maximumOdds: number | null; minimumSelections: number;
    maximumSelections: number; fixtureMode: string; marketPolicy: string; allowOddsAdjustment: boolean };
}

export interface SlipGroup {
  creator?: CreatorSummary | null;
  id: string;
  publicId: string;
  saved?: boolean;
  userSaved?: boolean;
  isOwner?: boolean;
  isPublic?: boolean;
  title: string;
  description: string | null;
  riskMode?: RiskMode | null;
  createdAt: string;
  expiresAt: string | null;
  originalBookingCode: string | null;
  availability?: { saved: number; active?: number; checking: number; unavailable: number };
  playSummary?: PlaySummary;
  generationReport: GenerationReport | null;
  job: Pick<JobProgress, 'createdAt' | 'updatedAt' | 'status' | 'stage' | 'stageDetail' | 'error' | 'progress' | 'total' | 'failedCount'> | null;
  slips: GeneratedSlip[];
  counts: { lower: number; moderate: number; higher: number };
}

export function browserProfileId(): string | undefined {
  if (typeof window === 'undefined' || !crypto.randomUUID) return undefined;
  try { const key = 'myodd-profile-v1'; let id = localStorage.getItem(key); if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { id = crypto.randomUUID(); localStorage.setItem(key, id); } return id; } catch { return undefined; }
}
export interface SavedDefaults { riskMode: string | null; ticketCount: number | null; gamesPerTicket: number | null }
export const api = {
  preferences() { if (signedIn) return request<{ preferences: SavedDefaults | null; revision: number }>('/account/preferences'); const id = browserProfileId(); return id ? request<{ preferences: SavedDefaults | null; revision: number }>(`/learning/profiles/${id}`) : Promise.resolve({ preferences: null, revision: 0 }); },
  feedback(body: { groupId: string; rating: 'helpful' | 'needs_work'; note?: string; correctedPrompt?: string; rememberSettings?: boolean }) {
    const profileId = signedIn ? crypto.randomUUID() : browserProfileId(); if (!profileId) return Promise.reject(new Error('Enable browser storage to remember your settings.'));
    return request<{ saved: boolean; remembered: boolean }>('/learning/feedback', { method: 'POST', body: JSON.stringify({ ...body, id: crypto.randomUUID(), profileId }) });
  },
  publicGroups(page = 1) { return request<CollectionSummary[]>(`/groups/public?page=${page}`); },
  editGroup(id: string, body: { title?: string; isPublic?: boolean }) { return request<{ publicId: string; title: string; isPublic: boolean }>(`/groups/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }); },
  listGroups(page = 1) {
    return request<CollectionSummary[]>(`/groups?page=${page}`);
  },
  generate(body: {
    bookingCode?: string;
    instruction: string;
    splitInto?: number;
    ticketCount?: number;
    gamesPerTicket?: number;
    matchDate?: string;
    minimumOdds?: number;
    maximumOdds?: number | null;
    profileId?: string;
    operation?: 'generate' | 'split';
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
  }) {
    const path = body.bookingCode
      ? '/slips/generate'
      : '/slips/generate-from-prompt';
    return request<GenerateResponse>(path, {
      method: 'POST',
      body: JSON.stringify({ ...body, profileId: browserProfileId() }),
    });
  },
  publishGroup(id: string) { return request<{ isPublic: boolean }>(`/groups/${encodeURIComponent(id)}/share`, { method: 'POST' }); },
  verifyCode(code: string) { return request<{ codes: string[]; unavailable: number }>(`/codes/${encodeURIComponent(code)}/verify`, { method: 'POST' }); },
  verifyGroup(id: string) { return request<{ codes: string[]; unavailable: number }>(`/groups/${encodeURIComponent(id)}/verify`, { method: 'POST' }); },
  checkPlayGroup(id: string) {
    return request<{ publicId: string; isPublic?: boolean; slips: Array<{ slipId: string; bookingCode: string; playStatus: SlipPlayStatus; openLegs: number; liveLegs: number; playedLegs: number; cutLegs: number; cutSummary: string | null; cuts: CutLegDetail[]; totalLegs: number; playCheckedAt: string }>; summary: PlaySummary }>(`/groups/${encodeURIComponent(id)}/check-play`, { method: 'POST' });
  },
  checkPlayCode(code: string) {
    return request<{ slipId: string; bookingCode: string; playStatus: SlipPlayStatus; openLegs: number; liveLegs: number; playedLegs: number; cutLegs: number; cutSummary: string | null; cuts: CutLegDetail[]; totalLegs: number; playCheckedAt: string; isPublic?: boolean; summary: PlaySummary }>(`/codes/${encodeURIComponent(code)}/check-play`, { method: 'POST' });
  },
  getJob(jobId: string) {
    return request<JobProgress>(`/jobs/${jobId}`);
  },
  getGroup(publicId: string) {
    return request<SlipGroup>(`/groups/${publicId}`);
  },
  getCode(code: string) {
    return request<GeneratedSlip>(`/codes/${code}`);
  },
  analyze(bookingCode: string) {
    return request<{
      code: string;
      shareUrl: string;
      deadline: string | null;
      totalOdds: number | null;
      selectionCount: number;
      selections: Array<{
        homeTeam?: string;
        awayTeam?: string;
        league?: string;
        marketName?: string;
        selectionName?: string;
        odds?: number;
        kickoffAt?: string;
        isActive?: boolean;
      }>;
    }>('/slips/analyze', {
      method: 'POST',
      body: JSON.stringify({ bookingCode }),
    });
  },
};

export interface ExplorerGame {
  predictionCount?: number;
  eventId: string; homeTeam: string; awayTeam: string; league: string; categoryName: string; kickoffAt: string;
  matchStatus: string; score?: string | null; clock?: string | null; liveStatus?: string;
  predictions?: Array<{ marketId: string; outcomeId: string; specifier?: string; marketName: string; selectionName: string; odds: number;
    probability: number; modelVersion: string; supportedMarket: string }>;
}
export interface ExplorerSnapshot { games: ExplorerGame[]; observedAt: string; source: string; modelVersion?: string }
export const exploreApi = {
  live: () => request<ExplorerSnapshot>('/explore/live'),
  predictions: (options: { market?: string; eventId?: string; limit?: number } = {}) => {
    const query = new URLSearchParams();
    if (options.market) query.set('market', options.market);
    if (options.eventId) query.set('eventId', options.eventId);
    if (options.limit) query.set('limit', String(options.limit));
    return request<ExplorerSnapshot>(`/explore/predictions?${query}`, { signal: AbortSignal.timeout(60000) });
  },
};


export const accountApi = {
  remove: (publicIds: string[]) => request<{ removed: string[] }>('/account/collections/remove', { method: 'POST', body: JSON.stringify({ publicIds }) }),
  sync: () => request<{ id: string; synced: boolean }>('/account/sync', { method: 'POST' }),
  save: (id: string) => request<{ saved: boolean }>(`/account/saves/${encodeURIComponent(id)}`, { method: 'POST' }),
  legacy: (page = 1) => request<CollectionSummary[]>(`/account/legacy?page=${page}`),
};
