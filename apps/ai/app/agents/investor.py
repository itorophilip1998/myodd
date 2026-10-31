from .base import ModeAgent


class InvestorAgent(ModeAgent):
    def __init__(self):
        super().__init__('INVESTOR', 'investor', use_trends=True)
