# Feature: Over 1.5 Machine

## Purpose

Vedic Lahiri whole-sign chart at kickoff for the home ground. Only **Aries rising** games are eligible. Prefer **Over 1.5**; if that price is under **1.11**, take **Over 2.5** instead. Builds up to **10 tickets** at combined odds **4–6**. Each leg **1.10–1.25**.

## Match day

Defaults to **this week** (today through +6 Lagos days). The Create match-day control can narrow or widen the window. Aries lagna is only open for roughly two hours a day at a given ground, so a short window may return fewer than five tickets.

## Ticket rules

- Combined odds **4–6**
- Same fixture (home/away) appears on **at most one ticket** in a single generation
- One Over line per match (O1.5, or O2.5 when O1.5 &lt; 1.11)

Placed on Create **before Investor Mode**.

## Ownership

| Layer | Location |
| --- | --- |
| Chart | `apps/ai/app/llms/vedic_o15.py` (`pyswisseph`, Lahiri, whole-sign) |
| Pick filter | `apps/ai/app/tools/over15_picks.py` |
| Agent / route | `POST /generate/over15-machine` · `Over15MachineAgent` |
| Web | Generate form → Over 1.5 Machine |
| Shared policy | `MODE_ODDS.OVER15_MACHINE`, `OVER15_LISTING_MARKET_IDS` |

## Config

```env
OVER15_RISING_SIGN=Aries   # default
```

Unknown stadiums use a deterministic lat/lon hash from the home team name so casts stay prematch-only.

## Related

- [generation.md](./generation.md) — named modes
- [investor-system-mode.md](./investor-system-mode.md) — Investor/Gambler (unchanged)
