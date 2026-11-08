# Investor and Gambler system tickets

Investor and Gambler share the exclusive market list **plus Statsman ticket markets** (BTTS, shots, team Over 0.5, clean sheet, 1/over 2.5, win either half). **Tackles and goal kicks are removed.** Users choose a match day or date range; the system chooses markets, games per ticket and up to 10 tickets. **Scoring and pick gates use the Statsman engine (strict)**; each mode keeps its own odds band and ticket plan. Japa and Lagos Life keep an open catalog (including 1X2) without Statsman gates. Options are hidden for Investor/Gambler. Typed, saved and crafted request options cannot replace the internal plan. Pinned prediction books and explicit ticket splitting retain their original-pick workflows.

## Odds distribution

- Investor: **3–6** combined odds. Targets: **3 tickets near 3, 3 near 4, 2 near 5, and 2 near 6**.
- Gambler: **6.1–20** combined odds. Ten evenly spaced targets: **6.10, 7.64, 9.19, 10.73, 12.28, 13.82, 15.37, 16.91, 18.46, 20.00**.
- Each leg remains **1.10–1.35**, except corners, shots / SOT, and 1·over / 2·over (Home/Away or Over 2.5) which may be up to **1.45**. Games per ticket are chosen internally to reach each target.

A target window is at most ±0.10 and is clipped to the mode band: a ticket near 3 cannot fall below 3, and a ticket near 6 cannot exceed 6. Actual totals are products of available bookmaker prices; exact integer totals cannot be guaranteed. Each target is searched separately, so probability ranking cannot collapse the collection to the lowest odds. Missing targets are reported, without filling those slots with minimum-odds tickets or out-of-band tickets.

## Exclusive markets

| # | SportyBet market | Betting options |
| --- | --- | --- |
| 1 | Excluded Goals | Exact number of goals to exclude |
| 2 | Excluded Goals – Home | Exact home-team goals to exclude |
| 3 | Excluded Goals – Away | Exact away-team goals to exclude |
| 4 | Total Cards | Under / Over |
| 5 | Home Team Cards | Under / Over |
| 6 | Away Team Cards | Under / Over |
| 7 | Total Corners | Under / Over |
| 8 | Home Team Corners | Under / Over |
| 9 | Away Team Corners | Under / Over |
| 10 | Total Goals | Under / Over |
| 11 | Home Team Goals | Under / Over |
| 12 | Away Team Goals | Under / Over |
| 13 | Double Chance | 1X / X2 / 12 |

Both prompts contain this list. Runtime also admits Statsman markets (BTTS, shots, team Over 0.5, clean sheet, 1/over, either half). **Tackles and goal kicks are never ticketed.**

**Statsman** ranks every eligible market (Elo + decayed A/D; cards from yellows/reds). Gates: goals/DC ≥76%, count markets ≥76%, exact/excluded ≥42%, side 58–65% → team O0.5 / opponent CS No, side ≥70% → team O1.5, side ≥80% → Sporty 2UP (not plain 1X2), side ≥66% → 1/over (map ≥70%) or either half. Uncovered fixtures are skipped.

The same pick (event, market, outcome, line) is used at most once in a collection. A fixture may recur with a different option. Insufficient eligible selections can reduce the ticket count.

## Enforcement

- Web: `GenerateForm.tsx`, `ModeInfo.tsx`, Terms and the shared mode/market registries.
- API: `slips.service.ts` strips overrides before queuing and reapplies internal settings before search.
- AI: `tools/risk_modes.py`, `tools/investor_markets.py`, `tools/search.py`, `tools/generation.py`, and the separate mode prompts.

No migration or new environment variable is required.

## Direct generation and daily coverage — v0.2.27

Investor and Gambler Create requests build their fixed configuration locally. They bypass the instruction LLM, catalog interpretation, saved form defaults and dynamic market resolution. Notes are retained with the request; the date picker or supported local match-day phrases choose the time window. Japa, Lagos Life, prediction books and split workflows retain their existing paths. The actual numerical scoring models and accepted calibration layer still rank selections. Investor remains the recommended default because of its lower 3–6 combined-odds band.

Daily loading requests the exclusive SportyBet IDs (Double Chance, total/team goals, excluded goals, cards, corners, plus Statsman extras) and paginates in bounded parallel groups through up to **50 pages / 5,000 games**. Only future games inside the selected window remain eligible. The loader does **not** open individual match boards to hunt extra options. Games without a listed approved option are skipped.

Every listed market is matched against the approved list and the leg band (1.10–1.35 default; corners / shots / 1·over / 2·over ≤1.45). Unsupported options are removed before scoring. Coverage records include listed games, day games, leagues, games with approved options and unavailable pages.

Investor and Gambler share a short-lived, bounded daily snapshot and concurrent requests share in-flight loading. Cached snapshots are filtered against the current time again before use. Live/started fixtures never become selectable merely because they were cached. The current provider rate/concurrency controls and fresh pre-booking availability/price checks remain in place.

Recent-score history refreshes in the background, once per worker at a time. Requests immediately use fresh cached history or explicitly tagged bookmaker-based estimates when history is unavailable; they do not wait for 30 history pages. Learning still records the actual numerical source/version used by each prediction.

Combination search skips impossible price/leg-count bounds, avoids serializing rejected tickets, and stops an individual target search once it has a sufficiently sampled set of valid, disjoint candidates. Difficult targets retain their bounded search budget and shortage reporting. Mixed odds, the exact market list, no repeated picks, and final bookmaker checks are preserved.

A reproducible local synthetic benchmark (150 games, five prices per game, seeded search) produced ten tickets at all requested targets: Investor **7.013s → 0.215s**, Gambler **21.573s → 0.866s**. This measures combination search only, not live network latency or predictive accuracy. Investor remains the recommended default because of its lower 3–6 combined-odds band; neither mode is claimed to guarantee winning outcomes.

Implementation: `slips/system-config.ts`, `slips/system-fixtures.ts`, shared `system-markets.ts`, provider filtering, and Python `tools/search.py` / `tools/results.py`.
