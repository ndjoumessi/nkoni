#!/bin/bash
# Exercice de restauration (§4 du RUNBOOK sauvegardes & restauration)
# Usage: GPG_PASSPHRASE=... PROD_DATABASE_URL=... ./scripts/restore-exercise.sh <chemin/nkoni_*.dump.gpg>
#
# Restaure le backup chiffré dans une base jetable locale et le valide.
# À dérouler trimestriellement, et après toute migration structurante.
#
# ⚠️ Ce script doit pouvoir RAPPORTER UN ÉCHEC. Le rapport final est DÉRIVÉ des contrôles
# réellement exécutés — un contrôle non exécuté est signalé « NON EXÉCUTÉ », jamais vert.
# Version 2026-09-12 : voir §7 du RUNBOOK (exercice manuel) pour les défauts corrigés ici.

set -euo pipefail

BACKUP_FILE="${1:?Usage: $0 <chemin/vers/nkoni_*.dump.gpg>}"
PASSPHRASE="${GPG_PASSPHRASE:?Erreur : variable GPG_PASSPHRASE non définie.}"
PROD_URL="${PROD_DATABASE_URL:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Résultats des contrôles : OK / ECHEC / NON_EXECUTE. Le rapport final en dérive.
R_RESTORE=NON_EXECUTE; R_COUNTS=NON_EXECUTE; R_MIGRATIONS=NON_EXECUTE
R_BOOT=NON_EXECUTE;    R_RECONCIL=NON_EXECUTE
ANOMALIES=()

note_anomalie() { ANOMALIES+=("$1"); echo "   ⚠️  $1"; }

if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ Fichier de sauvegarde introuvable : $BACKUP_FILE"; exit 1
fi

# --- §0 Pré-requis : le client Postgres doit être >= au serveur qui a produit le dump -----------
# pg_restore refuse un dump produit par un serveur plus récent que lui. Sur macOS/Homebrew le
# PATH pointe souvent vers une majeure ancienne alors qu'une plus récente est installée.
for V in 18 17 16; do
  CAND="/opt/homebrew/opt/postgresql@${V}/bin"
  if [ -x "$CAND/pg_restore" ]; then PATH="$CAND:$PATH"; break; fi
done
export PATH
PG_CLIENT_MAJ="$(pg_restore --version | sed -E 's/.* ([0-9]+)\..*/\1/')"
echo "Client PostgreSQL utilisé : $(command -v pg_restore) (majeure $PG_CLIENT_MAJ)"

STAMP="$(basename "$BACKUP_FILE" | sed 's/nkoni_\(.*\)\.dump\.gpg/\1/')"
VERIFY_DB="nkoni_verify_${STAMP}"
# ⚠️ L'UTILISATEUR doit être EXPLICITE dans l'URL. psql/createdb/pg_restore (libpq) et le backend
# (@prisma/adapter-pg) retombent sur l'utilisateur système, mais le moteur Rust de `prisma migrate`
# NON : sans utilisateur il échoue en « P1010: User was denied access ». Défaut trouvé en répétition.
VERIFY_USER="${VERIFY_DB_USER:-$(id -un)}"
VERIFY_URL="postgresql://${VERIFY_USER}@localhost:5432/${VERIFY_DB}?sslmode=disable"
PLAIN_DUMP="$(mktemp -t nkoni_restore).dump"

nettoyer() {
  rm -f "$PLAIN_DUMP"
  dropdb --if-exists "$VERIFY_DB" >/dev/null 2>&1 || true
}
trap nettoyer EXIT

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  §4 EXERCICE DE RESTAURATION                                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo "Sauvegarde : $(basename "$BACKUP_FILE")"
echo "Base test  : $VERIFY_DB"

# --- §4.1 Restaurer dans une base jetable -------------------------------------------------------
echo ""
echo "=== §4.1 Restauration dans une base de test ==="
dropdb --if-exists "$VERIFY_DB" >/dev/null 2>&1 || true
createdb "$VERIFY_DB"
echo "✓ Base créée : $VERIFY_DB"

echo "Déchiffrement du dump…"
if ! printf '%s' "$PASSPHRASE" | gpg --batch --quiet --passphrase-fd 0 --decrypt "$BACKUP_FILE" > "$PLAIN_DUMP"; then
  echo "❌ §4.1 ÉCHEC : déchiffrement GPG impossible (phrase de passe ? fichier corrompu ?)"
  R_RESTORE=ECHEC; ANOMALIES+=("Déchiffrement GPG en échec"); exit 1
fi
echo "✓ Déchiffré : $(du -h "$PLAIN_DUMP" | cut -f1) — $(file -b "$PLAIN_DUMP")"

