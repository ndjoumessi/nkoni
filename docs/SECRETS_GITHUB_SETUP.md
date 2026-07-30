# Configuration des secrets GitHub pour le backup automatisé

Ce document énumère les **GitHub Secrets** à configurer pour que le workflow
`backup-restore-exercise.yml` fonctionne de bout en bout (dump → chiffrement → artefact →
copie hors-site R2 → contrôle de restauration fonctionnelle).

> ⚠️ **Fail-closed.** L'étape de copie hors-site (§2.3) et le job de contrôle de restauration
> font **échouer tout le run** si leurs secrets manquent (c'est délibéré : une sauvegarde
> hors-site qu'on croit en place et qui ne l'est pas est le pire des cas). Poser **tous** les
> secrets ci-dessous AVANT de lancer le workflow — sinon il échoue et ouvre une issue d'alerte.

## Secrets requis (7)

| Secret | Rôle | Utilisé par |
|--------|------|-------------|
| `DATABASE_URL` | Connexion PostgreSQL de prod (dump) | §2.1 dump |
| `GPG_PASSPHRASE_BACKUP` | Passphrase de chiffrement AES256 | §2.2 chiffrement + déchiffrement du contrôle |
| `R2_ACCOUNT_ID` | Account ID Cloudflare (endpoint R2) | §2.3 copie hors-site |
| `R2_ACCESS_KEY_ID` | Access Key du jeton R2 | §2.3 copie hors-site |
| `R2_SECRET_ACCESS_KEY` | Secret Key du jeton R2 | §2.3 copie hors-site |
| `R2_BUCKET` | Nom du bucket R2 (ex. `nkoni-backups`) | §2.3 copie hors-site + miroir Blob |
| `BLOB_READ_WRITE_TOKEN` | Token Vercel Blob (lecture des fichiers privés) | **miroir Blob** (`blob-mirror.yml`, dette GA D2) |

### 1. `DATABASE_URL`

**Description** : URL de connexion PostgreSQL de la prod, lue directement par `pg_dump`/`psql`
(le workflow n'utilise **pas** le CLI Railway).

**⚠️ Prendre l'URL PUBLIQUE, utilisateur `postgres`.** Le `DATABASE_URL` du service *backend*
pointe sur `postgres.railway.internal` — hostname **privé au réseau Railway**, non résolvable
depuis un runner GitHub. Il faut la variable **`DATABASE_PUBLIC_URL` du service _Postgres_**
(proxy TCP public), et l'utilisateur doit être `postgres` (pas `railway`, sinon
`password authentication failed`).

**Où la poser (sans jamais la retaper à la main)** :
```bash
gh secret set DATABASE_URL \
  --body "$(railway variables --service Postgres --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)"
```

**Format** : `postgresql://postgres:<mot-de-passe>@<host-public>:<port>/railway`

### 2. `GPG_PASSPHRASE_BACKUP`

**Description** : phrase de passe GPG utilisée pour chiffrer (et déchiffrer, lors du contrôle de
restauration) les dumps. Doit être **robuste** et **secrète**.

**Comment la générer** :
```bash
openssl rand -base64 32  # ~44 caractères aléatoires
```

**Où la poser** :
```bash
gh secret set GPG_PASSPHRASE_BACKUP --body "<passphrase générée>"
```

**⚠️ Sécurité** :
- La conserver dans un gestionnaire de mots de passe **distinct de GitHub**.
- Sans elle, aucun dump chiffré ne peut être relu : **la perdre = perdre l'accès à toutes les
  sauvegardes**. C'est le secret le plus critique du dispositif.
- En cas de compromission, la rouler (cf. Rotation ci-dessous).

### 3–6. Secrets Cloudflare R2 (copie hors-site, §2.3)

La copie hors-site vise une infra **indépendante** de GitHub/Vercel/Railway (vraie résilience :
un incident sur l'une ne touche pas la sauvegarde). R2 est S3-compatible → le client `aws`
préinstallé sur le runner suffit.

**Provisionnement côté Cloudflare** :
1. **R2** → créer un bucket (ex. `nkoni-backups`).
2. **R2** → **Manage R2 API Tokens** → créer un jeton **« Object Read & Write »** scopé au bucket
   (pas besoin des droits admin). Copier **Access Key ID** et **Secret Access Key** (le secret
   n'est montré **qu'une fois**).
3. Récupérer l'**Account ID** (R2 → Overview, ou dans l'URL du dashboard).
4. **Poser une règle de cycle de vie** sur le bucket (Settings → Object lifecycle rules) pour la
   rétention longue (ex. suppression après 365 j). ⚠️ Cette règle vit **dans le dashboard R2**,
   pas dans le dépôt : elle n'est **ni versionnée ni vérifiée par la CI**. Sans elle, les objets
   s'accumulent indéfiniment ; mal réglée, elle supprimerait des dumps sans que rien ne le signale.

