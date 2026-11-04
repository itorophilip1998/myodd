"""Goals desk v2 ticket gates.

O1.5 lane: at least 3 of ZW / OMI / LEN / Desk say Yes (all 4 ranks higher),
  plus an O2.5 pace confirm (Zi Wei + Omikuji + Lenormand Yes on O2.5). Soft-avoid Omikuji 吉.
O2.5 lane: all 4 must say Yes; soft-avoid Omikuji 吉.

Pace matches the Tue/Wed autopsy + Flashscore canvas: ZW+OMI+LEN Yes on O2.5
cuts thin 0–0 / 0–1 O1.5 books. (Omikuji O2.5 is lot-locked — 凶/大凶 Pass — so
pace only clears when the lot can say Yes on O2.5, e.g. 中吉 / 末吉.)

Over 1.5 path (same ticket lane, combined odds 3–5):
  - If Over 1.5 is priced 1.09–1.13 → book Asian Over 2 instead.
  - If Over 1.5 is priced above 1.13 up to 1.27 → book Over 1.5.
Over 2.5 path (separate ticket lane, combined odds 4–6):
  - Take when priced 1.10–1.60 and all 4 Yes.

Never mix the O1.5 lane (O1.5 + Asian O2) with Over 2.5 on the same ticket.
One pick per match. Prefer the O1.5 path over O2.5.
"""
from __future__ import annotations

import re

from app.llms.goals_desk_v2 import (
    all4_yes,
    at_least_n_yes,
    cast_desk,
    desk_yes_count,
    goals_desk_probability,
)
from app.schemas import Market, ScoredSelection

O15_LIST_MIN = 1.09  # keep cheap O1.5 so we can switch to Asian Over 2
O15_MAX = 1.27
O15_ASIAN_MIN = 1.09
O15_ASIAN_MAX = 1.13
O15_DIRECT_MIN = 1.14  # above the Asian window → take Over 1.5 as-is
O25_MIN = 1.10
O25_MAX = 1.60
ASIAN_LINE = 2.0
ASIAN_LEG_MIN = 1.10
O15_MIN_YES = 3
# Wed 4 Nov autopsy: lot 吉 was the weakest Omikuji bucket on O1.5/O2.5 YYYY books.
WEAK_OMI_LOTS = frozenset({'吉'})


def o25_pace_confirm(book_o25: dict) -> bool:
    """Zi Wei + Omikuji + Lenormand Yes on O2.5 — filters thin O1.5 books that die 0–0 / 0–1."""
    return (
        book_o25.get('zw') == 'Yes'
        and book_o25.get('omi') == 'Yes'
        and book_o25.get('len') == 'Yes'
    )


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


def is_goals_total_over(selection: ScoredSelection, line: float) -> bool:
    if not _is_over(selection.selectionName, selection.outcomeId):
        return False
    name = (selection.marketName or '').casefold()
    if re.search(r'corner|shot|card|kick|tackle|half|home|away|competitor', name):
        return False
    if selection.supportedMarket == Market.OVER_1_5 and abs(line - 1.5) < 1e-6:
        return True
    if selection.supportedMarket == Market.OVER_2_5 and abs(line - 2.5) < 1e-6:
        return True
    got = _line(selection.specifier, selection.selectionName)
    return got is not None and abs(got - line) < 1e-6 and (
        'over/under' in name or 'total' in name or selection.marketId == '18'
    )


def _price(odds: float) -> float:
    return round(float(odds), 2)


def in_asian_window(o15_odds: float) -> bool:
    price = _price(o15_odds)
    return O15_ASIAN_MIN <= price <= O15_ASIAN_MAX


def goals_desk_market_allowed(market_id: str, market_name: str, specifier: str, outcome_name: str, odds: float) -> bool:
    if not (outcome_name or '').casefold().startswith('over'):
        return False
    name = (market_name or '').casefold()
    if re.search(r'corner|shot|card|kick|tackle|half|home|away|competitor|1x2|player|handicap', name):
        return False
    line = _line(specifier, outcome_name)
    if line is None:
        return False
    price = _price(odds)
    if abs(line - 1.5) < 1e-6:
        # Keep 1.09–1.13 so the filter can switch that event to Asian Over 2.
        return O15_LIST_MIN <= price <= O15_MAX
    if abs(line - ASIAN_LINE) < 1e-6:
        return price >= ASIAN_LEG_MIN
    if abs(line - 2.5) < 1e-6:
        return O25_MIN <= price <= O25_MAX
    return False


def _stamp(pick: ScoredSelection, line: float, lot: str, yes_count: int, *, paced: bool = False) -> ScoredSelection:
    prob = goals_desk_probability(line, yes_count)
    if paced and abs(line - 2.5) > 1e-6:
        prob = min(0.92, prob + 0.04)
    tag = 'all4' if yes_count >= 4 else f'{yes_count}of4'
    pace = '-pace' if paced else ''
    return pick.model_copy(update={
        'probability': round(prob, 6),
        'confidence': round(prob * 100, 2),
        'modelVersion': f'goals-desk-v2-{tag}{pace}-{lot}',
    })


def apply_goals_desk_ticket_filter(pool: list[ScoredSelection]) -> list[ScoredSelection]:
    by_event: dict[str, list[ScoredSelection]] = {}
    for selection in pool:
        by_event.setdefault(selection.eventId, []).append(selection)

    kept: list[ScoredSelection] = []
    for selections in by_event.values():
        sample = selections[0]
        desk = cast_desk(sample.homeTeam, sample.awayTeam, sample.kickoffAt)
        o15 = next((s for s in selections if is_goals_total_over(s, 1.5)), None)
        o20 = next((s for s in selections if is_goals_total_over(s, ASIAN_LINE)), None)
        o25 = next((s for s in selections if is_goals_total_over(s, 2.5)), None)
        paced = o25_pace_confirm(desk.o25)
        weak_lot = desk.lot in WEAK_OMI_LOTS

        o15_yes = desk_yes_count(desk.o15)
        took_o15 = False
        # O1.5 needs vote gate + ZW/OMI/LEN O2.5 pace; skip soft Omikuji 吉.
        if at_least_n_yes(desk.o15, O15_MIN_YES) and o15 is not None and paced and not weak_lot:
            price = _price(o15.odds)
            if in_asian_window(price):
                # Cheap O1.5 (1.09–1.13) → Asian Over 2, still on the O1.5 ticket lane.
                if o20 is not None and _price(o20.odds) >= ASIAN_LEG_MIN:
                    kept.append(_stamp(o20, ASIAN_LINE, desk.lot, o15_yes, paced=True))
                    took_o15 = True
            elif O15_DIRECT_MIN <= price <= O15_MAX:
                kept.append(_stamp(o15, 1.5, desk.lot, o15_yes, paced=True))
                took_o15 = True

        if not took_o15 and all4_yes(desk.o25) and o25 is not None and not weak_lot:
            price = _price(o25.odds)
            if O25_MIN <= price <= O25_MAX:
                kept.append(_stamp(o25, 2.5, desk.lot, 4))
    return kept
