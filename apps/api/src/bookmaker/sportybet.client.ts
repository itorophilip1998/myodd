import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export class SportyBetHttpError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SportyBetHttpError';
  }
}

@Injectable()
export class SportyBetClient {
  private readonly logger = new Logger(SportyBetClient.name);
  private readonly baseUrl: string;
  private readonly region: string;
  private readonly timeoutMs: number;
  private readonly minIntervalMs: number;
  private readonly maxConcurrency: number;
  private readonly cacheTtlMs: number;
  private lastRequestAt = 0;
  private inFlight = 0;
  private readonly reads = new Map<string, Promise<unknown>>();
  private readonly queue: Array<() => void> = [];

  constructor(private readonly redis: RedisService) {
    this.baseUrl =
      process.env.SPORTYBET_API_BASE_URL ?? 'https://www.sportybet.com';
    this.region = (process.env.SPORTYBET_REGION ?? 'ng').toLowerCase();
    this.timeoutMs = Number(process.env.SPORTYBET_TIMEOUT_MS ?? 15000);
    this.minIntervalMs = Number(process.env.SPORTYBET_MIN_INTERVAL_MS ?? 250);
    this.maxConcurrency = Number(process.env.SPORTYBET_MAX_CONCURRENCY ?? 4);
    this.cacheTtlMs = Number(process.env.SPORTYBET_CACHE_TTL_MS ?? 30000);
  }

  get regionCode() {
    return this.region;
  }

  get cacheTtlSeconds() {
    return Math.max(1, Math.floor(this.cacheTtlMs / 1000));
  }

  async get<T>(path: string, options?: { cacheKey?: string; retries?: number; minIntervalMs?: number }): Promise<T> {
    const key = `${options?.cacheKey ?? 'fresh'}:${path.replace(/([?&])_t=[^&]+/g, '$1')}`;
    const existing = this.reads.get(key);
    if (existing) return existing as Promise<T>;
    const pending = this.read<T>(path, options);
    this.reads.set(key, pending);
    try { return await pending; } finally { if (this.reads.get(key) === pending) this.reads.delete(key); }
  }

  private async read<T>(
    path: string,
    options?: { cacheKey?: string; retries?: number; minIntervalMs?: number },
  ): Promise<T> {
    if (options?.cacheKey) {
      const cached = await this.redis.getJson<T & { __missing?: boolean }>(options.cacheKey).catch(() => null);
      if (cached?.__missing) throw new SportyBetHttpError('Booking code unavailable', 'NOT_FOUND', 404);
      if (cached) return cached;
    }

    const maxRetries = options?.retries ?? 3;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const data = await this.request<T>('GET', path, undefined, options?.minIntervalMs);
        if (options?.cacheKey) {
          await this.redis.setJson(
            options.cacheKey,
            data,
            this.cacheTtlSeconds,
          ).catch(() => undefined);
        }
        return data;
      } catch (err) {
        if (options?.cacheKey && err instanceof SportyBetHttpError && ['NOT_FOUND', 'INVALID_BOOKING_CODE'].includes(err.code)) await this.redis.setJson(options.cacheKey, { __missing: true }, 60).catch(() => undefined);
        attempt += 1;
        const retryable =
          err instanceof SportyBetHttpError &&
          (err.status === 429 || (err.status !== undefined && err.status >= 500));
        if (!retryable || attempt > maxRetries) throw err;
        const delay = Math.min(2000, 250 * 2 ** (attempt - 1));
        await sleep(delay);
      }
    }
  }

  /** Booking POST is never auto-retried. */
  async post<T>(path: string, body: unknown): Promise<T> {
    this.assertNoStakePayload(body);
    return this.request<T>('POST', path, body);
  }

  private assertNoStakePayload(body: unknown) {
    const raw = JSON.stringify(body ?? {});
    const forbidden =
      /"stakeAmount"|"amount"\s*:|"wager"|"wallet"|"password"|"otp"|"currency"/i;
    if (forbidden.test(raw)) {
      throw new SportyBetHttpError(
        'Stake/credential fields are forbidden',
        'FORBIDDEN_PAYLOAD',
      );
    }
    if (!pathLooksLikeShare(raw) && /\/orders\/(place|bet|stake|confirm)/i.test(raw)) {
      throw new SportyBetHttpError(
        'Wagering endpoints are forbidden',
        'FORBIDDEN_ENDPOINT',
      );
    }
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown,
    minIntervalMs?: number,
  ): Promise<T> {
    if (method === 'POST' && !path.includes('/orders/share')) {
      throw new SportyBetHttpError(
        'Only /orders/share POST is allowed',
        'FORBIDDEN_ENDPOINT',
      );
    }

    await this.acquireSlot(minIntervalMs);
    try {
      const url = `${this.baseUrl}${path}`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Current-Country': this.region.toUpperCase(),
            'User-Agent':
              'Mozilla/5.0 (compatible; myOdd/0.1; +https://github.com/myodd)',
          },
          body: body !== undefined ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new SportyBetHttpError(
            `SportyBet HTTP ${res.status}`,
            mapStatus(res.status),
            res.status,
          );
        }

        const json = (await res.json()) as {
          bizCode?: number;
          message?: string;
          data?: T;
        };

        if (json.bizCode !== undefined && json.bizCode !== 10000) {
          throw new SportyBetHttpError(
            json.message ?? `Upstream bizCode ${json.bizCode}`,
            'UPSTREAM',
            res.status,
          );
        }

        return (json.data ?? json) as T;
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof SportyBetHttpError) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new SportyBetHttpError('SportyBet timeout', 'TIMEOUT');
      }
      this.logger.warn(`SportyBet network error: ${(err as Error).message}`);
      throw new SportyBetHttpError('SportyBet network error', 'NETWORK');
    } finally {
      this.releaseSlot();
    }
  }

  private async acquireSlot(minIntervalMs?: number) {
    const interval = minIntervalMs ?? this.minIntervalMs;
    const limit = interval < this.minIntervalMs ? Math.max(this.maxConcurrency, 12) : this.maxConcurrency;
    if (this.inFlight >= limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.inFlight += 1;
    const wait = interval - (Date.now() - this.lastRequestAt);
    if (wait > 0) await sleep(wait);
    this.lastRequestAt = Date.now();
  }

  private releaseSlot() {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function mapStatus(status: number) {
  if (status === 400) return 'BAD_REQUEST';
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'UPSTREAM';
}

function pathLooksLikeShare(_raw: string) {
  return true;
}
