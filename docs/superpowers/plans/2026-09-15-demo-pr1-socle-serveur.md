# Espace de démonstration — PR 1 « Socle serveur » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Poser tout ce qui rend une organisation de démonstration SÛRE côté serveur — marqueur `estDemo`, jeton de démo en lecture seule, émission publique de session, refus de connexion normale, tâches de fond qui l'ignorent, console qui ne la compte ni ne la modifie — sans rien de visible tant qu'aucune organisation de démo n'existe et que `DEMO_ACTIVEE` est éteint.

**Architecture:** Un booléen `Organisation.estDemo` marque l'espace fictif. `POST /demo/session` (public, limité en débit, 404 si `DEMO_ACTIVEE` ≠ `true`) signe un access token portant le claim `demo: true`, sans cookie de refresh. Le hook `authenticate`, par lequel passent toutes les routes tenant, refuse (403) toute méthode autre que GET/HEAD pour un jeton `demo`, sauf une liste explicite (`POST /equilibrages/simuler`). Login et refresh refusent un compte d'organisation démo : `POST /demo/session` est l'unique porte d'entrée. Les trois boucles de fond sur les organisations filtrent `estDemo: false` (verrou textuel + intégration). La console plateforme exclut la démo de ses indicateurs et répond 409 à toute action sur elle.

**Tech Stack:** Fastify 5, `@fastify/jwt`, Prisma 7 (adapter-pg), PostgreSQL, Vitest ; frontend Vite + React (console super-admin seulement).

**Spec:** `docs/superpowers/specs/2026-09-15-onboarding-demo-design.md` (§1 en entier, §4.1 « PR 1 »). Les PR 2 (générateur, régénération) et PR 3 (front de démo) ont chacune leur plan, écrit après la fusion de celle-ci.

## Global Constraints

- Français partout : noms métier, commentaires, messages, commits.
- Branche `feat/demo-socle-serveur` depuis `main`, jamais de commit sur `main`, merge `--no-ff` par PR (le PO fusionne).
- **Jamais de migration sur la base de dev `nkoni`** : validation sur une base jetable `nkoni_it_demo` uniquement.
- Messages serveur : clés dans les fragments EXISTANTS `commun` et `platform` (FR + EN), aucun nouveau namespace.
- Toute nouvelle occurrence de `orgContext.runUnscoped` est inscrite et justifiée dans `tests/runUnscoped-allowlist.test.ts`.
- Garde-fous : chaque test de garde est **saboté dans la direction utile** (retirer le garde, pas modifier le test) et on vérifie que le sabotage s'est appliqué avant d'interpréter le rouge.
- Vérification avant présentation : backend `npm run build` + `npm run test -- --run` (intégrations sur `nkoni_it_demo`) ; frontend `npm run build` + `npx oxlint` + `npm run test`.
- Messages de commit terminés par `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## File Structure

| Fichier | Rôle |
|---|---|
| `backend/prisma/schema.prisma` + `migrations/20260915090000_organisation_est_demo/` | colonne `Organisation.estDemo` |
| `backend/src/lib/env.ts` | variable `DEMO_ACTIVEE` |
| `backend/src/app.ts` | option et décoration `demoActivee`, enregistrement de `demoRoutes` |
| `backend/src/lib/demo.ts` (nouveau) | règle pure « requête permise à un jeton de démo » |
| `backend/src/middlewares/authenticate.ts` | garde lecture seule + claim `demo` dans les types JWT |
| `backend/src/lib/session.ts` | `signAccessToken(..., { demo })` |
| `backend/src/services/demo.service.ts` (nouveau) | `chargerCompteDemo` |
| `backend/src/routes/demo.route.ts` (nouveau) | `POST /demo/session` |
| `backend/src/services/organisation.service.ts` | `chargerAccesOrganisation`, `estDemo` dans la vue plateforme |
| `backend/src/routes/auth.route.ts` | refus login/refresh pour un compte démo |
| `backend/src/services/notification-scheduler.ts`, `forfait-relances.service.ts`, `paiement-reconciliation.service.ts` | filtre `estDemo: false` |
| `backend/src/routes/platform.route.ts` | préhandler 409 sur l'organisation démo |
| `backend/src/locales/{fr,en}/{commun,platform}.ts` | messages |
| `frontend/src/lib/api/platform.ts`, `pages/SuperAdminPage.tsx`, `locales/{fr,en}/superAdmin.ts` | badge « Démo », exclusions, actions masquées |
| `docs/architecture-demo.md` (nouveau), `CLAUDE.md` | invariants |

---

### Task 1: Colonne `estDemo`, variable `DEMO_ACTIVEE`, décoration `demoActivee`

**Files:**
- Modify: `backend/prisma/schema.prisma` (modèle `Organisation`, après `paiementEnLigneAcquis`)
- Create: `backend/prisma/migrations/20260915090000_organisation_est_demo/migration.sql`
- Modify: `backend/src/lib/env.ts` (objet `env`)
- Modify: `backend/src/app.ts` (`declare module 'fastify'`, `BuildAppOptions`, décorations)

**Interfaces:**
- Produces: colonne `Organisation.estDemo: boolean` (Prisma) ; `env.DEMO_ACTIVEE: string` ; `app.demoActivee: boolean` ; option `buildApp({ demoActivee?: boolean })`.

- [ ] **Step 1: Se placer sur la branche** (créée avec le commit de ce plan)

```bash
cd /Users/nelson/Documents/Projets/nkoni
git switch feat/demo-socle-serveur && git status --short
```

Expected : branche `feat/demo-socle-serveur`, arbre propre.

- [ ] **Step 2: Ajouter la colonne au schéma**

Dans `backend/prisma/schema.prisma`, modèle `Organisation`, juste après la ligne `paiementEnLigneAcquis Boolean @default(false)` :

```prisma
  // Espace de DÉMONSTRATION partagé (spec 2026-09-15) : organisation fictive, lecture seule, ouverte
  // sans compte via POST /demo/session. Ignorée par les tâches de fond et les indicateurs de la console.
  estDemo      Boolean  @default(false)
```

- [ ] **Step 3: Écrire la migration**

Créer `backend/prisma/migrations/20260915090000_organisation_est_demo/migration.sql` :

```sql
-- Espace de démonstration partagé (spec 2026-09-15 §1.1) : marqueur additif, aucune organisation
-- existante n'est une démo → défaut false, aucun backfill.
ALTER TABLE "Organisation" ADD COLUMN "estDemo" BOOLEAN NOT NULL DEFAULT false;
```

- [ ] **Step 4: Valider la migration sur une base jetable** (jamais `nkoni`)

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
PG=/opt/homebrew/opt/postgresql@18/bin
$PG/dropdb --if-exists --force nkoni_it_demo
$PG/createdb nkoni_it_demo
export DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable"
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code; echo "diff exit=$?"
$PG/psql "$DATABASE_URL" -tAc "select column_name||':'||data_type||':'||is_nullable||':'||column_default from information_schema.columns where table_name='Organisation' and column_name='estDemo'"
npx prisma generate
```

Expected : `All migrations have been successfully applied.` ; `diff exit=0` ; `estDemo:boolean:NO:false`.

- [ ] **Step 5: Ajouter la variable d'environnement**

Dans `backend/src/lib/env.ts`, objet `env`, après `PAIEMENT_MONTANT_MIN` :

```ts
  // Espace de démonstration partagé (spec 2026-09-15 §3.2). `true` = POST /demo/session émet des
  // sessions et la tâche de nuit régénère la démo ; toute autre valeur (défaut) = démo éteinte (404).
  DEMO_ACTIVEE: optional('DEMO_ACTIVEE', 'false'),
```

- [ ] **Step 6: Décorer l'application**

Dans `backend/src/app.ts` :

1. Dans `interface FastifyInstance` (bloc `declare module 'fastify'`), ajouter après `push: PushClient` :

```ts
    /** Espace de démonstration activé (`DEMO_ACTIVEE=true`, injectable en test). */
    demoActivee: boolean
```

2. Dans `BuildAppOptions`, après `push?: PushClient` :

```ts
  /** Espace de démonstration activé. Défaut : `env.DEMO_ACTIVEE === 'true'`. */
  demoActivee?: boolean
```

3. Après `app.decorate('push', opts.push ?? vraiPushClient)` :

```ts
  app.decorate('demoActivee', opts.demoActivee ?? env.DEMO_ACTIVEE === 'true')
```

Si `env` n'est pas encore importé dans `app.ts`, ajouter `import { env } from './lib/env'` avec les autres imports de `./lib/`.

- [ ] **Step 7: Vérifier build et tests (rien ne doit changer)**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run build
npm run test -- --run --exclude '**/*.integration.test.ts'
```

Expected : build sans erreur, tous les tests passent.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260915090000_organisation_est_demo backend/src/lib/env.ts backend/src/app.ts
git commit -m "feat(demo): marqueur Organisation.estDemo et interrupteur DEMO_ACTIVEE

Colonne additive (défaut false, aucun backfill), validée sur base jetable
(migrate diff vide). Décoration app.demoActivee injectable en test.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Garde lecture seule d'un jeton de démo

**Files:**
- Create: `backend/src/lib/demo.ts`
- Modify: `backend/src/middlewares/authenticate.ts`
- Modify: `backend/src/locales/fr/commun.ts`, `backend/src/locales/en/commun.ts`
- Test: `backend/tests/demo.test.ts` (règle pure), `backend/tests/demo-garde.route.test.ts` (hook)

**Interfaces:**
- Produces: `estRequeteAutoriseeEnDemo(methode: string, motifRoute: string | undefined): boolean` ; `ECRITURES_AUTORISEES_EN_DEMO: readonly string[]` ; claim JWT `demo?: true` (payload) / `demo?: boolean` (`req.user`) ; clés `commun.demoLectureSeule`, `commun.demoIndisponible`.

- [ ] **Step 1: Écrire le test de la règle pure**

Créer `backend/tests/demo.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { ECRITURES_AUTORISEES_EN_DEMO, estRequeteAutoriseeEnDemo } from '../src/lib/demo'

