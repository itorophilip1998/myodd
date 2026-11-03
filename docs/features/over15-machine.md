# Feature: Over 1.5 Machine

## Purpose

Vedic Lahiri whole-sign chart at kickoff for the home ground. Only **Aries rising** games are eligible. Prefer **Over 1.5**; if that price is under **1.11**, take **Over 2.5** instead. Builds **5 tickets** near combined odds **3.0**; if that band cannot be filled, near **2.0** is fine (overall band **1.90–3.15**). Each leg **1.10–1.25**.

Aries lagna is only open for roughly two hours a day at a given ground, so a single match day rarely fills the plan. Choosing the mode on Create defaults the match window to **this week**; shortages still save whatever tickets the Aries pool can support.

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
