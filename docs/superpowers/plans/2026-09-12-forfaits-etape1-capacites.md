# Forfaits — Étape 1 « Capacités » : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** remplacer la fonction `limiteMembresForfait` par une table de capacités par forfait
(`CAPACITES_FORFAIT`), miroitée au front et protégée par un garde de parité inter-couches — **sans aucun
changement de comportement**.

**Architecture :** `backend/src/lib/forfait.ts` devient la source unique des capacités (membres,
stockage, paiement en ligne) ; `limiteMembresForfait` en **dérive** pour que ses 13 appelants restent
intacts. Le miroir `frontend/src/lib/forfait.ts` reprend la même table ; un test front lit les deux
fichiers **en texte** (le front ne peut pas importer le back) et échoue à la moindre divergence. Les
capacités `quotaStockageOctets` et `paiementEnLigne` sont **déclarées mais pas encore consommées** :
elles le seront à l'étape 3 (quotas).

**Tech Stack :** TypeScript, Vitest (backend : `backend/tests/*.test.ts` ; frontend :
`frontend/src/**/*.test.ts` en env `node`), oxlint.

**Spec :** `docs/superpowers/specs/2026-09-12-forfaits-echeance-design.md` — §1.2 (tableau), §2.2
(source unique), §5 (tests de parité), §6 étape 1.

## Global Constraints

- **Comportement inchangé** : Gratuit = 50 membres, Pro et Entreprise = illimités (`null`). Aucun
  appelant de `limiteMembresForfait` n'est modifié.
- **Valeurs exactes** (spec §1.2) : GRATUIT `{ limiteMembres: 50, quotaStockageOctets: 500 * MO,
  paiementEnLigne: false }` ; PRO et ENTREPRISE `{ limiteMembres: null, quotaStockageOctets: 20 * GO,
  paiementEnLigne: true }`.
- **Unités binaires** : `MO = 1024 * 1024`, `GO = 1024 * MO` — cohérent avec `TAILLE_MAX_IMAGE = 5 * 1024
  * 1024` (`backend/src/lib/upload-image.ts`).
- **Miroir front tolérant** : un forfait inconnu (API déployée avant le front) renvoie `null`, comme le
  `default` actuel du miroir. Le backend reste exhaustif (enum Prisma).
- **Parité lue en TEXTE**, jamais d'import du backend depuis le front (convention de
  `frontend/src/lib/roles-parity.test.ts`).
- **Français** : noms, commentaires, messages, commits (CLAUDE.md, Conventions). Commits terminés par
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.
- **Branche** : `feat/forfaits-capacites` (déjà créée, ce plan en est le premier commit). Jamais de commit
  sur `main`.
- **Vérification avant PR** (CLAUDE.md) : backend `build` + tests ; frontend `build` + `lint` (0 finding)
  + `test`.

---

## Carte des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|
| `backend/src/lib/forfait.ts` | Modifier | Table `CAPACITES_FORFAIT` (source unique) + `limiteMembresForfait` dérivée |
| `backend/tests/forfait.test.ts` | Créer | Valeurs figées par la spec, exhaustivité, dérivation |
| `frontend/src/lib/forfait.ts` | Modifier | Miroir de la table, repli tolérant |
| `frontend/src/lib/forfait.test.ts` | Créer | Dérivation + repli sur forfait inconnu |
| `frontend/src/lib/forfait-parity.test.ts` | Créer | Garde inter-couches back ↔ front, lu en texte |
| `docs/architecture-garde-fous.md` | Modifier | Inscrire le nouveau garde ; « seul garde inter-couches » devient faux |
| `CLAUDE.md` | Modifier | Catalogue des garde-fous + phrase « source de vérité » des Forfaits |

---

### Task 1 : Table des capacités côté backend

**Files :**
- Modify : `backend/src/lib/forfait.ts` (fichier entier, 24 lignes)
- Test : `backend/tests/forfait.test.ts` (création)

