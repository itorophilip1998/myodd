const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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

export interface GenerateResponse {
  jobId: string;
  groupId: string;
  publicId: string;
}

export interface JobProgress {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: number;
  total: number;
  groupId: string | null;
  publicId: string | null;
  error: string | null;
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
  kickoffAt: string | null;
}

export interface GeneratedSlip {
  id: string;
  bookingCode: string;
  shareUrl: string;
  totalOdds: number;
  confidence: number;
  riskLevel: 'LOWER' | 'MODERATE' | 'HIGHER';
  selectionCount: number;
  expiresAt: string | null;
  selections: SlipSelection[];
  groupPublicId?: string;
}

export interface SlipGroup {
  id: string;
  publicId: string;
  title: string;
  description: string | null;
  createdAt: string;
  expiresAt: string | null;
  originalBookingCode: string | null;
  slips: GeneratedSlip[];
  counts: { lower: number; moderate: number; higher: number };
}

export const api = {
  generate(body: { bookingCode?: string; instruction: string }) {
    const path = body.bookingCode
      ? '/slips/generate'
      : '/slips/generate-from-prompt';
    return request<GenerateResponse>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
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
      totalOdds: number;
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
