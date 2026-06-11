import os
import sys
from pathlib import Path

# Import the flatten helper from update_playlist
try:
    from update_playlist import flatten_playlist_to_file, PLAYLIST_FILE
    from db_client import fetch_active_playlists
except Exception as e:
    print(f"[flatten] Fehler beim Importieren: {e}")
    raise

if __name__ == "__main__":
    # Playlists aus der Datenbank holen
    try:
        playlists = fetch_active_playlists()
    except Exception as e:
        print(f"[flatten] Fehler beim Laden der Playlists aus der Datenbank: {e}")
        raise SystemExit(1)

    if not playlists:
        print("[flatten] Fehler: Keine aktiven Playlists in der Datenbank gefunden.")
        raise SystemExit(1)

    total_count = 0
    for pl in playlists:
        print(f"[flatten] Verarbeite Playlist: {pl['name']} ({pl['url']})")
        count = flatten_playlist_to_file(pl['url'], PLAYLIST_FILE)
        total_count += count
        print(f"[flatten] {count} Videos aus '{pl['name']}' geladen")

    print(total_count)
    sys.exit(0 if total_count > 0 else 1)
