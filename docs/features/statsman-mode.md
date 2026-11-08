# Feature: Statsman engine

## Purpose

**Statsman** is the scoring engine for **Investor and Gambler only** (strict pick gates). Elo 1X2 + 21-day decayed attack/defence for goals, corners, shots, SOT, cards; Poisson exact/excluded goals. **Japa and Lagos Life** keep an open catalog (including 1X2) without Statsman gates. Tackles and goal kicks are removed from every mode.

**Coverage:** 17 European domestic CSVs with full match stats, plus UCL form, plus seven extra `/new/` leagues (Denmark Superliga, Allsvenskan, Eliteserien, MLS, Brazil Serie A, Ekstraklasa, Romania Superliga) with **goals-only** history — corners/shots/cards fall back to priors there.

## Pick gates (Investor / Gambler)

| Source signal | Ticket market |
| --- | --- |
| Goals / BTTS / double chance confidence ≥ **76%** | That Over/Under, BTTS, or DC line |
| Side 1X2 in **58–65%** | That team’s **Over 0.5**, or **opponent Clean Sheet No** |
| Side 1X2 ≥ **70%** | That team’s **Over 1.5** |
| Side 1X2 ≥ **80%** | That side’s Sporty **2UP** (to win / early payout) — not plain 1X2 |
| Side 1X2 ≥ **66%** **and** 1·over map ≥ **70%** | That side’s **1 / Over 2.5** or **2 / Over 2.5** |
| Side 1X2 ≥ **66%** | That side’s **win either half** |
| Corners / shots / SOT / cards ≥ **76%** | That Over/Under line |
| Match shots soft **O20.5** / SOT soft **O7.5** map ≥ **85%** | Sporty Over up to **+3** (e.g. O21.5–O23.5) when soft line is missing |
| Exact / excluded goals ≥ **42%** (low search priority) | That exact integer line |

Raw 1X2 is never ticketed on Investor/Gambler. Uncovered leagues/teams are skipped.

## Ownership

| Layer | Location |
| --- | --- |
| Engine | `apps/ai/app/llms/statsman.py` |
| Pick filter | `apps/ai/app/tools/statsman_picks.py` (`STATSMAN_ENGINE_MODES` = Investor, Gambler) |
| Data | `STATSMAN_DATA_DIR` (season CSVs via `scripts/sync-statsman-data.sh`) |

## Config

```env
PREDICTION_MODEL=statsman
STATSMAN_DATA_DIR=./data/statsman
```

## Related

- [investor-system-mode.md](./investor-system-mode.md)