**Interfaces :**
- Consumes : rien.
- Produces :
  - `export const FORFAITS: readonly ['GRATUIT', 'PRO', 'ENTREPRISE']` (inchangé)
  - `export type Forfait` (inchangé)
  - `export interface CapacitesForfait { limiteMembres: number | null; quotaStockageOctets: number; paiementEnLigne: boolean }`
  - `export const CAPACITES_FORFAIT: Readonly<Record<Forfait, Readonly<CapacitesForfait>>>`
  - `export function limiteMembresForfait(forfait: Forfait): number | null` (signature inchangée)

- [ ] **Step 1 : Écrire le test (en échec)**

Créer `backend/tests/forfait.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { CAPACITES_FORFAIT, FORFAITS, limiteMembresForfait } from '../src/lib/forfait'

/**
 * Capacités par forfait (spec 1.1 §1.2) — source UNIQUE `lib/forfait.ts`. Les valeurs sont écrites EN
 * CLAIR ici (pas recalculées depuis la table) : c'est la spécification qu'on vérifie, pas une tautologie.
 */
const MO = 1024 * 1024
const GO = 1024 * MO

describe('CAPACITES_FORFAIT', () => {
  it('porte exactement les valeurs de la spécification', () => {
    expect(CAPACITES_FORFAIT).toEqual({
      GRATUIT: { limiteMembres: 50, quotaStockageOctets: 500 * MO, paiementEnLigne: false },
      PRO: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
      ENTREPRISE: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
    })
  })

  it('couvre chaque forfait, sans en oublier ni en inventer', () => {
    expect(Object.keys(CAPACITES_FORFAIT).sort()).toEqual([...FORFAITS].sort())
  })
})

describe('limiteMembresForfait', () => {
  it.each(FORFAITS)('%s : dérive de la table', (forfait) => {
    expect(limiteMembresForfait(forfait)).toBe(CAPACITES_FORFAIT[forfait].limiteMembres)
  })

  it('comportement inchangé : Gratuit = 50, Pro et Entreprise illimités', () => {
    expect(limiteMembresForfait('GRATUIT')).toBe(50)
    expect(limiteMembresForfait('PRO')).toBeNull()
    expect(limiteMembresForfait('ENTREPRISE')).toBeNull()
  })
})
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `cd backend && npm run test -- --run tests/forfait.test.ts`

Expected : **FAIL** sur les tests qui lisent `CAPACITES_FORFAIT` (valeur `undefined` : l'export n'existe
pas encore) ; le test « comportement inchangé » **passe** déjà — c'est un test de caractérisation, il
doit rester vert avant ET après le refactor.

- [ ] **Step 3 : Implémenter**

Remplacer **tout** le contenu de `backend/src/lib/forfait.ts` par :

```ts
/**
 * Forfaits commerciaux (SaaS §3.1, spec 1.1) — SOURCE UNIQUE des capacités par forfait (routes +
 * services + tests). Miroir côté front dans `frontend/src/lib/forfait.ts`, dont l'alignement est vérifié
 * par `frontend/src/lib/forfait-parity.test.ts` (lecture en texte des deux fichiers).
 *
 * L'attribution d'un forfait est une action PLATEFORME réservée au SUPER_ADMIN (activation manuelle
 * depuis la console, pas de paiement en ligne à ce stade).
 */
export const FORFAITS = ['GRATUIT', 'PRO', 'ENTREPRISE'] as const
export type Forfait = (typeof FORFAITS)[number]

// Unités BINAIRES, comme `TAILLE_MAX_IMAGE` (lib/upload-image.ts).
const MO = 1024 * 1024
const GO = 1024 * MO

