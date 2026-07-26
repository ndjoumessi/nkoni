# Exercice de restauration — Procédure locale (§4 du RUNBOOK)

Ce document explique comment télécharger un backup depuis GitHub Actions et dérouler l'exercice de restauration localement.

## Pré-requis

- PostgreSQL client ≥ 18 : `pg_dump`, `pg_restore`, `psql` (cf. RUNBOOK §0)
- `gpg` : chiffrement GPG (présent par défaut sur macOS/Linux)
- Accès au dépôt GitHub `ndjoumessi/nkoni` (pour télécharger les artifacts)
- Variable d'env `GPG_PASSPHRASE` : phrase de passe GPG du backup

## Étape 1 : Déclencher le backup depuis GitHub Actions

1. Ouvre [Actions → Backup & Restore Exercise](https://github.com/ndjoumessi/nkoni/actions/workflows/backup-restore-exercise.yml)
2. Clique sur **Run workflow**
3. Confirme (branche `main`, aucun paramètre requis)
4. Attends ~15 min que le job `backup-and-verify` complète

**Alternativement**, le backup se déclenche automatiquement chaque **dimanche 03:00 UTC** (calendrier, cf. workflow).

## Étape 2 : Télécharger l'artifact

Une fois le job complété (status ✅) :

1. Ouvre le résumé du job
2. Scroll vers le bas → section **Artifacts**
3. Télécharge `nkoni-backup-<TIMESTAMP>.zip` (~50 MB compressé)
4. Dézippe : `unzip nkoni-backup-*.zip`

**Résultat** : un fichier `nkoni_<TIMESTAMP>.dump.gpg` de ~50 MB.

## Étape 3 : Dérouler l'exercice de restauration

### Préparation

```bash
# Navigue à la racine du dépôt
cd ~/Documents/Projets/nkoni.worktrees/points-ouvert-questions

# Définis la phrase de passe GPG (identique à celle de GitHub Secrets)
export GPG_PASSPHRASE="<ta-phrase-de-passe>"

# Définis l'URL de production (pour §4.2 comparaison comptes)
export PROD_DATABASE_URL="postgresql://postgres:PASSWORD@shortline.proxy.rlwy.net:13085/railway?sslmode=require"
```

### Lancer le script

```bash
./scripts/restore-exercise.sh ~/path/to/nkoni_<TIMESTAMP>.dump.gpg
```

Le script exécute :
- **§4.1** : restauration du dump dans une base de test locale `nkoni_verify_<TIMESTAMP>`
- **§4.2** : comparaison des comptes de lignes prod ↔ restaurée (Criterion A)
- **§4.3** : vérification applicative (migrations, démarrage serveur, intégrité financière)
- **§4.4** : nettoyage et rapport

### Résultats attendus

```
╔════════════════════════════════════════════════════════════════╗
║  ✅ RESTORE EXERCISE COMPLETE                                  ║
║                                                                ║
║  All structural and application checks passed.                 ║"
║  Backup is reliable and restorable.                            ║
╚════════════════════════════════════════════════════════════════╝
```

## Étape 4 : Consigner le résultat dans le RUNBOOK

Mets à jour le tableau §7 du [RUNBOOK](../docs/RUNBOOK_sauvegardes_restauration.md) :

| Date | Sauvegarde testée | §4.2 comptes | §4.3 applicatif | §4.4 réconciliation | Anomalies / suites |
|---|---|---|---|---|---|
| 2026-07-27 | nkoni_20260727_010000.dump.gpg | ✓ | ✓ | ✓ | Aucune |

**Important** : consigner **même un échec** — c'est l'information la plus précieuse que cet exercice puisse donner.

## Dépannage

### Erreur : « pg_restore: server version mismatch »

Ton client PostgreSQL est plus ancien que le serveur de prod (18.4).  
**Solution** : installer PostgreSQL 18 via Homebrew ou télécharger depuis postgresql.org.

```bash
brew install postgresql@18
/opt/homebrew/opt/postgresql@18/bin/pg_dump --version  # Vérifier
```

### Erreur : « GPG : Bad passphrase »

La phrase de passe est incorrecte ou mal définie.  
**Solution** : vérifier que `$GPG_PASSPHRASE` match exactement celle de GitHub Secrets.

```bash
echo $GPG_PASSPHRASE  # Affiche la valeur (attention : en clair)
```

### Erreur : « No such table: Utilisateur »

La restauration a échoué silencieusement.  
**Solution** : vérifier que le dump n'est pas corrompu :

```bash
echo "$GPG_PASSPHRASE" | gpg --batch --passphrase-fd 0 --decrypt nkoni_*.dump.gpg 2>/dev/null | file -
```

**Attendu** : `gzip compressed data` ou similaire (format custom Postgres).

### Erreur : « Connection refused » sur `/health`

Le serveur n'a pas démarré.  
**Solution** : vérifier les logs :

```bash
tail -20 /tmp/server.log
```

## Fréquence

- **Manuelle** : chaque fois qu'un changement structurant touche le schéma (nouvelle migration majeure)
- **Automatique** : chaque dimanche 03:00 UTC (calendrier Actions)
- **Idéal** : au moins une fois par trimestre, même sans changement

## Voir aussi

- [RUNBOOK sauvegardes & restauration](../docs/RUNBOOK_sauvegardes_restauration.md) (§4 complet)
- Workflow GitHub Actions : [`.github/workflows/backup-restore-exercise.yml`](../.github/workflows/backup-restore-exercise.yml)
