# Architecture

## Purpose

myOdd generates ranked SportyBet Nigeria **booking-code variations** from an existing share code or a natural-language instruction. It validates availability against SportyBet, persists collections, and never places stakes.

## System overview

```text
Browser
  └─ apps/web (Next.js :3000)
        └─ /api/* ──► apps/api (NestJS :3001)
                          ├─ PostgreSQL (Prisma)
                          ├─ Redis (BullMQ + caches)
                          ├─ apps/ai (FastAPI :8000)
                          └─ SportyBet (undocumented public web API)
```

With HTTPS (`DOMAIN` set), **Caddy** terminates TLS and routes:

- `/api*` → `api:3001`
- everything else → `web:3000`

Web and API bind to host loopback only; public entry is Caddy `:80`/`:443` (or local `:3000`/`:3001` in development).

## Packages and apps

| Path | Role |
|------|------|
| `apps/web` | UI, Clerk session, TanStack Query polling, same-origin `/api` rewrite |
| `apps/api` | Auth, slips/groups/jobs, catalog, explore, bookmaker adapter, learning |
| `apps/ai` | Intent parsing, ranked combination search, predictions, code discovery tool |
| `packages/shared` | Zod schemas, DTOs, mode policy, markets helpers (TS ↔ API contract) |

The AI service has **no database and no bookmaker credentials**. The API owns persistence and SportyBet I/O.

## Runtime services (Compose)

| Service | Image / build | Notes |
|---------|---------------|--------|
| `web` | `Dockerfile.node` target `web` | Next.js |
| `api` | `Dockerfile.node` target `api` | NestJS |
| `ai` | `apps/ai/Dockerfile` | FastAPI + Uvicorn |
| `migrate` | api image, one-shot | `node scripts/migrate.cjs` |
| `postgres` | `postgres:16-alpine` | `postgres_data` volume |
| `redis` | `redis:7-alpine` AOF | BullMQ + caches |
| `backup` | postgres client loop | Daily `pg_dump` → host `./backup/` |
| `caddy` | profile `https` | Only when `DOMAIN` is set |

## Request paths (generation)

1. User submits prompt / code on web (`GenerateForm`).
2. API creates `SlipGroup` + `GenerationJob`, enqueues BullMQ work on `create-booking`.
3. Worker calls AI (`/intent`, the selected `/generate/<mode>` route, or `/tools/split`) with real fixture/market catalogs. Mode agents compose the shared model and tools; see [AI agents](features/ai-agents.md).
4. API creates booking codes via SportyBet, confirms selections/odds, writes `GeneratedSlip` / `SlipSelection`.
5. Web polls `GET /api/jobs/:jobId` and loads `GET /api/groups/:id`.

## Data stores

- **PostgreSQL** — users, groups, slips, selections, jobs, catalog, training journal, preferences.
- **Redis** — BullMQ queues, short-lived explore/prediction/SportyBet caches, rate-limit keys.
- **`ai_data` volume** — optional trained model artifact (`MODEL_PATH`).

## Auth boundary

- Browser: Clerk session (publishable key).
- API: verifies Clerk session JWT (`@clerk/backend`), upserts local `AppUser` by `clerkId`.
- Authorization for collections uses local `AppUser.id` + `group-access` rules (public vs owner vs draft link).

See [features/auth.md](./features/auth.md).

## Deploy topology

- **Host:** Hetzner VPS (`/opt/myodd`).
- **CI:** push/merge to `production` → GitHub Actions rsync → `scripts/deploy-remote.sh`.
- **DNS:** Spaceship A record → server IP; HTTPS via Caddy + Let’s Encrypt.
- **Secrets:** server `.env` and `apps/web/.env.local` never overwritten by deploy.

See [software-docs.md](./software-docs.md#deployment).

## Design constraints

- Football / pre-match only; one outcome per event in a ticket.
- Language models parse instructions only — they do not pick bets from imagination; selections come from bookmaker catalogs and scoring.
- Upstream SportyBet APIs are undocumented and can change; the adapter creates share codes only (no wallet/stake).
