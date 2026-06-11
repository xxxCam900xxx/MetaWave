#!/usr/bin/env python3
"""
Synchronisiert die lokale Song-Sammlung mit allen aktiven YouTube-Playlists
aus der Datenbank.

Workflow:
1. Liest bestehende metadata.json (falls vorhanden)
2. Holt alle aktiven Playlists aus der Datenbank
3. Holt aktuelle Video-IDs von YouTube für jede Playlist (aggregiert)
4. Ermittelt Diff (neue Videos, gelöschte Videos)
5. Schreibt nur neue Videos in playlist_urls.json für Download
6. Schreibt gelöschte Video-IDs in deleted_videos.json für Cleanup
7. Gibt Anzahl neuer Videos auf stdout aus
"""

import os
import sys
import json
import subprocess

from db_client import fetch_active_playlists

SONGS_DIR = os.getenv('SONGS_DIR', '/songs')
METADATA_FILE = os.path.join(SONGS_DIR, 'metadata.json')
PLAYLIST_URLS_FILE = os.path.join(SONGS_DIR, 'playlist_urls.json')
DELETED_VIDEOS_FILE = os.path.join(SONGS_DIR, 'deleted_videos.json')


def load_existing_metadata():
    """Lädt bestehende metadata.json und extrahiert Video-IDs."""
    if not os.path.exists(METADATA_FILE):
        print("[sync] Keine bestehende metadata.json gefunden. Erster Download.")
        return {}

    try:
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        existing_ids = {}
        songs_list = data.get('songs', []) if isinstance(data, dict) else data

        if not isinstance(songs_list, list):
            print(f"[sync] Warnung: metadata.json hat unerwartetes Format: {type(data)}")
            return {}

        for song in songs_list:
            if isinstance(song, dict):
                video_id = song.get('id')
                if video_id:
                    existing_ids[video_id] = song

        print(f"[sync] {len(existing_ids)} bestehende Videos in metadata.json gefunden")
        return existing_ids
    except Exception as e:
        print(f"[sync] Fehler beim Lesen von metadata.json: {e}")
        return {}


def fetch_playlist_videos(playlist_url):
    """Holt aktuelle Video-IDs/-URLs von YouTube für eine einzelne Playlist."""
    print(f"[sync] Hole Playlist von: {playlist_url}")

    cmd = [
        'yt-dlp',
        '--flat-playlist',
        '--print', 'id',
        '--print', 'url',
        '--playlist-end', '999999',
        playlist_url
    ]

    cookies_file = os.getenv('YT_COOKIES')
    if cookies_file and os.path.exists(cookies_file):
        cmd.extend(['--cookies', cookies_file])
        print(f"[sync] Verwende Cookies: {cookies_file}")

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        lines = result.stdout.strip().split('\n')

        videos = {}
        for i in range(0, len(lines), 2):
            if i + 1 < len(lines):
                video_id = lines[i].strip()
                video_url = lines[i + 1].strip()
                if video_id and video_url:
                    videos[video_id] = video_url

        print(f"[sync] {len(videos)} Videos in Playlist gefunden")
        return videos
    except subprocess.CalledProcessError as e:
        print(f"[sync] Fehler beim Abrufen der Playlist {playlist_url}: {e}")
        print(f"[sync] stderr: {e.stderr}")
        return {}


def fetch_all_active_playlists():
    """Aggregiert Video-IDs/-URLs über alle aktiven Playlists aus der DB."""
    try:
        playlists = fetch_active_playlists()
    except Exception as e:
        print(f"[sync] Fehler beim Laden der Playlists aus der Datenbank: {e}")
        sys.exit(1)

    if not playlists:
        print("[sync] Fehler: Keine aktiven Playlists in der Datenbank gefunden.")
        print("[sync] Bitte Playlists über den Playlist Manager in der App hinzufügen.")
        sys.exit(1)

    print(f"[sync] {len(playlists)} aktive Playlist(s) in der Datenbank gefunden:")
    for pl in playlists:
        print(f"  - [{pl['id']}] {pl['name']}: {pl['url']}")

    all_videos = {}
    for pl in playlists:
        videos = fetch_playlist_videos(pl['url'])
        # Erste Playlist gewinnt bei Duplikaten
        for vid_id, vid_url in videos.items():
            if vid_id not in all_videos:
                all_videos[vid_id] = vid_url

    print(f"[sync] {len(all_videos)} einzigartige Videos über alle aktiven Playlists gefunden")
    return all_videos


def compute_diff(existing_ids, current_videos):
    """Berechnet Unterschiede zwischen lokal und remote."""
    existing_set = set(existing_ids.keys())
    current_set = set(current_videos.keys())

    new_ids = current_set - existing_set
    deleted_ids = existing_set - current_set
    kept_ids = existing_set & current_set

    print(f"[sync] Diff-Ergebnis:")
    print(f"  - Neue Videos:         {len(new_ids)}")
    print(f"  - Gelöschte Videos:    {len(deleted_ids)}")
    print(f"  - Beibehaltene Videos: {len(kept_ids)}")

    return new_ids, deleted_ids, kept_ids


def write_download_queue(new_ids, current_videos):
    """Schreibt nur neue Video-URLs in playlist_urls.json."""
    new_urls = [current_videos[vid] for vid in new_ids]
    os.makedirs(SONGS_DIR, exist_ok=True)

    with open(PLAYLIST_URLS_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_urls, f, indent=2)

    print(f"[sync] {len(new_urls)} neue URLs in {PLAYLIST_URLS_FILE} geschrieben")
    return len(new_urls)


def write_deletion_list(deleted_ids):
    """Schreibt gelöschte Video-IDs für späteren Cleanup."""
    os.makedirs(SONGS_DIR, exist_ok=True)
    with open(DELETED_VIDEOS_FILE, 'w', encoding='utf-8') as f:
        json.dump(list(deleted_ids), f, indent=2)
    print(f"[sync] {len(deleted_ids)} gelöschte Video-IDs in {DELETED_VIDEOS_FILE} geschrieben")


def main():
    print("[sync] Starte Playlist-Synchronisation (Quelle: Datenbank)...")

    existing_ids = load_existing_metadata()
    current_videos = fetch_all_active_playlists()
    new_ids, deleted_ids, _ = compute_diff(existing_ids, current_videos)
    num_new = write_download_queue(new_ids, current_videos)
    write_deletion_list(deleted_ids)

    # Reine Zahl für Orchestrator-Skripte
    print(f"\n{num_new}")


if __name__ == '__main__':
    main()
