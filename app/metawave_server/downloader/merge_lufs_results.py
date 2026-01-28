#!/usr/bin/env python3
"""
Merged LUFS-Ergebnisse aus allen Chunk-Dateien zurück in metadata.json

Liest alle chunk_*.json Dateien aus lufs_results/ und merged die LUFS-Daten
zurück in die Haupt-metadata.json.
"""

import sys
import json
from pathlib import Path

try:
    from update_playlist import SONGS_DIR, METADATA_FILE
except Exception as e:
    print(f"[lufs-merge] Fehler beim Importieren: {e}")
    sys.exit(1)

LUFS_RESULTS_DIR = SONGS_DIR / "lufs_results"


def merge_lufs_results():
    """Merged alle LUFS-Chunk-Ergebnisse in metadata.json."""
    
    if not LUFS_RESULTS_DIR.exists():
        print("[lufs-merge] Keine lufs_results/ gefunden - nichts zu mergen")
        return False
    
    # Sammle alle Chunk-Dateien
    chunk_files = list(LUFS_RESULTS_DIR.glob("chunk_*.json"))
    
    if not chunk_files:
        print("[lufs-merge] Keine Chunk-Ergebnisse gefunden")
        return False
    
    print(f"[lufs-merge] Gefunden: {len(chunk_files)} Chunk-Ergebnis-Dateien")
    
    # Lade alle LUFS-Ergebnisse (key = video_id, value = lufs_data)
    all_lufs_data = {}
    
    for chunk_file in chunk_files:
        try:
            with open(chunk_file, 'r', encoding='utf-8') as f:
                chunk_data = json.load(f)
            all_lufs_data.update(chunk_data)
            print(f"[lufs-merge] {chunk_file.name}: {len(chunk_data)} Einträge geladen")
        except Exception as e:
            print(f"[lufs-merge] {chunk_file.name}: Fehler beim Laden - {e}")
    
    print(f"[lufs-merge] Gesamt LUFS-Einträge: {len(all_lufs_data)}")
    
    # Lade metadata.json
    if not METADATA_FILE.exists():
        print("[lufs-merge] Fehler: metadata.json nicht gefunden")
        return False
    
    try:
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
    except Exception as e:
        print(f"[lufs-merge] Fehler beim Lesen von metadata.json: {e}")
        return False
    
    # Merge LUFS-Daten in Metadata
    updated = 0
    skipped = 0
    
    for song in metadata:
        video_id = song.get('id')
        if not video_id:
            continue
        
        lufs_data = all_lufs_data.get(video_id)
        if lufs_data:
            song['lufs'] = lufs_data
            updated += 1
        else:
            skipped += 1
    
    # Speichere aktualisierte metadata.json
    try:
        with open(METADATA_FILE, 'w', encoding='utf-8') as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        
        print(f"\n[lufs-merge] Metadata erfolgreich aktualisiert!")
        print(f"  - LUFS hinzugefügt: {updated}")
        print(f"  - Übersprungen: {skipped}")
        
        # Cleanup: Lösche Chunk-Ergebnisse nach erfolgreichem Merge
        for chunk_file in chunk_files:
            try:
                chunk_file.unlink()
            except:
                pass
        
        # Lösche lufs_results Verzeichnis wenn leer
        try:
            LUFS_RESULTS_DIR.rmdir()
            print(f"[lufs-merge] Chunk-Ergebnisse aufgeräumt")
        except:
            pass
        
        return True
    except Exception as e:
        print(f"[lufs-merge] Fehler beim Speichern von metadata.json: {e}")
        return False


def main():
    print("[lufs-merge] Starte LUFS-Ergebnis-Merge...")
    success = merge_lufs_results()
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
