import tempfile
import os
import threading
import time
import unittest
import wave
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

import main
from feeds import _news_item, fetch_feed
from jingle import add_jingles
from llm_client import NewsItem, OUTRO
from scheduler import broadcasts, next_events

UTC = timezone.utc
ZONE = ZoneInfo("Europe/Zurich")


class ScheduleTests(unittest.TestCase):
    def test_preparation_is_one_real_hour_before_broadcast_across_midnight(self):
        now = datetime(2026, 1, 1, 21, 0, tzinfo=UTC)
        prepare, air = next_events(["00:30"], now)
        self.assertEqual(air.astimezone(ZONE).strftime("%d %H:%M"), "02 00:30")
        self.assertEqual(air - prepare, timedelta(hours=1))
        self.assertEqual(prepare.astimezone(ZONE).strftime("%d %H:%M"), "01 23:30")

    def test_spring_gap_is_skipped_and_autumn_fold_is_sent_once(self):
        spring = broadcasts(["02:30"], datetime(2026, 3, 29, 0, tzinfo=UTC), 1)
        autumn = broadcasts(["02:30"], datetime(2026, 10, 25, 0, tzinfo=UTC), 1)
        self.assertEqual(spring, [])
        self.assertEqual(autumn, [datetime(2026, 10, 25, 0, 30, tzinfo=UTC)])


class FeedSecurityTests(unittest.TestCase):
    def test_private_addresses_are_rejected_before_connection(self):
        address = [(2, 1, 6, "", ("127.0.0.1", 80))]
        with patch("feeds.socket.getaddrinfo", return_value=address), patch("feeds.socket.create_connection") as connect:
            with self.assertRaises(ValueError):
                fetch_feed("http://example.test/rss")
            connect.assert_not_called()

    def test_only_confirmed_publisher_attribution_is_removed(self):
        entry = {
            "title": "Die Stadt prüft einen Plan - Beispiel Medien",
            "summary": "<a>Die Stadt prüft einen Plan</a> <font>Beispiel Medien</font>",
            "source": {"title": "Beispiel Medien"},
        }
        item = _news_item(entry, "Google News")
        self.assertEqual(item.title, "Die Stadt prüft einen Plan")
        self.assertEqual(item.summary, "Die Stadt prüft einen Plan")
        self.assertEqual(item.source, "Beispiel Medien")

        entry["title"] = "Die Stadt diskutiert über Beispiel Medien"
        entry["summary"] = "Die Stadt diskutiert über Beispiel Medien"
        item = _news_item(entry, "Google News")
        self.assertEqual(item.title, entry["title"])
        self.assertEqual(item.summary, entry["summary"])

    def test_publisher_branding_is_removed_without_changing_a_news_subject(self):
        entry = {"title": "heise+ | Tipps für Windows 11", "summary": "Tipps"}
        self.assertEqual(_news_item(entry, "heise online News").title, "Tipps für Windows 11")
        entry["title"] = "heise+ stellt sein neues Angebot vor"
        self.assertEqual(_news_item(entry, "heise online News").title, entry["title"])

    def test_only_safe_absolute_article_links_are_saved(self):
        entry = {"title": "Titel", "link": "https://example.org/article?a=1"}
        self.assertEqual(_news_item(entry, "Quelle").url, entry["link"])
        for link in ("javascript:alert(1)", "/relative", "https://user:pass@example.org/",
                     "https://example.org/\nheader", "http://[invalid"):
            with self.subTest(link=link):
                entry["link"] = link
                self.assertIsNone(_news_item(entry, "Quelle").url)


