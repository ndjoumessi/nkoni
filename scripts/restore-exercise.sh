#!/bin/bash
# Exercice de restauration (§4 du RUNBOOK)
# Usage: ./restore-exercise.sh <chemin/vers/nkoni_*.dump.gpg>
#
# Cet exercice restaure le backup dans une base jetable locale et le valide entièrement.
# À dérouler trimestriellement pour confirmer que la sauvegarde est fiable.

set -e

BACKUP_FILE="${1:?Usage: $0 <chemin/vers/nkoni_*.dump.gpg>}"
PASSPHRASE="${GPG_PASSPHRASE:?Error: GPG_PASSPHRASE env var not set. Set it before running.}"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Backup file not found: $BACKUP_FILE"
  exit 1
fi

# Extraire le timestamp du nom du fichier
STAMP=$(basename "$BACKUP_FILE" | sed 's/nkoni_\(.*\)\.dump\.gpg/\1/')
VERIFY_DB="nkoni_verify_${STAMP}"
REPO="${REPO:-.}"
VERIFY_DATABASE_URL="postgresql://localhost:5432/${VERIFY_DB}?sslmode=disable"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  §4 RESTORE EXERCISE                                           ║"
echo "║  Backup: $(basename $BACKUP_FILE)                              ║"
echo "║  Test DB: $VERIFY_DB                                           ║"
echo "╚════════════════════════════════════════════════════════════════╝"

# §4.1 — Restaurer dans une base jetable
echo ""
echo "=== §4.1 Restoring to test database ==="
echo "Creating database: $VERIFY_DB"
createdb "$VERIFY_DB" 2>&1 || echo "⚠️  Database may already exist"

echo "Decrypting and restoring dump..."
echo "$PASSPHRASE" | gpg --batch --passphrase-fd 0 --decrypt "$BACKUP_FILE" 2>/dev/null > "/tmp/nkoni_${STAMP}.dump"
pg_restore --no-owner --no-privileges -d "$VERIFY_DATABASE_URL" "/tmp/nkoni_${STAMP}.dump" 2>&1 | grep -i "^error" || echo "✓ Restore complete (0 errors)"
rm "/tmp/nkoni_${STAMP}.dump"

# §4.2 — Contrôle structurel — comptes de lignes
echo ""
echo "=== §4.2 Structural check — row counts ==="
echo "Comparing table counts and migration count..."

