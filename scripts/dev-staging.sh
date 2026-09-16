#!/bin/sh
# Run a command with the Railway staging environment injected (no .env files needed).
# DATABASE_URL is swapped for DATABASE_PUBLIC_URL so a local process can reach the staging database.
#
# Usage: scripts/dev-staging.sh <command> [args...]
#        RAILWAY_SERVICE=worker scripts/dev-staging.sh pnpm --filter @pemby/worker dev
set -eu

if [ "$#" -eq 0 ]; then
  echo "usage: $0 <command> [args...]" >&2
  exit 64
fi

exec railway run --environment staging --service "${RAILWAY_SERVICE:-web}" -- \
  sh -c 'export DATABASE_URL="${DATABASE_PUBLIC_URL:-$DATABASE_URL}"; exec "$@"' sh "$@"