# L'ancienne version passait pg_restore dans un `| grep` : le code de sortie était celui de grep,
# donc une restauration en échec passait pour un succès. On capte le code réel.
RESTORE_LOG="$(mktemp)"
if pg_restore --no-owner --no-privileges --exit-on-error -d "$VERIFY_URL" "$PLAIN_DUMP" > "$RESTORE_LOG" 2>&1; then
  R_RESTORE=OK; echo "✓ Restauration terminée sans erreur"
else
  R_RESTORE=ECHEC
  echo "❌ §4.1 ÉCHEC : pg_restore a retourné une erreur"
  tail -20 "$RESTORE_LOG"; note_anomalie "pg_restore en échec (voir $RESTORE_LOG)"
  exit 1
fi
rm -f "$RESTORE_LOG"

# --- §4.2 Contrôle structurel : comparaison prod ↔ restaurée -------------------------------------
# ⚠️ psql N'UTILISE PAS $DATABASE_URL (ce n'est pas une variable libpq). L'URL doit être passée en
# ARGUMENT POSITIONNEL, sinon psql se connecte silencieusement à la base par défaut de l'utilisateur
# et la comparaison prod ↔ restaurée devient vacante (deux fois la même base locale = toujours vert).
q() { psql "$1" -tAc "$2" 2>/dev/null | xargs; }

echo ""
echo "=== §4.2 Contrôle structurel — comptes ==="
if [ -z "$PROD_URL" ]; then
  echo "⚠️  PROD_DATABASE_URL non définie → comparaison prod ↔ restaurée NON EXÉCUTÉE."
  note_anomalie "§4.2 non exécuté (PROD_DATABASE_URL absente)"
else
  PROD_TABLES="$(q "$PROD_URL" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
  TEST_TABLES="$(q "$VERIFY_URL" "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
  PROD_MIG="$(q "$PROD_URL" "SELECT count(*) FROM \"_prisma_migrations\";")"
  TEST_MIG="$(q "$VERIFY_URL" "SELECT count(*) FROM \"_prisma_migrations\";")"

  if [ -z "$PROD_TABLES" ] || [ -z "$TEST_TABLES" ]; then
    echo "❌ Interrogation impossible (prod='$PROD_TABLES' restaurée='$TEST_TABLES')"
    R_COUNTS=ECHEC; note_anomalie "§4.2 : une des deux bases n'a pas répondu"
  else
    echo "Tables      : PROD=$PROD_TABLES  RESTAURÉE=$TEST_TABLES"
    echo "Migrations  : PROD=$PROD_MIG  RESTAURÉE=$TEST_MIG"
    if [ "$PROD_TABLES" = "$TEST_TABLES" ] && [ "$PROD_MIG" = "$TEST_MIG" ]; then
      R_COUNTS=OK; echo "✓ Critère A : structure identique"
    else
      R_COUNTS=ECHEC; note_anomalie "§4.2 Critère A : structure divergente"
    fi

    echo ""
    echo "Tables métier :"
    for T in Organisation Utilisateur Membre Contribution Versement Recu Document; do
      P="$(q "$PROD_URL" "SELECT count(*) FROM \"$T\";")"
      R="$(q "$VERIFY_URL" "SELECT count(*) FROM \"$T\";")"
      if [ "$P" = "$R" ]; then
        printf "  %-14s PROD=%-6s RESTAURÉE=%-6s ✓\n" "$T" "$P" "$R"
      else
        printf "  %-14s PROD=%-6s RESTAURÉE=%-6s ✗\n" "$T" "$P" "$R"
        # Un écart est ATTENDU si la prod a vécu depuis le dump : on le signale sans le compter
        # en échec structurel (le dump est un instantané, pas un miroir temps réel).
        note_anomalie "$T : écart prod/restaurée ($P vs $R) — attendu si la prod a vécu depuis le dump"
      fi
    done
  fi
fi

# --- §4.3 Contrôle APPLICATIF : la base restaurée est-elle UTILISABLE par le produit ? -----------
echo ""
echo "=== §4.3 Contrôle applicatif ==="
cd "$REPO_ROOT/backend"   # le schéma Prisma vit dans backend/, pas à la racine du dépôt

echo "1. État des migrations :"
if DATABASE_URL="$VERIFY_URL" npx prisma migrate status > /tmp/migrate-status.log 2>&1; then
  R_MIGRATIONS=OK; echo "   ✓ Schéma à jour"
else
  R_MIGRATIONS=ECHEC; echo "   ❌ Migrations non à jour :"; tail -5 /tmp/migrate-status.log
  note_anomalie "§4.3 : prisma migrate status en échec"
fi

echo ""
echo "2. Client Prisma :"
# `backend/src/generated/` est GITIGNORÉ (régénéré au déploiement via postinstall). Sur une machine
# fraîche il est absent → le backend ne peut pas démarrer. On le génère avant de sonder le boot.
if [ -d src/generated/prisma ]; then
  echo "   ✓ Client déjà généré"
