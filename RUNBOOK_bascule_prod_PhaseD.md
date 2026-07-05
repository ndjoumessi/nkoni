# Runbook — Bascule production multi-tenant (Phase D)

Procédure pas-à-pas pour appliquer la migration multi-tenant (Phases A→C→B) sur la **base de
production**. À exécuter par le PO, dans l'ordre, en fenêtre de maintenance.

> **Principe directeur** — `main` (et donc la prod) n'a JAMAIS été touché : tout le travail est
> sur `feat/multi-tenant`. Le rollback ultime est donc toujours possible (restauration du dump +
> retour au code de `main`). On ne rend le schéma irréversible (NOT NULL) qu'après avoir prouvé
> l'intégrité à 100 %.

**Contexte technique figé (vérifié dans le repo) :**
- Prod = `main`, migrations appliquées jusqu'à `20260705023550_v2_notification_preferences` (9 migrations).
- 5 migrations SaaS à appliquer, dans cet ordre :
  1. `20260705030043_saas_organisation_nullable`
  2. `20260705030145_populate_organisation_wamba`  ← backfill « WAMBA TCHOUPA »
  3. `20260705034527_saas_m2m_join_tables_explicit`
  4. `20260705061500_saas_uniques_par_organisation`
  5. `20260705140000_saas_organisation_not_null`  ← **irréversible**, à appliquer en dernier
- Migration en **2 temps** : commit `33a39a2` contient les migrations 1→4 (organisationId encore
  NULLABLE) ; commit `51bc74d` ajoute la migration 5 (NOT NULL). On insère le contrôle d'intégrité
  ENTRE les deux.
- Organisation d'amorçage : `WAMBA TCHOUPA`, id fixe `11111111-1111-1111-1111-111111111111`.
- Railway lance `npx prisma migrate deploy && npm run start` au démarrage (cf. `railway.json`).
  → On applique les migrations **manuellement depuis le poste**, AVANT de déployer le nouveau code,
  pour pouvoir gérer les deux temps. Le `migrate deploy` automatique de Railway sera ensuite un no-op.

**Variables à définir une fois pour toute la session (à remplir) :**
```bash
# URL PUBLIQUE de la base prod (Railway → service Postgres → Connect → Public Network).
# PAS l'URL *.railway.internal (injoignable depuis le poste).
export PROD_DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"

export STAMP="$(date +%Y%m%d_%H%M%S)"
export REPO="$HOME/Documents/Projets/nkoni"     # racine du repo
export ADMIN_EMAIL="<email d'un compte ADMIN réel en prod>"   # pour le smoke-test login
```

> ⚠️ **Sécurité de cible** : chaque commande `prisma migrate` affiche le host de la datasource
> (`Datasource "db": PostgreSQL database "…" at "HOST"`). **Lisez ce host à chaque fois** et ne
> continuez que s'il correspond bien à la prod. Ne jamais laisser un `.env` local pointant sur une
> autre base interférer : on préfixe chaque commande par `DATABASE_URL="$PROD_DATABASE_URL"`.

---

## 0. Pré-requis outillage (à vérifier une fois)

```bash
psql --version          # client postgres présent
pg_dump --version       # DOIT être >= version majeure du serveur prod (Railway = PG 16 en général)
pg_restore --version
node --version && npm --version
cd "$REPO/backend" && npm ci   # dépendances installées (génère aussi le client Prisma via postinstall)
```

Si `pg_dump` est plus ancien que le serveur : installez un client Postgres à jour (`brew install
postgresql@16`) et utilisez son `pg_dump`/`pg_restore`.

---

## 1. Pré-requis & staging

### 1.1 Confirmer l'état de la prod AVANT tout
```bash
cd "$REPO/backend"
git checkout feat/multi-tenant
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate status
```
**Attendu** : « 9 migrations found », les 5 SaaS listées comme **non appliquées** (pending), et le
host = prod. **Critère d'arrêt A** (cf. §8) si ce n'est pas le cas.

### 1.2 Staging = rejouer la bascule sur une copie de la prod
Il n'y a pas d'environnement de staging permanent. On en fabrique un **jetable, identique à la
prod**, à partir du dump de sauvegarde (§2) : c'est à la fois la **vérification de restaurabilité**
du backup ET la **répétition générale** de la bascule.

> Ne touchez à la prod (§3 et suivants) qu'après avoir déroulé §2 puis rejoué **l'intégralité** des
> étapes de migration (§4→§6) sur cette base jetable **sans erreur**.

---

## 2. Sauvegarde prod + vérification de restaurabilité

### 2.1 Dump (format custom, restaurable finement)
```bash
cd "$REPO"
pg_dump "$PROD_DATABASE_URL" -Fc --no-owner --no-privileges -f "nkoni_prod_${STAMP}.dump"
ls -lh "nkoni_prod_${STAMP}.dump"                 # taille non nulle
pg_restore --list "nkoni_prod_${STAMP}.dump" | head   # le dump est lisible
```

