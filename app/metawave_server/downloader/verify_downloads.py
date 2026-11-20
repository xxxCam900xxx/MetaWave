#!/usr/bin/env python3
"""Prüft vor dem Cleanup, ob alle aktiven Titel erfolgreich heruntergeladen wurden."""

import json
from pathlib import Path
from sync_playlist import METADATA_FILE, SNAPSHOT_FILE


def main():
    with open(SNAPSHOT_FILE, encoding="utf-8") as file:
        snapshot = json.load(file)
    with open(METADATA_FILE, encoding="utf-8") as file:
        metadata = json.load(file)
    if (not isinstance(metadata, list) or not isinstance(snapshot, dict)
            or not isinstance(snapshot.get("active_ids"), list)
            or not snapshot["active_ids"]
            or not all(isinstance(vid, str) and vid for vid in snapshot["active_ids"])):
        raise ValueError("Metadaten oder Playlist-Abgleich sind ungültig")
    root = Path(METADATA_FILE).parent
    available = set()
    for entry in metadata:
        name = entry.get("filename") if isinstance(entry, dict) else None
        if isinstance(name, str) and Path(name).name == name and (root / name).is_file() and (root / name).stat().st_size:
            available.add(entry.get("id"))
    missing = set(snapshot["active_ids"]) - available
    if missing:
        raise RuntimeError(f"{len(missing)} aktive Titel fehlen nach dem Download; Cleanup abgebrochen")
    print(f"[sync] {len(snapshot['active_ids'])} aktive Titel lokal vorhanden.")


if __name__ == "__main__":
    main()
