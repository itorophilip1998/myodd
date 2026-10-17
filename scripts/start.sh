#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

BUILD_ARGS=(--build)
case "${1:-}" in
  '') ;;
  --no-build) BUILD_ARGS=(--no-build) ;;
  --help|-h)
    echo 'Usage: ./scripts/start.sh [--no-build]'
    echo 'Starts web, API, Python AI, PostgreSQL, Redis, and database migrations.'
    echo 'Default: build images and wait for service health. Existing .env and data volumes are preserved.'
    exit 0
    ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  echo 'Pass at most one option. Use --help for usage.' >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo 'Docker is required. Install Docker Desktop or Docker Engine with Compose.' >&2
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo 'Docker Compose is required.' >&2
  exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo 'Cannot reach Docker. Start Docker Desktop or Docker Engine, then run this script again.' >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  (umask 077; cp .env.example .env)
  echo 'Created .env from .env.example. Add your AI credentials there when using Groq.'
fi

docker compose config --quiet
echo 'Starting myOdd and applying database migrations…'
if ! docker compose up -d "${BUILD_ARGS[@]}" --wait --wait-timeout 180; then
  echo 'Startup failed. Container status:' >&2
  docker compose ps -a
  echo 'Inspect startup errors with: docker compose logs --tail 100 migrate api ai web' >&2
  exit 1
fi

docker compose ps
echo
echo 'myOdd:       http://localhost:3000'
echo 'API health:  http://localhost:3001/api/health'
echo 'AI health:   http://localhost:8000/health'
echo 'Logs:        docker compose logs -f api ai web'
echo 'Stop:        docker compose down (keeps saved data)'
