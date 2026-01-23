import os
import subprocess
import sys
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