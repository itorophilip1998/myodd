# myOdd

Generate ranked SportyBet Nigeria booking-code variations from an existing code or a natural-language request. Football, pre-match, booking codes only; myOdd never stakes or places wagers.

## Services

```text
Browser → web (Next.js, :3000) → api (NestJS, :3001)
                                  ├── ai (Python / FastAPI, :8000)
                                  ├── PostgreSQL (Prisma migrations)
                                  ├── Redis (durable BullMQ jobs and cache)
                                  └── SportyBet (fixtures and booking codes)
```

- `apps/web`: interface, progress polling, share pages, and saved group history.
- `apps/api`: validates requests, queues durable jobs, retrieves SportyBet fixtures, calls AI over HTTP, creates booking codes concurrently, and stores results. It does not run prediction or language models.
- `apps/ai`: independently runnable Python service for instruction parsing, versioned predictions, and ranked slip combination generation. It has no database or bookmaker credentials. Two Uvicorn processes handle concurrent AI requests, each with a bounded process pool (`PREDICTION_WORKERS=2`) for parallel fixture prediction; the API runs up to three queue tasks concurrently.
- `packages/shared`: TypeScript request schemas and DTOs used by the Node services. Python validates the HTTP contract using Pydantic.

Each application has its own container. PostgreSQL, Redis, and a one-shot migration container are supporting services.

## Run everything locally

```bash
./scripts/start.sh
# Or: pnpm start
```

The script creates `.env` from the example only when missing, preserves existing credentials, builds images, applies migrations, and waits for every long-running service to be healthy. Start Docker Desktop or Docker Engine first. To reuse existing images, run `./scripts/start.sh --no-build`. Inspect logs with `docker compose logs -f api ai web`. Hosted instruction models (OpenAI GPT by default) run on the provider’s servers; the local AI service calls the configured provider/model using your key.

Open http://localhost:3000. API health: http://localhost:3001/api/health. AI health and model version: http://localhost:8000/health. AI API schema: http://localhost:8000/docs.

