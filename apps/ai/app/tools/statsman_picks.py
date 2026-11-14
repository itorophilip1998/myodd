"""Ticket pick rules when Statsman is the scoring engine (Investor / Gambler only).

Goals (O/U, BTTS, double chance): confidence ≥ 76%
1X2 side 58–65%: that team's Over 0.5, or opponent Clean Sheet No
1X2 side ≥ 70%: that team's Over 1.5
1X2 side ≥ 80%: that side's Sporty 2UP (to win / early payout) — not plain 1X2
1X2 side ≥ 66% + 1·over/2·over map ≥ 70%: that side's Home/Away or Over 2.5
1X2 side ≥ 66%: that side's win either half
Corners / shots / SOT / cards: confidence ≥ 76%
Match shots soft O20.5 / SOT soft O7.5 map ≥ 85% → Sporty line up to +3 (e.g. O21.5–O23.5) allowed
Exact / excluded goals: confidence ≥ 42% (kept rare — low search priority)
Uncovered leagues: goals/count/exact may pass on book implied odds (≥ floor); side-band markets need covered form.
Raw 1X2 is never ticketed — only the mapped markets above.
Tackles and goal kicks are removed from every mode.
"""
from __future__ import annotations

import re

from app.llms.statsman import (
    COUNT_FLOOR,
    EXACT_FLOOR,
    GOALS_FLOOR,
    STRONG_MAP_FLOOR,
    STRONG_SIDE,
    TEAM_O15_SIDE,
    TO_SCORE_HI,
    TO_SCORE_LO,
    TWO_UP_SIDE,
    Forecast,
    StatsmanModel,
    over_prob,
    resolve_team_goals_side,
    resolve_team_market_side,
)
from app.schemas import Market, ScoredSelection

# Strict Statsman score + gates — Investor / Gambler only. Japa / Lagos keep open catalog.
STATSMAN_ENGINE_MODES = frozenset({'INVESTOR', 'GAMBLER'})

# Europe match shots / SOT: soft line maps high; Sporty often lists +1…+3 instead.
SHOTS_SOFT_LINE = 20.5
SOT_SOFT_LINE = 7.5
SHOTS_SOFT_MAX_UP = 3.0  # O20.5 → allow up to O23.5
SHOTS_SOFT_MAP_FLOOR = 85.0

# Search bias: probability^4.5 otherwise lets corners/shots/cards (~90%+) drown O1.5 / team O0.5.
_GOALS_PATH = re.compile(
    r'over/?under|total(?:\s+goals)?|\bgoals?\b|btts|both teams|double chance|'
    r'clean\s*sheet|either half|win (?:a |one )?half|\bor\b.*over|over.*\bor\b|'
    r'excluded|exact(?:\s+number\s+of)?\s+goals',
    re.I,
)
_COUNT_PATH = re.compile(r'\bcorners?\b|\bshots?\b|\b(?:cards?|bookings?)\b', re.I)
_PRIMARY_GOALS = re.compile(
    r'over/?under|total(?:\s+goals)?|(?<![a-z])goals?(?![a-z])|btts|both teams|double chance|'
    r'clean\s*sheet|either half|win (?:a |one )?half|\bor\b.*\bover\b|\b2\s*up\b',
    re.I,
)


_EXCLUDED_GOALS = re.compile(
    r'excluded|exact(?:\s+number\s+of)?\s+goals|\bexact goals\b', re.I,
)


def is_excluded_goals_leg(selection) -> bool:
    name = f'{getattr(selection, "marketName", "")} {getattr(selection, "selectionName", "")}'
    return bool(_EXCLUDED_GOALS.search(name))


_ENGLAND_LEAGUE = re.compile(
    r'premier league|\bchampionship\b|league one|league two|'
    r'\bengland\b|\bepl\b|\befl\b|fa cup|efl cup|carabao',
    re.I,
)


