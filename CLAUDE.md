# CLAUDE.md — NKONI

Gestion des cotisations & transparence financière pour associations, familles élargies et
tontines. **SaaS multi-tenant** : chaque organisation cliente a son espace isolé.

Spécifications : `NKONI_Spec_Technique_Dev.md` (mono-tenant d'origine) et
`NKONI_SaaS_Spec_Technique_v1.md` (évolution SaaS). Le code référence ces specs par section
(`§2.2`, `§3.1`, …) — garder cette convention dans les commentaires et commits.

## Structure & stack
- `backend/` — Node 20 + Fastify 5 + Prisma 7 (générateur `prisma-client`, adapter `@prisma/adapter-pg`) + PostgreSQL. TypeScript, tests Vitest.
- `frontend/` — Vite + React + React Router + Tailwind v4. Design system « Laiton & Jade » (tokens oklch, primitives dans `src/components/ui/`, fontes Fraunces + Geist).

## Commandes
Backend (`cd backend`) :
- `npm run build` — `tsc` (pas de lint séparé côté backend ; le build EST le garde-fou de typage)
- `npm run test -- --run` — Vitest en one-shot (mocks Prisma ; `buildApp({ prisma: mock })` + `app.inject`)
- `npm run dev` — serveur tsx watch
- `npx prisma migrate dev` — crée/applique une migration en local (DB `postgresql://nelson@localhost:5432/nkoni`)
- `npm run seed` / `npm run seed:superadmin` — amorçage ADMIN de test / bootstrap SUPER_ADMIN (env `SUPERADMIN_EMAIL`/`SUPERADMIN_PASSWORD`)

Frontend (`cd frontend`) :
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — `oxlint` (doit être clean : 0 finding)
- `npm run dev` — Vite

Toujours vérifier **build + test** (backend) ou **build + lint** (frontend) avant de présenter un résultat.

## Architecture — points essentiels

**Isolation multi-tenant (SaaS §2.2)** — défense en profondeur, `backend/src/lib/` :
- `org-context.ts` : `AsyncLocalStorage` portant l'`organisationId` de la requête. `runUnscoped()` = bypass DÉLIBÉRÉ pour les flux sans org (login/refresh/système/seed/super-admin).
- `tenant-extension.ts` : extension Prisma `$extends` qui injecte `organisationId` sur les 22 `SCOPED_MODELS`. **Fail-closed** : sur un modèle scopé sans contexte org valide → lève `TenantContextError`. Mutation cross-org → `P2025` (→ 404, pas de fuite d'existence).
- `Organisation` n'est **PAS** un modèle scopé (les routes plateforme la lisent sans contexte).
- Ordre des extensions (`lib/prisma.ts`) : audit puis tenant (tenant outermost → scope/fail-close AVANT l'audit).

**Rôles & permissions** — `backend/src/middlewares/permissions.ts` :
- Matrice `PERMISSIONS[entité][rôle]` + `requirePermission(entité, action)`. Miroir front dans `frontend/src/lib/roles.ts`.
- `authenticate` (hook JWT) peuple `req.user` et appelle `orgContext.setOrganisation(req.user.organisationId)`.
- **SUPER_ADMIN** (rôle plateforme transverse, §2.3) : `organisationId` NULL (invariant CHECK en base), **absent de la matrice** → 403 sur toute route tenant. Ses seules routes : `/platform/*` (garde `requireSuperAdmin`). Voir la mémoire `nkoni-super-admin`.

**Auth (§4.5)** — JWT access (Bearer, en mémoire côté front) + refresh (cookie httpOnly, namespace `@fastify/jwt` séparé). Émission factorisée dans `lib/session.ts` (partagée login + auto-inscription). argon2 pour les mots de passe.

**Audit trail (V2 §5)** — `lib/audit-middleware.ts`, extension Prisma, 6 entités. Best-effort (n'échoue jamais l'op métier), `passwordHash` toujours exclu, sauté pour les écritures non scopées (`runUnscoped`).

**Scheduler notifications** — `services/notification-scheduler.ts` : `node-cron` **in-process** (03:00 Africa/Douala, un seul process Railway long-vivant). Génère les `COTISATION_RETARD` en **bouclant org par org**, chaque itération enveloppée dans `orgContext.run({ organisationId })` (jamais un `runUnscoped` global qui mélangerait les tenants). Cœur métier découplé du cron (`anneeCourante` + `now` injectés) → testable sans horloge réelle.

**Internationalisation FR/EN (§4)** — chantier `feat/i18n` (interface + messages serveur + notifications intégralement traduits ; reste les **formats** dates/montants, lot F6 à venir). Préférence de langue **par utilisateur** (`Utilisateur.langue Langue?`, nullable ; indépendante de `Organisation.langueDefaut`), fixée via `PATCH /auth/me/langue` (self-service, réémet un access token portant la langue).
- **Catalogues = fragments par namespace, agrégés par un index, parité vérifiée à la compilation** (même recette des 2 côtés) :
  - Backend `backend/src/locales/{fr,en}/<domaine>.ts` (chacun `export const messages = {…}`), agrégés par `index.ts` ; `en/index` typé `Messages` (dérivé de FR). Clés **plates** `<domaine>.<message>`, interpolation `{nom}`. `t(langue, clé, params?)` dans `lib/i18n.ts`.
  - Frontend `frontend/src/locales/{fr,en}/<ns>.ts` (chacun `export default { <ns>: { … } }`, clés **imbriquées**), agrégés par `index.ts` ; `en/index` typé `Catalogue`. `react-i18next` (namespace unique `translation`), interpolation `{{var}}`, pluriels `_one`/`_other`.
  - **Ajouter un namespace = créer un fragment `fr/<x>` + `en/<x>` et l'importer/spreader dans les DEUX `index.ts`.** Namespaces disjoints → un fragment par module, jamais d'écriture partagée (ce qui a permis de paralléliser les lots). Ne PAS traduire dans un fichier partagé sans le signaler.
- **Langue effective** (`langueEffective(user)` dans `auth.service.ts`) : `Utilisateur.langue` **sinon** `organisation.langueDefaut` (un nouvel utilisateur hérite du défaut de son org, cohérent avec l'inscription ; null seulement pour le SUPER_ADMIN sans org). Elle est **résolue à l'émission du token** (`session.ts`) et portée par l'access token — et renvoyée par `/auth/me`, login, inscription. `langueDeRequete(req)` résout : `req.user.langue` (du token) → en-tête `Accept-Language` → FR. Sans `req` sous la main, passer `reply.request`.
- **Traduction des erreurs = à la frontière HTTP, par TYPE d'erreur** : les services restent **i18n-agnostiques** (ils lèvent des erreurs typées portant les *données* — ex. `EmailDejaUtiliseError.email` — jamais la langue) ; la route mappe `err instanceof XError → t(langue, 'clé', { …données })`. Ne PAS renvoyer `err.message` (français figé) au client.
- **Notifications in-app** (`notification.service.ts` / `notification-scheduler.ts`) : rendues dans la langue du **DESTINATAIRE** (le membre concerné), jamais de l'acteur qui déclenche l'action — `resoudreLangueDestinataire(prisma, destinataireId)` = langue perso ↩ défaut org ↩ FR. Namespace `notifications.*`.
- **Frontend runtime** : codes backend `FR`/`EN` ↔ i18next `fr`/`en` via `versI18n`/`versBackend` (`lib/i18n.ts`). La préférence serveur est appliquée par `AuthContext` (`appliquerLangue`) au login/inscription/réhydratation et **prime** sur le `localStorage` (repli hors-ligne : navigateur → FR). Sélecteur dans **Mon profil**. Convention composant : `const { t } = useTranslation()`, libellés résolus dans le composant (pas de map de libellés figés au niveau module).
- **Hors périmètre** : le contenu saisi par les utilisateurs (texte d'une Résolution, nom d'un Membre…) n'est JAMAIS traduit. **Pas encore fait (F6)** : formats dates/montants sensibles à la locale/devise — `frontend/src/lib/format.ts`/`utils.ts` codent encore `fr-FR` + FCFA en dur, et `lib/roles.ts` garde des libellés FR (code mort, rendus via `t()`).
- **Gotcha migration** : après `prisma migrate dev`, **relancer `npx prisma generate`** — le client généré (`src/generated/`, gitignoré) peut rester obsolète et faire échouer les tests d'intégration réels (« Unknown field ») alors que le build TS passe.

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
