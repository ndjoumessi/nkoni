# Espace de démonstration — PR 2 « Générateur et régénération » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produire et entretenir l'organisation fictive de démonstration : un générateur déterministe qui passe par les services métier réels, une suppression gardée qui ne touche qu'une démo, une régénération hebdomadaire nocturne sans trou de service, et la commande `npm run demo:generer` pour la première création.

**Architecture:** `demo-donnees.ts` décrit la démo en données pures (membres, versements, dépenses…) calculées depuis `now`, testables sans base. `demo-generateur.service.ts` crée l'organisation par `inscrireOrganisation`, la marque `estDemo: true, actif: false`, la remplit via les services (versements, reçus, tontine, votes…) sous `auditContext.run` + `orgContext.run`, puis l'active ; en cas d'échec il supprime ce qu'il a créé. `demo-suppression.service.ts` réutilise la purge de tenant existante mais relit `estDemo` dans la transaction et refuse toute organisation réelle. `demo-regeneration.service.ts` décide (démo récente → rien ; sinon générer la nouvelle PUIS supprimer les anciennes) et porte l'étape nocturne branchée après la rétention.

**Tech Stack:** Fastify 5, Prisma 7 (adapter-pg), PostgreSQL, Vitest, `tsx` pour le script ; frontend Vite + React (libellé d'une action du journal plateforme seulement).

**Spec:** `docs/superpowers/specs/2026-09-15-onboarding-demo-design.md` (§3 en entier, §4.1 « PR 2 », §4.3). Socle déjà livré (PR 1, #149) : `Organisation.estDemo`, `DEMO_ACTIVEE`/`app.demoActivee`, `POST /demo/session` + `chargerCompteDemo`, garde lecture seule, tâches de fond filtrées, console. Doc existante : `docs/architecture-demo.md` §1-4.

## Global Constraints

- Français partout : noms métier, commentaires, messages, commits.
- Branche `feat/demo-generateur` (créée avec le commit de ce plan), jamais de commit sur `main`, merge `--no-ff` par PR (le PO fusionne).
- **Jamais de migration ni de test sur la base de dev `nkoni`** : base jetable `nkoni_it_demo` uniquement (`DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable"`, binaires `/opt/homebrew/opt/postgresql@18/bin`).
- Données de démo **fictives** : noms inventés, téléphones dans la plage `600…` non attribuée, e-mail du compte en `@demo.nkoni.invalid` (TLD réservé, jamais délivrable).
- Le générateur **n'envoie rien** : aucun appel à `notifierVersement`, `envoyerRecu`, WhatsApp, e-mail, push ou PSP.
- Toute nouvelle occurrence de `orgContext.runUnscoped` sous `backend/src/` est inscrite et justifiée dans `tests/runUnscoped-allowlist.test.ts` ; tout nouvel `organisation.findMany(` sous `backend/src/` est compté dans `tests/demo-taches-de-fond.test.ts`.
- Tests d'intégration : la base est PARTAGÉE par des fichiers exécutés en parallèle — un test qui liste les organisations démo doit se restreindre à SES identifiants (Proxy `tests/support/prisma-espion.ts`), et les fichiers qui créent/suppriment des organisations appellent `exigerBaseDeTest()`.
- Garde-fous sabotés dans la direction utile, sabotage vérifié (grep) avant d'interpréter le rouge.
- Vérification avant présentation : backend `npm run build` + `npm run test -- --run` (intégrations sur `nkoni_it_demo`) ; frontend `npm run build` + `npx oxlint` + `npm run test`.
- Messages de commit terminés par `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Disque hôte presque plein (~3 Gio) : sur `ENOSPC`, réessayer une fois puis signaler, ne rien supprimer hors du dépôt.

## File Structure

| Fichier | Rôle |
|---|---|
| `backend/prisma/schema.prisma` + `migrations/20260916090000_action_plateforme_supprimer_demo/` | valeur d'enum `SUPPRIMER_DEMO` |
| `backend/src/services/platform-audit.service.ts` | union + `acteurEmail` imposable (acteur système) |
| `backend/src/routes/platform.route.ts` | `ACTIONS_PLATEFORME` |
| `frontend/src/lib/api/platform.ts`, `pages/PlatformAuditPage.tsx`, `locales/{fr,en}/superAdmin.ts` | action visible dans l'historique |
| `backend/src/services/demo-donnees.ts` (nouveau) | description pure et déterministe de la démo |
| `backend/src/services/demo-suppression.service.ts` (nouveau) | `supprimerOrganisationDemo` |
| `backend/src/services/demo-generateur.service.ts` (nouveau) | `genererOrganisationDemo` |
| `backend/src/services/demo-regeneration.service.ts` (nouveau) | `regenererDemo`, `executerEtapeDemo` |
| `backend/src/services/notification-scheduler.ts` | étape DÉMO après la rétention |
| `backend/prisma/generer-demo.ts` (nouveau) + `backend/package.json` | `npm run demo:generer` |
| `backend/tests/support/prisma-espion.ts` (nouveau) | Proxy de restriction pour les intégrations |
| `docs/architecture-demo.md`, `CLAUDE.md`, `docs/roadmap-v1-vers-GA.md` | documentation |

---

### Task 1: Action plateforme `SUPPRIMER_DEMO`

**Files:**
- Modify: `backend/prisma/schema.prisma` (`enum ActionPlateforme`)
- Create: `backend/prisma/migrations/20260916090000_action_plateforme_supprimer_demo/migration.sql`
- Modify: `backend/src/services/platform-audit.service.ts` (union `ActionPlateforme`, `JournalActionParams`, `journaliserActionPlateforme`)
- Modify: `backend/src/routes/platform.route.ts` (`ACTIONS_PLATEFORME`)
- Modify: `frontend/src/lib/api/platform.ts` (union), `frontend/src/pages/PlatformAuditPage.tsx` (`ACTIONS`, `TON_ACTION`), `frontend/src/locales/fr/superAdmin.ts`, `frontend/src/locales/en/superAdmin.ts` (`actions`)
- Test: `backend/tests/platform-audit.service.test.ts`, `backend/tests/platform-audit.route.test.ts`

**Interfaces:**
- Produces: valeur `'SUPPRIMER_DEMO'` de `ActionPlateforme` (Prisma, backend, frontend) ; `JournalActionParams.acteurEmail?: string` — fourni, il est écrit tel quel sans lecture de `Utilisateur`.

- [ ] **Step 1: Se placer sur la branche**

```bash
cd /Users/nelson/Documents/Projets/nkoni
git switch feat/demo-generateur && git status --short
```

Expected : branche `feat/demo-generateur`, arbre propre.

- [ ] **Step 2: Écrire les tests**

Dans `backend/tests/platform-audit.service.test.ts`, dans le `describe('journaliserActionPlateforme', …)`, ajouter :

```ts
  it('acteur SYSTÈME : `acteurEmail` imposé est écrit tel quel, sans lire Utilisateur', async () => {
    const creations: any[] = []
    let lectures = 0
    const prisma = {
      utilisateur: {
        findUnique: async () => {
          lectures++
          return null
        },
      },
      platformAuditLog: { create: async (a: any) => (creations.push(a.data), a.data) },
    }
    await journaliserActionPlateforme(prisma, {
      acteurId: 'systeme',
      acteurEmail: 'systeme@nkoni',
      action: 'SUPPRIMER_DEMO',
      organisationCibleId: 'org-demo',
      organisationNom: 'Association Exemple NKONI',
    })
    expect(lectures).toBe(0)
    expect(creations[0]).toMatchObject({ acteurId: 'systeme', acteurEmail: 'systeme@nkoni', action: 'SUPPRIMER_DEMO' })
  })
```

Dans `backend/tests/platform-audit.route.test.ts`, repérer le test qui filtre par `action=PROLONGER_FORFAIT` (autour de la ligne 218) et ajouter à côté un test jumeau qui envoie `action=SUPPRIMER_DEMO` avec le même mock et le même jeton, et vérifie `statusCode === 200` et que le `where` transmis à `platformAuditLog.findMany` contient `action: 'SUPPRIMER_DEMO'` (même forme d'assertion que le test jumeau — recopier sa structure en remplaçant la valeur).

- [ ] **Step 3: Lancer les tests, vérifier l'échec**

Run: `cd backend && npm run test -- --run tests/platform-audit.service.test.ts tests/platform-audit.route.test.ts`
Expected: FAIL — le service lit `Utilisateur` et écrit `(inconnu)` ; la route répond 400 (valeur hors `enum` ajv).

- [ ] **Step 4: Schéma et migration**

`backend/prisma/schema.prisma`, `enum ActionPlateforme`, ajouter en dernière valeur :

```prisma
  SUPPRIMER_DEMO // espace de démonstration remplacé par sa régénération (acteur système)
```

Créer `backend/prisma/migrations/20260916090000_action_plateforme_supprimer_demo/migration.sql` :

```sql
-- Espace de démonstration (spec 2026-09-15 §3.2) : suppression d'une ancienne démo journalisée.
-- ADD VALUE SEUL dans sa migration : une valeur d'enum Postgres ne peut pas être utilisée dans la
-- transaction qui l'ajoute (CLAUDE.md, Conventions).
ALTER TYPE "ActionPlateforme" ADD VALUE 'SUPPRIMER_DEMO';
```

Valider sur la base jetable :

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
PG=/opt/homebrew/opt/postgresql@18/bin
export DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable"
$PG/psql "$DATABASE_URL" -tAc "select 1" || { $PG/createdb nkoni_it_demo; }
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code; echo "diff exit=$?"
$PG/psql "$DATABASE_URL" -tAc "select string_agg(e::text, ',') from unnest(enum_range(NULL::\"ActionPlateforme\")) e"
npx prisma generate
```

Expected : migrations appliquées ; `diff exit=0` ; l'enum se termine par `,SUPPRIMER_DEMO`.

- [ ] **Step 5: Backend**

`backend/src/services/platform-audit.service.ts` :

```ts
export type ActionPlateforme =
  | 'CHANGER_FORFAIT'
  | 'PROLONGER_FORFAIT'
  | 'SUSPENDRE'
  | 'REACTIVER'
  | 'PURGER'
  | 'EXPORTER'
  | 'SUPPRIMER_DEMO'
```

Dans `JournalActionParams`, après `acteurId: string` :

```ts
  /**
   * Snapshot imposé de l'acteur. Réservé aux actions SYSTÈME (régénération de la démo) dont l'acteur
   * n'est pas un compte : fourni, il est écrit tel quel et `Utilisateur` n'est pas lu.
   */
  acteurEmail?: string
```

Dans `journaliserActionPlateforme`, remplacer la lecture et l'écriture de l'e-mail par :

```ts
  const acteurEmail =
    params.acteurEmail ??
    (
      await prisma.utilisateur.findUnique({
        where: { id: params.acteurId },
        select: { email: true },
      })
    )?.email ??
    '(inconnu)'
  await prisma.platformAuditLog.create({
    data: {
      acteurId: params.acteurId,
      acteurEmail,
```

(le reste de `data` est inchangé).

`backend/src/routes/platform.route.ts`, `ACTIONS_PLATEFORME` : ajouter `'SUPPRIMER_DEMO',` après `'EXPORTER',`.

- [ ] **Step 6: Frontend**

`frontend/src/lib/api/platform.ts` : ajouter `| 'SUPPRIMER_DEMO'` à la fin de l'union `ActionPlateforme`.

`frontend/src/pages/PlatformAuditPage.tsx` : ajouter `'SUPPRIMER_DEMO',` à la fin de `ACTIONS` et `SUPPRIMER_DEMO: 'info',` à la fin de `TON_ACTION`.

`frontend/src/locales/fr/superAdmin.ts`, objet `actions`, après `EXPORTER: 'Export',` :

```ts
        SUPPRIMER_DEMO: 'Démo remplacée (ancienne supprimée)',
```

`frontend/src/locales/en/superAdmin.ts`, même position :

```ts
        SUPPRIMER_DEMO: 'Demo replaced (old one deleted)',
```

- [ ] **Step 7: Vérifier**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run test -- --run tests/platform-audit.service.test.ts tests/platform-audit.route.test.ts
npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'
cd ../frontend && npm run build && npx oxlint && npm run test
```

Expected : les deux fichiers ciblés passent ; build backend propre ; suite backend verte ; front build + oxlint (0 finding) + tests verts.

- [ ] **Step 8: Commit**

```bash
cd /Users/nelson/Documents/Projets/nkoni
git add backend/prisma/schema.prisma backend/prisma/migrations/20260916090000_action_plateforme_supprimer_demo backend/src/services/platform-audit.service.ts backend/src/routes/platform.route.ts backend/tests/platform-audit.service.test.ts backend/tests/platform-audit.route.test.ts frontend/src/lib/api/platform.ts frontend/src/pages/PlatformAuditPage.tsx frontend/src/locales/fr/superAdmin.ts frontend/src/locales/en/superAdmin.ts
git commit -m "feat(demo): action plateforme SUPPRIMER_DEMO et acteur système du journal

ADD VALUE seule dans sa migration (validée sur base jetable). acteurEmail
imposable pour une action système, sans lecture d'Utilisateur. Filtre de
l'historique et libellés FR/EN.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Description pure et déterministe de la démo

**Files:**
- Create: `backend/src/services/demo-donnees.ts`
- Test: `backend/tests/demo-donnees.test.ts`

**Interfaces:**
- Produces:
  - `NOM_ORGANISATION_DEMO: string`, `BRANCHES_DEMO: readonly string[]`, `NOMBRE_MEMBRES_DEMO = 45`
  - `type ProfilCotisation = 'A_JOUR' | 'PARTIEL' | 'EN_RETARD'`
  - `interface MembreDemo { cle: string; nom: string; prenom: string; sexe: 'M' | 'F'; brancheIndex: number; statut: 'ACTIF' | 'INACTIF' | 'DECEDE'; anneeAdhesion: number; anneeFinContribution: number | null; profil: ProfilCotisation; telephone: string }`
  - `construireMembresDemo(anneeCourante: number): MembreDemo[]` — l'indice 0 est la présidente.
  - `baremesDemo(anneeCourante: number): { annee: number; montantAttendu: number }[]`
  - `interface VersementDemo { cleMembre: string; annee: number; montant: number; date: Date; mode: 'ESPECES' | 'MOBILE_MONEY' | 'TIERS' }`
  - `planifierVersementsDemo(membres: MembreDemo[], anneeCourante: number, now: Date): VersementDemo[]` — trié par date puis par clé.
  - `interface DepenseDemo { description: string; montant: number; categorie: 'AIDE_MEMBRE' | 'FUNERAILLES' | 'EVENEMENT' | 'FONCTIONNEMENT' | 'AUTRE'; cible: 'BROUILLON' | 'EN_ATTENTE' | 'APPROUVEE' | 'REJETEE' | 'PAYEE'; joursAvant: number; motifRejet?: string }`
  - `DEPENSES_DEMO: readonly DepenseDemo[]` (8 entrées)

- [ ] **Step 1: Écrire le test**

Créer `backend/tests/demo-donnees.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { calculerStatutContribution } from '../src/services/statutContribution'
import {
  BRANCHES_DEMO,
  DEPENSES_DEMO,
  NOMBRE_MEMBRES_DEMO,
  baremesDemo,
  construireMembresDemo,
  planifierVersementsDemo,
} from '../src/services/demo-donnees'

/**
 * Description de la démo (spec 2026-09-15 §3.1), sans base : volumes, répartition des statuts de
 * cotisation, déterminisme, et cohérence avec la règle de statut RÉELLE (`calculerStatutContribution`).
 */

const ANNEE = 2027
const NOW = new Date('2027-05-20T10:00:00.000Z')

describe('construireMembresDemo', () => {
  const membres = construireMembresDemo(ANNEE)

  it('45 membres, noms complets uniques, 3 branches utilisées', () => {
    expect(membres).toHaveLength(NOMBRE_MEMBRES_DEMO)
    expect(new Set(membres.map((m) => `${m.prenom} ${m.nom}`)).size).toBe(NOMBRE_MEMBRES_DEMO)
    expect(new Set(membres.map((m) => m.brancheIndex))).toEqual(new Set([0, 1, 2]))
    expect(BRANCHES_DEMO).toHaveLength(3)
  })

  it('statuts : 42 actifs, 2 inactifs, 1 décédé ; profils des actifs 25 / 11 / 6', () => {
    expect(membres.filter((m) => m.statut === 'INACTIF')).toHaveLength(2)
    expect(membres.filter((m) => m.statut === 'DECEDE')).toHaveLength(1)
    const actifs = membres.filter((m) => m.statut === 'ACTIF')
    expect(actifs).toHaveLength(42)
    expect(actifs.filter((m) => m.profil === 'A_JOUR')).toHaveLength(25)
    expect(actifs.filter((m) => m.profil === 'PARTIEL')).toHaveLength(11)
    expect(actifs.filter((m) => m.profil === 'EN_RETARD')).toHaveLength(6)
  })

  it('la présidente (indice 0) est active et à jour ; les non-actifs ont une fin de contribution', () => {
    expect(membres[0]).toMatchObject({ statut: 'ACTIF', profil: 'A_JOUR', anneeAdhesion: ANNEE - 2 })
    for (const m of membres.filter((x) => x.statut !== 'ACTIF')) expect(m.anneeFinContribution).toBe(ANNEE - 1)
  })

  it('téléphones fictifs dans la plage 600 non attribuée, jamais d’adhésion future', () => {
    for (const m of membres) {
      expect(m.telephone).toMatch(/^6000000\d{2}$/)
      expect(m.anneeAdhesion).toBeLessThanOrEqual(ANNEE)
    }
  })

  it('déterministe', () => {
    expect(construireMembresDemo(ANNEE)).toEqual(membres)
  })
})

describe('planifierVersementsDemo', () => {
  const membres = construireMembresDemo(ANNEE)
  const baremes = baremesDemo(ANNEE)
  const plan = planifierVersementsDemo(membres, ANNEE, NOW)

  it('aucun versement futur, trié par date', () => {
    for (const v of plan) expect(v.date.getTime()).toBeLessThanOrEqual(NOW.getTime())
    const dates = plan.map((v) => v.date.getTime())
    expect([...dates].sort((a, b) => a - b)).toEqual(dates)
  })

  it('chaque actif obtient le statut de son profil avec la règle réelle', () => {
    const attendu = { A_JOUR: 'A_JOUR', PARTIEL: 'PARTIEL', EN_RETARD: 'NON_A_JOUR' } as const
    for (const m of membres.filter((x) => x.statut === 'ACTIF')) {
      const parAnnee = new Map<number, number>()
      for (const v of plan.filter((x) => x.cleMembre === m.cle)) parAnnee.set(v.annee, (parAnnee.get(v.annee) ?? 0) + v.montant)
      const { statut } = calculerStatutContribution({
        baremes,
        contributions: [...parAnnee].map(([annee, montantValorise]) => ({ annee, montantValorise })),
        anneeAdhesion: m.anneeAdhesion,
        anneeFinContribution: m.anneeFinContribution,
        anneeCourante: ANNEE,
      })
      expect(statut, `${m.prenom} ${m.nom}`).toBe(attendu[m.profil])
    }
  })

  it('volume réaliste (plus de 100 versements) et déterministe', () => {
    expect(plan.length).toBeGreaterThan(100)
    expect(planifierVersementsDemo(membres, ANNEE, NOW)).toEqual(plan)
  })

  it('en tout début d’année, le versement de l’année courante reste daté dans l’année', () => {
    const debut = new Date('2027-01-01T00:30:00.000Z')
    const courants = planifierVersementsDemo(membres, ANNEE, debut).filter((v) => v.annee === ANNEE)
    expect(courants.length).toBeGreaterThan(0)
    for (const v of courants) expect(v.date.getUTCFullYear()).toBe(ANNEE)
  })
})

describe('DEPENSES_DEMO', () => {
  it('8 dépenses couvrant tout le workflow, dont une rejetée avec motif', () => {
    expect(DEPENSES_DEMO).toHaveLength(8)
    expect(new Set(DEPENSES_DEMO.map((d) => d.cible))).toEqual(new Set(['BROUILLON', 'EN_ATTENTE', 'APPROUVEE', 'REJETEE', 'PAYEE']))
    expect(DEPENSES_DEMO.find((d) => d.cible === 'REJETEE')?.motifRejet).toBeTruthy()
  })
})
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `cd backend && npm run test -- --run tests/demo-donnees.test.ts`
Expected: FAIL — `Failed to resolve import "../src/services/demo-donnees"`.

- [ ] **Step 3: Écrire le module**

Créer `backend/src/services/demo-donnees.ts` :

```ts
/**
 * Espace de démonstration (spec 2026-09-15 §3.1) — description PURE et DÉTERMINISTE de la démo.
 *
 * Aucune base, aucune horloge implicite : tout dérive de `anneeCourante` et `now`. Le déterminisme vient
 * des indices (pas d'aléa) — deux générations produisent la même démo, seules les dates suivent
 * « aujourd'hui ». Toutes les personnes sont FICTIVES (noms et prénoms combinés, téléphones dans la
 * plage 600 non attribuée au Cameroun).
 */

export const NOM_ORGANISATION_DEMO = 'Association Exemple NKONI'
export const BRANCHES_DEMO = ['Branche Centre', 'Branche Littoral', 'Branche Diaspora'] as const
export const NOMBRE_MEMBRES_DEMO = 45

export type ProfilCotisation = 'A_JOUR' | 'PARTIEL' | 'EN_RETARD'

export interface MembreDemo {
  cle: string
  nom: string
  prenom: string
  sexe: 'M' | 'F'
  brancheIndex: number
  statut: 'ACTIF' | 'INACTIF' | 'DECEDE'
  anneeAdhesion: number
  anneeFinContribution: number | null
  profil: ProfilCotisation
  telephone: string
}

const NOMS = ['Abena', 'Bilong', 'Djomo', 'Ekambi', 'Fotso', 'Kamga', 'Mbarga', 'Ndongo', 'Nkeng', 'Talla', 'Tchatchoua', 'Wandji', 'Yimga', 'Zambo', 'Essomba']
const PRENOMS_F = ['Mireille', 'Brigitte', 'Carine', 'Danielle', 'Estelle', 'Flore', 'Gisèle', 'Hortense', 'Irène', 'Joséphine', 'Laure', 'Aïcha', 'Nadège', 'Odile', 'Pauline']
const PRENOMS_M = ['Armand', 'Bertrand', 'Cédric', 'Didier', 'Emmanuel', 'Fabrice', 'Gaston', 'Hervé', 'Isidore', 'Jules', 'Landry', 'Marcel', 'Noël', 'Olivier', 'Patrice']

/** Indices (0-44) des membres non actifs : fin de contribution l'an dernier. */
const INACTIFS = new Set([40, 41])
const DECEDE = 42

export function construireMembresDemo(anneeCourante: number): MembreDemo[] {
  let rangActif = 0
  return Array.from({ length: NOMBRE_MEMBRES_DEMO }, (_, i) => {
    const sexe: 'M' | 'F' = i % 2 === 0 ? 'F' : 'M'
    const prenoms = sexe === 'F' ? PRENOMS_F : PRENOMS_M
    // Décalage de 5 par tranche de 15 : (nom, prénom) ne se répète jamais sur 45 membres.
    const prenom = prenoms[(i + 5 * Math.floor(i / 15)) % 15]!
    const nom = NOMS[i % 15]!
    const statut: MembreDemo['statut'] = INACTIFS.has(i) ? 'INACTIF' : i === DECEDE ? 'DECEDE' : 'ACTIF'
    const base = { cle: `m${String(i + 1).padStart(2, '0')}`, nom, prenom, sexe, brancheIndex: i % 3, telephone: `6000000${String(i + 1).padStart(2, '0')}` }
    if (statut !== 'ACTIF') {
      return { ...base, statut, anneeAdhesion: anneeCourante - 2, anneeFinContribution: anneeCourante - 1, profil: 'A_JOUR' as const }
    }
    const k = rangActif++
    // 42 actifs : 25 à jour, 11 partiels, 6 en retard (~60 / 25 / 15 %).
    const profil: ProfilCotisation = k < 25 ? 'A_JOUR' : k < 36 ? 'PARTIEL' : 'EN_RETARD'
    const anneeAdhesion =
      profil === 'EN_RETARD' || (k > 0 && k % 6 === 5) ? anneeCourante - 1 : k > 0 && k % 10 === 9 ? anneeCourante : anneeCourante - 2
    return { ...base, statut, anneeAdhesion, anneeFinContribution: null, profil }
  })
}

export function baremesDemo(anneeCourante: number): { annee: number; montantAttendu: number }[] {
  return [
    { annee: anneeCourante - 2, montantAttendu: 20_000 },
    { annee: anneeCourante - 1, montantAttendu: 24_000 },
    { annee: anneeCourante, montantAttendu: 24_000 },
  ]
}

export interface VersementDemo {
  cleMembre: string
  annee: number
  montant: number
  date: Date
  mode: 'ESPECES' | 'MOBILE_MONEY' | 'TIERS'
}

const MODES: VersementDemo['mode'][] = ['ESPECES', 'MOBILE_MONEY', 'TIERS']

/**
 * Versements qui donnent à chaque membre le statut de son profil : à jour = tout payé (deux tranches par
 * année échue, une pour l'année courante) ; partiel = années échues payées, moitié de l'année courante ;
 * en retard = rien. Jamais daté dans le futur ; le versement de l'année courante reste dans l'année
 * même au tout premier jour de janvier.
 */
export function planifierVersementsDemo(membres: MembreDemo[], anneeCourante: number, now: Date): VersementDemo[] {
  const attendu = new Map(baremesDemo(anneeCourante).map((b) => [b.annee, b.montantAttendu]))
  const dateCourante = new Date(
    Math.max(Date.UTC(anneeCourante, 0, 1, 0), Math.min(now.getTime() - 3_600_000, Date.UTC(anneeCourante, 1, 15, 9))),
  )
  const plan: VersementDemo[] = []
  membres.forEach((m, i) => {
    if (m.profil === 'EN_RETARD') return
    const fin = m.anneeFinContribution ?? anneeCourante
    for (let annee = m.anneeAdhesion; annee <= fin; annee++) {
      const montant = attendu.get(annee)
      if (montant === undefined) continue
      const mode = MODES[(i + annee) % MODES.length]!
      if (annee < anneeCourante) {
        plan.push({ cleMembre: m.cle, annee, montant: montant / 2, date: new Date(Date.UTC(annee, 2, 15, 9)), mode })
        plan.push({ cleMembre: m.cle, annee, montant: montant / 2, date: new Date(Date.UTC(annee, 8, 10, 9)), mode })
      } else {
        plan.push({ cleMembre: m.cle, annee, montant: m.profil === 'PARTIEL' ? montant / 2 : montant, date: dateCourante, mode })
      }
    }
  })
  return plan.sort((a, b) => a.date.getTime() - b.date.getTime() || a.cleMembre.localeCompare(b.cleMembre))
}

export interface DepenseDemo {
  description: string
  montant: number
  categorie: 'AIDE_MEMBRE' | 'FUNERAILLES' | 'EVENEMENT' | 'FONCTIONNEMENT' | 'AUTRE'
  cible: 'BROUILLON' | 'EN_ATTENTE' | 'APPROUVEE' | 'REJETEE' | 'PAYEE'
  joursAvant: number
  motifRejet?: string
}

export const DEPENSES_DEMO: readonly DepenseDemo[] = [
  { description: "Location de la salle de l'assemblée générale", montant: 45_000, categorie: 'EVENEMENT', cible: 'PAYEE', joursAvant: 200 },
  { description: 'Aide à une famille pour une hospitalisation', montant: 60_000, categorie: 'AIDE_MEMBRE', cible: 'PAYEE', joursAvant: 150 },
  { description: 'Couronne et transport pour des obsèques', montant: 35_000, categorie: 'FUNERAILLES', cible: 'PAYEE', joursAvant: 120 },
  { description: 'Transport des délégués à la réunion de branche', montant: 18_000, categorie: 'AUTRE', cible: 'PAYEE', joursAvant: 75 },
  { description: 'Frais de tenue du compte bancaire', montant: 8_000, categorie: 'FONCTIONNEMENT', cible: 'APPROUVEE', joursAvant: 40 },
  { description: "Repas de fin d'année", montant: 150_000, categorie: 'EVENEMENT', cible: 'REJETEE', joursAvant: 30, motifRejet: 'Budget non prévu cette année' },
  { description: 'Impression des cartes de membre', montant: 22_000, categorie: 'FONCTIONNEMENT', cible: 'EN_ATTENTE', joursAvant: 12 },
  { description: "Achat d'un registre des procès-verbaux", montant: 6_500, categorie: 'AUTRE', cible: 'BROUILLON', joursAvant: 3 },
]
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `cd backend && npm run test -- --run tests/demo-donnees.test.ts`
Expected: PASS (11 tests). Si l'assertion « statut de son profil » échoue pour un membre, corriger la règle d'`anneeAdhesion` ou de montants dans `demo-donnees.ts` (jamais l'attendu du test) : c'est la règle réelle qui fait foi.

- [ ] **Step 5: Build et commit**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend && npm run build
cd .. && git add backend/src/services/demo-donnees.ts backend/tests/demo-donnees.test.ts
git commit -m "feat(demo): description pure et déterministe de l'espace de démonstration

45 membres fictifs (42 actifs : 25 à jour, 11 partiels, 6 en retard), barèmes sur
3 ans, versements jamais futurs qui produisent chaque statut selon la règle réelle,
8 dépenses couvrant le workflow.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Suppression gardée d'une organisation de démo

**Files:**
- Create: `backend/src/services/demo-suppression.service.ts`
- Create: `backend/tests/support/prisma-espion.ts`
- Modify: `backend/tests/runUnscoped-allowlist.test.ts`
- Test: `backend/tests/demo-suppression.integration.test.ts`

**Interfaces:**
- Consumes: `SUPPRIMER_DEMO`, `acteurEmail` imposable (Task 1) ; `assemblerExportOrganisation`, `collecterUrlsBlobs`, `supprimerDonneesOrganisation`, `purgerBlobs`, `BlobPurgeClient` (`organisation-purge.service.ts`) ; `journaliserActionPlateforme` (`platform-audit.service.ts`).
- Produces:
  - `class OrganisationNonDemoError extends Error { readonly organisationId: string }`
  - `ACTEUR_SYSTEME_DEMO = { id: 'systeme', email: 'systeme@nkoni' } as const`
  - `interface SuppressionDemo { supprimee: boolean; compteurs: Record<string, number>; blobs: { supprimes: number; echecs: string[] }; journalise: boolean }`
  - `supprimerOrganisationDemo(prisma: any, blob: BlobPurgeClient, organisationId: string): Promise<SuppressionDemo>`
  - `envelopperPrisma<T extends object>(client: T, surcharges: SurchargesPrisma): T` (test support)

- [ ] **Step 1: Écrire le support de test**

Créer `backend/tests/support/prisma-espion.ts` :

```ts
/**
 * Enveloppe un client Prisma (étendu) en surchargeant quelques opérations de modèle, tout le reste
 * passant au client réel avec son `this`. Sert aux tests d'intégration exécutés en parallèle sur une
 * base PARTAGÉE : restreindre ce qu'une fonction globale « voit » à SES propres organisations, ou
 * provoquer une panne au milieu d'un traitement.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SurchargesPrisma = Record<string, Record<string, (original: (args: any) => Promise<any>, args: any) => Promise<any>>>

export function envelopperPrisma<T extends object>(client: T, surcharges: SurchargesPrisma): T {
  return new Proxy(client, {
    get(cible, prop, recepteur) {
      const valeur = Reflect.get(cible, prop, recepteur)
      const parModele = typeof prop === 'string' ? surcharges[prop] : undefined
      if (parModele && valeur && typeof valeur === 'object') {
        return new Proxy(valeur as object, {
          get(modele, operation, r) {
            const originale = Reflect.get(modele, operation, r)
            const surcharge = typeof operation === 'string' ? parModele[operation] : undefined
            if (surcharge && typeof originale === 'function') {
              return (args: any) => surcharge((a: any) => originale.call(modele, a), args)
            }
            return typeof originale === 'function' ? originale.bind(modele) : originale
          },
        })
      }
      return typeof valeur === 'function' ? valeur.bind(cible) : valeur
    },
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */
```

- [ ] **Step 2: Écrire le test d'intégration**

Créer `backend/tests/demo-suppression.integration.test.ts` :

```ts
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { prisma as prismaEtendu } from '../src/lib/prisma'
import {
  ACTEUR_SYSTEME_DEMO,
  OrganisationNonDemoError,
  supprimerOrganisationDemo,
} from '../src/services/demo-suppression.service'

/**
 * Spec 2026-09-15 §3.2 — la suppression d'une démo ne passe pas par la précondition HUMAINE de la purge
 * (suspension + nom), elle relit `estDemo` dans la transaction et refuse toute organisation réelle.
 * Contre une vraie Postgres : ce sont les clés étrangères et le scoping réel des `deleteMany` qui comptent.
 * Exige `DATABASE_URL` jetable (JAMAIS `nkoni`).
 */

const ORG_DEMO = 'e9000000-0000-4000-8000-000000000091'
const ORG_REELLE = 'e9000000-0000-4000-8000-000000000092'
const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
const blobsSupprimes: string[] = []
const blob = { del: async (url: string) => void blobsSupprimes.push(url) }

function exigerBaseDeTest(): void {
  const nom = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/inconnue').pathname.slice(1)
  if (!/_it_|test/.test(nom)) throw new Error(`demo-suppression.integration : base « ${nom} » refusée — utiliser une base jetable`)
}

async function nettoyer(): Promise<void> {
  const ids = [ORG_DEMO, ORG_REELLE]
  await base.platformAuditLog.deleteMany({ where: { organisationCibleId: { in: ids } } })
  await base.membre.deleteMany({ where: { organisationId: { in: ids } } })
  await base.utilisateur.deleteMany({ where: { organisationId: { in: ids } } })
  await base.brancheFamiliale.deleteMany({ where: { organisationId: { in: ids } } })
  await base.organisation.deleteMany({ where: { id: { in: ids } } })
}

async function semer(id: string, estDemo: boolean): Promise<void> {
  await base.organisation.create({ data: { id, nom: `Suppression ${estDemo ? 'démo' : 'réelle'}`, devise: 'FCFA', estDemo } })
  const u = await base.utilisateur.create({
    data: { organisationId: id, email: `admin-${id.slice(-2)}@demo-suppression-it.local`, passwordHash: 'x', role: 'ADMIN', actif: true },
  })
  const branche = await base.brancheFamiliale.create({ data: { organisationId: id, nom: 'Branche' } })
  await base.membre.create({
    data: { organisationId: id, nom: 'Fictif', prenom: 'Membre', anneeAdhesion: 2026, brancheId: branche.id, compteUtilisateurId: u.id, photoBlobUrl: `https://blob.test/${id}.jpg` },
  })
}

