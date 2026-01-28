#!/usr/bin/env python3
"""
Synchronisiert die lokale Song-Sammlung mit einer YouTube-Playlist.

Workflow:
1. Liest bestehende metadata.json (falls vorhanden)
2. Holt aktuelle Playlist von YouTube
3. Ermittelt Diff (neue Videos, gelöschte Videos)
4. Schreibt nur neue Videos in playlist_urls.json für Download
5. Schreibt gelöschte Video-IDs in deleted_videos.json für Cleanup
6. Gibt Anzahl neuer Videos auf stdout aus
"""

import os
import sys
import json
import subprocess

SONGS_DIR = os.getenv('SONGS_DIR', '/songs')
PLAYLIST_URL = os.getenv('PLAYLIST_URL')
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
        
        # Unterstütze beide Formate: {"songs": [...]} und direkt [...]
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

def fetch_current_playlist():
    """Holt aktuelle Playlist-URLs von YouTube mit yt-dlp."""
    if not PLAYLIST_URL:
        print("[sync] Fehler: PLAYLIST_URL nicht gesetzt")
        sys.exit(1)
    
    print(f"[sync] Hole Playlist von: {PLAYLIST_URL}")
    
    cmd = [
        'yt-dlp',
        '--flat-playlist',
        '--print', 'id',
        '--print', 'url',
        '--playlist-end', '999999',
        PLAYLIST_URL
    ]
    
    # Cookie-File falls gesetzt
    cookies_file = os.getenv('YT_COOKIES')
    if cookies_file and os.path.exists(cookies_file):
        cmd.extend(['--cookies', cookies_file])
        print(f"[sync] Verwende Cookies: {cookies_file}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        lines = result.stdout.strip().split('\n')
        
        # yt-dlp gibt abwechselnd ID und URL aus
        current_videos = {}
        for i in range(0, len(lines), 2):
            if i + 1 < len(lines):
                video_id = lines[i].strip()
                video_url = lines[i + 1].strip()
                current_videos[video_id] = video_url
        
        print(f"[sync] {len(current_videos)} Videos in aktueller Playlist gefunden")
        return current_videos
    except subprocess.CalledProcessError as e:
        print(f"[sync] Fehler beim Abrufen der Playlist: {e}")
        print(f"[sync] stderr: {e.stderr}")
        sys.exit(1)

def compute_diff(existing_ids, current_videos):
    """Berechnet Unterschiede zwischen lokal und remote."""
    existing_set = set(existing_ids.keys())
    current_set = set(current_videos.keys())
    
    new_ids = current_set - existing_set
    deleted_ids = existing_set - current_set
    kept_ids = existing_set & current_set
    
    print(f"[sync] Diff-Ergebnis:")
    print(f"  - Neue Videos: {len(new_ids)}")
    print(f"  - Gelöschte Videos: {len(deleted_ids)}")
    print(f"  - Beibehaltene Videos: {len(kept_ids)}")
    
    return new_ids, deleted_ids, kept_ids

def write_download_queue(new_ids, current_videos):
    """Schreibt nur neue Video-URLs in playlist_urls.json."""
    new_urls = [current_videos[vid] for vid in new_ids]
    
    with open(PLAYLIST_URLS_FILE, 'w', encoding='utf-8') as f:
        json.dump(new_urls, f, indent=2)
    
    print(f"[sync] {len(new_urls)} neue URLs in {PLAYLIST_URLS_FILE} geschrieben")
    return len(new_urls)

def write_deletion_list(deleted_ids):
    """Schreibt gelöschte Video-IDs für späteren Cleanup."""
    with open(DELETED_VIDEOS_FILE, 'w', encoding='utf-8') as f:
        json.dump(list(deleted_ids), f, indent=2)
    
    print(f"[sync] {len(deleted_ids)} gelöschte Video-IDs in {DELETED_VIDEOS_FILE} geschrieben")

def main():
    print("[sync] Starte Playlist-Synchronisation...")
    
    # 1. Lade bestehende Metadaten
    existing_ids = load_existing_metadata()
    
    # 2. Hole aktuelle Playlist
    current_videos = fetch_current_playlist()
    
    # 3. Berechne Diff
    new_ids, deleted_ids, kept_ids = compute_diff(existing_ids, current_videos)
    
    # 4. Schreibe Download-Queue (nur neue)
    num_new = write_download_queue(new_ids, current_videos)
    
    # 5. Schreibe Deletion-List
    write_deletion_list(deleted_ids)
    
    # 6. Gib Anzahl auf stdout aus (für Orchestrator)
    print(f"\n{num_new}")
    
    return 0

if __name__ == '__main__':
    sys.exit(main())
