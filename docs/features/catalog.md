# Feature: Code catalog discovery

## Purpose

Background maintenance of a library of public SportyBet master/share codes discovered from configured HTTPS sources (e.g. Code Hub), for import/validation and community browse support.

## Ownership

| Layer | Location |
|-------|----------|
| API | `catalog/*` — scheduler + BullMQ `code-catalog` |
| AI tool | `POST /tools/discover-codes` |
| Models | `BookingCode`, `CodeSource`, `CodeCrawlRun` |

## Behaviour

- Discovery interval: `CODE_DISCOVERY_INTERVAL_HOURS` (default 6).
- Validation interval: `CODE_VALIDATION_INTERVAL_MINUTES` (default 60).
- Sources from `CODE_SOURCE_URLS` (allowlisted HTTPS).
- Manual: `GET /api/catalog`, `POST /api/catalog/import`, `POST /api/catalog/refresh`.
- Discovery respects robots/size/redirect safety checks; no login required.

## Related

- [collections.md](./collections.md) — public codes surface
- [booking.md](./booking.md) — validation against SportyBet
