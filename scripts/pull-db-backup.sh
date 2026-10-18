#!/usr/bin/env bash
# Compatibility wrapper — prefer ./scripts/backup.sh --pull
exec "$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)/backup.sh" --pull
