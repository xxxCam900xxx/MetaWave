import os
import sys
import json
from pathlib import Path

try:
    from update_playlist import PLAYLIST_FILE, download_in_batches
except Exception as e:
    print(f"[download_chunk] Fehler beim Importieren von update_playlist: {e}")
    raise

if __name__ == "__main__":
    if not PLAYLIST_FILE.exists():
        print(f"[download_chunk] Fehler: {PLAYLIST_FILE} existiert nicht. Bitte zuerst flatten_playlist ausführen.")
        raise SystemExit(1)

    try:
        start_str = os.environ.get("CHUNK_START")
        end_str = os.environ.get("CHUNK_END")
        if not start_str or not end_str:
            print("[download_chunk] Fehler: CHUNK_START und CHUNK_END müssen gesetzt sein.")
            raise SystemExit(1)

        chunk_start = int(start_str)
        chunk_end = int(end_str)
    except Exception as e:
        print(f"[download_chunk] Fehler beim Lesen von CHUNK_START/CHUNK_END: {e}")
        raise SystemExit(1)

    try:
        with open(PLAYLIST_FILE, "r", encoding="utf-8") as f:
            all_urls = json.load(f)
    except Exception as e:
        print(f"[download_chunk] Fehler beim Lesen der Playlist-Datei: {e}")
        raise SystemExit(1)

    total = len(all_urls)
    if total == 0:
        print("[download_chunk] Playlist-Datei ist leer.")
        raise SystemExit(1)

    if chunk_start < 1 or chunk_end < chunk_start or chunk_end > total:
        print(f"[download_chunk] Ungültiger Chunk-Bereich: {chunk_start}-{chunk_end} bei Gesamtanzahl {total}.")
        raise SystemExit(1)

    urls_slice = all_urls[chunk_start - 1:chunk_end]
    print(f"[download_chunk] Starte Chunk-Download für Range {chunk_start}-{chunk_end} von {total} Videos...")
    download_in_batches(urls_slice)

    print("[download_chunk] Chunk-Download abgeschlossen.")
    sys.exit(0)
