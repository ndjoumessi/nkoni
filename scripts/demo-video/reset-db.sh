#!/bin/bash
# Recrée la base de DÉMONSTRATION locale `nkoni_demo` (jamais une autre) avec le schéma à jour.
set -euo pipefail
PG="${PG_BIN:-/opt/homebrew/opt/postgresql@18/bin}"
DB=nkoni_demo
"$PG/dropdb" --if-exists --force "$DB"
"$PG/createdb" "$DB"
cd "$(dirname "$0")/../../backend"
DATABASE_URL="postgresql://$(id -un)@localhost:5432/${DB}?sslmode=disable" npx prisma migrate deploy >/dev/null
echo "✓ $DB recréée et migrée"
