"""Shared senior hygiene for mystical Over modes."""
from __future__ import annotations

import unittest

from app.llms.senior_hygiene import is_weak_competition, passes_senior_hygiene


class SeniorHygieneTests(unittest.TestCase):
    def test_allows_senior_comps(self):
        self.assertTrue(passes_senior_hygiene('ENGLAND: Premier League', 'England', home='Arsenal', away='Chelsea'))
        self.assertTrue(passes_senior_hygiene('EUROPE: UEFA Nations League - League A', 'Europe', home='Spain', away='England'))
        self.assertTrue(passes_senior_hygiene('NETHERLANDS: Eerste Divisie', home='Almere City', away='Helmond'))
        self.assertTrue(passes_senior_hygiene('SCOTLAND: Championship', home='Ayr', away='Raith'))

    def test_allows_women_oberliga_and_turkish_third(self):
        self.assertFalse(is_weak_competition('ENGLAND: WSL 2', home='Nottingham W', away='Leicester W'))
        self.assertFalse(is_weak_competition('Italy: Serie A, Women', home='AS Roma W', away='Parma W'))
        self.assertFalse(is_weak_competition('Scotland: Premier League', home='Heart of Midlothian WFC', away='Hibernian LFC'))
        self.assertFalse(is_weak_competition('GERMANY: Oberliga Bayern', home='Bayern II', away='Augsburg II'))
        self.assertFalse(is_weak_competition('TURKEY: 3. Lig Group 1', home='Some FK', away='Other SK'))
        self.assertFalse(is_weak_competition('TURKEY: 3 Lig', home='A', away='B'))

    def test_blocks_youth_trophy_lower(self):
        self.assertTrue(is_weak_competition('EUROPE: Euro U19 - Qualification', home='Finland U19', away='Iceland U19'))
        self.assertTrue(is_weak_competition('ENGLAND: FA Trophy', home='Enfield Town', away='Spalding United'))
        self.assertTrue(is_weak_competition('SPAIN: Tercera RFEF - Group 1', home='Gran Pena', away='Viveiro'))
        self.assertTrue(is_weak_competition('NETHERLANDS: Tweede Divisie', home='IJsselmeervogels', away='Barendrecht'))
        self.assertTrue(is_weak_competition('WORLD: Friendly International', home='China', away='Malaysia'))

    def test_blocks_soft_african_pads_only(self):
        self.assertTrue(is_weak_competition('KENYA: Premier League', home='Kakamega Homeboyz', away='KCB'))
        self.assertTrue(is_weak_competition('SENEGAL: Ligue 1', home='Jaraaf', away='Teungueth'))
        self.assertTrue(is_weak_competition('CAMEROON: Elite One', home='Gazelle', away='Stade Renard'))
        self.assertTrue(is_weak_competition('TUNISIA: Ligue 2', home='Korba', away='JS Kairouan'))
        # Keep these — user confirmed still good / not the problem
        self.assertFalse(is_weak_competition('JAPAN: J3 League', home='Kanazawa', away='Kumamoto'))
        self.assertFalse(is_weak_competition('GERMANY: Regionalliga Sudwest', home='Fulda-Lehnerz', away='Offenbach'))
        self.assertFalse(is_weak_competition('EL SALVADOR: Primera Division - Apertura', home='Metapan', away='Firpo'))
        self.assertFalse(is_weak_competition('ITALY: Serie C - Group C', home='Cavese', away='Crotone'))
        self.assertFalse(is_weak_competition('NIGERIA: NPFL', home='Enyimba', away='Ikorodu City'))

    def test_does_not_block_liverpool_fc(self):
        self.assertFalse(is_weak_competition('ENGLAND: Premier League', home='Liverpool', away='Everton'))
        self.assertFalse(is_weak_competition('ENGLAND: Premier League', home='Liverpool FC', away='Chelsea'))


if __name__ == '__main__':
    unittest.main()
