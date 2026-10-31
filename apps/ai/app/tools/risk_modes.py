"""Named mode odds policies are enforced locally after every language-model interpretation."""
import re
from app.tools.generation_limits import requested_ticket_count
from app.tools.odds_format import extract_games_per_ticket, extract_odds_bounds, has_explicit_odds_request, has_safer_slang
from app.schemas import Config

class ModeConstraintError(ValueError):
    pass

MODES = (
    (r'\binvestor\s+modes?\b', 'INVESTOR', 'VERY_LOW', 3., 6.),
    (r'\bgam(?:b)?ler\s+modes?\b', 'GAMBLER', 'MODERATE', 6.1, 20.),
    (r'\bjapa\s+modes?\b', 'JAPA', 'HIGHER', 20.01, 100.),
    (r'\blagos[\s-]*(?:li(?:f|v)es?|life)(?:\s+modes?)?\b', 'LAGOS_LIFE', 'VERY_HIGH', 100, None),
)


def _user_instruction(instruction: str) -> str:
    """The appended settings block is product copy, not something the user asked for."""
    return re.split(r'\n\s*final request settings\b', instruction, maxsplit=1, flags=re.I)[0]


_MARKET_REQUEST = re.compile(
    r'double\s*chance|\b[1x]2\b|\bx2\b|\b1x\b|over\s*\d|under\s*\d|btts|both\s*teams|'
    r'straight\s*wins?|home\s*win|away\s*win|moneyline|favourites?|favorites?|\bdraws?\b|'
    r'markets?\s+only|only\s+(?:use|my)|these markets',
    re.I,
)


def lock_system_mode(config: Config, instruction: str, mode: str = 'INVESTOR') -> Config:
    """Investor and Gambler use internal markets, counts and a full-band odds mix."""
    _, _, preference, minimum, maximum = next(entry for entry in MODES if entry[1] == mode)
    label = "Investor" if mode == "INVESTOR" else "Gambler"
    notices = list(config.unhandledRequests)

    def note(message: str) -> None:
        if message not in notices:
            notices.append(message)

    user = _user_instruction(instruction)
    low, high = extract_odds_bounds(user)
    if has_explicit_odds_request(user) and not (low == minimum and high == maximum):
        note(f'{label} Mode kept its fixed ticket odds band {minimum:g}–{maximum:g} with mixed targets across the range. Requested odds were not applied.')
    if _MARKET_REQUEST.search(user):
        note(f'{label} Mode chooses the markets. Requested markets were not applied.')
    tickets = requested_ticket_count(user)
    if (tickets is not None and tickets != 10) or extract_games_per_ticket(user) is not None:
        note(f'{label} Mode chooses the ticket count and games per ticket. Requested counts were not applied.')
    if re.search(r'nearest|closest|adjust (?:the )?odds|relax (?:the )?odds', user, re.I):
        note(f'{label} Mode does not move odds to the nearest range.')
    result = config.model_copy(update={
        'riskMode': mode, 'riskPreference': preference, 'minimumOdds': minimum, 'maximumOdds': maximum,
        'allowOddsAdjustment': False, 'numberOfSlips': 10, 'minimumSelections': 1, 'maximumSelections': 50,
        'markets': [], 'marketQueries': [], 'marketRules': [], 'relatedMarketRules': [], 'marketPolicy': 'prefer',
        'unhandledRequests': notices,
    })
    return Config.model_validate(result.model_dump())


def apply_named_mode(config: Config, instruction: str, *, lock_system: bool = True) -> Config:
    matches = [(m.start(), mode, preference, low, high) for pattern, mode, preference, low, high in MODES for m in re.finditer(pattern, instruction, re.I)]
    if not matches:
        # A provider may return a named mode even when the input uses an abbreviation.
        found = next((entry[1:] for entry in MODES if entry[1] == config.riskMode), None)
        if not found:
            return config
        mode, preference, low, high = found
    else:
        _, mode, preference, low, high = max(matches, key=lambda item: item[0])
    # Lock named system modes; inferred numeric requests retain their custom constraints until mode generation.
    if mode in ('INVESTOR', 'GAMBLER') and lock_system and matches and not re.search(r'\b(?:split|divide|partition)\b', instruction, re.I):
        return lock_system_mode(config, instruction, mode)
    explicit = has_explicit_odds_request(instruction)
    target_low, target_high = config.minimumOdds, config.maximumOdds
    parsed_low, parsed_high = extract_odds_bounds(instruction)
    if parsed_low is not None:
        target_low = parsed_low
    if parsed_high is not None:
        target_high = parsed_high
    elif high is None and parsed_low is not None:
        target_high = None
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
    if has_safer_slang(instruction):
        return apply_named_mode(config, f'{instruction}\nInvestor Mode', lock_system=False)
    if has_explicit_odds_request(instruction):
        low, high = extract_odds_bounds(instruction)
        if low is not None and high is not None:
            for _, mode, preference, band_low, band_high in MODES:
                if low >= band_low and (band_high is None or high <= band_high):
                    return config.model_copy(update={'riskMode': mode, 'riskPreference': preference, 'minimumOdds': low, 'maximumOdds': high})
        return config.model_copy(update={'minimumOdds': low if low is not None else config.minimumOdds,
                                         'maximumOdds': high if high is not None else config.maximumOdds})
    return apply_named_mode(config, f'{instruction}\nInvestor Mode', lock_system=False)


def configure_mode(config: Config, mode: str | None) -> Config:
    if mode is None:
        return config
    if config.riskMode is not None and config.riskMode != mode:
        raise ModeConstraintError('The selected route conflicts with the request risk mode.')
    if mode in ('INVESTOR', 'GAMBLER') and config.fixtureMode != 'original_only' and not config.preserveOriginalSelections:
        return lock_system_mode(config, '', mode)
    if config.fixtureMode == 'original_only' and config.preserveOriginalSelections:
        return config
    _, _, preference, low, high = next(entry for entry in MODES if entry[1] == mode)
    requested_low = config.minimumOdds if 'minimumOdds' in config.model_fields_set else low
    requested_high = config.maximumOdds if 'maximumOdds' in config.model_fields_set else high
    minimum = max(low, requested_low)
    maximum = min(high, requested_high) if high is not None and requested_high is not None else high if high is not None else requested_high
    if maximum is not None and minimum > maximum:
        raise ModeConstraintError(f'{mode} requires ticket odds from {low:g} to {high or "no upper limit"}.')
    return Config.model_validate({**config.model_dump(), 'riskMode': mode,
                                  'riskPreference': preference, 'minimumOdds': minimum,
                                  'maximumOdds': maximum, 'allowOddsAdjustment': False})

