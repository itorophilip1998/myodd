"""Train on past outcomes, then promote only on fresh, chronologically later matches."""
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone

from app.memory.model_store import atomic_json, model_lock, read_active
from .calibration import calibrated, fit, group_key
from .learning_data import unique_samples
from .model_metrics import improvement_bounds, metrics

MIN_TRAIN = 200
MIN_TEST = 80
MIN_EVENTS = 40
MIN_GROUP = 80
MIN_NEW_EVENTS = 40
MIN_IMPROVEMENT = .002


def prediction(parameters, row):
    return calibrated(row.baseProbability, parameters.get(group_key(row.baseModelVersion, row.marketId), (1., 0.)))


def learn(samples):
    with model_lock() as path:
        active = read_active()
        last_path = path.with_name('last-evaluation.json')
        previous_evaluation = json.loads(last_path.read_text()) if last_path.exists() else {}
        previous_end = max(active.get('evaluatedThrough', '') if active else '', previous_evaluation.get('evaluatedThrough', ''))
        rows = unique_samples(samples)
        digest = hashlib.sha256(json.dumps([r.model_dump(mode='json') for r in sorted(rows, key=lambda r: r.id)], sort_keys=True).encode()).hexdigest()
        if previous_evaluation.get('datasetHash') == digest:
            return previous_evaluation
        now = datetime.now(timezone.utc).isoformat()
        report = {'evaluatedAt': now, 'samples': len(rows), 'promoted': False, 'datasetHash': digest}
        if previous_end:
            report['evaluatedThrough'] = previous_end

        def finish(reason):
            report['reason'] = reason
            atomic_json(path.with_name('last-evaluation.json'), report)
            return report

        if len(rows) < MIN_TRAIN + MIN_TEST:
            return finish('Collecting more verified outcomes before training.')
        # Split by whole forecast days and keep each event wholly on one side.
        event_times = {}
        for row in rows:
            event_times[row.eventId] = min(event_times.get(row.eventId, row.predictedAt), row.predictedAt)
        events = sorted(event_times, key=lambda key: event_times[key])
        cutoff = event_times[events[int(len(events) * .7)]].date()
        test_events = {event for event, time in event_times.items() if time.date() >= cutoff}
        test = [r for r in rows if r.eventId in test_events]
        if previous_end:
            prior_end = datetime.fromisoformat(previous_end)
            # Never repeatedly tune against the same holdout outcomes.
            test = [r for r in test if r.predictedAt > prior_end]
        if len(test) < MIN_TEST or len({r.eventId for r in test}) < MIN_NEW_EVENTS:
            return finish('Waiting for a fresh holdout of at least 80 outcomes across 40 new matches.')
        boundary = min(r.predictedAt for r in test)
        test_ids = {r.eventId for r in test}
        train = [r for r in rows if r.eventId not in test_ids and r.resultKnownAt < boundary]
        if len(train) < MIN_TRAIN or len({r.eventId for r in train}) < MIN_EVENTS:
            return finish('Not enough outcomes known before the holdout forecasts; future results were excluded.')
        groups = defaultdict(list)
        for row in train:
            groups[group_key(row.baseModelVersion, row.marketId)].append(row)
        parameters = {}
        for key, group in groups.items():
            wins = sum(r.result == 'WON' for r in group)
            if len(group) >= MIN_GROUP and len({r.eventId for r in group}) >= 20 and min(wins, len(group) - wins) >= 10:
                parameters[key] = fit(group)
        if not parameters:
            return finish('No base-model/market group has enough wins and losses to learn reliably.')
        incumbent = active['parameters'] if active else {}
        # Retain proven groups for which this batch has insufficient new evidence.
        candidate_parameters = {**incumbent, **parameters}
        candidate = lambda row: prediction(candidate_parameters, row)
        baseline = lambda row: row.baseProbability
        previous = lambda row: prediction(incumbent, row)
        results = {'candidate': metrics(test, candidate), 'baseline': metrics(test, baseline), 'incumbent': metrics(test, previous)}
        report.update({'trainingSamples': len(train), 'holdout': results,
                       'trainUntil': max(r.resultKnownAt for r in train).isoformat(),
                       'evaluatedThrough': max(r.resultKnownAt for r in test).isoformat()})
        for name, reference in [('baseline', baseline), ('incumbent', previous)]:
            delta = {metric: results[name][metric] - results['candidate'][metric] for metric in ('brier', 'logLoss')}
            lower = improvement_bounds(test, candidate, reference)
            if min(delta.values()) < MIN_IMPROVEMENT or min(lower) <= 0:
                return finish(f'Candidate did not reliably beat the {name} on both Brier score and log loss; current model retained.')
        version = f'cal-v1-{digest[:12]}'
        artifact = {'format': 'logit-calibration-v1', 'version': version,
                    'activatedAt': now, 'parameters': candidate_parameters, **{k: report[k] for k in ('trainUntil', 'evaluatedThrough', 'datasetHash', 'holdout')}}
        if active:
            atomic_json(path.with_name('previous.json'), active)
        atomic_json(path, artifact)
        report.update({'promoted': True, 'version': version})
        return finish('Candidate improved both scores on fresh held-out matches and passed event-level confidence checks.')
