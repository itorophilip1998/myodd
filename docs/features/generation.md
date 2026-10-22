# Feature: Slip generation & modes

## Purpose

Create ranked booking-code variations from a SportyBet share code and/or a natural-language instruction, within hard odds / market constraints.

## Ownership

| Layer | Location |
|-------|----------|
| Web | `/generate` — `GenerateForm.tsx`, guardrails in `lib/generate-guardrails.ts` |
| API | `slips/*`, `jobs/create-booking.processor.ts`, `ai/ai.client.ts` |
| AI | `/intent`, `/generate`, `/split` — `apps/ai/app/` |
| Policy | `packages/shared/src/mode-policy.ts`, `chat-request.ts` |

## Entry points

- `POST /api/slips/generate` — code + instruction (or context from an existing collection).
- `POST /api/slips/generate-from-prompt` — prompt-only from upcoming fixtures.
- `POST /api/slips/analyze` — preview original booking without generating.

## Flow

1. Parse instruction (hosted LLM or rules fallback) into a structured config.
2. Score available outcomes (odds / optional trained model).
3. Search unique combinations inside odds bands and market constraints.
4. Enqueue booking tasks; SportyBet confirms each code before persist.
5. Persist generation report (requested/found, substitutions, bounds).

## Named modes

Hard ticket bands and safer per-leg odds (see `MODE_ODDS` / `MODE_SELECTION_ODDS` in shared). Modes also work as typed keywords. Explicit numeric targets narrow the band; contradictory targets fail clearly.

Typical labels: Investor, Gambler (incl. “Gamler”), Japa, Lagoslife / Lagos-Lifes.

## Fixture scope

- Default adaptive: prefer original matches, expand when needed.
- `original_only` / upcoming-only supported via form or language.
- Markets must exist in the live bookmaker catalog; unknown IDs are discarded.

## Constraints

- Football, pre-match; one selection per event.
- Ticket count and games-per-ticket limits enforced in UI + API.
- Nearest-odds adjustment only when explicitly allowed; cannot escape a named mode band.
- myOdd never stakes; it only creates anonymous booking/share codes.

## Related

- [jobs.md](./jobs.md) — progress polling
- [booking.md](./booking.md) — SportyBet confirmation
- [collections.md](./collections.md) — where results are stored

## Production improvements (v0.2.15)

Manual risk mode is optional. Explicit mode/market controls override prompt preferences; prompt intent overrides automatic defaults. Shared market IDs resolve against current provider catalogs, including dynamically observed specialty markets. Exact selection keys do not repeat across the batch unless original picks were explicitly pinned. Shortages return fewer tickets with an explanation.

The optional request UUID is scoped to the authenticated account or an HTTP-only guest session. Identical retries reuse the same group/job; changing the payload with the same ID returns 409. Successful authenticated tickets are automatically retained privately in Codes. Job/group responses add an outcome summary while preserving existing fields.

See [production-improvements.md](./production-improvements.md) for migration, deployment, caching, and validation details.
