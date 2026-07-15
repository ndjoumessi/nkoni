# Audit NKONI — UI/UX · Sécurité · Architecture

_Audit en lecture seule réalisé avec Claude Fable 5 (3 agents spécialisés, revue ligne à ligne du dépôt). Aucun fichier applicatif modifié._

Date : 2026-07-15 · Périmètre : `backend/src` (lib, middlewares, routes, services, locales), `backend/prisma` (schéma + 24 migrations), `frontend/src` (pages, composants, contexts, lib, locales, PWA), configs de déploiement, tests.

---

## Verdict d'ensemble

NKONI est un projet d'une **maturité inhabituelle pour sa taille**. L'isolation multi-tenant, l'idempotence hors-ligne, les liens publics signés et l'i18n à parité vérifiée à la compilation sont **au-dessus du standard**. Aucune faille critique n'a été trouvée en sécurité (pas de fuite cross-tenant, pas de bypass d'authentification, pas d'injection SQL, pas de secret en dur).

Les risques réels ne sont pas dans ce qui est écrit mais dans **ce qui manque autour** : pas de CI pour garder les invariants, deux défauts « fail-open » dans le mécanisme d'isolation le jour où on l'étend, une couche financière dont l'invariant central vit dans les routes sans réconciliation, et un durcissement périmétrique absent (rate limiting, en-têtes de sécurité, révocation de session). Côté UI, une base excellente entachée d'un bug structurel (Modal non portalisée) et d'incohérences d'accessibilité sur quelques overlays.

**Note synthétique par axe :** UI/UX **B+** · Sécurité **B+** · Architecture **A−** (le socle) mais **C sur l'outillage d'équipe** (CI/observabilité).

---

## Priorités transverses (à traiter en premier)

Ces points reviennent dans plusieurs audits ou portent le plus fort impact.

