"""
MetaWave Downloader – HTTP API Server
======================================
Läuft als langlebiger Dienst. Ein Scheduler führt fällige monatliche Syncs aus.
Über POST /sync kann ein manueller Sync ausgelöst werden.
"""

from flask import Flask, jsonify
import threading
import subprocess
import sys
import os
import time
import json
import queue
import signal
from datetime import datetime
from pathlib import Path
from schedule import TIMEZONE, should_sync
from storage import write_json_atomic

app = Flask(__name__)

SONGS_DIR = Path(os.getenv("SONGS_DIR", "/songs"))
SCRIPT_DIR = Path(os.path.dirname(os.path.abspath(__file__)))
STATE_FILE = SONGS_DIR / ".metawave-downloader" / "state.json"

_sync_status = {
    "running": False,
    "step": None,
    "startedAt": None,
    "lastRun": None,
    "lastAttempt": None,
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
    """Runs a Python script and streams output to the UI while enforcing a timeout."""
    env = os.environ.copy()
    if extra_env:
        env.update(extra_env)
    script_path = SCRIPT_DIR / script_name
    if not script_path.exists():
        raise FileNotFoundError(f"Script {script_name} nicht gefunden")

    process = subprocess.Popen(
        [sys.executable, "-u", str(script_path)],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        env=env,
        bufsize=1,
        start_new_session=os.name != "nt",
    )
    output = queue.Queue()

    def read_output():
        try:
            for line in process.stdout:
                output.put(line)
        finally:
            output.put(None)

    reader = threading.Thread(target=read_output, daemon=True)
    reader.start()
    lines = []
    deadline = time.monotonic() + timeout
    timed_out = False
    try:
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                timed_out = True
                raise TimeoutError(f"{script_name} hat das Zeitlimit überschritten")
            try:
                line = output.get(timeout=min(remaining, 1))
            except queue.Empty:
                continue
            if line is None:
                break
            line = line.rstrip()
            if line:
                _log(line)
                lines.append(line)
                if len(lines) > 1000:
                    lines.pop(0)
        try:
            code = process.wait(timeout=max(0.001, deadline - time.monotonic()))
        except subprocess.TimeoutExpired as exc:
            timed_out = True
            raise TimeoutError(f"{script_name} hat das Zeitlimit überschritten") from exc
        if code:
            raise RuntimeError(f"{script_name} exited with code {code}")
        return "\n".join(lines)
    finally:
        if timed_out or process.poll() is None:
            if os.name != "nt":
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            elif process.poll() is None:
                process.kill()
            process.wait()
        reader.join(timeout=5)
        process.stdout.close()


def _persist_state():
    write_json_atomic(STATE_FILE, {
        "lastRun": _sync_status["lastRun"],
        "lastAttempt": _sync_status["lastAttempt"],
        "lastError": _sync_status["lastError"],
    })


def _restore_state():
    if not STATE_FILE.exists():
        return
    with STATE_FILE.open(encoding="utf-8") as file:
        state = json.load(file)
    if not isinstance(state, dict):
        raise ValueError("Downloader-Statusdatei ist ungültig")
    for key in ("lastRun", "lastAttempt"):
        value = state.get(key)
        if value is not None and (isinstance(value, bool) or not isinstance(value, (int, float))):
            raise ValueError(f"Ungültiger Wert in Downloader-Statusdatei: {key}")
        _sync_status[key] = value
    if state.get("lastError") is not None and not isinstance(state["lastError"], str):
        raise ValueError("Ungültiger Fehler in Downloader-Statusdatei")
    _sync_status["lastError"] = state.get("lastError")


# ─── Sync pipeline ────────────────────────────────────────────────────────────

def run_full_sync():
    """Full sync pipeline — meant to run in a background thread."""
    previous_last_run = _sync_status["lastRun"]
    try:
        _persist_state()
        _log("=== Schritt 1/5: Lokale Titel erfassen ===")
        _sync_status["step"] = "metadata_pre"
        _run_script("build_metadata.py")
        # ── Step 1: Sync playlist URLs from DB ───────────────────────────────
        _log("=== Schritt 2/5: Playlists aus Datenbank synchronisieren ===")
        _sync_status["step"] = "sync"
        sync_output = _run_script("sync_playlist.py")

        # Parse number of new videos from last numeric line
        new_count = None
        for line in sync_output.splitlines():
            stripped = line.strip()
            if stripped.isdigit():
                new_count = int(stripped)
        if new_count is None:
            raise ValueError("Synchronisierung lieferte keine Anzahl neuer Titel")
        _log(f"Neue Videos erkannt: {new_count}")

        # ── Step 2: Download new songs ────────────────────────────────────────
        if new_count > 0:
            _log("=== Schritt 3/5: Neue Songs herunterladen ===")
            _sync_status["step"] = "download"
            playlist_file = SONGS_DIR / "playlist_urls.json"
            if playlist_file.exists():
                with open(playlist_file, encoding="utf-8") as f:
                    urls = json.load(f)
                if not isinstance(urls, list) or len(urls) != new_count:
                    raise ValueError("Downloadliste stimmt nicht mit der Synchronisierung überein")
                total = len(urls)
                if total > 0:
                    _log(f"Starte Download von {total} Songs...")
                    try:
                        _run_script("download_chunk.py", extra_env={
                            "CHUNK_START": "1",
                            "CHUNK_END": str(total),
                        }, timeout=86400)
                    except Exception:
                        _run_script("build_metadata.py")
                        raise
                else:
                    raise ValueError("Downloadliste ist trotz neuer Titel leer")
            else:
                raise FileNotFoundError("playlist_urls.json nicht gefunden")
        else:
            _log("Keine neuen Songs – Download übersprungen.")

        _log("[sync] Prüfe heruntergeladene Audiodateien...")
        _sync_status["step"] = "verify"
        _run_script("build_metadata.py")
        _run_script("verify_downloads.py")

        _log("=== Schritt 4/5: LUFS aktualisieren ===")
        _sync_status["step"] = "lufs"
        _run_script("reanalyze_lufs.py", timeout=86400)

        _log("=== Schritt 5/5: Gelöschte Songs aufräumen ===")
        _sync_status["step"] = "cleanup"
        _run_script("verify_playlists.py")
        _run_script("cleanup_deleted.py")
        _sync_status["step"] = "metadata"
        _run_script("build_metadata.py")

        _sync_status["lastRun"] = time.time()
        _sync_status["lastError"] = None
        try:
            _persist_state()
        except Exception:
            _sync_status["lastRun"] = previous_last_run
            raise
        _log("=== Sync erfolgreich abgeschlossen! ===")
        _sync_status["step"] = "done"

    except Exception as e:
        _log(f"!!! FEHLER: {e}")
        _sync_status["lastAttempt"] = time.time()
        _sync_status["lastError"] = str(e)
        _sync_status["step"] = "error"
        try:
            _persist_state()
        except (OSError, ValueError) as state_error:
            _log(f"!!! FEHLER beim Speichern des Status: {state_error}")
    finally:
        _sync_status["running"] = False
        _sync_lock.release()


def start_sync():
    if not _sync_lock.acquire(blocking=False):
        return False
    _sync_status.update(running=True, step="starting", startedAt=time.time(),
                        lastAttempt=time.time(), lastError=None, log=[])
    try:
        threading.Thread(target=run_full_sync, daemon=True).start()
    except Exception:
        _sync_status["running"] = False
        _sync_lock.release()
        raise
    return True


def scheduler_loop():
    while True:
        now = datetime.now(TIMEZONE)
        if should_sync(now, _sync_status["lastRun"], _sync_status["lastAttempt"]):
            start_sync()
        time.sleep(60)


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


@app.route("/sync", methods=["POST"])
def trigger_sync():
    if not start_sync():
        return jsonify({
            "status": "already_running",
            "step": _sync_status["step"],
        }), 409
    return jsonify({"status": "started"}), 202


@app.route("/sync/status", methods=["GET"])
def get_status():
    last_run = _sync_status["lastRun"]
    return jsonify({
        "running": _sync_status["running"],
        "step": _sync_status["step"],
        "startedAt": _sync_status["startedAt"],
        "lastRun": last_run,
        "lastRunFormatted": datetime.fromtimestamp(last_run, TIMEZONE).strftime("%d.%m.%Y %H:%M") if last_run else None,
        "lastError": _sync_status["lastError"],
        "log": _sync_status["log"][-50:],
    })


# ─── Startup ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _log("MetaWave Downloader API gestartet.")
    _log(f"Songs-Verzeichnis: {SONGS_DIR}")

    _restore_state()
    threading.Thread(target=scheduler_loop, daemon=True).start()

    app.run(host="0.0.0.0", port=5001, debug=False, threaded=True)