class JingleTests(unittest.TestCase):
    def test_jingles_surround_the_speech_and_duration_matches_the_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "speech.wav"
            with wave.open(str(path), "wb") as file:
                file.setnchannels(1)
                file.setsampwidth(2)
                file.setframerate(8000)
                file.writeframes(b"\0\0" * 8000)
            duration = add_jingles(path)
            with wave.open(str(path), "rb") as file:
                frames = file.readframes(file.getnframes())
                self.assertAlmostEqual(duration, file.getnframes() / file.getframerate())
            self.assertGreater(duration, 2)
            self.assertNotEqual(frames[:8000], b"\0" * 8000)
            self.assertNotEqual(frames[-8000:-4000], b"\0" * 4000)


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.paths = patch.multiple(main, DATA=root, AUDIO=root / "audio", JOBS=root / "jobs",
                                    CONFIG=root / "config.json", LATEST=root / "latest.json", HISTORY=root / "history.json")
        self.paths.start()
        self.feed = patch("main.fetch_feed", return_value=[NewsItem("Titel", "Inhalt", "Quelle", "https://example.org/artikel")])
        self.llm = patch("main.generate_script", return_value=f"Nachrichten. {OUTRO}")
        self.feed_mock = self.feed.start()
        self.llm.start()
        self.weather = patch("main.fetch_weather", return_value={"ort": "Zürich"})
        self.markets = patch("main.fetch_markets", return_value=[])
        self.weather.start()
        self.markets.start()
        self.tts = patch("main.TTSEngine.render", new=self.render)
        self.tts.start()
        self.client_context = TestClient(main.app)
        self.client = self.client_context.__enter__()

    @staticmethod
    def render(engine, text, output, speaker=None):
        with wave.open(str(output), "wb") as file:
            file.setnchannels(1)
            file.setsampwidth(2)
            file.setframerate(8000)
            file.writeframes(b"\0\0" * (8000 * 60))
        return 60

    def tearDown(self):
        self.client_context.__exit__(None, None, None)
        self.tts.stop()
        self.llm.stop()
        self.feed.stop()
        self.weather.stop()
        self.markets.stop()
        self.paths.stop()
        self.temp.cleanup()

    def test_preview_runs_pipeline_and_is_persisted_without_scheduling_playout(self):
        config = self.client.get("/config").json()
        self.assertFalse(config["enabled"])
        self.assertEqual(config["times"], ["08:00", "10:00", "14:00", "16:00"])
        response = self.client.post("/trigger-prepare")
        self.assertEqual(response.status_code, 202)
        job_id = response.json()["id"]
        for _ in range(100):
            job = self.client.get(f"/jobs/{job_id}").json()
            if job["state"] != "preparing":
                break
            time.sleep(0.02)
        self.assertEqual(job["state"], "ready", job)
        self.assertEqual(self.feed_mock.call_count, 3)
        self.assertEqual(job["items"][0], {"title": "Titel", "summary": "Inhalt", "source": "Quelle", "url": "https://example.org/artikel"})
        self.assertTrue(self.client.get("/audio/latest").content.startswith(b"RIFF"))
        self.assertTrue(self.client.get(f"/jobs/{job_id}/audio").content.startswith(b"RIFF"))
        self.assertIsNone(self.client.post("/internal/due", json={"playing": True}).json()["episode"])
        self.assertEqual(main.Speaker().config.model_dump(), config)

    def test_validation_and_claim_acknowledgement(self):
        config = self.client.get("/config").json()
        invalid = dict(config, times=["25:00"])
        self.assertEqual(self.client.post("/config", json=invalid).status_code, 422)
        now = datetime.now(UTC).replace(second=0, microsecond=0)
        config.update(enabled=True, times=[now.astimezone(ZONE).strftime("%H:%M")])
        self.assertEqual(self.client.post("/config", json=config).status_code, 200)
        target = now
        path = main.job_path(target, main.speaker.config)
        filename = "speaker-" + "a" * 32 + ".wav"
        main.write_json(path, {"state": "ready", "filename": filename, "duration": 12})
        clock = datetime.now(UTC).replace(second=0, microsecond=0) + timedelta(seconds=0.5)
        with patch("main.datetime", wraps=datetime) as mocked_clock:
            mocked_clock.now.return_value = clock
            episode = self.client.post("/internal/due", json={"playing": True}).json()["episode"]
            self.assertEqual(episode["filename"], filename)
            self.assertIsNone(self.client.post("/internal/due", json={"playing": True}).json()["episode"])
        ack = self.client.post("/internal/ack", json={"key": episode["key"], "filename": filename, "played": True})
        self.assertEqual(ack.json()["state"], "played")
        self.assertEqual(main.read_json(path)["state"], "played")

    def test_fixed_feeds_reject_changes_and_migrate_stored_config(self):
        config = self.client.get("/config").json()
        self.assertEqual(config["rss_urls"], main.DEFAULT_FEEDS)
        changed = dict(config, rss_urls=["https://example.org/rss"] * 3)
        response = self.client.post("/config", json=changed)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.get("/config").json(), config)

        main.write_json(main.CONFIG, dict(changed, enabled=True, times=["12:00"]))
        migrated = main.Speaker().config
        self.assertEqual(migrated.rss_urls, main.DEFAULT_FEEDS)
        self.assertTrue(migrated.enabled)
        self.assertEqual(migrated.times, ["12:00"])
        self.assertEqual(main.read_json(main.CONFIG), migrated.model_dump())

    def test_today_program_uses_swiss_date_saved_plan_and_enabled_times(self):
        config = self.client.get("/config").json()
        config["enabled"] = True
        config["times"] = ["08:00", "12:00", "14:00"]
        config["week_plan"]["friday"]["12:00"] = "deep_dive"
        self.assertEqual(self.client.post("/config", json=config).status_code, 200)
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = datetime(2026, 11, 20, 10, 30, tzinfo=ZONE)
            status = self.client.get("/status").json()
        self.assertEqual(status["today_date"], "2026-11-20")
        self.assertEqual(status["next_program"], {
            "date": "2026-11-20", "time": "12:00", "format_id": "deep_dive",
            "name": "Deep Dive: Warum eigentlich?", "host": "Elena", "prepared": False,
        })
        self.assertEqual(
            [(entry["time"], entry["format_id"], entry["host"], entry["is_next"]) for entry in status["today_program"]],
            [("08:00", "morgen_kompass", "Lukas", False),
             ("12:00", "deep_dive", "Elena", True),
             ("14:00", "realitaets_check", "Max", False)],
        )
        config["enabled"] = False
        self.assertEqual(self.client.post("/config", json=config).status_code, 200)
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = datetime(2026, 11, 20, 23, 30, tzinfo=ZONE).astimezone(UTC)
            status = self.client.get("/status").json()
        self.assertEqual(status["today_date"], "2026-11-20")
        self.assertIsNone(status["next_program"])
        self.assertFalse(any(entry["is_next"] for entry in status["today_program"]))

    def test_next_program_can_be_tomorrow_and_shows_prepared_fallback(self):
        config = self.client.get("/config").json()
        config.update(enabled=True, times=["08:00"])
        self.assertEqual(self.client.post("/config", json=config).status_code, 200)
        now = datetime(2026, 11, 20, 23, 30, tzinfo=ZONE)
        target = datetime(2026, 11, 21, 8, 0, tzinfo=ZONE).astimezone(UTC)
        main.write_json(main.job_path(target, main.speaker.config), {
            "state": "ready", "target": target.isoformat(), "format_id": "klugscheisser_60s",
        })
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = now
            status = self.client.get("/status").json()
        self.assertEqual(status["next_program"], {
            "date": "2026-11-21", "time": "08:00", "format_id": "klugscheisser_60s",
            "name": "60 Sekunden Klugscheisser", "host": "Max", "prepared": True,
        })
        self.assertFalse(any(entry["is_next"] for entry in status["today_program"]))

    def test_only_confirmed_playout_updates_history(self):
        target = datetime.now(UTC).replace(second=0, microsecond=0)
        path = main.job_path(target, main.speaker.config)
        filename = "speaker-" + "a" * 32 + ".wav"
        item = {"title": "Ein Thema", "summary": "Details", "source": "Quelle", "url": "https://example.org/a"}
        main.write_json(path, {"state": "claimed", "target": target.isoformat(), "filename": filename, "items": [item]})
        self.assertFalse(main.HISTORY.exists())
        payload = {"key": path.stem, "filename": filename, "played": True}
        self.assertEqual(self.client.post("/internal/ack", json=payload).status_code, 200)
        self.assertEqual(main.unseen([NewsItem(**item)], target, main.HISTORY), [])
        self.assertEqual(self.client.post("/internal/ack", json=payload).status_code, 200)

    def test_playout_history_uses_actual_swiss_day_after_midnight(self):
        target = datetime(2026, 11, 23, 23, 59, tzinfo=ZONE)
        played = datetime(2026, 11, 24, 0, 5, tzinfo=ZONE)
        path = main.job_path(target, main.speaker.config)
        filename = "speaker-" + "a" * 32 + ".wav"
        item = {"title": "Ein Thema", "summary": "Details", "source": "Quelle", "url": "https://example.org/a"}
        main.write_json(path, {"state": "claimed", "target": target.isoformat(), "filename": filename, "items": [item]})
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = played
            response = self.client.post("/internal/ack", json={"key": path.stem, "filename": filename, "played": True})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(main.unseen([NewsItem(**item)], played, main.HISTORY), [])

    def test_song_transition_renders_current_titles_around_the_prepared_bulletin(self):
        config = self.client.get("/config").json()
        config["enabled"] = True
        self.client.post("/config", json=config)
        target = datetime.now(UTC).replace(second=0, microsecond=0)
        path = main.job_path(target, main.speaker.config)
        filename = "speaker-" + "a" * 32 + ".wav"
        self.render(None, "Nachrichten", main.AUDIO / filename)
        main.write_json(path, {"state": "claimed", "filename": filename, "duration": 60})
        spoken = []

        def render(engine, text, output, speaker=None):
            spoken.append(text)
            self.render(engine, text, output)

        payload = {"key": path.stem, "filename": filename, "previous": "Erster Song", "following": "Zweiter Song"}
        with patch.object(main.TTSEngine, "render", new=render):
            response = self.client.post("/internal/transition", json=payload).json()
            for _ in range(100):
                if response["state"] != "preparing":
                    break
                time.sleep(0.02)
                response = self.client.post("/internal/transition", json=payload).json()
        self.assertEqual(response["state"], "ready", response)
        self.assertEqual(spoken, ["Das war Erster Song. Kommen wir zum Programm.",
                                  "Jetzt kommt Zweiter Song. Danke fürs Einschalten!"])
        with wave.open(str(main.AUDIO / response["filename"]), "rb") as audio:
            self.assertEqual(audio.getnframes() / audio.getframerate(), 181)
        self.assertEqual(response["duration"], 181)
        config["enabled"] = False
        self.client.post("/config", json=config)
        self.assertEqual(self.client.post("/internal/transition", json=payload).json()["state"], "failed")

    def test_transition_rejects_invalid_identifiers(self):
        payload = {"key": "../config", "filename": "other.wav", "previous": "A", "following": "B"}
        self.assertEqual(self.client.post("/internal/transition", json=payload).status_code, 400)

    def test_status_uses_next_broadcast_job_not_last_updated_job(self):
        now = datetime.now(UTC).replace(second=0, microsecond=0)
        target = now + timedelta(hours=2)
        later = target + timedelta(hours=1)
        config = self.client.get("/config").json()
        config.update(enabled=True, times=[target.astimezone(ZONE).strftime("%H:%M"),
                                          later.astimezone(ZONE).strftime("%H:%M")])
        self.client.post("/config", json=config)
        first_path = main.job_path(target, main.speaker.config)
        later_path = main.job_path(later, main.speaker.config)
        main.write_json(first_path, {"state": "failed", "target": target.isoformat(), "script": "nicht senden"})
        main.write_json(later_path, {"state": "ready", "target": later.isoformat(), "script": "später"})
        os.utime(first_path, (now.timestamp() - 10, now.timestamp() - 10))
        os.utime(later_path, (now.timestamp(), now.timestamp()))
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = now
            status = self.client.get("/status").json()
        self.assertEqual(status["next_broadcast"], target.isoformat())
        self.assertEqual(status["next_broadcast_state"], "failed")
        self.assertIsNone(status["next_broadcast_script"])
        self.assertEqual(status["last_scheduled"]["state"], "ready")
        items = [{"title": "Artikel", "summary": "Inhalt", "source": "Quelle", "url": "https://example.org/artikel"}]
        main.write_json(first_path, {"state": "ready", "target": target.isoformat(), "script": "Nachrichten", "items": items})
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = now
            status = self.client.get("/status").json()
            self.assertEqual(status["next_broadcast_script"], "Nachrichten")
            self.assertEqual(status["next_broadcast_items"], items)
        main.write_json(first_path, {"state": "failed", "target": target.isoformat(), "script": "Nachrichten", "items": items})
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = now
            self.assertIsNone(self.client.get("/status").json()["next_broadcast_items"])

    def test_status_shows_the_claimed_broadcast_while_waiting_for_a_song_end(self):
        now = datetime.now(UTC).replace(second=0, microsecond=0)
        config = self.client.get("/config").json()
        config.update(enabled=True, times=[now.astimezone(ZONE).strftime("%H:%M"),
                                          (now + timedelta(hours=1)).astimezone(ZONE).strftime("%H:%M")])
        self.client.post("/config", json=config)
        path = main.job_path(now, main.speaker.config)
        main.write_json(path, {"state": "claimed", "target": now.isoformat(), "script": "Aktuelle Nachrichten"})
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = now + timedelta(minutes=4)
            status = self.client.get("/status").json()
        self.assertEqual(status["next_broadcast"], now.isoformat())
        self.assertEqual(status["next_broadcast_state"], "claimed")
        self.assertEqual(status["next_broadcast_script"], "Aktuelle Nachrichten")

    def test_status_returns_latest_played_broadcast_not_preview_or_later_failed_job(self):
        now = datetime.now(UTC).replace(second=0, microsecond=0)
        older = now - timedelta(hours=2)
        newer = now - timedelta(hours=1)
        for target, state, script in ((older, "played", "Älter"), (newer, "played", "Zuletzt"),
                                      (now, "failed", "Nicht gesendet")):
            path = main.job_path(target, main.speaker.config)
            main.write_json(path, {"state": state, "target": target.isoformat(), "script": script})
        main.write_json(main.JOBS / ("preview-" + "a" * 32 + ".json"),
                        {"state": "ready", "target": now.isoformat(), "script": "Vorschau"})
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = now
            result = self.client.get("/status").json()
        self.assertEqual(result["last_broadcast"], {"target": newer.isoformat(), "script": "Zuletzt"})
        items = [{"title": "Artikel", "summary": "Inhalt", "source": "Quelle", "url": "https://example.org/artikel"}]
        path = main.job_path(newer, main.speaker.config)
        main.write_json(path, {"state": "played", "target": newer.isoformat(), "script": "Zuletzt", "items": items})
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = now
            self.assertEqual(self.client.get("/status").json()["last_broadcast"]["items"], items)

    def test_paused_radio_skips_ready_episode(self):
        now = datetime.now(UTC).replace(second=0, microsecond=0)
        config = self.client.get("/config").json()
        config.update(enabled=True, times=[now.astimezone(ZONE).strftime("%H:%M")])
        self.client.post("/config", json=config)
        path = main.job_path(now, main.speaker.config)
        main.write_json(path, {"state": "ready", "filename": "speaker-" + "b" * 32 + ".wav", "duration": 4})
        with patch("main.datetime", wraps=datetime) as mocked_clock:
            mocked_clock.now.return_value = now + timedelta(seconds=0.5)
            self.assertIsNone(self.client.post("/internal/due", json={"playing": False}).json()["episode"])
        self.assertEqual(main.read_json(path)["state"], "skipped")

    def test_scheduled_preparation_starts_one_hour_before_and_is_claimed_at_airtime(self):
        target = datetime.now(UTC).replace(second=0, microsecond=0) + timedelta(hours=1)
        config = self.client.get("/config").json()
        config.update(enabled=True, times=[target.astimezone(ZONE).strftime("%H:%M")])
        self.client.post("/config", json=config)
        path = main.job_path(target, main.speaker.config)
        with patch("main.datetime", wraps=datetime) as clock:
            clock.now.return_value = target - timedelta(hours=1) + timedelta(milliseconds=200)
            for _ in range(50):
                if path.exists() and main.read_json(path).get("state") == "ready":
                    break
                time.sleep(0.05)
            self.assertTrue(path.exists())
            self.assertEqual(main.read_json(path)["state"], "ready")
            self.assertIsNone(self.client.post("/internal/due", json={"playing": True}).json()["episode"])
            clock.now.return_value = target + timedelta(milliseconds=200)
            episode = self.client.post("/internal/due", json={"playing": True}).json()["episode"]
            self.assertIsNotNone(episode)
            self.assertEqual(main.read_json(path)["state"], "claimed")

    def test_failure_is_visible_to_preview_client(self):
        self.feed_mock.side_effect = RuntimeError("RSS nicht erreichbar")
        job_id = self.client.post("/trigger-prepare").json()["id"]
        for _ in range(100):
            job = self.client.get(f"/jobs/{job_id}").json()
            if job["state"] != "preparing":
                break
            time.sleep(0.02)
        self.assertEqual(job["state"], "failed")
        self.assertIn("RSS nicht erreichbar", job["error"])
        self.assertEqual(self.client.get("/audio/latest").status_code, 404)

    def test_too_short_audio_fails_instead_of_being_published(self):
        def short_render(engine, text, output, speaker=None):
            with wave.open(str(output), "wb") as file:
                file.setnchannels(1)
                file.setsampwidth(2)
                file.setframerate(8000)
                file.writeframes(b"\0\0" * 800)
            return 0.1

        with patch.object(main.TTSEngine, "render", new=short_render):
            with self.assertRaisesRegex(ValueError, "10 bis 180"):
                main.speaker.prepare_sync(main.speaker.config, datetime.now(UTC), "speaker-test.wav")
        self.assertFalse((main.AUDIO / "speaker-test.wav").exists())

    def test_too_long_audio_fails_instead_of_being_published(self):
        with patch("main.add_jingles", return_value=180.01):
            with self.assertRaisesRegex(ValueError, "10 bis 180"):
                main.speaker.prepare_sync(main.speaker.config, datetime.now(UTC), "speaker-test.wav")
        self.assertFalse((main.AUDIO / "speaker-test.wav").exists())

    def test_topic_limit_keeps_interleaved_feed_order(self):
        feeds = [[NewsItem(f"{feed}-{index}", "Zusammenfassung", "Quelle", f"https://example.org/{feed}-{index}") for index in range(count)]
                 for feed, count in enumerate((3, 1, 2))]
        self.feed_mock.side_effect = feeds
        with patch("main.generate_script", return_value="Text") as generate:
            result = main.speaker.prepare_sync(main.speaker.config, datetime(2026, 11, 23, 8, tzinfo=ZONE), "speaker-test.wav")
        self.assertEqual([item.title for item in generate.call_args.args[0]],
                         ["0-0", "1-0", "2-0"])
        self.assertEqual(result["items"][0], {"title": "0-0", "summary": "Zusammenfassung",
                                             "source": "Quelle", "url": "https://example.org/0-0"})

    def test_next_day_cleanup_keeps_future_and_recent_broadcasts(self):
        now = datetime(2026, 1, 2, 0, 1, tzinfo=ZONE)
        old = now - timedelta(hours=8)
        future = now + timedelta(minutes=29)
        recent = now - timedelta(minutes=2)
        records = []
        for letter, target in (("a", old), ("b", future), ("c", recent)):
            filename = f"speaker-{letter * 32}.wav"
            audio = main.AUDIO / filename
            audio.write_bytes(b"audio")
            path = main.JOBS / f"preview-{letter * 32}.json"
            record = {"id": letter * 32, "state": "ready", "target": target.isoformat(), "filename": filename}
            main.write_json(path, record)
            stamp = old.timestamp()
            os.utime(path, (stamp, stamp))
            os.utime(audio, (stamp, stamp))
            records.append((path, audio, record))
        main.write_json(main.LATEST, records[0][2])
        orphan = main.AUDIO / ("speaker-" + "d" * 32 + ".wav")
        orphan.write_bytes(b"audio")
        os.utime(orphan, (old.timestamp(), old.timestamp()))
        abandoned = main.AUDIO / ("speaker-" + "e" * 32 + ".wav.tmp")
        abandoned.write_bytes(b"audio")
        os.utime(abandoned, (old.timestamp(), old.timestamp()))
        main.speaker.prune(now)
        self.assertFalse(records[0][0].exists())
        self.assertFalse(records[0][1].exists())
        self.assertFalse(main.LATEST.exists())
        self.assertFalse(orphan.exists())
        self.assertFalse(abandoned.exists())
        self.assertTrue(records[1][0].exists())
        self.assertTrue(records[1][1].exists())
        self.assertTrue(records[2][0].exists())
        self.assertTrue(records[2][1].exists())
        main.speaker.prune(now + timedelta(minutes=3))
        self.assertFalse(records[2][0].exists())
        self.assertFalse(records[2][1].exists())

    def test_cleanup_protects_waiting_and_playing_transitions_across_midnight(self):
        now = datetime(2026, 1, 2, 0, 5, tzinfo=ZONE)
        target = now - timedelta(minutes=10)
        original = "speaker-" + "a" * 32 + ".wav"
        combined = "speaker-" + "b" * 32 + ".wav"
        path = main.job_path(target, main.speaker.config)
        main.write_json(path, {"state": "claimed", "target": target.isoformat(), "filename": original})
        for filename in (original, combined):
            audio = main.AUDIO / filename
            audio.write_bytes(b"audio")
            os.utime(audio, (target.timestamp(), target.timestamp()))
        os.utime(path, (target.timestamp(), target.timestamp()))
        main.speaker.transition = {"state": "ready", "signature": (path.stem, original, "A", "B"),
                                   "filename": combined, "duration": 240}
        main.speaker.prune(now)
        self.assertTrue(path.exists())
        self.assertTrue((main.AUDIO / combined).exists())
        record = main.read_json(path)
        record["state"] = "played"
        main.write_json(path, record)
        os.utime(path, (now.timestamp(), now.timestamp()))
        main.speaker.prune(now + timedelta(seconds=200))
        self.assertTrue((main.AUDIO / combined).exists())
        main.speaker.prune(now + timedelta(seconds=271))
        self.assertFalse(path.exists())
        self.assertFalse((main.AUDIO / combined).exists())

    def test_slow_preparation_is_not_aired_late(self):
        target = datetime.now(UTC).replace(second=0, microsecond=0) + timedelta(hours=1)
        config = self.client.get("/config").json()
        config.update(enabled=True, times=[target.astimezone(ZONE).strftime("%H:%M")])
        self.client.post("/config", json=config)
        path = main.job_path(target, main.speaker.config)
        started = threading.Event()
        release = threading.Event()

        def slow_render(engine, text, output, speaker=None):
            started.set()
            if not release.wait(5):
                raise TimeoutError("test renderer timed out")
            return self.render(engine, text, output)

        try:
            with patch.object(main.TTSEngine, "render", new=slow_render), patch("main.datetime", wraps=datetime) as clock:
                clock.now.return_value = target - timedelta(hours=1) + timedelta(milliseconds=200)
                self.assertTrue(started.wait(3))
                clock.now.return_value = target + timedelta(milliseconds=200)
                self.assertIsNone(self.client.post("/internal/due", json={"playing": True}).json()["episode"])
                self.assertEqual(main.read_json(path)["state"], "missed")
                release.set()
                for _ in range(100):
                    if main.speaker.task.done():
                        break
                    time.sleep(0.02)
                self.assertTrue(main.speaker.task.done())
                self.assertEqual(main.read_json(path)["state"], "missed")
                self.assertIsNone(self.client.post("/internal/due", json={"playing": True}).json()["episode"])
        finally:
            release.set()


if __name__ == "__main__":
    unittest.main()
