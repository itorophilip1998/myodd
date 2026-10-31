"""Proper probability scores and event-level confidence for a promotion decision."""
import math
import random
from collections import defaultdict


def losses(probability, result):
    probability = min(.999999, max(.000001, probability))
    y = result == 'WON'
    return (probability - y) ** 2, -math.log(probability if y else 1 - probability)


def metrics(rows, predict):
    if not rows:
        return {'samples': 0, 'events': 0, 'brier': None, 'logLoss': None, 'winRate': None}
    scores = [losses(predict(row), row.result) for row in rows]
    return {'samples': len(rows), 'events': len({r.eventId for r in rows}),
            'brier': sum(s[0] for s in scores) / len(scores),
            'logLoss': sum(s[1] for s in scores) / len(scores),
            'winRate': sum(r.result == 'WON' for r in rows) / len(rows)}


def improvement_bounds(rows, candidate, reference):
    # Resample complete matches so correlated options from one event cannot inflate certainty.
    groups = defaultdict(list)
    for row in rows:
        a, b = losses(candidate(row), row.result), losses(reference(row), row.result)
        groups[row.eventId].append((b[0] - a[0], b[1] - a[1]))
    values = [tuple(sum(v[i] for v in group) / len(group) for i in (0, 1)) for group in groups.values()]
    rng = random.Random(42)
    draws = []
    for _ in range(300):
        sample = rng.choices(values, k=len(values))
        draws.append(tuple(sum(v[i] for v in sample) / len(sample) for i in (0, 1)))
    return [sorted(draw[i] for draw in draws)[7] for i in (0, 1)]
