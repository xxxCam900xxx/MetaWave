import os
import subprocess
import sys
import json
import time
import re
import math
from pathlib import Path
from storage import write_json_atomic

# PLAYLIST_URL wird nicht mehr verwendet – Playlists werden aus der Datenbank geladen.
# Die Variable bleibt für ältere Skripte als leerer Fallback erhalten.
PLAYLIST_URL = os.environ.get("PLAYLIST_URL", "")

# Basisverzeichnisse und Dateien
SONGS_DIR = Path(os.environ.get("SONGS_DIR", "/songs"))
METADATA_FILE = SONGS_DIR / "metadata.json"
PLAYLIST_FILE = SONGS_DIR / "playlist_urls.json"

SONGS_DIR.mkdir(parents=True, exist_ok=True)

# Optionales Tuning über Umgebungsvariablen
PLAYLIST_ITEMS = os.environ.get("PLAYLIST_ITEMS", "").strip()
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "20"))
BATCH_DELAY_SECONDS = int(os.environ.get("BATCH_DELAY_SECONDS", "5"))
VIDEO_DELAY_SECONDS = float(os.environ.get("VIDEO_DELAY_SECONDS", "1.0"))

MAX_RETRIES = max(1, int(os.environ.get("MAX_RETRIES", "5")))
INITIAL_DELAY_SECONDS = max(1, int(os.environ.get("INITIAL_DELAY_SECONDS", "60")))


class RateLimitError(RuntimeError):
    pass

def is_rate_limit_error(stderr: str) -> bool:
    if not stderr:
        return False
    lower = stderr.lower()
    return any(token in lower for token in [
        "rate limit",
        "too many requests",
        "http error 429",
        "429 too many",
        "http error 403",
        "sign in to confirm",
        "confirm you’re not a bot",
        "confirm you're not a bot",
        "captcha",
    ])


def _yt_dlp_flatten(playlist_url: str):
    """Ruft yt-dlp auf, um eine flache Playlist-JSON-Ausgabe zu erhalten.
    Liefert die Liste der Einträge (jeweils dict) oder raise Exception.
    """
    cmd = [
        "yt-dlp",
        "--ignore-errors",
        "--flat-playlist",
        "--dump-single-json",
    ]
    if PLAYLIST_ITEMS:
        cmd.extend(["--playlist-items", PLAYLIST_ITEMS])
    cmd.append(playlist_url)

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(result.stderr or result.stdout)
    data = json.loads(result.stdout)
    return data.get("entries", [])


