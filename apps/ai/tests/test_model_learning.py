import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import app
from app.memory.model_store import atomic_json, model_path, model_status, read_active
from app.tools.calibration import apply_calibration, calibrated
from app.tools.learning_data import OutcomeSample, unique_samples
from app.tools.model_learning import learn
from app.tools.model_metrics import losses
from test_flexible_generation import selection


def samples(count=400, probability=.95):
    start = datetime(2025, 1, 1, tzinfo=timezone.utc)
    rows = []
    for index in range(count):
        time = start + timedelta(days=index // 4, hours=index % 4)
        rows.append(OutcomeSample(id=str(index), eventId=str(index), marketId='18', outcomeId='12',
            probability=probability, baseProbability=probability, modelVersion='odds-v2', baseModelVersion='odds-v2',
            result='WON' if index % 2 else 'LOST', predictedAt=time, kickoffAt=time + timedelta(hours=1),
            resultKnownAt=time + timedelta(hours=3)))
    return rows


class ModelLearningTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.env = patch.dict(os.environ, {'LEARNING_MODEL_PATH': str(Path(self.directory.name) / 'active.json')})
        self.env.start()
        self.addCleanup(self.env.stop)

    def test_probability_scores_penalize_confident_mistakes(self):
        brier, log_loss = losses(.99, 'LOST')
        self.assertGreater(brier, .9)
        self.assertGreater(log_loss, 4)
        self.assertEqual(losses(.5, 'WON')[0], .25)

    def test_pre_match_validation_rejects_future_results_and_outcome_leakage(self):
        valid = samples(1)[0].model_dump()
        for changes in [ {'predictedAt': valid['kickoffAt']}, {'resultKnownAt': valid['predictedAt']},
                         {'resultKnownAt': datetime.now(timezone.utc) + timedelta(days=1)},
                         {'predictedAt': datetime(2025, 1, 1)}, {'baseProbability': float('nan')}, {'result': 'VOID'}]:
            with self.subTest(changes=changes), self.assertRaises(ValidationError):
                OutcomeSample.model_validate({**valid, **changes})

    def test_repeated_user_bets_do_not_multiply_training_labels(self):
        row = samples(1)[0]
        duplicate = row.model_copy(update={'id': 'duplicate', 'predictedAt': row.predictedAt + timedelta(minutes=5)})
        self.assertEqual(unique_samples([duplicate, row]), [row])

    def test_no_model_is_activated_without_sufficient_results(self):
        report = learn(samples(20))
        self.assertFalse(report['promoted'])
        self.assertIsNone(read_active())
        self.assertEqual(model_status()['state'], 'collecting')

    def test_improved_candidate_promotes_on_later_matches_and_hot_reloads(self):
        rows = samples()
        report = learn(rows)
        self.assertTrue(report['promoted'], report)
        active = read_active()
        self.assertLess(active['holdout']['candidate']['brier'], active['holdout']['baseline']['brier'])
        self.assertLess(active['holdout']['candidate']['logLoss'], active['holdout']['baseline']['logLoss'])
        self.assertLess(datetime.fromisoformat(active['trainUntil']), min(r.predictedAt for r in rows[-120:]))
        original = selection(1, 1.2, .95, market='18')
        adjusted = apply_calibration([original])[0]
        self.assertEqual(adjusted.baseProbability, .95)
        self.assertEqual(adjusted.baseModelVersion, original.modelVersion)
        # This fixture uses a different model version; unrelated models retain their forecasts.
        self.assertEqual(adjusted.probability, .95)
        original = original.model_copy(update={'modelVersion': 'odds-v2'})
        adjusted = apply_calibration([original])[0]
        self.assertLess(adjusted.probability, .8)
        self.assertIn('@cal-v1-', adjusted.modelVersion)
        self.assertEqual(apply_calibration([adjusted])[0], adjusted)
        self.assertEqual(learn(rows), report)  # Replaying an identical batch does not retest/promote.

    def test_a_good_baseline_is_retained_when_calibration_does_not_improve(self):
        report = learn(samples(probability=.5))
        self.assertFalse(report['promoted'])
        self.assertIn('retained', report['reason'])
        self.assertIsNone(read_active())

    def test_late_results_are_not_used_to_train_a_past_forecast(self):
        rows = samples()
        late = datetime(2025, 12, 1, tzinfo=timezone.utc)
        rows = [row.model_copy(update={'resultKnownAt': late}) for row in rows]
        report = learn(rows)
        self.assertFalse(report['promoted'])
        self.assertIn('future results were excluded', report['reason'])

    def test_existing_holdout_cannot_be_reused_after_a_label_correction(self):
        rows = samples()
        self.assertTrue(learn(rows)['promoted'])
        corrected = [*rows]
        corrected[0] = corrected[0].model_copy(update={'result': 'WON'})
        report = learn(corrected)
        self.assertFalse(report['promoted'])
        self.assertIn('fresh holdout', report['reason'])

    def test_bad_artifact_falls_back_without_breaking_prediction(self):
        model_path().write_text('{broken')
        pool = [selection(1, 1.2, .8)]
        self.assertEqual(apply_calibration(pool)[0].probability, .8)
        self.assertEqual(model_status()['state'], 'degraded')

    def test_learning_http_contract_returns_collecting_status_and_validates_labels(self):
        with TestClient(app) as client:
            self.assertEqual(client.post('/learning/status').json()['state'], 'collecting')
            result = client.post('/learning/update', json={'samples': []})
            self.assertEqual(result.status_code, 200)
            self.assertFalse(result.json()['promoted'])
            invalid = samples(1)[0].model_dump(mode='json')
            invalid['predictedAt'] = invalid['kickoffAt']
            self.assertEqual(client.post('/learning/update', json={'samples': [invalid]}).status_code, 422)

    def test_conflicting_verified_outcomes_are_excluded_instead_of_guessed(self):
        first = samples(1)[0]
        second = first.model_copy(update={'id': 'second', 'result': 'WON'})
        self.assertEqual(unique_samples([first, second]), [])

    def test_waiting_runs_preserve_the_rejected_holdout_watermark(self):
        rows = samples(probability=.5)
        rejected = learn(rows)
        self.assertFalse(rejected['promoted'])
        through = rejected['evaluatedThrough']
        for index in range(3):
            updated = [rows[0].model_copy(update={'marketName': f'updated-{index}'}), *rows[1:]]
            report = learn(updated)
            self.assertIn('fresh holdout', report['reason'])
            self.assertEqual(report['evaluatedThrough'], through)
            self.assertNotIn('holdout', report)
