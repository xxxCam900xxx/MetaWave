import importlib
import json
import subprocess
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

fake_db = types.ModuleType("db_client")
fake_db.fetch_active_playlists = lambda: []
with patch.dict(sys.modules, {"db_client": fake_db}):
    sync = importlib.import_module("sync_playlist")
with patch.object(Path, "mkdir"):
    downloader = importlib.import_module("update_playlist")


class PlaylistSyncTests(unittest.TestCase):
    def test_failed_or_empty_source_aborts_before_writing_cleanup_or_membership(self):
        playlists = [{"id": 1, "name": "Main", "url": "one"}, {"id": 2, "name": "Season", "url": "two"}]
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            metadata = root / "metadata.json"
            deletion = root / "deleted_videos.json"
            membership = root / "playlist_membership.json"
            metadata.write_text(json.dumps([{"id": "old"}]), encoding="utf-8")
            deletion.write_text('["previous"]', encoding="utf-8")
            membership.write_text('{"1":["old"]}', encoding="utf-8")
            with patch.object(sync, "SONGS_DIR", directory), \
                 patch.object(sync, "METADATA_FILE", str(metadata)), \
                 patch.object(sync, "DELETED_VIDEOS_FILE", str(deletion)), \
                 patch.object(sync, "MEMBERSHIP_FILE", str(membership)), \
                 patch.object(sync, "fetch_active_playlists", return_value=playlists), \
                 patch.object(sync.subprocess, "run", side_effect=[
                     subprocess.CompletedProcess([], 0, stdout="new\nhttps://video\n", stderr=""),
                     subprocess.CalledProcessError(1, ["yt-dlp"], stderr="failed"),
                 ]):
                with self.assertRaises(RuntimeError):
                    sync.main()
            self.assertEqual(deletion.read_text(encoding="utf-8"), '["previous"]')
            self.assertEqual(membership.read_text(encoding="utf-8"), '{"1":["old"]}')

        with patch.object(sync.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, stdout="", stderr="")):
            with self.assertRaises(ValueError):
                sync.fetch_playlist_videos("empty")

    def test_successful_sync_preserves_shared_membership(self):
        playlists = [{"id": 1, "name": "Main", "url": "one"}, {"id": 2, "name": "Season", "url": "two"}]
        with patch.object(sync, "fetch_active_playlists", return_value=playlists), \
             patch.object(sync, "fetch_playlist_videos", side_effect=[
                 {"a": "url-a", "b": "url-b"}, {"b": "url-b", "c": "url-c"},
             ]):
            videos, membership = sync.fetch_all_active_playlists()
        self.assertEqual(set(videos), {"a", "b", "c"})
        self.assertEqual(membership, {"1": ["a", "b"], "2": ["b", "c"]})

    def test_partial_download_is_reported_as_failure(self):
        with patch.object(downloader, "download_video", side_effect=[True, False]), \
             patch.object(downloader, "VIDEO_DELAY_SECONDS", 0), \
             patch.object(downloader, "BATCH_DELAY_SECONDS", 0):
            with self.assertRaisesRegex(RuntimeError, "1 von 2"):
                downloader.download_in_batches(["one", "two"])


if __name__ == "__main__":
    unittest.main()