Compose waits for PostgreSQL, applies committed migrations, waits for AI and Redis health, then starts API and web. Startup ordering follows [Docker's dependency conditions](https://docs.docker.com/compose/how-tos/startup-order/). The AI image runs [FastAPI with Uvicorn](https://fastapi.tiangolo.com/deployment/docker/).

PostgreSQL data, Redis jobs, and trained model artifacts live in named volumes: `postgres_data`, `redis_data`, and `ai_data`. `docker compose down` stops the stack while preserving those volumes. `docker compose up -d` reuses them. **`docker compose down -v` deletes the volumes and their data.** Use the same Compose project name/directory to reuse the same volumes.

Groups and predictions are retained; there is no automatic deletion of old groups. A booking's upstream expiration is separate from retaining its saved record. `/history` lists your account's collections and bookmarked public collections, with pagination. Signed-in generation is private until you choose to share the collection. Guest generation remains public.

### Clerk accounts and local saves

Clerk handles sign-in, sign-up and sessions. The Nest API verifies Clerk session tokens and maps the verified Clerk user ID to a stable local `AppUser` row. New signed-in collections and remembered preferences use that local account ID, so signing in with the same Clerk account on another device retrieves the same PostgreSQL data. Tokens and Clerk secrets are never stored in browser local storage or in saved collections. No duplicate email/password database or webhook tunnel is required for this identity mapping.

This workspace is linked to the existing **myOdd** Clerk development application. Clerk CLI manages its keys in `apps/web/.env.local`; Compose injects that file into web and API at runtime. These credentials are excluded from Git and Docker build contexts. To link a fresh checkout to that same application, run from `apps/web`:

```bash
npx clerk@latest init --app app_3KoPoIRbiKV41YBhGJrQzuXo9EW -y
npx clerk@latest doctor
```

The development instance uses username and password for the form-based sign-in/sign-up flow. Email, phone number, first name and last name are not requested. The existing Google option remains available. Clerk's hosted configuration controls these fields, so changing it takes effect without rebuilding the app. Local save ownership continues to use the stable Clerk user ID, independently of the chosen username.

Then restart with `./scripts/start.sh`. Configure a Clerk production instance and production keys before deploying publicly. API token origins default to `CORS_ORIGIN` (`http://localhost:3000` locally); set `CLERK_AUTHORIZED_PARTIES` to a comma-separated list of trusted frontend origins if needed.

The additive account migration preserves pre-account collections with their legacy archive flag. They stay public, and are never automatically assigned to the first person who signs in. The Public codes tab includes these collections, and each account can bookmark them explicitly. Your new private collections, their job progress and individual code views are restricted to your account; **Share all** publishes the collection before sharing its app link. A SportyBet booking code itself remains usable through SportyBet by anyone who knows it.

### Existing local databases

The migration container recognizes the original `prisma db push` schema, verifies that it exactly matches `apps/api/prisma/baseline.prisma`, records the initial migration as applied, and runs additive upgrades. It never resets the database. If the existing schema has drifted, migration stops for manual reconciliation. Back up valuable data before schema upgrades:

```bash
docker compose exec -T postgres pg_dump -U myodd myodd > myodd-backup.sql
```

New databases apply all committed migrations normally. Subsequent starts use Prisma's migration history and do not recreate tables. To add future migrations during host development, use `pnpm db:migrate`; commit the resulting migration directory. Container startup uses `migrate deploy`, not `db push`.

## User flow

1. Paste a SportyBet booking code and describe how many variations, odds range, markets, or excluded teams you want. Without a booking code, use a prompt to generate from upcoming fixtures.
2. API creates a persistent group and queues preparation. Python parses the request, scores available outcomes, and searches for unique ranked combinations. Code-based generation starts with original matches and preferred markets, then can add upcoming matches or alternate markets when needed. Explicit “original matches only” and market-only instructions are preserved. Prompt-only generation uses upcoming fixtures.
3. API workers validate availability and requested constraints, create booking codes with bounded parallelism, check SportyBet's confirmed selections and odds, and atomically save each result and job progress.
4. View progress, open individual codes, share a group, or return through saved history. Partial failures are reported.

Preparation retries are durable and retain the prepared candidate set. Booking tasks are deduplicated by queue IDs and settled once in a database transaction. Booking POSTs are not automatically retried on HTTP failure. BullMQ may redeliver a stalled task after a process crash; because SportyBet has no idempotency API, a crash between remote code creation and local persistence can create an extra anonymous upstream booking code. Local task settlement prevents duplicate saved records.

## Flexible generation

Risk is a ranking preference within the requested odds range, not an automatic probability cutoff. Explicit minimum-probability, date, team/league exclusion, selection-count and requested-market constraints remain hard limits. The default fixture mode is `adaptive`; `original_only` and `upcoming` are available in the form or natural-language instructions. Original picks can be pinned explicitly.

The AI receives a catalog of real bookmaker markets and outcome IDs. This supports interval draws, handicaps, alternate totals, halves, early-payout variants and other currently available pre-match markets, beyond the familiar fixed market list. Market IDs generated outside that catalog are discarded. Complete three-way interval results remove the bookmaker margin and record `odds-interval-v1`. Other unknown market types use raw odds-implied estimates (`odds-raw-v1`), not an invented trained prediction. Overlapping or conditional markets may not have margin-adjusted probabilities.

The API searches two upcoming-fixture pages and enriches up to 24 matches with detailed markets when expanding. This is a bounded search, not the entire bookmaker inventory. Up to 100 slips and 30 selections per slip are supported, with no app-set upper odds cap; the bookmaker may enforce additional limits. A code is saved only after SportyBet confirms the exact selections and the accepted odds satisfy the effective request.

Results retain partial successes and include a persisted generation report: requested/found counts, available matches, market substitutions, added fixtures and theoretical odds bounds. Bounds do not guarantee every intermediate odds total exists. Requested odds stay strict by default. Only an explicit nearest/closest-odds instruction or the form checkbox permits adjusted totals, which are reported. The result and shared group pages let users edit the request and generate again. Parsing is cached briefly, and fixture expansion resolves the existing intent locally rather than spending another model request. If the configured hosted provider is temporarily rate-limited or unreachable, simple numeric requests without unsupported hard constraints can use the deterministic parser; results explicitly disclose that fallback. More complex requests fail clearly rather than guessing at their constraints.

Examples:

- `Create 50 lower variance slips between 100 and 500 odds. Prefer 5-minute draws and double chance. Add upcoming matches if needed.`
- `Create 5 slips between 3 and 8 odds. Original matches only. Only use double chance.`
- `Create 10 slips around 20 odds. Include Arsenal. Exclude Chelsea. Maximum 6 selections.`
- `Create 8 slips between 10 and 15 odds. If needed use the closest available odds.`

Unsupported or unavailable requested features are reported. Generation remains football and pre-match, with one outcome per event. It cannot invent markets or create guaranteed winning slips.

## Chat input and risk modes

The chat-style composer sits above generated codes. There is no separate source-code field. Use **Edit this code** on a card, or type `@ABC123` / `code: ABC123` in your message to work from a different code. An explicit code in a newly edited message takes precedence over the existing collection context. Existing booking codes remain unchanged; edits generate a new saved collection. Ctrl/Cmd+Enter submits the message.

Four selectable modes also work as typed keywords and enforce **hard per-ticket odds bands** plus **safe per-game odds** inside each ticket. Investor Mode is recommended by default and ranks tickets by estimated joint probability within its band:

| Mode | Ticket odds | Safe odds per game |
|------|-------------|--------------------|
| Investor Mode (recommended) | 2–5 inclusive | 1.10–1.50 |
| Gambler Mode (also `Gamler Mode`) | 5.01–20 | 1.10–1.80 |
| Japa Mode | 20.01–100 | 1.10–2.00 |
| Lagoslife / Lagos-Lifes Mode | 100.01+, no app ceiling | 1.10–2.00 |

Explicit odds targets narrow the mode band. A typed contradictory target fails clearly; a final mode selected in the controls overrides an older conflicting range and reports that change. Nearest-odds adjustment cannot escape a named band. Inventory, selection-count, numerical and bookmaker constraints still apply. These names do not promise prediction accuracy or a guaranteed outcome.

Ticket count (1–100) and games per ticket (1–30) can be set inside the chat input’s Options panel or in the prompt. The compact panel also includes the generate/split action, split count, match scope and market/odds toggles. `Exactly 4 games per ticket` sets both minimum and maximum to four. Split part counts and exact games must also preserve all eligible original picks; contradictory sizes fail instead of repeating picks. Results are paginated (12/24/48 per page), searched and sorted before pagination; Copy all checks and copies the entire valid collection.

## Progress, working codes and retained training data

The five-checkpoint build journey follows the freshest job poll, appears immediately after submission, and reads **persisted backend stages**: request → games → combinations → verification → saved. It shows elapsed time, current-step activity, actual saved/remaining/failed counts, completion and failures. Stage indicators are not presented as an invented overall completion percentage. Verified tickets appear as they are saved. The progress display rewards finishing a build, not stakes, deposits, winnings or higher-risk play.

Result cards contain only recently verified, fully active codes. Older codes are checked in the background before display; expired, unavailable, partially active and unverified codes remain in storage but are hidden from results. Copy, share and bookmaker-open actions check the code directly again. SportyBet can still change markets or suspend a code after a successful check; the app cannot guarantee external availability indefinitely. Single-pick codes may be displayed when active; master-code selection separately requires at least two future picks.

`training_events` is an append-only application journal with versioned JSON payloads: accepted requests, source/fixture/market snapshots, model metadata, parsed and effective configuration, every scored pool/candidate set, final booking plans, validation-time fixture snapshots, booking attempts/rejections/confirmed responses, settlement and stage changes. Events and accepted selections are saved transactionally with job progress; a confirmed booking is durably retained in Redis before its PostgreSQL write is retried. Startup can rebuild missing queue work from database request/plan events. Catalog discovery and validation snapshots are retained rather than overwritten. Legacy collections are imported into the journal, explicitly marked as lacking historical fixture context.

`TrainingFeedback` retains helpful/not-helpful feedback, notes and corrected prompts. **Remember these settings** saves an account preference profile when signed in, or an anonymous browser profile for guests, containing only an approved mode, ticket count and exact games-per-ticket default. Future requests can use these defaults when unspecified; explicit prompts/control values take precedence. Raw feedback notes are not executed as system instructions. This is preference adaptation, not automatic fine-tuning or proof of a betting edge. Prompts and generated tickets are not win/loss labels; predictive retraining still needs verified completed-match outcomes and evaluation (see the CSV/Poisson workflow below).

Export a consistent PostgreSQL snapshot as JSONL, with record-count and SHA-256 manifest:

```bash
docker compose exec -T api node scripts/export-training.cjs /tmp/myodd-training.jsonl
docker compose cp api:/tmp/myodd-training.jsonl ./myodd-training.jsonl
docker compose cp api:/tmp/myodd-training.jsonl.manifest.json ./myodd-training.jsonl.manifest.json
```

Exports are local-only, contain complete journal payloads and are not available from a public endpoint. Keep exports private. Redis uses `appendfsync always`; PostgreSQL data remains on its named volume. A backup container writes consistent compressed SQL backups at startup and daily to the separate `postgres_backups` volume, with no automatic deletion. Storage must remain available; backups cannot make external data truthful or eliminate every possible infrastructure failure. `docker compose down -v` deletes all named data/backup volumes.

## Split one booking code into parts

Paste `GNPM8T` in the chat, select **Split a code**, choose the part count and a risk mode, then submit. Natural instructions also work: `Split GNPM8T into 3 parts using Investor Mode`. The API uses the same conservative code/count extractor as the UI, so a separate source field or `@` prefix is optional. SportyBet share links are accepted as code evidence too.

Splitting partitions the original available selections, without substituting markets, adding fixtures or repeating a pick across parts. Investor Mode balances estimated log risk across similarly sized parts; Gambler Mode balances sizes; Japa groups similar risk bands; Lagos-Lifes concentrates risk into larger parts. Requested hard odds and selection limits remain binding. With no explicit split odds/selection bounds, parts allow 1–30 selections and ticket odds of at least 1.10 without an app upper cap (named modes enforce their own ticket and per-game bands). Every individual game/leg must be priced at least **1.10**, and named modes also cap each leg (Investor ≤1.50, Gambler ≤1.80, Japa/Lagoslife ≤2.00). A split can make single-pick parts where the bookmaker accepts them. Parts cannot outnumber eligible original picks.

Unavailable or filtered picks are counted and explained. Impossible counts, contradictory constraints or unsupported same-match/bet-builder originals return a clear error without invented or repeated picks. Static partition planning returns the entire requested partition or none; live bookmaker changes during code creation can still produce partial successes, which the job reports. Each accepted part uses the existing confirmation, persistence, expiry and copy/share pipeline. Split strategy and counts are retained in the group's generation report.

## Market intent and compact odds

`1-10 draws` means **1X2 Draw from minute 1 to minute 10**. The local resolver overrides incorrect model-selected market IDs and enforces exact period and outcome IDs. Full-time draws, other intervals, home/away wins, double chance, cards and corners cannot substitute for that request. The generator searches additional fixtures for exact markets before considering locally derived alternatives: equal correct scores or Under 0.5 total goals over the **same interval**. These imply a drawn interval but are narrower bets and are disclosed when used. `No alternatives` keeps the exact market only. No matching options returns a clear partial/empty result; ticket counts do not justify unrelated picks. Named market requests are preserved unless the user explicitly permits any markets.

Minute ranges are not odds targets. A draw request without an explicit odds band or mode does not inherit an arbitrary 2.5–5 band. Explicit odds, modes and game counts remain binding. Matching accuracy is covered by regression tests; this does not establish improved win probability or a trained betting advantage.

Odds display uses compact rounded labels: `184775.21` → `185ks`, then `1ms`, `10ms`, `100ms`, `1b`, `1t`, etc. Prompt parsing accepts the same compact forms (`20ks`, `1.5ms`, `2k`, `1m`). Low odds retain up to two decimals. Full totals remain in PostgreSQL, calculations and accessible card tooltips. Compact labels do not alter mode-boundary checks or bookmaker validation.

## Saved codes and automatic master selection

The home screen focuses on a prompt; adding a SportyBet code and advanced constraints is optional. Collections show compact cards paginated at 12, 24 or 48 per page, searchable teams/codes, odds sorting, expandable picks, individual copy/share and **Copy all**. Copy all freshly verifies every unique code in the collection, including codes outside the current search and page, and copies only active codes. Shared collections and paginated saved history read PostgreSQL, not browser storage. Archived and unavailable tickets stay in the database and training export, but are hidden from public result cards and code pages.

The background catalog uses the requested [SportyBet Code Hub](https://www.sportybet.com/ng/m/code-hub/codes). Its public frontend calls the featured-code feed; the Python adapter reads two pages of 20 codes, checks the source robots policy, and returns only actual `shareCode` fields. It does not import user IDs, promotional text or scraped instructions as model commands. Discovery uses a configured HTTPS allowlist, public-address checks, bounded response sizes and same-host redirects. No login is required.

```dotenv
CODE_SOURCE_URLS=https://www.sportybet.com/ng/m/code-hub/codes
CODE_DISCOVERY_INTERVAL_HOURS=6
CODE_VALIDATION_INTERVAL_MINUTES=60
```

A durable BullMQ catalog worker runs at startup and hourly by default. It discovers new candidates every six hours and validates up to 100 due candidates per run directly with SportyBet, bypassing the booking cache. At least two active, priced, future selections are required for master eligibility. Before each automatic use the chosen code is checked again. Publicly sourced codes are preferred to generated codes; if no verified master is available, prompt generation uses upcoming fixtures. Explicitly supplied codes take precedence.

`booking_codes` stores source, first/last seen dates, fixed expiry, last validation, availability, active selection counts and a normalized booking snapshot. `code_sources` and `code_crawl_runs` retain discovery status/errors. Failures retain existing data and prevent an unverified candidate from being selected. Eligibility expires at most seven days after first capture, or earlier if SportyBet supplies an earlier deadline; rediscovery does not restart the seven-day clock. Expired rows are archived, not deleted. This is an app reuse policy: the app cannot extend or guarantee SportyBet's external code lifetime.

Generated codes, selections, catalog entries and job progress are saved in one transaction. Upstream confirmations are retained in durable queue data before persistence; a database retry saves the same confirmed code instead of requesting another one. Task settlement is idempotent. The catalog migration backfills previously saved codes without resetting their age. Docker migrations run before the API, and PostgreSQL/Redis named volumes preserve records across service recreation. `docker compose down` retains volumes; `down -v` deletes them.

## Prediction models

`PREDICTION_MODEL=odds` is the runnable default. It derives margin-adjusted probabilities from market prices and handles overlapping double-chance outcomes separately. This is an odds baseline, not a trained advantage over the bookmaker.

`PREDICTION_MODEL=poisson` loads a trained, versioned goal model from `/data/model.json`. It estimates home/away scoring rates from league averages and team attack/defence rates with smoothing, then computes result, double-chance, totals, and BTTS probabilities. Teams/leagues absent from the artifact fall back to `odds-v2`; each stored selection records its actual model version. Exact team and league names must match SportyBet names.

Train on your own completed-match CSV (not included):

```csv
date,league,homeTeam,awayTeam,homeGoals,awayGoals
2025-08-01,Example League,Example Home,Example Away,2,1
```

```bash
docker compose cp ./matches.csv ai:/data/matches.csv
docker compose exec ai python -m app.train /data/matches.csv --before 2026-10-16
# Set PREDICTION_MODEL=poisson in .env, then reload the AI processes:
docker compose up -d ai
```

Only matches strictly before the cutoff enter training. Retraining writes a new artifact atomically; restart `ai` to load it. No historical dataset is bundled and no performance advantage is claimed. Validate trained models on held-out, later matches before relying on their rankings. Slip ranking combines estimated joint probability, market/original-match preferences and a volatility penalty under an independence assumption, which does not capture all cross-match dependence. Search is bounded and returns the highest-ranked combinations it found, not a proof of a global optimum. Stored selection scores are per-leg ranking metrics, not slip win probabilities.

## Instruction parsing

Instruction parsing uses a **dynamic model orchestrator** in `apps/ai/app/llm.py`. Provider, model, base URL, and credentials are resolved from environment variables on every request (`AI_PROVIDER` → `INTENT_PROVIDER` → `LLM_PROVIDER`, defaulting to `rules` when unset in code; Compose defaults `AI_PROVIDER` to `openai`).

Supported providers:

| `AI_PROVIDER` | Default model | Credentials | Notes |
|---------------|---------------|-------------|-------|
| `openai` | accurate `gpt-4o` + fast `gpt-4o-mini` | `AI_API_KEY` or `OPENAI_API_KEY` | Dual-model route (`AI_MODEL_ROUTE=auto`). If your OpenAI project has GPT-5.6 enabled, set `AI_MODEL=gpt-5.6-sol` and `AI_MODEL_FAST=gpt-5.6-terra`. |
| `groq` | `qwen/qwen3.8-27b` | `AI_API_KEY` or `GROQ_API_KEY` | OpenAI-compatible Groq endpoint; keeps Groq-specific request fields. |
| `ollama` | `OLLAMA_MODEL` (`llama3.2`) | none | Local server via `OLLAMA_URL`. |
| `rules` | none | none | Deterministic parser; no remote call. |

For hosted GPT language understanding (recommended):

```dotenv
AI_PROVIDER=openai
AI_MODEL=gpt-4o
AI_MODEL_FAST=gpt-4o-mini
AI_MODEL_ROUTE=auto
AI_MODEL_TEMPERATURE=0.2
AI_API_KEY=your_openai_key
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o
# Optional OpenAI-compatible proxy:
# AI_BASE_URL=https://api.openai.com/v1
```

`AI_MODEL_ROUTE` controls which model runs:

- `auto` (default): short mode/count prompts → `AI_MODEL_FAST`; draws, markets, leagues, long prompts → `AI_MODEL`
- `fast`: always use the fast model
- `accurate`: always use the higher-accuracy model

Keep the real key in the ignored root `.env`, then run `docker compose up -d --build --no-deps ai`. Only the AI container receives the key; it is never included in frontend builds or source code. The orchestrator requires every configuration field, validates again with Pydantic, and reports sanitized provider errors. OpenAI uses [structured outputs](https://platform.openai.com/docs/guides/structured-outputs); Groq uses its compatible chat-completions schema path. Extraction runs at `AI_MODEL_TEMPERATURE`. `GET /health` reports `intentProvider`, `intentModel` (accurate), `intentModelFast`, `intentModelRoute`, and `intentBaseUrl` separately from the prediction model version.

`AI_PROVIDER=rules` (or legacy `INTENT_PROVIDER=rules` when `AI_PROVIDER` is empty) runs immediately without downloads. It supports counts, odds ranges, markets, lower/moderate/higher risk, team exclusions, maximum/minimum selections, and explicit ISO kickoff deadlines. Examples:

- `Create 10 lower-risk slips between 3 and 5 odds. Prefer over 1.5 and double chance.`
- `Generate 5 slips around 8 odds. Maximum 4 selections. Remove Arsenal and Chelsea.`
- `Create 3 slips between 2 and 4 odds. No straight wins. Before 2026-10-17T18:00:00Z`

For local Ollama, set `AI_PROVIDER=ollama` (or legacy `INTENT_PROVIDER=ollama`), `OLLAMA_URL`, and `OLLAMA_MODEL`, then recreate `ai`. The Python service uses Ollama's [JSON-schema structured output](https://github.com/ollama/ollama/blob/main/docs/capabilities/structured-outputs.mdx) and validates the configuration. Ollama is optional; language models only interpret requests, and prediction models rank real bookmaker selections.

## Host development

```bash
docker compose up -d postgres redis
pnpm install
pnpm --filter @myodd/shared build
pnpm --filter @myodd/api prisma:generate
# Apply migrations using the same safe adoption script as Compose:
(cd apps/api && set -a && . ../../.env && set +a && node scripts/migrate.cjs)
python3 -m venv apps/ai/.venv
apps/ai/.venv/bin/pip install -r apps/ai/requirements.txt
(cd apps/ai && .venv/bin/uvicorn app.main:app --reload --port 8000)
# In another terminal:
pnpm dev
```

The API reads the root `.env`. For Python host development, export AI model/intent variables in its terminal if changing defaults. For a host Next.js dev server, set `NEXT_PUBLIC_API_URL` in that terminal or `apps/web/.env.local` when overriding localhost. In Docker this URL is a browser-facing build argument; rebuild `web` when changing it.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/bookings/:code` | Read original booking |
| POST | `/api/slips/analyze` | Analyze `{ bookingCode }` |
| POST | `/api/slips/generate` | Start `{ bookingCode?, instruction }` |
| POST | `/api/slips/generate-from-prompt` | Start `{ instruction }` |
| GET | `/api/jobs/:jobId` | Progress, status, failure count |
| GET | `/api/groups?page=1` | Saved public groups, 50 per page |
| GET | `/api/catalog` | Active/archive counts and latest catalog run |
| POST | `/api/catalog/import` | Save and verify `{ code }` |
| POST | `/api/catalog/refresh` | Queue catalog maintenance |
| GET | `/api/groups/:publicId` | Saved group and selections |
| GET | `/api/codes/:code` | Saved generated slip |

Python internal endpoints: `GET /health`, `POST /intent`, `POST /resolve`, `POST /generate`, `POST /split`, `POST /tools/discover-codes`.

## Checks

```bash
PYTHONPATH=apps/ai apps/ai/.venv/bin/python -m unittest discover -s apps/ai/tests -v
pnpm --filter @myodd/api test
pnpm lint
pnpm build
docker compose config --quiet
```

SportyBet has no official public developer API. Its undocumented fixtures/share endpoints can change. The adapter permits booking-code creation only; it contains no stake, wallet, or wager-confirmation flow. 18+ | Gamble responsibly.

## Live games and prediction explorer

Header navigation now provides **Create**, **Live Games**, **Predictions** and **Saved codes**. The generation composer disappears immediately while submitting, remains closed during the job and after results, and reopens only through the request or ticket edit icon. Closing the editor preserves its draft. Running jobs without results show an animated myOdd logo with orbiting checkpoints, ticket tiles and the existing backend stages and real counts. The journey disappears as soon as results are present; ongoing work uses a compact remaining-ticket message, and completed collections never replay the journey. Session and collection loading reuse the branded animation. Reduced-motion preferences disable the decorative animations. Result cards use five desktop columns and progressively fewer on smaller screens.

`/live` reads SportyBet's public football live-list endpoint through the API. Only events explicitly marked live are included; pre-match entries mixed into that feed are excluded. Scores, period labels and reported clocks are preserved rather than simulated. Team/country/league search, league filters and pagination work over the returned feed. The browser refreshes every 15 seconds, the server coalesces concurrent refreshes and caches for 10 seconds, and displayed live snapshots are journaled. Snapshots older than 45 seconds hide scores until fresh data arrives. A feed failure is shown explicitly.

`/predictions` uses a separate Python scoring-only endpoint on up to two pages of upcoming football fixtures (72-hour search window). In-play/ended fixtures are excluded by kickoff before scoring; the UI removes kicked-off entries as time passes. Users can search, filter leagues and choose None (all markets), over goals, under goals, draws, corners, BTTS, double chance, handicaps, cards or correct score. Detailed alternate markets are fetched for up to 24 upcoming matches; the remaining loaded matches retain listing markets. Missing specialist markets produce an explicit empty state rather than unrelated picks. The browser receives only the selected market and the first 50 ranked outcomes per match. Compare outcomes fetches additional selections on demand (up to 5,000 per match), including alternate lines, and users can sort matches by estimate. The complete scoring snapshot remains in the local training journal. Predictions show actual per-selection model versions and distinguish price-based estimates from trained Poisson estimates. Available prices and normalized probabilities are estimates, not verified outcomes. Full fixture/scoring snapshots are retained in the training journal, with a 90-second cache to avoid recalculating identical browsing requests. No live forecasts or live booking codes are generated by this feature.

### Saved code library

Saved codes has Public codes and My collections tabs. Public collections containing saved tickets are browsable without signing in; account-only collections stay private. Users can switch between Grid, Compact (six desktop columns) and List layouts, with the preference saved on this device, and search loaded collection titles/codes. My collections lists only collections you own and supports selection of up to 100 loaded collections, single/bulk delete and Undo. Deleting a collection retracts its public visibility and hides it from public browse and direct collection/code routes, while preserving records, jobs and training history. Undo restores an owned collection privately; publishing it again is an explicit owner action.

Public creator names use the authenticated account’s Clerk username (synced server-side at most hourly) or a generated creator label; public APIs never expose Clerk IDs, emails, phone numbers or private collections. Older ownerless guest codes remain community collections. The ⋯ menu on owned collections provides Edit tickets (opens the existing prompt editor), Rename, Make private/public and Delete. Editing picks generates a new collection rather than mutating an upstream SportyBet booking. Private collections, their job progress and generated-code app routes remain owner-only.
