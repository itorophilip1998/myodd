# Feature: Slip generation & modes

## Purpose

Create ranked booking-code variations from a SportyBet share code and/or a natural-language instruction, within hard odds / market constraints.

## Ownership

| Layer | Location |
|-------|----------|
| Web | `/generate` — `GenerateForm.tsx`, guardrails in `lib/generate-guardrails.ts` |
| API | `slips/*`, `jobs/create-booking.processor.ts`, `ai/ai.client.ts` |
| AI | `/intent`, `/generate/<mode>`, `/tools/split` — [AI agents](ai-agents.md) |
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

Typical labels: Over 1.5 Machine, Goals Desk v2, Investor, Statsman, Gambler (incl. “Gamler”), Japa, Lagoslife / Lagos-Lifes.

**Over 1.5 Machine** sits before Investor on Create. Vedic Aries rising only; Over 1.5 (or Over 2.5 when O1.5 &lt; 1.11); week range by default (date filter allowed); up to 10 tickets at 4–6; no same-game repeat across tickets; legs ≤1.25. See [over15-machine.md](./over15-machine.md).

**Goals Desk v2** sits beside it. All-4 Yes (Zi Wei / Omikuji / Lenormand / Desk); O1.5 at 1.14–1.27; Asian Over 2 when O1.5 is 1.09–1.13 (same O1.5 ticket lane); O2.5 only when all-4 Yes and ≤1.60; never mix O1.5 lane with O2.5; O1.5 lane tickets at 3–5, O2.5 tickets at 4–6; up to 10 tickets; thin single days auto-extend +1/+2 days. See [goals-desk-v2.md](./goals-desk-v2.md).

Investor, Statsman, and Gambler are system tickets. The Create form keeps the match day (one day or a range) and hides tickets, games, odds, markets, and split. Investor and Gambler match the exclusive 19-option list to the day’s listed SportyBet markets. Investor builds mixed tickets near 3, 4, 5, and 6 (band 3–6) and stays recommended for those lower odds. Gambler uses the same options across 6.1–20. Each selection is 1.10–1.35. Prompt text and saved defaults do not move that band or add markets. See [investor-system-mode.md](./investor-system-mode.md) and [statsman-mode.md](./statsman-mode.md).

## Fixture scope

- Upcoming football comes from SportyBet. Listing pages continue until the feed ends, up to 20 pages of 100. Each page already includes double chance, match and team goals, excluded goals, and home, draw, or away or over 2.5 for every game in the window. Tickets are built from that list. A separate full board is not loaded for each match. Investor and Gambler use the same listing and keep only the exclusive 19 provided options.
- Default adaptive: prefer original matches, expand when needed.
- `original_only` / upcoming-only supported via form or language.
- Markets must exist in the live bookmaker catalog; unknown IDs are discarded.

## Constraints

- Football, pre-match; one selection per event.
- Across a collection, one pick (event, market, outcome, and line) is used on at most one ticket. The same match may appear again only with a different option. Pinned original selections may be shared. A shortage returns fewer tickets instead of a repeated option.
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
