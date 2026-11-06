"""Goals desk v2 — Zi Wei / Omikuji / Lenormand / Desk books.

O1.5 path: at least 3 Yes (all 4 ranks higher). O2.5 path: all 4 Yes.
Casts are prematch-only (seed from home vs away + desk-local kickoff + coords).
Desk TZ is fixed UTC+1 to match the dualman goals desk stamp.
"""
from __future__ import annotations

import hashlib
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Literal

Vote = Literal['Yes', 'No', 'Pass']
Conf = Literal['firm', 'lean', 'thin']

DESK_TZ = timezone(timedelta(hours=1))

PALACE = ['命宫', '兄弟', '夫妻', '子女', '财帛', '疾厄', '迁移', '交友', '官禄', '田宅', '福德', '父母']
ZW_MAIN = ['紫微', '天机', '太阳', '武曲', '天同', '廉贞', '天府', '太阴', '贪狼', '巨门', '天相', '天梁', '七杀', '破军']
SI_HUA = {
    '紫微': '权', '天机': '科', '太阳': '禄', '武曲': '忌', '天同': '禄', '廉贞': '忌',
    '天府': '权', '太阴': '科', '贪狼': '禄', '巨门': '忌', '天相': '印', '天梁': '科',
    '七杀': '权', '破军': '忌',
}
STAR_READ = {
    '紫微': 'Host authority', '天机': 'Tactics / flip', '太阳': 'Open attack', '武曲': 'Grind / metal',
    '天同': 'Soft / low urgency', '廉贞': 'Chaos / cards', '天府': 'Vault / hold', '太阴': 'Night / guest',
    '贪狼': 'Open / desire', '巨门': 'Dispute', '天相': 'Support', '天梁': 'Shelter',
    '七杀': 'Upset force', '破军': 'Break formation',
}
BRANCH = list('子丑寅卯辰巳午未申酉戌亥')
AWAY = {'太阴', '七杀', '破军', '巨门', '武曲', '廉贞'}
HOME = {'紫微', '天府', '天相', '天梁', '太阳', '天同'}

ZW_OVER = {'太阳', '贪狼', '七杀', '破军', '廉贞', '巨门'}
ZW_UNDER = {'天府', '天梁', '天同', '武曲', '天相'}
ZW_BTTS_Y = {'廉贞', '巨门', '七杀', '破军', '贪狼', '太阴', '太阳'}
ZW_BTTS_N = {'天梁', '天府', '天同', '天相', '紫微'}
ZW_GOAL_PALACES = ('命宫', '官禄', '疾厄', '财帛', '迁移')

OMIKUJI = [
    ('大吉', 'Home'), ('中吉', 'Home'), ('小吉', 'Home'), ('吉', 'Home'),
    ('半吉', 'Draw'), ('末吉', 'Away'), ('凶', 'Away'), ('大凶', 'Away'),
]
OMI_GOALS = {
    '大吉': {'o15': 'Pass', 'o25': 'No', 'btts': 'No', 'conf': 'firm'},
    '中吉': {'o15': 'Yes', 'o25': 'Yes', 'btts': 'Yes', 'conf': 'lean'},
    '小吉': {'o15': 'Pass', 'o25': 'Pass', 'btts': 'Pass', 'conf': 'thin'},
    '吉': {'o15': 'Yes', 'o25': 'Yes', 'btts': 'No', 'conf': 'lean'},
    '半吉': {'o15': 'Pass', 'o25': 'Pass', 'btts': 'Pass', 'conf': 'thin'},
    '末吉': {'o15': 'Yes', 'o25': 'Yes', 'btts': 'Yes', 'conf': 'lean'},
    '凶': {'o15': 'Yes', 'o25': 'Pass', 'btts': 'Pass', 'conf': 'thin'},
    '大凶': {'o15': 'Yes', 'o25': 'Pass', 'btts': 'Pass', 'conf': 'thin'},
}

