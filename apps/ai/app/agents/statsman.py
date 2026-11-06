from .base import ModeAgent


class StatsmanAgent(ModeAgent):
    """Statsman Mode — Elo + decayed A/D engine with high-confidence pick gates."""

    def __init__(self):
        super().__init__('STATSMAN', 'statsman', use_trends=False)
