import os
import subprocess

PLAYLIST_URL = os.getenv("PLAYLIST_URL")
SONGS_DIR = "/songs"

os.makedirs(SONGS_DIR, exist_ok=True)

cmd = [
    "yt-dlp",
    "-x",
    "--audio-format", "mp3",
    "-o", f"{SONGS_DIR}/%(title)s.%(ext)s",
    PLAYLIST_URL
]

subprocess.run(cmd, check=True)