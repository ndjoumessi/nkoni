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
durabilité annoncée par Vercel — **à lire dans leur documentation et à consigner ici**, ce qui n'a
pas encore été fait.

**Risque réel, borné par §1.2** : une perte du store ferait disparaître **photos de membre et
documents** définitivement. Les **reçus PDF, eux, se régénèrent** depuis la base au premier
téléchargement.

**Cette propriété est fragile et doit être protégée** : elle tient à ce que `produireRecuPdf`
régénère quand le blob est illisible plutôt que d'échouer. Toute refonte de la génération de reçus
doit préserver ce comportement — sans quoi une perte Blob deviendrait une perte de reçus.

**Chantier suivant (hors de ce runbook)** : miroir périodique des documents et photos vers le même
stockage hors-site que les dumps. Demande du code (parcours du store, copie incrémentale) — délibérément
non entrepris ici, la consigne étant « runbook d'abord, aucun code ».

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
| _(à remplir au premier exercice)_ | | | | | |

---

## 8. Critères d'arrêt — récapitulatif

| # | Symptôme | Décision |
|---|---|---|
| **A** | Les comptes de lignes divergent entre prod et base restaurée (§4.2) | La sauvegarde n'est pas fiable. Ne pas s'en servir, refaire §2, chercher la cause. |
| **B** | `GET /tresorerie/reconciliation` renvoie des écarts sur la base restaurée (§4.3) | Restauration partielle. Sauvegarde à considérer comme **invalide**. |
| **C** | `pg_restore` échoue sur une version de client trop ancienne | Installer un client ≥ la version du serveur (§0) et refaire le dump — un dump produit par un client trop ancien n'est pas récupérable après coup. |
| **D** | Le dump ne se déchiffre pas | La phrase de passe est perdue ou le fichier est corrompu. Toutes les sauvegardes chiffrées avec cette phrase sont concernées : vérifier les autres **immédiatement**. |