export interface CapacitesForfait {
  /** Plafond de membres ACTIFS. `null` = illimité. */
  limiteMembres: number | null
  /** Quota de stockage des documents (Σ `Document.tailleOctets`). Consommé à l'étape 3 de la spec. */
  quotaStockageOctets: number
  /** Paiement en ligne Mobile Money disponible. Consommé à l'étape 3 de la spec. */
  paiementEnLigne: boolean
}

/**
 * Capacités par forfait. Modifier UNIQUEMENT ici (+ le miroir front, sinon le garde de parité casse).
 * Ne vendre ni la transparence envers les membres, ni rien de ce qu'ils voient (spec §1.1).
 */
export const CAPACITES_FORFAIT: Readonly<Record<Forfait, Readonly<CapacitesForfait>>> = {
  GRATUIT: { limiteMembres: 50, quotaStockageOctets: 500 * MO, paiementEnLigne: false },
  PRO: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
  ENTREPRISE: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
}

/** Plafond de membres ACTIFS du forfait — DÉRIVÉ de `CAPACITES_FORFAIT` (appelants inchangés). */
export function limiteMembresForfait(forfait: Forfait): number | null {
  return CAPACITES_FORFAIT[forfait].limiteMembres
}
```

- [ ] **Step 4 : Vérifier le succès**

Run : `cd backend && npm run test -- --run tests/forfait.test.ts`
Expected : **PASS**, 6 tests (2 + 3 `it.each` + 1).

Run : `cd backend && npm run build`
Expected : sortie `tsc` sans erreur (le build EST le garde de typage du backend).

- [ ] **Step 5 : Non-régression des appelants**

Run : `cd backend && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : tous les fichiers passent. (Les `*.integration.test.ts` exigent une vraie Postgres : la CI les
exécute ; en local, les lancer avec `DATABASE_URL` pointant sur une base migrée — cf. CLAUDE.md,
Commandes.)

- [ ] **Step 6 : Commit**

```bash
git add backend/src/lib/forfait.ts backend/tests/forfait.test.ts
git commit -m "refactor(forfaits): table CAPACITES_FORFAIT, source unique des capacites

limiteMembresForfait en derive : ses appelants restent intacts, comportement
inchange (Gratuit 50, Pro et Entreprise illimites). Stockage et paiement en
ligne declares, consommes a l'etape 3 de la spec 1.1.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2 : Miroir côté frontend

**Files :**
- Modify : `frontend/src/lib/forfait.ts` (fichier entier, 17 lignes)
- Test : `frontend/src/lib/forfait.test.ts` (création)

**Interfaces :**
- Consumes : rien (le front n'importe pas le back).
- Produces : mêmes exports que la Task 1 — `FORFAITS`, `Forfait`, `CapacitesForfait`,
  `CAPACITES_FORFAIT`, `limiteMembresForfait(forfait: Forfait): number | null`.

- [ ] **Step 1 : Écrire le test (en échec)**

Créer `frontend/src/lib/forfait.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { CAPACITES_FORFAIT, FORFAITS, limiteMembresForfait, type Forfait } from './forfait'

// Env `node` (défaut des *.test.ts) : fonctions pures, aucun rendu.
describe('limiteMembresForfait (miroir front)', () => {
  it.each(FORFAITS)('%s : dérive de la table', (forfait) => {
    expect(limiteMembresForfait(forfait)).toBe(CAPACITES_FORFAIT[forfait].limiteMembres)
  })

  it('comportement inchangé : Gratuit = 50, Pro et Entreprise illimités', () => {
    expect(limiteMembresForfait('GRATUIT')).toBe(50)
    expect(limiteMembresForfait('PRO')).toBeNull()
    expect(limiteMembresForfait('ENTREPRISE')).toBeNull()
  })

  it('forfait inconnu (API plus récente que le front) : illimité, comme le `default` historique', () => {
    expect(limiteMembresForfait('FUTUR' as Forfait)).toBeNull()
  })
})
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `cd frontend && npx vitest --run src/lib/forfait.test.ts`
Expected : **FAIL** sur les 3 cas `it.each` (`CAPACITES_FORFAIT` est `undefined`) ; « comportement
inchangé » et « forfait inconnu » **passent** déjà (caractérisation du miroir actuel).

