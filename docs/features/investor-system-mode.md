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

## Direct generation and daily coverage — v0.2.27

Investor and Gambler Create requests build their fixed configuration locally. They bypass the instruction LLM, catalog interpretation, saved form defaults and dynamic market resolution. Notes are retained with the request; the date picker or supported local match-day phrases choose the time window. Japa, Lagos Life, prediction books and split workflows retain their existing paths. The actual numerical scoring models and accepted calibration layer still rank selections. Investor remains the recommended default because of its lower 3–6 combined-odds band.

Daily loading requests the provided 19-option SportyBet IDs (Double Chance, total/team goals, excluded goals, cards, corners, tackles and goal kicks, including known home/away aliases) and paginates in bounded parallel groups through up to **50 pages / 5,000 games**. Only future games inside the selected window remain eligible. The loader does **not** open individual match boards to hunt extra options. Games without a listed approved option are skipped. This replaces the old 128-game full-board enrichment.

Every listed market is immediately matched against the supplied 19-market list and the 1.10–1.35 leg band. Unsupported options are removed before scoring; no model invents a new betting option or browses the catalog for alternatives. Coverage records include listed games, day games, leagues, games with approved options and unavailable pages. Partial or capped listings are disclosed. An unavailable feed is not reported as a complete empty day.

Investor and Gambler share a short-lived, bounded daily snapshot and concurrent requests share in-flight loading. Cached snapshots are filtered against the current time again before use. Live/started fixtures never become selectable merely because they were cached. The current provider rate/concurrency controls and fresh pre-booking availability/price checks remain in place.

Recent-score history refreshes in the background, once per worker at a time. Requests immediately use fresh cached history or explicitly tagged bookmaker-based estimates when history is unavailable; they do not wait for 30 history pages. Learning still records the actual numerical source/version used by each prediction.

Combination search skips impossible price/leg-count bounds, avoids serializing rejected tickets, and stops an individual target search once it has a sufficiently sampled set of valid, disjoint candidates. Difficult targets retain their bounded search budget and shortage reporting. Mixed odds, the exact market list, no repeated picks, and final bookmaker checks are preserved.

A reproducible local synthetic benchmark (150 games, five prices per game, seeded search) produced ten tickets at all requested targets: Investor **7.013s → 0.215s**, Gambler **21.573s → 0.866s**. This measures combination search only, not live network latency or predictive accuracy. Investor remains the recommended default because of its lower 3–6 combined-odds band; neither mode is claimed to guarantee winning outcomes.

Implementation: `slips/system-config.ts`, `slips/system-fixtures.ts`, shared `system-markets.ts`, provider filtering, and Python `tools/search.py` / `tools/results.py`.
