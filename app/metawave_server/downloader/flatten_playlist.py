import os
import sys
from pathlib import Path

# Import the flatten helper from update_playlist
try:
    from update_playlist import flatten_playlist_to_file, PLAYLIST_FILE
except Exception as e:
    print(f"[flatten] Fehler beim Importieren von update_playlist: {e}")
    raise

if __name__ == "__main__":
    playlist_url = os.environ.get("PLAYLIST_URL")
    if not playlist_url:
        print("[flatten] Fehler: PLAYLIST_URL nicht gesetzt.")
        raise SystemExit(1)

    count = flatten_playlist_to_file(playlist_url, PLAYLIST_FILE)
    # Ausgabe der reinen Zahl (für Orchestrierungsskripte)
    print(count)
    # exit code 0 bei Erfolg, 1 bei Fehler
    sys.exit(0 if count > 0 else 1)
