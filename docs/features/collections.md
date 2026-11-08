# Feature: Collections, share & history

## Purpose

Persist generation results as **collections** (`SlipGroup`), browse public vs personal libraries, rename/publish/delete, and open shareable links.

## Ownership

| Layer | Location |
|-------|----------|
| Web | `/history`, `/g/[id]`, `/code/[code]`, `/result/[id]`, `CodeWorkspace`, `SlipGroups`, `ShareButtons` |
| API | `groups/*`, `group-access.ts` |
| Model | `SlipGroup`, `GeneratedSlip`, `SlipSelection`, `SavedCollection` |

## Visibility model

New generations start private. Successful authenticated generations are automatically retained in Codes; authenticated drafts are owner-only. Guest drafts retain unguessable result links until claimed. Saving a title and optional public visibility updates the same collection transactionally.

| State | Who can see |
|-------|-------------|
| Owner | Always (when signed in as owner) |
| Public feed | `isPublic && userSaved` |
| Bookmark | Account saved via `SavedCollection` |
| Legacy archive | Older `isLegacy` community collections |

Access rules: `apps/api/src/groups/group-access.ts`.

## Key APIs

- `GET /api/groups` — account library (paginated).
- `GET /api/groups/public` — public browse.
- `GET /api/groups/:groupId` — collection detail.
- `PATCH /api/groups/:id` — rename / visibility.
- `POST /api/groups/:id/share` — publish + share affordances.
- Account save/unsave: `/api/account/saves/:publicId`.
- `GET /api/codes/:code` — single saved slip view.

## UI behaviour

- Codes (`/history`): Public codes vs My collections; grid/compact/list layouts.
- Collection menu: edit tickets (new generation), rename, make private/public, delete.
- Delete retracts public visibility but retains training/journal history.
- Share uses app links (`/g/...`) plus SportyBet share URLs for individual codes.
- Tickets in one collection do not repeat the same pick. A match can appear on another ticket only with a different market or outcome.

## Play / cut labels

Verify runs settlement-aware play-check (see [play-verification.md](./play-verification.md)). **CUT** means confirmed lost. Each card shows one of OPEN, LIVE, CUT, WIN, UNKNOWN; void and unconfirmed results remain identifiable in expanded details.

## Related

- [auth.md](./auth.md) — ownership
- [generation.md](./generation.md) — creating collections
- [learning.md](./learning.md) — feedback on collections
- [play-verification.md](./play-verification.md) — accurate win/loss checks

## Temporary retention

All collections, including public/named/bookmarked collections, become eligible for permanent deletion 24 hours after every underlying match is confirmed finished and every selection has a final result. Unknown, live, postponed, and pending events block completion. Corrections clear the completion clock. Existing final collections get a full window when first verified after rollout.

Lifecycle tracking runs every five minutes. Physical deletion is gated by `COLLECTION_CLEANUP_ENABLED=true`, refreshes settlement evidence, and rechecks under row locks. Collection-owned slips, selections, bookmarks, and jobs are removed; independent audit/training records remain. See [production-improvements.md](./production-improvements.md).