def is_england_league(league: str = '') -> bool:
    """EPL / Championship / EFL / England cups — do not overweight vs other leagues."""
    return bool(_ENGLAND_LEAGUE.search(league or ''))


def statsman_search_boost(selection) -> float:
    """Weight multiplier so Investor/Gambler favour goals-path legs but still mix corners/shots/cards.

    Goals stay first priority; count markets are secondary — not banned, not dominant.
    England match O1.5 is demoted so other leagues are not crowded out.
    """
    from app.tools.odds_policy import is_match_goals_over_15

    name = f'{getattr(selection, "marketName", "")} {getattr(selection, "selectionName", "")}'
    if is_excluded_goals_leg(selection):
        return 0.04  # near-banned in search — O1.5 / team goals must win
    if _COUNT_PATH.search(name):
        # Shots/SOT secondary; corners/bookings rare filler — never crowd out goals.
        if re.search(r'\bshots?\b', name, re.I):
            return 2.2
        return 0.55  # corners / cards — visible but below goals
    if _PRIMARY_GOALS.search(name) and not _COUNT_PATH.search(name):
        # Team / match goals, BTTS, DC, 1·over, WEH, clean sheet
        boost = 3.2
        if is_match_goals_over_15(
            getattr(selection, 'marketName', ''), getattr(selection, 'selectionName', ''),
        ) and is_england_league(getattr(selection, 'league', '') or ''):
            boost *= 0.45  # keep eligible, do not prioritize over peers
        return boost
    if _GOALS_PATH.search(name) and not _COUNT_PATH.search(name):
        return 1.0
    return 1.0


def is_statsman_goals_leg(selection) -> bool:
    name = f'{getattr(selection, "marketName", "")} {getattr(selection, "selectionName", "")}'
    # "Excluded goals" contains the word goals — never treat as primary goals path.
    if is_excluded_goals_leg(selection):
        return False
    return bool(_PRIMARY_GOALS.search(name) and not _COUNT_PATH.search(name))


def is_statsman_count_leg(selection) -> bool:
    name = f'{getattr(selection, "marketName", "")} {getattr(selection, "selectionName", "")}'
    return bool(_COUNT_PATH.search(name))


def removed_specialty_market(market_id: str, market_name: str, outcome_name: str = '') -> bool:
    """True for tackles / goal kicks — banned in every mode."""
    name = ' '.join(f'{market_name} {outcome_name}'.casefold().split())
    if re.search(r'\btackles?\b|goal[ -]?kicks?', name):
        return True
    return str(market_id or '') in {
        '900614', '900615', '900616',
        '900622', '900623', '900624',
    }


def _name(selection: ScoredSelection) -> str:
    return ' '.join(f'{selection.marketName} {selection.selectionName}'.casefold().split())


def _line(specifier: str, outcome: str) -> float | None:
    for part in (specifier or '').split('|'):
        if part.startswith('total='):
            try:
                return float(part.split('=', 1)[1])
            except ValueError:
                return None
    match = re.search(r'(\d+(?:\.\d+)?)', outcome or '')
    return float(match.group(1)) if match else None


def _resolved_team_side(selection: ScoredSelection) -> str | None:
    return resolve_team_market_side(selection.marketName, selection.homeTeam, selection.awayTeam)


def _resolved_goals_side(selection: ScoredSelection) -> str | None:
    return resolve_team_goals_side(selection.marketName, selection.homeTeam, selection.awayTeam)


