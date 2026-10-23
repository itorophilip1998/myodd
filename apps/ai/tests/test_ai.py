import csv
import json
import math
import os
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.generation import fingerprint, generate
from app.intent import parse_rules
from app.main import app
from app.predictions import OddsModel, PoissonModel, score_fixtures
from app.schemas import Config, Fixture, Market, Selection
from app.train import train


def fixture(event='1', **changes):
    data = dict(eventId=event, homeTeam=f'Home {event}', awayTeam=f'Away {event}', league='Test',
                kickoffAt='2099-01-01T12:00:00Z', markets=[
                    {'marketId': '1', 'marketName': '1X2', 'outcomes': [
                        {'outcomeId': '1', 'outcomeName': 'Home', 'odds': 1.5, 'isActive': True},
                        {'outcomeId': '2', 'outcomeName': 'Draw', 'odds': 4, 'isActive': True},
                        {'outcomeId': '3', 'outcomeName': 'Away', 'odds': 6, 'isActive': True}]},
                    {'marketId': '10', 'marketName': 'Double chance', 'outcomes': [
                        {'outcomeId': i, 'outcomeName': name, 'odds': 1.5, 'isActive': True}
                        for i, name in [('9', '1X'), ('10', '12'), ('11', 'X2')]]}])
    data.update(changes)
    return Fixture.model_validate(data)


class IntentTests(unittest.TestCase):
    def test_prompt(self):
        result = parse_rules('Create 10 lower-risk slips between 3 and 5 odds. Prefer over 1.5 and double chance.')
        self.assertEqual(result.numberOfSlips, 10)
        self.assertEqual((result.minimumOdds, result.maximumOdds), (3, 5))
        self.assertEqual((result.riskMode, result.riskPreference), ('INVESTOR', 'VERY_LOW'))
        self.assertIn(Market.OVER_1_5, result.markets)

    def test_negation_exclusions_and_deadline(self):
        result = parse_rules('Create 3 slips. No straight wins. Remove Arsenal and Chelsea. Before 2099-01-01T10:00:00Z')
        self.assertNotIn(Market.HOME, result.markets)
        self.assertEqual(result.excludedTeams, ['Arsenal', 'Chelsea'])
        self.assertIsNotNone(result.kickoffBefore)

    def test_invalid_selection_range(self):
        with self.assertRaises(ValueError):
            Config(minimumSelections=5, maximumSelections=2)


class PredictionTests(unittest.TestCase):
    def test_double_chance_uses_overlapping_outcomes(self):
        scores = score_fixtures([fixture()], OddsModel())
        dc = next(s for s in scores if s.supportedMarket == Market.DOUBLE_CHANCE_1X)
        self.assertAlmostEqual(dc.probability, (1 / 1.5 + 1 / 4) / (1 / 1.5 + 1 / 4 + 1 / 6), places=5)

    def test_double_chance_without_result_market(self):
        f = fixture()
        f.markets = f.markets[1:]
        for score in score_fixtures([f], OddsModel()):
            self.assertAlmostEqual(score.probability, 2 / 3, places=5)

    def test_past_fixtures_and_inactive_outcomes_are_skipped(self):
        self.assertEqual(score_fixtures([fixture(kickoffAt='2000-01-01T00:00:00Z')], OddsModel()), [])
        f = fixture()
        for market in f.markets:
            for outcome in market.outcomes:
                outcome.isActive = False
        self.assertEqual(score_fixtures([f], OddsModel()), [])

    def test_training_cutoff_and_model_probability(self):
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / 'matches.csv'
            csv_path.write_text('date,league,homeTeam,awayTeam,homeGoals,awayGoals\n2025-01-01,Test,Home 1,Away 1,2,1\n2099-01-01,Test,Future,Other,9,9\n')
            model_path = Path(directory) / 'model.json'
            artifact = train(csv_path, model_path, date(2026, 1, 1))
            self.assertEqual(artifact['leagues']['Test']['matches'], 1)
            self.assertNotIn('Future', artifact['leagues']['Test']['teams'])
            scores = score_fixtures([fixture()], PoissonModel(str(model_path)))
            self.assertTrue(all(0 < s.probability < 1 for s in scores))
            self.assertTrue(all(s.modelVersion.startswith('poisson-v1-') for s in scores))
            fallback = score_fixtures([fixture('unknown')], PoissonModel(str(model_path)))
            self.assertTrue(all(s.modelVersion == 'odds-v2' for s in fallback))


class GenerationTests(unittest.TestCase):
    def test_unique_ranked_slips_preserve_original_fixtures(self):
        pool = score_fixtures([fixture(str(i)) for i in range(6)], OddsModel())
        config = Config(numberOfSlips=5, minimumOdds=2, maximumOdds=8, maximumSelections=3)
        original = [Selection(eventId=str(i), marketId='1', outcomeId='1') for i in range(3)]
        results = generate(pool, config, original)
        self.assertGreater(len(results), 0)
        self.assertEqual(len({r['fingerprint'] for r in results}), len(results))
        self.assertEqual([r['slipScore'] for r in results], sorted([r['slipScore'] for r in results], reverse=True))
        for slip in results:
            events = [s['eventId'] for s in slip['selections']]
            self.assertEqual(len(set(events)), len(events))
            self.assertTrue(set(events) <= {'0', '1', '2'})
            self.assertTrue(2 <= slip['totalOdds'] <= 8)

    def test_excluded_teams_never_returned(self):
        pool = score_fixtures([fixture(str(i)) for i in range(4)], OddsModel())
        results = generate(pool, Config(minimumOdds=1.1, maximumOdds=10, excludedTeams=['Home 1']), [])
        self.assertTrue(all(s['eventId'] != '1' for r in results for s in r['selections']))


class HttpTests(unittest.TestCase):
    def test_service_contract(self):
        with patch.dict(os.environ, {'PREDICTION_MODEL': 'odds', 'INTENT_PROVIDER': 'rules', 'AI_PROVIDER': 'rules'}), TestClient(app) as client:
            self.assertEqual(client.get('/health').json()['modelVersion'], 'odds-v2')
            config = client.post('/intent', json={'instruction': 'Create 3 slips between 2 and 8 odds'}).json()
            response = client.post('/generate', json={'fixtures': [fixture(str(i)).model_dump(mode='json') for i in range(4)], 'config': config})
            self.assertEqual(response.status_code, 200)
            self.assertGreater(len(response.json()['candidates']), 0)
            self.assertEqual(client.post('/generate', json={'fixtures': [], 'config': {'numberOfSlips': 999}}).status_code, 422)


if __name__ == '__main__':
    unittest.main()
