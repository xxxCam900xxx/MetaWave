import json
import os
import shutil
import subprocess
import tempfile
import time
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import api_server
import cleanup_deleted
import reanalyze_lufs
import schedule
import sync_playlist
import update_playlist
import verify_downloads
import verify_playlists


class DownloaderTests(unittest.TestCase):
    def test_metadata_rebuild_recovers_completed_files_and_preserves_lufs(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            metadata = root / "metadata.json"
            for name, video_id in (("old", "id-old"), ("new", "id-new")):
                (root / f"{name}.mp3").write_bytes(b"audio")
                (root / f"{name}.info.json").write_text(json.dumps({"id": video_id, "title": name}), encoding="utf-8")
            lufs = {"input_i": -15.0}
            metadata.write_text(json.dumps([{"id": "id-old", "lufs": lufs}]), encoding="utf-8")
            with patch.object(update_playlist, "SONGS_DIR", root), patch.object(update_playlist, "METADATA_FILE", metadata):
                update_playlist.build_metadata()
                data = json.loads(metadata.read_text(encoding="utf-8"))
                self.assertEqual({row["id"] for row in data}, {"id-old", "id-new"})
                self.assertEqual(next(row["lufs"] for row in data if row["id"] == "id-old"), lufs)
                metadata.write_text("{bad", encoding="utf-8")
                with self.assertRaises(RuntimeError):
                    update_playlist.build_metadata()
                self.assertEqual(metadata.read_text(encoding="utf-8"), "{bad")
                metadata.write_text('{"unexpected":[]}', encoding="utf-8")
                with self.assertRaises(RuntimeError):
                    update_playlist.build_metadata()
                self.assertEqual(metadata.read_text(encoding="utf-8"), '{"unexpected":[]}')

    def test_missing_and_invalid_metadata_are_distinguished(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / "metadata.json"
            with patch.object(sync_playlist, "METADATA_FILE", str(file)):
                self.assertEqual(sync_playlist.load_existing_metadata(), {})
                file.write_text('{"songs":"invalid"}', encoding="utf-8")
                with self.assertRaises(ValueError):
                    sync_playlist.load_existing_metadata()

    def test_cleanup_uses_exact_metadata_mapping_not_substring(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name, video_id in (("Old song", "abc"), ("Keep abc song", "other")):
                (root / f"{name}.mp3").write_bytes(b"audio")
                (root / f"{name}.info.json").write_text(json.dumps({"id": video_id}), encoding="utf-8")
            metadata = root / "metadata.json"
            metadata.write_text(json.dumps([
                {"id": "abc", "filename": "Old song.mp3"},
                {"id": "other", "filename": "Keep abc song.mp3"},
            ]), encoding="utf-8")
            deleted = root / "deleted_videos.json"
            deleted.write_text('["abc"]', encoding="utf-8")
            with patch.object(cleanup_deleted, "SONGS_DIR", root), \
                 patch.object(cleanup_deleted, "METADATA_FILE", metadata), \
                 patch.object(cleanup_deleted, "DELETED_VIDEOS_FILE", deleted), \
                 patch.dict(os.environ, {"ALLOW_OFFLINE_CLEANUP": "1"}):
                self.assertEqual(cleanup_deleted.main(), 0)
            self.assertFalse((root / "Old song.mp3").exists())
            self.assertTrue((root / "Keep abc song.mp3").exists())

    def test_cleanup_validates_all_files_before_deleting(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "good.mp3").write_bytes(b"audio")
            (root / "good.info.json").write_text('{"id":"good"}', encoding="utf-8")
            metadata = root / "metadata.json"
            metadata.write_text(json.dumps([
                {"id": "good", "filename": "good.mp3"},
                {"id": "bad", "filename": "../bad.mp3"},
            ]), encoding="utf-8")
            deleted = root / "deleted_videos.json"
            deleted.write_text('["good","bad"]', encoding="utf-8")
            with patch.object(cleanup_deleted, "SONGS_DIR", root), \
                 patch.object(cleanup_deleted, "METADATA_FILE", metadata), \
                 patch.object(cleanup_deleted, "DELETED_VIDEOS_FILE", deleted), \
                 patch.dict(os.environ, {"ALLOW_OFFLINE_CLEANUP": "1"}):
                with self.assertRaises(ValueError):
                    cleanup_deleted.main()
            self.assertTrue((root / "good.mp3").exists())
            self.assertTrue(deleted.exists())

    def test_cleanup_is_blocked_by_default_while_radio_may_use_files(self):
        with tempfile.TemporaryDirectory() as directory:
            deleted = Path(directory) / "deleted_videos.json"
            deleted.write_text('["old"]', encoding="utf-8")
            with patch.object(cleanup_deleted, "DELETED_VIDEOS_FILE", deleted), \
                 patch.dict(os.environ, {"ALLOW_OFFLINE_CLEANUP": "0"}):
                with self.assertRaisesRegex(RuntimeError, "Radio zuerst stoppen"):
                    cleanup_deleted.main()
            self.assertTrue(deleted.exists())

    def test_monthly_schedule_and_hourly_retry_use_swiss_time(self):
        zone = schedule.TIMEZONE
        last_run = datetime(2026, 10, 5, 6, 0, tzinfo=zone).timestamp()
        self.assertFalse(schedule.should_sync(datetime(2026, 11, 1, 5, 59, tzinfo=zone), last_run, None))
        now = datetime(2026, 11, 1, 6, 0, tzinfo=zone)
        self.assertTrue(schedule.should_sync(now, last_run, None))
        self.assertFalse(schedule.should_sync(now, last_run, now.timestamp() - 3599))
        self.assertTrue(schedule.should_sync(now, last_run, now.timestamp() - 3600))
        self.assertFalse(schedule.should_sync(now, now.timestamp(), None))
        self.assertTrue(schedule.should_sync(now, None, None))
        after_dst = datetime(2026, 4, 1, 6, 0, tzinfo=zone)
        march = datetime(2026, 3, 10, 6, 0, tzinfo=zone).timestamp()
        self.assertTrue(schedule.should_sync(after_dst, march, None))

    def test_missing_download_and_changed_playlist_prevent_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = root / "snapshot.json"
            metadata = root / "metadata.json"
            snapshot.write_text(json.dumps({"memberships": {"1": ["one", "two"]}, "active_ids": ["one", "two"]}), encoding="utf-8")
            (root / "one.mp3").write_bytes(b"audio")
            metadata.write_text(json.dumps([{"id": "one", "filename": "one.mp3"}]), encoding="utf-8")
            with patch.object(verify_downloads, "SNAPSHOT_FILE", str(snapshot)), patch.object(verify_downloads, "METADATA_FILE", str(metadata)):
                with self.assertRaisesRegex(RuntimeError, "1 aktive Titel"):
                    verify_downloads.main()
            with patch.object(verify_playlists, "SNAPSHOT_FILE", str(snapshot)), \
                 patch.object(verify_playlists, "fetch_playlist_sources", return_value=(
                     {}, {"1": ["one"]}, {"one"},
                 )):
                with self.assertRaisesRegex(ValueError, "geändert"):
                    verify_playlists.main()

    def test_invalid_snapshots_cannot_authorize_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            snapshot = root / "snapshot.json"
            metadata = root / "metadata.json"
            metadata.write_text("[]", encoding="utf-8")
            for value in ([], {}, {"active_ids": []}, {"active_ids": [None]}):
                snapshot.write_text(json.dumps(value), encoding="utf-8")
                with patch.object(verify_downloads, "SNAPSHOT_FILE", str(snapshot)), \
                     patch.object(verify_downloads, "METADATA_FILE", str(metadata)):
                    with self.assertRaises(ValueError):
                        verify_downloads.main()
            snapshot.write_text('{"memberships":{"1":"one"},"active_ids":["one"]}', encoding="utf-8")
            with patch.object(verify_playlists, "SNAPSHOT_FILE", str(snapshot)), \
                 patch.object(verify_playlists, "fetch_playlist_sources", return_value=(
                     {}, {"1": ["one"]}, {"one"},
                 )):
                with self.assertRaises(ValueError):
                    verify_playlists.main()

    def test_rate_limit_retries_then_stops_batch(self):
        failure = subprocess.CompletedProcess([], 1, stdout="", stderr="HTTP Error 429: Too Many Requests")
        with patch.object(update_playlist.subprocess, "run", return_value=failure) as run, \
             patch.object(update_playlist.time, "sleep") as sleep, \
             patch.object(update_playlist, "MAX_RETRIES", 3), \
             patch.object(update_playlist, "INITIAL_DELAY_SECONDS", 2):
            with self.assertRaises(update_playlist.RateLimitError):
                update_playlist.download_video("https://example.test/video")
            self.assertEqual(run.call_count, 3)
            self.assertEqual([call.args[0] for call in sleep.call_args_list], [2, 4])

    def test_authentication_challenge_stops_batch_and_private_video_is_not_retried(self):
        challenge = subprocess.CompletedProcess([], 1, stdout="", stderr="Sign in to confirm you're not a bot")
        private = subprocess.CompletedProcess([], 1, stdout="", stderr="Private video")
        with patch.object(update_playlist.subprocess, "run", side_effect=[challenge, private]) as run, \
             patch.object(update_playlist, "MAX_RETRIES", 1):
            with self.assertRaises(update_playlist.RateLimitError):
                update_playlist.download_in_batches(["https://example.test/one", "https://example.test/two"])
            self.assertFalse(update_playlist.download_video("https://example.test/private"))
            self.assertEqual(run.call_count, 2)

    def test_manual_sync_is_rejected_if_already_running(self):
        self.assertTrue(api_server._sync_lock.acquire(False))
        try:
            with api_server.app.test_client() as client:
                self.assertEqual(client.post("/sync").status_code, 409)
        finally:
            api_server._sync_lock.release()

    @unittest.skipIf(os.name == "nt", "process groups require POSIX")
    def test_timeout_stops_a_script_and_its_child_process(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            script = root / "slow.py"
            marker = root / "child-finished"
            script.write_text(
                "import subprocess,sys,time\n"
                "subprocess.Popen([sys.executable, '-c', "
                f"\"import pathlib,time; time.sleep(3); pathlib.Path({str(marker)!r}).touch()\"])\n"
                "time.sleep(30)\n", encoding="utf-8",
            )
            with patch.object(api_server, "SCRIPT_DIR", root):
                with self.assertRaises(TimeoutError):
                    api_server._run_script("slow.py", timeout=1)
            time.sleep(3)
            self.assertFalse(marker.exists())

    def test_partial_download_prevents_cleanup_and_retains_failure_state(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "playlist_urls.json").write_text('["one"]', encoding="utf-8")
            calls = []

            def execute(name, **kwargs):
                calls.append(name)
                if name == "sync_playlist.py":
                    return "1"
                if name == "download_chunk.py":
                    raise RuntimeError("download failed")
                return ""

            with patch.object(api_server, "SONGS_DIR", root), \
                 patch.object(api_server, "STATE_FILE", root / "state.json"), \
                 patch.object(api_server, "_run_script", side_effect=execute):
                api_server._sync_status.update(running=True, lastRun=None, lastAttempt=1, lastError=None, log=[])
                self.assertTrue(api_server._sync_lock.acquire(False))
                api_server.run_full_sync()
                state = json.loads((root / "state.json").read_text(encoding="utf-8"))
            self.assertEqual(calls, ["build_metadata.py", "sync_playlist.py", "download_chunk.py", "build_metadata.py"])
            self.assertEqual(state["lastError"], "download failed")
            self.assertIsNone(state["lastRun"])
            self.assertGreater(state["lastAttempt"], 1)

    @unittest.skipUnless(shutil.which("ffmpeg") and os.name != "nt", "requires ffmpeg and executable fixtures")
    def test_complete_pipeline_resumes_and_only_deletes_absent_tracks(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            songs = root / "songs"
            songs.mkdir()
            playlists = root / "playlists.json"
            playlists.write_text(json.dumps([
                {"id": 1, "name": "Main", "url": "https://playlist.test/main", "is_active": True},
                {"id": 2, "name": "Season", "url": "https://playlist.test/season", "is_active": True},
            ]), encoding="utf-8")
            sources = root / "sources.json"
            sources.write_text(json.dumps({
                "https://playlist.test/main": ["main1", "main2"],
                "https://playlist.test/season": ["main1", "season1"],
            }), encoding="utf-8")
            (root / "sitecustomize.py").write_text(
                "import json,os,sys,types\n"
                "db=types.ModuleType('db_client')\n"
                "db.fetch_all_playlists=lambda: json.load(open(os.environ['TEST_PLAYLISTS']))\n"
                "sys.modules['db_client']=db\n", encoding="utf-8")
            fake = root / "yt-dlp"
            fake.write_text(
                "#!/usr/bin/env python\n"
                "import json,os,subprocess,sys\n"
                "from pathlib import Path\n"
                "args=sys.argv[1:]\n"
                "if '--flat-playlist' in args:\n"
                " sources=json.load(open(os.environ['TEST_SOURCES']))\n"
                " url=next(arg for arg in args if arg in sources)\n"
                " for vid in sources[url]: print(vid); print('https://video.test/'+vid)\n"
                "else:\n"
                " vid=next(arg.rsplit('/',1)[1] for arg in args if arg.startswith('https://video.test/'))\n"
                " root=Path(os.environ['SONGS_DIR'])\n"
                " subprocess.run(['ffmpeg','-loglevel','error','-f','lavfi','-i','sine=frequency=440:duration=1','-y',str(root/(vid+'.mp3'))],check=True)\n"
                " (root/(vid+'.info.json')).write_text(json.dumps({'id':vid,'title':vid,'duration':1}))\n"
                " with open(os.environ['TEST_DOWNLOADS'],'a') as log: log.write(vid+'\\n')\n",
                encoding="utf-8",
            )
            fake.chmod(0o755)
            for video_id in ("main1", "removed"):
                subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i",
                                "sine=frequency=440:duration=1", "-y", str(songs / f"{video_id}.mp3")], check=True)
                (songs / f"{video_id}.info.json").write_text(json.dumps({"id": video_id, "title": video_id}), encoding="utf-8")
            (songs / "metadata.json").write_text("[]", encoding="utf-8")
            env = {
                "SONGS_DIR": str(songs), "TEST_PLAYLISTS": str(playlists), "TEST_SOURCES": str(sources),
                "TEST_DOWNLOADS": str(root / "downloads.txt"), "PYTHONPATH": str(root),
                "PATH": str(root) + os.pathsep + os.environ["PATH"], "YT_COOKIES": "",
                "VIDEO_DELAY_SECONDS": "0", "BATCH_DELAY_SECONDS": "0", "ALLOW_OFFLINE_CLEANUP": "1",
            }
            with patch.dict(os.environ, env), patch.object(api_server, "SONGS_DIR", songs), \
                 patch.object(api_server, "STATE_FILE", songs / ".metawave-downloader" / "state.json"):
                for _ in range(2):
                    api_server._sync_status.update(running=True, lastRun=None, lastAttempt=1, lastError=None, log=[])
                    self.assertTrue(api_server._sync_lock.acquire(False))
                    api_server.run_full_sync()
                    self.assertIsNone(api_server._sync_status["lastError"])
                downloaded = (root / "downloads.txt").read_text(encoding="utf-8").splitlines()
                self.assertCountEqual(downloaded, ["main2", "season1"])
                data = json.loads((songs / "metadata.json").read_text(encoding="utf-8"))
                self.assertEqual({row["id"] for row in data}, {"main1", "main2", "season1"})
                self.assertTrue(all(row["lufs"] is not None for row in data))
                self.assertFalse((songs / "removed.mp3").exists())
                self.assertTrue((songs / "main1.mp3").exists())

    @unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg unavailable")
    def test_real_ffmpeg_lufs_is_saved_and_reused(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            audio = root / "test.mp3"
            subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i",
                            "sine=frequency=440:duration=1", "-y", str(audio)], check=True)
            metadata = root / "metadata.json"
            metadata.write_text(json.dumps([{"id": "test", "filename": audio.name, "lufs": None}]), encoding="utf-8")
            with patch.object(reanalyze_lufs, "SONGS_DIR", root), patch.object(reanalyze_lufs, "METADATA_FILE", metadata):
                self.assertTrue(reanalyze_lufs.reanalyze_all_songs())
                data = json.loads(metadata.read_text(encoding="utf-8"))
                self.assertIsInstance(data[0]["lufs"]["input_i"], float)
                with patch.object(reanalyze_lufs, "analyze_lufs", side_effect=AssertionError("reanalyzed")):
                    self.assertTrue(reanalyze_lufs.reanalyze_all_songs())


if __name__ == "__main__":
    unittest.main()
