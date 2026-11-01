"""Compose shared planner rules with exactly one mode prompt and optional split rules."""
import json
import re
from datetime import datetime, timezone
from functools import lru_cache
from pathlib import Path

from app.schemas import Config
from app.tools.risk_modes import MODES


@lru_cache(maxsize=8)
def load_prompt(name: str) -> str:
    if name not in {'common', 'investor', 'gambler', 'japa', 'lagos_life', 'prediction', 'split'}:
        raise ValueError(f'Unknown prompt: {name}')
    return Path(__file__).with_name(f'{name}.txt').read_text().strip()


def instruction_mode(instruction: str, fallback: str | None = None) -> str:
    matches = [(m.start(), mode) for pattern, mode, *_ in MODES
               for m in re.finditer(pattern, instruction, re.I)]
    return max(matches)[1].lower() if matches else (fallback or 'INVESTOR').lower()


def planner_prompt(instruction: str, catalog: list[dict], mode: str | None = None) -> str:
    common = load_prompt('common').format(
        defaults=Config().model_dump_json(), now=datetime.now(timezone.utc).isoformat(),
        catalog=json.dumps(catalog, separators=(',', ':')),
    )
    rules = ('Use the selected mode band unless explicit odds narrow it. Never move outside the band. '
             'Honor explicit counts and filters except the explicit Investor system plan. '
             'The final mode selection overrides earlier names. Shorthand odds and exact game counts are hard constraints.')
    parts = [common, rules, load_prompt(mode.lower() if mode else instruction_mode(instruction))]
    if re.search(r'\b(?:split|spilt|splate|divide|partition)\b', instruction, re.I):
        parts.append(load_prompt('split'))
    return '\n\n'.join(parts)
