import os
import subprocess
import sys
import json
import time
from pathlib import Path

SONGS_DIR = Path("/songs")
METADATA_FILE = SONGS_DIR / "metadata.json"
SONGS_DIR.mkdir(parents=True, exist_ok=True)

# Throttling Einstellungen
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "5"))
BATCH_DELAY_SECONDS = int(os.environ.get("BATCH_DELAY_SECONDS", "60"))
VIDEO_DELAY_SECONDS = int(os.environ.get("VIDEO_DELAY_SECONDS", "5"))

# Retry / backoff (configurable via env)
MAX_RETRIES = int(os.environ.get("MAX_RETRIES", "5"))
INITIAL_DELAY_SECONDS = int(os.environ.get("INITIAL_DELAY_SECONDS", "60"))

# Optional: limit playlist items for testing, e.g. "1-10" or "1,3,5"
PLAYLIST_ITEMS = os.environ.get("PLAYLIST_ITEMS", "")


def is_rate_limit_error(stderr: str) -> bool:
    if not stderr:
        return False
    lower = stderr.lower()
    return any(token in lower for token in [
        "rate limit",
        "too many requests",
        "http error 429",
        "429 too many",
    ])


def run_with_retries(cmd, description: str):
    attempt = 0
    delay = INITIAL_DELAY_SECONDS

    while attempt < MAX_RETRIES:
        attempt += 1
        print(f"[downloader] {description} (Versuch {attempt}/{MAX_RETRIES})")

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True
            )
        except subprocess.CalledProcessError as e:
            stderr = (e.stderr or "") if hasattr(e, 'stderr') else str(e)
            print(stderr)
            if is_rate_limit_error(stderr):
                print(f"[downloader] Rate-Limit erkannt. Warte {delay}s...")
                time.sleep(delay)
                delay *= 2
                continue
            print("[downloader] Nicht-Rate-Limit-Fehler. Überspringe.")
            return False, False
        except Exception as e:
            stderr = str(e)
            print(stderr)
            print("[downloader] Unbekannter Fehler beim Aufruf von yt-dlp. Überspringe.")
            return False, False

        if result.returncode == 0:
            return True, False

        stderr = result.stderr or ""
        print(stderr)

        if is_rate_limit_error(stderr):
            print(f"[downloader] Rate-Limit erkannt. Warte {delay}s...")
            time.sleep(delay)
            delay *= 2
            continue

        # Kein Rate-Limit → einfach fehlschlagen, aber Container nicht crashen
        print("[downloader] Nicht-Rate-Limit-Fehler. Überspringe.")
        return False, False

    return False, True


def get_playlist_entries(playlist_url: str):
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--ignore-errors",
        "--flat-playlist",
        "-J",
    ]

    if PLAYLIST_ITEMS:
        cmd += ["--playlist-items", PLAYLIST_ITEMS]

    cmd.append(playlist_url)

    success, rate_limited = run_with_retries(cmd, "Playlist laden")

    if not success:
        print("[downloader] Playlist konnte nicht geladen werden.")
        return []

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        data = json.loads(result.stdout)
    except Exception as e:
        print(f"[downloader] Fehler beim Auslesen der Playlist-Ausgabe: {e}")
        return []

    entries = data.get("entries") or []
    urls = []

    for entry in entries:
        vid = entry.get("id")
        if vid:
            urls.append(f"https://www.youtube.com/watch?v={vid}")

    print(f"[downloader] {len(urls)} Videos gefunden.")
    return urls


def video_already_downloaded(video_id: str):
    for file in SONGS_DIR.glob("*.info.json"):
        try:
            with open(file, "r", encoding="utf-8") as f:
                if video_id in f.read():
                    return True
        except:
            continue
    return False


