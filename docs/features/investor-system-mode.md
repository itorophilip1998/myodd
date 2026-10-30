# Investor Mode system ticket — v0.2.23

Branch: `bug/0.2.23-investor-market-list`.

Investor Mode is a system-built betting option. The user chooses the match day or a date range. The model chooses the ticket count and games per ticket from the fixed market list below.

## Fixed band

The band is the existing shared policy (`MODE_ODDS` / `MODE_SELECTION_ODDS`):

- Combined ticket odds **2–5**
- Each selection **1.10–1.50**
- Risk preference **VERY_LOW**
- Up to **10** tickets
- Games per ticket chosen by the search so the combined odds stay inside the band

Prompt text, saved defaults, and crafted request fields do not narrow the band, add markets, or set the ticket or game count. A request that names another mode as its final mode is unchanged.

## Fixed markets

Investor search keeps a selection only when its bookmaker market is one of these. Gambler Options includes this same list, and still includes GG / NG. Japa and Lagoslife keep the previous Options list.

- Player to score: Yes/No
- Match result: Home Win (1), Draw (X), Away Win (2), 1X2
- Double chance: 1X, X2, 12
- Total goals: Over/Under 0.5, 1.5, 2.5, 3.5
- Half-time result, half-time draw, HT/FT combinations, win either half
- Leading by 3 goals in a row: Yes/No
- Corner totals, team corners
- Shot totals, shots on target
- Excluded number of goals
- Goal kicks

Both teams to score, cards, handicaps, and other bookmaker markets are left out. Lines outside 0.5–3.5 are left out of total goals. Corner, shot, and goal-kick markets are the total and team-total prices, including the lines the feed offers.

## Create form

On Investor Mode the Options control is hidden: tickets, games, odds, markets, split, strict markets, and nearest odds. The match-day control stays and accepts one day or a range. The prompt, voice input, and file attach stay as an optional note. Gambler, Japa, and Lagoslife keep Options.

A prediction book is still a pinned ticket. That path keeps the booked picks and is not the system Investor builder.

## No repeated pick

Inside one collection, a pick (event, market, outcome, and line) is used on at most one ticket. The same match may appear on another ticket only with a different option. Pinned original selections may be shared and are called out in the generation report. If the match day cannot fill the count without a repeat, the result is fewer tickets and the existing shortage notice.

## Where it is enforced

| Layer | Location |
|-------|----------|
| Web | `GenerateForm.tsx`, `ModeInfo.tsx`, Terms (`#mode-investor`) |
| API | `slips.service.ts` strips Investor overrides before the job and again before search |
| AI | `risk_modes.lock_investor_system`, `investor_markets.investor_market_allowed`, `generation.varied_candidates` |

No migration or new environment variable is required. Deployment is separate from this change.
