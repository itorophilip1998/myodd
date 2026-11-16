"""Flashscore-first bridge: grade FS names, then attach SportyBet markets.

For Over 1.5 Machine / Goals Desk / GGSP:
1. Load Flashscore fixtures in the kickoff window
2. Run mode gates (Aries / GGSP / Goals Desk + senior hygiene) on **Flashscore** names
3. For each FS-eligible game, find SportyBet by same name or alias + kickoff
4. Keep SportyBet markets/eventId; rewrite home/away/league to Flashscore spellings
5. Report FS-eligible games that never matched SportyBet (cannot price)

SportyBet-only rows are never graded. Unmatched SportyBet spelling is not a drop
reason — we start from Flashscore, then alias-match onto Sporty.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher

from app.llms.ggsp import is_clean_select
from app.llms.ggsp_aliases import expand_team_name
from app.llms.goals_desk_v2 import all4_yes, at_least_n_yes, cast_desk
from app.llms.senior_hygiene import is_weak_competition, passes_senior_hygiene
from app.llms.vedic_o15 import cast_rising
from app.schemas import Fixture, ScoredSelection
from app.tools.flashscore_feed import (
    FlashscoreFixture,
    fetch_flashscore_window,
    flashscore_failed_offsets,
)

_KICKOFF_SLACK_SEC = 3 * 3600  # UEFA boards sometimes drift ±1–2h across books
_MIN_MATCH_SCORE = 0.72
_MIN_SIDE_SCORE = 0.45


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
    token = 0.0
    if ta and tb:
        inter = len(ta & tb)
        token = inter / max(len(ta), len(tb))
    seq = SequenceMatcher(None, fa, fb).ratio()
    return max(token, seq * 0.95)


def match_score(sporty_home: str, sporty_away: str, sporty_ko: datetime, fs: FlashscoreFixture) -> float:
    """Score SportyBet ↔ Flashscore using raw + alias expansions on both sides."""
    home = max(
        _name_score(sporty_home, fs.home),
        _name_score(expand_team_name(sporty_home), fs.home),
        _name_score(sporty_home, expand_team_name(fs.home)),
        _name_score(expand_team_name(sporty_home), expand_team_name(fs.home)),
    )
    away = max(
        _name_score(sporty_away, fs.away),
        _name_score(expand_team_name(sporty_away), fs.away),
        _name_score(sporty_away, expand_team_name(fs.away)),
        _name_score(expand_team_name(sporty_away), expand_team_name(fs.away)),
    )
    if home < _MIN_SIDE_SCORE or away < _MIN_SIDE_SCORE:
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
    min_score: float = _MIN_MATCH_SCORE,
) -> FlashscoreFixture | None:
    best: FlashscoreFixture | None = None
    best_score = 0.0
    for fixture in board:
        score = match_score(home, away, kickoff, fixture)
        if score > best_score:
            best, best_score = fixture, score
    return best if best is not None and best_score >= min_score else None


def best_sporty_match(
    fs: FlashscoreFixture,
    fixtures: list[Fixture],
    *,
    used_event_ids: set[str] | None = None,
    min_score: float = _MIN_MATCH_SCORE,
) -> Fixture | None:
    """Find the SportyBet fixture for a Flashscore row (name / alias + kickoff)."""
    used = used_event_ids or set()
    best: Fixture | None = None
    best_score = 0.0
    for fixture in fixtures:
        if fixture.eventId in used:
            continue
        score = match_score(fixture.homeTeam, fixture.awayTeam, fixture.kickoffAt, fs)
        if score > best_score:
            best, best_score = fixture, score
    return best if best is not None and best_score >= min_score else None


def _fs_category(fs: FlashscoreFixture, fallback: str = '') -> str:
    league = fs.league or ''
    if ':' in league:
        return league.split(':', 1)[0].strip()
    return fallback


def overlay_flashscore_names(
    fixtures: list[Fixture],
    board: list[FlashscoreFixture],
    *,
    require_match: bool = False,
    drop_weak: bool = True,
) -> tuple[list[Fixture], int, int, int]:
    """Optional Sporty→FS rewrite helper (tests / diagnostics).

    Production Over 1.5 / Goals Desk / GGSP use `apply_flashscore_first` (FS→Sporty).
    """
    matched = 0
    dropped_unmatched = 0
    dropped_weak = 0
    out: list[Fixture] = []
    for fixture in fixtures:
        fs = best_flashscore_match(fixture.homeTeam, fixture.awayTeam, fixture.kickoffAt, board)
        if fs is None:
            dropped_unmatched += 1
            if require_match:
                continue
            out.append(fixture)
            continue
        matched += 1
        league = fs.league or fixture.league
        category = fixture.categoryName or _fs_category(fs)
        if drop_weak and is_weak_competition(league, category, home=fs.home, away=fs.away):
            dropped_weak += 1
            continue
        out.append(fixture.model_copy(update={
            'homeTeam': fs.home,
            'awayTeam': fs.away,
            'league': league,
            'categoryName': category,
        }))
    return out, matched, dropped_unmatched, dropped_weak


def overlay_scored_names(
    pool: list[ScoredSelection],
    board: list[FlashscoreFixture],
    *,
    require_match: bool = False,
    drop_weak: bool = True,
) -> list[ScoredSelection]:
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
            if not require_match:
                out.append(selection)
            continue
        league = fs.league or selection.league
        category = selection.categoryName or _fs_category(fs)
        if drop_weak and is_weak_competition(league, category, home=fs.home, away=fs.away):
            continue
        out.append(selection.model_copy(update={
            'homeTeam': fs.home,
            'awayTeam': fs.away,
            'league': league,
            'categoryName': category,
        }))
    return out


@dataclass(frozen=True)
class FlashscoreBridgeResult:
    fixtures: list[Fixture]
    board_size: int
    matched: int
    dropped_unmatched: int
    dropped_weak: int
    eligible_fs: int
    missing_on_sporty: list[str]
    notice: str


def fs_eligible_ggsp(fs: FlashscoreFixture) -> bool:
    if not passes_senior_hygiene(fs.league, home=fs.home, away=fs.away):
        return False
    return is_clean_select(fs.home, fs.away, fs.league, allow_soft=True)


def fs_eligible_goals_desk(fs: FlashscoreFixture) -> bool:
    if not passes_senior_hygiene(fs.league, home=fs.home, away=fs.away):
        return False
    desk = cast_desk(fs.home, fs.away, fs.kickoff_at)
    if desk.lot == '吉':
        return False
    o15_ok = at_least_n_yes(desk.o15, 3) and (
        desk.o25.get('zw') == 'Yes' and desk.o25.get('omi') == 'Yes' and desk.o25.get('len') == 'Yes'
    )
    o25_ok = all4_yes(desk.o25)
    return o15_ok or o25_ok


def fs_eligible_over15(fs: FlashscoreFixture) -> bool:
    if not passes_senior_hygiene(fs.league, home=fs.home, away=fs.away):
        return False
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
    """Gate on Flashscore names, then alias-match each eligible row onto SportyBet markets."""
    if board is None:
        board = fetch_flashscore_window(kickoff_after, kickoff_before)

    dropped_weak = sum(
        1 for fs in board
        if is_weak_competition(fs.league, home=fs.home, away=fs.away)
    )
    eligible_fn = _ELIGIBLE.get(mode)
    eligible = [fs for fs in board if eligible_fn(fs)] if eligible_fn else [
        fs for fs in board
        if passes_senior_hygiene(fs.league, home=fs.home, away=fs.away)
    ]

    used: set[str] = set()
    out: list[Fixture] = []
    missing: list[str] = []
    for fs in eligible:
        sporty = best_sporty_match(fs, fixtures, used_event_ids=used)
        if sporty is None:
            missing.append(
                f'{fs.kickoff_at.strftime("%H:%M")} · {fs.league} · {fs.home} vs {fs.away}'
            )
            continue
        used.add(sporty.eventId)
        category = sporty.categoryName or _fs_category(fs)
        out.append(sporty.model_copy(update={
            'homeTeam': fs.home,
            'awayTeam': fs.away,
            'league': fs.league or sporty.league,
            'categoryName': category,
        }))

    missing_preview = missing[:24]
    failed = flashscore_failed_offsets()
    notice = (
        f'Flashscore-first ({mode}): board {len(board)} · FS-eligible {len(eligible)} · '
        f'SportyBet picks {len(out)} · missing on SportyBet {len(missing)} · '
        f'weak comps on board {dropped_weak}'
        + (f' · Flashscore day feeds failed offsets {failed}' if failed else '')
        + (f' (e.g. missing {"; ".join(missing_preview[:3])})' if missing_preview else '')
        + '.'
    )
    return FlashscoreBridgeResult(
        fixtures=out,
        board_size=len(board),
        matched=len(out),
        dropped_unmatched=len(missing),
        dropped_weak=dropped_weak,
        eligible_fs=len(eligible),
        missing_on_sporty=missing_preview,
        notice=notice,
    )
