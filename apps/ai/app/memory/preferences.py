"""Apply supplied saved defaults; explicit request settings retain precedence.

Durable, account-scoped preferences remain in the API/PostgreSQL layer.
"""
import re

from app.schemas import Config
from app.tools.odds_format import extract_games_per_ticket, extract_odds_bounds
from app.tools.risk_modes import apply_named_mode, apply_default_investor


def apply_preferences(config: Config, instruction: str, learned_defaults: dict | None, explicit_count: int | None) -> Config:
    memory = learned_defaults or {}
    text = instruction.casefold()
    if memory.get('ticketCount') and explicit_count is None and not re.search(r'(?:create|generate|give me)\s+\d+|\d+\s+(?:tickets?|codes?|slips?|parts?|pieces?)|\bsplit\b', text):
        config.numberOfSlips = min(10, max(1, int(memory['ticketCount'])))
    games = extract_games_per_ticket(instruction)
    if games is not None:
        config.minimumSelections = config.maximumSelections = games
    elif re.search(r'games per ticket:\s*random', text):
        if not re.search(r'\b(?:min(?:imum)?|max(?:imum)?)\s+\d+\s*(?:games?|matches?|legs?|selections?)', text):
            config.minimumSelections, config.maximumSelections = 1, 50
    elif memory.get('gamesPerTicket') and not re.search(r'\d+\s+(?:games?|matches?|picks?|legs?|selections?)', text):
        config.minimumSelections = config.maximumSelections = memory['gamesPerTicket']
    low, high = extract_odds_bounds(instruction)
    if low is not None:
        config.minimumOdds = low
    if high is not None:
        config.maximumOdds = high
    if memory.get('riskMode') and not re.search(r'\b(?:mode|modes|risk|odds|between|around|conservative|aggressive|safer|higher|lower|medium|moderate)\b', text):
        label = {'INVESTOR': 'Investor Mode', 'GAMBLER': 'Gambler Mode', 'JAPA': 'Japa Mode', 'LAGOS_LIFE': 'Lagoslife Mode'}[memory['riskMode']]
        config = apply_named_mode(config, label)
    config = apply_named_mode(config, instruction)
    return apply_default_investor(config, instruction)