def _is_goals_market(selection: ScoredSelection) -> bool:
    if selection.supportedMarket in (
        Market.OVER_1_5, Market.OVER_2_5, Market.UNDER_3_5, Market.BTTS_YES, Market.BTTS_NO,
        Market.DOUBLE_CHANCE_1X, Market.DOUBLE_CHANCE_12, Market.DOUBLE_CHANCE_X2,
    ):
        return True
    name = _name(selection)
    if re.search(r'corner|shot|card|kick|tackle|half|either|clean sheet|excluded|exact', name):
        return False
    # Team goals lines are side-banded (O0.5 / O1.5) — not match totals.
    if (
        _is_team_over_05(selection, 'home') or _is_team_over_05(selection, 'away')
        or _is_team_over_15(selection, 'home') or _is_team_over_15(selection, 'away')
    ):
        return False
    line = _line(selection.specifier, selection.selectionName)
    if line in {0.5, 1.5} and _resolved_goals_side(selection):
        return False
    return bool(re.search(
        r'over/?under|\bo/u\b|total(?:\s+goals)?|both teams to score|btts|double chance',
        name,
    ))


def _is_count_market(selection: ScoredSelection) -> bool:
    name = _name(selection)
    return bool(re.search(r'\bcorners?\b|\bshots?\b|\b(?:cards?|bookings?)\b', name))


def _is_match_shots_market(selection: ScoredSelection) -> bool:
    """Match-level shots or SOT totals — not team / player lines."""
    name = _name(selection)
    if not re.search(r'\bshots?\b', name):
        return False
    if re.search(r'\b(?:home|away|competitor[12]|player)\b', name):
        return False
    if _resolved_team_side(selection):
        return False
    return True


def match_shots_soft_map(selection: ScoredSelection, forecast: Forecast) -> tuple[float, float] | None:
    """If Sporty line is soft…soft+3 and soft maps ≥85%, return (preferred_line, soft_p).

    Soft targets: shots O20.5, SOT O7.5. Lets O21.5 / O22.5 / O23.5 (or SOT +1…+3) through
    when the soft line itself is strong but Sporty skipped it.
    """
    if not _is_match_shots_market(selection):
        return None
    if not selection.selectionName.casefold().startswith('over'):
        return None
    line = _line(selection.specifier, selection.selectionName)
    if line is None:
        return None
    use_sot = 'on target' in _name(selection)
    preferred = SOT_SOFT_LINE if use_sot else SHOTS_SOFT_LINE
    if line < preferred - 1e-9 or line > preferred + SHOTS_SOFT_MAX_UP + 1e-9:
        return None
    lam = (forecast.sot_lam + forecast.sot_mu) if use_sot else (forecast.shots_lam + forecast.shots_mu)
    soft_p = over_prob(lam, preferred)
    if soft_p * 100 < SHOTS_SOFT_MAP_FLOOR:
        return None
    return preferred, soft_p


def _is_exact_goals(selection: ScoredSelection) -> bool:
    name = _name(selection)
    if re.search(r'correct score|exact score|half|handicap|player', name):
        return False
    return bool(re.search(r'excluded|exact number of goals|\bexact goals\b', name))


def _is_team_goals_over(selection: ScoredSelection, side: str, line: float) -> bool:
    """That side's Over {line} goals (Home/Away label or club-titled Sporty line)."""
    name = _name(selection)
    if re.search(r'corner|shot|card|kick|tackle|clean sheet|excluded|exact|btts|both', name):
        return False
    # Sporty shortens Over/Under to O/U on team lines.
    if not re.search(r'over/?under|\bo/u\b|total|goals?', name):
        return False
    if _line(selection.specifier, selection.selectionName) != line:
        return False
    if not selection.selectionName.casefold().startswith('over'):
        return False
    resolved = _resolved_goals_side(selection) or _resolved_team_side(selection)
    if resolved:
        return resolved == side
    if side == 'home':
        return bool(re.search(r'\b(?:home|competitor1)\b', name)) and not re.search(r'\baway\b', name)
    return bool(re.search(r'\b(?:away|competitor2)\b', name)) and not re.search(r'\bhome\b', name)


def _is_team_over_05(selection: ScoredSelection, side: str) -> bool:
    """Sporty stand-in for team to score: that side's Over 0.5 goals."""
    return _is_team_goals_over(selection, side, 0.5)


