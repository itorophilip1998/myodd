# Feature: Goals Desk v2

## Purpose

Ticket the dualman **goals desk v2** books (Zi Wei / Omikuji / Lenormand / Desk) against SportyBet goal totals.

**Flashscore first:** the day board is loaded from Flashscore and desk-cast on Flashscore team names; SportyBet is matched afterward for Over markets (`apps/ai/app/tools/fs_sporty_bridge.py`).

## Pick gates

| Signal | Market | Odds |
| --- | --- | --- |
| **≥3 of 4 Yes** on O1.5 **and** Zi Wei + Omikuji + Lenormand Yes on O2.5 (pace), not Omikuji **吉**, O1.5 priced **1.09–1.13** | Asian Over 2 (`total=2`) — **same O1.5 ticket lane** | Asian leg ≥ 1.10 |
| Same vote/pace gates, O1.5 priced **1.14–1.27** | Over 1.5 | **1.14–1.27** |
| **All 4 Yes** on O2.5, not Omikuji **吉** | Over 2.5 | **1.10–1.60** |

**Pace confirm + skip 吉:** Tue/Wed 3–4 Nov autopsy — plain O1.5 YYYY died on 0–0 / 0–1 games. Pace is **ZW + Omikuji + Lenormand Yes on O2.5** (same as the Flashscore canvas). Omikuji O2.5 is lot-locked (凶/大凶 → Pass), so pace only clears on lots that can Yes O2.5 (e.g. 中吉 / 末吉). Skipping Omikuji **吉** (weakest lot both days) stays.

Prefer the O1.5 path (including the Asian Over 2 switch) over O2.5 on the same match. One pick per match. All-4 O1.5 picks rank ahead of 3-of-4 within the same lane.

## Ticket construction

| Ticket lane | Legs allowed | Combined odds | Rule |
| --- | --- | --- | --- |
| Over 1.5 lane | Over 1.5 **and/or** Asian Over 2 | **3–5** | Never mixed with O2.5 |
| Over 2.5 lane | Over 2.5 only | **4–6** | Never mixed with O1.5 lane |

Fill order: Over 1.5 lane → Over 2.5 lane. Up to **10 tickets**. Overall mode band **3–6**.

## Match day

Defaults to **that calendar day** (Lagos date). The Create match-day control can narrow or widen to another day or a date range; the API loads only fixtures in that kickoff window. When a **single day** has fewer than ~20 games with options, generation automatically extends through the **next day**, then the **next two days**, so there is enough slate for up to 10 tickets.

## Ownership

| Layer | Location |
| --- | --- |
| Cast / desk | `apps/ai/app/llms/goals_desk_v2.py` |
| Pick filter | `apps/ai/app/tools/goals_desk_picks.py` |
| Lane search | `apps/ai/app/tools/search.py` → `search_goals_desk_plan` |
| Agent / route | `POST /generate/goals-desk-v2` · `GoalsDeskV2Agent` |
| Web | Generate form → Goals Desk v2 |
| Shared policy | `MODE_ODDS.GOALS_DESK_V2`, `GOALS_DESK_LISTING_MARKET_IDS` |

## Related

- [generation.md](./generation.md) — named modes
- [over15-machine.md](./over15-machine.md) — sibling O1.5 card (Vedic Aries)