| # | Sujet | Axe(s) | Sévérité | Effort |
|---|-------|--------|----------|--------|
| P1 | Deux « fail-open » dans l'extension d'isolation (allowlist `SCOPED_MODELS` + opérations non couvertes) | Archi / Sécu | 🔴 | Faible |
| P2 | Aucune CI — les invariants critiques ne sont testés que si on y pense | Archi | 🔴 | Faible (~1 j) |
| P3 | Aucun rate limiting ni en-têtes de sécurité (brute-force `/auth`, DoS argon2/PDF) | Sécu / Archi | 🟠 | Faible |
| P4 | Injection de formule CSV/Excel (noms saisis par les utilisateurs) | Sécu | 🟠 | Faible |
| P5 | `Modal` non rendue en portail → cassée sous un bloc animé `nk-reveal` | UI/UX | 🔴 | Très faible |
| P6 | Refresh tokens sans rotation ni révocation (logout/reset n'invalident rien) | Sécu / Archi | 🟠 | Moyen |
| P7 | Logique financière dans les routes + compteurs dénormalisés sans réconciliation + reçus orphelins | Archi | 🟠 | Moyen |
| P8 | États d'erreur dupliqués (10 pages) + 3 overlays `aria-modal` sans piège de focus | UI/UX | 🟠 | Faible |

---

## 1. Sécurité

**Verdict :** architecture de sécurité remarquablement défensive. Aucune faille critique. Les faiblesses sont des manques de durcissement périmétrique + une injection CSV.

### 🟠 Élevé

**E1 — Aucun rate limiting / anti-brute-force sur les endpoints publics.**
`app.ts` (aucun `@fastify/rate-limit`) ; `POST /auth/login`, `POST /organisations/inscription`, `POST /auth/refresh`, `POST /auth/changer-mot-de-passe`, et les routes publiques signées (`/recus/:id/pdf-public`, `/membres/:id/statut-public`). Login illimité → brute-force + **DoS par épuisement CPU argon2** sur un process Railway mono-instance ; inscription → création massive de comptes ; génération PDF/HTML publique non throttlée.
→ `@fastify/rate-limit` global + budgets serrés (5–10 req/min/IP) sur `/auth/*`, inscription et routes publiques ; envisager un CAPTCHA léger à l'inscription.

**E2 — Injection de formule CSV / Excel.**
`frontend/src/pages/SuperAdminPage.tsx:171-175` (`celluleCsv`) et `backend/src/services/export.service.ts:182-195` (`ws.addRow`). L'échappement CSV structurel est présent mais **les préfixes de formule ne sont pas neutralisés** (`= + - @ \t \r`). Un nom de membre/organisation `=HYPERLINK(...)` s'exécute à l'ouverture dans Excel/LibreOffice ; les noms sont saisis par les utilisateurs.
→ Préfixer d'une apostrophe `'` toute cellule texte commençant par `= + - @ \t \r`, côté front (`celluleCsv`) ET back (`export.service.ts`, `export-rapport.service.ts`). Risque nul en PDF.

### 🟡 Moyen

- **M1 — Refresh tokens stateless : aucune révocation, TTL long.** `logout` ne fait que `clearCookie` ; changement/réinitialisation de mot de passe **n'invalide aucune session** ; un refresh volé reste exploitable jusqu'à expiration. → model `Session`/`RefreshToken` stateful (jti + rotation + révocation), ou a minima `passwordChangedAt`/`tokenVersion` vérifié au refresh. _(voir aussi Archi M5)_
- **M2 — Pas d'en-têtes de sécurité (helmet/CSP/HSTS/nosniff/X-Frame-Options)** sur la page HTML publique `statut-public` ni sur les réponses JSON. `esc()` est correct (pas d'XSS directe) mais aucune défense en profondeur ni anti-clickjacking. → `@fastify/helmet` + CSP restrictive.
- **M3 — Pas de `setErrorHandler` custom** : un 500 inattendu renvoie `err.message` (détails Prisma/contraintes) au client. → gestionnaire d'erreur qui journalise en détail mais renvoie un message générique i18n pour les 500.
- **M4 — Upload photo membre validé sur le seul `mimetype` déclaré** (falsifiable), contrairement aux Documents qui vérifient les magic bytes. → réutiliser la validation par signature (`FF D8 FF` / `89 50 4E 47`).
- **M5 — Quota membres contournable par course concurrente (TOCTOU)** : `count()` puis `create()` non atomiques → dépassement possible du plafond GRATUIT. Impact business faible, pas de fuite. → contrainte en base ou transaction sérialisée.

### ⚪ Vigilance

`CORS_ORIGIN` par défaut localhost (vérifier qu'il est posé en prod) · liens signés sans expiration (choix produit assumé, HMAC non forgeable + temps constant) · poser un `RECU_LINK_SECRET` distinct sur Railway · logs propres (aucun secret/`passwordHash`) · bonne défense DoS upload (plafonds multipart + `maxItems`).

### Points forts confirmés
Isolation fail-closed exemplaire · chaque `runUnscoped` légitime · séparation authn/authz nette + SUPER_ADMIN hors matrice · anti-énumération cohérent (login, inscription, 404 uniformes) · Blob privé + proxy authentifié · argon2 + secrets JWT distincts + cookie httpOnly/Secure/SameSite · validation ajv `additionalProperties:false` partout · idempotence P2002 ciblée · audit trail excluant `passwordHash`.

---

## 2. Architecture

**Verdict :** socle exceptionnel (isolation, idempotence, i18n compilée, cœurs métier purs à horloge injectée, liens signés). Les risques sont dans l'outillage d'équipe et deux coutures « fail-open ».

### 🔴 Critique

**C1 — `SCOPED_MODELS` est une allowlist manuelle FAIL-OPEN.**
`tenant-extension.ts:124` : `if (!model || !SCOPED_MODELS.has(model)) return query(args)`. Le fail-closed ne s'applique qu'aux modèles **déjà inscrits**. Ajouter un modèle avec `organisationId` sans l'inscrire → **aucune isolation, aucune erreur**. Aucun test de parité schéma ↔ Set.
→ Test de parité qui parse `schema.prisma` (modèles portant `organisationId`) vs le Set (échec de build si divergence). Idéalement, inverser en denylist (modèles NON scopés) + throw sur modèle inconnu.

**C2 — Passe-plat silencieux pour les opérations non couvertes.**
`tenant-extension.ts:224` : sur un modèle scopé, toute opération hors des ensembles gérés retombe sur `return query(args)` sans scoping. Une nouvelle API Prisma adoptée dans un service contourne l'isolation sans bruit.
→ défaut fail-closed : lever une erreur explicite pour toute opération inconnue sur un modèle scopé.

**C3 — Aucune CI.**
Pas de `.github/workflows`. `build+test`/`build+lint` reposent sur la discipline ; les 6 tests d'intégration (isolation, liens signés…) exigent une Postgres locale → jamais exécutés automatiquement. Bloquant dès le 2ᵉ contributeur.
→ GitHub Actions sur PR : job backend (Postgres service container, build + tests unit **et** intégration), job frontend (`tsc -b`, `oxlint`, vitest). ~1 jour, sécurise tout le reste.

### 🟠 Majeur

- **M1 — Logique financière dans les routes, pas les services.** L'invariant comptable central (`montantVerse`/`montantValorise` ajustés du même delta en transaction) est implémenté 3× dans `versements.route.ts` ; pas de `versement.service.ts`. Idem flux argent cagnottes/amendes. → extraire en services purs.
- **M2 — Compteurs dénormalisés sans réconciliation.** `Contribution.montantVerse/Valorise` entretenus par `increment/decrement` dispersés, sans job de cohérence Σ(`Versement`) vs compteur, sans CHECK — sur un produit dont la promesse est la transparence financière. → tâche d'audit de cohérence + alerte.
- **M3 — Reçus orphelins.** `Recu.versementId` **sans FK** (`schema.prisma:304`) et `DELETE /versements/:id` non gardé → suppression d'un versement dont un reçu numéroté (déjà partagé) a été émis. → FK `onDelete: Restrict` + 409 explicite.
- **M4 — Scheduler « idempotent multi-instance » : faux.** L'anti-spam est un check-then-act non atomique ; à 2 instances au même cron → notifications doublées (aucun UNIQUE `(destinataire,type,jour)`). Aujourd'hui 1 instance Railway, mais faux sentiment de sécurité au scale-out. → `pg_advisory_lock` ou index unique partiel ; corriger le commentaire.
- **M5 — Refresh tokens sans rotation ni révocation.** _(cf. Sécu M1)_ → rotation avec détection de réutilisation (famille de tokens).
- **M6 — Aucun anti-abus ni headers.** _(cf. Sécu E1/M2)_
- **M7 — Observabilité quasi absente.** Pino seul, pas de Sentry, pas de métriques ; l'échec d'écriture d'audit part en `console.error` silencieux. → Sentry back/front + alerte sur échecs d'audit et de scheduler.
- **M8 — Frontend : `api.ts` monolithe (1 939 lignes)** = aimant à conflits ; pages jusqu'à 941 lignes, data-fetching artisanal sans cache ni invalidation. → éclater `api.ts` par domaine (namespaces déjà existants) + TanStack Query au fil de l'eau.

### 🟡 Mineur
Caches Workbox/IndexedDB non purgés au logout (poste partagé) · FK sans index (`contributionId`, `versementId`) · pagination inexistante hors audit (bloquant pour PRO/ENTREPRISE illimités) · dérives doc/code (« 23 modèles » → 26 ; « 3 tests intégration » → 6) · `xlsx@0.18.5` (CVE connues, parse des fichiers utilisateur) · `runUnscoped` = 32 usages encadrés par des commentaires seuls (→ test de parité au niveau source) · migrations sans `down.sql`.

---

## 3. UI/UX

**Verdict :** base très solide — jetons centralisés respectés (quasi aucun oklch en dur hors logo), focus menthe unique, `prefers-reduced-motion` sérieux, graphes avec équivalent chiffré `sr-only`, DatePicker/GrilleAnnees exemplaires (grid ARIA, aria-live, focus roving). **Contrastes WCAG mesurés sur le nouveau fond bleu encre : tous AA avec marge** (`--faint` 6.31:1, `--muted-foreground` 7.91, brass 12.71, CTA 5.15). Problèmes concentrés sur la Modal, la duplication d'états d'erreur et 3 overlays sous le standard a11y du reste de l'app.

### 🔴 Critique

**Modal non rendue en portail → cassée sous un ancêtre `nk-reveal`.**
`components/ui/Modal.tsx:100` (rendu in-place, `fixed inset-0`). `nk-reveal` laisse un `transform` résiduel → l'ancêtre devient le containing block des `fixed` ; les modales « Modifier/Supprimer un versement » (`MembreDetailPage.tsx:497`, `<li overflow-hidden>`) se positionnent par rapport à la Card et sont écrêtées. Les popovers ont été immunisés par portail, pas la Modal.
→ envelopper `Modal` dans `createPortal(…, document.body)` (~3 lignes, aucun changement d'API).

### 🟠 Majeur
- **États d'erreur dupliqués (10 pages)** en `<Card>` inline au lieu de la primitive `ErrorState` — la plupart sans `role="alert"` ni « Réessayer » (contredit CLAUDE.md). → remplacement mécanique par `<ErrorState onRetry>`.
- **CommandPalette (⌘K)** : pattern combobox ARIA absent (pas d'`aria-activedescendant`, sélection flèches invisible aux lecteurs d'écran), `aria-modal` sans piège de focus ni verrou scroll.
- **Drawer mobile** (`AppShell.tsx:374`) : `aria-modal` sans piège de focus (Tab s'échappe) ni verrou du scroll body — réutiliser le mécanisme de `Modal`.
- **DataTable : en-tête « sticky » ne colle jamais** (`overflow-x-auto` ancêtre casse le sticky) — feature morte sur toutes les listes longues.
- **`SelecteurMembreUnique`** : listbox sans navigation aux flèches ni `aria-activedescendant`.
- **Suppression de la photo membre sans confirmation** (action destructive immédiate, bouton affiché même sans photo).

### 🟡 Mineur
`--faint` sur `surface-3` = 4.47:1 (juste sous 4.5 ; monter à ~0.67) · fiche membre = mur de 6 boutons `outline` sans CTA dominant (→ menu « ⋯ ») · `formatPourcent` fige « 50 % » en EN · guillemets « » en dur même en EN · `⌘K` affiché en dur hors macOS · borne N-1 du graphe en fuseau navigateur (≠ Africa/Douala) · GrapheEvolution sans tooltip + libellés X écrêtés · pilules `SegmentFiltre` ~28px (cibles tactiles) · jauge « illimité » 100% jade ambiguë · Toast : bouton fermer ~20px · cache CommandPalette jamais invalidé · `Toggle` pastille `bg-white` en dur · `Button` loading sans `aria-busy`.

### Quick wins UI (fort impact / faible effort)
1. Portaliser `Modal` (`createPortal`) — corrige le 🔴 et immunise tous les usages futurs.
2. Remplacer les 10 cartes d'erreur par `ErrorState` (chercher/remplacer) → `role="alert"` + Réessayer d'un coup.
3. Réutiliser le piège de focus de `Modal` dans le drawer + la CommandPalette (+ verrou `body.overflow`).
4. `--faint` 0.66 → 0.67 (dernier couple limite au-dessus de 4.5:1).
5. `formatPourcent` via `Intl` + `Ctrl K` hors macOS.

---

## Feuille de route consolidée

### Court terme (1–2 semaines — avant toute croissance d'équipe ou de trafic)
1. **CI GitHub Actions** avec Postgres de service → exécute enfin les 6 tests d'intégration à chaque PR (Archi C3, P2).
2. **Fermer les 2 coutures fail-open de l'isolation** : test de parité `schema.prisma` ↔ `SCOPED_MODELS` + défaut fail-closed sur opération inconnue (C1, C2, P1).
3. **`@fastify/rate-limit`** sur `/auth/*` + routes publiques ; **`@fastify/helmet`** (P3).
4. **Neutraliser l'injection de formule CSV/xlsx** front + back (P4).
5. **Portaliser `Modal`** + remplacer les états d'erreur par `ErrorState` (P5, P8).
6. FK `Recu.versementId` (Restrict) + garde DELETE versement (P7/M3) ; purge caches/IndexedDB au logout ; corriger le commentaire trompeur du scheduler ; mettre CLAUDE.md à jour.

### Moyen terme (1–2 mois)
7. Extraire la logique financière vers des services (`versement.service.ts`) + tâche de réconciliation des compteurs (P7/M1-M2).
8. Rotation des refresh tokens avec détection de réutilisation (P6).
9. Sentry back/front + alertes (échecs d'audit, scheduler) (M7).
10. Verrou advisory sur le scheduler + index FK manquants + pagination des listes (prérequis aux forfaits illimités et au scale-out) (M4, m3, m4).
11. Découpage de `api.ts` par domaine, TanStack Query au fil de l'eau, remplacement de `xlsx` (M8).
12. Passe a11y sur les 3 overlays + quick wins UI restants.

---

_Rapport généré à partir de trois audits Fable 5 indépendants (UI/UX, sécurité, architecture). Les emplacements `fichier:ligne` renvoient à l'état du dépôt au 2026-07-15._
