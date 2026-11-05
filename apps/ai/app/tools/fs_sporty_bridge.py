"""Flashscore-first bridge: grade FS names, then attach SportyBet markets.

For Over 1.5 Machine / Goals Desk / GGSP:
1. Load Flashscore fixtures in the kickoff window
2. Soft-match each SportyBet fixture to a Flashscore row (names + kickoff)
3. Rewrite SportyBet home/away/league to Flashscore spellings before mode filters
4. Report Flashscore-eligible games that never matched SportyBet
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone

from app.llms.ggsp import is_clean_select
from app.llms.ggsp_aliases import expand_team_name
from app.llms.goals_desk_v2 import all4_yes, at_least_n_yes, cast_desk
from app.llms.vedic_o15 import cast_rising
from app.schemas import Fixture, ScoredSelection
from app.tools.flashscore_feed import FlashscoreFixture, fetch_flashscore_window

_KICKOFF_SLACK_SEC = 3 * 3600  # UEFA boards sometimes drift ±1–2h across books


def _fold(text: str) -> str:
    text = unicodedata.normalize('NFKD', text or '')
    text = ''.join(c for c in text if not unicodedata.combining(c)).casefold()
    text = re.sub(r'[^a-z0-9\s]', ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def _tokens(text: str) -> set[str]:
    stop = {'fc', 'cf', 'sc', 'ac', 'fk', 'afc', 'united', 'city', 'the', 'de', 'club'}
    return {t for t in _fold(text).split() if len(t) > 1 and t not in stop}


def _name_score(a: str, b: str) -> float:
    fa, fb = _fold(a), _fold(b)
    if not fa or not fb:
        return 0.0
    if fa == fb:
        return 1.0
    if fa in fb or fb in fa:
        return 0.92
    ta, tb = _tokens(a), _tokens(b)
    if not ta or not tb:
        return 0.0
    inter = len(ta & tb)
    return inter / max(len(ta), len(tb))


def match_score(sporty_home: str, sporty_away: str, sporty_ko: datetime, fs: FlashscoreFixture) -> float:
    # Expand known SportyBet shorts to Flashscore spellings before comparing.
    home = max(
        _name_score(sporty_home, fs.home),
        _name_score(expand_team_name(sporty_home), fs.home),
    )
    away = max(
        _name_score(sporty_away, fs.away),
        _name_score(expand_team_name(sporty_away), fs.away),
    )
    if home < 0.45 or away < 0.45:
        return 0.0
    ko = sporty_ko if sporty_ko.tzinfo else sporty_ko.replace(tzinfo=timezone.utc)
    delta = abs((ko - fs.kickoff_at).total_seconds())
    if delta > _KICKOFF_SLACK_SEC:
        return 0.0
    time_fit = max(0.0, 1.0 - delta / _KICKOFF_SLACK_SEC)
    return home * 0.45 + away * 0.45 + time_fit * 0.10


def best_flashscore_match(
    home: str,
    away: str,
    kickoff: datetime,
    board: list[FlashscoreFixture],
    *,
    min_score: float = 0.72,
) -> FlashscoreFixture | None:
    best: FlashscoreFixture | None = None
    best_score = 0.0
    for fixture in board:
        score = match_score(home, away, kickoff, fixture)
        if score > best_score:
            best, best_score = fixture, score
    return best if best is not None and best_score >= min_score else None


def overlay_flashscore_names(fixtures: list[Fixture], board: list[FlashscoreFixture]) -> tuple[list[Fixture], int]:
    """Rewrite SportyBet team/league labels to matched Flashscore spellings."""
    matched = 0
    out: list[Fixture] = []
    for fixture in fixtures:
        fs = best_flashscore_match(fixture.homeTeam, fixture.awayTeam, fixture.kickoffAt, board)
        if fs is None:
            out.append(fixture)
            continue
        matched += 1
        out.append(fixture.model_copy(update={
            'homeTeam': fs.home,
            'awayTeam': fs.away,
            'league': fs.league or fixture.league,
            # Flashscore league string often already includes country context
            'categoryName': fixture.categoryName or '',
        }))
    return out, matched


def overlay_scored_names(pool: list[ScoredSelection], board: list[FlashscoreFixture]) -> list[ScoredSelection]:
    """Same overlay for already-scored selections (event-level)."""
    by_event: dict[str, FlashscoreFixture | None] = {}
    out: list[ScoredSelection] = []
    for selection in pool:
        if selection.eventId not in by_event:
            by_event[selection.eventId] = best_flashscore_match(
                selection.homeTeam, selection.awayTeam, selection.kickoffAt, board,
            )
        fs = by_event[selection.eventId]
        if fs is None:
            out.append(selection)
            continue
        out.append(selection.model_copy(update={
            'homeTeam': fs.home,
            'awayTeam': fs.away,
            'league': fs.league or selection.league,
        }))
    return out


@dataclass(frozen=True)
class FlashscoreBridgeResult:
    fixtures: list[Fixture]
    board_size: int
    matched: int
    eligible_fs: int
    missing_on_sporty: list[str]
    notice: str


def fs_eligible_ggsp(fs: FlashscoreFixture) -> bool:
    return is_clean_select(fs.home, fs.away, fs.league, allow_soft=True)


def fs_eligible_goals_desk(fs: FlashscoreFixture) -> bool:
    desk = cast_desk(fs.home, fs.away, fs.kickoff_at)
    if desk.lot == '吉':
        return False
    o15_ok = at_least_n_yes(desk.o15, 3) and (
        desk.o25.get('zw') == 'Yes' and desk.o25.get('omi') == 'Yes' and desk.o25.get('len') == 'Yes'
    )
    o25_ok = all4_yes(desk.o25)
    return o15_ok or o25_ok


def fs_eligible_over15(fs: FlashscoreFixture) -> bool:
    return cast_rising(fs.home, fs.kickoff_at).eligible


_ELIGIBLE = {
    'GGSP_V11': fs_eligible_ggsp,
    'GOALS_DESK_V2': fs_eligible_goals_desk,
    'OVER15_MACHINE': fs_eligible_over15,
}


def apply_flashscore_first(
    fixtures: list[Fixture],
    mode: str,
    *,
    kickoff_after: datetime | None = None,
    kickoff_before: datetime | None = None,
    board: list[FlashscoreFixture] | None = None,
) -> FlashscoreBridgeResult:
    """Fetch Flashscore (unless `board` given), overlay names, list FS-eligible misses."""
    if board is None:
        board = fetch_flashscore_window(kickoff_after, kickoff_before)
    rewritten, matched = overlay_flashscore_names(fixtures, board)
    eligible_fn = _ELIGIBLE.get(mode)
    eligible = [fs for fs in board if eligible_fn(fs)] if eligible_fn else []
    sporty_keys = {
        (_fold(f.homeTeam), _fold(f.awayTeam), int(f.kickoffAt.timestamp()) // 1800)
        for f in rewritten
    }
    missing: list[str] = []
    for fs in eligible:
        key = (_fold(fs.home), _fold(fs.away), int(fs.kickoff_at.timestamp()) // 1800)
        # Also accept a soft match against rewritten SportyBet rows
        hit = key in sporty_keys or any(
            match_score(f.homeTeam, f.awayTeam, f.kickoffAt, fs) >= 0.72 for f in rewritten
        )
        if not hit:
            missing.append(f'{fs.kickoff_at.strftime("%H:%M")} · {fs.league} · {fs.home} vs {fs.away}')
    missing = missing[:24]
    notice = (
        f'Flashscore-first ({mode}): board {len(board)} · SportyBet name matches {matched}/{len(fixtures)} · '
        f'FS-eligible {len(eligible)} · missing on SportyBet {len(missing)}'
        + (f' (e.g. {"; ".join(missing[:3])})' if missing else '')
        + '.'
    )
    return FlashscoreBridgeResult(
        fixtures=rewritten,
        board_size=len(board),
        matched=matched,
        eligible_fs=len(eligible),
        missing_on_sporty=missing,
        notice=notice,
    )
