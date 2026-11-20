#!/usr/bin/env python3
"""
Synchronisiert die lokale Song-Sammlung mit konfigurierten YouTube-Playlists
aus der Datenbank.

Workflow:
1. Liest bestehende metadata.json (falls vorhanden)
2. Holt alle Playlists aus der Datenbank
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
from storage import write_json_atomic

from db_client import fetch_all_playlists

SONGS_DIR = os.getenv('SONGS_DIR', '/songs')
METADATA_FILE = os.path.join(SONGS_DIR, 'metadata.json')
PLAYLIST_URLS_FILE = os.path.join(SONGS_DIR, 'playlist_urls.json')
DELETED_VIDEOS_FILE = os.path.join(SONGS_DIR, 'deleted_videos.json')
MEMBERSHIP_FILE = os.path.join(SONGS_DIR, 'playlist_membership.json')
SNAPSHOT_FILE = os.path.join(SONGS_DIR, '.metawave-downloader', 'sync_snapshot.json')


def load_existing_metadata():
    """Lädt bestehende metadata.json und extrahiert Video-IDs."""
    if not os.path.exists(METADATA_FILE):
        print("[sync] Keine bestehende metadata.json gefunden. Erster Download.")
        return {}

    try:
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)

        existing_ids = {}
        songs_list = data.get('songs') if isinstance(data, dict) else data

        if not isinstance(songs_list, list):
            raise ValueError(f"metadata.json hat unerwartetes Format: {type(data)}")

        for song in songs_list:
            if isinstance(song, dict):
                video_id = song.get('id')
                if video_id:
                    existing_ids[video_id] = song

        print(f"[sync] {len(existing_ids)} bestehende Videos in metadata.json gefunden")
        return existing_ids
    except Exception as e:
        print(f"[sync] Fehler beim Lesen von metadata.json: {e}")
        raise


def fetch_playlist_videos(playlist_url):
    """Holt aktuelle Video-IDs/-URLs von YouTube für eine einzelne Playlist."""
    print(f"[sync] Hole Playlist von: {playlist_url}")

    cmd = [
        'yt-dlp',
        '--flat-playlist',
        '--retries', '3',
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
        result = subprocess.run(cmd, capture_output=True, text=True, check=True, timeout=600)
        if any(line.lstrip().startswith("ERROR:") for line in result.stderr.splitlines()):
            raise ValueError(f"Playlist-Abruf meldet Fehler für {playlist_url}; Cleanup abgebrochen")
        lines = result.stdout.strip().splitlines()
        if len(lines) % 2:
            raise ValueError(f"Unvollständige Playlist-Antwort für {playlist_url}; Cleanup abgebrochen")

        videos = {}
        for i in range(0, len(lines), 2):
            video_id = lines[i].strip()
            video_url = lines[i + 1].strip()
            if not video_id or not video_url:
                raise ValueError(f"Ungültiger Playlist-Eintrag für {playlist_url}; Cleanup abgebrochen")
            videos[video_id] = video_url

        if not videos:
            raise ValueError(f"Playlist {playlist_url} ist leer oder konnte nicht gelesen werden; Cleanup abgebrochen")
        print(f"[sync] {len(videos)} Videos in Playlist gefunden")
        return videos
    except subprocess.CalledProcessError as e:
        print(f"[sync] Fehler beim Abrufen der Playlist {playlist_url}: {e}")
        print(f"[sync] stderr: {e.stderr}")
        raise RuntimeError(f"Playlist konnte nicht abgerufen werden: {playlist_url}") from e


def fetch_playlist_sources():
    """Aggregiert alle Playlists und merkt sich die aktiven Video-IDs."""
    try:
        playlists = fetch_all_playlists()
    except Exception as e:
        print(f"[sync] Fehler beim Laden der Playlists aus der Datenbank: {e}")
        sys.exit(1)

    if not any(pl["is_active"] for pl in playlists):
        print("[sync] Fehler: Keine aktiven Playlists in der Datenbank gefunden.")
        print("[sync] Bitte Playlists über den Playlist Manager in der App hinzufügen.")
        sys.exit(1)

    print(f"[sync] {len(playlists)} Playlist(s) in der Datenbank gefunden:")
    for pl in playlists:
        print(f"  - [{pl['id']}] {pl['name']}: {pl['url']}")

    all_videos = {}
    memberships = {}
    active_ids = set()
    for pl in playlists:
        videos = fetch_playlist_videos(pl['url'])
        memberships[str(pl['id'])] = list(videos)
        if pl["is_active"]:
            active_ids.update(videos)
        # Erste Playlist gewinnt bei Duplikaten
        for vid_id, vid_url in videos.items():
            if vid_id not in all_videos:
                all_videos[vid_id] = vid_url

    print(f"[sync] {len(all_videos)} einzigartige Videos über alle Playlists gefunden")
    return all_videos, memberships, active_ids


def write_memberships(memberships):
    """Veröffentlicht Zuordnungen erst nach erfolgreichem Abruf aller Playlists."""
    write_json_atomic(MEMBERSHIP_FILE, memberships)


def compute_diff(existing_ids, current_videos, active_ids=None):
    """Berechnet Unterschiede zwischen lokal und remote."""
    existing_set = set(existing_ids.keys())
    current_set = set(current_videos.keys())

    new_ids = (set(active_ids) if active_ids is not None else current_set) - existing_set
    deleted_ids = existing_set - current_set
    kept_ids = existing_set & current_set

    print(f"[sync] Diff-Ergebnis:")
    print(f"  - Neue Videos:         {len(new_ids)}")
    print(f"  - Gelöschte Videos:    {len(deleted_ids)}")
    print(f"  - Beibehaltene Videos: {len(kept_ids)}")

    return new_ids, deleted_ids, kept_ids


def write_download_queue(new_ids, current_videos):
    """Schreibt nur neue Video-URLs in playlist_urls.json."""
    new_urls = [current_videos[vid] for vid in sorted(new_ids)]
    os.makedirs(SONGS_DIR, exist_ok=True)

    write_json_atomic(PLAYLIST_URLS_FILE, new_urls)

    print(f"[sync] {len(new_urls)} neue URLs in {PLAYLIST_URLS_FILE} geschrieben")
    return len(new_urls)


def write_deletion_list(deleted_ids):
    """Schreibt gelöschte Video-IDs für späteren Cleanup."""
    os.makedirs(SONGS_DIR, exist_ok=True)
    write_json_atomic(DELETED_VIDEOS_FILE, sorted(deleted_ids))
    print(f"[sync] {len(deleted_ids)} gelöschte Video-IDs in {DELETED_VIDEOS_FILE} geschrieben")


def main():
    print("[sync] Starte Playlist-Synchronisation (Quelle: Datenbank)...")

    existing_ids = load_existing_metadata()
    current_videos, memberships, active_ids = fetch_playlist_sources()
    new_ids, deleted_ids, _ = compute_diff(existing_ids, current_videos, active_ids)
    num_new = write_download_queue(new_ids, current_videos)
    write_deletion_list(deleted_ids)
    write_memberships(memberships)
    write_json_atomic(SNAPSHOT_FILE, {"memberships": memberships, "active_ids": sorted(active_ids)})

    # Reine Zahl für Orchestrator-Skripte
    print(f"\n{num_new}")


if __name__ == '__main__':
    main()