const comptes = async (id: string) => ({
  organisation: await base.organisation.count({ where: { id } }),
  utilisateurs: await base.utilisateur.count({ where: { organisationId: id } }),
  membres: await base.membre.count({ where: { organisationId: id } }),
  branches: await base.brancheFamiliale.count({ where: { organisationId: id } }),
})

beforeAll(async () => {
  exigerBaseDeTest()
  await nettoyer()
  await semer(ORG_DEMO, true)
  await semer(ORG_REELLE, false)
})

afterAll(async () => {
  await nettoyer()
  await base.$disconnect()
})

describe('supprimerOrganisationDemo', () => {
  it('refuse une organisation réelle et n’y touche pas', async () => {
    const avant = await comptes(ORG_REELLE)
    await expect(supprimerOrganisationDemo(prismaEtendu, blob, ORG_REELLE)).rejects.toBeInstanceOf(OrganisationNonDemoError)
    expect(await comptes(ORG_REELLE)).toEqual(avant)
    expect(await base.organisation.findUnique({ where: { id: ORG_REELLE }, select: { actif: true } })).toEqual({ actif: true })
  })

  it('supprime la démo entière, ses blobs, et journalise l’acteur système', async () => {
    const reelleAvant = await comptes(ORG_REELLE)
    const r = await supprimerOrganisationDemo(prismaEtendu, blob, ORG_DEMO)
    expect(r.supprimee).toBe(true)
    expect(r.journalise).toBe(true)
    expect(await comptes(ORG_DEMO)).toEqual({ organisation: 0, utilisateurs: 0, membres: 0, branches: 0 })
    expect(blobsSupprimes).toContain(`https://blob.test/${ORG_DEMO}.jpg`)
    expect(await comptes(ORG_REELLE)).toEqual(reelleAvant)
    const trace = await base.platformAuditLog.findFirst({ where: { organisationCibleId: ORG_DEMO } })
    expect(trace).toMatchObject({ action: 'SUPPRIMER_DEMO', acteurId: ACTEUR_SYSTEME_DEMO.id, acteurEmail: ACTEUR_SYSTEME_DEMO.email })
  })

  it('identifiant inconnu (démo déjà supprimée) : rien à faire, pas d’erreur', async () => {
    expect(await supprimerOrganisationDemo(prismaEtendu, blob, ORG_DEMO)).toMatchObject({ supprimee: false })
  })
})
```

- [ ] **Step 3: Lancer le test, vérifier l'échec**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-suppression.integration.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/services/demo-suppression.service"`.

