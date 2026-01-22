import os
import subprocess
import json
import time

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

MAX_RETRIES = 5
INITIAL_DELAY_SECONDS = 60

def is_rate_limit_error(stderr: str) -> bool:
    """Grobe Heuristik, um Rate-Limit-Fehler von yt-dlp zu erkennen."""

    if not stderr:
        return False

    lower = stderr.lower()
    candidates = [
        "rate limit",
        "too many requests",
        "http error 429",
        "429 too many",
    ]
    return any(token in lower for token in candidates)

attempt = 0
delay = INITIAL_DELAY_SECONDS

while True:
    attempt += 1
    print(f"[downloader] Starte yt-dlp (Versuch {attempt}/{MAX_RETRIES})...")

    result = subprocess.run(
        cmd,
        check=False,
        capture_output=True,
        text=True,
    )

    if result.returncode == 0:
        print("[downloader] yt-dlp erfolgreich abgeschlossen.")
        break

    stderr = result.stderr or ""
    stdout = result.stdout or ""
    print(f"[downloader] yt-dlp fehlgeschlagen (Returncode {result.returncode}).")
    if stdout:
        print("[downloader] stdout:\n" + stdout)
    if stderr:
        print("[downloader] stderr:\n" + stderr)

    if attempt >= MAX_RETRIES:
        if is_rate_limit_error(stderr):
            print("[downloader] Max Retries erreicht, Rate-Limit erkannt. Beende erfolgreich, damit Radio starten kann.")
            break
        else:
            print("[downloader] Kein weiterer Retry (Maximum erreicht oder kein Rate-Limit-Fehler). Breche ab.")
            result.check_returncode()  # wirft CalledProcessError

    print(f"[downloader] Rate-Limit erkannt. Warte {delay} Sekunden vor erneutem Versuch...")
    time.sleep(delay)
    delay *= 2  # Exponentielles Backoff


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