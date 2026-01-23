import os
import subprocess
import sys
import json
import time
from pathlib import Path

SONGS_DIR = Path("/songs")
METADATA_FILE = SONGS_DIR / "metadata.json"
PLAYLIST_FILE = SONGS_DIR / "playlist_urls.json"
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


def get_downloaded_video_ids() -> set[str]:
    """Liest alle bereits heruntergeladenen Video-IDs aus den vorhandenen .info.json Dateien."""

    ids: set[str] = set()

    for file in SONGS_DIR.glob("*.info.json"):
        try:
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)
            vid = data.get("id")
            if isinstance(vid, str):
                ids.add(vid)
        except Exception:
            # Beschädigte/unerwartete Dateien ignorieren
            continue

    return ids


def flatten_playlist_to_file(playlist_url: str, output_file: Path) -> int:
    """Liest die komplette Playlist und schreibt nur noch nicht heruntergeladene Video-URLs in eine JSON-Datei.

    Bereits vorhandene Downloads werden über vorhandene .info.json Dateien erkannt und gefiltert.
    Es werden keinerlei Dateien gelöscht; ältere, nicht mehr in der Playlist vorhandene Songs bleiben im Volume.
    """

    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--ignore-errors",
        "--flat-playlist",
        "-J",
        playlist_url,
    ]

    success, rate_limited = run_with_retries(cmd, "Playlist vollständig laden (flatten)")

    if not success:
        print("[downloader] Playlist konnte nicht geflattet werden.")
        return 0

    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        data = json.loads(result.stdout)
    except Exception as e:
        print(f"[downloader] Fehler beim Auslesen der Playlist-Ausgabe (flatten): {e}")
        return 0

    entries = data.get("entries") or []

    # Bereits heruntergeladene Video-IDs ermitteln
    downloaded_ids = get_downloaded_video_ids()
    if downloaded_ids:
        print(f"[downloader] {len(downloaded_ids)} Videos bereits im songs-Volume vorhanden – werden beim Flatten übersprungen.")

    urls = []
    skipped = 0

    for entry in entries:
        vid = entry.get("id")
        if not vid:
            continue

        # Nur Videos berücksichtigen, die noch nicht heruntergeladen wurden
        if vid in downloaded_ids:
            skipped += 1
            continue

        urls.append(f"https://www.youtube.com/watch?v={vid}")

    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(urls, f, indent=2)

        print(
            f"[downloader] Playlist geflattet: {len(entries)} Einträge gesamt, "
            f"{skipped} bereits vorhanden, {len(urls)} neue Einträge -> {output_file}"
        )
    except Exception as e:
        print(f"[downloader] Fehler beim Schreiben der Playlist-Datei: {e}")
        return 0

    return len(urls)


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
    """Erzeugt metadata.json.

    Standardverhalten:
    - Wenn PLAYLIST_URL gesetzt ist und die Playlist geladen werden kann,
      wird die Metadata-Liste an der aktuellen Playlist ausgerichtet.
      Es werden nur Videos berücksichtigt, deren IDs in der aktuellen
      Playlist vorkommen und für die bereits eine .info.json existiert.

    - Wenn die Playlist nicht geladen werden kann, werden alle vorhandenen
      .info.json Dateien verwendet (Fallback, bisheriges Verhalten).

    - Bereits vorhandene Dateien (MP3 / .info.json), deren IDs nicht mehr
      in der Playlist sind, bleiben physisch erhalten, erscheinen aber
      nicht mehr in der neuen metadata.json.
    """

    # Zuerst alle vorhandenen .info.json Dateien einlesen und nach Video-ID indexieren
    info_by_id = {}

    for file in SONGS_DIR.glob("*.info.json"):
        try:
            with open(file, "r", encoding="utf-8") as f:
                data = json.load(f)

            mp3_file = file.with_suffix("").with_suffix(".mp3")

            vid = data.get("id")
            if not isinstance(vid, str):
                continue

            info_by_id[vid] = {
                "title": data.get("title"),
                "author": data.get("uploader"),
                "duration": data.get("duration"),
                "cover": data.get("thumbnail"),
                "filename": mp3_file.name,
            }
        except Exception:
            # Beschädigte/unerwartete Dateien überspringen
            continue

    metadata = []
    playlist_url = os.environ.get("PLAYLIST_URL")
    used_playlist_filter = False

    if playlist_url:
        try:
            print("[downloader] Lade aktuelle Playlist für Metadata-Filter...")
            playlist_urls = get_playlist_entries(playlist_url)

            # Video-IDs aus den Playlist-URLs extrahieren (Parameter v=...)
            playlist_ids = []
            for url in playlist_urls:
                if "v=" in url:
                    vid_part = url.split("v=")[-1]
                    vid = vid_part.split("&")[0]
                    if vid:
                        playlist_ids.append(vid)

            for vid in playlist_ids:
                entry = info_by_id.get(vid)
                if entry is not None:
                    metadata.append(entry)

            used_playlist_filter = True
            print(f"[downloader] Metadata anhand aktueller Playlist gefiltert ({len(metadata)} Einträge mit vorhandenen Dateien).")
        except Exception as e:
            print(f"[downloader] Hinweis: Konnte Playlist für Metadata-Bau nicht laden ({e}). Verwende alle vorhandenen Dateien.")

    if not used_playlist_filter:
        # Fallback: alle vorhandenen Dateien verwenden (ungefiltert)
        metadata = list(info_by_id.values())

    with open(METADATA_FILE, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"[downloader] Metadata erstellt ({len(metadata)} Einträge).")


