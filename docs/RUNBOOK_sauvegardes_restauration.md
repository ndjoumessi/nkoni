# Runbook — Sauvegardes & restauration (bloquant GA 0.2)

Procédure d'exploitation pour le PO. Couvre la **sauvegarde** de la base de production, l'**exercice
de restauration** qui seule la rend crédible, et la **durabilité du stockage Blob**.

> **Un backup non testé n'est pas un backup.** Ce runbook existe pour que la restauration soit un
> geste déjà répété, pas une improvisation le jour d'un sinistre. Le cœur du document n'est donc pas
> §2 (sauvegarder) mais **§4 (restaurer et vérifier)**.

**Ce que ce runbook ne fait pas** : il ne met en place aucune automatisation côté application (aucun
code). La sauvegarde décrite est un geste **manuel planifié**, exécuté par le PO. Son automatisation
et le miroir du stockage Blob sont inscrits en §5 et §6 comme chantiers suivants.

---

## Objectifs de service

| Objectif | Cible | Ce que ça veut dire concrètement |
|---|---|---|
| **RPO** (perte maximale acceptable) | **24 h** | Au pire, une journée de saisies perdue : versements, reçus, membres ajoutés depuis la dernière sauvegarde. Cohérent avec l'usage réel (saisies groupées, pas de flux continu). |
| **RTO** (délai de remise en service) | **4 h** | Depuis la décision de restaurer jusqu'à une application de nouveau utilisable. Dominé par le temps humain (diagnostic, décision), pas par la technique : à 208 Mo, le `pg_restore` prend quelques minutes. |
| **Fréquence de l'exercice** | **Trimestrielle**, et après toute migration structurante | Un exercice réussi il y a un an ne prouve rien sur le schéma d'aujourd'hui. |

> Ces cibles sont un **engagement interne**, pas une promesse commerciale. Ne pas les publier dans
> des CGU sans les avoir tenues sur plusieurs trimestres.

---

## 0. Pré-requis outillage (à vérifier une fois)

```bash
psql --version          # client postgres présent
pg_dump --version       # DOIT être >= version majeure du serveur prod (Railway = PG 16)
pg_restore --version
gpg --version           # chiffrement des dumps (présent sur le poste du PO)
railway whoami          # CLI Railway authentifié
```

Si `pg_dump` est plus ancien que le serveur : `brew install postgresql@16` et utiliser son binaire.
Un dump produit par un client plus ancien que le serveur est **refusé à la restauration** — panne
découverte au pire moment.

**Variables de session :**
```bash
# URL PUBLIQUE de la base prod (Railway → service Postgres → Connect → Public Network).
# PAS l'URL *.railway.internal (injoignable depuis le poste).
export PROD_DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"

export STAMP="$(date +%Y%m%d_%H%M%S)"
export REPO="$HOME/Documents/Projets/nkoni"
export BACKUP_DIR="$HOME/Sauvegardes/nkoni"        # hors du dépôt git (voir ⚠️ ci-dessous)
mkdir -p "$BACKUP_DIR"
```

> ⚠️ **Le répertoire de sauvegarde ne doit JAMAIS être dans le dépôt git.** Un dump contient les
> `passwordHash`, les téléphones et les données financières de tous les tenants. `$HOME/Sauvegardes`
> est hors dépôt par construction.

> ⚠️ **Sécurité de cible** : chaque commande affiche le host de la datasource. **Lisez-le à chaque
> fois.** Ne jamais laisser un `.env` local pointant ailleurs interférer — on préfixe explicitement
> par `DATABASE_URL="$PROD_DATABASE_URL"`.

---

## 1. Inventaire — ce qui doit survivre

La donnée de NKONI vit à **deux endroits**, avec des propriétés de durabilité différentes. Une
restauration Postgres seule ne restaure pas tout.

### 1.1 PostgreSQL (Railway) — la source de vérité

28 modèles Prisma / 29 tables (les 28 + `_prisma_migrations`), volume actuel **208 Mo**. Contient
tout le métier : organisations, membres, contributions, versements, reçus, dépenses, audit trail,
sessions. **C'est ce que §2 sauvegarde.**

### 1.2 Vercel Blob — les fichiers, inégalement précieux

Trois familles de fichiers y sont écrites, et elles n'ont **pas la même valeur** :