- [ ] **Step 4: Écrire le service**

Créer `backend/src/services/demo-suppression.service.ts` :

```ts
import { orgContext } from '../lib/org-context'
import {
  assemblerExportOrganisation,
  collecterUrlsBlobs,
  purgerBlobs,
  supprimerDonneesOrganisation,
  type BlobPurgeClient,
} from './organisation-purge.service'
import { journaliserActionPlateforme } from './platform-audit.service'

/**
 * Espace de démonstration (spec 2026-09-15 §3.2) — suppression d'une organisation de démo.
 *
 * Réutilise la purge de tenant (même ordre, même scoping des `deleteMany`, base d'abord puis blobs) SANS
 * sa précondition humaine (suspension + confirmation du nom), réservée à la console. En échange, la nature
 * de démo est RELUE dans la transaction par une écriture conditionnelle (`estDemo: true`) qui suspend
 * l'organisation — condition exigée par `supprimerDonneesOrganisation` : aucune organisation réelle ne
 * peut être effacée par ce chemin, même appelée avec un mauvais identifiant.
 *
 * Journal `SUPPRIMER_DEMO` BEST-EFFORT (contrairement à `PURGER`) : l'objet supprimé est fictif et
 * régénérable, bloquer la régénération sur un échec d'écriture du journal ferait vieillir la démo.
 */

export class OrganisationNonDemoError extends Error {
  constructor(readonly organisationId: string) {
    super(`L'organisation ${organisationId} n'est pas un espace de démonstration.`)
    this.name = 'OrganisationNonDemoError'
  }
}

/** Acteur du journal plateforme pour la régénération (aucun compte derrière). */
export const ACTEUR_SYSTEME_DEMO = { id: 'systeme', email: 'systeme@nkoni' } as const

export interface SuppressionDemo {
  supprimee: boolean
  compteurs: Record<string, number>
  blobs: { supprimes: number; echecs: string[] }
  journalise: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function supprimerOrganisationDemo(prisma: any, blob: BlobPurgeClient, organisationId: string): Promise<SuppressionDemo> {
  // Hors de tout tenant : l'export lit les modèles scopés de l'organisation visée, la transaction les efface.
  return orgContext.runUnscoped(async () => {
    const org = await prisma.organisation.findUnique({
      where: { id: organisationId },
      select: { id: true, nom: true, estDemo: true, createdAt: true },
    })
    if (!org) return { supprimee: false, compteurs: {}, blobs: { supprimes: 0, echecs: [] }, journalise: false }
    if (org.estDemo !== true) throw new OrganisationNonDemoError(organisationId)

    const exportComplet = await assemblerExportOrganisation(prisma, organisationId)
    const urls = collecterUrlsBlobs(exportComplet)
    const utilisateurIds = (exportComplet.donnees['Utilisateur'] ?? []).map((u) => (u as { id: string }).id)

    const compteurs: Record<string, number> = await prisma.$transaction(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (tx: any) => {
        const { count } = await tx.organisation.updateMany({
          where: { id: organisationId, estDemo: true },
          data: { actif: false },
        })
        if (count !== 1) throw new OrganisationNonDemoError(organisationId)
        return supprimerDonneesOrganisation(tx, organisationId, utilisateurIds)
      },
      { timeout: 120_000, maxWait: 15_000 },
    )
    const blobs = await purgerBlobs(blob, urls)

    let journalise = true
    try {
      await journaliserActionPlateforme(prisma, {
        acteurId: ACTEUR_SYSTEME_DEMO.id,
        acteurEmail: ACTEUR_SYSTEME_DEMO.email,
        action: 'SUPPRIMER_DEMO',
        organisationCibleId: organisationId,
        organisationNom: org.nom,
        donneesAvant: { creeeLe: org.createdAt.toISOString() },
        donneesApres: { compteurs, blobsEnEchec: blobs.echecs.length },
      })
    } catch {
      journalise = false
    }
    return { supprimee: true, compteurs, blobs, journalise }
  })
}
```

