# Investor Mode system ticket — v0.2.19

Branch: `bug/0.2.19-investor-system-mode`.

Investor Mode is a system-built betting option. The user chooses the match day or a date range. The model chooses the markets, ticket count, and games per ticket.

## Fixed band

The band is the existing shared policy (`MODE_ODDS` / `MODE_SELECTION_ODDS`):

- Combined ticket odds **2–5**
- Each selection **1.10–1.50**
- Risk preference **VERY_LOW**
- Up to **10** tickets
- Games per ticket chosen by the search so the combined odds stay inside the band

Prompt text, saved defaults, and crafted request fields do not narrow the band, pick markets, or set the ticket or game count. A request that names another mode as its final mode is unchanged.

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
| AI | `risk_modes.lock_investor_system`, `generation.varied_candidates` |

No migration or new environment variable is required. Deployment is separate from this change.
