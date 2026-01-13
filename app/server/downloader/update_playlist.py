import os
import subprocess

PLAYLIST_URL = os.environ["PLAYLIST_URL"]
SONGS_DIR = "/songs"

os.makedirs(SONGS_DIR, exist_ok=True)

cmd = [
    "yt-dlp",
    "--ignore-errors",
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "-o", f"{SONGS_DIR}/%(title)s.%(ext)s",
    PLAYLIST_URL
]

subprocess.run(cmd, check=True)