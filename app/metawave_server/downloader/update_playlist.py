import os
import subprocess
import json
import time

PLAYLIST_URL = os.environ["PLAYLIST_URL"]
SONGS_DIR = "/songs"
METADATA_FILE = os.path.join(SONGS_DIR, "metadata.json")

# Optional: Cookie-Datei für authentifizierte YouTube-Requests (z.B. Test-Account)
# Pfad wird per Umgebungsvariable YT_COOKIES gesetzt, z.B. "/cookies/www.youtube.com_cookies.txt".
#
# Verhalten:
# - Wenn YT_COOKIES NICHT gesetzt ist oder auf keine existierende Datei zeigt,
#   wird KEIN Cookie verwendet und der Downloader verhält sich wie zuvor.
# - Nur wenn die Datei existiert, wird sie an yt-dlp übergeben.
COOKIES_FILE = None
_cookies_env = os.environ.get("YT_COOKIES")
if _cookies_env:
    p = Path(_cookies_env)
    if p.is_file():
        COOKIES_FILE = str(p)
        print(f"[downloader] Verwende Cookies-Datei: {COOKIES_FILE}")
    else:
        print(f"[downloader] Hinweis: YT_COOKIES ist gesetzt ({_cookies_env}), Datei existiert aber nicht. Fahre ohne Cookies fort.")

# Throttling Einstellungen
BATCH_SIZE = int(os.environ.get("BATCH_SIZE", "5"))
BATCH_DELAY_SECONDS = int(os.environ.get("BATCH_DELAY_SECONDS", "60"))
VIDEO_DELAY_SECONDS = int(os.environ.get("VIDEO_DELAY_SECONDS", "5"))

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


def get_playlist_entries(playlist_url: str):
    cmd = [
        sys.executable,
        "-m",
        "yt_dlp",
        "--ignore-errors",
        "--remote-components", "ejs:github",
        "--flat-playlist",
        "-J",
    ]

    # Optional Cookies für authentifizierte Requests anhängen
    if COOKIES_FILE:
        cmd += ["--cookies", COOKIES_FILE]

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
        "--remote-components", "ejs:github",
        "--flat-playlist",
        "-J",
        playlist_url,
    ]

    # Optional Cookies für authentifizierte Requests anhängen
    if COOKIES_FILE:
        cmd += ["--cookies", COOKIES_FILE]

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
        "--remote-components", "ejs:github",
        "--js-runtimes", "node",
        "-N", "1",
        "--sleep-interval", "5",
        "--max-sleep-interval", "15",
        "-f", "bestaudio/best",
        "-x",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "--write-info-json",
        "-o", f"{SONGS_DIR}/%(title)s.%(ext)s",
        video_url
    ]

    # Ohne Cookies nutzen wir weiterhin explizit den android-Client,
    # um einige Restrictions zu umgehen. Mit Cookies verwenden wir
    # den Standard-Web-Client, da nur dieser Cookies unterstützt.
    if not COOKIES_FILE:
        cmd += ["--extractor-args", "youtube:player_client=android"]

    # Optional Cookies für authentifizierte Requests anhängen
    if COOKIES_FILE:
        cmd += ["--cookies", COOKIES_FILE]

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
                "duration": data.get("duration"),   # Sekunden
                "cover": data.get("thumbnail"),
                "filename": filename
            })

with open(METADATA_FILE, "w", encoding="utf-8") as f:
    json.dump(metadata, f, indent=2)