#!/usr/bin/env bash
# Run on the Hetzner host after code sync. Preserves local env files.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/opt/myodd}"
cd "$DEPLOY_DIR"

if [[ ! -f .env ]]; then
  echo "Missing $DEPLOY_DIR/.env — create it from .env.production.example before deploying." >&2
  exit 1
fi
if [[ ! -f apps/web/.env.local ]]; then
  echo "Missing $DEPLOY_DIR/apps/web/.env.local — add Clerk keys before deploying." >&2
  exit 1
fi

docker compose config --quiet
docker compose up -d --build --wait --wait-timeout 300
docker compose ps
echo "Deployed $(date -u +%Y-%m-%dT%H:%M:%SZ) from $(git rev-parse --short HEAD 2>/dev/null || echo 'rsync')"
