"""Named mode odds policies are enforced locally after every language-model interpretation."""
import re
from .generation_limits import requested_ticket_count
from .odds_format import extract_games_per_ticket, extract_odds_bounds, has_explicit_odds_request, has_safer_slang
from .schemas import Config

class ModeConstraintError(ValueError):
    pass

MODES = (
    (r'\binvestor\s+modes?\b', 'INVESTOR', 'VERY_LOW', 2., 5.),
    (r'\bgam(?:b)?ler\s+modes?\b', 'GAMBLER', 'MODERATE', 5.01, 20.),
    (r'\bjapa\s+modes?\b', 'JAPA', 'HIGHER', 20.01, 100.),
    (r'\blagos[\s-]*(?:li(?:f|v)es?|life)(?:\s+modes?)?\b', 'LAGOS_LIFE', 'VERY_HIGH', 100.01, None),
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


def lock_investor_system(config: Config, instruction: str) -> Config:
    """Investor Mode is a system ticket. The user does not set odds, markets, or counts."""
    notices = list(config.unhandledRequests)

    def note(message: str) -> None:
        if message not in notices:
            notices.append(message)

    user = _user_instruction(instruction)
    low, high = extract_odds_bounds(user)
    if has_explicit_odds_request(user) and not (low == 2 and high == 5):
        note('Investor Mode kept its fixed ticket odds of 2 to 5. Requested odds were not applied.')
    if _MARKET_REQUEST.search(user):
        note('Investor Mode chooses the markets. Requested markets were not applied.')
    tickets = requested_ticket_count(user)
    if (tickets is not None and tickets != 10) or extract_games_per_ticket(user) is not None:
        note('Investor Mode chooses the ticket count and games per ticket. Requested counts were not applied.')
    if re.search(r'nearest|closest|adjust (?:the )?odds|relax (?:the )?odds', user, re.I):
        note('Investor Mode does not move odds to the nearest range.')
    result = config.model_copy(update={
        'riskMode': 'INVESTOR', 'riskPreference': 'VERY_LOW', 'minimumOdds': 2., 'maximumOdds': 5.,
        'allowOddsAdjustment': False, 'numberOfSlips': 10, 'minimumSelections': 1, 'maximumSelections': 50,
        'markets': [], 'marketQueries': [], 'marketRules': [], 'relatedMarketRules': [], 'marketPolicy': 'prefer',
        'unhandledRequests': notices,
    })
    return Config.model_validate(result.model_dump())


def apply_named_mode(config: Config, instruction: str, *, lock_investor: bool = True) -> Config:
    matches = [(m.start(), mode, preference, low, high) for pattern, mode, preference, low, high in MODES for m in re.finditer(pattern, instruction, re.I)]
    if not matches:
        # A provider may return a named mode even when the input uses an abbreviation.
        found = next((entry[1:] for entry in MODES if entry[1] == config.riskMode), None)
        if not found:
            return config
        mode, preference, low, high = found
    else:
        _, mode, preference, low, high = max(matches, key=lambda item: item[0])
    # Lock only when the instruction names Investor Mode. An inferred label keeps the requested odds and counts.
    if mode == 'INVESTOR' and lock_investor and matches:
        return lock_investor_system(config, instruction)
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
    if has_safer_slang(instruction):
        return apply_named_mode(config, f'{instruction}\nInvestor Mode', lock_investor=False)
    if has_explicit_odds_request(instruction):
        low, high = extract_odds_bounds(instruction)
        if low is not None and high is not None:
            for _, mode, preference, band_low, band_high in MODES:
                if low >= band_low and (band_high is None or high <= band_high):
                    return config.model_copy(update={'riskMode': mode, 'riskPreference': preference, 'minimumOdds': low, 'maximumOdds': high})
        return config.model_copy(update={'minimumOdds': low if low is not None else config.minimumOdds,
                                         'maximumOdds': high if high is not None else config.maximumOdds})
    return apply_named_mode(config, f'{instruction}\nInvestor Mode', lock_investor=False)
