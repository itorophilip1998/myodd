# Investor and Gambler system tickets

Investor and Gambler use the same exclusive 19-market list for Create. Users choose a match day or date range; the system chooses markets, games per ticket and up to 10 tickets. Options are hidden for both modes. Typed, saved and crafted request options cannot replace the internal plan. Pinned prediction books and explicit ticket splitting retain their original-pick workflows.

## Odds distribution

- Investor: **3–6** combined odds. Targets: **3 tickets near 3, 3 near 4, 2 near 5, and 2 near 6**.
- Gambler: **6.1–20** combined odds. Ten evenly spaced targets: **6.10, 7.64, 9.19, 10.73, 12.28, 13.82, 15.37, 16.91, 18.46, 20.00**.
- Each leg remains **1.10–1.35**. Games per ticket are chosen internally to reach each target.

A target window is at most ±0.10 and is clipped to the mode band: a ticket near 3 cannot fall below 3, and a ticket near 6 cannot exceed 6. Actual totals are products of available bookmaker prices; exact integer totals cannot be guaranteed. Each target is searched separately, so probability ranking cannot collapse the collection to the lowest odds. Missing targets are reported, without filling those slots with minimum-odds tickets or out-of-band tickets.

## Exclusive markets

| # | SportyBet market | Betting options |
| --- | --- | --- |
| 1 | Excluded Goals | Exact number of goals to exclude |
| 2 | Excluded Goals – Home | Exact home-team goals to exclude |
| 3 | Excluded Goals – Away | Exact away-team goals to exclude |
| 4 | Total Goal Kicks | Under / Over |
| 5 | Home Team Goal Kicks | Under / Over |
| 6 | Away Team Goal Kicks | Under / Over |
| 7 | Total Cards | Under / Over |
| 8 | Home Team Cards | Under / Over |
| 9 | Away Team Cards | Under / Over |
| 10 | Total Corners | Under / Over |
| 11 | Home Team Corners | Under / Over |
| 12 | Away Team Corners | Under / Over |
| 13 | Total Tackles | Under / Over |
| 14 | Home Team Tackles | Under / Over |
| 15 | Away Team Tackles | Under / Over |
| 16 | Total Goals | Under / Over |
| 17 | Home Team Goals | Under / Over |
| 18 | Away Team Goals | Under / Over |
| 19 | Double Chance | 1X / X2 / 12 |

Both `prompt/investor.txt` and `prompt/gambler.txt` contain this complete list. Runtime filters enforce it independently of provider output. Shots, result-or-total combinations, match result, BTTS, half-time and other markets are excluded. Under and Over lines are eligible for the listed total markets.

Recent finished-score history ranks supported goal and double-chance markets. When the history cannot assess an approved market, it retains its bookmaker-implied estimate and actual model version. No corner/card/tackle/goal-kick statistics are inferred from full-time goals. Picks still require active future fixtures, valid provider selections, the leg-odds band and applicable date/team/league filters.

The same pick (event, market, outcome, line) is used at most once in a collection. A fixture may recur with a different option. Insufficient eligible selections can reduce the ticket count.

## Enforcement

- Web: `GenerateForm.tsx`, `ModeInfo.tsx`, Terms and the shared mode/market registries.
- API: `slips.service.ts` strips overrides before queuing and reapplies internal settings before search.
- AI: `tools/risk_modes.py`, `tools/investor_markets.py`, `tools/search.py`, `tools/generation.py`, and the separate mode prompts.

No migration or new environment variable is required.