- [ ] **Step 3 : Implémenter**

Remplacer **tout** le contenu de `frontend/src/lib/forfait.ts` par :

```ts
/**
 * Forfaits commerciaux (SaaS §3.1, spec 1.1) — MIROIR de `backend/src/lib/forfait.ts`. L'alignement est
 * VÉRIFIÉ par `forfait-parity.test.ts` : modifier la table ici sans le backend (ou l'inverse) casse le
 * test. Les LIBELLÉS sont traduits via i18n, pas ici.
 */
export const FORFAITS = ['GRATUIT', 'PRO', 'ENTREPRISE'] as const
export type Forfait = (typeof FORFAITS)[number]

// Unités BINAIRES, comme `TAILLE_MAX_IMAGE` (backend/src/lib/upload-image.ts).
const MO = 1024 * 1024
const GO = 1024 * MO

export interface CapacitesForfait {
  /** Plafond de membres ACTIFS. `null` = illimité. */
  limiteMembres: number | null
  /** Quota de stockage des documents. Consommé à l'étape 3 de la spec. */
  quotaStockageOctets: number
  /** Paiement en ligne Mobile Money disponible. Consommé à l'étape 3 de la spec. */
  paiementEnLigne: boolean
}

export const CAPACITES_FORFAIT: Readonly<Record<Forfait, Readonly<CapacitesForfait>>> = {
  GRATUIT: { limiteMembres: 50, quotaStockageOctets: 500 * MO, paiementEnLigne: false },
  PRO: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
  ENTREPRISE: { limiteMembres: null, quotaStockageOctets: 20 * GO, paiementEnLigne: true },
}

/**
 * Plafond de membres ACTIFS — dérivé de la table. Un forfait INCONNU (API déployée avant le front)
 * renvoie `null` (illimité), comme le `default` historique : le front ne doit pas planter sur une valeur
 * d'enum qu'il ne connaît pas encore.
 */
export function limiteMembresForfait(forfait: Forfait): number | null {
  return CAPACITES_FORFAIT[forfait]?.limiteMembres ?? null
}
```

- [ ] **Step 4 : Vérifier le succès**

Run : `cd frontend && npx vitest --run src/lib/forfait.test.ts`
Expected : **PASS**, 5 tests.

- [ ] **Step 5 : Build et lint**

Run : `cd frontend && npm run build`
Expected : `tsc -b` puis `vite build` sans erreur.

Run : `cd frontend && npm run lint`
Expected : aucune ligne de finding. ⚠️ oxlint sort en code 0 même sur des warnings (CLAUDE.md) : lire la
sortie, ne pas se fier au seul code de retour.

- [ ] **Step 6 : Commit**

