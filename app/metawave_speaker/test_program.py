import io
import json
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

from history import mark_played, unseen
from llm_client import LLMError, NewsItem, OUTRO, generate_script
from markets import fetch_quote
from program import DEFAULTS, select_program
from scheduler import ZONE
from speech import clean
from weather import fetch_weather


class ProgramTests(unittest.TestCase):
    def test_week_plan_selects_all_slots_and_uses_zurich_time(self):
        topics = [NewsItem("Tech KI Software kuriose Panne", "Details", "Quelle")]
        expected = [
            ["morgen_kompass", "tech_markt_radar", "klugscheisser_60s", "feierabend_lounge"],
            ["morgen_kompass", "deep_dive", "realitaets_check", "tech_markt_radar"],
            ["morgen_kompass", "klugscheisser_60s", "presseschau_absurd", "feierabend_lounge"],
            ["morgen_kompass", "tech_markt_radar", "kleiner_weltuntergang", "deep_dive"],
            ["morgen_kompass", "klugscheisser_60s", "realitaets_check", "presseschau_absurd"],
            ["feierabend_lounge", "deep_dive", "presseschau_absurd", "kleiner_weltuntergang"],
            ["klugscheisser_60s", "deep_dive", "realitaets_check", "feierabend_lounge"],
        ]
        from datetime import timedelta
        monday = datetime(2026, 11, 23, 8, tzinfo=ZONE)
        for day in range(7):
            for index, hour in enumerate((8, 10, 14, 16)):
                target = (monday + timedelta(days=day)).replace(hour=hour).astimezone(timezone.utc)
                self.assertEqual(select_program(target, DEFAULTS["week_plan"], topics)[0], expected[day][index])

    def test_unsuitable_news_and_weekend_tech_fall_back(self):
        from copy import deepcopy
        plan = deepcopy(DEFAULTS["week_plan"])
        target = datetime(2026, 11, 24, 16, tzinfo=ZONE)
        item = NewsItem("Politik im Parlament", "", "Quelle")
        self.assertEqual(select_program(target, plan, [item])[0], "feierabend_lounge")
        plan["saturday"]["10:00"] = "tech_markt_radar"
        self.assertEqual(select_program(datetime(2026, 11, 28, 10, tzinfo=ZONE), plan, [item])[0], "feierabend_lounge")

    def test_history_deduplicates_by_title_and_url_only_on_that_swiss_day(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "history.json"
            target = datetime(2026, 11, 23, 8, tzinfo=ZONE)
            first = NewsItem("  Gleiche Meldung! ", "", "Eins", "https://example.test/a")
            duplicate = NewsItem("gleiche meldung", "", "Zwei", "https://example.test/b")
            new = NewsItem("Andere Meldung", "", "Drei", "https://example.test/c")
            self.assertEqual(unseen([first, duplicate, new], target, path), [first, new])
            mark_played([first.__dict__], target, path)
            self.assertEqual(unseen([duplicate, new], target, path), [new])
            self.assertEqual(unseen([duplicate], datetime(2026, 11, 24, 8, tzinfo=ZONE), path), [duplicate])
            path.write_text("[]", encoding="utf-8")
            with self.assertRaises(ValueError):
                unseen([first], target, path)

    def test_weather_maps_codes_and_uses_the_target_day(self):
        data = {"current": {"time": "2026-11-23T07:00", "temperature_2m": 4, "weather_code": 61},
                "daily": {"time": ["2026-11-23"], "weather_code": [3],
                          "temperature_2m_min": [1], "temperature_2m_max": [7]},
                "hourly": {"time": ["2026-11-23T18:00"], "weather_code": [2], "temperature_2m": [3]}}
        with patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(data).encode())):
            result = fetch_weather(47.3, 8.5, "Zürich", datetime(2026, 11, 23, 8, tzinfo=ZONE))
        self.assertEqual((result["aktuell"], result["prognose"], result["maximum_grad"]), ("leichter Regen", "bedeckt", 7))
        self.assertEqual((result["abend"], result["abend_grad"]), ("teilweise bewölkt", 3))

    def test_quote_uses_preceding_session_close_not_start_of_range(self):
        timestamps = [int(datetime(2026, 11, day, 15, tzinfo=timezone.utc).timestamp()) for day in (18, 19, 20)]
        data = {"chart": {"result": [{"meta": {"regularMarketPrice": 105, "regularMarketTime": timestamps[-1],
                "exchangeTimezoneName": "Europe/Zurich", "currency": "CHF", "chartPreviousClose": 70},
                "timestamp": timestamps, "indicators": {"quote": [{"close": [90, 100, 105]}]}}]}}
        with patch("urllib.request.urlopen", return_value=io.BytesIO(json.dumps(data).encode())):
            quote = fetch_quote("^SSMI", "SMI")
        self.assertEqual(quote["vorheriger_schluss"], 100)
        self.assertAlmostEqual(quote["veraenderung_prozent"], 5)

    def test_spoken_text_removes_markup_and_converts_numeric_notation(self):
        result = clean("**Wetter:** 14°C, +1.4%, 08:00 Uhr und 42 CHF. 🌤 https://example.org (Quelle: X) (SRF)", ["SRF"])
        self.assertIn("vierzehn Grad", result)
        self.assertIn("plus eins Komma vier Prozent", result)
        self.assertIn("acht Uhr", result)
        self.assertIn("zweiundvierzig Schweizer Franken", result)
        self.assertNotRegex(result, r"[\d*#%°]")
        self.assertNotIn("https", result)
        self.assertNotIn("SRF", result)
        self.assertNotIn("Uhr Uhr", result)

    def test_empty_data_gets_safe_deterministic_fallback_without_llm(self):
        program = DEFAULTS["formats"]["feierabend_lounge"]
        with patch("urllib.request.urlopen", side_effect=AssertionError("LLM must not be called")):
            result = generate_script([], datetime(2026, 11, 23, 16, tzinfo=ZONE),
                                     program=program, host=DEFAULTS["hosts"]["elena"])
        self.assertIn("keine neuen Meldungen", result)
        self.assertTrue(result.endswith(OUTRO))

    def test_dialog_requires_real_speaker_segments_and_preserves_outro(self):
        program = DEFAULTS["formats"]["morgen_kompass"]
        response = io.BytesIO(json.dumps({"message": {"content": "[HOST_A]: Hallo 14°C.\n[HOST_B]: Danke!"}}).encode())
        with patch("urllib.request.urlopen", return_value=response):
            script = generate_script([NewsItem("Nachricht", "", "Quelle")], datetime(2026, 11, 23, 8, tzinfo=ZONE),
                                     program=program, host=DEFAULTS["hosts"]["lukas"],
                                     cohost=DEFAULTS["hosts"]["elena"], dialog=True)
        self.assertIn("[HOST_B]: Danke!", script)
        self.assertIn("vierzehn Grad", script)
        self.assertTrue(script.endswith(OUTRO))
        response = io.BytesIO(b'{"message":{"content":"Unmarkierter Text"}}')
        with patch("urllib.request.urlopen", return_value=response), self.assertRaises(LLMError):
            generate_script([NewsItem("Meldung", "", "Quelle")], datetime(2026, 11, 23, 8, tzinfo=ZONE), program=program,
                            host=DEFAULTS["hosts"]["lukas"], cohost=DEFAULTS["hosts"]["elena"], dialog=True)


if __name__ == "__main__":
    unittest.main()
