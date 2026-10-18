# Feature: Booking codes (SportyBet)

## Purpose

Read existing SportyBet share codes and create new anonymous booking codes that confirm the exact selections and odds myOdd proposed.

## Ownership

| Layer | Location |
|-------|----------|
| Adapter | `apps/api/src/bookmaker/sportybet.*.ts` |
| API | `bookings.controller.ts`, slips booking path in `slips.service.ts` |
| Web | `VerifiedBookmakerLink`, copy/share actions |

## Behaviour

- `GET /api/bookings/:code` — fetch original booking structure for analyze/generate.
- Creation happens only inside generation workers after AI candidates are chosen.
- A code is saved only after SportyBet confirms selections and accepted odds satisfy the request.
- Region defaults to `ng` (`SPORTYBET_REGION`); base URL and rate limits are env-driven.
- No stake, wallet, deposit, or wager-confirmation APIs are implemented.

## Verification

- Collection / code verify endpoints re-check availability before copy/open actions.
- SportyBet can still change markets after a successful check; availability is not permanent.

## Limits & resilience

- Client enforces min interval, concurrency, and cache TTL.
- Booking POSTs are not blindly retried on HTTP failure; BullMQ may redeliver after crash — settlement is idempotent locally, but SportyBet has no idempotency key (documented risk of an orphan upstream code on crash windows).
