from .base import ModeAgent


class GoalsDeskV2Agent(ModeAgent):
    """Goals desk v2 — ≥3 Yes for O1.5 lane; all-4 Yes for O2.5."""

    def __init__(self):
        super().__init__('GOALS_DESK_V2', 'goals_desk_v2', use_trends=False)
