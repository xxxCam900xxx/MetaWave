#!/usr/bin/env python3
"""Entfernt nur eindeutig zugeordnete Dateien nicht mehr vorhandener Titel."""

import json
import os
from pathlib import Path

SONGS_DIR = Path(os.getenv("SONGS_DIR", "/songs"))
DELETED_VIDEOS_FILE = SONGS_DIR / "deleted_videos.json"
METADATA_FILE = SONGS_DIR / "metadata.json"


def main():
    if not DELETED_VIDEOS_FILE.exists():
        raise FileNotFoundError("Bereinigungsliste fehlt; Synchronisierung abbrechen")
    with DELETED_VIDEOS_FILE.open(encoding="utf-8") as file:
        deleted = json.load(file)
    if not isinstance(deleted, list) or any(not isinstance(vid, str) or not vid for vid in deleted):
        raise ValueError("Bereinigungsliste ist ungültig")
    if not deleted:
        print("[cleanup] Keine entfernten Titel.")
        return 0
    if os.getenv("ALLOW_OFFLINE_CLEANUP") != "1":
        raise RuntimeError(
            "Bereinigung ausgesetzt: Radio zuerst stoppen und ALLOW_OFFLINE_CLEANUP=1 "
            "für den Downloader setzen; die laufende Queue könnte sonst gelöschte Dateien verwenden."
        )

    with METADATA_FILE.open(encoding="utf-8") as file:
        metadata = json.load(file)
    if not isinstance(metadata, list):
        raise ValueError("Metadaten sind ungültig")
    by_id = {entry.get("id"): entry for entry in metadata if isinstance(entry, dict)}
    files = []
    for video_id in deleted:
        entry = by_id.get(video_id)
        name = entry.get("filename") if entry else None
        if not isinstance(name, str) or Path(name).name != name or not name.endswith(".mp3"):
            raise ValueError(f"Datei für {video_id} nicht eindeutig in Metadaten")
        audio = SONGS_DIR / name
        info = audio.with_suffix(".info.json")
        with info.open(encoding="utf-8") as file:
            if json.load(file).get("id") != video_id:
                raise ValueError(f"Infodatei passt nicht zu {video_id}")
        if not audio.is_file():
            raise FileNotFoundError(f"Audiodatei fehlt: {name}")
        files.extend((audio, info))

    for file in files:
        file.unlink()
        print(f"[cleanup] Gelöscht: {file.name}")
    DELETED_VIDEOS_FILE.unlink()
    print(f"[cleanup] {len(deleted)} entfernte Titel bereinigt")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