| Famille | Écrite par | Régénérable ? | Conséquence d'une perte |
|---|---|---|---|
| **Reçus PDF** | `recu-pdf.service.ts` | **OUI** — `produireRecuPdf` relit le blob et, s'il est illisible, **régénère le PDF depuis la base** puis réécrit `urlPdf` | **Aucune.** Auto-réparation au premier téléchargement. Rien à sauvegarder. |
| **Photos de membre** | `membre-photo.route.ts` | **NON** — téléversement utilisateur | **Perte définitive.** La base ne garde que `photoBlobUrl`, qui pointerait dans le vide. |
| **Documents** | `document.service.ts` | **NON** — téléversement utilisateur | **Perte définitive.** Idem : la ligne `Document` survit, son contenu non. |

**Conséquence opérationnelle** : l'effort de sauvegarde du Blob ne concerne que **photos et
documents**. Les reçus, eux, se reconstruisent — c'est une propriété du code, pas une chance, et
elle doit être préservée (cf. §5).

---

## 2. Sauvegarde quotidienne de la base (RPO 24 h)

### 2.1 Produire le dump, chiffré

```bash
cd "$BACKUP_DIR"

# Format custom (-Fc) : restaurable table par table, compressé.
pg_dump "$PROD_DATABASE_URL" -Fc --no-owner --no-privileges -f "nkoni_${STAMP}.dump"

# Chiffrement symétrique : le dump contient des PII et des hash de mots de passe.
gpg --symmetric --cipher-algo AES256 "nkoni_${STAMP}.dump"
rm "nkoni_${STAMP}.dump"          # ne garder QUE la version chiffrée

ls -lh "nkoni_${STAMP}.dump.gpg"  # taille non nulle
```

**Attendu** : un fichier `.dump.gpg` de taille non nulle (ordre de grandeur : quelques dizaines de
Mo pour 208 Mo de base, la compression étant bonne sur ces données).

> ⚠️ **La phrase de passe gpg est aussi critique que la sauvegarde.** Un dump qu'on ne sait plus
> déchiffrer est une perte de données à retardement. La conserver dans le gestionnaire de mots de
> passe du PO, **pas** dans ce dépôt ni dans un fichier à côté des dumps.

### 2.2 Vérifier que le dump est lisible — immédiatement

Un dump jamais ouvert est une hypothèse, pas une sauvegarde. Ce contrôle prend dix secondes :

```bash
gpg --decrypt "nkoni_${STAMP}.dump.gpg" 2>/dev/null | pg_restore --list | head
```

**Attendu** : une liste d'objets (`TABLE DATA public Membre`, etc.). Une sortie vide ou une erreur
de déchiffrement = **la sauvegarde est à refaire immédiatement**.

### 2.3 Rétention

Conserver : **7 quotidiennes** + **4 hebdomadaires** (celle du dimanche) + **12 mensuelles** (celle
du 1er). À quelques dizaines de Mo l'unité, le coût de stockage est négligeable devant le risque.

```bash
# Purge des quotidiennes de plus de 7 jours (à lancer après avoir mis de côté hebdo/mensuelles).
find "$BACKUP_DIR" -name 'nkoni_*.dump.gpg' -mtime +7 -print   # VÉRIFIER la liste…
# find "$BACKUP_DIR" -name 'nkoni_*.dump.gpg' -mtime +7 -delete  # …puis décommenter
```

> La commande de suppression est **volontairement commentée** : on lit d'abord ce qui va disparaître.

### 2.4 Sauvegardes natives Railway — complément, jamais substitut