- [ ] **Step 5: Lancer le test d'intégration**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-suppression.integration.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 6: Inscrire l'appel `runUnscoped`**

Run: `cd backend && npm run test -- --run tests/runUnscoped-allowlist.test.ts` → FAIL (fichier non approuvé).

Dans `backend/tests/runUnscoped-allowlist.test.ts`, objet `APPROUVES`, après `'routes/demo.route.ts': 1,` :

```ts
  // Espace de démonstration — suppression d'une ancienne démo (spec 2026-09-15 §3.2) : export puis
  // transaction de purge d'une organisation hors de tout tenant, UN seul appel enveloppant tout le flux.
  // Même contrepartie que la purge plateforme (l'isolation ne protège plus rien à l'intérieur) : chaque
  // `deleteMany` est scopé par `supprimerDonneesOrganisation`, et la nature de démo est relue dans la
  // transaction par une écriture conditionnelle.
  'services/demo-suppression.service.ts': 1,
```

Run: `cd backend && npm run test -- --run tests/runUnscoped-allowlist.test.ts` → PASS.

- [ ] **Step 7: Saboter la relecture `estDemo` dans la direction utile**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
cp src/services/demo-suppression.service.ts "${TMPDIR:-/tmp}/demo-suppression.bak"
sed -i '' 's/if (org.estDemo !== true) throw new OrganisationNonDemoError(organisationId)/if (false) throw new OrganisationNonDemoError(organisationId)/' src/services/demo-suppression.service.ts
sed -i '' 's/where: { id: organisationId, estDemo: true },/where: { id: organisationId },/' src/services/demo-suppression.service.ts
grep -c "if (false) throw new OrganisationNonDemoError" src/services/demo-suppression.service.ts
grep -c "where: { id: organisationId }," src/services/demo-suppression.service.ts
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-suppression.integration.test.ts 2>&1 | grep -E "Tests |✓|×"
cp "${TMPDIR:-/tmp}/demo-suppression.bak" src/services/demo-suppression.service.ts
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-suppression.integration.test.ts 2>&1 | grep -E "Tests "
```

Expected : `1` et `1` ; le test « refuse une organisation réelle » échoue (l'organisation réelle est supprimée — le `beforeAll` reprend les données au prochain lancement) ; restauré : `3 passed`. Si le sabotage efface l'organisation réelle, le test de restauration la resème grâce au `beforeAll` : relancer une fois si le premier lancement restauré échoue sur un reste.

- [ ] **Step 8: Build, suite hors intégration, commit**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'
cd .. && git add backend/src/services/demo-suppression.service.ts backend/tests/support/prisma-espion.ts backend/tests/demo-suppression.integration.test.ts backend/tests/runUnscoped-allowlist.test.ts
git commit -m "feat(demo): suppression d'une organisation de démonstration, jamais d'une réelle

Réutilise la purge de tenant (ordre, scoping, blobs après la base) sans la
précondition humaine ; la nature de démo est relue dans la transaction par une
écriture conditionnelle. Journal SUPPRIMER_DEMO best-effort, acteur système.
Prouvé contre Postgres, sabotage vérifié.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Générateur de la démo

**Files:**
- Create: `backend/src/services/demo-generateur.service.ts`
- Modify: `backend/tests/runUnscoped-allowlist.test.ts`
- Test: `backend/tests/demo-generateur.integration.test.ts`

**Interfaces:**
- Consumes: `demo-donnees.ts` (Task 2) ; `supprimerOrganisationDemo` (Task 3) ; `envelopperPrisma` (Task 3) ; services existants : `inscrireOrganisation`, `definirChefOrganisation` (`organisation.service.ts`), `ouvrirAnnee` (`contribution.service.ts`), `appliquerCreationVersement` (`versement.service.ts`), `genererRecu`, `annulerRecu` (`recu.service.ts`), `validerTransition`, `StatutDepense` (`tresorerie.service.ts`), `validerTransitionAmende` (`amende.service.ts`), `creerTontine`, `ouvrirCycle`, `enregistrerMise`, `reverserTour` (`tontine.service.ts`), `creerReunion` (`reunion.service.ts`), `creerResolution` (`resolution.service.ts`), `ouvrirVoteResolution`, `voterResolution`, `cloturerResolution` (`vote.service.ts`), `creerFonction` (`fonction.service.ts`), `creerAffectation` (`affectation.service.ts`).
- Produces:
  - `interface VolumesDemo { membres: number; versements: number; recus: number; recusAnnules: number; depenses: number; dons: number; amendes: number; misesTontine: number; votes: number }`
  - `interface OrganisationDemoGeneree { organisationId: string; adminId: string; volumes: VolumesDemo }`
  - `genererOrganisationDemo(prisma: any, blob: BlobPurgeClient, now?: Date): Promise<OrganisationDemoGeneree>`

- [ ] **Step 1: Écrire le test d'intégration**

Créer `backend/tests/demo-generateur.integration.test.ts` :

```ts
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { prisma as prismaEtendu } from '../src/lib/prisma'
import { orgContext } from '../src/lib/org-context'
import { anneeCouranteApp } from '../src/lib/date-app'
import { reconcilierVersements } from '../src/services/versement.service'
import { calculerStatutsMembres } from '../src/services/membreStatut.service'
import { construireMembresDemo, planifierVersementsDemo, NOM_ORGANISATION_DEMO } from '../src/services/demo-donnees'
import { genererOrganisationDemo, type OrganisationDemoGeneree } from '../src/services/demo-generateur.service'
import { supprimerOrganisationDemo } from '../src/services/demo-suppression.service'
import { envelopperPrisma } from './support/prisma-espion'

/**
 * Spec 2026-09-15 §3.1, contre une VRAIE Postgres : la démo générée par les services réels respecte les
 * invariants financiers (réconciliation sans écart), produit les statuts voulus, n'envoie rien, et une
 * génération interrompue ne laisse aucune organisation derrière elle.
 * Exige `DATABASE_URL` jetable (JAMAIS `nkoni`).
 */

const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
const blob = { del: async () => undefined }
const NOW = new Date()
const ANNEE = anneeCouranteApp(NOW)
let demo: OrganisationDemoGeneree

function exigerBaseDeTest(): void {
  const nom = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/inconnue').pathname.slice(1)
  if (!/_it_|test/.test(nom)) throw new Error(`demo-generateur.integration : base « ${nom} » refusée — utiliser une base jetable`)
}

beforeAll(async () => {
  exigerBaseDeTest()
  demo = await genererOrganisationDemo(prismaEtendu, blob, NOW)
}, 300_000)

afterAll(async () => {
  if (demo) await supprimerOrganisationDemo(prismaEtendu, blob, demo.organisationId)
  await base.$disconnect()
}, 120_000)

