#!/usr/bin/env bash
set -u

# Usage: ./run_downloader_chunks.sh --ChunkSize 300 --MaxParallel 3 --CookiesFile /abs/path/to/www.youtube.com_cookies.txt [--SkipLufs] [--ForceLufs]

CHUNK_SIZE=300
MAX_PARALLEL=3
COOKIES_FILE=""
SKIP_LUFS=0
FORCE_LUFS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    -ChunkSize|--ChunkSize)
      CHUNK_SIZE="$2"; shift 2;;
    -MaxParallel|--MaxParallel)
      MAX_PARALLEL="$2"; shift 2;;
    -CookiesFile|--CookiesFile)
      COOKIES_FILE="$2"; shift 2;;
    --SkipLufs)
      SKIP_LUFS=1; shift;;
    --ForceLufs)
      FORCE_LUFS=1; shift;;
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

echo "[orchestrator] Synchronisiere Playlist (nur neue Videos werden geladen)..."
sync_cmd=(docker compose -f "$COMPOSE_FILE" run --rm "${cookie_volume_arg[@]}" "${cookie_env_arg[@]}" downloader python -u sync_playlist.py)
echo "[orchestrator] Befehl (sync): ${sync_cmd[*]}"
sync_output=$("${sync_cmd[@]}" 2>&1) || {
  echo "[orchestrator] Fehler beim Synchronisieren der Playlist:"
  echo "$sync_output"
  exit 1
}

# Parse last numeric line (Anzahl NEUER Videos)
total=0
while IFS= read -r line; do
  trimmed="$(echo -n "$line" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  if [[ "$trimmed" =~ ^[0-9]+$ ]]; then
    total=$trimmed
  fi
done <<< "$sync_output"

if (( total <= 0 )); then
  echo "[orchestrator] Keine neuen Videos zum Download. Playlist ist synchron!"
  
  # Cleanup gelöschter Videos trotzdem durchführen
  echo "[orchestrator] Prüfe auf gelöschte Videos..."
  cleanup_cmd=(docker compose -f "$COMPOSE_FILE" run --rm "${cookie_volume_arg[@]}" "${cookie_env_arg[@]}" downloader python -u cleanup_deleted.py)
  "${cleanup_cmd[@]}"
  
  # Metadata neu generieren
  echo "[orchestrator] Aktualisiere metadata.json..."
  metadata_cmd=(docker compose -f "$COMPOSE_FILE" run --rm "${cookie_volume_arg[@]}" "${cookie_env_arg[@]}" downloader python -u build_metadata.py)
  "${metadata_cmd[@]}"
  
  echo "[orchestrator] Synchronisation abgeschlossen (keine Downloads nötig)."
  exit 0
fi

echo "[orchestrator] Neue Videos: $total"

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

# 4.5) Cleanup gelöschter Videos
echo "[orchestrator] Lösche Videos die nicht mehr in der Playlist sind..."
cleanup_cmd=(docker compose -f "$COMPOSE_FILE" run --rm "${cookie_volume_arg[@]}" "${cookie_env_arg[@]}" downloader python -u cleanup_deleted.py)
"${cleanup_cmd[@]}"

if [[ $? -ne 0 ]]; then
  echo "[orchestrator] Warnung: Cleanup fehlgeschlagen, aber Downloads sind OK."
fi

# Metadata nochmal neu generieren nach Cleanup
echo "[orchestrator] Aktualisiere metadata.json nach Cleanup..."
metadata_cmd=(docker compose -f "$COMPOSE_FILE" run --rm "${cookie_volume_arg[@]}" "${cookie_env_arg[@]}" downloader python -u build_metadata.py)
"${metadata_cmd[@]}"

