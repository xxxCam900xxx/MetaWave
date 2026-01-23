import sys

try:
    from update_playlist import build_metadata
except Exception as e:
    print(f"[build_metadata] Fehler beim Importieren von update_playlist: {e}")
    raise

if __name__ == "__main__":
    print("[build_metadata] Erzeuge combined metadata.json...")
    build_metadata()
    print("[build_metadata] Fertig.")
    sys.exit(0)
