"""GGSP v1.1 ticket gates — CLEAN Chaldean 7–8, HARD/SOFT league skips.

Over path (combined ticket odds 3–4):
  - If Over 1.5 is priced 1.09–1.12 → book Asian Over 2 (`total=2`) instead.
  - If Over 1.5 is priced 1.13–1.35 → book Over 1.5.
"""
from __future__ import annotations

import re

from app.llms.ggsp import classify_combo, is_clean_select
from app.schemas import Market, ScoredSelection

MAX_LEG_ODDS = 1.30
MIN_LEG_ODDS = 1.10
O15_LIST_MIN = 1.09  # keep cheap O1.5 so we can switch to Asian Over 2
O15_ASIAN_MIN = 1.09
O15_ASIAN_MAX = 1.12
O15_DIRECT_MIN = 1.13
ASIAN_LINE = 2.0
ASIAN_LEG_MIN = 1.10


def _line(specifier: str, name: str) -> float | None:
    for part in (specifier or '').split('|'):
        if part.startswith('total='):
            try:
                return float(part.split('=', 1)[1])
            except ValueError:
                return None
    match = re.search(r'(\d+(?:\.\d+)?)', name or '')
    return float(match.group(1)) if match else None


def _is_over(outcome_name: str, outcome_id: str) -> bool:
    name = (outcome_name or '').casefold()
    return outcome_id in ('12', 'over') or name.startswith('over')


def _price(odds: float) -> float:
    return round(float(odds), 2)


def is_goals_over_line(selection: ScoredSelection, line: float) -> bool:
    if not _is_over(selection.selectionName, selection.outcomeId):
        return False
    name = (selection.marketName or '').casefold()
    if re.search(r'corner|shot|card|kick|tackle|half|home|away|competitor', name):
        return False
    if selection.supportedMarket == Market.OVER_1_5 and abs(line - 1.5) < 1e-6:
        return True
    got = _line(selection.specifier, selection.selectionName)
    return got is not None and abs(got - line) < 1e-6 and (
        'over/under' in name or 'total' in name or selection.marketId == '18'
    )


def is_goals_over_15(selection: ScoredSelection) -> bool:
    return is_goals_over_line(selection, 1.5)


def in_asian_window(o15_odds: float) -> bool:
    price = _price(o15_odds)
    return O15_ASIAN_MIN <= price <= O15_ASIAN_MAX


def ggsp_market_allowed(market_id: str, market_name: str, specifier: str, outcome_name: str, odds: float) -> bool:
    if not (outcome_name or '').casefold().startswith('over'):
        return False
    name = (market_name or '').casefold()
    if re.search(r'corner|shot|card|kick|tackle|half|home|away|competitor|1x2', name):
        return False
    line = _line(specifier, outcome_name)
    if line is None:
        return False
    price = _price(odds)
    if abs(line - 1.5) < 1e-6:
        # Keep 1.09–1.12 so the filter can switch that event to Asian Over 2.
        return O15_LIST_MIN <= price <= MAX_LEG_ODDS
    if abs(line - ASIAN_LINE) < 1e-6:
        return price >= ASIAN_LEG_MIN and price <= MAX_LEG_ODDS
    return False


# Prefer ~1.25 legs so a 3–4 ticket needs ~4–5 unique games instead of 7–10 ultra-shorts.
SWEET_LEG_ODDS = 1.25
# Below this CLEAN count, also admit SOFT-skip leagues so the unique-match plan can fill.
THIN_CLEAN_SOFT = 36


def apply_ggsp_ticket_filter(
    pool: list[ScoredSelection],
    *,
    allow_soft: bool | None = None,
) -> list[ScoredSelection]:
    """Keep one Over pick per CLEAN fixture (O1.5 or Asian Over 2 on cheap O1.5).

    When `allow_soft` is None (default), run HARD-only first; if the CLEAN pool is still
    thinner than THIN_CLEAN_SOFT, retry including SOFT leagues.
    """
    if allow_soft is None:
        hard = _filter_ggsp(pool, allow_soft=False)
        if len(hard) >= THIN_CLEAN_SOFT:
            return hard
        soft = _filter_ggsp(pool, allow_soft=True)
        return soft if len(soft) > len(hard) else hard
    return _filter_ggsp(pool, allow_soft=allow_soft)


def _filter_ggsp(pool: list[ScoredSelection], *, allow_soft: bool) -> list[ScoredSelection]:
    by_event: dict[str, list[ScoredSelection]] = {}
    for selection in pool:
        by_event.setdefault(selection.eventId, []).append(selection)

    kept: list[ScoredSelection] = []
    for selections in by_event.values():
        sample = selections[0]
        # SportyBet: categoryName ≈ country, league ≈ tournament — same blob as FS country+competition.
        if not is_clean_select(
            sample.homeTeam,
            sample.awayTeam,
            sample.league or '',
            category=getattr(sample, 'categoryName', '') or '',
            allow_soft=allow_soft,
        ):
            continue
        o15 = next((s for s in selections if is_goals_over_line(s, 1.5)), None)
        o20 = next((s for s in selections if is_goals_over_line(s, ASIAN_LINE)), None)
        if o15 is None:
            continue
        o15_price = _price(o15.odds)
        pick: ScoredSelection | None = None
        if in_asian_window(o15_price):
            if o20 is not None and ASIAN_LEG_MIN <= _price(o20.odds) <= MAX_LEG_ODDS:
                pick = o20
            else:
                continue  # cheap O1.5 but no Asian Over 2 in band — skip event
        elif O15_DIRECT_MIN <= o15_price <= MAX_LEG_ODDS:
            pick = o15
        else:
            continue
        if pick is None:
            continue
        tot, root, tier = classify_combo(sample.homeTeam, sample.awayTeam)
        # Mid-band legs (~1.25) fill more unique-match tickets than ultra-short favourites.
        league_blob = f'{getattr(sample, "categoryName", "") or ""} {sample.league or ""}'.casefold()
        uefa = bool(re.search(r'europa|conference|uefa', league_blob))
        odds_fit = max(0.0, 14.0 - abs(pick.odds - SWEET_LEG_ODDS) * 70)
        confidence = min(
            92.0,
            68.0 + (8 - abs(root - 7.5)) * 4 + odds_fit + (3.5 if uefa else 0.0),
        )
        line_tag = 'asian2' if abs((_line(pick.specifier, pick.selectionName) or 0) - ASIAN_LINE) < 1e-6 else 'o15'
        soft_tag = '-soft' if allow_soft else ''
        kept.append(pick.model_copy(update={
            'probability': round(min(0.92, confidence / 100), 6),
            'confidence': round(confidence, 2),
            'modelVersion': f'ggsp-v1.1-{line_tag}{soft_tag}-r{root}-t{tot}-{tier.lower()}',
        }))
    return kept