### 2.2 Restauration dans une base jetable (locale)
```bash
# Base jetable locale (adaptez si votre postgres local a un autre user/host).
createdb "nkoni_verify_${STAMP}"
export VERIFY_DATABASE_URL="postgresql://localhost:5432/nkoni_verify_${STAMP}"

pg_restore --no-owner --no-privileges -d "$VERIFY_DATABASE_URL" "nkoni_prod_${STAMP}.dump"
```

### 2.3 Comparaison des comptes de lignes par table (prod vs restauré)
```bash
# Génère et exécute un comptage exact de toutes les tables du schéma public.
gen_counts() {   # $1 = URL
  psql "$1" -Aqt <<'SQL' | sort
SELECT format('SELECT %L AS t, count(*) AS n FROM %I', tablename, tablename)
FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
\gexec
SQL
}
gen_counts "$PROD_DATABASE_URL"    > "counts_prod_${STAMP}.txt"
gen_counts "$VERIFY_DATABASE_URL"  > "counts_verify_${STAMP}.txt"

diff "counts_prod_${STAMP}.txt" "counts_verify_${STAMP}.txt" && echo "OK: backup identique à la prod"
```
**Attendu** : `diff` ne renvoie AUCUNE différence (hors table `_prisma_migrations`, qui doit être
identique elle aussi). **Critère d'arrêt B** si les comptes divergent : le backup n'est pas fiable,
NE PAS migrer.

### 2.4 Répétition générale sur la base jetable
Déroulez **maintenant** les §4 et §5 en remplaçant `PROD_DATABASE_URL` par `VERIFY_DATABASE_URL`.
Tout doit passer (les 4 migrations, puis le contrôle 0 orphelin, puis la migration NOT NULL, puis
les vérifs §6). Ce n'est qu'ensuite qu'on touche la vraie prod.

```bash
# Nettoyage de la base jetable une fois la répétition validée (optionnel).
# dropdb "nkoni_verify_${STAMP}"
```

---

## 3. Fenêtre de maintenance (couper les écritures pendant la migration)

Objectif : empêcher l'app live d'écrire pendant qu'on migre (sinon des lignes pourraient être
créées sans `organisationId`, ou buter sur le NOT NULL).

### 3.1 Couper le backend (Railway) — méthode recommandée
- Dashboard Railway → service **backend nkoni** → onglet **Settings**.
- Mettre **Replicas = 0** (ou « Remove » le déploiement actif / mettre le service en pause).
- Attendre l'arrêt, puis confirmer que l'API ne répond plus :
```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<backend-prod>/health   # attendu : 000 / échec / 503
```

### 3.2 Frontend (Vercel) — optionnel
Le front appelle le backend ; backend coupé ⇒ le front affiche des erreurs réseau explicites
(déjà gérées côté UI). Pour une expérience propre, vous pouvez déployer une bannière/pahe de
maintenance sur Vercel, mais ce n'est pas indispensable pour la sécurité de la bascule.

> À partir d'ici, plus aucune écriture ne doit arriver sur la prod jusqu'à la réouverture (§6.4).

---

## 4. Migration — Temps 1 (jusqu'aux uniques, organisationId encore NULLABLE)

```bash
cd "$REPO/backend"
git checkout 33a39a2          # dernier commit SANS la migration NOT NULL
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate status
```
**Attendu** : 4 migrations pending (nullable, populate_wamba, m2m, uniques). **Vérifiez le host = prod.**

```bash
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate deploy
```
**Attendu** : les 4 migrations s'appliquent, « All migrations have been successfully applied. »
**Critère d'arrêt C** en cas d'erreur (cf. §8 + §7 rollback).

---

## 5. Contrôle d'intégrité 0 orphelin — LE point de gate

À exécuter **immédiatement après le Temps 1** et **avant** le Temps 2 (NOT NULL).

```bash
cd "$REPO/backend"
psql "$PROD_DATABASE_URL" -f prisma/checks/verify-organisation-backfill.sql
```
Le script affiche, table par table, le nombre de lignes et d'orphelines, puis :
`=== TOTAL orphelines (organisationId IS NULL) : 0 ===`.