# 5) Automatische LUFS-Analyse (falls nicht übersprungen) - PARALLELISIERT
if [[ $SKIP_LUFS -eq 0 ]]; then
  echo "[orchestrator] Starte automatische LUFS-Analyse (parallelisiert)..."
  
  # 5a) Finde alle Songs die LUFS-Analyse brauchen
  echo "[orchestrator] Ermittle Songs für LUFS-Analyse..."
  force_flag=()
  if [[ $FORCE_LUFS -eq 1 ]]; then
    force_flag+=(-e FORCE_LUFS=1)
  fi
  
  count_cmd=(docker compose -f "$COMPOSE_FILE" run --rm "${cookie_volume_arg[@]}" "${cookie_env_arg[@]}" "${force_flag[@]}" downloader python -u -c "from analyze_lufs_chunk import get_songs_to_analyze; songs = get_songs_to_analyze($([[ $FORCE_LUFS -eq 1 ]] && echo 'True' || echo 'False')); print(len(songs))")
  song_count=$("${count_cmd[@]}" 2>&1 | tail -n 1)
  
  if [[ $song_count =~ ^[0-9]+$ ]] && [[ $song_count -gt 0 ]]; then
    echo "[orchestrator] Gefunden: $song_count Songs für LUFS-Analyse"
    
    # 5b) Erstelle Chunks für LUFS-Analyse (1-basiert)
    lufs_chunks=()
    for ((i=1; i<=song_count; i+=CHUNK_SIZE)); do
      chunk_end=$((i + CHUNK_SIZE - 1))
      if [[ $chunk_end -gt $song_count ]]; then
        chunk_end=$song_count
      fi
      lufs_chunks+=("$i:$chunk_end")
    done
    
    echo "[orchestrator] LUFS-Chunks: ${#lufs_chunks[@]} (ChunkSize=$CHUNK_SIZE, MaxParallel=$MAX_PARALLEL)"
    
    # 5c) Parallel LUFS-Analyse
    lufs_pids=()
    lufs_chunk_idx=0
    
    for lufs_chunk in "${lufs_chunks[@]}"; do
      ((lufs_chunk_idx++))
      IFS=':' read -r lufs_start lufs_end <<< "$lufs_chunk"
      lufs_range="$lufs_start-$lufs_end"
      
      # Throttling: nicht mehr als $MAX_PARALLEL Jobs gleichzeitig
      while [[ ${#lufs_pids[@]} -ge $MAX_PARALLEL ]]; do
        for pid_idx in "${!lufs_pids[@]}"; do
          pid="${lufs_pids[$pid_idx]}"
          if ! kill -0 "$pid" 2>/dev/null; then
            wait "$pid"
            unset 'lufs_pids[pid_idx]'
          fi
        done
        lufs_pids=("${lufs_pids[@]}")  # Re-index array
        if [[ ${#lufs_pids[@]} -ge $MAX_PARALLEL ]]; then
          sleep 5
        fi
      done
      
      echo "[orchestrator] Starte LUFS-Chunk $lufs_chunk_idx/${#lufs_chunks[@]}: Range=$lufs_range"
      
      # Starte LUFS-Chunk im Hintergrund
      (
        container_name="lufs-chunk-$lufs_range"
        lufs_cmd=(docker compose -f "$COMPOSE_FILE" run --rm --name "$container_name" "${cookie_volume_arg[@]}" "${cookie_env_arg[@]}" "${force_flag[@]}" -e CHUNK_START="$lufs_start" -e CHUNK_END="$lufs_end" downloader python -u analyze_lufs_chunk.py)
        echo "[orchestrator][lufs] LUFS-Chunk $lufs_range gestartet"
        echo "[orchestrator][lufs] Befehl: ${lufs_cmd[*]}"
        
        "${lufs_cmd[@]}" 2>&1 | while IFS= read -r line; do
          echo "[orchestrator][lufs][$lufs_range] $line"
        done
        
        exit_code=${PIPESTATUS[0]}
        if [[ $exit_code -ne 0 ]]; then
          echo "[orchestrator][lufs] Fehler in LUFS-Chunk $lufs_range, ExitCode=$exit_code"
          exit "$exit_code"
        else
          echo "[orchestrator][lufs] LUFS-Chunk $lufs_range erfolgreich"
        fi
      ) &
      
      lufs_pids+=($!)
    done
    
    # 5d) Warte auf alle LUFS-Jobs
    echo "[orchestrator] Warte auf alle LUFS-Jobs..."
    lufs_failed=0
    for pid in "${lufs_pids[@]}"; do
      if ! wait "$pid"; then
        lufs_failed=1
        echo "[orchestrator] LUFS-Job (PID=$pid) fehlgeschlagen."
      fi
    done
    
    # 5e) Merge LUFS-Ergebnisse
    if [[ $lufs_failed -eq 0 ]]; then
      echo "[orchestrator] Merge LUFS-Ergebnisse..."
      merge_cmd=(docker compose -f "$COMPOSE_FILE" run --rm "${cookie_volume_arg[@]}" "${cookie_env_arg[@]}" downloader python -u merge_lufs_results.py)
      "${merge_cmd[@]}"
      
      if [[ $? -ne 0 ]]; then
        echo "[orchestrator] LUFS-Merge fehlgeschlagen."
      else
        echo "[orchestrator] LUFS-Analyse erfolgreich abgeschlossen."
        
        # Radio-Neustart damit neue LUFS-Werte geladen werden
        echo "[orchestrator] Starte Radio neu damit neue LUFS-Werte geladen werden..."
        docker compose -f "./metawave_server/compose.server.yaml" restart radio
        echo "[orchestrator] Radio wurde neugestartet."
      fi
    else
      echo "[orchestrator] LUFS-Analyse fehlgeschlagen (mindestens ein Chunk)."
    fi
    
  elif [[ $song_count -eq 0 ]]; then
    echo "[orchestrator] Keine Songs brauchen LUFS-Analyse."
  else
    echo "[orchestrator] Fehler beim Ermitteln der Song-Anzahl für LUFS."
  fi
else
  echo "[orchestrator] LUFS-Analyse übersprungen (--SkipLufs gesetzt). Starte manuell: ./run_lufs_analysis.sh --restart"
fi

echo "[orchestrator] Alle Schritte abgeschlossen."
