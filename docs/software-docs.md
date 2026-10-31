# Software docs

## Repository layout

```text
myodd/
├── apps/
│   ├── web/          # Next.js UI
│   ├── api/          # NestJS + Prisma + BullMQ
│   └── ai/           # FastAPI prediction / intent / generate
├── packages/shared/  # Shared TS contracts
├── deploy/           # Caddyfile
├── scripts/          # start, deploy, backup
├── backup/           # Local SQL dumps (gitignored)
├── docs/             # This documentation
├── docker-compose.yml
└── .github/workflows/deploy-production.yml
```

Package manager: **pnpm** workspaces + **Turbo** for task orchestration.

## Local development

```bash
./scripts/start.sh          # build + compose up --wait (creates .env from example if missing)
./scripts/start.sh --no-build
```

| URL | Purpose |
|-----|---------|
| http://localhost:3000 | Web |
| http://localhost:3001/api/health | API health |
| http://localhost:8000/health | AI health |
| http://localhost:8000/docs | AI OpenAPI |

Host Postgres is published at `127.0.0.1:5433`, Redis at `127.0.0.1:6379`.

### Host-mode tips

- API reads root `.env`.
- Clerk keys live in `apps/web/.env.local` (Compose injects into web + api).
- Web proxies `/api/*` to `API_PROXY_TARGET` (default `http://api:3001` in Docker).
- Leave `NEXT_PUBLIC_API_URL` empty for same-origin `/api`.

## Branches

| Branch | Role |
|--------|------|
| `development` | Default. PR-only (direct push blocked). |
| `production` | Live deploy trigger. |

**Bug / fix branch name (required):**

```
bug/[version]-[what-you-fixed]
```

Example: `bug/0.2.1-play-verify-and-prediction-book`. Bump `APP_VERSION` (and workspace `package.json` versions) to match `[version]`. Full rules: [features/branching.md](./features/branching.md). Agents: `.cursor/rules/branch-naming.mdc`.

Flow: `bug/…` or `feat/…` → PR → `development` → PR → `production` → Actions deploy.

## Deployment

1. Actions checks out `production`.
2. Rsync to `/opt/myodd` (excludes `.env`, `apps/web/.env.local`, `backup/`, build artifacts).
3. `scripts/deploy-remote.sh` runs `docker compose up -d --build --wait`.
4. If `DOMAIN` is set in server `.env`, Compose enables `--profile https` (Caddy).

Required GitHub secrets: `HETZNER_SSH_KEY`, `HETZNER_HOST`, `HETZNER_USER`, optional `HETZNER_DEPLOY_PATH`.

### Production domain (Spaceship)

1. A `@` → server IP; `www` CNAME → apex (or A → same IP).
2. Set on server `.env`: `DOMAIN`, `ACME_EMAIL`, `CORS_ORIGIN`, `CLERK_AUTHORIZED_PARTIES`, `PUBLIC_WEB_URL` (https), empty `NEXT_PUBLIC_API_URL`.
3. Add the origin in Clerk production settings.
4. Redeploy.

Checklist of keys: `.env.production.example`. **New env vars must be added manually on the server** — deploy never merges env files.

## Database

- Migrations: Compose `migrate` service runs `apps/api/scripts/migrate.cjs` (`prisma migrate deploy` path with safe adoption).
- Local schema work: `pnpm db:migrate` (commit the migration directory).
- Never rely on `db push` in production.

## Backups

Dumps are local artifacts (like `.env`), not GitHub artifacts.

```bash
./scripts/backup.sh          # dump local Compose Postgres → backup/
./scripts/backup.sh --pull   # copy Hetzner ./backup dumps → backup/
```

- Server `backup` container writes daily `myodd-*.sql.gz` into host `/opt/myodd/backup`.
- Mac LaunchAgent runs `backup.sh --pull` daily.
- Keeps newest 30 dumps. `/backup/*` is gitignored; deploy rsync excludes `backup/`.

## Checks

```bash
PYTHONPATH=apps/ai apps/ai/.venv/bin/python -m unittest discover -s apps/ai/tests -v
pnpm --filter @myodd/api test
pnpm lint
pnpm build
docker compose config --quiet
```

## API surface (summary)

| Area | Prefix / paths |
|------|----------------|
| Health | `GET /api/health` |
| Account | `/api/account/*` |
| Slips | `/api/slips/*` |
| Jobs | `/api/jobs/:jobId` |
| Groups / codes | `/api/groups/*`, `/api/codes/:code` |
| Bookings | `/api/bookings/:code` |
| Explore | `/api/explore/live`, `/api/explore/predictions` |
| Catalog | `/api/catalog/*` |
| Learning | `/api/learning/*` |

AI (internal): `/health`, `/intent`, `/resolve`, `/generate/investor`, `/generate/gambler`, `/generate/japa`, `/generate/lagos-life`, `/generate/prediction`, `/tools/split`, `/tools/discover-codes`. Legacy `/generate`, `/split`, `/predictions` dispatch through the same agents. See [AI agents](features/ai-agents.md).

## Conventions

- Shared request/response shapes live in `packages/shared` (Zod) and are mirrored in Python Pydantic on the AI side for HTTP contracts.
- Feature behaviour docs live under `docs/features/`.
- Responsible messaging: 18+ / gamble responsibly; product does not claim guaranteed wins.