LENORMAND = [
    ('Rider', 'Away'), ('Clover', 'Home'), ('Ship', 'Away'), ('House', 'Home'),
    ('Tree', 'Draw'), ('Clouds', 'Away'), ('Snake', 'Away'), ('Coffin', 'Away'),
    ('Bouquet', 'Home'), ('Scythe', 'Away'), ('Whip', 'Away'), ('Birds', 'Draw'),
    ('Child', 'Home'), ('Fox', 'Away'), ('Bear', 'Home'), ('Stars', 'Home'),
    ('Stork', 'Home'), ('Dog', 'Home'), ('Tower', 'Draw'), ('Garden', 'Draw'),
    ('Mountain', 'Away'), ('Paths', 'Draw'), ('Mice', 'Away'), ('Heart', 'Home'),
    ('Ring', 'Draw'), ('Book', 'Draw'), ('Letter', 'Home'), ('Man', 'Home'),
    ('Woman', 'Away'), ('Lily', 'Draw'), ('Sun', 'Home'), ('Moon', 'Away'),
    ('Key', 'Home'), ('Fish', 'Home'), ('Anchor', 'Home'), ('Cross', 'Away'),
]
LEN_O25 = {
    'Fox': 'Yes', 'Key': 'Yes', 'Snake': 'Yes', 'Whip': 'Yes', 'Scythe': 'Yes',
    'Stars': 'Yes', 'Bear': 'Yes', 'Stork': 'Yes', 'Clover': 'Yes', 'Bouquet': 'Yes',
    'Fish': 'Yes', 'Moon': 'Yes', 'Garden': 'Yes', 'Child': 'Yes', 'Ring': 'Yes',
    'Paths': 'No', 'Book': 'No', 'Lily': 'No', 'Tree': 'No', 'Cross': 'No',
    'Heart': 'No', 'Sun': 'No', 'Mice': 'No', 'House': 'No', 'Anchor': 'No',
    'Letter': 'Pass', 'Tower': 'Pass', 'Clouds': 'Pass', 'Rider': 'Pass',
    'Coffin': 'Pass', 'Mountain': 'Pass', 'Dog': 'Pass', 'Man': 'Pass',
    'Woman': 'Yes', 'Ship': 'Pass', 'Birds': 'Yes',
}
LEN_BTTS = {
    'Fox': 'Yes', 'Key': 'Yes', 'Snake': 'Yes', 'Garden': 'Yes', 'Birds': 'Yes',
    'Clover': 'Yes', 'Fish': 'Yes', 'Moon': 'Yes', 'Ring': 'Yes', 'Child': 'Yes',
    'Paths': 'No', 'Letter': 'No', 'Cross': 'No', 'Book': 'No', 'Lily': 'No',
    'Tree': 'No', 'Sun': 'No', 'Whip': 'No', 'Mice': 'No', 'Heart': 'No',
    'House': 'No', 'Anchor': 'No', 'Dog': 'No', 'Tower': 'No',
    'Scythe': 'Pass', 'Stars': 'Pass', 'Bear': 'Pass', 'Stork': 'Pass',
    'Bouquet': 'Pass', 'Clouds': 'Pass', 'Rider': 'Pass', 'Coffin': 'Pass',
    'Mountain': 'Pass', 'Man': 'Pass', 'Woman': 'Yes', 'Ship': 'Pass',
}

# Optional known grounds (home team → lat, lon); hash salt otherwise.
STADIUMS: dict[str, tuple[float, float]] = {
    'newcastle': (54.9756, -1.6217),
    'manchester utd': (53.4631, -2.2913),
    'manchester united': (53.4631, -2.2913),
    'arsenal': (51.5549, -0.1084),
    'chelsea': (51.4816, -0.1909),
    'liverpool': (53.4308, -2.9608),
    'tottenham': (51.6043, -0.0664),
    'barcelona': (41.3809, 2.1228),
    'real madrid': (40.4530, -3.6883),
    'atl. madrid': (40.4362, -3.5995),
    'bayern munich': (48.2188, 11.6247),
    'dortmund': (51.4926, 7.4519),
    'psg': (48.8414, 2.2530),
    'paris sg': (48.8414, 2.2530),
    'inter': (45.4781, 9.1240),
    'ac milan': (45.4781, 9.1240),
    'milan': (45.4781, 9.1240),
    'juventus': (45.1096, 7.6413),
    'roma': (41.9341, 12.4547),
    'as roma': (41.9341, 12.4547),
    'napoli': (40.8522, 14.3050),
    'ajax': (52.3142, 4.9419),
    'feyenoord': (51.8939, 4.5232),
    'benfica': (38.7527, -9.1847),
    'porto': (41.1618, -8.5839),
    'sporting cp': (38.7612, -9.1607),
    'galatasaray': (41.0742, 28.7658),
    'rb leipzig': (51.3458, 12.3485),
    'leipzig': (51.3458, 12.3485),
    'manchester city': (53.4831, -2.2004),
    'man city': (53.4831, -2.2004),
}


