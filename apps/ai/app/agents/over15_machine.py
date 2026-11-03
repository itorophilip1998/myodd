from .base import ModeAgent


class Over15MachineAgent(ModeAgent):
    """Over 1.5 Machine — Vedic Aries rising → Over 1.5 (or Over 2.5 if O1.5 < 1.11)."""

    def __init__(self):
        super().__init__('OVER15_MACHINE', 'over15_machine', use_trends=False)
