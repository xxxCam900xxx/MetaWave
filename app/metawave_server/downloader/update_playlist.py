import os
import subprocess
import json

PLAYLIST_URL = os.environ["PLAYLIST_URL"]
SONGS_DIR = "/songs"
METADATA_FILE = os.path.join(SONGS_DIR, "metadata.json")

os.makedirs(SONGS_DIR, exist_ok=True)

cmd = [
    "yt-dlp",
    "--ignore-errors",
    "-x",
    "--audio-format", "mp3",
    "--audio-quality", "0",
    "--write-info-json",          # JSON-Metadaten speichern
    "-o", f"{SONGS_DIR}/%(title)s.%(ext)s",
    PLAYLIST_URL
]

subprocess.run(cmd, check=True)

# Optional: Metadaten zusammenfassen
metadata = []
for file in os.listdir(SONGS_DIR):
    if file.endswith(".info.json"):
        with open(os.path.join(SONGS_DIR, file), "r", encoding="utf-8") as f:
            data = json.load(f)
            # Datei korrekt zu .mp3 mappen
            filename = file.replace(".info.json", ".mp3")
            metadata.append({
                "title": data.get("title"),
                "author": data.get("uploader"),
                "duration": data.get("duration"),   # Sekunden
                "cover": data.get("thumbnail"),
                "filename": filename
            })

with open(METADATA_FILE, "w", encoding="utf-8") as f:
    json.dump(metadata, f, indent=2)