```bash
git add frontend/src/lib/forfait.ts frontend/src/lib/forfait.test.ts
git commit -m "refactor(forfaits): miroir front de CAPACITES_FORFAIT

Meme table que le backend ; un forfait inconnu reste illimite (repli du
default historique). Comportement inchange.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3 : Garde de parité inter-couches + documentation des garde-fous

**Files :**
- Create : `frontend/src/lib/forfait-parity.test.ts`
- Modify : `docs/architecture-garde-fous.md:16` (bullet `roles-parity`) + ajout d'un bullet juste après
- Modify : `CLAUDE.md` — phrase « Source de vérité PARTAGÉE » de la section Forfaits, et entrée
  `frontend/src/lib/roles-parity` du catalogue des garde-fous

**Interfaces :**
- Consumes : les deux fichiers des Tasks 1 et 2, **lus en texte** (aucun import).
- Produces : le garde `frontend/src/lib/forfait-parity.test.ts` (exécuté par `npm run test` du front et
  par la CI, job `frontend`).

- [ ] **Step 1 : Écrire le garde**

Créer `frontend/src/lib/forfait-parity.test.ts` :

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GARDE DE PARITÉ INTER-COUCHES — `frontend/src/lib/forfait.ts` ↔ `backend/src/lib/forfait.ts`.
 *
 * Le front ne peut pas importer le back : rien n'empêchait mécaniquement le miroir de dériver (un
 * quota modifié côté serveur, une jauge fausse côté écran). Ce test lit les DEUX sources EN TEXTE
 * (même parti pris que `roles-parity.test.ts`) et compare les VALEURS (unités évaluées), pas le texte
 * brut : une différence de mise en forme ne casse rien, une différence de valeur casse tout.
 *
 * FRAGILITÉ ASSUMÉE : extraction par regex volontairement étroite. Si la forme de la table change
 * (expression calculée, spread, constante intermédiaire), l'extraction LÈVE ou ne trouve plus les trois
 * forfaits — échec bruyant plutôt que vert vacant. Adapter alors les regex dans le même geste.
 *
 * Env `node` (défaut des *.test.ts) : lecture fichier, aucun rendu.
 */

const ICI = dirname(fileURLToPath(import.meta.url))
const FRONT_TS = resolve(ICI, 'forfait.ts')
// frontend/src/lib → ../../../ = racine du dépôt (couplage à l'arborescence : prix d'un garde inter-couches).
const BACK_TS = resolve(ICI, '../../../backend/src/lib/forfait.ts')

interface Capacites {
  limiteMembres: number | null
  quotaStockageOctets: number
  paiementEnLigne: boolean
}

const UNITES: Record<string, number> = { MO: 1024 * 1024, GO: 1024 * 1024 * 1024 }

function lireForfaits(source: string): string[] {
  const m = source.match(/export const FORFAITS\s*=\s*\[([^\]]*)\]/)
  if (!m) throw new Error('FORFAITS introuvable')
  return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1])
}

/** Les unités doivent être définies à l'identique : sinon `UNITES` ci-dessus mentirait. */
function verifierUnites(source: string): void {
  if (!/const MO = 1024 \* 1024\b/.test(source)) throw new Error('définition de MO absente ou modifiée')
  if (!/const GO = 1024 \* MO\b/.test(source)) throw new Error('définition de GO absente ou modifiée')
}

function lireCapacites(source: string): Record<string, Capacites> {
  const bloc = source.match(/export const CAPACITES_FORFAIT[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (!bloc) throw new Error('CAPACITES_FORFAIT introuvable')
  const ligne =
    /([A-Z_]+):\s*\{\s*limiteMembres:\s*(null|\d+),\s*quotaStockageOctets:\s*(\d+)\s*\*\s*(MO|GO),\s*paiementEnLigne:\s*(true|false)\s*,?\s*\}/g
  const capacites: Record<string, Capacites> = {}
  for (const m of bloc[1].matchAll(ligne)) {
    capacites[m[1]] = {
      limiteMembres: m[2] === 'null' ? null : Number(m[2]),
      quotaStockageOctets: Number(m[3]) * UNITES[m[4]],
      paiementEnLigne: m[5] === 'true',
    }
  }
  return capacites
}

describe('parité inter-couches : forfait.ts front ↔ back', () => {
  const back = readFileSync(BACK_TS, 'utf8')
  const front = readFileSync(FRONT_TS, 'utf8')

  it('même liste de forfaits', () => {
    const forfaits = lireForfaits(back)
    expect(forfaits.length).toBeGreaterThan(0) // anti-vacant
    expect(lireForfaits(front)).toEqual(forfaits)
  })

  it('mêmes unités de stockage des deux côtés', () => {
    expect(() => verifierUnites(back)).not.toThrow()
    expect(() => verifierUnites(front)).not.toThrow()
  })

  it('mêmes capacités, forfait par forfait', () => {
    const capacitesBack = lireCapacites(back)
    // Anti-vacant : TOUS les forfaits extraits, sinon une ligne mal formée passerait inaperçue.
    expect(Object.keys(capacitesBack).sort()).toEqual([...lireForfaits(back)].sort())
    expect(lireCapacites(front)).toEqual(capacitesBack)
  })
})
```

