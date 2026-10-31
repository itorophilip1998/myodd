# Investor Mode system ticket — v0.2.23

Branch: `bug/0.2.23-investor-market-list`.

Investor Mode is a system-built betting option. The user chooses the match day or a date range. The model chooses the ticket count and games per ticket from the fixed market list below.

## Fixed band

The band is the existing shared policy (`MODE_ODDS` / `MODE_SELECTION_ODDS`):

- **3 tickets at 2 odds, 3 at 3 odds, and 4 at 4 odds.** A ticket is kept when its total is within 0.10 of that target. Tickets at 2 stay at 2.00 or above.
- Each selection **1.10–1.35**

Gambler selections use the same **1.35** ceiling. The Gambler ticket band stays 5.01–20.
- Risk preference **VERY_LOW**
- Up to **10** tickets
- Games per ticket chosen by the search so the combined odds stay inside the band

Prompt text, saved defaults, and crafted request fields do not narrow the band, add markets, or set the ticket or game count. A request that names another mode as its final mode is unchanged.

## Fixed markets

Investor search and Gambler search keep a selection only when its bookmaker market is one of these. Gambler Options lists the same markets. Japa and Lagoslife keep the previous Options list.

- Excluded Goals, Excluded Goals – Home, Excluded Goals – Away
- Total, Home, and Away goal kicks (Under/Over)
- Total, Home, and Away cards (Under/Over)
- Total, Home, and Away corners (Under/Over)
- Total, Home, and Away tackles (Under/Over)
- Total, Home, and Away goals (Under/Over)

Under 3, 3.5, 4, 4.5, 5, and 5.5 are left out of goal totals only. Over those lines, and the same Under lines on corners, cards, tackles, shots, and goal kicks, stay available.
- Double chance: 1X, X2, 12
- Home or Over 2.5, Draw or Over 2.5, and Away or Over 2.5
- Shots, shots on target, team shots, team shots on target (Under/Over)

Match result, both teams to score, half-time, handicaps, and other bookmaker markets are left out.

## How picks are chosen

Investor and Gambler rank excluded goals, team goals, match goals, double chance, Home or Over 2.5, Draw or Over 2.5, and Away or Over 2.5 from recent finished scores (the last 30 days of BBC results). A team is used only after at least five finished matches in that window. Each side’s recent goals scored and conceded, including home and away, set the expected goals. The search keeps the option the recent scores make more likely, still inside the odds band. A short price can still lose.

Corners, cards, shots, tackles, and goal kicks stay on the market list. The results feed has no totals for them, so those options are not selected. If recent scores are unavailable or the team names do not match, goal picks fall back to the bookmaker price and the result says so. Japa and Lagoslife keep the price ranking.

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
