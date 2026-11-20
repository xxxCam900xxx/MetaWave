#!/usr/bin/env python3
"""Verhindert Bereinigung nach Playlist-Änderungen während eines langen Downloads."""

import json
from sync_playlist import SNAPSHOT_FILE, fetch_playlist_sources


def main():
    with open(SNAPSHOT_FILE, encoding="utf-8") as file:
        snapshot = json.load(file)
    if not isinstance(snapshot, dict) or not isinstance(snapshot.get("active_ids"), list):
        raise ValueError("Playlist-Snapshot ist ungültig; Cleanup abgebrochen")
    _, memberships, active_ids = fetch_playlist_sources()
    expected = snapshot.get("memberships")
    if (not isinstance(expected, dict) or set(expected) != set(memberships)
            or any(not isinstance(ids, list) or not all(isinstance(vid, str) and vid for vid in ids)
                   for ids in expected.values())
            or not all(isinstance(vid, str) and vid for vid in snapshot["active_ids"])):
        raise ValueError("Playlist-Konfiguration hat sich geändert; Cleanup abgebrochen")
    if any(set(expected[key]) != set(memberships[key]) for key in memberships):
        raise ValueError("Playlist-Inhalte haben sich geändert; Cleanup abgebrochen")
    if set(snapshot.get("active_ids", [])) != active_ids:
        raise ValueError("Aktive Playlist-Inhalte haben sich geändert; Cleanup abgebrochen")
    print("[sync] Playlist-Abgleich vor Bereinigung erfolgreich.")


if __name__ == "__main__":
    main()