describe('genererOrganisationDemo', () => {
  it('organisation démo ACTIVE, forfait PRO sans échéance, compte admin lié à la présidente, cheffe désignée', async () => {
    const org = await base.organisation.findUnique({ where: { id: demo.organisationId } })
    expect(org).toMatchObject({ nom: NOM_ORGANISATION_DEMO, estDemo: true, actif: true, forfait: 'PRO', forfaitExpireLe: null })
    const presidente = await base.membre.findFirst({ where: { organisationId: demo.organisationId, compteUtilisateurId: demo.adminId } })
    expect(presidente).not.toBeNull()
    expect(org?.chefMembreId).toBe(presidente?.id)
    const compte = await base.utilisateur.findUnique({ where: { id: demo.adminId } })
    expect(compte?.email).toMatch(/@demo\.nkoni\.invalid$/)
  })

  it('réconciliation des versements : zéro écart', async () => {
    const ecarts = await orgContext.run({ organisationId: demo.organisationId }, async () => await reconcilierVersements(prismaEtendu))
    expect(ecarts).toEqual([])
  })

  it('statuts de cotisation des actifs : 25 à jour, 11 partiels, 6 non à jour', async () => {
    const { items } = await orgContext.run({ organisationId: demo.organisationId }, async () => await calculerStatutsMembres(prismaEtendu, ANNEE))
    const actifs = items.filter((m) => m.statut === 'ACTIF')
    expect(actifs).toHaveLength(42)
    expect(actifs.filter((m) => m.statutCotisation === 'A_JOUR')).toHaveLength(25)
    expect(actifs.filter((m) => m.statutCotisation === 'PARTIEL')).toHaveLength(11)
    expect(actifs.filter((m) => m.statutCotisation === 'NON_A_JOUR')).toHaveLength(6)
  })

  it('volumes en base conformes au plan, un reçu annulé et réémis', async () => {
    const id = demo.organisationId
    const versementsAttendus = planifierVersementsDemo(construireMembresDemo(ANNEE), ANNEE, NOW).length
    expect(await base.membre.count({ where: { organisationId: id } })).toBe(45)
    expect(await base.versement.count({ where: { organisationId: id } })).toBe(versementsAttendus)
    expect(await base.recu.count({ where: { organisationId: id, annuleLe: null } })).toBe(versementsAttendus)
    expect(await base.recu.count({ where: { organisationId: id, annuleLe: { not: null } } })).toBe(1)
    expect(await base.depense.count({ where: { organisationId: id } })).toBe(8)
    expect(await base.amende.count({ where: { organisationId: id } })).toBe(3)
    expect(await base.donCagnotte.count({ where: { organisationId: id } })).toBe(12)
    expect(await base.reunion.count({ where: { organisationId: id } })).toBe(2)
    expect(await base.vote.count({ where: { organisationId: id } })).toBe(20)
    expect(await base.tourTontine.count({ where: { organisationId: id, statut: 'REVERSE' } })).toBe(5)
    expect(demo.volumes).toMatchObject({ membres: 45, versements: versementsAttendus, recus: versementsAttendus + 1, recusAnnules: 1, depenses: 8, dons: 12, amendes: 3, votes: 20 })
  })

  it('n’envoie rien : aucune notification, aucun paiement en ligne, aucun PDF de reçu produit', async () => {
    const id = demo.organisationId
    expect(await base.notification.count({ where: { organisationId: id } })).toBe(0)
    expect(await base.paiement.count({ where: { organisationId: id } })).toBe(0)
    expect(await base.recu.count({ where: { organisationId: id, urlPdf: { not: null } } })).toBe(0)
  })

  it('génération interrompue au milieu : l’organisation partielle est supprimée et l’erreur remonte', async () => {
    let organisationCree: string | undefined
    const enPanne = envelopperPrisma(prismaEtendu, {
      organisation: {
        update: async (originale, args) => {
          organisationCree ??= args.where.id
          return originale(args)
        },
      },
      tontine: {
        create: async () => {
          throw new Error('panne simulée pendant la tontine')
        },
      },
    })
    await expect(genererOrganisationDemo(enPanne, blob, NOW)).rejects.toThrow('panne simulée pendant la tontine')
    expect(organisationCree).toBeDefined()
    expect(await base.organisation.findUnique({ where: { id: organisationCree! } })).toBeNull()
  }, 300_000)
})
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-generateur.integration.test.ts
```

Expected: FAIL — `Failed to resolve import "../src/services/demo-generateur.service"`.

- [ ] **Step 3: Écrire le générateur**

Créer `backend/src/services/demo-generateur.service.ts` :

```ts
import { randomBytes, randomUUID } from 'node:crypto'
import { auditContext } from '../lib/audit-context'
import { orgContext } from '../lib/org-context'
import { anneeCouranteApp } from '../lib/date-app'
import { definirChefOrganisation, inscrireOrganisation } from './organisation.service'
import { ouvrirAnnee } from './contribution.service'
import { appliquerCreationVersement } from './versement.service'
import { annulerRecu, genererRecu } from './recu.service'
import { validerTransition, type StatutDepense } from './tresorerie.service'
import { validerTransitionAmende } from './amende.service'
import { creerTontine, enregistrerMise, ouvrirCycle, reverserTour } from './tontine.service'
import { creerReunion } from './reunion.service'
import { creerResolution } from './resolution.service'
import { cloturerResolution, ouvrirVoteResolution, voterResolution } from './vote.service'
import { creerFonction } from './fonction.service'
import { creerAffectation } from './affectation.service'
import { supprimerOrganisationDemo } from './demo-suppression.service'
import type { BlobPurgeClient } from './organisation-purge.service'
import {
  BRANCHES_DEMO,
  DEPENSES_DEMO,
  NOM_ORGANISATION_DEMO,
  baremesDemo,
  construireMembresDemo,
  planifierVersementsDemo,
} from './demo-donnees'

/**
 * Espace de démonstration (spec 2026-09-15 §3.1) — génération d'une organisation fictive complète.
 *
 * PAR LES SERVICES RÉELS (versements, reçus, tontine, votes…), jamais par insertions brutes là où un
 * service porte un invariant : cumuls de contribution, numérotation des reçus, un reçu actif par
 * versement. Seules les entités dont la création vit dans une route (branches, membres, barèmes,
 * dépenses, cagnotte, amendes, présences) sont écrites directement, avec les règles de ces routes.
 *
 * Trois propriétés, dans cet ordre :
 *  1. Invisible pendant le remplissage : l'organisation est marquée `estDemo: true, actif: false`
 *     (`chargerCompteDemo` n'ouvre que les démos actives ; les tâches de fond ignorent les démos), puis
 *     activée à la toute fin.
 *  2. Rien n'est envoyé : aucune notification, aucun envoi de reçu, aucun paiement en ligne — ces envois
 *     vivent dans les routes, le générateur ne les appelle jamais.
 *  3. Pas de reste : toute erreur supprime l'organisation partielle avant de remonter (la console refuse
 *     de supprimer une démo, et la régénération ne supprime que les démos plus anciennes).
 *
 * Écritures métier sous `auditContext.run` (acteur = compte ADMIN de la démo) + `orgContext.run`.
 */

export interface VolumesDemo {
  membres: number
  versements: number
  recus: number
  recusAnnules: number
  depenses: number
  dons: number
  amendes: number
  misesTontine: number
  votes: number
}

export interface OrganisationDemoGeneree {
  organisationId: string
  adminId: string
  volumes: VolumesDemo
}

const JOUR_MS = 24 * 60 * 60 * 1000

