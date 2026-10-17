"""Named mode odds policies are enforced locally after every language-model interpretation."""
import re
from .schemas import Config

class ModeConstraintError(ValueError):
    pass

MODES = (
    (r'\binvestor\s+modes?\b', 'INVESTOR', 'VERY_LOW', 1., 10.),
    (r'\bgam(?:b)?ler\s+modes?\b', 'GAMBLER', 'MODERATE', 10.01, 100.),
    (r'\bjapa\s+modes?\b', 'JAPA', 'HIGHER', 100.01, 500.),
    (r'\blagos[\s-]*(?:li(?:f|v)es?|life)(?:\s+modes?)?\b', 'LAGOS_LIFE', 'VERY_HIGH', 500.01, None),
)

def apply_named_mode(config: Config, instruction: str) -> Config:
    matches = [(m.start(), mode, preference, low, high) for pattern, mode, preference, low, high in MODES for m in re.finditer(pattern, instruction, re.I)]
    if not matches:
        # A provider may return a named mode even when the input uses an abbreviation.
        found = next((entry[1:] for entry in MODES if entry[1] == config.riskMode), None)
        if not found:
            return config
        mode, preference, low, high = found
    else:
        _, mode, preference, low, high = max(matches, key=lambda item: item[0])
    explicit = bool(re.search(r'\b(?:between|around|odds(?:\s+(?:of|above|below|over|under|from|at))?)\s+\d|\d(?:\.\d+)?\s*odds', instruction, re.I))
    target_low, target_high = config.minimumOdds, config.maximumOdds
    ranges = list(re.finditer(r'between\s+(\d+(?:\.\d+)?)\s*(?:and|to|-|–)\s*(\d+(?:\.\d+)?)(?![\d.])', instruction, re.I))
    ranges = [m for m in ranges if not re.match(r'\s*(?:minutes?|mins?|games?|matches?|legs?)\b', instruction[m.end():], re.I)]
    around = list(re.finditer(r'around\s+(\d+(?:\.\d+)?)', instruction, re.I))
    if ranges:
        target_low, target_high = sorted(map(float, ranges[-1].groups()))
    elif around:
        value = float(around[-1][1]); target_low, target_high = max(1, value * .8), value * 1.2
    minimum = max(low, target_low) if explicit else low
    maximum = min(high, target_high) if explicit and high is not None and target_high is not None else (target_high if explicit and high is None else high)
    if maximum is not None and minimum > maximum and re.search(r'final request settings[\s\S]*risk mode:', instruction, re.I):
        minimum, maximum = low, high
        config = config.model_copy(update={'unhandledRequests': [*config.unhandledRequests, 'The selected mode replaced the earlier conflicting odds range.']})
    if maximum is not None and minimum > maximum:
        raise ModeConstraintError(f'{mode.replace("_", " ").title()} Mode requires odds from {low:g} to {high if high is not None else "no upper limit"}. Choose odds within that band or change mode.')
    result = config.model_copy(update={'riskMode': mode, 'riskPreference': preference, 'minimumOdds': minimum, 'maximumOdds': maximum, 'allowOddsAdjustment': False})
    return Config.model_validate(result.model_dump())