def _canon(name: str) -> str:
    return ' '.join(name.casefold().split())


def coords_for(home: str) -> tuple[float, float, str]:
    key = _canon(home)
    if key in STADIUMS:
        return (*STADIUMS[key], 'known')
    digest = hashlib.sha256(key.encode()).digest()
    lat = (digest[0] / 255.0) * 140.0 - 60.0
    lon = (int.from_bytes(digest[1:3], 'big') / 65535.0) * 360.0 - 180.0
    return (round(lat, 4), round(lon, 4), 'hash')


def rng_bytes(seed: str, n: int = 64) -> bytes:
    out = b''
    counter = 0
    while len(out) < n:
        out += hashlib.sha256(f'{seed}|{counter}'.encode()).digest()
        counter += 1
    return out[:n]


def hour_branch(hh: int, mm: int) -> str:
    total = hh * 60 + mm
    if total >= 23 * 60 or total < 60:
        return '子'
    slots = [
        (23 * 60, '子'), (60, '丑'), (3 * 60, '寅'), (5 * 60, '卯'), (7 * 60, '辰'),
        (9 * 60, '巳'), (11 * 60, '午'), (13 * 60, '未'), (15 * 60, '申'),
        (17 * 60, '酉'), (19 * 60, '戌'), (21 * 60, '亥'),
    ]
    for i in range(len(slots) - 1, -1, -1):
        start, br = slots[i]
        if start <= total:
            return br
    return '子'


def _as_utc(kickoff: datetime | str) -> datetime:
    if isinstance(kickoff, str):
        raw = kickoff.strip().replace('Z', '+00:00')
        kickoff = datetime.fromisoformat(raw)
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)
    return kickoff.astimezone(timezone.utc)


def desk_local(kickoff: datetime | str) -> datetime:
    return _as_utc(kickoff).astimezone(DESK_TZ)


def cast_ziwei(home: str, away: str, kickoff: datetime | str) -> dict:
    local = desk_local(kickoff)
    lat, lon, _ = coords_for(home)
    iso = local.strftime('%Y-%m-%dT%H:%M:00+01:00')
    seed = f'prematch|{home} vs {away}|{iso}|{lat},{lon}|ziwei'
    b = rng_bytes(seed, 48)
    ming_br = hour_branch(local.hour, local.minute)
    start = b[0] % len(ZW_MAIN)
    bi = BRANCH.index(ming_br)
    palaces = {}
    for i, pname in enumerate(PALACE):
        star = ZW_MAIN[(start + i) % len(ZW_MAIN)]
        br = BRANCH[(bi + i) % 12]
        palaces[pname] = {
            'branch': br, 'star': star, 'si_hua': SI_HUA[star], 'read': STAR_READ[star],
        }
    ming, qian, jie, guan = palaces['命宫'], palaces['迁移'], palaces['交友'], palaces['官禄']
    guest = {qian['star'], jie['star'], guan['star']}
    away_score = len(guest & AWAY)
    home_score = len({ming['star'], palaces['田宅']['star']} & HOME)
    if away_score >= 2 and away_score > home_score:
        side = 'Away'
    elif home_score >= 2 and home_score > away_score:
        side = 'Home'
    elif ming['star'] in AWAY:
        side = 'Away'
    elif ming['star'] in HOME:
        side = 'Home'
    else:
        side = 'Draw'
    return {
        'side': side, 'ming_branch': ming_br, 'away_score': away_score, 'home_score': home_score,
        'ming': ming, 'qian': qian, 'jie': jie, 'guan': guan,
        'tianzhai': palaces['田宅'], 'caibo': palaces['财帛'], 'jie_e': palaces['疾厄'],
        'palaces': palaces, 'seed': seed,
    }


def cast_omikuji(home: str, away: str, kickoff: datetime | str) -> dict:
    local = desk_local(kickoff)
    lat, lon, _ = coords_for(home)
    iso = local.strftime('%Y-%m-%dT%H:%M:00+01:00')
    base = f'prematch|{home} vs {away}|{iso}|{lat},{lon}'
    b = rng_bytes(base + '|omikuji', 8)
    lot, side = OMIKUJI[b[0] % 8]
    return {'lot': lot, 'side': side}


