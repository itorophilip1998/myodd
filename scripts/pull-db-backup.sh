#!/usr/bin/env bash
# Pull myOdd Postgres dumps from the Hetzner host onto this Mac.
set -euo pipefail

HOST="${MYODD_BACKUP_HOST:-root@2.31.56.193}"
SSH_KEY="${MYODD_BACKUP_SSH_KEY:-$HOME/.ssh/myodd_hetzner}"
VOLUME="${MYODD_BACKUP_VOLUME:-myodd_postgres_backups}"
DEST="${MYODD_BACKUP_DIR:-$HOME/Backups/myodd}"

mkdir -p "$DEST"

ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o BatchMode=yes "$HOST" \
  "docker run --rm -v ${VOLUME}:/backups alpine tar -c -C /backups ." \
  | tar -x -C "$DEST"

# Keep last 30 local dumps (plus last-success marker)
while IFS= read -r old; do
  rm -f "$old"
done < <(find "$DEST" -maxdepth 1 -name 'myodd-*.sql.gz' -type f | sort -r | tail -n +31)

count=$(find "$DEST" -maxdepth 1 -name 'myodd-*.sql.gz' -type f | wc -l | tr -d ' ')
latest=$(ls -t "$DEST"/myodd-*.sql.gz 2>/dev/null | head -1 || true)
echo "Synced $count dump(s) → $DEST"
if [[ -n "${latest:-}" ]]; then
  ls -lah "$latest"
fi
