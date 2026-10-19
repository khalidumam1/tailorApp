#!/bin/sh
# Runtime container entrypoint: bring the database schema up to date, then
# start the API.
#
# The default behaviour runs `prisma migrate deploy` before the server starts,
# so application code never runs against an out-of-date schema (which surfaces
# as P2022 errors such as "The column User.mustChangePassword does not exist in
# the current database"). The Prisma CLI and migration files are bundled in the
# image for this purpose (see the Dockerfile).
#
# Set SKIP_DB_MIGRATE=1 when migrations are applied by a separate release step
# (the `migrate` image target / `npm run db:migrate`). The entrypoint then only
# verifies that no migrations are pending and refuses to start otherwise.
set -e

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PRISMA_CLI="${SCRIPT_DIR}/migrate-cli/node_modules/prisma/build/index.js"

if [ "${SKIP_DB_MIGRATE}" = "1" ]; then
  echo "SKIP_DB_MIGRATE=1: not applying migrations; verifying the schema is up to date..."
  if ! node "${PRISMA_CLI}" migrate status; then
    echo "ERROR: the database schema has unapplied migrations and SKIP_DB_MIGRATE=1 prevents applying them." >&2
    echo "Run the migrate image target (prisma migrate deploy) against this DATABASE_URL, or unset SKIP_DB_MIGRATE." >&2
    exit 1
  fi
else
  echo "Applying database migrations (prisma migrate deploy)..."
  if ! node "${PRISMA_CLI}" migrate deploy; then
    echo "ERROR: database migrations failed; refusing to start the API with an out-of-date schema." >&2
    echo "Check DATABASE_URL and the output above ('prisma migrate status' shows the details)." >&2
    echo "If this service should only verify migrations, set SKIP_DB_MIGRATE=1 and apply them in a release step." >&2
    exit 1
  fi
fi

exec "$@"
