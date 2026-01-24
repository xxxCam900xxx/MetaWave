#!/usr/bin/env bash
set -u

# Usage: ./run_downloader_chunks.sh --ChunkSize 300 --MaxParallel 3 --CookiesFile /abs/path/to/www.youtube.com_cookies.txt

CHUNK_SIZE=300
MAX_PARALLEL=3
COOKIES_FILE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -ChunkSize|--ChunkSize)
      CHUNK_SIZE="$2"; shift 2;;
    -MaxParallel|--MaxParallel)
      MAX_PARALLEL="$2"; shift 2;;
    -CookiesFile|--CookiesFile)
      COOKIES_FILE="$2"; shift 2;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

echo "[orchestrator] Verwende ChunkSize=${CHUNK_SIZE}, MaxParallel=${MAX_PARALLEL}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/compose.enviroment.yaml"

cookie_volume_arg=()
cookie_env_arg=()
if [[ -n "$COOKIES_FILE" ]]; then
  if abs=$(realpath "$COOKIES_FILE" 2>/dev/null); then
    # RW-Mount, damit yt-dlp Cookies aktualisieren kann
    cookie_volume_arg+=("-v" "${abs}:/cookies/www.youtube.com_cookies.txt")
    cookie_env_arg+=("-e" "YT_COOKIES=/cookies/www.youtube.com_cookies.txt")
    echo "[orchestrator] Verwende Cookie-Datei: $abs"
  else
    echo "[orchestrator] Warnung: Konnte CookiesFile '$COOKIES_FILE' nicht auflösen. Fahre ohne Cookies fort."
  fi
fi

echo "[orchestrator] Baue zuerst das downloader-Image (falls notwendig)..."
docker compose -f "$COMPOSE_FILE" build downloader || {
  echo "[orchestrator] Fehler beim Bauen des downloader-Images." >&2
  exit 1
}

echo "[orchestrator] Flatten der Playlist via Container und Ermittlung der Länge..."
flatten_cmd=(docker compose -f "$COMPOSE_FILE" run --rm "${cookie_volume_arg[@]}" "${cookie_env_arg[@]}" downloader python -u flatten_playlist.py)
echo "[orchestrator] Befehl (flatten): ${flatten_cmd[*]}"
flatten_output=$("${flatten_cmd[@]}" 2>&1) || {
  echo "[orchestrator] Fehler beim Ermitteln der Playlist-Länge:"
  echo "$flatten_output"
  exit 1
}

# Parse last numeric line
total=0
while IFS= read -r line; do
  trimmed="$(echo -n "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [[ "$trimmed" =~ ^[0-9]+$ ]]; then
    total=$trimmed
  fi
done <<< "$flatten_output"

if (( total <= 0 )); then
  echo "[orchestrator] Konnte keine gültige Playlist-Länge ausgeben. Ausgabe:"
  echo "$flatten_output"
  exit 1
fi

echo "[orchestrator] Playlist-Länge: $total Videos"

# Alte downloader-chunk-Container aufräumen, damit es keine Namenskonflikte gibt
echo "[orchestrator] Entferne alte downloader-chunk-Container (falls vorhanden)..."
old_ids=$(docker ps -a --filter "name=downloader-chunk-" -q || true)
if [[ -n "$old_ids" ]]; then
  docker rm -f $old_ids >/dev/null 2>&1 || true
fi

# Build chunk lists (robust, ohne Überschuss wie 901-872)
starts=()
ends=()
if (( CHUNK_SIZE <= 0 )); then
  echo "[orchestrator] Fehler: ChunkSize muss > 0 sein."
  exit 1
fi

num_chunks=$(((total + CHUNK_SIZE - 1) / CHUNK_SIZE))
for ((i=0; i<num_chunks; i++)); do
  start=$((i * CHUNK_SIZE + 1))
  end=$((start + CHUNK_SIZE - 1))
  if (( end > total )); then end=$total; fi
  starts+=("$start")
  ends+=("$end")
done

echo "[orchestrator] Starte ${#starts[@]} Downloader-Runs (max. ${MAX_PARALLEL} parallel)..."

failed_flag=0
tmp_fail_prefix="/tmp/downloader_chunk_failed_$$"
trap 'rm -f ${tmp_fail_prefix}*' EXIT

run_chunk() {
  local start="$1" end="$2" idx="$3" range="${start}-${end}"
  echo "[orchestrator][job] Chunk $range gestartet"
  # Eindeutiger Container-Name: Range + Index, um Namenskonflikte zu vermeiden
  local containerName="downloader-chunk-${range}-${idx}"
  local chunk_cmd=(docker compose -f "$COMPOSE_FILE" run --rm --name "$containerName" "${cookie_volume_arg[@]}" "${cookie_env_arg[@]}" -e CHUNK_START="$start" -e CHUNK_END="$end" downloader python -u download_chunk.py)
  echo "[orchestrator][job] Befehl ($range): ${chunk_cmd[*]}"

  # Ausgabe des Containers mit Range-Prefix loggen
  {
    "${chunk_cmd[@]}" 2>&1
  } | while IFS= read -r line; do
        echo "[orchestrator][job][$range] $line"
      done

  exitCode=${PIPESTATUS[0]}
  if [[ $exitCode -ne 0 ]]; then
    echo "[orchestrator][job] Fehler in Chunk $range, ExitCode=$exitCode"
    touch "${tmp_fail_prefix}${range}"
  else
    echo "[orchestrator][job] Chunk $range erfolgreich"
  fi
}

pids=()
for idx in "${!starts[@]}"; do
  s=${starts[$idx]}
  e=${ends[$idx]}
  # wait if too many jobs running
  while (( $(jobs -rp | wc -l) >= MAX_PARALLEL )); do sleep 2; done
  run_chunk "$s" "$e" "$idx" &
  pids+=($!)
done

# wait for all
for pid in "${pids[@]}"; do
  wait "$pid" || true
done

# determine if any failed
if compgen -G "${tmp_fail_prefix}*" >/dev/null 2>&1; then
  echo "[orchestrator] Achtung: Mindestens ein Chunk ist fehlgeschlagen."
  failed_flag=1
fi

# check running downloader containers
echo "[orchestrator] Prüfe, ob noch Downloader-Container laufen..."
running=$(docker ps --format '{{.Names}}' | grep -i downloader || true)
if [[ -n "$running" ]]; then
  echo "[orchestrator] Warnung: Es sind noch Downloader-Container aktiv:"
  echo "$running"
  echo "[orchestrator] Warte 10 Sekunden und versuche es erneut..."
  sleep 10
  running=$(docker ps --format '{{.Names}}' | grep -i downloader || true)
  if [[ -n "$running" ]]; then
    echo "[orchestrator] Downloader-Container laufen weiterhin. Abbruch vor Metadata-Erstellung."
    exit 1
  fi
fi

echo "[orchestrator] Erzeuge jetzt kombinierte metadata.json aus allen vorhandenen .info.json Dateien..."
metadata_cmd=(docker compose -f "$COMPOSE_FILE" run --rm "${cookie_volume_arg[@]}" "${cookie_env_arg[@]}" downloader python -u build_metadata.py)
echo "[orchestrator] Befehl (metadata): ${metadata_cmd[*]}"
"${metadata_cmd[@]}"
if [[ $? -ne 0 ]]; then
  echo "[orchestrator] Fehler beim Erzeugen der Metadaten (trotz vorhandener Dateien)."
  exit 1
fi

echo "[orchestrator] Fertig: metadata.json aus allen aktuell vorhandenen Dateien erstellt."
