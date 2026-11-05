# Feature: GGSP v1.1

## Purpose

**Gematria Goal Signature Protocol** — Chaldean digital-root filter on combined team names for **Over 1.5**.

- **Flashscore first:** load the Flashscore day board, grade CLEAN on Flashscore spellings, then match SportyBet markets onto that board (`apps/ai/app/tools/fs_sporty_bridge.py`). Games CLEAN on Flashscore but absent from SportyBet are reported as misses — they cannot be booked.
- **CLEAN Select:** roots **7–8** and tot ∉ {54,62}
- **v1.1:** HARD (+ SOFT) league exemption map
- **Names:** SportyBet → Flashscore aliases before the cipher (`apps/ai/app/llms/ggsp_aliases.py`); matched Flashscore rows overwrite SportyBet labels before the cipher
- **Cheap O1.5 (1.09–1.12):** book **Asian Over 2** (`total=2`) instead of Over 1.5
- Tickets at combined odds **3–4**
- Same fixture never repeats across tickets in one generation
- Match day defaults to **today**; date filter / range still works

## League gate input

SportyBet exposes **categoryName** (country) and **league** (tournament). The gate matches
`f"{categoryName} {league}"` — same blob as football-simulator `country + competition`.
Both fields must be threaded Fixture → ScoredSelection or country-dependent HARD skips
(Uganda PL, Saudi Div 2, Montenegro, …) will miss.

## Flashscore name parity

The research lock grades Flashscore spellings. When SportyBet shortens or translates a club
(`Thun` vs `FC Thun`, `Hearts` vs `Heart Of Midlothian`, `Pafos` vs `Paphos`), add a row to
`TEAM_ALIASES` so both sides cipher the same. Unknown names still use the raw SportyBet
label — if a CLEAN Flashscore fixture is missing in myodd, that is the usual cause.

## Why you often see only ~2 tickets

GGSP **never reuses a fixture** across tickets. A combined **~3.0** slip needs about **4–6**
CLEAN O1.5/Asian-O2 legs. A typical single day only grades **~10–15 CLEAN** after the cipher —
that is enough for **~2 tickets**, not 10. This is capacity, not a broken planner.

Mitigations in product:
- Prefer mid-band legs (~**1.25**) so each ticket burns fewer games
- Thin single days auto-extend **+1 / +2** calendar days (like Goals Desk)
- If HARD-only CLEAN &lt; 36, SOFT-skip leagues are admitted to thicken the pool
- Notices report CLEAN pool size when fill is short of 10

Still true: most UEFA ties are not CLEAN; O1.5 under **1.09** never enters; **1.09–1.12**
needs Asian Over 2 ≥1.10 or the event is skipped.

## Ownership

| Layer | Location |
| --- | --- |
| Cipher + league gate | `apps/ai/app/llms/ggsp.py` |
| Pick filter | `apps/ai/app/tools/ggsp_picks.py` |
| Agent / route | `POST /generate/ggsp-v11` · `GgspV11Agent` |
| Web | Generate form → GGSP v1.1 |
| Shared policy | `MODE_ODDS.GGSP_V11` (3–4), legs 1.10–1.30 |

## Related

- [generation.md](./generation.md) — named modes
- football-simulator `sim/ggsp/protocol.py` — research lock for the cipher / league map
