#!/usr/bin/env bash
# Runs LUFS re-analysis inside the downloader container.
# Usage:
#   ./run_lufs_analysis.sh             # analyze only missing values
#   ./run_lufs_analysis.sh --force     # force reanalyze all
#   ./run_lufs_analysis.sh --files "Song A.mp3" "Song B.mp3"
#   ./run_lufs_analysis.sh --force --restart

set -euo pipefail

COMPOSE_FILE="compose.enviroment.yaml"
DOCKER_COMPOSE=(docker compose -f "$COMPOSE_FILE")

FORCE=0
RESTART=0
FILES=()

print_usage(){
  cat <<EOF
Usage: $0 [--force] [--restart] [--files <file1> <file2> ...]

Options:
  --force      Force re-analysis of all songs
  --restart    Restart radio container after analysis
  --files      Space-separated list of filenames to analyze
  -h, --help   Show this help
EOF
}

# parse
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force)
      FORCE=1; shift;;
    --restart)
      RESTART=1; shift;;
    --files)
      shift
      while [[ $# -gt 0 && ! "$1" =~ ^-- ]]; do
        FILES+=("$1"); shift
      done
      ;;
    -h|--help)
      print_usage; exit 0;;
    *)
      echo "Unknown option: $1"; print_usage; exit 1;;
  esac
done

CMD=("run" "--rm" "downloader" "python" "-u" "reanalyze_lufs.py")

if [[ $FORCE -eq 1 ]]; then
  CMD+=("--force")
fi

if [[ ${#FILES[@]} -gt 0 ]]; then
  for f in "${FILES[@]}"; do
    CMD+=("--files" "$f")
  done
fi

echo "Running: ${DOCKER_COMPOSE[*]} ${CMD[*]}"
"${DOCKER_COMPOSE[@]}" "${CMD[@]}"

if [[ $? -ne 0 ]]; then
  echo "reanalyze_lufs.py failed" >&2
  exit 1
fi

if [[ $RESTART -eq 1 ]]; then
  echo "Restarting radio container..."
  "${DOCKER_COMPOSE[@]}" restart radio
fi

echo "Done."
