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

New generations start **private** and **unsaved** (`isPublic: false`, `userSaved: false`) for guests and signed-in users. Drafts remain reachable by `publicId` link until saved/shared.

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

- History: Public codes vs My collections; grid/compact/list layouts.
- Collection menu: edit tickets (new generation), rename, make private/public, delete.
- Delete retracts public visibility but retains training/journal history.
- Share uses app links (`/g/...`) plus SportyBet share URLs for individual codes.

## Play / cut labels

Verify runs settlement-aware play-check (see [play-verification.md](./play-verification.md)). **CUT** means lost/void (or removed before kickoff), not merely “inactive on the share ticket.”

## Related

- [auth.md](./auth.md) — ownership
- [generation.md](./generation.md) — creating collections
- [learning.md](./learning.md) — feedback on collections
- [play-verification.md](./play-verification.md) — accurate win/loss checks