**Poser les 4 secrets** :
```bash
gh secret set R2_ACCOUNT_ID --body "<account-id>"
gh secret set R2_ACCESS_KEY_ID --body "<access-key-id>"
gh secret set R2_SECRET_ACCESS_KEY --body "<secret-access-key>"
gh secret set R2_BUCKET --body "nkoni-backups"
```

## Secret optionnel

### `PROD_DATABASE_URL` (local uniquement)

**Description** : URL de prod utilisée par le **script local** `restore-exercise.sh` pour comparer
les comptes de lignes (§4.2 du RUNBOOK). **Le workflow n'en a pas besoin** — le contrôle de
restauration en CI restaure dans une base éphémère du runner, jamais contre la prod.

**Alternative** : la passer en variable d'env locale au lieu de la poser en secret GitHub.

## Vérification

Une fois les 6 secrets posés :
```bash
gh secret list        # doit lister DATABASE_URL, GPG_PASSPHRASE_BACKUP et les 4 R2_*
gh workflow run backup-restore-exercise.yml
gh run watch $(gh run list --workflow=backup-restore-exercise.yml --limit 1 --json databaseId -q '.[0].databaseId')
```

Attendu, toutes vertes :
- **§2.1 Dump** : pas d'erreur d'authentification (`DATABASE_URL` public + user `postgres`).
- **§2.2 Chiffrement / Vérification** : archive lisible, > 0 entrée.
- **§2.3 Copie R2** : `✅ Copie hors-site : s3://…` (l'objet apparaît dans le bucket).
- **Contrôle de restauration** : `/ready` = 200 et `/tresorerie/reconciliation` = 200 sur la base
  restaurée éphémère.

## Rotation des secrets

### `DATABASE_URL`
Change quand le mot de passe Postgres de prod est réinitialisé. Reposer le secret avec la commande
de la §1.

### `GPG_PASSPHRASE_BACKUP`
1. Générer une nouvelle passphrase (`openssl rand -base64 32`).
2. **Garder l'ancienne** tant que des dumps chiffrés avec elle doivent rester lisibles (les
   anciens artefacts restent chiffrés avec l'ancienne passphrase).
3. `gh secret set GPG_PASSPHRASE_BACKUP --body "<nouvelle>"`.

### Jeton R2
1. Cloudflare R2 → **Manage R2 API Tokens** → révoquer l'ancien, en créer un nouveau.
2. Reposer `R2_ACCESS_KEY_ID` et `R2_SECRET_ACCESS_KEY`.
3. Si le jeton avait une expiration, le renouveler **avant** échéance — sinon la copie hors-site
   s'arrête et le run échoue (fail-closed → issue d'alerte).

## Dépannage

### §2.1 : `could not translate host name "postgres.railway.internal"`
`DATABASE_URL` pointe sur le hostname **privé**. Prendre `DATABASE_PUBLIC_URL` du service Postgres
(cf. §1).

### §2.1 : `password authentication failed for user "railway"`
L'utilisateur dans l'URL est `railway` au lieu de `postgres`. Reposer avec la commande de la §1.

### §2.3 : échec de la copie R2
Vérifier les 4 secrets `R2_*` (l'`R2_ACCOUNT_ID` est le plus souvent oublié → endpoint
`https://.r2.cloudflarestorage.com` invalide). Vérifier que le jeton a bien le droit
**Object Read & Write** sur le bon bucket.

### `bad passphrase` (chiffrement ou contrôle de restauration)
`GPG_PASSPHRASE_BACKUP` absent, vide, ou différent entre chiffrement et déchiffrement.

### Job timed out
Le dump ou la restauration prend trop longtemps — augmenter `timeout-minutes` dans le workflow.

## Liens

- Workflow : [`.github/workflows/backup-restore-exercise.yml`](../.github/workflows/backup-restore-exercise.yml)
- Guide local : [`docs/EXERCICE_RESTAURATION_LOCAL.md`](./EXERCICE_RESTAURATION_LOCAL.md)
- RUNBOOK : [`docs/RUNBOOK_sauvegardes_restauration.md`](./RUNBOOK_sauvegardes_restauration.md)
</content>
</invoke>
