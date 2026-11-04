"""Explicit mode registry shared by legacy dispatch and mode-specific API routes."""
from .base import ModeAgent
from .gambler import GamblerAgent
from .investor import InvestorAgent
from .japa import JapaAgent
from .lagos_life import LagosLifeAgent
from .prediction import PredictionAgent
from .over15_machine import Over15MachineAgent
from .goals_desk_v2 import GoalsDeskV2Agent
from .statsman import StatsmanAgent

AGENTS = {agent.mode: agent for agent in (
    Over15MachineAgent(), GoalsDeskV2Agent(), InvestorAgent(), GamblerAgent(), StatsmanAgent(), JapaAgent(), LagosLifeAgent(),
)}
# Unlabelled numeric requests retain their historical custom constraints.
CUSTOM_AGENT = ModeAgent(None, 'investor')
PREDICTION_AGENT = PredictionAgent()


def get_agent(mode: str | None) -> ModeAgent:
    return CUSTOM_AGENT if mode is None else AGENTS[mode]