describe('estRequeteAutoriseeEnDemo (spec 2026-09-15 §1.4)', () => {
  it.each(['GET', 'HEAD', 'get'])('%s : toujours permis (lecture)', (methode) => {
    expect(estRequeteAutoriseeEnDemo(methode, '/membres')).toBe(true)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s sur une route quelconque : refusé', (methode) => {
    expect(estRequeteAutoriseeEnDemo(methode, '/membres')).toBe(false)
  })

  it('POST /equilibrages/simuler : permis (calcul pur, aucune écriture)', () => {
    expect(estRequeteAutoriseeEnDemo('POST', '/equilibrages/simuler')).toBe(true)
  })

  it('exception EXACTE : ni la route voisine qui applique, ni une autre méthode sur la même route', () => {
    expect(estRequeteAutoriseeEnDemo('POST', '/equilibrages')).toBe(false)
    expect(estRequeteAutoriseeEnDemo('PUT', '/equilibrages/simuler')).toBe(false)
  })

  it('motif de route inconnu (404 Fastify) : refusé pour une écriture', () => {
    expect(estRequeteAutoriseeEnDemo('POST', undefined)).toBe(false)
  })

  it("la liste d'exceptions reste minimale (toute entrée ajoutée doit être relue)", () => {
    expect(ECRITURES_AUTORISEES_EN_DEMO).toEqual(['POST /equilibrages/simuler'])
  })
})
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `cd backend && npm run test -- --run tests/demo.test.ts`
Expected: FAIL — `Failed to resolve import "../src/lib/demo"`.

- [ ] **Step 3: Écrire la règle**

Créer `backend/src/lib/demo.ts` :

```ts
/**
 * Espace de démonstration partagé (spec 2026-09-15 §1.4) — ce qu'un jeton `demo` peut faire.
 *
 * Règle PURE, appliquée par `authenticate` (toutes les routes tenant y passent) : une démo se
 * CONSULTE. Toute méthode autre que GET/HEAD est refusée, sauf les rares routes POST qui ne font
 * que calculer, listées ci-dessous par « MÉTHODE motif-de-route » exact (jamais un préfixe :
 * `POST /equilibrages` applique réellement un équilibrage).
 *
 * Ajouter une exception = prouver qu'elle n'écrit RIEN (ni base, ni Blob, ni envoi) : le test
 * `demo.test.ts` fige la liste pour forcer cette relecture.
 */

const METHODES_LECTURE = new Set(['GET', 'HEAD'])

export const ECRITURES_AUTORISEES_EN_DEMO: readonly string[] = ['POST /equilibrages/simuler']

export function estRequeteAutoriseeEnDemo(methode: string, motifRoute: string | undefined): boolean {
  const m = methode.toUpperCase()
  if (METHODES_LECTURE.has(m)) return true
  return motifRoute !== undefined && ECRITURES_AUTORISEES_EN_DEMO.includes(`${m} ${motifRoute}`)
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `cd backend && npm run test -- --run tests/demo.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Ajouter les messages**

Dans `backend/src/locales/fr/commun.ts`, dans l'objet `messages`, après `'commun.erreurServeur'` :

```ts
  // Espace de démonstration (spec 2026-09-15).
  'commun.demoLectureSeule':
    "Espace de démonstration en lecture seule : créez votre espace pour enregistrer vos données.",
  'commun.demoIndisponible': "L'espace de démonstration est momentanément indisponible.",
```

Dans `backend/src/locales/en/commun.ts`, même position :

```ts
  // Demo space (spec 2026-09-15).
  'commun.demoLectureSeule': 'Read-only demo space: create your own space to save your data.',
  'commun.demoIndisponible': 'The demo space is temporarily unavailable.',
```

- [ ] **Step 6: Écrire le test du hook**

Créer `backend/tests/demo-garde.route.test.ts` :

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Garde lecture seule d'un jeton de démo, appliqué dans `authenticate` (spec 2026-09-15 §1.4).
 *
 * Prisma est un Proxy qui ENREGISTRE chaque appel : un refus doit survenir AVANT toute lecture ou
 * écriture (`appels` vide), une requête permise doit atteindre la base (`appels` non vide — c'est
 * ce qui distingue « passé le garde » de « refusé ailleurs »). Les corps envoyés sont VALIDES : la
 * validation ajv s'exécute avant les preHandlers, un corps invalide rendrait 400 sans prouver le garde.
 */

let appels: string[] = []
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const prismaEspion: any = new Proxy(
  {},
  {
    get: (_cible, modele) =>
      new Proxy(
        {},
        {
          get: (_c, operation) => async () => {
            appels.push(`${String(modele)}.${String(operation)}`)
            return []
          },
        },
      ),
  },
)

