> The public Live page was removed in v0.2.20. This document describes the retained provider API.

# Feature: Live games explorer

## Purpose

Browse SportyBet football fixtures that are explicitly marked **live**, with scores/period labels when the feed provides them.

## Ownership

| Layer | Location |
|-------|----------|
| Web | Removed in v0.2.20 |
| API | `explore.controller.ts` → live fixtures via bookmaker provider |
| Cache | Redis short TTL (~10s) + coalesce concurrent refreshes |

## Behaviour

- `GET /api/explore/live`.
- Only events marked live are included; pre-match rows mixed into the feed are excluded.
- Client refreshes about every 15 seconds; stale snapshots hide scores after ~45 seconds.
- Search / league filters / pagination over the returned feed.
- Snapshots may be journaled for training context; this is browse-only (no live booking generation).

## Related

- [predictions.md](./predictions.md) — upcoming (not in-play) scoring explorer
