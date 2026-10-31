"""Output counts are independent of the number of games on each ticket."""
import re

LIMIT_MESSAGE = 'You can generate up to 10 tickets at a time.'
WORDS = dict(zip('one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(), range(1, 20)))
WORDS.update(twenty=20, thirty=30, forty=40, fifty=50, sixty=60, seventy=70, eighty=80, ninety=90, hundred=100)
UNITS = 'one|two|three|four|five|six|seven|eight|nine'
TOKEN = rf'(?:[0-9]+|one hundred|(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:[ -](?:{UNITS}))?|{"|".join(WORDS)})'


def requested_ticket_count(text: str) -> int | None:
    matches = re.findall(rf'\b({TOKEN})\s+(?:(?!(?:games?|matches?|legs?|picks?|selections?|per|each|odds)\b)[a-z-]+\s+){{0,3}}(?:tickets?|codes?|slips?|bookings?|combinations?|versions?|parts?|pieces?|groups?)\b', text, re.I)
    if not matches and re.search(r'\b(?:split|spilt|splate|divide|partition)\b', text, re.I):
        matches = re.findall(rf'\binto\s+({TOKEN})\b', text, re.I)
    if not matches:
        return None
    value = matches[-1].lower()
    return int(value) if value.isdigit() else sum(WORDS.get(word, 0) for word in re.split('[ -]+', value))


def validate_ticket_count(text: str) -> int | None:
    count = requested_ticket_count(text)
    if count is not None and count > 10:
        raise ValueError(LIMIT_MESSAGE)
    return count
