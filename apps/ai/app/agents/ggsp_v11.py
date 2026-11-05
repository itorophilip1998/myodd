from .base import ModeAgent


class GgspV11Agent(ModeAgent):
    """GGSP v1.1 — Chaldean CLEAN 7–8 Over 1.5 with HARD league skips."""

    def __init__(self):
        super().__init__('GGSP_V11', 'ggsp_v11', use_trends=False)