def _is_team_over_15(selection: ScoredSelection, side: str) -> bool:
    """Favourite side Team Over 1.5 — requires win ≥ TEAM_O15_SIDE."""
    return _is_team_goals_over(selection, side, 1.5)


def _is_opponent_clean_sheet_no(selection: ScoredSelection, side: str) -> bool:
    """Opponent Clean Sheet No ≡ that side scored (≥1)."""
    name = _name(selection)
    if not re.search(r'clean\s*sheet', name):
        return False
    outcome = selection.selectionName.casefold().strip()
    if outcome not in {'no', 'ng'} and selection.outcomeId not in ('76', 'no'):
        return False
    resolved = _resolved_team_side(selection)
    # Opponent of `side` holds the clean-sheet market.
    if side == 'home':
        if resolved:
            return resolved == 'away'
        return bool(re.search(r'\b(?:away|competitor2)\b', name)) and not re.search(r'\bhome\b', name)
    if resolved:
        return resolved == 'home'
    return bool(re.search(r'\b(?:home|competitor1)\b', name)) and not re.search(r'\baway\b', name)


def _is_to_score_proxy(selection: ScoredSelection, side: str) -> bool:
    return _is_team_over_05(selection, side) or _is_opponent_clean_sheet_no(selection, side)


def _is_side_or_over(selection: ScoredSelection, side: str) -> bool:
    name = _name(selection)
    if not re.search(r'\bor\b', name) or not re.search(r'over', name):
        return False
    if '2.5' not in name and 'total=2.5' not in (selection.specifier or ''):
        return False
    if re.search(r'half|under|corner|shot', name):
        return False
    resolved = _resolved_team_side(selection)
    if resolved:
        return resolved == side
    if side == 'home':
        return bool(re.search(r'\b(?:home|competitor1)\b', name)) and not re.search(r'\baway\b', name)
    return bool(re.search(r'\b(?:away|competitor2)\b', name)) and not re.search(r'\bhome\b', name)


def _is_win_either_half(selection: ScoredSelection, side: str) -> bool:
    name = _name(selection)
    if not re.search(r'either half|win (?:a |one )?half', name):
        return False
    resolved = _resolved_team_side(selection)
    if resolved:
        return resolved == side
    if side == 'home':
        return bool(re.search(r'\b(?:home|competitor1)\b', name))
    return bool(re.search(r'\b(?:away|competitor2)\b', name))


def _is_two_up_market(selection: ScoredSelection) -> bool:
    """Sporty 2UP early-payout 1X2 variant (not plain match result)."""
    return bool(re.search(r'\b2\s*up\b', _name(selection)))


def _is_two_up_side(selection: ScoredSelection, side: str) -> bool:
    """Favourite side Home/Away (or club) on a 2UP market — never Draw."""
    if not _is_two_up_market(selection):
        return False
    outcome = selection.selectionName.casefold().strip()
    if outcome in {'draw', 'x'} or selection.supportedMarket == Market.DRAW:
        return False
    if side == 'home':
        if selection.supportedMarket == Market.HOME:
            return True
        if outcome in {'1', 'home', 'home win'} or re.match(r'home\b', outcome):
            return True
        home = (selection.homeTeam or '').casefold()
        return bool(home and home in outcome and (selection.awayTeam or '').casefold() not in outcome)
    if selection.supportedMarket == Market.AWAY:
        return True
    if outcome in {'2', 'away', 'away win'} or re.match(r'away\b', outcome):
        return True
    away = (selection.awayTeam or '').casefold()
    return bool(away and away in outcome and (selection.homeTeam or '').casefold() not in outcome)


def _favourite(fc: Forecast) -> tuple[str, float]:
    """Return (side, win_pct) for the 1X2 favourite."""
    if fc.ph >= fc.pa:
        return 'home', fc.ph * 100
    return 'away', fc.pa * 100


