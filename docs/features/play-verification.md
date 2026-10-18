# Feature: Play verification (settlement)

## Purpose

Accurately label each ticket leg as upcoming, live, played (won), cut (lost/void), or unknown — without treating “no longer bettable” as a loss.

## Problem this fixes

SportyBet share JSON sets `isActive: false` once a match starts or finishes. The old checker treated that as **CUT / lost**, so winning finished legs were often wrong.

## Semantics

| Status | Meaning |
|--------|---------|
| `UPCOMING` | Prematch and still on the ticket |
| `LIVE` | Match in play |
| `PLAYED` | Explicit **win** settlement |
| `CUT` | Explicit **loss** or **void**, or removed **before** kickoff |
| `UNKNOWN` | Finished (or unclear) without confirmed settlement — **not** treated as cut |

Slip rollup: any cut leg → ticket `CUT`; else live → open → all played → unknown.

## Data sources

1. Fresh share booking JSON (`getBooking`) — structure + any settlement fields (`settleStatus`, `outcomeStatus`, `result`, string `status`).
2. Event / live facts — match phase and score.
3. Share-page HTML scrape (cached ~90s in Redis) when finished legs lack settlement in JSON.

Bettability (`isActive`) is **never** used alone as a post-kickoff loss signal.

## API

- `POST /api/groups/:groupId/verify` and `POST /api/codes/:code/verify` run catalog availability **and** play-check, persist Prisma play fields, and return a play summary.
- Group / code GET payloads include `playStatus`, `cutSummary`, and per-selection `playStatus` / `score` / `playNote`.

## Ownership

| Layer | Path |
|-------|------|
| Decision tree | `apps/api/src/groups/play-leg-status.ts` |
| Orchestration | `apps/api/src/groups/play-check.service.ts` |
| Scrape | `apps/api/src/bookmaker/sportybet.settlement.ts` |
| Mapper | `apps/api/src/bookmaker/sportybet.mapper.ts` |
| UI | `CutCallout` (only real `CUT` legs) |

## Limits

If SportyBet hides settlement, we prefer **UNKNOWN** over a false CUT. Playwright is not used in production.
