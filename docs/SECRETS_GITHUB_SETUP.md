# Configuration des secrets GitHub pour le backup automatisé

Ce document énumère les **GitHub Secrets** à configurer pour que le workflow `backup-restore-exercise.yml` fonctionne.

## Secrets requis

### 1. `RAILWAY_TOKEN`

**Description** : Token d'authentification Railway, requis pour accéder à l'API Railway via le CLI.

**Où le trouver** :
1. Ouvre [Railway Dashboard](https://railway.app/dashboard)
2. Accès → **Tokens** (en bas à gauche)
3. Crée un nouveau token : clic **Create** → copie la valeur complète

**Où le poser** :
1. Ouvre le dépôt GitHub `ndjoumessi/nkoni`
2. **Settings** → **Secrets and variables** → **Actions**
3. **New repository secret**
   - Name: `RAILWAY_TOKEN`
   - Value: `<token copié>`
4. Sauvegarde

**Rotation** : aucune fréquence définie, c'est un token permanent. À rouler si une clé est compromise ou si le token sort du dépôt.

### 2. `GPG_PASSPHRASE_BACKUP`

**Description** : Phrase de passe GPG utilisée pour chiffrer les dumps. Doit être **robuste** et **secrète**.

**Comment la générer** :
```bash
openssl rand -base64 32  # Génère une passphrase aléatoire de ~44 caractères
```

Exemple : `eJ8rXq2pKvM9nLq4sRw7tYz0aB3cDeFgHiJkLmNoPqRst==`

**Où la poser** :
1. Dépôt GitHub → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
   - Name: `GPG_PASSPHRASE_BACKUP`
   - Value: `<passphrase générée>`
3. Sauvegarde

**⚠️ Sécurité** :
- Cette passphrase est **stockée chez GitHub** — elle s'affiche EN CLAIR dans les logs Actions (elle n'est pas masquée automatiquement)
- La garder **secrète et longue** (32+ caractères)
- La conserver dans un gestionnaire de mots de passe **distinct de GitHub**
- En cas de compromission, la rouler immédiatement (cf. ci-dessous)
- **Ne jamais la commiter** dans le dépôt

### 3. `PROD_DATABASE_URL` (optionnel)

**Description** : URL de connexion PostgreSQL de prod, utilisée par le script de restauration local pour comparer les comptes (§4.2).

**Format** : `postgresql://user:password@host:port/database?sslmode=require`

**Où le poser** :
- **Optionnel** : le workflow n'en a pas besoin ; c'est pour le script local `restore-exercise.sh`
- Si tu veux le stocker : Settings → Secrets → `PROD_DATABASE_URL`

**Alternative** : la passer en variable d'env locale au lieu de la poser en secret GitHub.

## Vérification

Une fois les secrets posés :

1. Ouvre [Actions → Backup & Restore Exercise](https://github.com/ndjoumessi/nkoni/actions/workflows/backup-restore-exercise.yml)
2. **Run workflow** → **Run** (déclenche manuellement)
3. Attends la fin du job
4. Consulte les logs :
   - ✓ **Dump de production** : pas d'erreur d'authentification Railway
   - ✓ **Chiffrement GPG** : pas de "bad passphrase"
   - ✓ **Upload artifact** : taille > 0

## Rotation des secrets

### Rotation du `RAILWAY_TOKEN`

1. Railway Dashboard → **Tokens** → révoque l'ancien token
2. Génère un nouveau token
3. GitHub → Settings → Secrets → mets à jour `RAILWAY_TOKEN`
4. Teste : **Run workflow** une fois

### Rotation du `GPG_PASSPHRASE_BACKUP`

1. Génère une nouvelle passphrase :
   ```bash
   openssl rand -base64 32
   ```
2. Garde l'**ancienne** et la **nouvelle** temporairement (les dumps anciens restent chiffrés avec l'ancienne)
3. GitHub → Settings → Secrets → mets à jour `GPG_PASSPHRASE_BACKUP`
4. Optionnel : re-chiffre les anciens dumps avec la nouvelle passphrase

## Dépannage

### Erreur : « Unexpected argument '--project' »

Ton `RAILWAY_TOKEN` est peut-être invalide ou expiré.  
**Solution** :
1. Regenerates un nouveau token sur Railway
2. Mets à jour le secret GitHub

### Erreur : « Unexpected GPG error »

La passphrase est incorrecte ou vide.  
**Solution** : vérifier que `GPG_PASSPHRASE_BACKUP` est défini dans GitHub Secrets et non vide.

### Job timed out (30 min)

Le dump prend trop longtemps.  
**Solution** : considérer une augmentation de la limite `timeout-minutes` dans le workflow (cf. `.github/workflows/backup-restore-exercise.yml`, actuellement 30 min).

## Liens

- Workflow : [`.github/workflows/backup-restore-exercise.yml`](../.github/workflows/backup-restore-exercise.yml)
- Guide local : [`docs/EXERCICE_RESTAURATION_LOCAL.md`](./EXERCICE_RESTAURATION_LOCAL.md)
- RUNBOOK : [`docs/RUNBOOK_sauvegardes_restauration.md`](./RUNBOOK_sauvegardes_restauration.md)