- **Si 0 orphelin** → on continue au Temps 2 (§5.2).
- **Si > 0 orphelin** → le script lève `EXCEPTION: Backfill INCOMPLET…`. **NE PAS lancer le Temps 2.**
  Diagnostic : identifier les tables concernées dans la sortie du script, puis :
  ```bash
  # Exemple pour repérer les lignes orphelines d'une table donnée :
  psql "$PROD_DATABASE_URL" -c "SELECT id FROM \"NOM_TABLE\" WHERE \"organisationId\" IS NULL LIMIT 20;"
  # Rattachement manuel à WAMBA si ces lignes sont légitimes :
  psql "$PROD_DATABASE_URL" -c "UPDATE \"NOM_TABLE\" SET \"organisationId\"='11111111-1111-1111-1111-111111111111' WHERE \"organisationId\" IS NULL;"
  ```
  Relancer le script. S'il reste des orphelines inexplicables → **rollback (§7)**, ne pas forcer.

### 5.2 Migration — Temps 2 (NOT NULL, irréversible)
```bash
cd "$REPO/backend"
git checkout 51bc74d          # commit qui ajoute la migration NOT NULL
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate status   # 1 pending : ..._saas_organisation_not_null
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate deploy
```
**Attendu** : la migration `20260705140000_saas_organisation_not_null` s'applique.
> Garde-fou intégré : si par malheur une ligne nulle subsistait, le `ALTER … SET NOT NULL`
> échouerait de lui-même et la migration s'arrêterait sans dégât → **rollback (§7)**.

---

## 6. Vérifications post-migration (avant réouverture)

```bash
cd "$REPO/backend"

# a) L'organisation WAMBA TCHOUPA existe.
psql "$PROD_DATABASE_URL" -tAc \
  "SELECT id,nom,devise,\"langueDefaut\",actif FROM \"Organisation\" WHERE id='11111111-1111-1111-1111-111111111111';"
# attendu : 1111...|WAMBA TCHOUPA|FCFA|FR|t

# b) Aucune orpheline (redondant, confirme le NOT NULL tenu) — le script doit finir sur « 0 ».
psql "$PROD_DATABASE_URL" -f prisma/checks/verify-organisation-backfill.sql

# c) 22 colonnes organisationId sont bien NOT NULL.
psql "$PROD_DATABASE_URL" -tAc \
  "SELECT count(*) FROM information_schema.columns WHERE column_name='organisationId' AND is_nullable='NO' AND table_schema='public';"
# attendu : 22

# d) Toutes les données pointent sur WAMBA (aucune autre organisation parasite).
psql "$PROD_DATABASE_URL" -tAc \
  "SELECT DISTINCT \"organisationId\" FROM \"Utilisateur\" UNION SELECT DISTINCT \"organisationId\" FROM \"Membre\";"
# attendu : uniquement 11111111-1111-1111-1111-111111111111

# e) Un compte ADMIN réel est bien rattaché à WAMBA.
psql "$PROD_DATABASE_URL" -tAc \
  "SELECT email,\"organisationId\" FROM \"Utilisateur\" WHERE role='ADMIN';"
```
**Critère d'arrêt D** (cf. §8) si l'un de ces contrôles ne donne pas l'attendu → rollback (§7).

### 6.3 Déployer le nouveau code applicatif
Le schéma est migré ; on peut déployer le code multi-tenant.
```bash
cd "$REPO"
git checkout main
git merge --no-ff feat/multi-tenant -m "merge: transformation multi-tenant (Phases A→C→B)"
git push origin main
```
Sur Railway : redémarrer / remettre **Replicas = 1** sur le backend. Au démarrage, son
`prisma migrate deploy` automatique ne trouvera **rien de pending** (tout est déjà appliqué) → no-op,
puis l'app démarre.

```bash
# Attendre que le health repasse au vert.
curl -s https://<backend-prod>/health    # attendu : {"status":"ok"}
```

### 6.4 Smoke-test : login réel + lecture scopée
```bash
# Login d'un compte ADMIN réel (mot de passe saisi à la main, non stocké ici).
read -s ADMIN_PWD; echo
TOKEN=$(curl -sS -X POST https://<backend-prod>/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PWD\"}" | python3 -c 'import sys,json;print(json.load(sys.stdin)["accessToken"])')
echo "token: ${TOKEN:0:20}…"

# Lecture scopée : doit renvoyer les membres de WAMBA (200, liste non vide).
curl -sS https://<backend-prod>/membres -H "Authorization: Bearer $TOKEN" | head -c 400; echo
```
**Attendu** : login `200` + `accessToken` ; `/membres` renvoie les membres existants.
Si le login échoue ou renvoie une liste vide alors qu'il y a des membres → **rollback (§7)**.

### 6.5 Réouverture
Tout est vert : la fenêtre de maintenance est close, l'app est de nouveau disponible. Conservez le
dump `nkoni_prod_${STAMP}.dump` (au moins quelques semaines).

---

## 7. Rollback (retour arrière propre)

Le rollback dépend de l'endroit où l'on s'arrête. Dans tous les cas, `main` n'ayant pas été
déployé tant qu'on n'a pas atteint §6.3, le **code** de prod est intact ; seul l'état **DB** peut
avoir changé.

