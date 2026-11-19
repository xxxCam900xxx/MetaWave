import io
import json
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

from llm_client import LLMError, NewsItem, OUTRO, generate_script


class LLMClientTests(unittest.TestCase):
    def test_target_time_and_exact_outro_are_added_to_model_news(self):
        response = io.BytesIO(json.dumps({"message": {"content": "Die Nachricht."}}).encode())
        with patch("urllib.request.urlopen", return_value=response) as request:
            result = generate_script(
                [NewsItem("Titel", "Inhalt", "Quelle")],
                datetime(2026, 11, 19, 8, 0, tzinfo=timezone.utc),
            )
        self.assertEqual(result, f"Guten Morgen und willkommen bei MetaWave Radio, eurem Sender für die besten Hits. Ich bin Alex und hier ist euer MetaWave Update um acht Uhr.\n\nDie Nachricht.\n\n{OUTRO}")
        payload = json.loads(request.call_args.args[0].data)
        self.assertEqual(json.loads(payload["messages"][1]["content"]), [{"titel": "Titel", "zusammenfassung": "Inhalt"}])
        self.assertIn("Nenne keine Nachrichtenquellen", payload["messages"][0]["content"])

    def test_spoken_times_use_the_target_time(self):
        examples = [(0, 0, "Hallo", "null Uhr"), (1, 1, "Hallo", "ein Uhr eins"),
                    (14, 30, "Guten Tag", "vierzehn Uhr dreissig"),
                    (21, 21, "Guten Abend", "einundzwanzig Uhr einundzwanzig")]
        for hour, minute, greeting, spoken_time in examples:
            with self.subTest(hour=hour, minute=minute):
                response = io.BytesIO(b'{"message":{"content":"Nachrichten."}}')
                with patch("urllib.request.urlopen", return_value=response):
                    result = generate_script(
                        [NewsItem("Titel", "", "Quelle")],
                        datetime(2026, 11, 19, hour, minute, tzinfo=timezone.utc),
                    )
                self.assertIn(f"{greeting} und willkommen bei MetaWave Radio", result)
                self.assertIn(f"Ich bin Alex und hier ist euer MetaWave Update um {spoken_time}.", result)

    def test_requires_news_and_timezone(self):
        with self.assertRaises(ValueError):
            generate_script([], datetime.now(timezone.utc))
        with self.assertRaises(ValueError):
            generate_script([NewsItem("Titel", "", "Quelle")], datetime(2026, 1, 1))

    def test_empty_model_response_is_an_error(self):
        response = io.BytesIO(b'{"message":{"content":" "}}')
        with patch("urllib.request.urlopen", return_value=response):
            with self.assertRaises(LLMError):
                generate_script([NewsItem("Titel", "", "Quelle")], datetime.now(timezone.utc))


if __name__ == "__main__":
    unittest.main()
