"""Named mode odds policies are enforced locally after every language-model interpretation."""
import re
from .odds_format import extract_odds_bounds, has_explicit_odds_request
from .schemas import Config

class ModeConstraintError(ValueError):
    pass

MODES = (
    (r'\binvestor\s+modes?\b', 'INVESTOR', 'VERY_LOW', 2., 5.),
    (r'\bgam(?:b)?ler\s+modes?\b', 'GAMBLER', 'MODERATE', 5.01, 20.),
    (r'\bjapa\s+modes?\b', 'JAPA', 'HIGHER', 20.01, 100.),
    (r'\blagos[\s-]*(?:li(?:f|v)es?|life)(?:\s+modes?)?\b', 'LAGOS_LIFE', 'VERY_HIGH', 100.01, None),
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
    explicit = has_explicit_odds_request(instruction)
    target_low, target_high = config.minimumOdds, config.maximumOdds
    parsed_low, parsed_high = extract_odds_bounds(instruction)
    if parsed_low is not None:
        target_low = parsed_low
    if parsed_high is not None:
        target_high = parsed_high
    minimum = max(low, target_low) if explicit else low
    maximum = min(high, target_high) if explicit and high is not None and target_high is not None else (target_high if explicit and high is None else high)
    if maximum is not None and minimum > maximum and re.search(r'final request settings[\s\S]*risk mode:', instruction, re.I):
        minimum, maximum = low, high
        config = config.model_copy(update={'unhandledRequests': [*config.unhandledRequests, 'The selected mode replaced the earlier conflicting odds range.']})
    if maximum is not None and minimum > maximum:
        raise ModeConstraintError(f'{mode.replace("_", " ").title()} Mode requires odds from {low:g} to {high if high is not None else "no upper limit"}. Choose odds within that band or change mode.')
    result = config.model_copy(update={'riskMode': mode, 'riskPreference': preference, 'minimumOdds': minimum, 'maximumOdds': maximum, 'allowOddsAdjustment': False})
    return Config.model_validate(result.model_dump())


def apply_default_investor(config: Config, instruction: str) -> Config:
    """Recommend Investor Mode when the user did not name another mode."""
    if config.riskMode or any(re.search(pattern, instruction, re.I) for pattern, *_ in MODES):
        return config
    return apply_named_mode(config, f'{instruction}\nInvestor Mode')
