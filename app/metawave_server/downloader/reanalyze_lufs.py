#!/usr/bin/env python3
"""
LUFS Re-Analysis Script für bereits heruntergeladene Songs

Analysiert alle vorhandenen MP3-Dateien mit FFmpeg EBU R128 loudnorm Filter
und aktualisiert die metadata.json mit LUFS-Werten.

Usage:
    python reanalyze_lufs.py
    
Optional mit nur bestimmten Songs:
    python reanalyze_lufs.py --files "song1.mp3" "song2.mp3"
"""

import sys
import json
import argparse
from pathlib import Path

try:
    from update_playlist import SONGS_DIR, METADATA_FILE, analyze_lufs
except Exception as e:
    print(f"[reanalyze_lufs] Fehler beim Importieren: {e}")
    raise


def reanalyze_all_songs(specific_files=None):
    """Analysiert alle Songs (oder spezifische) und aktualisiert metadata.json."""
    
    if not METADATA_FILE.exists():
        print(f"[reanalyze_lufs] Fehler: {METADATA_FILE} existiert nicht.")
        print("[reanalyze_lufs] Bitte zuerst build_metadata.py ausführen.")
        return False
    
    # Lade existierende Metadata
    try:
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            metadata = json.load(f)
    except Exception as e:
        print(f"[reanalyze_lufs] Fehler beim Laden der Metadata: {e}")
        return False
    
    total = len(metadata)
    if total == 0:
        print("[reanalyze_lufs] Keine Songs in metadata.json gefunden.")
        return False
    
    print(f"[reanalyze_lufs] Starte LUFS-Re-Analyse für {total} Songs...")
    print(f"[reanalyze_lufs] Ziel: EBU R128 Standard (-16 LUFS)")
    print()
    
    updated_count = 0
    skipped_count = 0
    error_count = 0
    
    for idx, song in enumerate(metadata, 1):
        filename = song.get("filename")
        if not filename:
            print(f"[{idx}/{total}] Kein Filename in Metadata-Eintrag")
            error_count += 1
            continue
        
        # Wenn specific_files gesetzt ist, nur diese analysieren
        if specific_files and filename not in specific_files:
            continue
        
        mp3_path = SONGS_DIR / filename
        
        if not mp3_path.exists():
            print(f"[{idx}/{total}] {filename}: Datei nicht gefunden")
            error_count += 1
            continue
        
        # Prüfe ob LUFS-Daten bereits vorhanden sind
        has_lufs = song.get("lufs") is not None
        
        if has_lufs and not specific_files:
            # Skip wenn bereits LUFS-Daten vorhanden (außer bei manueller Auswahl)
            print(f"[{idx}/{total}] ⏭️  {filename}: LUFS bereits vorhanden")
            skipped_count += 1
            continue
        
        # LUFS-Analyse durchführen
        print(f"[{idx}/{total}] Analysiere {filename}...")
        lufs_data = analyze_lufs(mp3_path)
        
        if lufs_data:
            song["lufs"] = lufs_data
            input_i = lufs_data.get("input_i", 0)
            print(f"[{idx}/{total}] {filename}: {input_i:.1f} LUFS")
            updated_count += 1
        else:
            print(f"[{idx}/{total}] {filename}: Analyse fehlgeschlagen")
            error_count += 1
    
    # Speichere aktualisierte Metadata
    try:
        with open(METADATA_FILE, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        print()
        print(f"[reanalyze_lufs] Metadata erfolgreich aktualisiert!")
        print(f"[reanalyze_lufs] Statistik:")
        print(f"    - Analysiert: {updated_count}")
        print(f"    - Übersprungen: {skipped_count}")
        print(f"    - Fehler: {error_count}")
        print(f"    - Gesamt: {total}")
        return True
    except Exception as e:
        print(f"[reanalyze_lufs] Fehler beim Speichern der Metadata: {e}")
        return False


def force_reanalyze_all():
    """Forciert Re-Analyse aller Songs, auch wenn LUFS-Daten bereits vorhanden."""
    
    if not METADATA_FILE.exists():
        print(f"[reanalyze_lufs] Fehler: {METADATA_FILE} existiert nicht.")
        return False
    
    try:
        with open(METADATA_FILE, "r", encoding="utf-8") as f:
            metadata = json.load(f)
    except Exception as e:
        print(f"[reanalyze_lufs] Fehler beim Laden der Metadata: {e}")
        return False
    
    total = len(metadata)
    print(f"[reanalyze_lufs] FORCE MODE: Re-Analysiere ALLE {total} Songs...")
    print()
    
    updated_count = 0
    error_count = 0
    
    for idx, song in enumerate(metadata, 1):
        filename = song.get("filename")
        if not filename:
            error_count += 1
            continue
        
        mp3_path = SONGS_DIR / filename
        if not mp3_path.exists():
            print(f"[{idx}/{total}] {filename}: Datei nicht gefunden")
            error_count += 1
            continue
        
        print(f"[{idx}/{total}] Analysiere {filename}...")
        lufs_data = analyze_lufs(mp3_path)
        
        if lufs_data:
            song["lufs"] = lufs_data
            input_i = lufs_data.get("input_i", 0)
            print(f"[{idx}/{total}] {filename}: {input_i:.1f} LUFS")
            updated_count += 1
        else:
            print(f"[{idx}/{total}] {filename}: Analyse fehlgeschlagen")
            error_count += 1
    
    # Speichere
    try:
        with open(METADATA_FILE, "w", encoding="utf-8") as f:
            json.dump(metadata, f, indent=2, ensure_ascii=False)
        print()
        print(f"[reanalyze_lufs] Force Re-Analyse abgeschlossen!")
        print(f"    - Analysiert: {updated_count}")
        print(f"    - Fehler: {error_count}")
        return True
    except Exception as e:
        print(f"[reanalyze_lufs] Fehler beim Speichern: {e}")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="LUFS Re-Analyse für bereits heruntergeladene Songs"
    )
    parser.add_argument(
        "--files",
        nargs="+",
        help="Nur spezifische Dateien analysieren (z.B. --files song1.mp3 song2.mp3)"
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Forciert Re-Analyse aller Songs, auch wenn LUFS-Daten bereits vorhanden"
    )
    
    args = parser.parse_args()
    
    if args.force:
        success = force_reanalyze_all()
    elif args.files:
        print(f"[reanalyze_lufs] Analysiere {len(args.files)} spezifische Dateien...")
        success = reanalyze_all_songs(specific_files=set(args.files))
    else:
        success = reanalyze_all_songs()
    
    sys.exit(0 if success else 1)
