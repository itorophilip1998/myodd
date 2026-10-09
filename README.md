# myOdd

Turn one SportyBet booking code (or a natural-language prompt) into ranked, shareable slip variations.

**Scope (V1):** SportyBet Nigeria · football · pre-match · no accounts · no staking.

myOdd never places bets. It only creates/reads SportyBet **booking codes** (betslip reservations). You confirm any wager on SportyBet. **18+ | Gamble responsibly.**

## Architecture

```text
apps/web          Next.js UI
apps/api          NestJS API
packages/shared   Shared types / zod schemas
```

- **SportyBet** access is isolated behind `BookmakerProvider` → `SportyBetProvider` (undocumented web API).
- **Prediction** is odds-first (`OddsImpliedEngine`); swap via `PredictionEngine`.
- **Intent parsing** uses a swappable `LlmProvider` (`LLM_PROVIDER=stub|openai|anthropic`).

## Quick start

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm --filter @myodd/shared build
pnpm --filter @myodd/api prisma:generate
pnpm --filter @myodd/api prisma:push
pnpm dev
```

- Web: http://localhost:3000  
- API: http://localhost:3001/api/health  

Default LLM is `stub` (rules parser) — no API key required.

## API

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/bookings/:code` | Load original slip |
| POST | `/api/slips/analyze` | `{ bookingCode }` |
| POST | `/api/slips/generate` | `{ bookingCode?, instruction }` |
| POST | `/api/slips/generate-from-prompt` | `{ instruction }` |
| GET | `/api/jobs/:jobId` | Generation progress |
| GET | `/api/groups/:publicId` | Public slip group |
| GET | `/api/codes/:code` | Single generated slip |

## SportyBet adapter risk

SportyBet has **no official public developer API**. This project uses the same undocumented web endpoints the website uses (`pcUpcomingEvents`, `orders/share`). They can change without notice. All calls go through `SportyBetProvider` only. The only write is `POST …/orders/share` (anonymous booking code). There is **no** place/stake/confirm path.

## Env

See `.env.example`. Swap models with:

```text
LLM_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
```

## Tests

```bash
pnpm --filter @myodd/api test
```

Includes no-stake guards, odds scoring, fingerprint dedupe, and rules intent parsing.
