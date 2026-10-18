# Feature: Predictions explorer

## Purpose

Rank upcoming pre-match outcomes for browsing (over/under, draws, corners, BTTS, DC, handicaps, cards, correct score, etc.) using the AI scoring path — not live betting tickets.

## Ownership

| Layer | Location |
|-------|----------|
| Web | `/predictions` |
| API | `explore` + `predictions` modules |
| AI | `POST /predictions` |
| Cache | Redis / `Prediction` rows |

## Behaviour

- Loads a bounded window of upcoming fixtures (hours ahead; kicked-off excluded).
- Optional market filter; detailed alternate markets fetched for a capped match set.
- Returns ranked outcomes (capped per match for the browser); compare-on-demand can fetch more lines.
- Shows model/version labels (odds-implied vs trained Poisson when configured).
- **Prediction book:** add one outcome per match to a session basket, **Submit book** → Create (`/?book=1`) with pinned picks; generate books those exact SportyBet outcomes (`pinnedSelections`).
- Full snapshots may be retained in the training journal.

## Related

- [generation.md](./generation.md) — ticket generation uses similar scoring internals
- [live.md](./live.md) — in-play browse (separate)
