#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${STATSMAN_DATA_DIR:-$ROOT/apps/ai/data/statsman}"
SEASON="${STATSMAN_SEASON:-2627}"
BASE="https://www.football-data.co.uk/mmz4281/${SEASON}"
mkdir -p "$OUT"
for f in E0 E1 E2 E3 SP1 SP2 I1 I2 D1 D2 F1 F2 N1 P1 B1 T1 G1 SC0; do
  curl -sS -L -m 30 -o "$OUT/${f}.csv" "$BASE/${f}.csv"
  echo "synced $f ($(wc -c < "$OUT/${f}.csv") bytes)"
done
# UCL form: openfootball seasons + ESPN finished Champions League games
STATSMAN_DATA_DIR="$OUT" python3 "$ROOT/scripts/sync-statsman-ucl.py"