**À confirmer dans le dashboard Railway** (le CLI n'expose aucune commande de sauvegarde) : si le
plan courant inclut des snapshots automatiques du volume Postgres, les activer — c'est gratuit en
effort et ça couvre le cas « incident Railway isolé ».

**Mais elles ne remplacent pas §2.1** : une sauvegarde native vit chez le **même fournisseur, sur le
même compte** que la base. Une erreur de facturation, une suppression de projet ou une compromission
du compte emporte les deux. Le dump chiffré hors-site est ce qui rend la sauvegarde *indépendante*.

**Limite assumée de la solution actuelle** : le dump dépend d'un geste humain et d'une seule machine.
C'est acceptable au stade actuel (un seul tenant réel, volume faible) et **doit être revu avant
l'ouverture publique** — cf. §6.

---

## 3. Déclencher une restauration — quand, et qui décide

Une restauration **écrase des données**. Elle ne se lance pas par réflexe.

| Situation | Geste |
|---|---|
| Suppression accidentelle de quelques lignes | **Ne pas restaurer toute la base.** Restaurer dans une base jetable (§4) et réinjecter les lignes manquantes à la main. |
| Corruption/perte totale de la base | Restauration complète (§4 puis bascule). |
| Migration qui a mal tourné | Restauration complète, puis correction de la migration **avant** toute nouvelle tentative. |
| Doute sur l'intégrité, sans perte constatée | **Ne pas restaurer.** Lancer `GET /tresorerie/reconciliation` (compare les cumuls stockés à la somme réelle des versements) et diagnostiquer d'abord. |

> La décision de restaurer appartient au **PO**. En cas de doute, l'ordre est toujours :
> **sauvegarder l'état actuel d'abord** (§2.1 sur la base même abîmée), *puis* restaurer. Une base
> corrompue reste une source d'information ; écrasée, elle ne l'est plus.

---

## 4. Exercice de restauration — le cœur de ce runbook

À dérouler **trimestriellement** et après toute migration structurante. Se fait **entièrement à
côté de la production** : à aucun moment la prod n'est touchée.

### 4.1 Restaurer dans une base jetable

```bash
createdb "nkoni_verify_${STAMP}"
export VERIFY_DATABASE_URL="postgresql://localhost:5432/nkoni_verify_${STAMP}"

gpg --decrypt "$BACKUP_DIR/nkoni_${STAMP}.dump.gpg" > "/tmp/nkoni_${STAMP}.dump"
pg_restore --no-owner --no-privileges -d "$VERIFY_DATABASE_URL" "/tmp/nkoni_${STAMP}.dump"
rm "/tmp/nkoni_${STAMP}.dump"     # le dump en clair ne traîne pas
```

### 4.2 Contrôle structurel — comptes de lignes prod vs restauré

Cette recette existe déjà et **ne doit pas être redupliquée** : voir
[`RUNBOOK_bascule_prod_PhaseD.md` §2.3](../RUNBOOK_bascule_prod_PhaseD.md) (fonction `gen_counts`,
puis `diff`).

**Attendu** : `diff` ne renvoie aucune différence, `_prisma_migrations` comprise (29 tables).

**Critère d'arrêt A** — si les comptes divergent, la sauvegarde n'est pas fiable : ne pas s'en
servir, refaire §2 et rechercher la cause (dump interrompu ? version de `pg_dump` ?).

### 4.3 Contrôle APPLICATIF — ce que les comptes de lignes ne prouvent pas

**C'est l'étape que le runbook de bascule n'avait pas**, et la seule qui atteste que la base est
*utilisable* et pas seulement *présente*. Une base peut avoir le bon nombre de lignes et rester
inexploitable : migrations désynchronisées, contrainte perdue, séquence non restaurée.

```bash
cd "$REPO/backend"

# 1. Le schéma restauré est-il à jour vis-à-vis des migrations du code ?
DATABASE_URL="$VERIFY_DATABASE_URL" npx prisma migrate status
```
**Attendu** : « Database schema is up to date! », 28 migrations appliquées. Une migration *pending*
signifie que la sauvegarde précède un déploiement — restaurable, mais il faudra appliquer les
migrations manquantes avant remise en service.

```bash
# 2. L'application démarre-t-elle contre cette base ?
DATABASE_URL="$VERIFY_DATABASE_URL" npm run dev
```
**Attendu** : le serveur écoute, aucune erreur au boot.

```bash
# 3. Dans un autre terminal — le chemin critique répond-il ?
API=http://localhost:3000
# NB : le champ s'appelle bien `password` (et non `motDePasse`) — cf. schéma de `POST /auth/login`.
TOKEN=$(curl -s -X POST $API/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"<ADMIN réel>","password":"<mot de passe>"}' | jq -r .accessToken)

curl -s $API/auth/me       -H "Authorization: Bearer $TOKEN" | jq '{email, role, organisationId}'
curl -s $API/dashboard     -H "Authorization: Bearer $TOKEN" | jq 'keys'
curl -s $API/membres/statuts -H "Authorization: Bearer $TOKEN" | jq '.items | length'
```
**Attendu** : login réussi (les `passwordHash` argon2 ont survécu), `/auth/me` renvoie le bon rôle et
la bonne organisation, le dashboard répond, la liste des membres a le volume attendu.

```bash
# 4. Les invariants financiers tiennent-ils sur la base restaurée ?
curl -s $API/tresorerie/reconciliation -H "Authorization: Bearer $TOKEN" | jq '{coherent, nbEcarts}'
```
**Attendu** : `{ "coherent": true, "nbEcarts": 0 }` — aucun écart entre les cumuls `montantVerse` et
la somme réelle des versements. (La réponse porte aussi le détail dans `ecarts` ; ne pas lire
`length` sur la racine, qui compterait les 3 clés de l'objet et non les écarts.) Un `coherent: false`
sur une base restaurée signale une restauration partielle : c'est un **critère d'arrêt B**, la
sauvegarde ne doit pas être considérée comme valide.

### 4.4 Consigner puis nettoyer

Reporter le résultat dans le journal (§7) — **y compris un échec**, qui est l'information la plus
utile que cet exercice puisse produire.

```bash
dropdb "nkoni_verify_${STAMP}"
```

---

## 5. Durabilité du stockage Blob

**État actuel : aucune sauvegarde des fichiers téléversés.** Le store Vercel Blob est en `private`,
lu uniquement via proxy authentifié (`BLOB_READ_WRITE_TOKEN`). On s'appuie donc entièrement sur la
durabilité annoncée par Vercel.

### 5.1 Propriétés annoncées de Vercel Blob (consulté 2026-07-27)

| Propriété | Détail |
|---|---|
| **Infrastructure** | Stockage distribué sur serveurs Vercel (région: `us-east-1` pour prod) |
| **Redundance** | Données répliquées (détails internes Vercel) |
| **SLA** | Aucun SLA publié pour Vercel Blob (documents Vercel ne le précisent pas) |
| **Sauvegarde native** | Aucune (pas de snapshots ou export de données) |
| **Cas d'usage** | Recommandé pour fichiers temporaires / jetables / régénérables |

Source : https://vercel.com/docs/storage/vercel-blob

### 5.2 Classification des fichiers NKONI

| Famille | Champ | Régénérable | Conséquence de perte | Sauvegarde |
|---|---|---|---|---|
| **Reçus PDF** | `Recu.urlPdf` | ✅ OUI (code) | Aucune (auto-réparation) | ❌ NON |
| **Photos membre** | `Membre.photoBlobUrl` | ❌ NON | Perte définitive | ⚠️ À faire |
| **Documents** | `Document.contenuBlobUrl` | ❌ NON | Perte définitive | ⚠️ À faire |

### 5.3 Propriété structurelle critique — Régénération des reçus

**La régénération des reçus n'est PAS une chance** — c'est une propriété du code :
- `services/recu-pdf.service.ts::produireRecuPdf` capte les erreurs de lecture blob
- En cas d'échec Blob (illisible), la fonction **régénère le PDF** puis **réécrit `urlPdf`**
- Ainsi une perte Blob est automatiquement récupérée au prochain accès au reçu

**Protection requise** : toute refonte de la génération de reçus DOIT préserver ce comportement.
Sans lui, une perte Blob deviendrait une **perte de reçus** — critique pour un produit de transparence.

### 5.4 Risque résiduel et acceptation

**Risque borné** :
- Perte possible : photos de membre + documents (perte définitive, no fallback)
- Mitigé par : usage réel actuellement très limité (1 tenant réel, peu de fichiers)
- Documenté : ici, sur transparent

**Acceptation pour GA** :
- ✅ Aucune sauvegarde externe du Blob ne sera mise en place avant GA 0.2
- ⚠️ Avant l'ouverture publique (GA 0.3), évaluer miroir vers S3 ou équivalent

### 5.5 Chantier suivant (hors de ce runbook)

Miroir périodique des photos et documents vers stockage hors-site (même base que dumps).
Demande du code (parcours du store, copie incrémentale, gestion des deltas).
Reclassé en **dette D2** du roadmap avec cette documentation comme referent.

---

## 6. Critères d'acceptation du bloquant 0.2

Le bloquant est **traité** quand, simultanément :

- [ ] Une sauvegarde chiffrée de moins de 24 h existe hors de Railway (§2.1), et sa lisibilité a été
      vérifiée (§2.2).
- [ ] La rétention 7/4/12 est en place (§2.3).
- [ ] Le statut des sauvegardes natives Railway a été **constaté** dans le dashboard et consigné ici (§2.4).
- [ ] **Un exercice de restauration complet a été mené et consigné** (§4), contrôle applicatif inclus —
      c'est le critère qui compte : les autres sont des moyens.
- [ ] La durabilité annoncée par Vercel Blob a été lue et consignée (§5).
- [ ] Le journal (§7) contient au moins une entrée.

**Restent hors périmètre, à traiter avant l'ouverture publique** : l'automatisation de la sauvegarde
(elle dépend aujourd'hui d'un geste humain et d'une seule machine) et le miroir du Blob.

---

## 7. Journal des exercices de restauration

Une ligne par exercice. **Consigner les échecs** : c'est ce qui donne sa valeur au journal.

| Date | Sauvegarde testée | §4.2 comptes | §4.3 applicatif | §4.4 réconciliation | Anomalies / suites |
|---|---|---|---|---|---|
| 2026-07-27 | En cours (workflow Actions) | ⏳ Pending | ⏳ Pending | ⏳ Pending | Workflow déclenché, en attente de résultats |

---

## 8. Critères d'arrêt — récapitulatif

| # | Symptôme | Décision |
|---|---|---|
| **A** | Les comptes de lignes divergent entre prod et base restaurée (§4.2) | La sauvegarde n'est pas fiable. Ne pas s'en servir, refaire §2, chercher la cause. |
| **B** | `GET /tresorerie/reconciliation` renvoie des écarts sur la base restaurée (§4.3) | Restauration partielle. Sauvegarde à considérer comme **invalide**. |
| **C** | `pg_restore` échoue sur une version de client trop ancienne | Installer un client ≥ la version du serveur (§0) et refaire le dump — un dump produit par un client trop ancien n'est pas récupérable après coup. |
| **D** | Le dump ne se déchiffre pas | La phrase de passe est perdue ou le fichier est corrompu. Toutes les sauvegardes chiffrées avec cette phrase sont concernées : vérifier les autres **immédiatement**. |

---

## 9. Pièges du workflow CI de sauvegarde (appris en production)

> Déplacé depuis `CLAUDE.md` (allègement du fichier de référence). C'est le « pourquoi » du
> workflow `.github/workflows/backup-restore-exercise.yml` — chaque point vient d'un défaut réel.

**Vue d'ensemble** — chaque **dimanche 03:00 UTC** (+ `workflow_dispatch`), dump `pg_dump -Fc` de la prod → chiffrement **GPG AES256** → artefact retenu **30 j** → **copie hors-site sur Cloudflare R2**. Secrets : `DATABASE_URL`, `GPG_PASSPHRASE_BACKUP` et les **4 secrets R2** (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_ACCOUNT_ID`, `R2_BUCKET`) — les 6 sont documentés dans `docs/SECRETS_GITHUB_SETUP.md`.

- **Second job `restore-verify` — le contrôle de restauration FONCTIONNELLE (§0.2).** Le job de sauvegarde ne prouve que la LISIBILITÉ du dump (`pg_restore --list`) ; `restore-verify` prouve son UTILISABILITÉ : restaure l'artefact chiffré dans une **Postgres éphémère du runner** (service container ; la prod n'est jamais touchée), compile le backend, **démarre `node dist/app.js` dessus**, attend `/ready` = 200, puis signe un access token de contrôle pour un ADMIN réel de la base restaurée et appelle **`GET /tresorerie/reconciliation`** → 200 (auth + contexte tenant + lecture financière réelle). Trois points non évidents : (1) le **`stamp` du dump transite par `outputs:` de job**, `$GITHUB_ENV` ne traversant pas les jobs — sans quoi le second job téléchargerait le mauvais artefact ; (2) `pg_restore` rend un code ≠ 0 sur les erreurs NON fatales (rôles/privilèges absents du runner) : on ne fait donc PAS échouer l'étape dessus, **la preuve est le boot + la requête applicative** ; (3) `NODE_ENV=test` désactive le rate-limit (`app.ts`) pour que les `curl` de contrôle ne soient pas limités.
  - **Le contrôle doit être NON VACANT, et ça ne va pas de soi.** Compter les tables ne prouve que le SCHÉMA : un dump sans données passait au vert, car `reconciliation` sur une org sans mouvements rend trivialement `coherent: true`. D'où deux gardes : **`Membre > 0`**, et la sélection de l'ADMIN **dans l'org ayant le plus de versements** (`ORDER BY count(*) DESC`, repli sur un admin quelconque) — un `LIMIT 1` nu pouvait tomber sur une org vide, d'où le tri. **Limite résiduelle assumée** : `Membre > 0` n'est pas une comparaison avec la SOURCE, donc une restauration tronquée (3 membres sur 36) passerait encore — la fermer = exporter les comptes de lignes en `outputs:` du job de dump et les comparer après restauration.
  - **Dépôt PUBLIC ⇒ logs Actions PUBLICS.** Ne JAMAIS journaliser le corps de `/tresorerie/reconciliation` : `ecarts[]` porte des `membreId` et des MONTANTS RÉELS — et seulement quand une dérive existe, donc la fuite se produirait exactement le jour où elle serait le plus gênante. On n'extrait que `{coherent, nbEcarts}` (structurel) et les UUID de contrôle sont tronqués à 8 caractères. **Vaut pour toute étape de CI qui interroge l'application sur des données restaurées.**
- **Historique qui justifie les détails ci-dessous** : ce workflow a été mergé **sans avoir jamais tourné avec succès** et a échoué en silence des semaines durant. Cinq défauts EMPILÉS, chacun masquant le suivant. Aucun n'était détectable sans exécution réelle. D'où la règle : **un workflow d'infrastructure n'est « fait » qu'après un run vert de bout en bout**, pas au merge.
- **`DATABASE_URL` = l'URL PUBLIQUE, et l'utilisateur est `postgres`.** Le `DATABASE_URL` du service backend pointe sur `postgres.railway.internal` — hostname **privé au réseau Railway**, non résolvable depuis un runner GitHub. Prendre `DATABASE_PUBLIC_URL` du service **Postgres** (proxy TCP). Le secret initial portait l'utilisateur `railway` au lieu de `postgres` → `password authentication failed`. Poser sans retaper : `gh secret set DATABASE_URL --body "$(railway variables --service Postgres --kv | grep '^DATABASE_PUBLIC_URL=' | cut -d= -f2-)"`.
- **Client PostgreSQL : version ÉPINGLÉE + `$GITHUB_PATH`.** `pg_dump` refuse un serveur d'une majeure supérieure ; Ubuntu 24.04 fournit le client **16**, le serveur Railway est en **18** → dépôt PGDG + `postgresql-client-18`. **Insuffisant seul** : `/usr/bin/pg_dump` est `pg_wrapper`, qui résout vers la version par DÉFAUT du runner (16) même la 18 installée. Mettre `/usr/lib/postgresql/18/bin` en tête de `$GITHUB_PATH`. Le `pg_dump --version` juste après l'installation rend le problème visible immédiatement. Si Railway passe à 19, le run hebdomadaire échouera **visiblement** — canari assumé.
- **La vérification du dump n'utilise AUCUN tuyau, et c'est délibéré.** Sous `pipefail`, **tout consommateur qui sort tôt tue son producteur** : `pg_restore --list` sort après la table des matières → `gpg` meurt en *broken pipe* ; `… | head` tue `pg_restore` pareil (piège rencontré **trois fois**). Forme correcte : déchiffrer vers un fichier, puis `LISTING="$(pg_restore --list "$fichier")"` — **c'est cette affectation qui est le verdict**, l'affichage `| head` relégué derrière `|| true`. Un garde-fou refuse aussi une archive lisible mais **vide** (0 entrée).
- **Copie hors-site R2 (§2.3) — l'artefact GitHub ne suffisait pas.** L'artefact vit sur **la même infra que le dépôt** ; une sauvegarde qui partage son sort avec ce qu'elle sauvegarde n'en est pas une. R2 est indépendante (S3-compatible, client `aws` préinstallé : `--endpoint-url`, `AWS_DEFAULT_REGION: auto`). **La rétention longue est une règle de cycle de vie du BUCKET** (dashboard Cloudflare), non versionnée ni vérifiée par la CI. **Fail-closed délibéré** : un échec de la copie fait échouer le job + ouvre l'issue d'alerte. `--only-show-errors` rend le succès SILENCIEUX : le verdict est le code de sortie, pas la sortie console — sous `bash -e`, l'`echo` qui suit ne s'exécute que si le `cp` a réussi.
- **`notify-on-failure` ouvre une ISSUE GitHub** (label `backup-failure`, dédoublonnée). Prérequis non évidents : `permissions: issues: write` (le `GITHUB_TOKEN` est en lecture seule par défaut) **et `GH_REPO: ${{ github.repository }}`** — ce job n'a pas de `checkout`, donc `gh` ne peut inférer le dépôt (« not a git repository ») et aucune issue n'est créée. Ne s'exerce que sur échec (`if: failure()`).
