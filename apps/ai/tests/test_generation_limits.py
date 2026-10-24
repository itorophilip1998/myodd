import unittest
from unittest.mock import patch
from app.schemas import Config, Instruction, SplitInput
from app.intent import parse_intent, parse_rules
from app.generation_limits import requested_ticket_count


class GenerationLimitTests(unittest.TestCase):
    def test_one_and_ten_tickets_with_fifty_games(self):
        for count in (1, 10):
            self.assertEqual(Config(numberOfSlips=count, minimumSelections=50, maximumSelections=50).numberOfSlips, count)
            self.assertEqual(parse_rules(f'Create {count} tickets with 50 games per ticket').numberOfSlips, count)
        self.assertIsNone(requested_ticket_count('50 games per ticket'))
        with patch('app.intent._parse_intent', return_value=Config(numberOfSlips=1)):
            self.assertEqual(parse_intent('Create one ticket', [], {'ticketCount': 10}).numberOfSlips, 1)

    def test_oversized_numeric_and_written_prompts_reject_before_provider(self):
        with patch('app.intent._parse_intent') as provider:
            for text in ['Create 11 tickets', 'Create eleven tickets', 'Create 50 lower-risk slips', 'split ABC123 into thirteen', 'Create twenty-five unique codes']:
                with self.assertRaisesRegex(ValueError, 'up to 10 tickets'):
                    parse_intent(text)
                with self.assertRaises(ValueError):
                    Instruction(instruction=text)
            provider.assert_not_called()

    def test_output_models_reject_eleven(self):
        with self.assertRaises(ValueError):
            Config(numberOfSlips=11)
        with self.assertRaises(ValueError):
            SplitInput(parts=11, fixtures=[], config=Config())
        for count in (1, 10):
            self.assertEqual(SplitInput(parts=count, fixtures=[], config=Config()).parts, count)

    def test_legacy_preferences_preserve_games_and_limit_outputs(self):
        value = Instruction(instruction='Use upcoming games', learnedDefaults={'ticketCount': 50, 'gamesPerTicket': 50})
        self.assertEqual(value.learnedDefaults.ticketCount, 10)
        self.assertEqual(value.learnedDefaults.gamesPerTicket, 50)