export async function genererOrganisationDemo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  blob: BlobPurgeClient,
  now: Date = new Date(),
): Promise<OrganisationDemoGeneree> {
  // Création hors tenant (aucune organisation n'existe encore) — même chemin que l'auto-inscription.
  // E-mail en `.invalid` (TLD réservé, jamais délivrable) et mot de passe aléatoire jamais conservé :
  // la connexion par mot de passe est de toute façon refusée pour un compte de démo.
  const admin = await orgContext.runUnscoped(
    async () =>
      await inscrireOrganisation(prisma, {
        nomOrganisation: NOM_ORGANISATION_DEMO,
        devise: 'FCFA',
        langue: 'FR',
        email: `demo-${randomUUID()}@demo.nkoni.invalid`,
        password: randomBytes(24).toString('base64url'),
      }),
  )
  const organisationId = admin.organisationId as string
  try {
    await prisma.organisation.update({
      where: { id: organisationId },
      data: { estDemo: true, actif: false, forfait: 'PRO' },
    })
    const volumes = await auditContext.run({ acteurId: admin.id }, () =>
      orgContext.run({ organisationId }, async () => await remplir(prisma, organisationId, admin.id, now)),
    )
    await prisma.organisation.update({ where: { id: organisationId }, data: { actif: true } })
    return { organisationId, adminId: admin.id, volumes }
  } catch (err) {
    await supprimerOrganisationDemo(prisma, blob, organisationId).catch(() => undefined)
    throw err
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function remplir(prisma: any, organisationId: string, adminId: string, now: Date): Promise<VolumesDemo> {
  const annee = anneeCouranteApp(now)
  const ilYA = (jours: number) => new Date(now.getTime() - jours * JOUR_MS)
  const membres = construireMembresDemo(annee)

  // Branches et membres (création portée par les routes : écriture directe, FK scalaires).
  const brancheIds: string[] = []
  for (const nom of BRANCHES_DEMO) brancheIds.push((await prisma.brancheFamiliale.create({ data: { nom } })).id)
  const idDe = new Map<string, string>()
  for (const m of membres) {
    const cree = await prisma.membre.create({
      data: {
        nom: m.nom,
        prenom: m.prenom,
        sexe: m.sexe,
        statut: m.statut,
        telephone: m.telephone,
        anneeAdhesion: m.anneeAdhesion,
        anneeFinContribution: m.anneeFinContribution,
        brancheId: brancheIds[m.brancheIndex],
        ...(m.statut === 'DECEDE' ? { dateDeces: new Date(Date.UTC(annee - 1, 10, 3, 9)) } : {}),
      },
    })
    idDe.set(m.cle, cree.id)
  }
  const id = (cle: string) => idDe.get(cle) as string
  const actifs = membres.filter((m) => m.statut === 'ACTIF')
  const presidente = membres[0]!

  // Compte ADMIN lié à la présidente (« Mon espace » réaliste) et cheffe de l'organisation.
  await prisma.membre.update({ where: { id: id(presidente.cle) }, data: { compteUtilisateurId: adminId } })
  await definirChefOrganisation(prisma, organisationId, id(presidente.cle), 'Présidente')

  // Barèmes puis ouverture des années (service : montant attendu copié, jamais d'année future).
  for (const bareme of baremesDemo(annee)) {
    await prisma.baremeAnnuel.create({ data: bareme })
    await ouvrirAnnee(prisma, bareme.annee, annee)
  }
  const contributions: { id: string; membreId: string; annee: number }[] = await prisma.contribution.findMany({
    select: { id: true, membreId: true, annee: true },
  })
  const contributionDe = new Map(contributions.map((c) => [`${c.membreId}#${c.annee}`, c.id]))

  // Versements (service : cumuls dans la même transaction) puis reçu, dans l'ordre chronologique pour
  // que la numérotation suive les dates.
  const plan = planifierVersementsDemo(membres, annee, now)
  const versementIds: string[] = []
  for (const v of plan) {
    const contributionId = contributionDe.get(`${id(v.cleMembre)}#${v.annee}`)
    if (!contributionId) throw new Error(`Contribution absente : ${v.cleMembre} ${v.annee}`)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { versement } = await prisma.$transaction(async (tx: any) =>
      appliquerCreationVersement(tx, {
        contributionId,
        montant: v.montant,
        dateVersement: v.date,
        mode: v.mode,
        receptionnaireId: adminId,
      }),
    )
    versementIds.push(versement.id)
    await genererRecu(prisma, versement.id, adminId, v.date)
  }
  // Voie de correction d'un reçu remis : annuler puis réémettre (le reçu annulé garde son numéro).
  const aCorriger = await prisma.recu.findFirst({ where: { versementId: versementIds[3], annuleLe: null }, select: { id: true } })
  if (!aCorriger) throw new Error('Reçu à corriger introuvable')
  await annulerRecu(prisma, aCorriger.id, adminId, 'Mode de versement mal saisi', now)
  await genererRecu(prisma, versementIds[3]!, adminId, now)

  // Dépenses : chaque statut cible est atteint par des transitions VALIDES du workflow.
  const chemin: Record<StatutDepense, StatutDepense[]> = {
    BROUILLON: [],
    EN_ATTENTE: ['EN_ATTENTE'],
    APPROUVEE: ['EN_ATTENTE', 'APPROUVEE'],
    REJETEE: ['EN_ATTENTE', 'REJETEE'],
    PAYEE: ['EN_ATTENTE', 'APPROUVEE', 'PAYEE'],
  }
  for (const d of DEPENSES_DEMO) {
    let statut: StatutDepense = 'BROUILLON'
    for (const suivant of chemin[d.cible]) {
      validerTransition(statut, suivant)
      statut = suivant
    }
    const decidee = statut === 'APPROUVEE' || statut === 'REJETEE' || statut === 'PAYEE'
    await prisma.depense.create({
      data: {
        montant: d.montant,
        date: ilYA(d.joursAvant),
        description: d.description,
        categorie: d.categorie,
        statut,
        saisiParId: adminId,
        ...(decidee ? { approuveParId: adminId } : {}),
        ...(d.motifRejet ? { motifRejet: d.motifRejet } : {}),
      },
    })
  }

  // Cagnotte ouverte et 12 dons.
  const beneficiaire = membres[2]!
  const cagnotte = await prisma.cagnotteEvenement.create({
    data: {
      titre: `Soutien au mariage de ${beneficiaire.prenom} ${beneficiaire.nom}`,
      type: 'MARIAGE',
      objectif: 300_000,
      dateEvenement: new Date(now.getTime() + 21 * JOUR_MS),
      beneficiaireMembreId: id(beneficiaire.cle),
      creeParId: adminId,
    },
  })
  for (let k = 0; k < 12; k++) {
    await prisma.donCagnotte.create({
      data: {
        cagnotteId: cagnotte.id,
        membreId: id(actifs[k + 3]!.cle),
        montant: 10_000 + (k % 3) * 5_000,
        date: ilYA(k + 1),
        mode: k % 2 === 0 ? 'ESPECES' : 'MOBILE_MONEY',
        saisiParId: adminId,
      },
    })
  }

  // Amendes : encaissée, en attente, annulée (transitions validées).
  const enRetard = actifs.filter((m) => m.profil === 'EN_RETARD')
  const amendePayee = await prisma.amende.create({
    data: { membreId: id(enRetard[0]!.cle), type: 'RETARD_COTISATION', motif: 'Retard de cotisation', montant: 2_000, dateAmende: ilYA(60), creeParId: adminId },
  })
  validerTransitionAmende('IMPAYEE', 'PAYEE')
  await prisma.amende.update({ where: { id: amendePayee.id }, data: { statut: 'PAYEE', datePaiement: ilYA(50), modePaiement: 'ESPECES' } })
  await prisma.amende.create({
    data: { membreId: id(enRetard[1]!.cle), type: 'ABSENCE_REUNION', motif: "Absence non excusée à l'assemblée", montant: 1_000, dateAmende: ilYA(38), creeParId: adminId },
  })
  const amendeAnnulee = await prisma.amende.create({
    data: { membreId: id(actifs[5]!.cle), type: 'AUTRE', motif: 'Retard à la réunion', montant: 500, dateAmende: ilYA(38), creeParId: adminId },
  })
  validerTransitionAmende('IMPAYEE', 'ANNULEE')
  await prisma.amende.update({ where: { id: amendeAnnulee.id }, data: { statut: 'ANNULEE' } })

  // Tontine à ordre fixe, 10 participants : 5 tours reversés, le 6e en cours de collecte.
  const tontine = await creerTontine(prisma, { nom: 'Tontine mensuelle', montantBaseMise: 10_000, modeRotation: 'ORDRE_FIXE' })
  const participants = actifs.filter((m) => m.profil === 'A_JOUR').slice(0, 10)
  const cycleId = await ouvrirCycle(prisma, tontine.id, participants.map((m, i) => ({ membreId: id(m.cle), parts: i === 0 ? 2 : 1 })))
  const tours: { id: string; numero: number }[] = await prisma.tourTontine.findMany({
    where: { cycleId },
    orderBy: { numero: 'asc' },
    select: { id: true, numero: true },
  })
  let misesTontine = 0
  for (const tour of tours.slice(0, 5)) {
    for (const p of participants) {
      await enregistrerMise(prisma, tour.id, id(p.cle))
      misesTontine++
    }
    await reverserTour(prisma, tour.id, ilYA((6 - tour.numero) * 30))
  }
  for (const p of participants.slice(0, 6)) {
    await enregistrerMise(prisma, tours[5]!.id, id(p.cle))
    misesTontine++
  }

  // Réunion passée : ordre du jour, présences, compte-rendu, résolution adoptée par vote.
  const passee = await creerReunion(prisma, {
    date: ilYA(40),
    lieu: 'Salle communautaire du quartier',
    type: 'ORDINAIRE',
    statut: 'TENUE',
    compteRenduTexte:
      "L'assemblée a examiné le bilan financier du semestre, approuvé le soutien aux familles endeuillées et voté la cotisation de l'an prochain.",
    pointsOrdreDuJour: [{ titre: 'Bilan financier du semestre' }, { titre: 'Soutien aux familles endeuillées' }, { titre: 'Divers' }],
  })
  // `creerReunion` relit la réunion (`findUnique` → type nullable) : garde explicite pour TypeScript.
  if (!passee) throw new Error('Réunion de démonstration non créée')
  for (const [i, m] of actifs.slice(0, 28).entries()) {
    const statut = i < 24 ? 'PRESENT' : i < 26 ? 'EXCUSE' : 'ABSENT'
    await prisma.presenceReunion.upsert({
      where: { reunionId_membreId: { reunionId: passee.id, membreId: id(m.cle) } },
      create: { reunionId: passee.id, membreId: id(m.cle), statut },
      update: { statut },
    })
  }
  const resolution = await creerResolution(prisma, passee.id, {
    texte: "Porter la cotisation annuelle à 24 000 FCFA à partir de l'an prochain.",
    pointOrdreDuJourId: passee.pointsOrdreDuJour[0].id,
  })
  await ouvrirVoteResolution(prisma, resolution.id)
  const sens = ['POUR', 'CONTRE', 'ABSTENTION'] as const
  for (const [i, m] of actifs.slice(0, 20).entries()) {
    await voterResolution(prisma, resolution.id, id(m.cle), i < 14 ? sens[0] : i < 18 ? sens[1] : sens[2])
  }
  await cloturerResolution(prisma, resolution.id, ilYA(40))
  await creerResolution(prisma, passee.id, {
    texte: "Désigner deux commissaires aux comptes pour l'exercice en cours.",
    statut: 'ADOPTEE',
    dateVote: ilYA(40),
  })

  // Réunion à venir.
  await creerReunion(prisma, {
    date: new Date(now.getTime() + 10 * JOUR_MS),
    lieu: 'Salle communautaire du quartier',
    type: 'ORDINAIRE',
    statut: 'PLANIFIEE',
    pointsOrdreDuJour: [{ titre: 'Point sur les cotisations' }, { titre: 'Préparation de la fête annuelle' }],
  })

  // Fonctions sociales et leurs titulaires.
  const titulaires: [string, string][] = [
    ['Présidente', presidente.cle],
    ['Trésorier', membres[1]!.cle],
    ['Secrétaire', membres[3]!.cle],
    ['Commissaire aux comptes', membres[4]!.cle],
  ]
  for (const [nom, cle] of titulaires) {
    const fonction = await creerFonction(prisma, { nom })
    await creerAffectation(prisma, { fonctionId: fonction.id, membreId: id(cle), dateDebut: new Date(Date.UTC(annee - 2, 0, 15, 9)) })
  }

  return {
    membres: membres.length,
    versements: plan.length,
    recus: plan.length + 1,
    recusAnnules: 1,
    depenses: DEPENSES_DEMO.length,
    dons: 12,
    amendes: 3,
    misesTontine,
    votes: 20,
  }
}
```

- [ ] **Step 4: Lancer le test d'intégration**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-generateur.integration.test.ts
```

Expected: PASS (6 tests). Pistes si un test échoue, sans affaiblir l'assertion :
- Une erreur de type TypeScript/Prisma sur un `data` (champ inconnu, enum) : relire le modèle dans `backend/prisma/schema.prisma` et corriger le nom du champ dans le générateur.
- `creerReunion` ne renvoie pas `pointsOrdreDuJour` : lire `REUNION_INCLUDE` dans `reunion.service.ts` et utiliser le champ réellement inclus.
- Statuts de cotisation différents de 25/11/6 alors que `demo-donnees.test.ts` passe : vérifier que `ouvrirAnnee` a bien créé une contribution par (membre, année) de la fenêtre et que chaque versement vise la bonne (`contributionDe`).
- Le test de panne laisse l'organisation : vérifier que la surcharge `tontine.create` est bien atteinte (le générateur doit passer `prisma`, pas une instance importée, à `creerTontine`).

- [ ] **Step 5: Inscrire l'appel `runUnscoped`**

Run: `cd backend && npm run test -- --run tests/runUnscoped-allowlist.test.ts` → FAIL.

Dans `APPROUVES`, après `'services/demo-suppression.service.ts': 1,` :

```ts
  // Espace de démonstration — génération (spec 2026-09-15 §3.1) : création de l'organisation et de son
  // compte ADMIN par `inscrireOrganisation`, AVANT qu'aucun tenant n'existe (même justification que
  // l'auto-inscription). Tout le remplissage tourne ensuite sous `orgContext.run`.
  'services/demo-generateur.service.ts': 1,
```

Run: `cd backend && npm run test -- --run tests/runUnscoped-allowlist.test.ts` → PASS.

- [ ] **Step 6: Build, suite hors intégration, commit**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'
cd .. && git add backend/src/services/demo-generateur.service.ts backend/tests/demo-generateur.integration.test.ts backend/tests/runUnscoped-allowlist.test.ts
git commit -m "feat(demo): générateur de l'espace de démonstration par les services réels

Organisation fictive complète (45 membres, versements et reçus dont un annulé,
dépenses, cagnotte, amendes, tontine, réunions et vote, fonctions), invisible
pendant le remplissage (estDemo, inactive) puis activée ; rien n'est envoyé ;
une génération interrompue ne laisse aucun reste. Prouvé contre Postgres :
réconciliation sans écart, statuts 25/11/6.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Régénération, étape nocturne et commande `demo:generer`

**Files:**
- Create: `backend/src/services/demo-regeneration.service.ts`
- Modify: `backend/src/services/notification-scheduler.ts` (après l'étape rétention, et le log de démarrage)
- Create: `backend/prisma/generer-demo.ts`
- Modify: `backend/package.json` (`scripts`)
- Modify: `backend/tests/demo-taches-de-fond.test.ts` (`COMPTES_ATTENDUS`)
- Test: `backend/tests/demo-regeneration.service.test.ts`, `backend/tests/demo-regeneration.integration.test.ts`

**Interfaces:**
- Consumes: `genererOrganisationDemo`, `OrganisationDemoGeneree` (Task 4) ; `supprimerOrganisationDemo` (Task 3) ; `chargerCompteDemo` (`demo.service.ts`, PR 1) ; `envelopperPrisma` (Task 3) ; `ObservabiliteClient` (`lib/observabilite.ts`).
- Produces:
  - `AGE_MAX_DEMO_JOURS = 7`, `DELAI_ORPHELINE_MS = 3_600_000`
  - `type ResultatRegeneration = { statut: 'A_JOUR'; demoId: string; supprimees: string[] } | { statut: 'REGENEREE'; demoId: string; supprimees: string[] }`
  - `interface OptionsRegeneration { now?: Date; forcer?: boolean; generer?: (prisma: any, blob: BlobPurgeClient, now: Date) => Promise<OrganisationDemoGeneree> }`
  - `regenererDemo(prisma: any, blob: BlobPurgeClient, options?: OptionsRegeneration): Promise<ResultatRegeneration>`
  - `interface EtapeDemoDeps { prisma: any; blob: BlobPurgeClient; demoActivee: boolean; log: { info(obj: object, msg: string): void; error(obj: object, msg: string): void }; observabilite: Pick<ObservabiliteClient, 'signaler'> }`
  - `executerEtapeDemo(deps: EtapeDemoDeps, regenerer?: typeof regenererDemo): Promise<void>`
  - script npm `demo:generer`

- [ ] **Step 1: Écrire le test unitaire de l'étape nocturne**

Créer `backend/tests/demo-regeneration.service.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { executerEtapeDemo } from '../src/services/demo-regeneration.service'

/**
 * Étape nocturne de la démo (spec 2026-09-15 §3.2) : n'agit que si `DEMO_ACTIVEE`, ne fait JAMAIS échouer
 * la tâche de nuit, signale un échec à l'observabilité avec `tache: 'DEMO'`.
 */

function deps(demoActivee: boolean) {
  const journal: string[] = []
  const signalements: { contexte: Record<string, unknown> }[] = []
  return {
    journal,
    signalements,
    valeur: {
      prisma: {},
      blob: { del: async () => undefined },
      demoActivee,
      log: { info: (_o: object, msg: string) => void journal.push(`info:${msg}`), error: (_o: object, msg: string) => void journal.push(`error:${msg}`) },
      observabilite: { signaler: (_e: unknown, contexte: Record<string, unknown>) => void signalements.push({ contexte }) },
    },
  }
}

describe('executerEtapeDemo', () => {
  it('démo éteinte : ne régénère rien', async () => {
    const d = deps(false)
    let appels = 0
    await executerEtapeDemo(d.valeur, async () => {
      appels++
      return { statut: 'A_JOUR', demoId: 'x', supprimees: [] }
    })
    expect(appels).toBe(0)
  })

  it('démo activée : régénère et journalise le résultat', async () => {
    const d = deps(true)
    await executerEtapeDemo(d.valeur, async () => ({ statut: 'REGENEREE', demoId: 'org-demo', supprimees: ['ancienne'] }))
    expect(d.journal.some((l) => l.startsWith('info:'))).toBe(true)
    expect(d.signalements).toEqual([])
  })

  it('échec : journalisé, signalé avec tache DEMO, jamais propagé', async () => {
    const d = deps(true)
    await expect(
      executerEtapeDemo(d.valeur, async () => {
        throw new Error('base indisponible')
      }),
    ).resolves.toBeUndefined()
    expect(d.journal.some((l) => l.startsWith('error:'))).toBe(true)
    expect(d.signalements[0]?.contexte).toMatchObject({ source: 'scheduler', tache: 'DEMO' })
  })
})
```

- [ ] **Step 2: Écrire le test d'intégration de la régénération**

Créer `backend/tests/demo-regeneration.integration.test.ts` :

```ts
import 'dotenv/config'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { prisma as prismaEtendu } from '../src/lib/prisma'
import { orgContext } from '../src/lib/org-context'
import { chargerCompteDemo } from '../src/services/demo.service'
import { genererOrganisationDemo } from '../src/services/demo-generateur.service'
import { supprimerOrganisationDemo } from '../src/services/demo-suppression.service'
import { regenererDemo } from '../src/services/demo-regeneration.service'
import { envelopperPrisma } from './support/prisma-espion'

/**
 * Spec 2026-09-15 §3.2, contre une VRAIE Postgres. La base est partagée par des fichiers exécutés en
 * parallèle (dont d'autres organisations démo) : le client est enveloppé pour que la régénération ne
 * VOIE que les organisations de CE fichier — sans quoi elle supprimerait les fixtures des autres.
 * Couvre aussi l'ordre de `chargerCompteDemo` (« démo active la plus récente »), mocké en PR 1.
 * Exige `DATABASE_URL` jetable (JAMAIS `nkoni`).
 */

const ANCIENNE = 'eb000000-0000-4000-8000-0000000000b1'
const ORPHELINE = 'eb000000-0000-4000-8000-0000000000b2'
const EN_COURS = 'eb000000-0000-4000-8000-0000000000b3'
const REELLE = 'eb000000-0000-4000-8000-0000000000b4'
const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
const blob = { del: async () => undefined }
const connus = new Set<string>([ANCIENNE, ORPHELINE, EN_COURS, REELLE])
let generations = 0

function exigerBaseDeTest(): void {
  const nom = new URL(process.env['DATABASE_URL'] ?? 'postgresql://x/inconnue').pathname.slice(1)
  if (!/_it_|test/.test(nom)) throw new Error(`demo-regeneration.integration : base « ${nom} » refusée — utiliser une base jetable`)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const restreindre = (rows: any[]) => rows.filter((r) => connus.has(r.id))
const client = envelopperPrisma(prismaEtendu, {
  organisation: {
    findMany: async (originale, args) => restreindre(await originale({ ...args, select: { ...(args?.select ?? {}), id: true } })),
    findFirst: async (_originale, args) => {
      const lignes = restreindre(await prismaEtendu.organisation.findMany({ where: args.where, orderBy: args.orderBy, select: { ...(args.select ?? {}), id: true } }))
      return lignes[0] ?? null
    },
  },
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generer = async (p: any, b: any, now: Date) => {
  generations++
  const r = await genererOrganisationDemo(p, b, now)
  connus.add(r.organisationId)
  return r
}

const ilYA = (ms: number) => new Date(Date.now() - ms)

async function nettoyerTout(): Promise<void> {
  for (const id of connus) {
    const org = await base.organisation.findUnique({ where: { id }, select: { estDemo: true } })
    if (org?.estDemo) await supprimerOrganisationDemo(prismaEtendu, blob, id)
  }
  await base.utilisateur.deleteMany({ where: { organisationId: REELLE } })
  await base.platformAuditLog.deleteMany({ where: { organisationCibleId: { in: [...connus] } } })
  await base.organisation.deleteMany({ where: { id: REELLE } })
}

beforeAll(async () => {
  exigerBaseDeTest()
  await nettoyerTout()
  await base.organisation.create({ data: { id: ANCIENNE, nom: 'Démo ancienne', devise: 'FCFA', estDemo: true, actif: true, createdAt: ilYA(10 * 86_400_000) } })
  await base.utilisateur.create({ data: { organisationId: ANCIENNE, email: 'admin-ancienne@demo-regeneration-it.local', passwordHash: 'x', role: 'ADMIN', actif: true } })
  await base.organisation.create({ data: { id: ORPHELINE, nom: 'Démo orpheline', devise: 'FCFA', estDemo: true, actif: false, createdAt: ilYA(2 * 3_600_000) } })
  await base.organisation.create({ data: { id: EN_COURS, nom: 'Démo en cours de génération', devise: 'FCFA', estDemo: true, actif: false, createdAt: ilYA(10 * 60_000) } })
  await base.organisation.create({ data: { id: REELLE, nom: 'Organisation réelle', devise: 'FCFA' } })
  await base.utilisateur.create({ data: { organisationId: REELLE, email: 'admin-reelle@demo-regeneration-it.local', passwordHash: 'x', role: 'ADMIN', actif: true } })
})

afterAll(async () => {
  await nettoyerTout()
  await base.$disconnect()
}, 180_000)

describe('regenererDemo', () => {
  let nouvelle = ''

  it('démo trop ancienne : génère la nouvelle PUIS supprime l’ancienne et l’orpheline, garde la génération en cours et le réel', async () => {
    const r = await regenererDemo(client, blob, { generer })
    expect(r.statut).toBe('REGENEREE')
    nouvelle = r.demoId
    expect(await base.organisation.findUnique({ where: { id: nouvelle }, select: { estDemo: true, actif: true } })).toEqual({ estDemo: true, actif: true })
    expect(await base.organisation.findUnique({ where: { id: ANCIENNE } })).toBeNull()
    expect(await base.organisation.findUnique({ where: { id: ORPHELINE } })).toBeNull()
    expect(await base.organisation.findUnique({ where: { id: EN_COURS } })).not.toBeNull()
    expect(await base.organisation.findUnique({ where: { id: REELLE } })).not.toBeNull()
    expect(r.supprimees.sort()).toEqual([ANCIENNE, ORPHELINE].sort())
  }, 300_000)

  it('chargerCompteDemo ouvre la démo active la plus récente (celle qui vient d’être générée)', async () => {
    const compte = await orgContext.runUnscoped(async () => await chargerCompteDemo(client))
    expect(compte?.organisationId).toBe(nouvelle)
  })

  it('démo récente : rien n’est généré', async () => {
    const avant = generations
    const r = await regenererDemo(client, blob, { generer })
    expect(r).toMatchObject({ statut: 'A_JOUR', demoId: nouvelle })
    expect(generations).toBe(avant)
  })

  it('forcer : régénère malgré une démo récente, une seule démo active reste', async () => {
    const r = await regenererDemo(client, blob, { generer, forcer: true })
    expect(r.statut).toBe('REGENEREE')
    expect(r.supprimees).toContain(nouvelle)
    const demosActives = await base.organisation.findMany({ where: { id: { in: [...connus] }, estDemo: true, actif: true }, select: { id: true } })
    expect(demosActives.map((o) => o.id)).toEqual([r.demoId])
  }, 300_000)
})
```

- [ ] **Step 3: Lancer les tests, vérifier l'échec**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run test -- --run tests/demo-regeneration.service.test.ts
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-regeneration.integration.test.ts
```

Expected: FAIL — module `demo-regeneration.service` introuvable.

- [ ] **Step 4: Écrire le service**

Créer `backend/src/services/demo-regeneration.service.ts` :

```ts
import type { ObservabiliteClient } from '../lib/observabilite'
import type { BlobPurgeClient } from './organisation-purge.service'
import { genererOrganisationDemo, type OrganisationDemoGeneree } from './demo-generateur.service'
import { supprimerOrganisationDemo } from './demo-suppression.service'

/**
 * Espace de démonstration (spec 2026-09-15 §3.2) — régénération.
 *
 * Sans elle la démo vieillit (en janvier, « l'année courante » serait vide). Règle :
 *  - une démo ACTIVE de moins de 7 jours existe (et `forcer` n'est pas demandé) → rien à générer ;
 *  - sinon → générer la NOUVELLE d'abord, PUIS supprimer les autres : jamais de trou de service, un
 *    visiteur sur l'ancienne reçoit un 401/404 et le front redemande un jeton ;
 *  - dans les deux cas, les démos INACTIVES de plus d'une heure sont des générations interrompues
 *    (processus tué) : supprimées. Plus jeunes, elles peuvent être une génération EN COURS (commande
 *    manuelle pendant la nuit) : laissées.
 */

export const AGE_MAX_DEMO_JOURS = 7
export const DELAI_ORPHELINE_MS = 60 * 60 * 1000

export type ResultatRegeneration =
  | { statut: 'A_JOUR'; demoId: string; supprimees: string[] }
  | { statut: 'REGENEREE'; demoId: string; supprimees: string[] }

export interface OptionsRegeneration {
  now?: Date
  forcer?: boolean
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generer?: (prisma: any, blob: BlobPurgeClient, now: Date) => Promise<OrganisationDemoGeneree>
}

export async function regenererDemo(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any,
  blob: BlobPurgeClient,
  options: OptionsRegeneration = {},
): Promise<ResultatRegeneration> {
  const now = options.now ?? new Date()
  const generer = options.generer ?? genererOrganisationDemo
  // `Organisation` n'est pas un modèle scopé : aucune lecture de tenant, aucun contexte requis. Liste
  // délibérément les DÉMOS (`estDemo: true`), comptée dans `demo-taches-de-fond.test.ts`.
  const demos: { id: string; actif: boolean; createdAt: Date }[] = await prisma.organisation.findMany({
    where: { estDemo: true },
    select: { id: true, actif: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })
  const age = (d: { createdAt: Date }) => now.getTime() - d.createdAt.getTime()
  const orpheline = (d: { actif: boolean; createdAt: Date }) => !d.actif && age(d) > DELAI_ORPHELINE_MS

  const active = demos.find((d) => d.actif)
  if (active && !options.forcer && age(active) < AGE_MAX_DEMO_JOURS * 24 * 60 * 60 * 1000) {
    const supprimees: string[] = []
    for (const d of demos.filter(orpheline)) {
      await supprimerOrganisationDemo(prisma, blob, d.id)
      supprimees.push(d.id)
    }
    return { statut: 'A_JOUR', demoId: active.id, supprimees }
  }

  const { organisationId } = await generer(prisma, blob, now)
  const supprimees: string[] = []
  for (const d of demos) {
    if (d.id === organisationId || (!d.actif && !orpheline(d))) continue
    await supprimerOrganisationDemo(prisma, blob, d.id)
    supprimees.push(d.id)
  }
  return { statut: 'REGENEREE', demoId: organisationId, supprimees }
}

export interface EtapeDemoDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma: any
  blob: BlobPurgeClient
  demoActivee: boolean
  log: { info(obj: object, msg: string): void; error(obj: object, msg: string): void }
  observabilite: Pick<ObservabiliteClient, 'signaler'>
}

/**
 * Étape nocturne (après la rétention, sur l'instance qui détient le verrou). Éteinte sans
 * `DEMO_ACTIVEE`. Ne lève JAMAIS : un échec est journalisé et signalé (`tache: 'DEMO'`), la démo
 * existante reste servie et la nuit suivante réessaie.
 */
export async function executerEtapeDemo(deps: EtapeDemoDeps, regenerer: typeof regenererDemo = regenererDemo): Promise<void> {
  if (!deps.demoActivee) return
  try {
    const r = await regenerer(deps.prisma, deps.blob)
    deps.log.info({ statut: r.statut, demoId: r.demoId, supprimees: r.supprimees.length }, 'Espace de démonstration vérifié')
  } catch (err) {
    deps.log.error({ err }, 'Régénération de l’espace de démonstration échouée')
    deps.observabilite.signaler(err, { source: 'scheduler', tache: 'DEMO' })
  }
}
```

- [ ] **Step 5: Lancer les tests**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run test -- --run tests/demo-regeneration.service.test.ts
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-regeneration.integration.test.ts
```

Expected : PASS (3 tests unitaires, 4 tests d'intégration). Si le cas « chargerCompteDemo » renvoie `null` : vérifier que la surcharge `findFirst` de l'enveloppe est bien appelée (le service `chargerCompteDemo` doit utiliser le `prisma` reçu).

**Couverture assumée** : la condition « seulement sur l'instance qui détient le verrou » vit dans le callback cron de `notification-scheduler.ts` (`if (!verrouObtenu) return`), comme l'étape de rétention — `demarrerScheduler` n'a pas de test (aucun n'existe aujourd'hui). Ce qui EST testé : l'interrupteur `DEMO_ACTIVEE`, le non-échec, le signalement, et toute la logique de décision (intégration).

- [ ] **Step 6: Compter le nouvel `organisation.findMany` dans le verrou textuel**

Run: `cd backend && npm run test -- --run tests/demo-taches-de-fond.test.ts` → FAIL (`services/demo-regeneration.service.ts` non attendu).

Dans `backend/tests/demo-taches-de-fond.test.ts`, objet `COMPTES_ATTENDUS`, ajouter :

```ts
  // Régénération de la démo (spec 2026-09-15 §3.2) : liste les DÉMOS elles-mêmes (`estDemo: true`) pour
  // décider de la régénération et supprimer les anciennes — c'est l'unique boucle qui DOIT les voir.
  'services/demo-regeneration.service.ts': 1,
```

Run: `cd backend && npm run test -- --run tests/demo-taches-de-fond.test.ts` → PASS.

- [ ] **Step 7: Brancher l'étape nocturne**

Dans `backend/src/services/notification-scheduler.ts`, ajouter l'import :

```ts
import { executerEtapeDemo } from './demo-regeneration.service'
```

Juste après le bloc `.then(async () => { if (!verrouObtenu) return … 'Purge de rétention échouée' … })` de l'étape rétention (avant la fermeture `},` du callback cron), ajouter :

```ts
        // Espace de démonstration (spec 2026-09-15 §3.2) : régénération hebdomadaire, APRÈS la rétention,
        // sur l'instance qui a le verrou seulement. Éteinte sans DEMO_ACTIVEE ; ne lève jamais.
        .then(async () => {
          if (!verrouObtenu) return
          await executerEtapeDemo({
            prisma: app.prisma,
            blob: app.blob,
            demoActivee: app.demoActivee,
            log: app.log,
            observabilite: app.observabilite,
          })
        })
```

Remplacer le message de démarrage :

```ts
  app.log.info(
    'Scheduler notifications démarré (COTISATION_RETARD + REUNION_RAPPEL + FORFAIT_ECHEANCE + RÉTENTION + DÉMO — 03:00 Africa/Douala)',
  )
```

- [ ] **Step 8: Écrire la commande**

Créer `backend/prisma/generer-demo.ts` :

```ts
import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { vercelBlobClient } from '../src/lib/blob'
import { regenererDemo } from '../src/services/demo-regeneration.service'

/**
 * Génère l'espace de démonstration (spec 2026-09-15 §3.2) — première création en production, ou
 * régénération manuelle. Même chemin que l'étape nocturne, en mode FORCÉ : génère la nouvelle démo,
 * puis supprime les anciennes. Exécutée par le PO (cf. `docs/architecture-demo.md`, mise en service).
 *
 * Codes de sortie : 0 = démo prête ; 1 = échec (aucune démo partielle ne reste).
 * `backend/prisma/*.ts` n'est pas couvert par l'allowlist `runUnscoped` (scan de `src/` seulement) ;
 * ce script n'en contient aucun.
 */
async function main(): Promise<void> {
  if (process.env['DEMO_ACTIVEE'] !== 'true') {
    console.warn(
      "⚠️  DEMO_ACTIVEE n'est pas « true » dans cet environnement : la démo sera générée, mais POST /demo/session répondra 404 et la tâche de nuit ne la régénérera pas.",
    )
  }
  const debut = Date.now()
  const r = await regenererDemo(prisma, vercelBlobClient, { forcer: true })
  console.log(`✔ Démo ${r.statut === 'REGENEREE' ? 'générée' : 'déjà à jour'} : ${r.demoId}`)
  console.log(`  anciennes supprimées : ${r.supprimees.length}`)
  console.log(`  durée : ${Math.round((Date.now() - debut) / 1000)} s`)
}

main()
  .catch((err: unknown) => {
    console.error('✘ Échec de la génération de la démo :', err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
```

Dans `backend/package.json`, section `scripts`, après `"rechiffrer:psp": …,` :

```json
    "demo:generer": "tsx prisma/generer-demo.ts",
```

- [ ] **Step 9: Essayer la commande sur la base jetable**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npm run demo:generer; echo "exit=$?"
PG=/opt/homebrew/opt/postgresql@18/bin
$PG/psql "postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" -tAc "select count(*) from \"Organisation\" where \"estDemo\" and actif and nom = 'Association Exemple NKONI'"
```

Expected : l'avertissement `DEMO_ACTIVEE`, puis `✔ Démo générée : <uuid>` ; `exit=0` ; au moins `1`. Supprimer ensuite cette démo pour ne pas laisser de reste dans la base jetable :

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
cat > "${TMPDIR:-/tmp}/nettoyer-demo.ts" <<'EOF'
import 'dotenv/config'
import { prisma } from '/Users/nelson/Documents/Projets/nkoni/backend/src/lib/prisma'
import { supprimerOrganisationDemo } from '/Users/nelson/Documents/Projets/nkoni/backend/src/services/demo-suppression.service'
async function main() {
  const demos = await prisma.organisation.findMany({ where: { estDemo: true, nom: 'Association Exemple NKONI' }, select: { id: true } })
  for (const d of demos) await supprimerOrganisationDemo(prisma, { del: async () => undefined }, d.id)
  console.log(`démos supprimées : ${demos.length}`)
}
main().finally(() => prisma.$disconnect())
EOF
cp "${TMPDIR:-/tmp}/nettoyer-demo.ts" ./nettoyer-demo.tmp.ts
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx tsx ./nettoyer-demo.tmp.ts
rm -f ./nettoyer-demo.tmp.ts
```

Expected : `démos supprimées : 1` (ou plus s'il en restait).

- [ ] **Step 10: Saboter la règle « générer d'abord, supprimer ensuite » dans la direction utile**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
cp src/services/demo-regeneration.service.ts "${TMPDIR:-/tmp}/demo-regeneration.bak"
sed -i '' 's/if (d.id === organisationId || (!d.actif \&\& !orpheline(d))) continue/if (d.id === organisationId) continue/' src/services/demo-regeneration.service.ts
grep -c "if (d.id === organisationId) continue" src/services/demo-regeneration.service.ts
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-regeneration.integration.test.ts 2>&1 | grep -E "Tests |×"
cp "${TMPDIR:-/tmp}/demo-regeneration.bak" src/services/demo-regeneration.service.ts
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npx vitest --run tests/demo-regeneration.integration.test.ts 2>&1 | grep -E "Tests "
```

Expected : `1` ; le premier test échoue (la génération EN COURS est supprimée) ; restauré : `4 passed`.

- [ ] **Step 11: Build, suite hors intégration, commit**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'
cd .. && git add backend/src/services/demo-regeneration.service.ts backend/src/services/notification-scheduler.ts backend/prisma/generer-demo.ts backend/package.json backend/tests/demo-regeneration.service.test.ts backend/tests/demo-regeneration.integration.test.ts backend/tests/demo-taches-de-fond.test.ts
git commit -m "feat(demo): régénération hebdomadaire et commande demo:generer

Démo active de moins de 7 jours → rien ; sinon la nouvelle est générée AVANT la
suppression des anciennes (pas de trou) ; générations interrompues de plus d'une
heure nettoyées, génération en cours préservée. Étape nocturne après la rétention
(verrou, DEMO_ACTIVEE, jamais bloquante, signalée tache DEMO). Ordre de
chargerCompteDemo prouvé contre Postgres. Sabotage vérifié.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Documentation et vérification complète

**Files:**
- Modify: `docs/architecture-demo.md`
- Modify: `CLAUDE.md` (bloc « Espace de démonstration »)
- Modify: `docs/roadmap-v1-vers-GA.md` (ligne 1.2)

**Interfaces:**
- Consumes: tout ce qui précède.

- [ ] **Step 1: Compléter `docs/architecture-demo.md`**

Dans l'introduction, remplacer la mention « générateur et régénération (à venir, PR 2) » par « générateur et régénération (§5, PR 2) ». Puis ajouter à la fin du fichier :

```markdown
## 5. Génération et régénération (PR 2)

- **Description pure** `services/demo-donnees.ts` : 45 membres fictifs (42 actifs : 25 à jour, 11
  partiels, 6 en retard ; 2 inactifs, 1 décédé), barèmes sur 3 ans, versements jamais futurs, 8
  dépenses. Déterministe par indices ; seules les dates suivent `now`. La cohérence avec la règle de
  statut RÉELLE est testée sans base (`demo-donnees.test.ts`).
- **Générateur** `genererOrganisationDemo` : organisation créée par `inscrireOrganisation` (e-mail en
  `.invalid`, mot de passe jeté), marquée `estDemo: true, actif: false` pendant le remplissage — invisible
  de `POST /demo/session` et des tâches de fond — puis activée. Remplissage par les **services réels**
  (versements, reçus dont un annulé puis réémis, tontine, votes, fonctions) sous `auditContext.run` +
  `orgContext.run` ; écriture directe seulement là où la création vit dans une route. **Rien n'est
  envoyé** : les envois (notifications, reçus, paiements) vivent dans les routes. Une erreur supprime
  l'organisation partielle avant de remonter. Preuve : `reconcilierVersements` sans écart.
- **Suppression** `supprimerOrganisationDemo` : purge de tenant réutilisée sans la précondition humaine ;
  la nature de démo est relue DANS la transaction (`updateMany` conditionnel sur `estDemo: true`), une
  organisation réelle n'est jamais effaçable par ce chemin. Journal `SUPPRIMER_DEMO` best-effort, acteur
  `systeme`.
- **Régénération** `regenererDemo` : démo active de moins de 7 jours → rien ; sinon générer la nouvelle
  **puis** supprimer les anciennes. Les démos inactives de plus d'une heure sont des générations
  interrompues (supprimées) ; plus jeunes, une génération peut être en cours (laissées). Étape nocturne
  `executerEtapeDemo` après la rétention, sur l'instance qui a le verrou, éteinte sans `DEMO_ACTIVEE`,
  jamais bloquante (`tache: 'DEMO'`).
- **Tests d'intégration** : la base est partagée par des fichiers en parallèle ; ceux qui listent les
  démos passent par `tests/support/prisma-espion.ts` pour ne voir que leurs propres organisations.

## Mise en service (PO)

1. Poser `DEMO_ACTIVEE=true` sur le service Railway `nkoni`.
2. Générer la démo une fois contre la base de production, sans jamais coller son URL :

   ```bash
   railway run --service nkoni -- sh -c 'u="$(railway variables --service Postgres --kv | grep "^DATABASE_PUBLIC_URL=" | cut -d= -f2-)"; [ -n "$u" ] || { echo "URL de la base introuvable"; exit 1; }; DATABASE_URL="$u" npm run demo:generer'
   ```

   Attendu : `✔ Démo générée : <uuid>` et un code de sortie 0 (compter quelques minutes).
3. Contrôle : `POST https://nkoni.vercel.app/api/demo/session` répond 200 ; la console super-admin
   montre l'organisation avec le badge « Démo ». Le front de démonstration arrive avec la PR 3.
```

- [ ] **Step 2: Compléter `CLAUDE.md`**

Dans le bloc « **Espace de démonstration (chantier 1.2)** », ajouter une troisième puce après les deux invariants existants :

```markdown
- **Une démo ne se supprime que par `supprimerOrganisationDemo`** (relit `estDemo` dans la transaction) et **ne se génère que par les services réels, sans aucun envoi** ; une génération échouée supprime son reste. Régénération nocturne : générer la nouvelle AVANT de supprimer l'ancienne.
```

- [ ] **Step 3: Mettre à jour la roadmap**

Dans `docs/roadmap-v1-vers-GA.md`, ligne 1.2, remplacer `restent le générateur/régénération (PR 2) et le front (PR 3)` par :

```markdown
**PR 2 générateur et régénération livrée** (démo générée par les services réels, suppression gardée, régénération hebdomadaire, `npm run demo:generer`) ; reste le front (PR 3)
```

Si la phrase exacte diffère (vérifier avec `grep -n "PR 2" docs/roadmap-v1-vers-GA.md`), adapter le remplacement pour dire la même chose.

- [ ] **Step 4: Vérification complète**

```bash
cd /Users/nelson/Documents/Projets/nkoni/backend
npm run build
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable" npm run test -- --run
cd ../frontend
npm run build && npx oxlint && npm run test
```

Expected : build backend propre ; toute la suite backend passe, intégrations comprises ; front build + oxlint (0 finding) + tests verts. Si un fichier d'intégration échoue, le relancer seul une fois et rapporter les deux exécutions.

- [ ] **Step 5: Relire ce qui part dans un dépôt public**

```bash
cd /Users/nelson/Documents/Projets/nkoni
git diff main --stat | tail -3
git diff main | grep -inE "^\+.*(password=|secret=|postgresql://[a-z]+:[^@$]+@)" || echo "rien de sensible"
```

Expected : `rien de sensible`.

- [ ] **Step 6: Commit (sans push ni PR — le contrôleur les fait après la revue finale)**

```bash
cd /Users/nelson/Documents/Projets/nkoni
git add docs/architecture-demo.md CLAUDE.md docs/roadmap-v1-vers-GA.md
git commit -m "docs(demo): génération, régénération et mise en service de la démo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
