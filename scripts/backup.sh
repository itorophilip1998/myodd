#!/usr/bin/env bash
# Local database backup — same idea as .env: stays on your machine, never needs GitHub.
#
# Usage:
#   ./scripts/backup.sh           Dump local Compose Postgres into ./backup/
#   ./scripts/backup.sh --pull    Copy production dumps from Hetzner into ./backup/
#   ./scripts/backup.sh --help
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

DEST="${MYODD_BACKUP_DIR:-$PROJECT_ROOT/backup}"
KEEP="${MYODD_BACKUP_KEEP:-30}"
HOST="${MYODD_BACKUP_HOST:-root@2.31.56.193}"
SSH_KEY="${MYODD_BACKUP_SSH_KEY:-$HOME/.ssh/myodd_hetzner}"
REMOTE_DIR="${MYODD_BACKUP_REMOTE_DIR:-/opt/myodd/backup}"

MODE=local
case "${1:-}" in
  '') ;;
  --pull) MODE=pull ;;
  --help|-h)
    echo 'Usage: ./scripts/backup.sh [--pull]'
    echo '  (default)  pg_dump local Docker Postgres → ./backup/myodd-*.sql.gz'
    echo '  --pull     rsync production dumps from Hetzner → ./backup/'
    echo 'Dumps are gitignored. Deploy never overwrites ./backup/.'
    exit 0
    ;;
  *) echo "Unknown option: $1 (try --help)" >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  echo 'Pass at most one option. Use --help for usage.' >&2
  exit 2
fi

mkdir -p "$DEST"

prune_old() {
  while IFS= read -r old; do
    rm -f "$old"
  done < <(find "$DEST" -maxdepth 1 -name 'myodd-*.sql.gz' -type f | sort -r | tail -n +"$((KEEP + 1))")
}

if [[ "$MODE" == pull ]]; then
  if [[ ! -f "$SSH_KEY" ]]; then
    echo "SSH key not found: $SSH_KEY" >&2
    exit 1
  fi
  rsync -az \
    -e "ssh -i ${SSH_KEY} -o IdentitiesOnly=yes -o BatchMode=yes" \
    --include='myodd-*.sql.gz' \
    --exclude='*' \
    "${HOST}:${REMOTE_DIR}/" \
    "$DEST/"
else
  if ! command -v docker >/dev/null 2>&1; then
    echo 'Docker is required for a local dump.' >&2
    exit 1
  fi
  if ! docker compose ps --status running --services 2>/dev/null | grep -qx postgres; then
    echo 'Postgres is not running. Start the stack with ./scripts/start.sh first.' >&2
    exit 1
  fi
  name="$DEST/myodd-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  docker compose exec -T postgres pg_dump -U myodd --no-owner myodd | gzip >"$name.partial"
  mv "$name.partial" "$name"
fi

prune_old

count=$(find "$DEST" -maxdepth 1 -name 'myodd-*.sql.gz' -type f | wc -l | tr -d ' ')
latest=$(ls -t "$DEST"/myodd-*.sql.gz 2>/dev/null | head -1 || true)
echo "Backup ready ($count dump(s)) → $DEST"
if [[ -n "${latest:-}" ]]; then
  ls -lah "$latest"
fi