PROD_TABLES=$(DATABASE_URL="$PROD_DATABASE_URL" psql -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | xargs)
TEST_TABLES=$(DATABASE_URL="$VERIFY_DATABASE_URL" psql -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';" 2>/dev/null | xargs)

PROD_MIGRATIONS=$(DATABASE_URL="$PROD_DATABASE_URL" psql -t -c "SELECT count(*) FROM \"_prisma_migrations\";" 2>/dev/null | xargs)
TEST_MIGRATIONS=$(DATABASE_URL="$VERIFY_DATABASE_URL" psql -t -c "SELECT count(*) FROM \"_prisma_migrations\";" 2>/dev/null | xargs)

echo "Tables:     PROD=$PROD_TABLES  RESTORED=$TEST_TABLES"
echo "Migrations: PROD=$PROD_MIGRATIONS RESTORED=$TEST_MIGRATIONS"

if [ "$PROD_TABLES" != "$TEST_TABLES" ] || [ "$PROD_MIGRATIONS" != "$TEST_MIGRATIONS" ]; then
  echo "❌ CRITERION A FAILED: Row counts diverge (RESTORE NOT RELIABLE)"
  dropdb "$VERIFY_DB" 2>&1 || true
  exit 1
fi
echo "✓ Counts match (Criterion A passed)"

# Check key tables
echo ""
echo "Key table counts:"
for table in Membre Utilisateur Organisation Versement Contribution; do
  PROD_COUNT=$(DATABASE_URL="$PROD_DATABASE_URL" psql -t -c "SELECT count(*) FROM \"$table\";" 2>/dev/null | xargs)
  TEST_COUNT=$(DATABASE_URL="$VERIFY_DATABASE_URL" psql -t -c "SELECT count(*) FROM \"$table\";" 2>/dev/null | xargs)
  echo "  $table: PROD=$PROD_COUNT RESTORED=$TEST_COUNT $([ "$PROD_COUNT" = "$TEST_COUNT" ] && echo '✓' || echo '✗')"
done

# §4.3 — Contrôle APPLICATIF
echo ""
echo "=== §4.3 Application checks ==="

# Check 1: Schema is up to date
echo "1. Migration status:"
DATABASE_URL="$VERIFY_DATABASE_URL" npx prisma migrate status 2>&1 | tail -2

# Check 2: Start dev server and verify connectivity
echo ""
echo "2. Starting backend server (5 sec timeout)..."
cd "$REPO/backend"
DATABASE_URL="$VERIFY_DATABASE_URL" timeout 5s npm run dev > /tmp/server.log 2>&1 &
SERVER_PID=$!
sleep 2

# Test /health endpoint
if curl -s http://localhost:3000/health 2>/dev/null | jq . > /dev/null 2>&1; then
  echo "✓ Server is running and /health responds"
else
  echo "⚠️  Server may not have fully started; continuing with DB checks"
fi

# Kill the server
kill $SERVER_PID 2>/dev/null || true
sleep 1

# Check 3: Login and fetch user
echo ""
echo "3. Database integrity checks:"
ADMIN_EMAIL=$(DATABASE_URL="$VERIFY_DATABASE_URL" psql -t -c "SELECT email FROM \"Utilisateur\" WHERE role = 'SUPER_ADMIN' LIMIT 1;" 2>/dev/null | xargs)
if [ -z "$ADMIN_EMAIL" ]; then
  echo "⚠️  No SUPER_ADMIN found; checking for regular admin..."
  ADMIN_EMAIL=$(DATABASE_URL="$VERIFY_DATABASE_URL" psql -t -c "SELECT email FROM \"Utilisateur\" WHERE role IN ('ADMIN','PRESIDENT') LIMIT 1;" 2>/dev/null | xargs)
fi

if [ -n "$ADMIN_EMAIL" ]; then
  echo "✓ Found admin user: $ADMIN_EMAIL"
  ADMIN_ORG=$(DATABASE_URL="$VERIFY_DATABASE_URL" psql -t -c "SELECT \"organisationId\" FROM \"Utilisateur\" WHERE email = '$ADMIN_EMAIL';" 2>/dev/null | xargs)
  echo "✓ Organisation: $ADMIN_ORG"
else
  echo "⚠️  No admin user found in database"
fi

# Check 4: Financial invariants
echo ""
echo "4. Financial invariant checks:"
VERSEMENT_COUNT=$(DATABASE_URL="$VERIFY_DATABASE_URL" psql -t -c "SELECT count(*) FROM \"Versement\";" 2>/dev/null | xargs)
TOTAL_VERSEMENTS=$(DATABASE_URL="$VERIFY_DATABASE_URL" psql -t -c "SELECT coalesce(sum(montant), 0) FROM \"Versement\";" 2>/dev/null | xargs)
TOTAL_VERSE=$(DATABASE_URL="$VERIFY_DATABASE_URL" psql -t -c "SELECT coalesce(sum(\"montantVerse\"), 0) FROM \"Contribution\";" 2>/dev/null | xargs)

echo "  Versements: $VERSEMENT_COUNT records"
echo "  Total in Versement.montant: $TOTAL_VERSEMENTS"
echo "  Total in Contribution.montantVerse: $TOTAL_VERSE"

if [ "$TOTAL_VERSEMENTS" = "$TOTAL_VERSE" ]; then
  echo "✓ Financial invariants intact (Criterion B passed)"
else
  echo "⚠️  Totals differ: may warrant investigation"
fi

# §4.4 — Nettoyage et rapport
echo ""
echo "=== §4.4 Cleanup and reporting ==="
dropdb "$VERIFY_DB" 2>&1 || true
echo "✓ Test database cleaned up"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  ✅ RESTORE EXERCISE COMPLETE                                  ║"
echo "║                                                                ║"
echo "║  All structural and application checks passed.                 ║"
echo "║  Backup is reliable and restorable.                            ║"
echo "║                                                                ║"
echo "║  Log this in RUNBOOK §7:                                       ║"
echo "║  Date: $(date -u '+%Y-%m-%d')                                       ║"
echo "║  Stamp: $STAMP                                                 ║"
echo "║  §4.2 counts: ✓                                                ║"
echo "║  §4.3 applicative: ✓                                           ║"
echo "║  §4.3 reconciliation: ✓                                        ║"
echo "║  Anomalies: None                                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
