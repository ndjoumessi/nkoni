# Exercice de restauration — Procédure locale (§4 du RUNBOOK)

Comment récupérer une sauvegarde chiffrée et dérouler l'exercice de restauration **à la main**.

> **Pourquoi cet exercice alors que la CI le fait déjà ?** Le job `restore-verify`
> ([`backup-restore-exercise.yml`](../.github/workflows/backup-restore-exercise.yml)) prouve que la
> **base** est restaurable. Cet exercice-ci prouve autre chose : que **la procédure écrite est
> exécutable par un humain** sous incident, à 3 h du matin, sur sa propre machine. Un runbook jamais
> déroulé ne vaut pas mieux qu'un workflow jamais lancé. Les deux sont nécessaires.

## Pré-requis

| Élément | Contrôle | Remède |
|---|---|---|
| Client PostgreSQL **≥ majeure du serveur prod** (18) | `pg_restore --version` | `brew install postgresql@18`. ⚠️ Le PATH Homebrew peut pointer vers une majeure ANCIENNE même si la 18 est installée — le script sélectionne désormais la plus récente automatiquement. |
| `gpg`, `psql`, `createdb`, `dropdb`, `curl` | `command -v …` | Fournis par Homebrew / macOS |
| Serveur Postgres local démarré | `pg_isready` | `brew services start postgresql@18` |
| Accès au dépôt `ndjoumessi/nkoni` | `gh auth status` | `gh auth login` |
| `GPG_PASSPHRASE` | phrase de passe du secret GitHub `GPG_PASSPHRASE_BACKUP` | — |
| `PROD_DATABASE_URL` | URL publique Postgres Railway (`DATABASE_PUBLIC_URL`) | `railway variables` |

> **`timeout` n'existe pas sur macOS.** Le script ne s'en sert plus (sondage en boucle).

## Étape 1 : obtenir une sauvegarde

Le workflow tourne **chaque dimanche 03:00 UTC** et les artefacts sont conservés **30 jours** — il y
a donc presque toujours une sauvegarde récente à récupérer, inutile d'en déclencher une.

```bash
gh run list --workflow=backup-restore-exercise.yml --limit 5
```

Pour en déclencher une à la demande (⚠️ produit un dump de la base de **production**) :

```bash
gh workflow run backup-restore-exercise.yml --ref main
```

## Étape 2 : télécharger l'artefact

**Par le CLI** (le plus rapide — l'artefact arrive déjà décompressé) :

```bash
gh run download <RUN_ID> -n nkoni-backup-<TIMESTAMP> -D ~/Downloads
```

**Par le navigateur** : ouvrir le résumé du run → section **Artifacts** → télécharger le `.zip` →
`unzip`.

**Résultat** : un fichier `nkoni_<TIMESTAMP>.dump.gpg`. Sa taille suit celle de la base — de l'ordre
de **150 Ko** aujourd'hui, pas des dizaines de mégaoctets. Un fichier « trop petit » n'est donc pas
un signe d'échec ; le contrôle de validité est `file` :

```bash
file nkoni_*.dump.gpg   # attendu : PGP symmetric key encrypted data - AES with 256-bit key
```

## Étape 3 : dérouler l'exercice

Une seule commande. Les deux secrets sont saisis **sans écho** et ne sont pas écrits dans
l'historique du shell :

```bash
cd ~/Documents/Projets/nkoni
read -rsp "Phrase de passe GPG : " GPG_PASSPHRASE; echo
read -rsp "URL Postgres prod   : " PROD_DATABASE_URL; echo
export GPG_PASSPHRASE PROD_DATABASE_URL
./scripts/restore-exercise.sh ~/Downloads/nkoni_<TIMESTAMP>.dump.gpg
unset GPG_PASSPHRASE PROD_DATABASE_URL
```

Le script exécute :

- **§4.1** — déchiffrement GPG + `pg_restore` dans une base jetable `nkoni_verify_<TIMESTAMP>`
- **§4.2** — comparaison des comptes **prod ↔ restaurée** (tables, migrations, 7 tables métier)
- **§4.3** — contrôle **applicatif** : `prisma migrate status`, génération du client Prisma, puis
  **démarrage réel du backend** sur la base restaurée et sonde de `/ready`
- **§4.4** — **réconciliation financière** contribution par contribution (`montantVerse` vs Σ des
  versements), reproduction SQL de `reconcilierVersements`
- nettoyage automatique (la base de test est supprimée même en cas d'interruption)

### Lire le résultat

Le rapport final est **dérivé** des contrôles réellement exécutés. Trois issues, distinguées par le
code de sortie :

| Sortie | Code | Sens |
|---|---|---|
| ✅ EXERCICE COMPLET | 0 | Les 5 contrôles sont passés |
| ⚠️ EXERCICE PARTIEL | 2 | Un contrôle n'a **pas été exécuté** (ex. `PROD_DATABASE_URL` absente) — ce n'est **pas** un succès |
| ❌ EXERCICE EN ÉCHEC | 1 | Un contrôle a échoué |

> Un écart de comptes prod ↔ restaurée sur les tables métier est **normal** si la production a vécu
> depuis le dump : il est signalé en anomalie sans faire échouer le critère structurel.

## Étape 4 : consigner le résultat

Mettre à jour le tableau **§7** du [RUNBOOK](RUNBOOK_sauvegardes_restauration.md) — **même en cas
d'échec**, c'est l'information la plus précieuse que cet exercice puisse produire.

## Dépannage

**`pg_restore: unsupported version … in file header`** — client Postgres plus ancien que le serveur
de prod. Le script sélectionne la majeure la plus récente disponible sous
`/opt/homebrew/opt/postgresql@*`; si aucune n'est ≥ 18, `brew install postgresql@18`.

**`gpg: decryption failed: Bad session key`** — phrase de passe incorrecte. Elle doit être identique
au secret GitHub `GPG_PASSPHRASE_BACKUP`.

**Le backend ne répond pas sur `/ready`** — lire `/tmp/restore-server.log`. Cause la plus fréquente :
client Prisma absent (`backend/src/generated/` est gitignoré) — le script le génère désormais, mais
la génération elle-même peut échouer.

**§4.2 annoncé « NON EXÉCUTÉ »** — `PROD_DATABASE_URL` n'était pas définie. Utiliser
`DATABASE_PUBLIC_URL` (le proxy public), pas l'URL interne Railway qui n'est joignable que depuis
leur réseau.

## Fréquence

- Après toute **migration structurante**
- Au moins **une fois par trimestre**, même sans changement
- La couverture automatique (CI) reste hebdomadaire et ne remplace pas cet exercice

## Voir aussi

- [RUNBOOK sauvegardes & restauration](RUNBOOK_sauvegardes_restauration.md) (§4 complet, §9 pièges de production)
- Workflow : [`.github/workflows/backup-restore-exercise.yml`](../.github/workflows/backup-restore-exercise.yml)
