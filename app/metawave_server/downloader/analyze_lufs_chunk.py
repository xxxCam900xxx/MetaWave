#!/usr/bin/env python3
"""
LUFS-Analyse für einen bestimmten Chunk von Songs

Analysiert einen definierten Bereich (CHUNK_START - CHUNK_END) von Songs
und schreibt die Ergebnisse in eine separate JSON-Datei pro Chunk.

Usage (via env vars):
    CHUNK_START=1 CHUNK_END=150 python analyze_lufs_chunk.py
"""

import os
import sys
import json
from pathlib import Path

try:
    from update_playlist import SONGS_DIR, METADATA_FILE, analyze_lufs
except Exception as e:
    print(f"[lufs-chunk] Fehler beim Importieren: {e}")
    sys.exit(1)

LUFS_RESULTS_DIR = SONGS_DIR / "lufs_results"


def get_songs_to_analyze(force=False):
    """Lädt metadata.json und gibt Liste von Songs zurück die analysiert werden müssen."""
    if not METADATA_FILE.exists():
        print(f"[lufs-chunk] Fehler: {METADATA_FILE} nicht gefunden")
        return []
    
    try:
        with open(METADATA_FILE, 'r', encoding='utf-8') as f:
            metadata = json.load(f)
    except Exception as e:
        print(f"[lufs-chunk] Fehler beim Lesen von metadata.json: {e}")
        return []
    
    # Filter: nur Songs mit filename
    songs = []
    for song in metadata:
        filename = song.get('filename')
        if not filename:
            continue
        
        # Bei force: alle, sonst nur ohne LUFS
        if force or song.get('lufs') is None:
            songs.append({
                'filename': filename,
                'id': song.get('id'),
                'title': song.get('title')
            })
    
    return songs


def analyze_chunk(chunk_start, chunk_end, songs_list, chunk_id):
    """Analysiert einen Chunk von Songs und speichert Ergebnisse in separate Datei."""
    
    # Validiere Range
    total = len(songs_list)
    if chunk_start < 1 or chunk_end < chunk_start or chunk_start > total:
        print(f"[lufs-chunk] Ungültiger Chunk-Bereich: {chunk_start}-{chunk_end} bei {total} Songs")
        return False
    
    # Slice (Python 0-indexed, unsere Range ist 1-indexed)
    chunk_songs = songs_list[chunk_start - 1:min(chunk_end, total)]
    chunk_size = len(chunk_songs)
    
    print(f"[lufs-chunk] Chunk {chunk_id}: Analysiere {chunk_size} Songs (Range {chunk_start}-{min(chunk_end, total)} von {total})")
    
    results = {}
    analyzed = 0
    failed = 0
    
    for idx, song in enumerate(chunk_songs, 1):
        filename = song['filename']
        mp3_path = SONGS_DIR / filename
        
        if not mp3_path.exists():
            print(f"[lufs-chunk] [{idx}/{chunk_size}] {filename}: Datei nicht gefunden")
            failed += 1
            continue
        
        print(f"[lufs-chunk] [{idx}/{chunk_size}] Analysiere {filename}...")
        lufs_data = analyze_lufs(mp3_path)
        
        if lufs_data:
            # Speichere mit Video-ID als Key für einfaches Merging
            video_id = song.get('id')
            if video_id:
                results[video_id] = lufs_data
                print(f"[lufs-chunk] [{idx}/{chunk_size}] {filename}: {lufs_data['input_i']:.1f} LUFS")
                analyzed += 1
            else:
                print(f"[lufs-chunk] [{idx}/{chunk_size}] ⚠️  {filename}: Keine Video-ID gefunden")
                failed += 1
        else:
            print(f"[lufs-chunk] [{idx}/{chunk_size}] {filename}: Analyse fehlgeschlagen")
            failed += 1
    
    # Schreibe Chunk-Ergebnisse in separate Datei
    LUFS_RESULTS_DIR.mkdir(exist_ok=True)
    result_file = LUFS_RESULTS_DIR / f"chunk_{chunk_id}.json"
    
    try:
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=2)
        print(f"\n[lufs-chunk] Chunk {chunk_id} abgeschlossen:")
        print(f"  - Analysiert: {analyzed}")
        print(f"  - Fehlgeschlagen: {failed}")
        print(f"  - Ergebnisse: {result_file}")
        return True
    except Exception as e:
        print(f"[lufs-chunk] Fehler beim Schreiben von {result_file}: {e}")
        return False


def main():
    # Lese Chunk-Parameter aus Environment
    chunk_start = os.getenv('CHUNK_START')
    chunk_end = os.getenv('CHUNK_END')
    force = os.getenv('FORCE_LUFS', '').lower() in ('1', 'true', 'yes')
    
    if not chunk_start or not chunk_end:
        print("[lufs-chunk] Fehler: CHUNK_START und CHUNK_END müssen gesetzt sein")
        return 1
    
    try:
        chunk_start = int(chunk_start)
        chunk_end = int(chunk_end)
    except ValueError:
        print("[lufs-chunk] Fehler: CHUNK_START und CHUNK_END müssen Zahlen sein")
        return 1
    
    # Generiere Chunk-ID aus Range
    chunk_id = f"{chunk_start}-{chunk_end}"
    
    print(f"[lufs-chunk] Starte LUFS-Analyse für Chunk {chunk_id}...")
    print(f"[lufs-chunk] Force-Modus: {'Ja' if force else 'Nein'}")
    
    # Lade Songs die analysiert werden müssen
    songs = get_songs_to_analyze(force=force)
    
    if not songs:
        print("[lufs-chunk] Keine Songs zum Analysieren gefunden")
        return 0
    
    # Analysiere Chunk
    success = analyze_chunk(chunk_start, chunk_end, songs, chunk_id)
    
    return 0 if success else 1


if __name__ == '__main__':
    sys.exit(main())