- [ ] **Step 2 : Vérifier qu'il passe sur des fichiers alignés**

Run : `cd frontend && npx vitest --run src/lib/forfait-parity.test.ts`
Expected : **PASS**, 3 tests.

- [ ] **Step 3 : Saboter côté FRONT (direction utile) et vérifier l'échec**

Dans `frontend/src/lib/forfait.ts`, ligne `PRO:`, remplacer `20 * GO` par `10 * GO`.
Contrôler que le sabotage s'est appliqué : `grep -n "PRO:" frontend/src/lib/forfait.ts` doit afficher
`10 * GO`.

Run : `cd frontend && npx vitest --run src/lib/forfait-parity.test.ts`
Expected : **FAIL** sur « mêmes capacités, forfait par forfait » (écart sur `PRO.quotaStockageOctets`).

Restaurer `20 * GO`, puis re-contrôler : `grep -n "PRO:" frontend/src/lib/forfait.ts` affiche `20 * GO`.

- [ ] **Step 4 : Saboter côté BACK (l'autre direction) et vérifier l'échec**

Dans `backend/src/lib/forfait.ts`, ligne `GRATUIT:`, remplacer `limiteMembres: 50` par
`limiteMembres: 60`. Contrôler : `grep -n "GRATUIT:" backend/src/lib/forfait.ts` affiche `60`.

Run : `cd frontend && npx vitest --run src/lib/forfait-parity.test.ts`
Expected : **FAIL** sur « mêmes capacités, forfait par forfait » (écart sur `GRATUIT.limiteMembres`).

Restaurer `50`, re-contrôler par `grep`, puis relancer : **PASS**, 3 tests.

Enfin : `git diff --stat backend/src/lib/forfait.ts frontend/src/lib/forfait.ts` ne doit montrer **aucune
modification non commitée** (les deux sabotages sont annulés).

- [ ] **Step 5 : Documenter le garde — `docs/architecture-garde-fous.md`**

Remplacer, dans le bullet de la ligne 16 :

```
**seul garde INTER-COUCHES du dépôt** :
```

par :

```
**premier garde INTER-COUCHES du dépôt** :
```

puis insérer, immédiatement après ce bullet (nouvelle ligne) :

```
- `frontend/src/lib/forfait-parity.test.ts` — **garde INTER-COUCHES des capacités par forfait** (spec 1.1) : `CAPACITES_FORFAIT` et `FORFAITS` de `frontend/src/lib/forfait.ts` doivent valoir ceux de `backend/src/lib/forfait.ts`. Compare les **valeurs** (unités `MO`/`GO` évaluées) et non le texte : la mise en forme peut différer, pas un quota. Lu **en TEXTE** comme `roles-parity`. Anti-vacant : les trois forfaits doivent être extraits, et les définitions d'unités vérifiées des deux côtés (sinon l'évaluation mentirait). Saboté dans les deux directions à sa création (quota Pro front, plafond Gratuit back).
```

- [ ] **Step 6 : Documenter — `CLAUDE.md`**

Remplacer dans la section « Forfaits (SaaS §3.1) » :

```
Source de vérité PARTAGÉE `backend/src/lib/forfait.ts` (+ miroir `frontend/src/lib/forfait.ts`) : `limiteMembresForfait(forfait)` → **GRATUIT = 50**, **PRO/ENTREPRISE = `null` (illimité)**.
```

par :

```
Source de vérité PARTAGÉE `backend/src/lib/forfait.ts` (+ miroir `frontend/src/lib/forfait.ts`, alignement vérifié par `forfait-parity.test.ts`) : table **`CAPACITES_FORFAIT`** (membres actifs, stockage, paiement en ligne), dont **`limiteMembresForfait(forfait)` dérive** → **GRATUIT = 50**, **PRO/ENTREPRISE = `null` (illimité)**. Spec : `docs/superpowers/specs/2026-09-12-forfaits-echeance-design.md`.
```

Puis, dans la ligne « **Catalogue** » des garde-fous exécutables, remplacer :

```
· `frontend/src/lib/roles-parity` (seul garde INTER-COUCHES : miroirs `roles.ts` ↔ `requireRoles` serveur, lus en TEXTE, `MAPPING` déclaré dans le test).
```

par :

```
· `frontend/src/lib/roles-parity` (garde INTER-COUCHES : miroirs `roles.ts` ↔ `requireRoles` serveur, lus en TEXTE, `MAPPING` déclaré dans le test) · `frontend/src/lib/forfait-parity` (garde INTER-COUCHES : `CAPACITES_FORFAIT` front ↔ back, valeurs comparées, lus en TEXTE).
```

Contrôle : `grep -c "seul garde INTER-COUCHES" CLAUDE.md docs/architecture-garde-fous.md` doit renvoyer
`0` pour les deux fichiers.

- [ ] **Step 7 : Commit**

```bash
git add frontend/src/lib/forfait-parity.test.ts docs/architecture-garde-fous.md CLAUDE.md
git commit -m "test(forfaits): garde de parite inter-couches des capacites

frontend/src/lib/forfait-parity.test.ts lit backend et frontend en texte et
compare les VALEURS de CAPACITES_FORFAIT (unites evaluees). Sabote dans les deux
directions avant validation. Catalogue des garde-fous mis a jour : roles-parity
n'est plus le seul garde inter-couches.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4 : Vérification complète et PR

**Files :** aucun nouveau.

**Interfaces :**
- Consumes : les commits des Tasks 1 à 3.
- Produces : une PR vers `main`, CI verte.

- [ ] **Step 1 : Backend complet**

Run : `cd backend && npm run build`
Expected : aucune erreur.

Run : `cd backend && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : tous les fichiers passent, dont `tests/forfait.test.ts` (6 tests).

- [ ] **Step 2 : Frontend complet**

Run : `cd frontend && npm run build && npm run lint && npm run test`
Expected : build sans erreur ; lint sans aucune ligne de finding ; tous les tests passent, dont
`forfait.test.ts` (5) et `forfait-parity.test.ts` (3).

- [ ] **Step 3 : Aucun comportement modifié**

Run : `git diff main --stat -- backend/src frontend/src ':!*.test.ts'`
Expected : **exactement deux fichiers** — `backend/src/lib/forfait.ts` et `frontend/src/lib/forfait.ts`.
Tout autre fichier source modifié signale un changement hors périmètre à retirer.

- [ ] **Step 4 : Pousser et ouvrir la PR**

```bash
git push -u origin feat/forfaits-capacites
gh pr create --base main --title "refactor(forfaits): table des capacités + garde de parité (spec 1.1, étape 1)" --body "Étape 1 de docs/superpowers/specs/2026-09-12-forfaits-echeance-design.md : CAPACITES_FORFAIT source unique (backend + miroir front), limiteMembresForfait dérivée, garde de parité inter-couches sabotée dans les deux directions. Comportement inchangé.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 5 : Vérifier que la CI a bien été PLANIFIÉE**

Run : `gh run list --branch feat/forfaits-capacites --limit 3`
Expected : au moins un run `CI` (`queued`/`in_progress`/`completed`). **Aucun run** = événement
`pull_request` perdu (symptôme connu, CLAUDE.md) → `gh pr close <n> && gh pr reopen <n>`, puis re-vérifier.
Ne jamais se fier au seul `gh pr checks` : il sort en 0 quand les jobs n'ont pas été planifiés.
