"""Train league/team goal rates from completed matches, with prior smoothing.

Input columns: league,homeTeam,awayTeam,homeGoals,awayGoals,date (ISO date).
Only use matches completed before the requested cutoff to prevent future leakage.
"""
import argparse
import csv
import hashlib
import json
from collections import defaultdict
from datetime import date
from pathlib import Path


def train(csv_path, output, cutoff):
    leagues = defaultdict(list)
    with open(csv_path, newline='') as source:
        for row in csv.DictReader(source):
            if date.fromisoformat(row['date']) >= cutoff:
                continue
            h, a = int(row['homeGoals']), int(row['awayGoals'])
            if min(h, a) < 0:
                raise ValueError('Goals must be nonnegative')
            leagues[row['league']].append((row['homeTeam'], row['awayTeam'], h, a))
    artifact = {'model': 'poisson-v1', 'trainedBefore': cutoff.isoformat(), 'leagues': {}}
    for league, matches in leagues.items():
        home_avg = max(.1, sum(m[2] for m in matches) / len(matches))
        away_avg = max(.1, sum(m[3] for m in matches) / len(matches))
        teams = {}
        for team in sorted({m[0] for m in matches} | {m[1] for m in matches}):
            home = [m for m in matches if m[0] == team]
            away = [m for m in matches if m[1] == team]
            prior = 5
            teams[team] = {
                'homeAttack': (sum(m[2] for m in home) + prior * home_avg) / (len(home) + prior) / home_avg,
                'homeDefence': (sum(m[3] for m in home) + prior * away_avg) / (len(home) + prior) / away_avg,
                'awayAttack': (sum(m[3] for m in away) + prior * away_avg) / (len(away) + prior) / away_avg,
                'awayDefence': (sum(m[2] for m in away) + prior * home_avg) / (len(away) + prior) / home_avg,
            }
        artifact['leagues'][league] = {'homeGoals': home_avg, 'awayGoals': away_avg, 'teams': teams, 'matches': len(matches)}
    if not artifact['leagues']:
        raise ValueError('No completed matches before cutoff')
    digest = hashlib.sha256(json.dumps(artifact, sort_keys=True).encode()).hexdigest()[:12]
    artifact['version'] = f'poisson-v1-{digest}'
    path = Path(output)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(artifact, indent=2))
    temporary.replace(path)
    return artifact


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('csv')
    parser.add_argument('--output', default='/data/model.json')
    parser.add_argument('--before', type=date.fromisoformat, required=True)
    args = parser.parse_args()
    train(args.csv, args.output, args.before)