def cast_lenormand(home: str, away: str, kickoff: datetime | str) -> dict:
    local = desk_local(kickoff)
    lat, lon, _ = coords_for(home)
    iso = local.strftime('%Y-%m-%dT%H:%M:00+01:00')
    base = f'prematch|{home} vs {away}|{iso}|{lat},{lon}'
    b = rng_bytes(base + '|lenormand', 64)
    order = list(range(36))
    for i in range(35, 0, -1):
        j = b[i] % (i + 1)
        order[i], order[j] = order[j], order[i]
    cards = [LENORMAND[order[i]] for i in range(3)]
    return {
        'past': cards[0][0], 'present': cards[1][0], 'future': cards[2][0],
        'side': cards[2][1],
    }


def zw_goals(ziwei: dict) -> dict:
    pals = ziwei['palaces']
    stars = [pals[p]['star'] for p in ZW_GOAL_PALACES if p in pals and pals[p]]
    if ziwei.get('jie'):
        stars.append(ziwei['jie']['star'])
    over_n = sum(1 for s in stars if s in ZW_OVER)
    under_n = sum(1 for s in stars if s in ZW_UNDER)
    if over_n >= under_n + 2:
        o25, o_conf = 'Yes', 'firm'
    elif over_n > under_n:
        o25, o_conf = 'Yes', 'lean'
    elif under_n >= over_n + 2:
        o25, o_conf = 'No', 'firm'
    elif under_n > over_n:
        o25, o_conf = 'No', 'lean'
    else:
        o25, o_conf = 'Pass', 'thin'
    if o25 == 'No' and o_conf in ('firm', 'lean'):
        o15, o15c = 'No', 'lean' if o_conf == 'firm' else 'thin'
    elif over_n >= 1 or o25 == 'Yes':
        o15, o15c = 'Yes', 'lean' if over_n >= 2 else 'thin'
    else:
        o15, o15c = 'Pass', 'thin'
    ming = ziwei['ming']['star']
    zhai = (ziwei.get('tianzhai') or {}).get('star')
    qian = ziwei['qian']['star']
    jie = (ziwei.get('jie') or {}).get('star')
    guan = ziwei['guan']['star']
    jie_e = (pals.get('疾厄') or {}).get('star') if pals.get('疾厄') else None
    host_seal = ming in ZW_BTTS_N or zhai in ZW_BTTS_N
    guest_open = qian in ZW_BTTS_Y or jie in ZW_BTTS_Y
    chaos = guan in {'廉贞', '巨门', '七杀', '破军'} or jie_e in {'廉贞', '巨门', '七杀', '破军'}
    if host_seal and not guest_open and not chaos:
        btts, b_conf = 'No', 'firm'
    elif host_seal and not chaos:
        btts, b_conf = 'No', 'lean'
    elif guest_open and chaos:
        btts, b_conf = 'Yes', 'firm'
    elif guest_open or chaos:
        btts, b_conf = 'Yes', 'lean'
    else:
        btts, b_conf = 'Pass', 'thin'
    return {
        'o15': o15, 'o25': o25, 'btts': btts,
        'conf': {'o15': o15c, 'o25': o_conf, 'btts': b_conf},
        'why': f'over{over_n}/under{under_n} seal={host_seal} guest={guest_open} chaos={chaos}',
        'stars': stars,
    }


def omi_goals(omikuji: dict) -> dict:
    lot = omikuji['lot']
    m = OMI_GOALS[lot]
    return {
        'o15': m['o15'], 'o25': m['o25'], 'btts': m['btts'],
        'conf': {'o15': m['conf'], 'o25': m['conf'], 'btts': m['conf']},
        'lot': lot,
    }


def _len_vote(cards: list[str], table: dict) -> tuple[str, str]:
    votes = [table.get(c, 'Pass') for c in cards]
    c = Counter(v for v in votes if v in ('Yes', 'No'))
    if not c:
        return 'Pass', 'thin'
    top, n = c.most_common(1)[0]
    if list(c.values()).count(n) > 1 and len(c) > 1 and c['Yes'] == c.get('No', 0):
        return 'Pass', 'thin'
    if n >= 2:
        conf: Conf = 'firm'
    elif n == 1 and votes.count('Pass') >= 1:
        conf = 'thin'
    else:
        conf = 'lean'
    return top, conf


