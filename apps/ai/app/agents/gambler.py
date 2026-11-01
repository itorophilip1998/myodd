from .base import ModeAgent


class GamblerAgent(ModeAgent):
    def __init__(self):
        super().__init__('GAMBLER', 'gambler', use_trends=True)