def _side_band(fc: Forecast) -> tuple[str | None, str]:
    """Return (side, band) where band is 'to_score' | 'strong' | None."""
    best_side, pct = _favourite(fc)
    if TO_SCORE_LO <= pct <= TO_SCORE_HI:
        return best_side, 'to_score'
    if pct >= STRONG_SIDE:
        return best_side, 'strong'
    return None, ''


def _is_goals_ou_market(market: str) -> bool:
    """Match totals / team goals O/U — not corners, shots, cards, kicks, tackles."""
    if re.search(r'corner|shot|card|booking|kick|tackle|clean sheet|excluded|exact|btts|both', market):
        return False
    return bool(re.search(r'over/?under|\bo/u\b|total(?:\s+goals)?|goals?', market))


def statsman_market_allowed(market_id: str, market_name: str, specifier: str, outcome_name: str) -> bool:
    """Markets Investor/Gambler may put on a Statsman-gated ticket."""
    if removed_specialty_market(market_id, market_name, outcome_name):
        return False
    market = ' '.join((market_name or '').casefold().split())
    outcome = ' '.join((outcome_name or '').casefold().split())
    name = f'{market} {outcome}'.strip()
    if re.search(r'player|handicap|exact score|correct score', name):
        return False
    if re.search(r'\b(?:1st|first)\s*half\b|half[ -]?time|ht/ft|halftime', market) and not re.search(
        r'either half|win (?:a |one )?half', market
    ):
        return False
    # Plain 1X2 banned — Sporty 2UP home/away allowed (gated at ≥80% fav).
    if re.search(r'\b2\s*up\b', market):
        return outcome not in {'draw', 'x'}
    if market_id == '1' or re.fullmatch(r'(?:1x2|match result|full time result)', market):
        return False
    # Investor / Gambler: never ticket Under goals, corners, or cards.
    if outcome.startswith('under') and (
        market_id in {'18', '19', '20', '139', '166', '167', '168', '900300', '900301', '900304', '900305'}
        or _is_goals_ou_market(market)
        or re.search(r'\bcorners?\b|\b(?:cards?|bookings?)\b', market)
    ):
        return False
    if re.search(r'excluded|exact number of goals|\bexact goals\b', name):
        return True
    if re.search(r'clean\s*sheet', name):
        return True
    # Team Over 0.5 (to-score proxy) — Home/Away label or club-titled Sporty line.
    line = _line(specifier, outcome_name)
    if (
        line == 0.5 and outcome.startswith('over')
        and re.search(r'over/?under|\bo/u\b|total|goals?', market)
        and not re.search(r'corner|shot|card|kick|tackle', market)
        and (
            re.search(r'\b(?:home|away|competitor[12])\b', market)
            or not re.fullmatch(r'(?:over/?under|\bo/u\b|total(?:\s+goals)?)', market)
        )
    ):
        return True
    # 1·over / 2·over — Sporty is often "{club} or Over 2.5", not Home/Away.
    if (
        re.search(r'\bor\b', name) and re.search(r'\bover\b', name) and '2.5' in name
        and not re.search(r'\bdraw\b|\bunder\b', name)
        and outcome not in {'no', 'ng'}
    ):
        return True
    if re.search(r'either half|win (?:a |one )?half', name):
        return True
    if re.search(r'\bcorners?\b|\b(?:cards?|bookings?)\b', name):
        return outcome.startswith('over')
    if re.search(r'\bshots?\b', name):
        return outcome.startswith(('over', 'under'))
    if re.search(r'both teams to score|btts|double chance', market):
        return True
    if _is_goals_ou_market(market):
        return outcome.startswith('over')
    # Do not short-circuit 81/82 — those IDs need the or-over name/outcome checks above.
    if market_id in (
        '10', '18', '19', '20', '29', '139', '166', '167', '168', '200', '201',
        '450004', '450005', '450006',
        '900304', '900305', '900300', '900301',
        '50', '52',
    ):
        if market_id in {'18', '19', '20'}:
            return outcome.startswith('over')
        return True
    return False