def len_goals(lenormand: dict) -> dict:
    cards = [lenormand['past'], lenormand['present'], lenormand['future']]
    o25, o25c = _len_vote(cards, LEN_O25)
    btts, bc = _len_vote(cards, LEN_BTTS)
    if o25 == 'No' and o25c == 'firm':
        o15, o15c = 'No', 'lean'
    elif o25 == 'Yes':
        o15, o15c = 'Yes', o25c
    elif any(LEN_O25.get(c) == 'Yes' for c in cards):
        o15, o15c = 'Yes', 'thin'
    else:
        o15, o15c = 'Pass', 'thin'
    return {
        'o15': o15, 'o25': o25, 'btts': btts,
        'conf': {'o15': o15c, 'o25': o25c, 'btts': bc},
    }


def publish_thin(block: dict) -> dict:
    out = {**block, 'conf': dict(block['conf'])}
    for m in ('o15', 'o25', 'btts'):
        if block['conf'][m] == 'thin' and block[m] in ('Yes', 'No') and m != 'o15':
            out[m] = 'Pass'
    return out


def desk_market(votes: list[tuple[str, str]]) -> dict:
    active = [(e, v) for e, v in votes if v in ('Yes', 'No')]
    if len(active) < 2:
        return {'book': 'Pass', 'why': 'need ≥2', 'votes': active}
    c = Counter(v for _, v in active)
    if 'Yes' in c and 'No' in c:
        return {'book': 'Pass', 'why': f'dissent {dict(c)}', 'votes': active}
    side = c.most_common(1)[0][0]
    if c[side] < 2:
        return {'book': 'Pass', 'why': 'no majority', 'votes': active}
    return {'book': side, 'why': f'{side} x{c[side]}', 'votes': active}


def desk_v2(zw_p: dict, omi_p: dict, len_p: dict, market: str) -> dict:
    zw_v = zw_p[market]
    if market == 'btts' and zw_v == 'Yes':
        zw_v = 'Pass'
    elif market == 'o25' and zw_v == 'Yes' and zw_p['conf']['o25'] != 'firm':
        zw_v = 'Pass'
    elif market == 'o15' and zw_v == 'Yes' and zw_p['conf']['o15'] == 'thin':
        zw_v = 'Pass'
    d = desk_market([('zw', zw_v), ('omi', omi_p[market]), ('len', len_p[market])])
    d['zw_gated'] = zw_v
    d['zw'] = zw_p[market]
    d['omi'] = omi_p[market]
    d['len'] = len_p[market]
    return d


@dataclass(frozen=True)
class DeskBook:
    o15: dict
    o25: dict
    btts: dict
    lot: str


def cast_desk(home: str, away: str, kickoff: datetime | str) -> DeskBook:
    zw_raw = publish_thin(zw_goals(cast_ziwei(home, away, kickoff)))
    omi_raw = publish_thin(omi_goals(cast_omikuji(home, away, kickoff)))
    len_raw = publish_thin(len_goals(cast_lenormand(home, away, kickoff)))
    return DeskBook(
        o15=desk_v2(zw_raw, omi_raw, len_raw, 'o15'),
        o25=desk_v2(zw_raw, omi_raw, len_raw, 'o25'),
        btts=desk_v2(zw_raw, omi_raw, len_raw, 'btts'),
        lot=omi_raw.get('lot') or cast_omikuji(home, away, kickoff)['lot'],
    )


DESK_VOICES = ('zw', 'omi', 'len', 'book')


def desk_yes_count(book: dict) -> int:
    """How many of Zi Wei / Omikuji / Lenormand / Desk say Yes."""
    return sum(1 for key in DESK_VOICES if book.get(key) == 'Yes')


def all4_yes(book: dict) -> bool:
    """Z / O / L / Desk all Yes (required for Over 2.5)."""
    return desk_yes_count(book) == 4


def at_least_n_yes(book: dict, n: int) -> bool:
    """O1.5 lane needs at least 3 Yes; all-4 ranks higher."""
    return desk_yes_count(book) >= n


def goals_desk_probability(line: float, yes_count: int = 4) -> float:
    """Rank soft — more Yes votes rank ahead within the same line."""
    if abs(line - 1.5) < 1e-6:
        return 0.84 if yes_count >= 4 else 0.78 if yes_count >= 3 else 0.65
    if abs(line - 2.0) < 1e-6:
        return 0.80 if yes_count >= 4 else 0.74 if yes_count >= 3 else 0.65
    if abs(line - 2.5) < 1e-6:
        return 0.72  # O2.5 only enters when all 4 agree
    return 0.65