describe('authenticate — jeton de démonstration', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp({ prisma: prismaEspion, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })
  beforeEach(() => {
    appels = []
  })

  const jeton = (demo: boolean) =>
    app.jwt.sign({
      sub: 'u-demo',
      role: 'ADMIN',
      organisationId: 'org-demo',
      langue: 'FR',
      ...(demo ? { demo: true as const } : {}),
    })
  const requete = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, demo: boolean, payload?: object) =>
    app.inject({
      method,
      url,
      headers: { authorization: `Bearer ${jeton(demo)}` },
      ...(payload ? { payload } : {}),
    })

  it.each([
    ['DELETE', '/membres/m1', undefined],
    ['POST', '/recus/r1/whatsapp', undefined],
    ['PATCH', '/notifications/tout-lu', undefined],
    ['PATCH', '/auth/me/langue', { langue: 'EN' }],
    ['POST', '/equilibrages', { membreId: 'm1', anneeDebut: 2025, anneeFin: 2026 }],
  ] as const)('%s %s : 403 lecture seule, aucune requête en base', async (method, url, payload) => {
    const res = await requete(method, url, true, payload)
    expect(res.statusCode).toBe(403)
    expect(res.json().message).toContain('lecture seule')
    expect(appels).toEqual([])
  })

  it('GET : la lecture passe le garde et atteint la base', async () => {
    const res = await requete('GET', '/membres/options', true)
    expect(res.statusCode).not.toBe(403)
    expect(appels.length).toBeGreaterThan(0)
  })

  it('POST /equilibrages/simuler : exception permise, atteint le service', async () => {
    const res = await requete('POST', '/equilibrages/simuler', true, { membreId: 'm1', anneeDebut: 2025, anneeFin: 2026 })
    expect(res.statusCode).not.toBe(403)
    expect(appels.length).toBeGreaterThan(0)
  })

  it('jeton ordinaire (sans claim demo) : une écriture n’est pas refusée par ce garde', async () => {
    const res = await requete('PATCH', '/notifications/tout-lu', false)
    expect(res.statusCode).not.toBe(403)
    expect(appels.length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 7: Lancer le test, vérifier l'échec**

Run: `cd backend && npm run test -- --run tests/demo-garde.route.test.ts`
Expected: FAIL — les 5 cas « 403 » reçoivent un autre statut (et `appels` non vide) ; TypeScript peut aussi signaler `demo` inconnu dans `jwt.sign` (vitest n'arrête pas sur les types).

- [ ] **Step 8: Implémenter le garde**

Remplacer le corps de `authenticate` et le bloc `declare module '@fastify/jwt'` de `backend/src/middlewares/authenticate.ts`. Ajouter l'import en tête (après les imports existants) :

```ts
import { estRequeteAutoriseeEnDemo } from '../lib/demo'
```

Nouvelle fonction :

```ts
export async function authenticate(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // Fourni par @fastify/jwt : vérifie le Bearer token et remplit `req.user`.
    await req.jwtVerify()
    // Renseigne l'acteur pour l'audit trail (V2 §5) — best-effort.
    auditContext.setActeur(req.user.sub)
    // Établit l'organisation courante (SaaS §2.2) : l'extension Prisma d'isolation scope
    // désormais toutes les requêtes de cette requête HTTP sur cette organisation.
    orgContext.setOrganisation(req.user.organisationId)
  } catch {
    // Token absent/invalide → req.user non peuplé : la langue est résolue via Accept-Language (§4).
    reply
      .code(401)
      .send({ error: 'Unauthorized', message: t(langueDeRequete(req), 'commun.tokenAbsent') })
    return
  }

  // Espace de démonstration (spec 2026-09-15 §1.4) : un jeton `demo` CONSULTE, il n'écrit jamais.
  // Placé ici plutôt que route par route : toutes les routes tenant passent par ce hook, une route
  // ajoutée demain est donc couverte sans y penser. `routeOptions.url` = motif ('/membres/:id').
  if (req.user.demo === true && !estRequeteAutoriseeEnDemo(req.method, req.routeOptions?.url)) {
    reply
      .code(403)
      .send({ error: 'Forbidden', message: t(langueDeRequete(req), 'commun.demoLectureSeule') })
  }
}
```

Bloc de types :

```ts
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string
      role?: Role
      membreId?: string
      organisationId?: string
      langue?: Langue // §4 i18n — préférence de langue portée par l'access token
      demo?: true // espace de démonstration (spec 2026-09-15) — émis par POST /demo/session seulement
      typ?: 'refresh'
    }
    user: {
      sub?: string
      role: Role
      membreId?: string
      organisationId?: string
      langue?: Langue
      demo?: boolean
    }
  }
}
```

- [ ] **Step 9: Lancer les tests, vérifier le succès**

Run: `cd backend && npm run test -- --run tests/demo.test.ts tests/demo-garde.route.test.ts`
Expected: PASS (11 + 8 tests).

- [ ] **Step 10: Saboter le garde dans la direction utile**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
cp src/middlewares/authenticate.ts "${TMPDIR:-/tmp}/authenticate.bak"
sed -i '' 's/if (req.user.demo === true \&\& !estRequeteAutoriseeEnDemo/if (false \&\& req.user.demo === true \&\& !estRequeteAutoriseeEnDemo/' src/middlewares/authenticate.ts
grep -c "if (false && req.user.demo" src/middlewares/authenticate.ts
npm run test -- --run tests/demo-garde.route.test.ts 2>&1 | grep -E "Tests "
cp "${TMPDIR:-/tmp}/authenticate.bak" src/middlewares/authenticate.ts
npm run test -- --run tests/demo-garde.route.test.ts 2>&1 | grep -E "Tests "
```

Expected : `1` (sabotage appliqué) ; puis `5 failed | 3 passed` ; puis, restauré, `8 passed`.

- [ ] **Step 11: Suite complète hors intégration**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'
```

Expected : build propre, tous les tests passent (aucun jeton existant ne porte `demo`).

- [ ] **Step 12: Commit**

```bash
git add backend/src/lib/demo.ts backend/src/middlewares/authenticate.ts backend/src/locales/fr/commun.ts backend/src/locales/en/commun.ts backend/tests/demo.test.ts backend/tests/demo-garde.route.test.ts
git commit -m "feat(demo): un jeton de démonstration ne peut que lire

Garde dans authenticate (toutes les routes tenant) : claim demo + méthode autre
que GET/HEAD → 403 traduit, avant toute requête en base. Seule exception, exacte :
POST /equilibrages/simuler (calcul pur). Sabotage vérifié.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Émission publique de session — `POST /demo/session`

**Files:**
- Modify: `backend/src/lib/session.ts` (`signAccessToken`)
- Create: `backend/src/services/demo.service.ts`
- Create: `backend/src/routes/demo.route.ts`
- Modify: `backend/src/app.ts` (import + `app.register(demoRoutes)`)
- Modify: `backend/tests/runUnscoped-allowlist.test.ts` (`APPROUVES`)
- Test: `backend/tests/demo-session.route.test.ts`

**Interfaces:**
- Consumes: `app.demoActivee` (Task 1) ; claim `demo` et `commun.demoIndisponible` (Task 2) ; `findUserById`, `langueEffective`, `AuthenticatedUser` (`services/auth.service.ts`).
- Produces: `signAccessToken(reply, user, options?: { demo?: boolean }): Promise<string>` ; `chargerCompteDemo(prisma: CompteDemoPrisma): Promise<AuthenticatedUser | null>` ; route `POST /demo/session` → `200 { accessToken, user: { id, email, role, langue, devise, nomOrganisation } }` ou `404`.

- [ ] **Step 1: Écrire le test**

Créer `backend/tests/demo-session.route.test.ts` :

```ts
import { describe, it, expect, afterEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * POST /demo/session (spec 2026-09-15 §1.2) : public, 404 tant que la démo est éteinte ou absente,
 * sinon un access token portant `demo: true` et AUCUN cookie (le cookie de refresh d'un vrai
 * administrateur connecté dans le même navigateur ne doit jamais être écrasé).
 */

const COMPTE = {
  id: 'u-demo',
  email: 'president@demo.nkoni.local',
  role: 'ADMIN',
  actif: true,
  organisationId: 'org-demo',
  langue: null,
  sessionEpoch: 0,
  membre: { id: 'm-president' },
  organisation: { langueDefaut: 'FR', devise: 'FCFA', nom: 'Association Exemple NKONI' },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function prismaDemo(options: { org?: boolean; compte?: boolean } = {}): any {
  const { org = true, compte = true } = options
  return {
    organisation: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async (args: any) => {
        expect(args.where).toEqual({ estDemo: true, actif: true })
        return org ? { id: 'org-demo' } : null
      },
    },
    utilisateur: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      findFirst: async (args: any) => {
        expect(args.where).toEqual({ organisationId: 'org-demo', role: 'ADMIN', actif: true })
        return compte ? { id: 'u-demo' } : null
      },
      findUnique: async () => COMPTE,
      update: async () => COMPTE,
    },
  }
}

let app: FastifyInstance | undefined
afterEach(async () => {
  await app?.close()
  app = undefined
})

const demarrer = async (demoActivee: boolean, prisma = prismaDemo()) => {
  app = await buildApp({ prisma, logger: false, demoActivee })
  await app.ready()
  return app.inject({ method: 'POST', url: '/demo/session' })
}

describe('POST /demo/session', () => {
  it('DEMO_ACTIVEE éteint : 404, sans lire la base', async () => {
    const res = await demarrer(false, {} as never)
    expect(res.statusCode).toBe(404)
  })

  it('aucune organisation de démo : 404', async () => {
    expect((await demarrer(true, prismaDemo({ org: false }))).statusCode).toBe(404)
  })

  it('organisation de démo sans compte ADMIN actif : 404', async () => {
    expect((await demarrer(true, prismaDemo({ compte: false }))).statusCode).toBe(404)
  })

  it('démo disponible : jeton demo, aucun cookie posé, profil de session', async () => {
    const res = await demarrer(true)
    expect(res.statusCode).toBe(200)
    expect(res.headers['set-cookie']).toBeUndefined()
    const body = res.json()
    expect(body.user).toEqual({
      id: 'u-demo',
      email: 'president@demo.nkoni.local',
      role: 'ADMIN',
      langue: 'FR',
      devise: 'FCFA',
      nomOrganisation: 'Association Exemple NKONI',
    })
    const decode = app!.jwt.decode<{ sub: string; demo?: boolean; organisationId?: string; role: string }>(body.accessToken)
    expect(decode).toMatchObject({ sub: 'u-demo', demo: true, organisationId: 'org-demo', role: 'ADMIN' })
  })

  it('le jeton émis est bien refusé en écriture (bout en bout)', async () => {
    const res = await demarrer(true)
    const ecriture = await app!.inject({
      method: 'PATCH',
      url: '/notifications/tout-lu',
      headers: { authorization: `Bearer ${res.json().accessToken}` },
    })
    expect(ecriture.statusCode).toBe(403)
  })
})
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `cd backend && npm run test -- --run tests/demo-session.route.test.ts`
Expected: FAIL — `POST /demo/session` renvoie 404 dans tous les cas (route absente), donc les deux derniers tests échouent.

- [ ] **Step 3: Étendre `signAccessToken`**

Dans `backend/src/lib/session.ts`, remplacer la signature et le typage du payload de `signAccessToken` :

```ts
/** Signe l'access token (construction conditionnelle pour exactOptionalPropertyTypes). `demo` :
 *  session de l'espace de démonstration (spec 2026-09-15), réservée à POST /demo/session. */
export async function signAccessToken(
  reply: FastifyReply,
  user: AuthenticatedUser,
  options: { demo?: boolean } = {},
): Promise<string> {
  const payload: {
    sub: string
    role: Role
    membreId?: string
    organisationId?: string
    langue?: Langue
    demo?: true
  } = {
    sub: user.id,
    role: user.role,
  }
```

Puis, juste avant `return reply.jwtSign(payload)` :

```ts
  if (options.demo) payload.demo = true
```

- [ ] **Step 4: Écrire le service**

Créer `backend/src/services/demo.service.ts` :

```ts
import { findUserById, type AuthenticatedUser, type AuthPrisma } from './auth.service'

/**
 * Espace de démonstration partagé (spec 2026-09-15) — accès au compte de démonstration.
 *
 * À appeler sous `orgContext.runUnscoped` : aucune session n'existe encore, et `Utilisateur` est un
 * modèle scopé. L'organisation retenue est la PLUS RÉCENTE marquée `estDemo` (la régénération crée la
 * nouvelle avant de supprimer l'ancienne, §3.2), et le compte est son premier ADMIN actif.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CompteDemoPrisma extends AuthPrisma {
  organisation: { findFirst(args: any): Promise<any> }
  utilisateur: AuthPrisma['utilisateur'] & { findFirst(args: any): Promise<any> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function chargerCompteDemo(prisma: CompteDemoPrisma): Promise<AuthenticatedUser | null> {
  const org = await prisma.organisation.findFirst({
    where: { estDemo: true, actif: true },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  })
  if (!org) return null
  const compte = await prisma.utilisateur.findFirst({
    where: { organisationId: org.id, role: 'ADMIN', actif: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })
  if (!compte) return null
  return findUserById(prisma, compte.id)
}
```

- [ ] **Step 5: Écrire la route**

Créer `backend/src/routes/demo.route.ts` :

```ts
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { orgContext } from '../lib/org-context'
import { t, langueDeRequete } from '../lib/i18n'
import { signAccessToken } from '../lib/session'
import { langueEffective } from '../services/auth.service'
import { chargerCompteDemo } from '../services/demo.service'

/**
 * POST /demo/session — PUBLIC (spec 2026-09-15 §1.2).
 *
 * Émet un access token de l'espace de démonstration, porteur du claim `demo: true` (lecture seule,
 * cf. `authenticate`). AUCUN cookie de refresh : un administrateur réel connecté dans le même
 * navigateur garde sa session intacte (même nom et même chemin de cookie). Le front redemande un
 * jeton à l'expiration. 404 uniforme tant que la démo est éteinte (`DEMO_ACTIVEE`) ou absente.
 */
export const demoRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post(
    '/demo/session',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const indisponible = () =>
        reply
          .code(404)
          .send({ error: 'Not Found', message: t(langueDeRequete(req), 'commun.demoIndisponible') })

      if (!app.demoActivee) return indisponible()
      // Aucun contexte d'organisation avant la session : lecture délibérément non scopée, `await`
      // DANS le callback (une PrismaPromise est paresseuse, cf. CLAUDE.md « Liens publics signés »).
      const compte = await orgContext.runUnscoped(async () => await chargerCompteDemo(app.prisma))
      if (!compte) return indisponible()

      const accessToken = await signAccessToken(reply, compte, { demo: true })
      return reply.code(200).send({
        accessToken,
        user: {
          id: compte.id,
          email: compte.email,
          role: compte.role,
          langue: langueEffective(compte),
          devise: compte.devise,
          nomOrganisation: compte.nomOrganisation,
        },
      })
    },
  )
}
```

- [ ] **Step 6: Enregistrer la route**

Dans `backend/src/app.ts`, ajouter l'import à côté de `import { authRoutes } from './routes/auth.route'` :

```ts
import { demoRoutes } from './routes/demo.route'
```

et, juste après `await app.register(authRoutes, { prefix: '/auth' })` :

```ts
  await app.register(demoRoutes)
```

- [ ] **Step 7: Lancer le test de route**

Run: `cd backend && npm run test -- --run tests/demo-session.route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Inscrire le nouvel appel `runUnscoped`**

Run: `cd backend && npm run test -- --run tests/runUnscoped-allowlist.test.ts`
Expected: FAIL — `routes/demo.route.ts` n'est pas approuvé.

Dans `backend/tests/runUnscoped-allowlist.test.ts`, objet `APPROUVES`, après l'entrée `'routes/paiements.route.ts': 1,` :

```ts
  // Espace de démonstration PUBLIC (spec 2026-09-15 §1.2) : résolution de l'organisation démo et de
  // son compte ADMIN AVANT toute session — aucune org connue au moment de la lecture. Le jeton émis
  // porte `demo: true`, qui interdit toute écriture (`authenticate`).
  'routes/demo.route.ts': 1,
```

Run: `cd backend && npm run test -- --run tests/runUnscoped-allowlist.test.ts`
Expected: PASS.

- [ ] **Step 9: Build et suite hors intégration**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'
```

Expected : build propre, tous les tests passent.

- [ ] **Step 10: Commit**

```bash
git add backend/src/lib/session.ts backend/src/services/demo.service.ts backend/src/routes/demo.route.ts backend/src/app.ts backend/tests/runUnscoped-allowlist.test.ts backend/tests/demo-session.route.test.ts
git commit -m "feat(demo): POST /demo/session émet une session de démonstration

Public, limité à 10/min par IP, 404 si DEMO_ACTIVEE est éteint ou si aucune
organisation démo n'existe. Access token porteur du claim demo, sans cookie de
refresh (la session réelle du navigateur reste intacte). runUnscoped inscrit.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Connexion et rafraîchissement refusés pour un compte de démo

**Files:**
- Modify: `backend/src/services/organisation.service.ts` (à côté de `chargerOrganisationActif`)
- Modify: `backend/src/routes/auth.route.ts` (login ~l.108-121, refresh ~l.176-189)
- Test: `backend/tests/demo-auth.route.test.ts`

**Interfaces:**
- Produces: `chargerAccesOrganisation(prisma: OrganisationActifPrisma, organisationId: string): Promise<{ actif: boolean; estDemo: boolean } | null>`.

- [ ] **Step 1: Écrire le test**

Créer `backend/tests/demo-auth.route.test.ts` :

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'

/**
 * Spec 2026-09-15 §1.3 : POST /demo/session est l'UNIQUE porte d'entrée de l'espace de démonstration.
 * Un compte de l'organisation démo ne peut ni se connecter (même réponse que des identifiants
 * invalides, aucune fuite d'existence) ni rafraîchir une session — sans quoi un jeton de la démo
 * SANS claim `demo` pourrait exister et écrire.
 */

const EMAIL = 'president@demo.nkoni.local'
const MOT_DE_PASSE = 'mot-de-passe-demo-123'

describe('auth — compte d’une organisation de démonstration', () => {
  let app: FastifyInstance
  // Sessions émises : doit rester à 0. C'est l'assertion qui compte — sans elle, le refresh « passerait »
  // déjà AVANT le correctif (l'émission atteinte, une erreur quelconque serait rattrapée en 401).
  let emissions = 0

  beforeAll(async () => {
    const compte = {
      id: 'u-demo',
      email: EMAIL,
      passwordHash: await hashPassword(MOT_DE_PASSE),
      role: 'ADMIN',
      actif: true,
      organisationId: 'org-demo',
      langue: null,
      sessionEpoch: 0,
      membre: null,
      organisation: { langueDefaut: 'FR', devise: 'FCFA', nom: 'Association Exemple NKONI' },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      utilisateur: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        findUnique: async ({ where }: any) => (where.email === EMAIL || where.id === 'u-demo' ? compte : null),
        update: async () => compte,
      },
      organisation: { findUnique: async () => ({ actif: true, estDemo: true }) },
      refreshToken: {
        create: async () => {
          emissions++
          return {}
        },
      },
    }
    app = await buildApp({ prisma, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  it('login : 401 identifiants invalides, aucun cookie', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: EMAIL, password: MOT_DE_PASSE },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().message).toBe('Identifiants invalides.')
    expect(res.cookies.find((c) => c.name === 'nkoni_refresh')).toBeUndefined()
    expect(emissions).toBe(0)
  })

  it('refresh : 401 même avec un refresh token valide', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const refresh = (app.jwt as any).refresh.sign({ sub: 'u-demo', typ: 'refresh', epoch: 0 })
    const res = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { nkoni_refresh: refresh },
    })
    expect(res.statusCode).toBe(401)
    expect(emissions).toBe(0)
  })
})
```

Avant de lancer, vérifier le libellé exact FR de `auth.identifiantsInvalides` :

Run: `cd backend && grep -n "auth.identifiantsInvalides" src/locales/fr/auth.ts`
Si le libellé diffère de `'Identifiants invalides.'`, remplacer la chaîne attendue du premier test par le libellé réel.

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `cd backend && npm run test -- --run tests/demo-auth.route.test.ts`
Expected: FAIL — le login renvoie 200 (session émise, `emissions` = 1) ; le refresh émet aussi une session (`emissions` > 0).

- [ ] **Step 3: Ajouter `chargerAccesOrganisation`**

Dans `backend/src/services/organisation.service.ts`, juste après la fonction `chargerOrganisationActif` :

```ts
/**
 * Accès à une organisation pour login/refresh : active (§2.3) ET nature de démonstration
 * (spec 2026-09-15 §1.3 — un compte de démo n'ouvre jamais de session par ces voies). `null` si
 * introuvable. `estDemo` absent de la ligne (mock ancien) est lu comme `false`.
 */
export async function chargerAccesOrganisation(
  prisma: OrganisationActifPrisma,
  organisationId: string,
): Promise<{ actif: boolean; estDemo: boolean } | null> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { actif: true, estDemo: true },
  })
  if (!org) return null
  return { actif: org.actif === true, estDemo: org.estDemo === true }
}
```

- [ ] **Step 4: L'utiliser dans le login**

Dans `backend/src/routes/auth.route.ts`, remplacer l'import :

```ts
import { chargerOrganisationActif } from '../services/organisation.service'
```

par :

```ts
import { chargerAccesOrganisation } from '../services/organisation.service'
```

Dans le handler `/login`, remplacer le bloc `if (orgId) { … }` (celui qui renvoie `auth.espaceSuspendu`) par :

```ts
      const orgId = user.organisationId
      if (orgId) {
        const acces = await orgContext.runUnscoped(async () =>
          chargerAccesOrganisation(app.prisma, orgId),
        )
        // Espace de démonstration (spec 2026-09-15 §1.3) : jamais de session par mot de passe — même
        // réponse que des identifiants invalides, rien ne révèle qu'un tel compte existe.
        if (acces?.estDemo) {
          return reply
            .code(401)
            .send({ error: 'Unauthorized', message: t(langueDeRequete(req), 'auth.identifiantsInvalides') })
        }
        if (acces?.actif !== true) {
          return reply.code(403).send({
            error: 'Forbidden',
            message: t(langueDeRequete(req), 'auth.espaceSuspendu'),
          })
        }
      }
```

- [ ] **Step 5: L'utiliser dans le refresh**

Dans le handler `/refresh`, remplacer le bloc `if (orgId) { … }` (celui qui renvoie `auth.sessionInvalide` pour un espace suspendu) par :

```ts
      const orgId = user.organisationId
      if (orgId) {
        const acces = await orgContext.runUnscoped(async () =>
          chargerAccesOrganisation(app.prisma, orgId),
        )
        // Suspendu (§2.3) ou démo (spec 2026-09-15 §1.3) : aucune réémission d'access token.
        if (acces?.actif !== true || acces.estDemo) {
          return reply
            .code(401)
            .send({ error: 'Unauthorized', message: t(langueDeRequete(req), 'auth.sessionInvalide') })
        }
      }
```

Si `chargerOrganisationActif` n'a plus aucun appelant (`grep -rn chargerOrganisationActif backend/src backend/tests`), la supprimer de `organisation.service.ts`. Si un test l'importe, la conserver.

- [ ] **Step 6: Lancer les tests d'auth**

Run: `cd backend && npm run test -- --run tests/demo-auth.route.test.ts tests/auth.route.test.ts tests/runUnscoped-allowlist.test.ts`
Expected: PASS (le nombre d'appels `runUnscoped` de `auth.route.ts` est inchangé : 8).

- [ ] **Step 7: Saboter dans la direction utile**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
cp src/routes/auth.route.ts "${TMPDIR:-/tmp}/auth.route.bak"
sed -i '' 's/if (acces?.estDemo) {/if (false \&\& acces?.estDemo) {/' src/routes/auth.route.ts
grep -c "if (false && acces?.estDemo)" src/routes/auth.route.ts
npm run test -- --run tests/demo-auth.route.test.ts 2>&1 | grep -E "Tests "
cp "${TMPDIR:-/tmp}/auth.route.bak" src/routes/auth.route.ts
npm run test -- --run tests/demo-auth.route.test.ts 2>&1 | grep -E "Tests "
```

Expected : `1` ; `1 failed | 1 passed` ; restauré : `2 passed`.

- [ ] **Step 8: Build, suite hors intégration, commit**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'
cd .. && git add backend/src/services/organisation.service.ts backend/src/routes/auth.route.ts backend/tests/demo-auth.route.test.ts
git commit -m "feat(demo): aucune session par mot de passe pour un compte de démonstration

Login (401 identifiants invalides, sans fuite d'existence) et refresh (401)
refusent un compte d'organisation estDemo : POST /demo/session reste l'unique
porte d'entrée, donc aucun jeton de la démo sans claim demo. Sabotage vérifié.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Tâches de fond — l'organisation de démo est ignorée

**Files:**
- Modify: `backend/src/services/notification-scheduler.ts:184` et `:280`
- Modify: `backend/src/services/forfait-relances.service.ts:176-179`
- Modify: `backend/src/services/paiement-reconciliation.service.ts:60-63`
- Test: `backend/tests/demo-taches-de-fond.test.ts` (verrou textuel), `backend/tests/demo-taches-de-fond.integration.test.ts`

**Interfaces:**
- Consumes: colonne `estDemo` (Task 1).
- Produces: invariant « toute boucle de fond sur `organisation.findMany` dans `src/services/` filtre `estDemo: false` », gardé par test.

- [ ] **Step 1: Écrire le verrou textuel**

Créer `backend/tests/demo-taches-de-fond.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Espace de démonstration (spec 2026-09-15 §1.5) : une tâche de fond qui boucle sur les organisations
 * ne doit jamais traiter la démo — elle y écrirait des notifications chaque nuit, enverrait un e-mail
 * Resend au compte ADMIN fictif ou appellerait un PSP. Verrou TEXTUEL : chaque `organisation.findMany(`
 * de `src/services/` doit porter `estDemo: false` dans son appel, sauf les lectures listées ici.
 * (Le comportement réel est prouvé contre Postgres dans `demo-taches-de-fond.integration.test.ts`.)
 */

const EXCEPTIONS: Record<string, string> = {
  // Console plateforme : la démo y est LISTÉE (badge « Démo »), seule la vue l'exclut des indicateurs.
  'organisation.service.ts': 'console plateforme',
  // Rétention : purger les vieilles notifications et traces de la démo est inoffensif (§1.5).
  'retention.service.ts': 'purge de rétention',
}

const DOSSIER = join(__dirname, '../src/services')

describe('tâches de fond — filtre estDemo', () => {
  const occurrences: { fichier: string; appel: string }[] = []
  for (const fichier of readdirSync(DOSSIER).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(join(DOSSIER, fichier), 'utf8')
    let i = source.indexOf('organisation.findMany(')
    while (i !== -1) {
      // L'appel entier jusqu'à la parenthèse fermante correspondante.
      let profondeur = 0
      let fin = i + 'organisation.findMany'.length
      for (; fin < source.length; fin++) {
        if (source[fin] === '(') profondeur++
        if (source[fin] === ')' && --profondeur === 0) break
      }
      occurrences.push({ fichier, appel: source.slice(i, fin + 1) })
      i = source.indexOf('organisation.findMany(', fin)
    }
  }

  it('le verrou inspecte bien des appels (pas de test vacant)', () => {
    expect(occurrences.filter((o) => !(o.fichier in EXCEPTIONS)).length).toBeGreaterThanOrEqual(4)
  })

  it('chaque boucle de fond filtre estDemo: false', () => {
    const fautifs = occurrences
      .filter((o) => !(o.fichier in EXCEPTIONS))
      .filter((o) => !/estDemo:\s*false/.test(o.appel))
      .map((o) => `${o.fichier} → ${o.appel.replace(/\s+/g, ' ').slice(0, 120)}`)
    expect(fautifs).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer le verrou, vérifier l'échec**

Run: `cd backend && npm run test -- --run tests/demo-taches-de-fond.test.ts`
Expected: FAIL — 4 fautifs listés (2 dans `notification-scheduler.ts`, 1 dans `forfait-relances.service.ts`, 1 dans `paiement-reconciliation.service.ts`).

- [ ] **Step 3: Ajouter les filtres**

`backend/src/services/notification-scheduler.ts`, les DEUX lignes (dans `executerVerificationRetardsToutesOrgs` et `executerRappelsReunionsToutesOrgs`) :

```ts
  const orgs = await prisma.organisation.findMany({ where: { actif: true }, select: { id: true } })
```

deviennent :

```ts
  // `estDemo: false` : l'espace de démonstration ne reçoit aucune notification (spec 2026-09-15 §1.5).
  const orgs = await prisma.organisation.findMany({ where: { actif: true, estDemo: false }, select: { id: true } })
```

`backend/src/services/forfait-relances.service.ts`, dans `executerRelancesForfaitToutesOrgs` :

```ts
  const orgs = await prisma.organisation.findMany({
    // `estDemo: false` : jamais d'e-mail de relance au compte fictif de la démo (spec 2026-09-15 §1.5).
    where: { actif: true, estDemo: false, forfait: { not: 'GRATUIT' }, forfaitExpireLe: { not: null } },
    select: { id: true, nom: true, forfait: true, forfaitExpireLe: true },
  })
```

`backend/src/services/paiement-reconciliation.service.ts`, dans `reconcilierPaiementsToutesOrgs` :

```ts
  const orgs = (await deps.prisma.organisation.findMany({
    // `estDemo: false` : aucun appel PSP pour l'espace de démonstration (spec 2026-09-15 §1.5).
    where: { actif: true, estDemo: false },
    select: { id: true },
  })) as { id: string }[]
```

- [ ] **Step 4: Relancer le verrou et les tests unitaires existants des trois tâches**

Run: `cd backend && npm run test -- --run tests/demo-taches-de-fond.test.ts tests/notification-scheduler.test.ts tests/notification-reunion-rappel.test.ts tests/forfait-relances.service.test.ts tests/paiement-reconciliation.service.test.ts`
Expected: PASS. Si un test existant compare le `where` exact de `organisation.findMany` (`toEqual({ actif: true })`), mettre à jour son attendu en ajoutant `estDemo: false` — c'est le changement voulu.

- [ ] **Step 5: Écrire le test d'intégration**

Créer `backend/tests/demo-taches-de-fond.integration.test.ts` :

```ts
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { prisma as prismaEtendu } from '../src/lib/prisma'
import { anneeCouranteApp } from '../src/lib/date-app'
import {
  executerRappelsReunionsToutesOrgs,
  executerVerificationRetardsToutesOrgs,
} from '../src/services/notification-scheduler'
import { executerRelancesForfaitToutesOrgs } from '../src/services/forfait-relances.service'
import { reconcilierPaiementsToutesOrgs } from '../src/services/paiement-reconciliation.service'

/**
 * Spec 2026-09-15 §1.5, contre une VRAIE Postgres : un mock ignore le `where`, seule la base prouve
 * que la démo est réellement écartée. Deux organisations identiques (actives, PRO avec échéance proche
 * pour être éligibles aux relances) ne diffèrent que par `estDemo` : chaque tâche doit traiter la
 * réelle et jamais la démo. Assertions par identifiant → indifférent aux autres organisations de la base.
 *
 * Exige `DATABASE_URL` (base JETABLE, JAMAIS `nkoni`).
 */

const ORG_REELLE = 'e8000000-0000-4000-8000-000000000081'
const ORG_DEMO = 'e8000000-0000-4000-8000-000000000082'
const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
const NOW = new Date()

beforeAll(async () => {
  await base.organisation.deleteMany({ where: { id: { in: [ORG_REELLE, ORG_DEMO] } } })
  const echeance = new Date(NOW.getTime() + 5 * 24 * 3600 * 1000)
  for (const [id, estDemo] of [[ORG_REELLE, false], [ORG_DEMO, true]] as const) {
    await base.organisation.create({
      data: { id, nom: `Taches de fond ${estDemo ? 'démo' : 'réelle'}`, devise: 'FCFA', forfait: 'PRO', forfaitExpireLe: echeance, estDemo },
    })
  }
})

afterAll(async () => {
  await base.organisation.deleteMany({ where: { id: { in: [ORG_REELLE, ORG_DEMO] } } })
  await base.$disconnect()
})

const ids = (resultats: { organisationId: string }[]) => resultats.map((r) => r.organisationId)

describe('tâches de fond — organisation de démonstration écartée', () => {
  it('retards de cotisation', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = ids(await executerVerificationRetardsToutesOrgs(prismaEtendu as any, anneeCouranteApp(NOW), NOW))
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })

  it('rappels de réunion', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = ids(await executerRappelsReunionsToutesOrgs(prismaEtendu as any, NOW))
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })

  it('relances de forfait', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = ids(await executerRelancesForfaitToutesOrgs(prismaEtendu as any, NOW))
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })

  it('réconciliation des paiements', async () => {
    const psp = new Proxy({}, { get: () => async () => { throw new Error('aucun appel PSP attendu') } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = ids(await reconcilierPaiementsToutesOrgs({ prisma: prismaEtendu, psp: psp as any }, NOW))
    expect(r).toContain(ORG_REELLE)
    expect(r).not.toContain(ORG_DEMO)
  })
})
```

- [ ] **Step 6: Lancer le test d'intégration sur la base jetable**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-taches-de-fond.integration.test.ts
```

Expected : PASS (4 tests). Si `executerRelancesForfaitToutesOrgs` ne renvoie aucune ligne pour l'organisation réelle (aucune étape atteinte), vérifier dans son code si le résultat est poussé pour chaque organisation lue ; s'il ne l'est que quand une étape est atteinte, remplacer `echeance` par une date à 1 jour (étape J-1) et relancer.

- [ ] **Step 7: Saboter une tâche dans la direction utile**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
cp src/services/paiement-reconciliation.service.ts "${TMPDIR:-/tmp}/reconciliation.bak"
sed -i '' 's/where: { actif: true, estDemo: false },/where: { actif: true },/' src/services/paiement-reconciliation.service.ts
grep -c "where: { actif: true }," src/services/paiement-reconciliation.service.ts
npm run test -- --run tests/demo-taches-de-fond.test.ts 2>&1 | grep -E "Tests "
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-taches-de-fond.integration.test.ts 2>&1 | grep -E "Tests "
cp "${TMPDIR:-/tmp}/reconciliation.bak" src/services/paiement-reconciliation.service.ts
npm run test -- --run tests/demo-taches-de-fond.test.ts 2>&1 | grep -E "Tests "
```

Expected : `1` ; verrou `1 failed | 1 passed` ; intégration `1 failed | 3 passed` ; restauré `2 passed`.

- [ ] **Step 8: Commit**

```bash
cd /Users/nelson/Documents/Projets/nkoni
git add backend/src/services/notification-scheduler.ts backend/src/services/forfait-relances.service.ts backend/src/services/paiement-reconciliation.service.ts backend/tests/demo-taches-de-fond.test.ts backend/tests/demo-taches-de-fond.integration.test.ts
git add -u backend/tests
git commit -m "feat(demo): les tâches de fond ignorent l'espace de démonstration

Retards, rappels de réunion, relances de forfait (e-mail Resend) et réconciliation
PSP filtrent estDemo: false. Verrou textuel sur tout organisation.findMany de
src/services (exceptions justifiées : console, rétention) + preuve contre Postgres.
Sabotage vérifié sur les deux niveaux.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Console plateforme — la démo est listée, jamais comptée ni modifiable

**Files:**
- Modify: `backend/src/services/organisation.service.ts` (`OrganisationResume`, `SELECT_ORGANISATION_PLATEFORME`, `versVuePlateforme`)
- Modify: `backend/src/routes/platform.route.ts` (préhandler sur 6 routes)
- Modify: `backend/src/locales/fr/platform.ts`, `backend/src/locales/en/platform.ts`
- Test: `backend/tests/demo-platform.route.test.ts`
- Modify: `frontend/src/lib/api/platform.ts` (`PlatformOrganisation`)
- Modify: `frontend/src/pages/SuperAdminPage.tsx` (KPIs, cellule nom, `SelecteurForfait`, fiche détail)
- Modify: `frontend/src/locales/fr/superAdmin.ts`, `frontend/src/locales/en/superAdmin.ts`
- Test: `frontend/src/pages/SuperAdminPage.test.tsx` (existant, ajout d'un `describe`)

**Interfaces:**
- Consumes: colonne `estDemo` (Task 1).
- Produces: `OrganisationResume.estDemo: boolean` ; `PlatformOrganisation.estDemo?: boolean` ; clé serveur `platform.organisationDemo` ; clés front `superAdmin.table.demo`, `superAdmin.detail.demoGeree`.

- [ ] **Step 1: Écrire le test backend**

Créer `backend/tests/demo-platform.route.test.ts` :

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/**
 * Spec 2026-09-15 §1.7 : l'organisation de démonstration est gérée par la régénération, jamais par la
 * console. Toute action plateforme sur elle → 409, AVANT d'atteindre la moindre écriture ; la liste la
 * renvoie avec `estDemo` pour que la console l'affiche à part.
 */

const DEMO = { id: 'org-demo', nom: 'Association Exemple NKONI', estDemo: true, actif: true, forfait: 'PRO' }
let ecritures: string[] = []

describe('console plateforme — organisation de démonstration', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    const interdit = (nom: string) => async () => {
      ecritures.push(nom)
      throw new Error(`${nom} ne doit pas être appelé`)
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prisma: any = {
      organisation: {
        findUnique: async () => ({ ...DEMO }),
        findMany: async () => [{ ...DEMO, devise: 'FCFA', langueDefaut: 'FR', forfaitExpireLe: null, createdAt: new Date('2026-09-01') }],
        update: interdit('organisation.update'),
        updateMany: interdit('organisation.updateMany'),
      },
      membre: { groupBy: async () => [] },
      platformAuditLog: { create: interdit('platformAuditLog.create') },
      utilisateur: { findUnique: async () => ({ email: 'ops@nkoni.local' }) },
      $transaction: interdit('$transaction'),
    }
    app = await buildApp({ prisma, logger: false })
    await app.ready()
  })
  afterAll(async () => {
    await app.close()
  })

  const superAdmin = () => ({ authorization: `Bearer ${app.jwt.sign({ sub: 'sa', role: 'SUPER_ADMIN' })}` })

  it('la liste expose estDemo', async () => {
    const res = await app.inject({ method: 'GET', url: '/platform/organisations', headers: superAdmin() })
    expect(res.statusCode).toBe(200)
    expect(res.json().organisations[0].estDemo).toBe(true)
  })

  it.each([
    ['POST', '/platform/organisations/org-demo/suspendre', undefined],
    ['POST', '/platform/organisations/org-demo/reactiver', undefined],
    ['GET', '/platform/organisations/org-demo/export', undefined],
    ['DELETE', '/platform/organisations/org-demo', { confirmationNom: 'Association Exemple NKONI' }],
    ['PATCH', '/platform/organisations/org-demo/forfait', { forfait: 'GRATUIT' }],
    ['POST', '/platform/organisations/org-demo/forfait/prolonger', { mois: 1, apercu: true }],
  ] as const)('%s %s : 409, aucune écriture', async (method, url, payload) => {
    ecritures = []
    const res = await app.inject({ method, url, headers: superAdmin(), ...(payload ? { payload } : {}) })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('démonstration')
    expect(ecritures).toEqual([])
  })
})
```

Avant de lancer, vérifier le schéma du corps de `/forfait/prolonger` :

Run: `cd backend && sed -n '/forfait\/prolonger/,/async (req/p' src/routes/platform.route.ts | grep -n "required\|properties" -A6 | head -20`
Si le corps attend d'autres champs obligatoires que `mois` et `apercu`, compléter le `payload` du cas correspondant avec des valeurs valides (la validation ajv précède le préhandler : un corps invalide rendrait 400).

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `cd backend && npm run test -- --run tests/demo-platform.route.test.ts`
Expected: FAIL — `estDemo` absent de la liste ; les actions renvoient autre chose que 409.

- [ ] **Step 3: Exposer `estDemo` dans la vue plateforme**

Dans `backend/src/services/organisation.service.ts` :

1. `OrganisationResume`, après `forfait: Forfait` :

```ts
  /** Espace de démonstration (spec 2026-09-15) : listé, exclu des indicateurs, non modifiable. */
  estDemo: boolean
```

2. `SELECT_ORGANISATION_PLATEFORME`, après `forfaitExpireLe: true,` :

```ts
  estDemo: true,
```

3. `versVuePlateforme`, après `forfait: o.forfait,` :

```ts
    estDemo: o.estDemo === true,
```

- [ ] **Step 4: Ajouter le message**

`backend/src/locales/fr/platform.ts`, après `'platform.organisationIntrouvable'` :

```ts
  'platform.organisationDemo':
    "Espace de démonstration : il est géré par la régénération automatique, pas depuis la console.",
```

`backend/src/locales/en/platform.ts`, même position :

```ts
  'platform.organisationDemo': 'Demo space: it is managed by the automatic regeneration, not from the console.',
```

- [ ] **Step 5: Ajouter le préhandler 409**

Dans `backend/src/routes/platform.route.ts`, à l'intérieur de `platformRoutes`, juste après `const garde = { preHandler: [authenticate, requireSuperAdmin] }` :

```ts
  /**
   * Espace de démonstration (spec 2026-09-15 §1.7) : suspendre, réactiver, exporter, supprimer, changer
   * ou prolonger le forfait de la démo depuis la console → 409. Elle est gérée par la régénération ;
   * une suspension la couperait pour tous les visiteurs, une purge manuelle la ferait disparaître.
   * Lecture non scopée par id (SUPER_ADMIN sans contexte d'org) ; id inconnu → la route répond 404.
   */
  const refuserSiDemo = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Typage large (partagé par des routes aux génériques différents) : seules des routes `/:id` l'emploient.
    const { id } = req.params as { id: string }
    const org = await orgContext.runUnscoped(async () =>
      await app.prisma.organisation.findUnique({ where: { id }, select: { estDemo: true } }),
    )
    if (org?.estDemo === true) {
      reply
        .code(409)
        .send({ error: 'Conflict', message: t(langueDeRequete(req), 'platform.organisationDemo') })
    }
  }
  const gardeHorsDemo = { preHandler: [authenticate, requireSuperAdmin, refuserSiDemo] }
```

Ajouter `FastifyReply, FastifyRequest` à l'import de types en tête :

```ts
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
```

Puis, sur les six routes :
- `POST /platform/organisations/:id/suspendre` et `/reactiver` et `GET /platform/organisations/:id/export` : remplacer l'argument `garde,` par `gardeHorsDemo,`.
- `DELETE /platform/organisations/:id`, `PATCH /platform/organisations/:id/forfait`, `POST /platform/organisations/:id/forfait/prolonger` : dans leur objet d'options, remplacer `...garde,` par `...gardeHorsDemo,`.

Vérifier : `grep -n "gardeHorsDemo" backend/src/routes/platform.route.ts` → 7 lignes (1 déclaration + 6 usages). Si l'une des trois dernières routes n'utilise pas `...garde` mais un `preHandler` explicite, y ajouter `refuserSiDemo` en dernière position du tableau.

- [ ] **Step 6: Inscrire le nouvel appel `runUnscoped`**

Dans `backend/tests/runUnscoped-allowlist.test.ts`, remplacer `'routes/platform.route.ts': 7,` par `'routes/platform.route.ts': 8,` et compléter le commentaire qui précède, à la fin (avant `7 appels au total.`, remplacer cette phrase) :

```ts
  // SUPER_ADMIN, `Organisation` lue par id). + GARDE DÉMO (spec 2026-09-15 §1.7) : lecture de
  // `estDemo` par id avant toute action console — même justification. 8 appels au total.
```

- [ ] **Step 7: Lancer les tests plateforme**

Run: `cd backend && npm run test -- --run tests/demo-platform.route.test.ts tests/platform.route.test.ts tests/platform-purge.route.test.ts tests/platform-audit.route.test.ts tests/runUnscoped-allowlist.test.ts`
Expected: PASS. Si un test existant échoue parce que son mock `organisation.findUnique` lève ou compte ses appels, adapter le mock pour renvoyer une ligne sans `estDemo` (lue comme non démo) — ne jamais retirer le préhandler.

- [ ] **Step 8: Saboter dans la direction utile**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
cp src/routes/platform.route.ts "${TMPDIR:-/tmp}/platform.route.bak"
sed -i '' 's/if (org?.estDemo === true) {/if (false \&\& org?.estDemo === true) {/' src/routes/platform.route.ts
grep -c "if (false && org?.estDemo === true)" src/routes/platform.route.ts
npm run test -- --run tests/demo-platform.route.test.ts 2>&1 | grep -E "Tests "
cp "${TMPDIR:-/tmp}/platform.route.bak" src/routes/platform.route.ts
npm run test -- --run tests/demo-platform.route.test.ts 2>&1 | grep -E "Tests "
```

Expected : `1` ; `6 failed | 1 passed` ; restauré `7 passed`.

- [ ] **Step 9: Écrire le test front**

Dans `frontend/src/pages/SuperAdminPage.test.tsx`, ajouter à la fin du fichier (le fichier définit déjà `org`, `ORGS`, `listOrganisations`, `carte`) :

```tsx
describe('SuperAdminPage — espace de démonstration', () => {
  const DEMO = { ...org('o-demo', 'Association Exemple NKONI', 'PRO', 'SANS_ECHEANCE', null), estDemo: true, nbMembres: 45 }

  it('listé avec un badge, mais exclu des indicateurs', async () => {
    listOrganisations.mockResolvedValue({ organisations: [...ORGS, DEMO] })
    render(<MemoryRouter><SuperAdminPage /></MemoryRouter>)
    expect(await screen.findByText('Association Exemple NKONI')).toBeTruthy()
    expect(screen.getByText('superAdmin.table.demo')).toBeTruthy()
    // Sans la démo : 1 seul payant sans échéance (Famille Historique), pas 2.
    expect(within(carte('superAdmin.kpi.sansEcheance')).getByText('1')).toBeTruthy()
  })

  it('fiche détail : aucun geste de gestion, une mention explicative', async () => {
    listOrganisations.mockResolvedValue({ organisations: [DEMO] })
    render(<MemoryRouter><SuperAdminPage /></MemoryRouter>)
    fireEvent.click((await screen.findAllByLabelText('superAdmin.table.ouvrirDetail'))[0]!)
    expect(screen.getByText('superAdmin.detail.demoGeree')).toBeTruthy()
    expect(screen.queryByText('superAdmin.table.suspendre')).toBeNull()
    expect(screen.queryByText('superAdmin.prolongation.titre')).toBeNull()
    const selecteur = screen.getAllByLabelText('superAdmin.table.forfaitLabel') as HTMLSelectElement[]
    expect(selecteur.every((s) => s.disabled)).toBe(true)
  })
})
```

- [ ] **Step 10: Lancer le test front, vérifier l'échec**

Run: `cd frontend && npx vitest run src/pages/SuperAdminPage.test.tsx`
Expected: FAIL — `superAdmin.table.demo` introuvable, compteur à 2, mention absente.

- [ ] **Step 11: Implémenter côté front**

1. `frontend/src/lib/api/platform.ts`, interface `PlatformOrganisation`, après `nbMembres: number` :

```ts
  /** Espace de démonstration (spec 2026-09-15) — optionnel : une API antérieure ne l'envoie pas. */
  estDemo?: boolean
```

2. `frontend/src/pages/SuperAdminPage.tsx`, dans le `useMemo` des KPIs, remplacer :

```tsx
    const liste = organisations ?? []
```

par :

```tsx
    // L'espace de démonstration est LISTÉ dans le tableau mais n'est pas un client : hors indicateurs.
    const liste = (organisations ?? []).filter((o) => !o.estDemo)
```

3. Cellule de la colonne `organisation`, remplacer :

```tsx
          <p className="truncate font-medium text-foreground">{o.nom}</p>
```

par :

```tsx
          <p className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium text-foreground">{o.nom}</span>
            {o.estDemo && (
              <Badge tone="info" size="sm">
                {t('superAdmin.table.demo')}
              </Badge>
            )}
          </p>
```

4. Les DEUX usages de `SelecteurForfait` : `disabled={pendingId === o.id}` devient `disabled={pendingId === o.id || o.estDemo === true}` (tableau) et `disabled={pendingId === detailOrg.id}` devient `disabled={pendingId === detailOrg.id || detailOrg.estDemo === true}` (fiche).

5. Fiche détail : remplacer `{accessToken && (` (avant `<ProlongationForfait`) par `{accessToken && !detailOrg.estDemo && (` ; remplacer `{!detailOrg.actif && (` (zone danger) par `{!detailOrg.actif && !detailOrg.estDemo && (`.

6. Pied de la fiche : remplacer le bloc

```tsx
              {detailOrg.actif ? (
```

jusqu'à la fin de son ternaire (le `)}` qui suit le bouton « Réactiver ») par :

```tsx
              {detailOrg.estDemo ? null : detailOrg.actif ? (
```

en conservant intégralement les deux branches existantes (bouton « Suspendre » puis bouton « Réactiver »).

7. Juste avant `<div className="flex justify-end gap-2 border-t border-hairline pt-4">` du pied de la fiche :

```tsx
            {detailOrg.estDemo && (
              <p className="rounded-xl border border-info/30 bg-info/[0.06] px-3.5 py-3 text-sm text-muted-foreground">
                {t('superAdmin.detail.demoGeree')}
              </p>
            )}
```

8. `frontend/src/locales/fr/superAdmin.ts` : dans `detail`, après `fermer: 'Fermer',` :

```ts
      demoGeree:
        'Espace de démonstration public, régénéré automatiquement chaque semaine : aucune action de gestion depuis la console.',
```

dans `table`, après `suspendue: 'Suspendue',` :

```ts
      demo: 'Démo',
```

`frontend/src/locales/en/superAdmin.ts` : dans `detail`, après `fermer: 'Close',` :

```ts
      demoGeree: 'Public demo space, regenerated automatically every week: no management action from the console.',
```

dans `table`, après `suspendue: 'Suspended',` :

```ts
      demo: 'Demo',
```

Vérifier que `bg-info/[0.06]` et `border-info/30` existent déjà ailleurs (`grep -rn "border-info/" frontend/src | head -3`) ; sinon utiliser `border-hairline bg-surface-2`.

- [ ] **Step 12: Lancer les vérifications front**

```bash
cd /Users/nelson/Documents/Projets/nkoni/frontend
npx vitest run src/pages/SuperAdminPage.test.tsx
npm run build
npx oxlint
npm run test
```

Expected : 5 tests dans `SuperAdminPage.test.tsx` passent ; build propre ; oxlint sort en 0 sans finding ; toute la suite passe. Le mock `t` du fichier renvoie la clé sans interpolation : le libellé du bouton de détail vaut donc exactement `superAdmin.table.ouvrirDetail`. Si `superAdmin.table.suspendre` apparaît ailleurs que dans le pied de fiche (vue mobile du tableau), restreindre la requête à la modale : `within(screen.getByRole('dialog'))`.

- [ ] **Step 13: Suite backend et commit**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'
cd .. && git add backend/src/services/organisation.service.ts backend/src/routes/platform.route.ts backend/src/locales/fr/platform.ts backend/src/locales/en/platform.ts backend/tests/demo-platform.route.test.ts backend/tests/runUnscoped-allowlist.test.ts frontend/src/lib/api/platform.ts frontend/src/pages/SuperAdminPage.tsx frontend/src/pages/SuperAdminPage.test.tsx frontend/src/locales/fr/superAdmin.ts frontend/src/locales/en/superAdmin.ts
git add -u backend/tests
git commit -m "feat(demo): la console liste l'espace de démonstration sans le compter ni le modifier

API : estDemo dans la vue plateforme ; suspendre, réactiver, exporter, supprimer,
changer ou prolonger le forfait de la démo → 409 avant toute écriture (sabotage
vérifié). Console : badge Démo, exclusion des indicateurs, sélecteur de forfait
désactivé, fiche sans geste de gestion.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Documentation, vérification finale, PR

**Files:**
- Create: `docs/architecture-demo.md`
- Modify: `CLAUDE.md` (bloc « Architecture — points essentiels » et « Docs de référence »)
- Modify: `docs/roadmap-v1-vers-GA.md` (ligne 1.2)

**Interfaces:**
- Consumes: tout ce qui précède.

- [ ] **Step 1: Écrire `docs/architecture-demo.md`**

```markdown
# Espace de démonstration partagé (chantier 1.2, spec `2026-09-15-onboarding-demo-design.md`)

Une organisation **fictive**, **unique** et **partagée**, ouverte sans compte pour voir un espace rempli.
Livrée en trois PR : **socle serveur** (ce document, §1-4), générateur et régénération (§5, PR 2),
front de démonstration (§6, PR 3).

## 1. Marqueur et interrupteur

- `Organisation.estDemo` (défaut `false`). Écarté : réutiliser une organisation suspendue — elle
  s'afficherait « suspendue » et reposerait sur le fait qu'`authenticate` ne lit pas `actif`.
- `DEMO_ACTIVEE` (Railway) : `true` = sessions émises et régénération nocturne ; sinon démo éteinte.
  Décoration `app.demoActivee`, injectable dans `buildApp` pour les tests.

## 2. Session : une seule porte d'entrée

- `POST /demo/session` (public, 10/min par IP) : 404 si la démo est éteinte ou absente ; sinon un access
  token du premier ADMIN actif de la démo la plus récente, porteur de **`demo: true`**, **sans cookie de
  refresh** — le cookie d'un administrateur réel connecté dans le même navigateur a le même nom et le même
  chemin, l'écraser le déconnecterait.
- Login et refresh **refusent** un compte d'organisation démo (login : même réponse que des identifiants
  invalides). Conséquence voulue : aucun jeton de la démo **sans** claim `demo` ne peut exister.

## 3. Lecture seule

- Garde dans `authenticate` (toutes les routes tenant y passent, une route future est couverte sans y
  penser) : jeton `demo` + méthode autre que GET/HEAD → 403 `commun.demoLectureSeule`, avant toute requête
  en base. Règle pure `lib/demo.ts::estRequeteAutoriseeEnDemo`.
- Exceptions par « MÉTHODE motif » **exact** : `POST /equilibrages/simuler` seulement (`POST /equilibrages`
  applique réellement). Ajouter une exception = prouver qu'elle n'écrit rien (base, Blob, envoi) ; la liste
  est figée par `tests/demo.test.ts`.
- Ce que la validation ajv impose aux tests : elle précède les préhandlers, un corps invalide rend 400 sans
  prouver le garde — les tests envoient des corps valides et vérifient que la base n'est pas touchée.

## 4. Tâches de fond et console

- Retards, rappels de réunion, relances de forfait (e-mail Resend) et réconciliation PSP filtrent
  `estDemo: false`. **Verrou textuel** `tests/demo-taches-de-fond.test.ts` sur tout `organisation.findMany(`
  de `src/services/` (exceptions : console, rétention) ; preuve contre Postgres dans
  `demo-taches-de-fond.integration.test.ts`. Toute nouvelle boucle de fond doit filtrer la démo.
- La purge de rétention s'applique aussi à la démo (inoffensif, elle est régénérée bien avant 12 mois).
- Console plateforme : la démo est listée (badge « Démo ») mais exclue des indicateurs ; suspendre,
  réactiver, exporter, supprimer, changer ou prolonger son forfait → **409** (préhandler `refuserSiDemo`).
```

- [ ] **Step 2: Ajouter le pointeur et les invariants dans `CLAUDE.md`**

Dans `CLAUDE.md`, section « Architecture — points essentiels », juste AVANT le paragraphe qui commence par `**Bannière d'incident / page de statut (§2.2/§8)**`, insérer :

```markdown
**Espace de démonstration (chantier 1.2)** — organisation fictive partagée `Organisation.estDemo`, ouverte sans compte par `POST /demo/session` (404 tant que `DEMO_ACTIVEE` ≠ `true`). Détail : [`docs/architecture-demo.md`](docs/architecture-demo.md). Invariants :
- **Un jeton `demo` n'écrit jamais** : garde dans `authenticate` (méthode ≠ GET/HEAD → 403), exceptions EXACTES dans `lib/demo.ts` (aujourd'hui `POST /equilibrages/simuler` seul). Login et refresh refusent un compte démo : aucun jeton de la démo sans claim `demo`.
- **Toute boucle de fond sur les organisations filtre `estDemo: false`** (verrou textuel `demo-taches-de-fond.test.ts`) ; la console la liste mais ne la compte ni ne la modifie (409).
```

Dans la section « Docs de référence », après l'entrée `docs/architecture-forfaits.md` :

```markdown
- `docs/architecture-demo.md` — **espace de démonstration partagé** (chantier 1.2) : marqueur et interrupteur, session sans cookie par une porte unique, garde lecture seule dans `authenticate`, tâches de fond et console qui l'ignorent (PR 1) ; générateur et régénération (PR 2) ; front de démonstration (PR 3). Y aller dès qu'on touche à l'auth, à une boucle de fond sur les organisations ou à la démo.
```

- [ ] **Step 3: Mettre à jour la roadmap**

Dans `docs/roadmap-v1-vers-GA.md`, ligne 1.2, remplacer `**Reste** : données d'exemple optionnelles, aide contextuelle, tutoriel.` par :

```markdown
**Données d'exemple → espace de démonstration partagé en lecture seule** (spec [`superpowers/specs/2026-09-15-onboarding-demo-design.md`](superpowers/specs/2026-09-15-onboarding-demo-design.md), 3 PR) : **PR 1 socle serveur livrée** (marqueur, session démo, garde lecture seule, tâches de fond et console) ; restent le générateur/régénération (PR 2) et le front (PR 3). **Reste ensuite** : aide contextuelle, tutoriel.
```

- [ ] **Step 4: Vérification complète**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run build
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npm run test -- --run
cd ../frontend
npm run build && npx oxlint && npm run test
```

Expected : build backend propre ; **toute** la suite backend passe, intégrations comprises, sur `nkoni_it_demo` (les tests d'intégration exigent aussi `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` dans `.env`) ; front build + oxlint + tests verts. Coller le résumé (`Test Files … Tests …`) dans le compte rendu.

- [ ] **Step 5: Relire ce qui part dans un dépôt public**

```bash
cd /Users/nelson/Documents/Projets/nkoni
git diff main --stat
git diff main -- docs CLAUDE.md | grep -inE "password|secret|token=|postgresql://[^$]" || echo "rien de sensible"
```

Expected : seuls les fichiers de ce plan ; `rien de sensible` (les URL de test utilisent `$(id -un)`, jamais un mot de passe).

- [ ] **Step 6: Commit docs, pousser, ouvrir la PR**

```bash
cd /Users/nelson/Documents/Projets/nkoni
git add docs/architecture-demo.md CLAUDE.md docs/roadmap-v1-vers-GA.md
git commit -m "docs(demo): architecture de l'espace de démonstration, invariants dans CLAUDE.md

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -u origin feat/demo-socle-serveur
gh pr create --title "feat(demo): socle serveur de l'espace de démonstration (1.2, PR 1/3)" --body "$(cat <<'EOF'
Spec : docs/superpowers/specs/2026-09-15-onboarding-demo-design.md (§1, §4.1 PR 1).

## Quoi
- `Organisation.estDemo` + interrupteur `DEMO_ACTIVEE` (éteint par défaut).
- `POST /demo/session` : public, 10/min, 404 si démo éteinte/absente ; jeton `demo: true` sans cookie de refresh.
- Garde lecture seule dans `authenticate` (403 sur toute méthode ≠ GET/HEAD, exception exacte `POST /equilibrages/simuler`).
- Login et refresh refusés pour un compte démo (porte d'entrée unique).
- Tâches de fond (retards, rappels, relances de forfait, réconciliation PSP) : `estDemo: false`, verrou textuel + intégration.
- Console : badge « Démo », exclue des indicateurs, 409 sur toute action.

## Effet en production
Aucun tant qu'aucune organisation démo n'existe (générateur = PR 2) et que `DEMO_ACTIVEE` n'est pas posé. Migration additive (défaut false).

## Vérification
Sabotages dans la direction utile (garde, refus d'auth, filtre de tâche, 409 console) ; suite backend complète sur base jetable ; front build + oxlint + tests.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 7: Vérifier que la CI a réellement démarré**

```bash
cd /Users/nelson/Documents/Projets/nkoni
for i in $(seq 1 20); do n=$(gh run list --branch feat/demo-socle-serveur --json databaseId --jq length); [ "$n" -gt 0 ] && break; sleep 6; done
gh run list --branch feat/demo-socle-serveur --limit 1
```

Expected : un run `CI` présent. S'il n'apparaît pas en 2 minutes : `gh pr close <n> && gh pr reopen <n>` (événement `pull_request` perdu, cf. CLAUDE.md). Ne pas fusionner : le PO décide.
