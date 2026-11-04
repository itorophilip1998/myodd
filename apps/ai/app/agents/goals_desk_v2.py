from .base import ModeAgent


class GoalsDeskV2Agent(ModeAgent):
    """Goals desk v2 — ZW/OMI/LEN/Desk all-4 Yes → O1.5 / Asian O2 / O2.5."""

    def __init__(self):
        super().__init__('GOALS_DESK_V2', 'goals_desk_v2', use_trends=False)
