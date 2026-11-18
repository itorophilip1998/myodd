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

    def test_allows_women_j3_and_turkish_third(self):
        self.assertFalse(is_weak_competition('ENGLAND: WSL 2', home='Nottingham W', away='Leicester W'))
        self.assertFalse(is_weak_competition('Italy: Serie A, Women', home='AS Roma W', away='Parma W'))
        self.assertFalse(is_weak_competition('Scotland: Premier League', home='Heart of Midlothian WFC', away='Hibernian LFC'))
        self.assertFalse(is_weak_competition('JAPAN: J3 League', home='Kanazawa', away='Kumamoto'))
        self.assertFalse(is_weak_competition('TURKEY: 3. Lig Group 1', home='Some FK', away='Other SK'))
        self.assertFalse(is_weak_competition('TURKEY: 3 Lig', home='A', away='B'))

    def test_blocks_youth_trophy_lower(self):
        self.assertTrue(is_weak_competition('EUROPE: Euro U19 - Qualification', home='Finland U19', away='Iceland U19'))
        self.assertTrue(is_weak_competition('ENGLAND: FA Trophy', home='Enfield Town', away='Spalding United'))
        self.assertTrue(is_weak_competition('SPAIN: Tercera RFEF - Group 1', home='Gran Pena', away='Viveiro'))
        self.assertTrue(is_weak_competition('NETHERLANDS: Tweede Divisie', home='IJsselmeervogels', away='Barendrecht'))
        self.assertTrue(is_weak_competition('WORLD: Friendly International', home='China', away='Malaysia'))

    def test_africa_only_egypt_and_south_africa_first(self):
        self.assertTrue(is_weak_competition('KENYA: Premier League', home='Kakamega Homeboyz', away='KCB'))
        self.assertTrue(is_weak_competition('ZAMBIA: Super League', home='ZESCO', away='Red Arrows'))
        self.assertTrue(is_weak_competition('LIBERIA: LFA First Division', home='Downtown', away='Shaita'))
        self.assertTrue(is_weak_competition('BURUNDI: Primus League', home='Bumamuru', away='Inter Star'))
        self.assertTrue(is_weak_competition('MOROCCO: Botola Pro', home='Wydad', away='Raja'))
        self.assertTrue(is_weak_competition('EGYPT: Division 2 A', home='Tersana', away='WE SC'))
        self.assertTrue(is_weak_competition('AFRICA: Africa Cup of Nations - Qualification', home='Egypt', away='Malawi'))
        self.assertTrue(is_weak_competition('NIGERIA: NPFL', home='Enyimba', away='Ikorodu City'))
        self.assertTrue(is_weak_competition('TUNISIA: Ligue Professionnelle 1', home='Esperance', away='Club Africain'))
        # Only Egypt + South Africa first division stay on
        self.assertFalse(is_weak_competition('EGYPT: Premier League', home='Al Ahly', away='Zamalek'))
        self.assertFalse(is_weak_competition('SOUTH AFRICA: Premiership', home='Mamelodi Sundowns', away='Kaizer Chiefs'))
        self.assertFalse(is_weak_competition('JAPAN: J3 League', home='Kanazawa', away='Kumamoto'))
        self.assertFalse(is_weak_competition('EL SALVADOR: Primera Division - Apertura', home='Metapan', away='Firpo'))

    def test_blocks_czech_third_fourth_and_kp(self):
        self.assertTrue(is_weak_competition('CZECH REPUBLIC: 4. liga - Group F', home='Sumperk', away='Novy Jicin'))
        self.assertTrue(is_weak_competition('CZECH REPUBLIC: 3. CFL - Group B', home='Liberec B', away='Caslav'))
        self.assertTrue(is_weak_competition('CZECH REPUBLIC: Jihomoravsky KP', home='Cezava', away='Boskovice - Letovice'))
        self.assertTrue(is_weak_competition('CZECH REPUBLIC: Plzensky KP', home='Vejprnice', away='Horsovsky Tyn'))
        # Senior Czech stays
        self.assertFalse(is_weak_competition('CZECH REPUBLIC: Chance Liga', home='Sparta Prague', away='Slavia Prague'))
        self.assertFalse(is_weak_competition('CZECH REPUBLIC: ChNL', home='Opava', away='Zizkov'))

    def test_blocks_germany_italy_balkans_thin(self):
        self.assertTrue(is_weak_competition('GERMANY: Oberliga Bayern', home='Bayern II', away='Augsburg II'))
        self.assertTrue(is_weak_competition('GERMANY: Regionalliga Bayern', home='Munich 1860', away='Unterhaching'))
        self.assertTrue(is_weak_competition('GERMANY: Regionalliga Sudwest', home='Fulda-Lehnerz', away='Offenbach'))
        self.assertTrue(is_weak_competition('ITALY: Serie C - Group C', home='Cavese', away='Crotone'))
        self.assertTrue(is_weak_competition('ITALY: Serie D - Group H', home='Turris', away='Francavilla'))
        self.assertTrue(is_weak_competition('CROATIA: Druga NL', home='Trnje', away='Dugo Selo'))
        self.assertTrue(is_weak_competition('MONTENEGRO: Druga Liga', home='Zeta', away='Lovcen'))
        # Srpska / Turkey 2. Lig stay — not enough evidence to ban
        self.assertFalse(is_weak_competition('SERBIA: Srpska Liga - Vojvodina', home='Index', away='Dinamo Pancevo'))
        self.assertFalse(is_weak_competition('TURKEY: 2. Lig Red Group', home='Iskenderunspor', away='Karacabey Bld.'))
        self.assertFalse(is_weak_competition('TURKEY: 3. Lig Group 1', home='Some FK', away='Other SK'))
        self.assertFalse(is_weak_competition('GERMANY: Bundesliga', home='Bayern', away='Dortmund'))
        self.assertFalse(is_weak_competition('ITALY: Serie B', home='Palermo', away='Pisa'))

    def test_blocks_usl_championship_not_super_league_women(self):
        self.assertTrue(is_weak_competition(
            'USA: USL Championship - Play Offs', home='El Paso', away='Sacramento Republic',
        ))
        self.assertTrue(is_weak_competition(
            'USA: USL Championship', home='Louisville City', away='Pittsburgh',
        ))
        self.assertFalse(is_weak_competition(
            'USA: USL Super League Women', home='Sporting Jax W', away='DC Power W',
        ))

    def test_does_not_block_liverpool_fc(self):
        self.assertFalse(is_weak_competition('ENGLAND: Premier League', home='Liverpool', away='Everton'))
        self.assertFalse(is_weak_competition('ENGLAND: Premier League', home='Liverpool FC', away='Chelsea'))


if __name__ == '__main__':
    unittest.main()
