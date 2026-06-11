"""
MetaWave Downloader – HTTP API Server
======================================
Läuft als langlebiger Dienst. Beim Start wird automatisch ein initialer Sync
ausgeführt. Über POST /sync kann ein manueller Sync ausgelöst werden.
"""

from flask import Flask, jsonify
import threading
import subprocess
import sys
import os
import time
import json
from pathlib import Path

app = Flask(__name__)

SONGS_DIR = Path(os.getenv("SONGS_DIR", "/songs"))
SCRIPT_DIR = Path(os.path.dirname(os.path.abspath(__file__)))

_sync_status = {
    "running": False,
    "step": None,
    "startedAt": None,
    "lastRun": None,
    "lastError": None,
    "log": [],
}
# Lock ensures only one sync runs at a time
_sync_lock = threading.Lock()


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _log(msg: str):
    ts = time.strftime("%H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    _sync_status["log"].append(line)
    # Keep only the last 300 lines in memory
    if len(_sync_status["log"]) > 300:
        _sync_status["log"] = _sync_status["log"][-300:]


def _run_script(script_name: str, extra_env: dict | None = None, timeout: int = 7200):
    """Runs a Python script as subprocess, streams output to log. Raises on failure."""
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    script_path = SCRIPT_DIR / script_name
    if not script_path.exists():
        _log(f"[WARN] Script {script_name} nicht gefunden – übersprungen.")
        return ""

    result = subprocess.run(
        [sys.executable, "-u", str(script_path)],
        capture_output=True,
        text=True,
        env=env,
        timeout=timeout,
    )
    combined = result.stdout + result.stderr
    for line in combined.splitlines():
        if line.strip():
            _log(line)
    if result.returncode != 0:
        raise RuntimeError(f"{script_name} exited with code {result.returncode}")
    return result.stdout


# ─── Sync pipeline ────────────────────────────────────────────────────────────

def run_full_sync():
    """Full sync pipeline — meant to run in a background thread."""
    # Only allow one concurrent sync
    acquired = _sync_lock.acquire(blocking=False)
    if not acquired:
        _log("[sync] Sync läuft bereits – Anfrage ignoriert.")
        return

    _sync_status["running"] = True
    _sync_status["startedAt"] = time.time()
    _sync_status["lastError"] = None
    _sync_status["log"] = []
    _sync_status["step"] = "starting"

    try:
        # ── Step 1: Sync playlist URLs from DB ───────────────────────────────
        _log("=== Schritt 1/4: Playlists aus Datenbank synchronisieren ===")
        _sync_status["step"] = "sync"
        sync_output = _run_script("sync_playlist.py")

        # Parse number of new videos from last numeric line
        new_count = 0
        for line in sync_output.splitlines():
            stripped = line.strip()
            if stripped.isdigit():
                new_count = int(stripped)
        _log(f"Neue Videos erkannt: {new_count}")

        # ── Pre-step: build metadata for already-downloaded songs immediately ──
        # This ensures existing songs get thumbnails/duration even before new ones
        # finish downloading.
        _log("=== Vor-Schritt: Metadaten für vorhandene Songs aufbauen ===")
        _sync_status["step"] = "metadata_pre"
        try:
            _run_script("build_metadata.py")
        except Exception as pre_err:
            _log(f"[WARN] Vor-Metadaten konnten nicht gebaut werden: {pre_err}")

        # ── Step 2: Download new songs ────────────────────────────────────────
        if new_count > 0:
            _log("=== Schritt 2/4: Neue Songs herunterladen ===")
            _sync_status["step"] = "download"
            playlist_file = SONGS_DIR / "playlist_urls.json"
            if playlist_file.exists():
                with open(playlist_file, encoding="utf-8") as f:
                    urls = json.load(f)
                total = len(urls)
                if total > 0:
                    _log(f"Starte Download von {total} Songs...")
                    _run_script("download_chunk.py", extra_env={
                        "CHUNK_START": "1",
                        "CHUNK_END": str(total),
                    }, timeout=14400)  # 4h timeout for large playlists
            else:
                _log("[WARN] playlist_urls.json nicht gefunden – Download übersprungen.")
        else:
            _log("Keine neuen Songs – Download übersprungen.")

        # ── Step 3: Cleanup deleted songs ────────────────────────────────────
        _log("=== Schritt 3/4: Gelöschte Songs aufräumen ===")
        _sync_status["step"] = "cleanup"
        _run_script("cleanup_deleted.py")

        # ── Step 4: Rebuild metadata ──────────────────────────────────────────
        _log("=== Schritt 4/4: Metadaten neu aufbauen ===")
        _sync_status["step"] = "metadata"
        _run_script("build_metadata.py")

        _log("=== Sync erfolgreich abgeschlossen! ===")
        _sync_status["lastRun"] = time.time()
        _sync_status["step"] = "done"

    except Exception as e:
        _log(f"!!! FEHLER: {e}")
        _sync_status["lastError"] = str(e)
        _sync_status["step"] = "error"
    finally:
        _sync_status["running"] = False
        _sync_lock.release()


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/sync", methods=["POST"])
def trigger_sync():
    if _sync_status["running"]:
        return jsonify({
            "status": "already_running",
            "step": _sync_status["step"],
        }), 409
    thread = threading.Thread(target=run_full_sync, daemon=True)
    thread.start()
    return jsonify({"status": "started"}), 202


@app.route("/sync/status", methods=["GET"])
def get_status():
    last_run = _sync_status["lastRun"]
    return jsonify({
        "running": _sync_status["running"],
        "step": _sync_status["step"],
        "startedAt": _sync_status["startedAt"],
        "lastRun": last_run,
        "lastRunFormatted": time.strftime("%d.%m.%Y %H:%M", time.localtime(last_run)) if last_run else None,
        "lastError": _sync_status["lastError"],
        "log": _sync_status["log"][-50:],
    })


# ─── Startup ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _log("MetaWave Downloader API gestartet.")
    _log(f"Songs-Verzeichnis: {SONGS_DIR}")

    # Wait briefly for DB to come up (in case healthcheck isn't perfect)
    time.sleep(5)

    # Kick off initial sync in background so the HTTP server is immediately reachable
    _log("Starte initialen Sync im Hintergrund...")
    init_thread = threading.Thread(target=run_full_sync, daemon=True)
    init_thread.start()

    app.run(host="0.0.0.0", port=5001, debug=False, threaded=True)
