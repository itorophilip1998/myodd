# Feature: Statsman Mode

## Purpose

Use the **Statsman** shop engine (Elo 1X2 + 21-day decayed attack/defence for goals, corners, shots, SOT) as the scoring model for ticket generation, with hard confidence gates.

## Pick gates

| Source signal | Ticket market |
| --- | --- |
| Goals / BTTS confidence ≥ **76%** | That Over/Under or BTTS line |
| Side 1X2 in **58–65%** | That team **to score** |
| Side 1X2 ≥ **66%** | That side’s **1 / Over 2.5** or **win either half** |
| Corners / shots / SOT confidence ≥ **76%** | That Over/Under line |

Raw 1X2 is never ticketed. Uncovered leagues/teams (no football-data history) are skipped.

## Ownership

| Layer | Location |
| --- | --- |
| Engine | `apps/ai/app/llms/statsman.py` |
| Pick filter | `apps/ai/app/tools/statsman_picks.py` |
| Agent / route | `POST /generate/statsman` · `StatsmanAgent` |
| Web | Generate form → Statsman Mode |
| Data | `STATSMAN_DATA_DIR` (season CSVs via `scripts/sync-statsman-data.sh`) |

## Config

```env
PREDICTION_MODEL=statsman
STATSMAN_DATA_DIR=./data/statsman   # or /data/statsman in Compose
```

Ticket odds band matches Investor (**3–6**, legs **1.10–1.35**, mixed targets near 3/4/5/6).

## Sync train files

```sh
./scripts/sync-statsman-data.sh
# optional: STATSMAN_SEASON=2627 STATSMAN_DATA_DIR=/data/statsman ./scripts/sync-statsman-data.sh
```

## Related

- [ai-agents.md](./ai-agents.md) — agent registry
- [investor-system-mode.md](./investor-system-mode.md) — Investor/Gambler exclusive list (unchanged)
