# CLAUDE.md — NKONI

Gestion des cotisations & transparence financière pour associations, familles élargies et
tontines. **SaaS multi-tenant** : chaque organisation cliente a son espace isolé.

Spécifications : `NKONI_Spec_Technique_Dev.md` (mono-tenant d'origine) et
`NKONI_SaaS_Spec_Technique_v1.md` (évolution SaaS). Le code référence ces specs par section
(`§2.2`, `§3.1`, …) — garder cette convention dans les commentaires et commits.

## Structure & stack
- `backend/` — Node 20 + Fastify 5 + Prisma 7 (générateur `prisma-client`, adapter `@prisma/adapter-pg`) + PostgreSQL. TypeScript, tests Vitest.
- `frontend/` — Vite + React + React Router + Tailwind v4. Design system **« Menthe & Encre »** (fintech, dark-only ; tokens oklch **centralisés dans `src/index.css`**, primitives dans `src/components/ui/`). Accent principal **menthe** (jeton `--brass`), or discret en secondaire (`--amber`), rouge/bleu pour les statuts ; fontes **Geist** (UI/titres, Fraunces retiré) + **IBM Plex Mono** pour les montants/données via la classe `.num`. Focus clavier : **un anneau menthe unique** (`:focus-visible` global). CTA primaire = dégradé diagonal émeraude → or. Un thème = édition des VALEURS de jetons (les noms restent stables : `--brass`, `--jade`, `--amber`… gardent leur rôle même après changement de teinte).

## Commandes
Backend (`cd backend`) :
- `npm run build` — `tsc` (pas de lint séparé côté backend ; le build EST le garde-fou de typage)
- `npm run test -- --run` — Vitest en one-shot. Un seul fichier : `npm run test -- --run tests/membres.route.test.ts` ; un seul cas : ajouter `-t "libellé du test"`.
  - Deux familles de tests : `*.route.test.ts` / `*.service.test.ts` s'exécutent sur **mocks Prisma** (`buildApp({ prisma: mock })` + `app.inject`, aucune DB requise) ; les 3 `*.integration.test.ts` frappent une **vraie Postgres** (`DATABASE_URL` local) et exigent `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` dans `.env` — sans eux, les lancer via `npm run test` les fait échouer (les exclure : `--exclude '**/*.integration.test.ts'`).
- `npm run dev` — serveur tsx watch
- `npx prisma migrate dev` — crée/applique une migration en local (DB `postgresql://nelson@localhost:5432/nkoni`)
- `npm run seed` / `npm run seed:superadmin` — amorçage ADMIN de test / bootstrap SUPER_ADMIN (env `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`)

Frontend (`cd frontend`) :
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — `oxlint` (doit être clean : 0 finding)
- `npm run test` — **Vitest** one-shot. Deux familles : `*.test.ts` en env **`node`** (client HTTP : refresh-on-401, dédup, déconnexion ; helpers purs) et `*.test.tsx` en env **`jsdom`** (composants React, ex. `DatePicker` en portail) — l'env jsdom est choisi **par fichier** via le docblock `// @vitest-environment jsdom` en tête. `tsconfig.app` **exclut** `*.test.{ts,tsx}` du build ; config `vitest.config.ts` (plugin React pour le JSX, alias `@`).
- `npm run dev` — Vite

Toujours vérifier **build + test** (backend) ou **build + lint (+ test si le client HTTP est touché)** (frontend) avant de présenter un résultat.

## Architecture — points essentiels

**Isolation multi-tenant (SaaS §2.2)** — défense en profondeur, `backend/src/lib/` :
- `org-context.ts` : `AsyncLocalStorage` portant l'`organisationId` de la requête. `runUnscoped()` = bypass DÉLIBÉRÉ pour les flux sans org (login/refresh/système/seed/super-admin).
- `tenant-extension.ts` : extension Prisma `$extends` qui injecte `organisationId` sur les 22 `SCOPED_MODELS`. **Fail-closed** : sur un modèle scopé sans contexte org valide → lève `TenantContextError`. Mutation cross-org → `P2025` (→ 404, pas de fuite d'existence).
- `Organisation` n'est **PAS** un modèle scopé (les routes plateforme la lisent sans contexte).
- Ordre des extensions (`lib/prisma.ts`) : audit puis tenant (tenant outermost → scope/fail-close AVANT l'audit).

**Rôles & permissions** — `backend/src/middlewares/permissions.ts` :
- Matrice `PERMISSIONS[entité][rôle]` + `requirePermission(entité, action)`. Miroir front dans `frontend/src/lib/roles.ts`.
- Entité `Organisation` (paramètres de l'org, **lecture seule**) : ouverte à tous les rôles d'organisation **sauf** MEMBRE_SIMPLE (le quota relève de la gestion). `GET /organisations/moi` (scopé, self-service) renvoie nom/devise/langue défaut/date + **nb de membres ACTIFS vs limite forfait gratuit (100)** ; écran `/parametres` (lecture seule, ces paramètres sont **immuables** §5). Le SUPER_ADMIN reste hors matrice → 403.
- `authenticate` (hook JWT) peuple `req.user` et appelle `orgContext.setOrganisation(req.user.organisationId)`.
- **SUPER_ADMIN** (rôle plateforme transverse, §2.3) : `organisationId` NULL (invariant CHECK en base), **absent de la matrice** → 403 sur toute route tenant. Ses seules routes : `/platform/*` (garde `requireSuperAdmin`). Voir la mémoire `nkoni-super-admin`.

**Auth (§4.5)** — JWT access (Bearer, en mémoire côté front) + refresh (cookie httpOnly, namespace `@fastify/jwt` séparé). Émission factorisée dans `lib/session.ts` (partagée login + auto-inscription). argon2 pour les mots de passe.

**Audit trail (V2 §5)** — `lib/audit-middleware.ts`, extension Prisma, 6 entités. Best-effort (n'échoue jamais l'op métier), `passwordHash` toujours exclu, sauté pour les écritures non scopées (`runUnscoped`).

**Scheduler notifications** — `services/notification-scheduler.ts` : `node-cron` **in-process** (03:00 Africa/Douala, un seul process Railway long-vivant). Génère les `COTISATION_RETARD` en **bouclant org par org**, chaque itération enveloppée dans `orgContext.run({ organisationId })` (jamais un `runUnscoped` global qui mélangerait les tenants). Cœur métier découplé du cron (`anneeCourante` + `now` injectés) → testable sans horloge réelle.

**Internationalisation FR/EN (§4)** — interface + messages serveur + notifications + **formats** dates/montants intégralement traduits (lots F1–F6 mergés sur `main`). Préférence de langue **par utilisateur** (`Utilisateur.langue Langue?`, nullable ; indépendante de `Organisation.langueDefaut`), fixée via `PATCH /auth/me/langue` (self-service, réémet un access token portant la langue).
- **Catalogues = fragments par namespace, agrégés par un index, parité vérifiée à la compilation** (même recette des 2 côtés) :
  - Backend `backend/src/locales/{fr,en}/<domaine>.ts` (chacun `export const messages = {…}`), agrégés par `index.ts` ; `en/index` typé `Messages` (dérivé de FR). Clés **plates** `<domaine>.<message>`, interpolation `{nom}`. `t(langue, clé, params?)` dans `lib/i18n.ts`.
  - Frontend `frontend/src/locales/{fr,en}/<ns>.ts` (chacun `export default { <ns>: { … } }`, clés **imbriquées**), agrégés par `index.ts` ; `en/index` typé `Catalogue`. `react-i18next` (namespace unique `translation`), interpolation `{{var}}`, pluriels `_one`/`_other`.
  - **Ajouter un namespace = créer un fragment `fr/<x>` + `en/<x>` et l'importer/spreader dans les DEUX `index.ts`.** Namespaces disjoints → un fragment par module, jamais d'écriture partagée (ce qui a permis de paralléliser les lots). Ne PAS traduire dans un fichier partagé sans le signaler.
- **Langue effective** (`langueEffective(user)` dans `auth.service.ts`) : `Utilisateur.langue` **sinon** `organisation.langueDefaut` (un nouvel utilisateur hérite du défaut de son org, cohérent avec l'inscription ; null seulement pour le SUPER_ADMIN sans org). Elle est **résolue à l'émission du token** (`session.ts`) et portée par l'access token — et renvoyée par `/auth/me`, login, inscription. `langueDeRequete(req)` résout : `req.user.langue` (du token) → en-tête `Accept-Language` → FR. Sans `req` sous la main, passer `reply.request`.
- **Traduction des erreurs = à la frontière HTTP, par TYPE d'erreur** : les services restent **i18n-agnostiques** (ils lèvent des erreurs typées portant les *données* — ex. `EmailDejaUtiliseError.email` — jamais la langue) ; la route mappe `err instanceof XError → t(langue, 'clé', { …données })`. Ne PAS renvoyer `err.message` (français figé) au client.
- **Notifications in-app** (`notification.service.ts` / `notification-scheduler.ts`) : rendues dans la langue du **DESTINATAIRE** (le membre concerné), jamais de l'acteur qui déclenche l'action — `resoudreLangueDestinataire(prisma, destinataireId)` = langue perso ↩ défaut org ↩ FR. Namespace `notifications.*`.
- **Frontend runtime** : codes backend `FR`/`EN` ↔ i18next `fr`/`en` via `versI18n`/`versBackend` (`lib/i18n.ts`). La préférence serveur est appliquée par `AuthContext` (`appliquerLangue`) au login/inscription/réhydratation et **prime** sur le `localStorage` (repli hors-ligne : navigateur → FR). Sélecteur dans **Mon profil**. Convention composant : `const { t } = useTranslation()`, libellés résolus dans le composant (pas de map de libellés figés au niveau module).
- **Formats locale-aware (§4/§5, lot F6 — FAIT)** : dates et montants suivent la locale/devise, plus de `fr-FR`/FCFA en dur.
  - **Montants** : `formatMontant()` (`frontend/src/lib/format.ts` ; miroir backend dans `lib/i18n.ts` pour les notifications) rend `Intl.NumberFormat({ style:'currency' })` dans la LANGUE d'interface + la DEVISE de l'org. `FCFA` n'étant pas un code ISO 4217, il est mappé sur **`XAF`** (dont `Intl` restitue justement « FCFA » en fr) — sans ce mappage, `Intl` lèverait `RangeError`. Sans décimales (montants stockés en entiers).
  - **Devise côté front** : `Organisation.devise` descend via `/auth/me` + login + inscription (`AuthUser.devise`) et est appliquée par `AuthContext` (`appliquerDevise`, miroir de `appliquerLangue`) au login/inscription/réhydratation ; défaut FCFA, réinitialisée au logout. Côté backend, une notif est rendue dans la devise du DESTINATAIRE (`resoudreDeviseDestinataire`, comme la langue).
  - **Dates** : `formatDate()`/`formatDateHeure()` (`lib/utils.ts`) formatent selon la langue courante (i18next) ; les composants passent leurs options ponctuelles (numérique court, mois long…).
- **Hors périmètre** : le contenu saisi par les utilisateurs (texte d'une Résolution, nom d'un Membre…) n'est JAMAIS traduit. Reste du code mort : `lib/roles.ts` garde des libellés FR (rendus via `t()` dans les composants).
- **Gotcha migration** : après `prisma migrate dev`, **relancer `npx prisma generate`** — le client généré (`src/generated/`, gitignoré) peut rester obsolète et faire échouer les tests d'intégration réels (« Unknown field ») alors que le build TS passe.

**Frontend — architecture applicative** (`frontend/src/`) :
- **Routing** (`App.tsx`) : `react-router-dom` déclaratif. Trois zones : pages publiques (`/`, `/login`, `/inscription`), console **plateforme** `/super-admin` (garde `SuperAdminRoute`, layout autonome **hors** `AppShell`), et pages tenant sous `<ProtectedLayout>` = `ProtectedRoute` (garde d'auth) + `AppShell` (coquille + nav) via `<Outlet/>`. **Routes statiques déclarées avant les paramétrées** (`/membres/nouveau` avant `/membres/:id`).
- **Session** (`contexts/AuthContext.tsx` + `auth-context.ts`) : l'access token vit **uniquement en mémoire React** (jamais en `localStorage`). La persistance entre reloads repose sur le cookie httpOnly du refresh — au montage, `AuthContext` tente un `/auth/refresh` silencieux puis `/auth/me` pour réhydrater `user`. `useAuth()` expose `login`/`inscription`/`logout`/`changerLangue` + `user`/`accessToken`/`isAuthenticated`/`loading`. Il applique la langue (`appliquerLangue`, §4) **et la devise** (`appliquerDevise`, §5/F6) du serveur, enregistre le **pont d'auth** du client HTTP (`configurerAuthBridge` : token rafraîchi ↔ setState, session expirée ↔ logout) et arme le refresh proactif.
- **Client HTTP** (`lib/api.ts`) : `fetch` minimal, **`credentials: 'include'` obligatoire** (envoi du cookie refresh). Le token est passé explicitement en `Bearer` par appel. **Refresh-on-401** : au 1er 401 d'une requête authentifiée, `request()` appelle `/auth/refresh` (**dédupliqué** — une seule promesse en vol pour N requêtes concurrentes), remplace le token (`onTokenRefreshed` → `AuthContext`) et **rejoue la requête UNE fois** (`permettreRetry` anti-boucle) ; si le refresh échoue → `onSessionExpired` vide la session → `ProtectedRoute` redirige vers `/login`. `AuthContext` arme aussi un **refresh proactif** ~60 s avant l'expiration de l'access token (TTL 15 min). `ApiError` porte le statut HTTP ; `messageErreur(e)` distingue réponse d'erreur serveur vs rejet `fetch` (réseau/CORS). Base : `VITE_API_URL` (défaut `http://localhost:3000`) — en prod, proxy same-origin Vercel (`/api/*`).
- **Pages & data-fetching** : une page par écran dans `pages/` (liste/détail/formulaire par entité). Chargement de données **dans la page** (`useState`/`useEffect` + fonctions de `api.ts`) ; peu de hooks partagés (`hooks/useDashboard.ts`). Miroir des permissions dans `lib/roles.ts` pour masquer/afficher les actions selon le rôle (source de vérité = matrice backend).
- **Popovers/overlays ancrés à un déclencheur** (calendrier `DatePicker`, futurs menus…) : **rendus en portail** (`createPortal` dans `<body>`) + `position: fixed` calculée depuis le `getBoundingClientRect()` du déclencheur (recalcul au scroll capture + resize). **Raison structurelle** : `nk-reveal` anime en `forwards` → laisse un `transform` résiduel → chaque bloc animé devient un **contexte d'empilement** ; un popover simplement `absolute` (même `z-40`) reste piégé dans son bloc parent et se fait **recouvrir** par le bloc frère suivant (autre `nk-reveal`/transform/z-index) → illisible ET non cliquable (bugs vécus `/audit` puis `/fonctions`). Le portail l'immunise structurellement. Patron à copier : `components/ui/DatePicker.tsx` (`popoverRef`, `positionner()`, `useLayoutEffect` scroll/resize, clic-extérieur épargnant le portail, `focus({preventScroll})`). Échelle z : contenu/nav `z-40` · popover portail & `Modal` `z-50` · `Toast`/`CommandPalette` `z-[100]`. **Ne PAS** rustiner ce type de recouvrement au cas par cas avec des `z-index` sur les cartes. Tests composant sous **jsdom** (`*.test.tsx`, env via docblock `// @vitest-environment jsdom` ; les `*.test.ts` restent en env `node`).

## Conventions
- **Français** partout : noms de fonctions métier, commentaires, messages d'erreur, commits.
- **Branches de feature** (`feat/...`), jamais de commit direct sur `main`. Merge `--no-ff`. Le PO exécute lui-même les commandes prod ; guider et vérifier.
- **Migrations réversibles** : une valeur d'enum Postgres ne peut pas être utilisée dans la transaction qui l'ajoute → séparer `ADD VALUE` et son usage (CHECK/backfill) en deux migrations.
- `backend/src/generated/` est **gitignoré** (régénéré au déploiement via `postinstall: prisma generate`).
- Nouveau flux sans requête HTTP (script, scheduler, seed) → l'envelopper dans `orgContext.run({ organisationId })` ou `runUnscoped()`, sinon fail-close.

## Déploiement
- **Backend → Railway** : `startCommand = npx prisma migrate deploy && npm run start` (migrations auto-appliquées au déploiement). `DATABASE_URL` = référence `${{ Postgres.DATABASE_URL }}`. `$PORT` injecté.
- **Frontend → Vercel** : racine projet = `frontend/`. `vercel.json` proxifie `/api/*` vers le backend Railway (**same-origin** → le cookie refresh fonctionne) + fallback SPA. Prod : `nkoni.vercel.app`.
- Variables backend : `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `CORS_ORIGIN` (liste séparée par virgules), `REFRESH_COOKIE_NAME`/`_PATH`, `BLOB_READ_WRITE_TOKEN`, `NODE_ENV`.

## Docs de référence (racine repo & sous-dossiers)
- `RUNBOOK_bascule_prod_PhaseD.md` — procédure pas-à-pas (PO) de bascule prod multi-tenant : ordre des migrations SaaS, backfill, passage NOT NULL, rollback par dump.
- `docs/deploiement-auth.md` — détails déploiement du flux auth (JWT + cookie refresh same-origin).
- `frontend/MAINTENANCE.md` — activer/désactiver la page de maintenance via un `redirect` Vercel (config seule, ne touche pas `src/` ni le proxy `/api/*`).
