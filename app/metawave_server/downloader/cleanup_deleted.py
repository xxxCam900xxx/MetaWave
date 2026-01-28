#!/usr/bin/env python3
"""
Löscht Songs und Metadaten für Videos, die nicht mehr in der Playlist sind.

Liest deleted_videos.json und entfernt entsprechende MP3- und .info.json-Dateien.
"""

import os
import sys
import json

SONGS_DIR = os.getenv('SONGS_DIR', '/songs')
DELETED_VIDEOS_FILE = os.path.join(SONGS_DIR, 'deleted_videos.json')

def load_deleted_ids():
    """Lädt Liste der zu löschenden Video-IDs."""
    if not os.path.exists(DELETED_VIDEOS_FILE):
        print("[cleanup] Keine deleted_videos.json gefunden. Nichts zu löschen.")
        return []
    
    try:
        with open(DELETED_VIDEOS_FILE, 'r', encoding='utf-8') as f:
            deleted_ids = json.load(f)
        print(f"[cleanup] {len(deleted_ids)} Videos zum Löschen markiert")
        return deleted_ids
    except Exception as e:
        print(f"[cleanup] Fehler beim Lesen von deleted_videos.json: {e}")
        return []

def find_files_by_id(video_id):
    """Findet alle Dateien die zu einer Video-ID gehören."""
    files_to_delete = []
    
    # Suche nach MP3 und .info.json mit Video-ID im Dateinamen
    for filename in os.listdir(SONGS_DIR):
        if video_id in filename:
            filepath = os.path.join(SONGS_DIR, filename)
            if os.path.isfile(filepath):
                files_to_delete.append(filepath)
    
    return files_to_delete

def delete_files(deleted_ids):
    """Löscht alle Dateien für gelöschte Videos."""
    total_deleted = 0
    
    for video_id in deleted_ids:
        files = find_files_by_id(video_id)
        
        if not files:
            print(f"[cleanup] ⚠️  Keine Dateien für Video-ID {video_id} gefunden")
            continue
        
        for filepath in files:
            try:
                os.remove(filepath)
                filename = os.path.basename(filepath)
                print(f"[cleanup]  Gelöscht: {filename}")
                total_deleted += 1
            except Exception as e:
                print(f"[cleanup] Fehler beim Löschen von {filepath}: {e}")
    
    print(f"\n[cleanup] {total_deleted} Dateien erfolgreich gelöscht")
    return total_deleted

def cleanup_deleted_videos_file():
    """Entfernt deleted_videos.json nach erfolgreichem Cleanup."""
    if os.path.exists(DELETED_VIDEOS_FILE):
        try:
            os.remove(DELETED_VIDEOS_FILE)
            print(f"[cleanup] deleted_videos.json entfernt")
        except Exception as e:
            print(f"[cleanup] Warnung: Konnte deleted_videos.json nicht löschen: {e}")

def main():
    print("[cleanup] Starte Cleanup gelöschter Videos...")
    
    # 1. Lade Liste der zu löschenden IDs
    deleted_ids = load_deleted_ids()
    
    if not deleted_ids:
        print("[cleanup] Nichts zu tun.")
        return 0
    
    # 2. Lösche Dateien
    total = delete_files(deleted_ids)
    
    # 3. Cleanup der Marker-Datei
    cleanup_deleted_videos_file()
    
    print(f"[cleanup] Cleanup abgeschlossen: {total} Dateien gelöscht")
    return 0

if __name__ == '__main__':
    sys.exit(main())