def flatten_playlist_to_file(playlist_url: str, playlist_file_path: str) -> int:
    """Schreibt die geflattete Playlist (Liste von Video-URLs) in die Datei
    und gibt die Anzahl der Einträge zurück.
    """
    entries = _yt_dlp_flatten(playlist_url)
    urls = []
    for e in entries:
        # flat entries liefern meist 'url' als Video-ID; kümmere dich um verschiedene Felder
        vid = e.get("url") or e.get("id")
        web = e.get("webpage_url")
        if web:
            urls.append(web)
        elif vid:
            # konstruiere eine YouTube-URL aus der ID
            if not str(vid).startswith("http"):
                urls.append(f"https://www.youtube.com/watch?v={vid}")
            else:
                urls.append(str(vid))

    # ensure parent dir exists
    p = Path(playlist_file_path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("w", encoding="utf-8") as f:
        json.dump(urls, f, indent=2)
    return len(urls)


def get_playlist_entries(playlist_url: str):
    """Return list of video URLs for a playlist URL using yt-dlp."""
    entries = _yt_dlp_flatten(playlist_url)
    urls = []
    for e in entries:
        web = e.get("webpage_url")
        vid = e.get("url") or e.get("id")
        if web:
            urls.append(web)
        elif vid:
            if not str(vid).startswith("http"):
                urls.append(f"https://www.youtube.com/watch?v={vid}")
            else:
                urls.append(str(vid))
    return urls


def _make_yt_dlp_cmd(video_url: str):
    """Baue den yt-dlp Befehl für einen einzelnen Video-Download."""
    cmd = [
        "yt-dlp",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--write-info-json",
        "-o", f"{SONGS_DIR.as_posix()}/%(title)s [%(id)s].%(ext)s",
        video_url,
    ]
    yt_cookies = os.environ.get("YT_COOKIES")
    if yt_cookies:
        cmd.extend(["--cookies", yt_cookies])
    return cmd


def download_video(video_url: str) -> bool:
    """Lädt ein einzelnes Video, gibt True bei Erfolg zurück."""
    cmd = _make_yt_dlp_cmd(video_url)
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
            if result.returncode == 0:
                return True
            error = result.stderr or result.stdout or "yt-dlp meldete einen Fehler"
        except subprocess.TimeoutExpired:
            error = "Download-Zeitlimit überschritten"
        except OSError as exc:
            print(f"[downloader] yt-dlp konnte nicht gestartet werden: {exc}")
            return False
        print(f"[downloader] Versuch {attempt}/{MAX_RETRIES} fehlgeschlagen: {error}")
        if not is_rate_limit_error(error) and any(
            reason in error.lower() for reason in ("private video", "video unavailable", "members-only")
        ):
            return False
        if attempt < MAX_RETRIES:
            delay = min(INITIAL_DELAY_SECONDS * (2 ** (attempt - 1)), 900)
            print(f"[downloader] Nächster Versuch in {delay}s.")
            time.sleep(delay)
    if is_rate_limit_error(error):
        raise RateLimitError("YouTube blockiert oder begrenzt den Zugriff; der Lauf wird später erneut versucht.")
    return False


def download_in_batches(video_urls):
    """Lädt die übergebenen Video-URLs in Batches mit kleinen Pausen."""
    total = len(video_urls)
    downloaded = 0
    processed = 0

    if total == 0:
        print("[downloader] Keine Videos zum Download erhalten.")
        return

    for batch_start in range(0, total, BATCH_SIZE):
        batch = video_urls[batch_start:batch_start + BATCH_SIZE]
        batch_end = batch_start + len(batch)
        print(f"[downloader] Verarbeite Batch {batch_start + 1}-{batch_end} von {total}...")

        for url in batch:
            success = download_video(url)
            processed += 1
            if success:
                downloaded += 1

            if VIDEO_DELAY_SECONDS > 0:
                time.sleep(VIDEO_DELAY_SECONDS)

        if BATCH_DELAY_SECONDS > 0 and batch_end < total:
            print(f"[downloader] Batch abgeschlossen. Warte {BATCH_DELAY_SECONDS}s vor dem nächsten Batch...")
            time.sleep(BATCH_DELAY_SECONDS)

    print(f"[downloader] Fertig. {downloaded}/{total} Videos verarbeitet.")
    if downloaded != total:
        raise RuntimeError(f"{total - downloaded} von {total} Downloads fehlgeschlagen")


def analyze_lufs(mp3_path: Path):
    """Analysiert eine MP3-Datei mit FFmpeg loudnorm Filter (EBU R128).
    
    Returns dict mit LUFS-Werten oder None bei Fehler.
    """
    if not mp3_path.exists():
        return None
    
    # FFmpeg loudnorm first pass: Analysiert die Datei und gibt JSON-Stats zurück
    cmd = [
        "ffmpeg",
        "-i", str(mp3_path),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
        "-f", "null",
        "-"
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    except subprocess.TimeoutExpired:
        print(f"[LUFS] Timeout bei Analyse von {mp3_path.name}")
        return None
    except Exception as e:
        print(f"[LUFS] Fehler bei Analyse von {mp3_path.name}: {e}")
        return None
    
    # FFmpeg gibt loudnorm JSON im stderr aus
    stderr = result.stderr or ""
    if result.returncode != 0:
        print(f"[LUFS] FFmpeg fehlgeschlagen für {mp3_path.name}: {stderr[-500:]}")
        return None
    
    # Finde JSON-Block im stderr (beginnt mit '{' und endet mit '}')
    json_match = re.search(r'\{[^{}]*"input_i"[^{}]*\}', stderr, re.DOTALL)
    if not json_match:
        print(f"[LUFS] Kein LUFS-JSON gefunden für {mp3_path.name}")
        return None
    
    try:
        lufs_data = json.loads(json_match.group(0))
        
        # Extrahiere relevante Werte für Second Pass
        values = {
            "input_i": float(lufs_data["input_i"]),
            "input_tp": float(lufs_data["input_tp"]),
            "input_lra": float(lufs_data["input_lra"]),
            "input_thresh": float(lufs_data["input_thresh"]),
            "target_offset": float(lufs_data["target_offset"])
        }
        if not all(math.isfinite(value) for value in values.values()):
            raise ValueError("LUFS-Werte sind nicht endlich")
        return values
    except (json.JSONDecodeError, ValueError, KeyError) as e:
        print(f"[LUFS] JSON-Parse-Fehler für {mp3_path.name}: {e}")
        return None


def build_metadata():
    """Scant alle .info.json-Dateien und schreibt metadata.json.

    Wenn möglich, wird die aktuelle Playlist-Reihenfolge verwendet.
    LUFS-Daten werden aus bestehender metadata.json übernommen (falls vorhanden).
    Neue LUFS-Analysen werden separat parallelisiert durchgeführt.
    """
    # Lade bestehende metadata.json um LUFS-Daten zu übernehmen
    existing_lufs = {}
    if METADATA_FILE.exists():
        try:
            with METADATA_FILE.open("r", encoding="utf-8") as f:
                old_metadata = json.load(f)
                # Unterstütze beide Formate: {"songs": [...]} und direkt [...]
                songs_list = old_metadata.get('songs') if isinstance(old_metadata, dict) else old_metadata
                
                if not isinstance(songs_list, list):
                    raise ValueError("metadata.json enthält keine Titelliste")
                for song in songs_list:
                    if isinstance(song, dict):
                        vid = song.get('id')
                        lufs = song.get('lufs')
                        if vid and lufs:
                            existing_lufs[vid] = lufs
                print(f"[build_metadata] {len(existing_lufs)} LUFS-Daten aus bestehender metadata.json geladen")
        except Exception as e:
            raise RuntimeError(f"Bestehende Metadaten konnten nicht gelesen werden: {e}") from e

    info_by_id = {}

    songs_path = SONGS_DIR
    
    # Sammle alle .info.json Dateien
    info_files = list(songs_path.glob("*.info.json"))
    total_files = len(info_files)
    
    print(f"[build_metadata] Verarbeite {total_files} .info.json Dateien...")
    
    for file in info_files:
        try:
            with file.open("r", encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError) as exc:
            raise RuntimeError(f"Infodatei konnte nicht gelesen werden: {file.name}") from exc

        mp3_file = file.with_suffix("").with_suffix(".mp3")
        if not mp3_file.is_file() or mp3_file.stat().st_size == 0:
            print(f"[build_metadata] Unvollständiger Download: {mp3_file.name}")
            continue
        vid = data.get("id")
        if not isinstance(vid, str) or not vid:
            raise ValueError(f"Video-ID fehlt in {file.name}")
        if vid in info_by_id:
            raise ValueError(f"Mehrere Audiodateien für Video-ID {vid}")
        
        # LUFS-Daten aus bestehender metadata.json übernehmen (falls vorhanden)
        lufs_data = existing_lufs.get(vid)

        info_by_id[vid] = {
            "id": vid,
            "title": data.get("title"),
            "author": data.get("uploader"),
            "duration": data.get("duration"),
            "cover": data.get("thumbnail"),
            "filename": mp3_file.name,
            "lufs": lufs_data,
        }

    metadata = list(info_by_id.values())
    write_json_atomic(METADATA_FILE, metadata)

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