def _book_implied_pct(selection: ScoredSelection) -> float:
    odds = float(getattr(selection, 'odds', 0) or 0)
    if odds < 1.01:
        return 0.0
    return 100.0 / odds


def keep_statsman_pick(selection: ScoredSelection, forecast: Forecast) -> bool:
    """True when this scored outcome may enter a Statsman-gated ticket."""
    if removed_specialty_market(selection.marketId, selection.marketName, selection.selectionName):
        return False
    conf = selection.confidence
    side, band = _side_band(forecast)

    # No domestic CSV for this fixture — do not use generic priors for side bands.
    # Goals/count/exact may still pass when the Sporty price itself clears the floor.
    if not forecast.covered:
        if _is_exact_goals(selection):
            return _book_implied_pct(selection) >= EXACT_FLOOR
        if _is_goals_market(selection):
            return _book_implied_pct(selection) >= GOALS_FLOOR
        if _is_count_market(selection):
            return _book_implied_pct(selection) >= COUNT_FLOOR
        return False

    if _is_exact_goals(selection):
        return conf >= EXACT_FLOOR

    if _is_goals_market(selection):
        return conf >= GOALS_FLOOR

    if _is_count_market(selection):
        if conf >= COUNT_FLOOR:
            return True
        # Soft shots/SOT: Sporty listed +1…+3 above O20.5 / O7.5 while soft still ≥85%.
        return match_shots_soft_map(selection, forecast) is not None

    # Team Over 0.5 / CS No: favourite in 58–65% only (no extra map floor).
    if side and band == 'to_score' and _is_to_score_proxy(selection, side):
        return True

    fav_side, fav_pct = _favourite(forecast)

    # Team Over 1.5: favourite win ≥70% only (no extra map floor).
    if fav_pct >= TEAM_O15_SIDE and _is_team_over_15(selection, fav_side):
        return True

    # Sporty 2UP: favourite win ≥80% → that side to win (early payout variant).
    if fav_pct >= TWO_UP_SIDE and _is_two_up_side(selection, fav_side):
        return True

    # Strong favourite ≥66%: 1·over/2·over needs map ≥70%; win either half needs side only.
    if side and band == 'strong':
        if _is_side_or_over(selection, side):
            return conf >= STRONG_MAP_FLOOR
        if _is_win_either_half(selection, side):
            return True
        # Non-favourite / under-80% 2UP → drop.
        if _is_two_up_market(selection):
            return False

    # Club-titled team Over 0.5 / 1.5 that is not the gated favourite side → always drop.
    line = _line(selection.specifier, selection.selectionName)
    if line in {0.5, 1.5} and selection.selectionName.casefold().startswith('over'):
        if (
            _is_team_over_05(selection, 'home') or _is_team_over_05(selection, 'away')
            or _is_team_over_15(selection, 'home') or _is_team_over_15(selection, 'away')
        ):
            return False

    # Plain under-gate 2UP (underdog / <80%) → always drop.
    if _is_two_up_market(selection):
        return False

    return False


def apply_statsman_ticket_filter(pool: list[ScoredSelection], model: StatsmanModel) -> list[ScoredSelection]:
    kept: list[ScoredSelection] = []
    for selection in pool:
        class _F:
            eventId = selection.eventId
            homeTeam = selection.homeTeam
            awayTeam = selection.awayTeam
            league = selection.league

        forecast = model.forecast(_F())
        if not keep_statsman_pick(selection, forecast):
            continue
        soft = match_shots_soft_map(selection, forecast)
        if soft is not None:
            preferred, soft_p = soft
            # Rank as the soft-line thesis when Sporty only listed a nearby Over.
            if selection.probability < soft_p:
                selection = selection.model_copy(update={
                    'probability': round(soft_p, 6),
                    'confidence': round(soft_p * 100, 2),
                    'modelVersion': f'{selection.modelVersion}+soft{preferred:g}',
                })
        kept.append(selection)
    return kept