else
  echo "   Client absent → génération…"
  if npx prisma generate > /tmp/prisma-generate.log 2>&1; then
    echo "   ✓ Client généré"
  else
    echo "   ❌ prisma generate en échec :"; tail -5 /tmp/prisma-generate.log
    note_anomalie "§4.3 : prisma generate en échec"
  fi
fi

echo ""
echo "3. Démarrage du backend sur la base restaurée :"
# `timeout` n'existe pas sur macOS : on démarre en arrière-plan et on sonde.
JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-exercice-restauration-access}" \
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-exercice-restauration-refresh}" \
DATABASE_URL="$VERIFY_URL" PORT=3999 \
  npx tsx src/app.ts > /tmp/restore-server.log 2>&1 &
SERVER_PID=$!

BOOT_OK=0
for _ in $(seq 1 30); do
  if curl -sf http://localhost:3999/ready > /tmp/ready.json 2>/dev/null; then BOOT_OK=1; break; fi
  sleep 1
done

if [ "$BOOT_OK" = "1" ]; then
  R_BOOT=OK
  echo "   ✓ Serveur démarré — /ready → $(cat /tmp/ready.json)"
else
  R_BOOT=ECHEC
  echo "   ❌ Le serveur n'a pas répondu sur /ready en 30 s :"; tail -15 /tmp/restore-server.log
  note_anomalie "§4.3 : boot du backend en échec sur la base restaurée"
fi

pkill -P "$SERVER_PID" 2>/dev/null || true
kill "$SERVER_PID" 2>/dev/null || true
wait "$SERVER_PID" 2>/dev/null || true

# --- §4.4 Réconciliation financière -------------------------------------------------------------
# Reproduit `reconcilierVersements` : la comparaison est CONTRIBUTION PAR CONTRIBUTION.
# Une somme globale masquerait deux écarts qui se compensent.
echo ""
echo "=== §4.4 Réconciliation financière ==="
ECARTS="$(q "$VERIFY_URL" "
  SELECT count(*) FROM \"Contribution\" c
  LEFT JOIN (SELECT \"contributionId\", sum(montant) s FROM \"Versement\" GROUP BY 1) v
    ON v.\"contributionId\" = c.id
  WHERE c.\"montantVerse\" <> coalesce(v.s, 0);")"
NB_CONTRIB="$(q "$VERIFY_URL" "SELECT count(*) FROM \"Contribution\";")"
NB_VERS="$(q "$VERIFY_URL" "SELECT count(*) FROM \"Versement\";")"
echo "   Contributions : $NB_CONTRIB — Versements : $NB_VERS"

if [ "$ECARTS" = "0" ]; then
  R_RECONCIL=OK; echo "   ✓ Aucun écart (Σ versements = montantVerse, contribution par contribution)"
else
  R_RECONCIL=ECHEC; echo "   ❌ $ECARTS contribution(s) en écart"
  note_anomalie "§4.4 : $ECARTS contribution(s) dont montantVerse ≠ Σ versements"
fi

# --- Rapport final — DÉRIVÉ des contrôles, jamais codé en dur -----------------------------------
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  RAPPORT — à consigner dans le RUNBOOK §7                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
printf "  Date            : %s\n" "$(date -u '+%Y-%m-%d')"
printf "  Sauvegarde      : nkoni_%s.dump.gpg\n" "$STAMP"
printf "  §4.1 restauration : %s\n" "$R_RESTORE"
printf "  §4.2 comptes      : %s\n" "$R_COUNTS"
printf "  §4.3 migrations   : %s\n" "$R_MIGRATIONS"
printf "  §4.3 boot serveur : %s\n" "$R_BOOT"
printf "  §4.4 réconciliation : %s\n" "$R_RECONCIL"
if [ "${#ANOMALIES[@]}" -eq 0 ]; then
  echo "  Anomalies       : aucune"
else
  echo "  Anomalies :"
  for A in "${ANOMALIES[@]}"; do echo "    - $A"; done
fi

echo ""
case "$R_RESTORE$R_COUNTS$R_MIGRATIONS$R_BOOT$R_RECONCIL" in
  OKOKOKOKOK) echo "✅ EXERCICE COMPLET — la sauvegarde est restaurable et exploitable."; exit 0 ;;
  *ECHEC*)    echo "❌ EXERCICE EN ÉCHEC — consigner l'anomalie dans le RUNBOOK §7."; exit 1 ;;
  *)          echo "⚠️  EXERCICE PARTIEL — un ou plusieurs contrôles NON EXÉCUTÉS (voir ci-dessus)."; exit 2 ;;
esac
