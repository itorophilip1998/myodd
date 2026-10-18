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

COMPOSE_ARGS=()
if grep -qE '^[[:space:]]*DOMAIN=[^[:space:]#]+' .env; then
  COMPOSE_ARGS+=(--profile https)
  echo "DOMAIN set — enabling Caddy HTTPS edge (profile: https)"
else
  echo "DOMAIN unset — serving on :3000 only (set DOMAIN after Spaceship DNS points here)"
fi

# Bake deploy identity into web/api images (shown on create page + /api/health).
export APP_GIT_SHA="${APP_GIT_SHA:-${GITHUB_SHA:-local}}"
APP_GIT_SHA="$(printf '%s' "$APP_GIT_SHA" | cut -c1-7)"
export APP_GIT_SHA
echo "APP_GIT_SHA=$APP_GIT_SHA"

docker compose "${COMPOSE_ARGS[@]}" config --quiet
docker compose "${COMPOSE_ARGS[@]}" up -d --build --wait --wait-timeout 300
docker compose "${COMPOSE_ARGS[@]}" ps
echo "Deployed $(date -u +%Y-%m-%dT%H:%M:%SZ) sha=$APP_GIT_SHA"