### 7.1 Rien n'a encore été appliqué (arrêt en §1, §2 ou §3)
Aucune migration lancée → rien à défaire côté DB. Remettre **Replicas = 1** sur Railway (§3.1 inversé).
La prod repart comme avant.

### 7.2 Une ou plusieurs migrations ont été appliquées (arrêt en §4, §5 ou §6)
Restaurer le dump pré-migration dans la base prod :
```bash
# Restauration destructive : drop des objets existants puis recréation depuis le dump.
pg_restore --clean --if-exists --no-owner --no-privileges \
  -d "$PROD_DATABASE_URL" "nkoni_prod_${STAMP}.dump"
```
Puis vérifier que l'état est bien revenu à l'avant-bascule :
```bash
DATABASE_URL="$PROD_DATABASE_URL" npx prisma migrate status   # 9 appliquées, 5 pending (état d'origine)
gen_counts "$PROD_DATABASE_URL" | diff - "counts_prod_${STAMP}.txt" && echo "DB restaurée = état pré-bascule"
```

> Si `pg_restore --clean` échoue (droits, dépendances) sur la base managée : créer une **nouvelle**
> base Postgres sur Railway, y restaurer le dump (`pg_restore -d <NOUVELLE_URL> …`), puis repointer
> la variable `DATABASE_URL` du service backend vers cette nouvelle base.

### 7.3 Code
`main` n'a pas été modifié tant qu'on n'a pas fait §6.3. Si le merge a déjà été poussé et déployé,
revenir au code précédent :
```bash
cd "$REPO"
git checkout main
git revert --no-edit -m 1 <HASH_DU_MERGE>   # annule le merge multi-tenant
git push origin main
# Railway redéploie l'ancien code ; son migrate deploy sur la DB restaurée (état d'origine) = no-op.
```
Remettre le backend en service et re-tester `/health` + un login.

---

## 8. Critères d'arrêt (quand basculer en rollback plutôt que continuer)

Interrompre **immédiatement** et passer au §7 dès l'un de ces signaux :

- **A — État prod inattendu** (§1.1) : `migrate status` ne montre pas exactement 9 appliquées +
  5 pending, ou le host affiché n'est pas la prod. → NE RIEN migrer.
- **B — Backup non fiable** (§2.3) : le `diff` des comptes de lignes prod/restauré n'est pas vide,
  ou le dump est illisible/vide. → NE PAS migrer sans backup valide.
- **B' — Répétition générale KO** (§2.4) : une étape échoue sur la base jetable. → corriger la cause
  AVANT de toucher la prod.
- **C — Échec d'une migration** (§4 ou §5.2) : `prisma migrate deploy` renvoie une erreur.
- **D — Contrôle d'intégrité KO** : `verify-organisation-backfill.sql` reste > 0 orphelin après
  tentative de rattachement (§5) ; ou une vérif post-migration (§6) ne donne pas l'attendu
  (WAMBA absente, ≠ 22 colonnes NOT NULL, données non scopées sur WAMBA, login réel en échec).
- **E — Perte de contrôle** : perte de connexion à la DB en cours de migration, dépassement
  significatif de la fenêtre de maintenance, ou tout comportement inattendu non expliqué.

En cas de doute : **on préfère toujours restaurer le dump et reporter la bascule** plutôt que de
forcer une étape. La migration est rejouable à volonté ; une base corrompue en prod, non.

---

## Annexe — Ordre condensé (checklist)

```
[ ] 0.  Outillage OK (psql/pg_dump/pg_restore/node), npm ci
[ ] 1.1 migrate status prod = 9 appliquées / 5 pending, host = prod   (sinon → STOP A)
[ ] 2.1 pg_dump prod → nkoni_prod_${STAMP}.dump
[ ] 2.2 pg_restore dans nkoni_verify_${STAMP}
[ ] 2.3 diff comptes prod/verify = vide                               (sinon → STOP B)
[ ] 2.4 répétition §4→§6 sur VERIFY_DATABASE_URL = OK                 (sinon → STOP B')
[ ] 3.1 backend Railway Replicas=0, /health KO
[ ] 4.  checkout 33a39a2 → migrate deploy (4 migrations)              (erreur → STOP C)
[ ] 5.  verify-organisation-backfill.sql = 0 orphelin                 (>0 → §5 remède / STOP D)
[ ] 5.2 checkout 51bc74d → migrate deploy (NOT NULL)                  (erreur → STOP C)
[ ] 6a-e vérifs post-migration = toutes vertes                        (sinon → STOP D)
[ ] 6.3 merge feat/multi-tenant → main, push, Railway Replicas=1, /health OK
[ ] 6.4 login réel 200 + /membres non vide                           (sinon → STOP D)
[ ] 6.5 réouverture, conserver le dump
```