if __name__ == "__main__":
    # Einfache Argument-Auswertung (kein argparse nötig)
    DOWNLOAD_ONLY = "--download-only" in sys.argv
    METADATA_ONLY = "--metadata-only" in sys.argv
    DUMP_PLAYLIST_COUNT = "--dump-playlist-count" in sys.argv
    FLATTEN_PLAYLIST = "--flatten-playlist" in sys.argv
    DOWNLOAD_CHUNK = "--download-chunk" in sys.argv

    # Kombis prüfen (nur ein Modus erlaubt)
    modes_selected = [
        DOWNLOAD_ONLY,
        METADATA_ONLY,
        DUMP_PLAYLIST_COUNT,
        FLATTEN_PLAYLIST,
        DOWNLOAD_CHUNK,
    ]
    if sum(bool(m) for m in modes_selected) > 1:
        print("[downloader] Fehler: Flags --download-only, --metadata-only, --dump-playlist-count, --flatten-playlist und --download-chunk dürfen nicht kombiniert werden.")
        raise SystemExit(1)

    # Nur Metadaten erzeugen (z.B. nachdem mehrere Downloader-Container fertig sind)
    if METADATA_ONLY:
        print("[downloader] Starte nur Metadata-Erstellung...")
        build_metadata()
        raise SystemExit(0)

    # Download eines definierten Chunk-Bereichs aus bereits geflatteter Playlist-Datei
    if DOWNLOAD_CHUNK:
        if not PLAYLIST_FILE.exists():
            print(f"[downloader] Fehler: Playlist-Datei {PLAYLIST_FILE} existiert nicht. Bitte zuerst --flatten-playlist ausführen.")
            raise SystemExit(1)

        try:
            start_str = os.environ.get("CHUNK_START")
            end_str = os.environ.get("CHUNK_END")
            if not start_str or not end_str:
                print("[downloader] Fehler: CHUNK_START und CHUNK_END müssen als Umgebungsvariablen gesetzt sein.")
                raise SystemExit(1)

            chunk_start = int(start_str)
            chunk_end = int(end_str)
        except Exception as e:
            print(f"[downloader] Fehler beim Lesen von CHUNK_START/CHUNK_END: {e}")
            raise SystemExit(1)

        try:
            with open(PLAYLIST_FILE, "r", encoding="utf-8") as f:
                all_urls = json.load(f)
        except Exception as e:
            print(f"[downloader] Fehler beim Lesen der Playlist-Datei: {e}")
            raise SystemExit(1)

        total = len(all_urls)
        if total == 0:
            print("[downloader] Playlist-Datei ist leer.")
            raise SystemExit(1)

        if chunk_start < 1 or chunk_end < chunk_start or chunk_end > total:
            print(f"[downloader] Ungültiger Chunk-Bereich: {chunk_start}-{chunk_end} bei Gesamtanzahl {total}.")
            raise SystemExit(1)

        # In Python-Slices ist das Ende exklusiv, unsere Range ist inklusiv
        urls_slice = all_urls[chunk_start - 1:chunk_end]
        print(f"[downloader] Starte Chunk-Download für Range {chunk_start}-{chunk_end} von {total} Videos...")
        download_in_batches(urls_slice)

        # In diesem Modus keine Metadaten schreiben – das übernimmt ein separater Lauf
        print("[downloader] Chunk-Download abgeschlossen (ohne Metadata-Erstellung).")
        raise SystemExit(0)

    # Ab hier werden Playlist-Daten direkt über yt-dlp geladen
    playlist_url = os.environ.get("PLAYLIST_URL")

    if not playlist_url:
        print("[downloader] Fehler: PLAYLIST_URL ist nicht gesetzt. Prüfe .env im metawave_server-Verzeichnis.")
        raise SystemExit(1)

    # Nur Playlist-Grösse ermitteln (z.B. für Skripte)
    if DUMP_PLAYLIST_COUNT:
        print("[downloader] Ermittele Playlist-Länge...")
        urls = get_playlist_entries(playlist_url)
        count = len(urls)
        # Nur die Zahl auf stdout, damit Skripte sie leicht parsen können
        print(count)
        raise SystemExit(0)

    # Playlist einmal komplett flatten und in Datei schreiben
    if FLATTEN_PLAYLIST:
        print("[downloader] Flatten der kompletten Playlist...")
        count = flatten_playlist_to_file(playlist_url, PLAYLIST_FILE)
        # Auch hier am Ende die reine Zahl ausgeben, damit Skripte sie lesen können
        print(count)
        raise SystemExit(0)

    # Standard-Modus: Playlist laden, alles herunterladen, optional Metadaten schreiben
    print("[downloader] Starte Playlist-Downloader...")

    print(f"[downloader] Konfiguration: BATCH_SIZE={BATCH_SIZE}, BATCH_DELAY_SECONDS={BATCH_DELAY_SECONDS}, VIDEO_DELAY_SECONDS={VIDEO_DELAY_SECONDS}, MAX_RETRIES={MAX_RETRIES}, INITIAL_DELAY_SECONDS={INITIAL_DELAY_SECONDS}, PLAYLIST_ITEMS='{PLAYLIST_ITEMS}'")

    urls = get_playlist_entries(playlist_url)
    download_in_batches(urls)

    # Standardverhalten bleibt: danach wird Metadata geschrieben,
    # ausser es wurde explizit --download-only gesetzt.
    if DOWNLOAD_ONLY:
        print("[downloader] Downloads abgeschlossen, Metadata-Erstellung wurde per --download-only deaktiviert.")
    else:
        build_metadata()