def download_video(video_url, index, total):
    video_id = video_url.split("v=")[-1]

    print(f"[downloader] ({index}/{total}) {video_url}")

    if video_already_downloaded(video_id):
        print("[downloader] Bereits vorhanden – überspringe")
        return True, False

    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--ignore-errors",
        "--js-runtimes", "node",
        "-N", "1",
        "--sleep-interval", "5",
        "--max-sleep-interval", "15",
        "--extractor-args", "youtube:player_client=android",
        "-f", "bestaudio/best",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--write-info-json",
        "-o", f"{SONGS_DIR}/%(title)s.%(ext)s",
        video_url
    ]

    return run_with_retries(cmd, f"Download {index}/{total}")


def download_in_batches(video_urls):
    total = len(video_urls)
    downloaded = 0
    processed = 0
    start_time = time.time()

    for batch_start in range(0, total, BATCH_SIZE):
        batch = video_urls[batch_start:batch_start + BATCH_SIZE]
        batch_number = batch_start // BATCH_SIZE + 1

        print(f"[downloader] --- Batch {batch_number} ---")

        for i, url in enumerate(batch, start=batch_start + 1):
            success, rate_limited = download_video(url, i, total)

            processed += 1

            if rate_limited:
                print("[downloader] Rate-Limit nach mehreren Versuchen — überspringe Video.")
                # Nach mehrfachen Retries weiterhin Rate-Limit: Video überspringen
                continue

            if success:
                downloaded += 1

            time.sleep(VIDEO_DELAY_SECONDS)

        # Nach jedem Batch eine grobe Restzeitschätzung ausgeben
        remaining = total - processed
        elapsed = time.time() - start_time
        if processed > 0 and remaining > 0 and elapsed > 0:
            avg_per_video = elapsed / processed
            eta_seconds = int(avg_per_video * remaining)
            eta_minutes, eta_seconds = divmod(eta_seconds, 60)
            eta_hours, eta_minutes = divmod(eta_minutes, 60)
            print(
                f"[downloader] Geschätzte verbleibende Zeit: "
                f"{eta_hours}h {eta_minutes}m {eta_seconds}s für ~{remaining} Videos"
            )
        elif remaining == 0:
            print("[downloader] Geschätzte verbleibende Zeit: 0h 0m 0s (alle Videos verarbeitet)")

        if batch_start + BATCH_SIZE < total:
            print(f"[downloader] Warte {BATCH_DELAY_SECONDS}s bis nächster Batch")
            time.sleep(BATCH_DELAY_SECONDS)

    print(f"[downloader] Fertig. {downloaded}/{total} verarbeitet.")


def build_metadata():
    metadata = []

    for file in SONGS_DIR.glob("*.info.json"):
        try:
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)

            mp3_file = file.with_suffix("").with_suffix(".mp3")

            metadata.append({
                "title": data.get("title"),
                "author": data.get("uploader"),
                "duration": data.get("duration"),
                "cover": data.get("thumbnail"),
                "filename": mp3_file.name
            })
        except:
            continue

    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"[downloader] Metadata erstellt ({len(metadata)} Einträge).")


if __name__ == "__main__":
    playlist_url = os.environ.get("PLAYLIST_URL")

    if not playlist_url:
        print("[downloader] Fehler: PLAYLIST_URL ist nicht gesetzt. Prüfe .env im metawave_server-Verzeichnis.")
        raise SystemExit(1)

    print("[downloader] Starte Playlist-Downloader...")

    print(f"[downloader] Konfiguration: BATCH_SIZE={BATCH_SIZE}, BATCH_DELAY_SECONDS={BATCH_DELAY_SECONDS}, VIDEO_DELAY_SECONDS={VIDEO_DELAY_SECONDS}, MAX_RETRIES={MAX_RETRIES}, INITIAL_DELAY_SECONDS={INITIAL_DELAY_SECONDS}, PLAYLIST_ITEMS='{PLAYLIST_ITEMS}'")

    urls = get_playlist_entries(playlist_url)
    download_in_batches(urls)
    build_metadata()