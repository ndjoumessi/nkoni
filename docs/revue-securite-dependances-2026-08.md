# Revue de sécurité — dépendances (SCA) — août 2026

Chantier **1.4** de [`roadmap-v1-vers-GA.md`](roadmap-v1-vers-GA.md).
Méthode : `npm audit` sur les deux paquets, puis **tri par exposition réelle** — une faille dans
l'outillage de build n'a pas le même statut qu'une faille dans le routeur HTTP de production.

**Total brut : 24 alertes** (backend 13, frontend 11). **Après tri : 3 à traiter, 0 critique — les
3 sont corrigées** (PR #120 `find-my-way`/`fast-uri`, PR #122 `brace-expansion`).

### État final — **0 High sur chemin de production**

| Reliquat | Gravité | Chemin | Statut |
|---|---|---|---|
| `nanoid`, `postcss` | 🔴 High | `vitest → vite` | **Dev uniquement**, jamais expédié. Hygiène CI. |
| `undici` | 🟠 Moderate | `@vercel/blob` — **production** | Seul reliquat sur chemin de prod. Moderate, à suivre. |
| autres | 🟠 Moderate | outillage de build | Voir §4. |

> ⚠️ **Compter les alertes sur une sortie tronquée fausse le décompte.** Vécu : un `head -40` sur
> `npm audit` avait masqué deux High (`nanoid`, `postcss`), donnant à croire qu'une seule High
> subsistait. Le tri du §1 exige la liste **complète** — trier une liste amputée produit une
> conclusion fausse avec l'apparence de la rigueur. Même piège que le grep dont le motif ne couvre
> pas toutes les formes d'écriture.

---

## 1. La règle de tri

`npm audit` compte les alertes de l'arbre de dépendances **complet**, outillage compris. Trois
questions décident du statut réel :

1. Le paquet tourne-t-il **en production** (chemin de requête) ou seulement au **build** ?
2. Le **code vulnérable est-il atteint** par notre usage ?
3. Le correctif proposé est-il une **mise à jour** ou un **downgrade** déguisé ?

`npm audit fix --force` répond « non » aux trois. Il ne doit pas être lancé ici — voir §4.

---

## 2. À traiter (2)

| Paquet | Gravité | Chemin | Pourquoi ça compte | Action |
|---|---|---|---|---|
| `find-my-way` 9.6.0 | 🔴 High | **Production** — c'est le routeur de Fastify, sur le chemin de **chaque** requête | DDoS via HTTP/2. Le seul CVE de la liste qui touche du code exécuté à chaque appel d'API. | Monter `fastify` (5.9.0 → dernière 5.x), qui embarque le correctif. |
| `fast-uri` 3.1.3 | 🔴 High | **Production** — via `ajv`, donc la validation de schéma de toutes les routes | Confusion d'hôte via un `\` littéral comme délimiteur d'autorité. Exploitabilité **faible** chez nous (nos schémas ne valident pas d'URI fournies par l'utilisateur), mais c'est du code de production. | Même correctif : remontée de `fastify`/`ajv`. |

| `brace-expansion` | 🔴 High | **Production (backend)** — chaîne `exceljs → archiver → archiver-utils → glob → minimatch → brace-expansion` ; `exceljs` est en `dependencies`, utilisé par les exports Excel | DoS par expansion exponentielle de groupes `{}`. **Exploitabilité faible** : le DoS suppose des **motifs glob contrôlés par l'attaquant**, or `archiver` ne globe que ses propres fichiers internes en assemblant le `.xlsx` (qui est un zip) — aucun motif ne vient de l'utilisateur. Mais c'est bien du code de production, pas de l'outillage. | ✅ **CORRIGÉ (PR #122)** — `npm update brace-expansion`. ⚠️ **DEUX emplacements, dans DEUX majeures différentes** (range vulnérable `<=1.1.17 ‖ 2.0.0-2.1.3`) : racine 1.1.15 → **1.1.18**, et `readdir-glob/node_modules/` 2.1.1 → **2.1.4**. N'en remonter qu'un donnerait l'illusion du correctif — d'où le contrôle « l'avis a-t-il **disparu** de `npm audit` », plus robuste qu'une vérification de version à un seul chemin. Aucune remontée de `glob`/`archiver`/`exceljs`, pas d'override, `package.json` inchangé. |

> ⚠️ **`npm update <paquet>` ne suffit PAS pour une transitive dont le range est déjà satisfait.**
> Vécu sur cette revue : `npm update fastify` a bien monté Fastify 5.9 → 5.12, mais a **laissé
> `find-my-way` en 9.6.0 et `fast-uri` en 3.1.3** — les deux versions vulnérables — puisque les
> ranges (`^9.6.0`, `^3.0.1`) étaient déjà honorés. npm n'avait aucune raison de bouger.
> **Il faut nommer les transitives** : `npm update find-my-way fast-uri` → 9.8.0 et 3.1.5.
> **Toujours contrôler les versions installées après coup**, avant de committer :
>
> ```bash
> node -e "console.log(require('./node_modules/find-my-way/package.json').version, require('./node_modules/fast-uri/package.json').version)"
> npm audit   # les avis doivent avoir DISPARU, pas seulement le numéro de fastify avoir changé
> ```
>
> Sans ce contrôle, un commit annonce des CVE corrigées qui ne le sont pas — et le sujet est classé.
> C'est le pire mode de défaillance pour un correctif de sécurité.

**Action pour les deux premières** : `npm update fastify find-my-way fast-uri`, puis `npm run build`
+ `npm run test` (**y compris les tests d'intégration** : une montée de Fastify touche précisément
le routeur et la validation ajv — des mocks ne prouveraient rien ici). Même majeure, pas de rupture.

---

## 3. Sans objet — non exploitables ici (3 notables)

| Paquet | Gravité annoncée | Pourquoi ça ne s'applique pas |
|---|---|---|
| `react-router-dom` 7.18.1 | 🔴 High (seule alerte **directe** du frontend) | La CVE vise le **mode RSC** (React Server Components) : « CSRF bypass allows action execution before 400 response ». **NKONI est une SPA Vite** qui monte un `BrowserRouter` (`main.tsx`) — il n'y a ni serveur React, ni actions RSC, ni `createStaticHandler`. Le code vulnérable n'est jamais chargé. **Ne pas se précipiter sur une montée de majeure pour cette alerte.** |
| `exceljs` 4.4.0 | 🟠 Moderate (via `uuid`) | ⚠️ **Le « correctif » proposé par npm est `exceljs@3.4.0` — un DOWNGRADE d'une majeure entière**, qui casserait les exports Excel (recouvrement, contributions). La faille réelle est dans `uuid` : *missing buffer bounds check en v3/v5/v6 **quand `buf` est fourni*** — une API qu'`exceljs` n'utilise pas pour générer ses identifiants. **Ne pas appliquer.** Attendre qu'`exceljs` remonte sa dépendance `uuid`. |
| `@prisma/dev`, `hono`, `valibot` | 🟠 Moderate | Transitives de l'outillage **Prisma en développement** (`prisma studio`/`dev`). Absentes du runtime de production : le déploiement Railway exécute `prisma migrate deploy` puis `npm run start`, qui ne chargent pas ce serveur de dev. |

---

## 4. Outillage de build uniquement (le reste)

`postcss`, `nanoid`, `js-yaml`, `ip-address`, `undici`, `@hono/node-server` — ces paquets tournent
**pendant `vite build`**, pas dans le bundle livré au navigateur ni dans le process Node de
production.

> ⚠️ **`brace-expansion` ne fait PAS partie de cette liste côté backend** — classement corrigé après
> vérification de la chaîne réelle. Il y est en **production** via `exceljs` (cf. §2). Le même nom de
> paquet peut être outillage dans un projet et production dans l'autre : **vérifier la chaîne
> (`exceljs → archiver → … → brace-expansion`) plutôt que de se fier au nom.**

Le risque associé n'est donc pas « un attaquant exploite l'app » mais « la chaîne de build est
compromise ». C'est réel, mais d'une autre nature : il se traite par l'hygiène du CI (lockfile
committé, `npm ci` et non `npm install`, actions GitHub épinglées), pas par une course au patch.

**À ne PAS faire** : `npm audit fix --force`. Il ferait passer `exceljs` en 3.x (rupture des
exports) et pourrait tenter une majeure sur `react-router` pour une CVE qui ne nous concerne pas.

---

## 5. Reste de 1.4 — non couvert par cette revue

Ce chantier ne se limite pas au SCA. Restent :

- **Rotation documentée des secrets** — la procédure existe partiellement (`RECU_LINK_SECRET`
  distinct de `JWT_ACCESS_SECRET` permet de révoquer les liens publics sans casser les sessions,
  cf. `RUNBOOK_incidents.md`). À formaliser pour les 21 variables Railway : qui, quand, comment,
  et l'effet de chaque rotation.
- **Revue externe légère (pen-test)** — sur les trois surfaces qui portent le risque : flux
  d'authentification (rotation des refresh tokens, détection de réutilisation), **liens publics
  signés** (HMAC sans expiration, cf. l'invalidation à la lecture), et **isolation multi-tenant**
  (le cœur du produit). L'audit initial était interne ; une revue indépendante avant ouverture
  publique reste la recommandation.

---

## 6. Réexécution

```bash
cd backend  && npm audit
cd frontend && npm audit
```

Le chiffre brut remontera : c'est normal, il compte l'outillage. **Refaire le tri du §1 avant de
conclure** — le nombre d'alertes n'est pas une mesure de risque.

---

## 7. Réaudit backend du 2026-09-13 — montée de Fastify 5.12.4

`npm audit --omit=dev` (backend) : **13 alertes (5 High, 8 Moderate, 0 critique)**. Les correctifs de la PR
#120 tenaient, mais de **nouveaux avis** ont été publiés sur les mêmes paquets. Tri selon le §1 :

| Paquet | Gravité | Chemin | Décision |
|---|---|---|---|
| `fastify` ≤ 5.12.0 | 🟠 Moderate ×2 | **Production** — contournement de validation de schéma par coercition d'un primitif racine ; usurpation `X-Forwarded-*` avec `trustProxy` en nombre de sauts (nous utilisons `trustProxy: true`, mais c'est le code qui calcule l'IP du rate-limit) | ✅ **CORRIGÉ** — `fastify` 5.12.0 → **5.12.4** (`^5.12.4` dans `package.json`). |
| `fast-uri` 3.1.5 / 4.1.2 | 🔴 High | **Production** — via `ajv` (validation de toutes les routes) et `fast-json-stringify` : confusion d'hôte et SSRF par normalisation d'URI. Exploitabilité faible (aucun schéma ne valide d'URI fournie par l'utilisateur), mais code exécuté à chaque requête | ✅ **CORRIGÉ** — **deux emplacements** : racine 3.1.5 → **3.1.7**, `fastify/node_modules/fast-uri` 4.1.2 → **4.1.4**. `find-my-way` monté au passage 9.8.0 → **9.9.0**. |
| `undici` 6.27.0 | 🟠 Moderate | **Production** — client HTTP de `@vercel/blob` (téléversement/lecture des documents) : désynchronisation via l'intercepteur de réessai, injection CRLF par le `type` d'un corps blob, injection d'attributs de cookie | ✅ **CORRIGÉ** — `npm update undici` : 6.27.0 → **6.28.1** (dans la plage de `@vercel/blob`, `package.json` inchangé ; un seul exemplaire installé). Exposition faible de toute façon : requêtes vers l'API Blob, corps et en-têtes construits par le serveur, sans cookie. ⚠️ Le client Blob est **mocké** dans les tests : l'aller-retour réel ne se vérifie qu'en production. |
| `hono`, `@hono/node-server`, `valibot` | 🟠 Moderate | `prisma` → `@prisma/dev` : serveur `prisma dev` (Postgres local de développement), **jamais lancé** en production — seul `prisma migrate deploy` s'exécute au démarrage | **Sans objet en exécution.** Le « correctif » npm est un **downgrade** `prisma` 7 → 6.19 (cassant) : écarté. Suivre les versions de `prisma`. |
| `mysql2`, `deepmerge-ts` | 🔴 High | `prisma` (pilote MySQL embarqué par le CLI ; `@prisma/config`) — la base est **PostgreSQL**, le pilote MySQL n'est jamais chargé ; `deepmerge-ts` ne fusionne que la configuration Prisma du dépôt | **Sans objet.** Même faux correctif (downgrade `prisma` 6.19) : écarté. |
| `uuid` < 11.1.1 | 🟠 Moderate | `exceljs` | **Sans objet**, déjà tranché au §3 (API `uuid` non utilisée ; le correctif npm rétrograde `exceljs`). |

**Contrôle de l'effet** (le §2 l'exige) : versions relues dans `node_modules` puis `npm audit --omit=dev` —
les avis `fastify` et `fast-uri` ont **disparu** ; puis `undici` (PR suivante). **Restent 6 paquets, tous hors exécution ou déjà écartés** (chaîne `prisma`, `uuid` via `exceljs`). Build, 969 tests unitaires
et **74 tests d'intégration** (11 fichiers, base jetable) au vert : la montée touche le routeur et la validation
ajv, les mocks n'auraient rien prouvé.

## 8. Montée Prisma 7.8 → 7.10 (2026-09-19) — et pourquoi pas Prisma 8

`prisma`, `@prisma/client` et `@prisma/adapter-pg` passent de 7.8.0 à **7.10.0**, la dernière version
**stable**. Prisma 8 n'existe qu'en release candidate : le dist-tag npm `latest` pointait sur
`8.0.0-rc.15`, publiée quatre jours plus tôt, et aucune 8.0.0 finale n'est parue. Une RC ne va pas en
production sur la couche qui porte l'isolation des tenants (extension `$extends`, adaptateur `pg`) d'un
produit financier. **À rouvrir quand 8.0.0 sortira en version finale**, avec la même preuve qu'ici — le workflow `.github/workflows/veille-prisma-8.yml` interroge le registre npm chaque lundi (plage `>=8.0.0`, qui exclut les release candidates) et ouvre UNE issue le jour de la sortie finale.

**Effet** : la chaîne `@prisma/dev` disparaît du CLI, et avec elle `hono`, `@hono/node-server` et
`valibot`. `npm audit` passe de 14 à **10 avis**, tous déjà classés hors exécution ci-dessus :
`mysql2`, `deepmerge-ts`, `@prisma/config` et `prisma` pour la chaîne CLI ; `uuid` via `exceljs` ;
l'outillage de test. En contrepartie, le CLI embarque désormais les dépendances de Prisma Studio (`d3`,
`@visx`, `elkjs`). C'est du poids d'installation, pas du code exécuté par le serveur.

**Preuve** : `prisma generate` 7.10.0, puis `migrate deploy` sur une base jetable, sans migration en
attente. Build OK. **Suite complète au vert (140 fichiers, 1 248 tests), intégration comprise** :
isolation tenant fail-closed, `findUnique` + `select`, purge, contraintes de reçus. C'est elle qui
couvre l'extension Prisma ; les mocks n'auraient rien prouvé.
