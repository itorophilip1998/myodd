"""Agent graph: interpret → score → optional trends → generate or exact split."""
import asyncio
import os
from dataclasses import dataclass
from datetime import datetime

from app.prompt import load_prompt
from app.schemas import Fixture, GenerateInput, SplitInput
from app.tools.generation import generate_report
from app.tools.intent import parse_intent
from app.tools.risk_modes import configure_mode
from app.tools.scoring import score
from app.tools.calibration import apply_calibration
from app.tools.splitting import split_report
from app.tools.team_trends import TREND_VERSION, apply_match_trends
from app.tools.results import recent_matches


def _flashscore_bridge(
    fixtures: list[Fixture],
    mode: str,
    kickoff_after: datetime | None,
    kickoff_before: datetime | None,
):
    """Top-level so ProcessPoolExecutor can pickle it (no nested lambdas)."""
    from app.tools.fs_sporty_bridge import apply_flashscore_first
    return apply_flashscore_first(
        fixtures,
        mode,
        kickoff_after=kickoff_after,
        kickoff_before=kickoff_before,
    )


def _ensure_statsman(runtime):
    """Lazy-load Statsman when PREDICTION_MODEL is not statsman but a Statsman-engine mode runs."""
    from app.llms.statsman import StatsmanModel
    cached = getattr(runtime, 'statsman', None)
    if isinstance(cached, StatsmanModel):
        return cached
    model = StatsmanModel(os.getenv('STATSMAN_DATA_DIR', './data/statsman'))
    try:
        runtime.statsman = model
    except Exception:
        pass
    return model


@dataclass(frozen=True)
class ModeAgent:
    mode: str | None
    prompt_name: str
    use_trends: bool = False

    @property
    def system_prompt(self):
        return load_prompt(self.prompt_name)

    def plan(self, instruction, available_markets=None, learned_defaults=None):
        return parse_intent(instruction, available_markets, learned_defaults, prompt_mode=self.prompt_name)

    async def generate(self, body: GenerateInput, runtime):
        from app.llms.statsman import StatsmanModel
        from app.tools.over15_picks import apply_over15_ticket_filter
        from app.tools.statsman_picks import STATSMAN_ENGINE_MODES, apply_statsman_ticket_filter

        config = configure_mode(body.config, self.mode)
        fixtures = body.fixtures
        # Over 1.5 / Goals Desk / GGSP: Flashscore board first (canonical names), then SportyBet markets.
        if config.riskMode in ('OVER15_MACHINE', 'GOALS_DESK_V2', 'GGSP_V11'):
            bridge = await asyncio.get_running_loop().run_in_executor(
                runtime.executor,
                _flashscore_bridge,
                fixtures,
                config.riskMode or '',
                config.kickoffAfter,
                config.kickoffBefore,
            )
            fixtures = bridge.fixtures
            config = config.model_copy(update={
                'unhandledRequests': [*config.unhandledRequests, bridge.notice],
            })

        scoring_model = runtime.model
        if config.riskMode in STATSMAN_ENGINE_MODES and not isinstance(scoring_model, StatsmanModel):
            scoring_model = _ensure_statsman(runtime)
        pool = await score(fixtures, runtime, model=scoring_model)
        loop = asyncio.get_running_loop()
        # Statsman is the ranking engine for Investor/Gambler/Japa/Lagos — skip trend overwrite.
        if self.use_trends and config.fixtureMode != 'original_only' and not isinstance(scoring_model, StatsmanModel):
            matches = await recent_matches(runtime)
            pool, note = apply_match_trends(pool, matches)
            config = config.model_copy(update={'unhandledRequests': [*config.unhandledRequests, note]})
        pool = apply_calibration(pool)
        if config.riskMode == 'OVER15_MACHINE':
            before = len(pool)
            pool = apply_over15_ticket_filter(pool)
            config = config.model_copy(update={
                'unhandledRequests': [
                    *config.unhandledRequests,
                    f'Over 1.5 Machine kept {len(pool)} Aries-rising Over legs from {before} scored outcomes (O1.5, or O2.5 if O1.5 < 1.11; legs ≤1.25; tickets 4–6; no same-game repeat).',
                ],
            })
        elif config.riskMode == 'GOALS_DESK_V2':
            from app.tools.goals_desk_picks import apply_goals_desk_ticket_filter
            before = len(pool)
            pool = apply_goals_desk_ticket_filter(pool)
            config = config.model_copy(update={
                'unhandledRequests': [
                    *config.unhandledRequests,
                    f'Goals Desk v2 kept {len(pool)} Over legs from {before} scored outcomes (O1.5 ≥3 Yes + ZW/OMI/LEN O2.5 pace, skip 吉; O2.5 all-4; O1.5 1.14–1.27, Asian O2 when O1.5 is 1.09–1.13, O2.5 ≤1.60).',
                ],
            })
        elif config.riskMode == 'GGSP_V11':
            from app.tools.ggsp_picks import apply_ggsp_ticket_filter
            before = len(pool)
            pool = apply_ggsp_ticket_filter(pool)
            config = config.model_copy(update={
                'unhandledRequests': [
                    *config.unhandledRequests,
                    f'GGSP v1.1 kept {len(pool)} CLEAN Over 1.5 legs from {before} scored outcomes (Chaldean roots 7–8; HARD/SOFT league skips; tickets 3–4; no same-game repeat).',
                ],
            })
        elif config.riskMode in STATSMAN_ENGINE_MODES and isinstance(scoring_model, StatsmanModel):
            before = len(pool)
            pool = apply_statsman_ticket_filter(pool, scoring_model)
            config = config.model_copy(update={
                'unhandledRequests': [
                    *config.unhandledRequests,
                    f'Statsman pick gates kept {len(pool)} of {before} scored outcomes (goals/DC≥76%; team O0.5 at 58–65% fav; team O1.5 at ≥70% fav; 2UP at ≥80% fav; 1·over at ≥66% fav + map≥70%; WEH at ≥66% fav; corners/shots/cards≥76%; excluded≥42% rare).',
                ],
            })
        report = await loop.run_in_executor(runtime.executor, generate_report, pool, config, body.originalSelections, body.expandedSearch)
        version = next((s.modelVersion for s in pool if '@cal-v1-' in s.modelVersion),
                       TREND_VERSION if any(s.modelVersion == TREND_VERSION for s in pool) else scoring_model.version)
        return {'pool': [s.model_dump(mode='json') for s in pool], **report, 'modelVersion': version}

    async def split(self, body: SplitInput, runtime):
        # A split retains its existing limits and original picks; it never runs the generation/trend graph.
        pool = apply_calibration(await score(body.fixtures, runtime))
        report = await asyncio.get_running_loop().run_in_executor(
            runtime.executor, split_report, pool, body.config, body.originalSelections, body.parts)
        return {'pool': [s.model_dump(mode='json') for s in pool], **report,
                'modelVersion': next((s.modelVersion for s in pool if '@cal-v1-' in s.modelVersion), runtime.model.version)}
