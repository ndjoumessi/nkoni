# Forfaits — étape 3 « Quotas » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Appliquer les deux capacités de forfait encore déclaratives — quota de stockage des documents et paiement en ligne — sur le forfait EFFECTIF, avec la mesure transitoire « paiement déjà configuré conservé », et aligner les textes publics.

**Architecture:** Deux fonctions PURES dans `lib/forfait.ts` (`capacitesEffectives`, `paiementEnLigneAutorise`) ; un service `capacites-organisation.service.ts` qui lit l'organisation (non scopée) et la somme des documents (`aggregate` SCOPÉ) et fournit `chargerCapacitesOrganisation` / `verifierQuotaStockage`, consommés par les routes documents, paiement et `GET /organisations/moi`. Les webhooks, la réconciliation et `confirmerPaiement` ne lisent JAMAIS le forfait. Front : jauge de stockage + « paiement en ligne inclus » sur Paramètres, carte `ConfigPaiement` verrouillée, textes d'accueil et CGU.

**Tech Stack:** Backend Node 20 + Fastify 5 + Prisma 7 + Postgres + Vitest ; frontend Vite + React + react-i18next + Tailwind v4 + Vitest.

**Spec:** `docs/superpowers/specs/2026-09-12-forfaits-echeance-design.md` — §1.2, §1.3, §2.1, §3.2, §3.3, §4.3, §4.5, §4.6, §4.7, §5, §6 étape 3.

## Global Constraints

- Français partout (noms métier, commentaires, messages, commits). Branche `feat/forfaits-quotas` ; jamais de commit sur `main`, pas de push pendant une tâche.
- Capacités (spec §1.2, valeurs PROVISOIRES à confirmer par la mesure en production avant merge) : GRATUIT 500 Mo de stockage, sans paiement en ligne ; PRO et ENTREPRISE 20 Go, paiement en ligne. Unités binaires (`MO = 1024 * 1024`).
- **Tout contrôle de capacité passe par le forfait EFFECTIF** (`forfaitEffectif`), jamais `Organisation.forfait` brut.
- Mesure transitoire (§1.3) : `Organisation.paiementEnLigneAcquis Boolean @default(false)`, **backfill à `true` dans la même migration** pour toute organisation ayant une ligne `ParametrePaiement`. Aucune date « magique » en code.
- Contrôles (§3.3) : `POST /documents` → `stockageUtilise + taille > quota effectif` ⇒ **403 `documents.quotaStockage`** (utilisé / quota) ; `PUT /organisations/moi/paiement` ⇒ 403 `paiement.reserveForfaitPro` si ni capacité ni acquis ; `POST /moi/paiements` ⇒ 403 idem ; `GET /moi/paiement-disponible` ⇒ `actif` **et** (capacité **ou** acquis), sinon `{ actif: false }` sans message.
- ⚠️ **Invariant critique** : webhooks `/webhooks/fapshi`, `/webhooks/campay`, réconciliation `*/15`, `confirmerPaiement` → **AUCUN contrôle de forfait, jamais**. Un membre qui a payé voit son versement enregistré même si l'abonnement a expiré entre le démarrage et la confirmation. Verrouillé par un test d'intégration.
- `GET /organisations/moi` ajoute `capacites` (effectives), `stockageUtiliseOctets` (`aggregate` scopé sur `Document.tailleOctets`), `paiementEnLigneAcquis` (+ `paiementEnLigneInclus`, calculé serveur pour que le front n'ait aucun miroir de logique).
- Retour à Gratuit (§4.6) : aucune suppression, aucune désactivation ; documents au-delà du quota consultables et téléchargeables (seul l'envoi est bloqué) ; export toujours disponible. Photos hors quota.
- Refus contextualisés (§4.5) : stockage plein « Espace de stockage plein (480 Mo sur 500 Mo). Les documents existants restent consultables. » ; paiement en ligne en Gratuit (non acquis) : carte `ConfigPaiement` verrouillée « Inclus dans le forfait Pro » ; plafond de membres : message existant + renvoi vers Paramètres.
- Textes publics (§4.7) : retrait de « Documents illimités », « Export avancé », « fédérations » ; paiement en ligne présenté comme argument Pro ; mention du stockage ; livrés AVEC cette étape.
- Front : n'affiche que des valeurs calculées par le serveur ; tolère une API pas encore déployée (champs absents → rien d'affiché, jamais de verrouillage par défaut) ; jetons du design system, aucune valeur oklch en dur ; lint 0 finding.
- Tests d'intégration : base JETABLE uniquement, jamais la base de dev `nkoni`.
- Trailer : `Co-Authored-By: <modèle réel> <noreply@anthropic.com>`.

---

### Task 1 : Capacités effectives, droit acquis et format de taille

**Files:**
- Modify: `backend/prisma/schema.prisma` (modèle `Organisation`)
- Create: `backend/prisma/migrations/20260914120000_organisation_paiement_en_ligne_acquis/migration.sql`
- Modify: `backend/src/lib/forfait.ts` (fin de fichier), `backend/src/lib/i18n.ts` (après `formatDateApp`)
- Test: `backend/tests/forfait-capacites-effectives.test.ts` (create), `backend/tests/format-taille-octets.test.ts` (create)

**Interfaces:**
- Produces :
  - `Organisation.paiementEnLigneAcquis: boolean` (client Prisma régénéré)
  - `capacitesEffectives(forfait: Forfait, expireLe: Date | null, now: Date): Readonly<CapacitesForfait>`
  - `paiementEnLigneAutorise(capacites: Pick<CapacitesForfait, 'paiementEnLigne'>, acquis: boolean): boolean`
  - `formatTailleOctets(octets: number, langue: Langue): string` (`lib/i18n.ts`)

- [ ] **Step 1 : Tests (échouent)**

Créer `backend/tests/forfait-capacites-effectives.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { CAPACITES_FORFAIT, capacitesEffectives, paiementEnLigneAutorise } from '../src/lib/forfait'
import { finDeJourneeApp } from '../src/lib/date-app'

const NOW = new Date('2026-09-14T10:00:00Z')
const fin = (jour: string) => finDeJourneeApp(new Date(`${jour}T12:00:00+01:00`))

describe('capacitesEffectives — forfait EFFECTIF (spec 1.1 §2.3)', () => {
  it('PRO actif, en échéance proche ou en grâce : capacités Pro', () => {
    expect(capacitesEffectives('PRO', fin('2026-12-31'), NOW)).toBe(CAPACITES_FORFAIT.PRO)
    expect(capacitesEffectives('PRO', fin('2026-09-20'), NOW)).toBe(CAPACITES_FORFAIT.PRO)
    expect(capacitesEffectives('PRO', fin('2026-09-01'), NOW)).toBe(CAPACITES_FORFAIT.PRO) // J = -13
  })

  it('PRO expiré au-delà de la grâce : capacités GRATUIT', () => {
    expect(capacitesEffectives('PRO', fin('2026-08-30'), NOW)).toBe(CAPACITES_FORFAIT.GRATUIT) // J = -15
  })

  it('sans échéance : capacités du forfait enregistré', () => {
    expect(capacitesEffectives('ENTREPRISE', null, NOW)).toBe(CAPACITES_FORFAIT.ENTREPRISE)
    expect(capacitesEffectives('GRATUIT', null, NOW)).toBe(CAPACITES_FORFAIT.GRATUIT)
  })
})

describe('paiementEnLigneAutorise — capacité OU droit acquis (spec 1.1 §1.3)', () => {
  it.each([
    [true, false, true],
    [true, true, true],
    [false, true, true],
    [false, false, false],
  ])('capacité %s, acquis %s → %s', (paiementEnLigne, acquis, attendu) => {
    expect(paiementEnLigneAutorise({ paiementEnLigne }, acquis)).toBe(attendu)
  })
})
```

Créer `backend/tests/format-taille-octets.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { formatTailleOctets } from '../src/lib/i18n'

const MO = 1024 * 1024
const GO = 1024 * MO

describe('formatTailleOctets', () => {
  it('mégaoctets en dessous d’un gigaoctet, arrondi à une décimale', () => {
    expect(formatTailleOctets(480 * MO, 'FR')).toBe('480 Mo')
    expect(formatTailleOctets(480 * MO, 'EN')).toBe('480 MB')
    expect(formatTailleOctets(Math.round(2.54 * MO), 'FR')).toBe('2,5 Mo')
  })

  it('gigaoctets à partir d’un gigaoctet', () => {
    expect(formatTailleOctets(20 * GO, 'FR')).toBe('20 Go')
    expect(formatTailleOctets(1.5 * GO, 'EN')).toBe('1.5 GB')
  })

  it('zéro', () => {
    expect(formatTailleOctets(0, 'FR')).toBe('0 Mo')
  })
})
```

- [ ] **Step 2 : Lancer, constater l'échec**

Run : `cd backend && npm run test -- --run tests/forfait-capacites-effectives.test.ts tests/format-taille-octets.test.ts`
Expected : FAIL (`capacitesEffectives is not a function`, `formatTailleOctets is not a function`).

- [ ] **Step 3 : Schéma et migration**

Dans `backend/prisma/schema.prisma`, remplacer :

```prisma
  forfaitExpireLe DateTime?
  createdAt    DateTime @default(now())
```

par :

```prisma
  forfaitExpireLe DateTime?
  // Mesure transitoire (spec 1.1 §1.3) : une organisation qui avait DÉJÀ configuré le paiement en
  // ligne à la livraison des quotas le CONSERVE quel que soit son forfait (couper un flux d'argent en
  // service serait brutal). Posé par le backfill de la migration, jamais par du code à date.
  paiementEnLigneAcquis Boolean @default(false)
  createdAt    DateTime @default(now())
```

Créer `backend/prisma/migrations/20260914120000_organisation_paiement_en_ligne_acquis/migration.sql` :

```sql
-- Paiement en ligne réservé aux forfaits payants (spec 1.1 §1.3/§3.3) — mesure transitoire :
-- toute organisation ayant DÉJÀ une configuration de paiement (active ou non) la conserve.
ALTER TABLE "Organisation" ADD COLUMN "paiementEnLigneAcquis" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Organisation"
SET "paiementEnLigneAcquis" = true
WHERE "id" IN (SELECT "organisationId" FROM "ParametrePaiement");
```

Run : `cd backend && npx prisma generate`
Expected : `Generated Prisma Client`. (Aucune migration n'est APPLIQUÉE ici ; jamais sur la base de dev.)

- [ ] **Step 4 : Fonctions**

À la fin de `backend/src/lib/forfait.ts`, ajouter :

```ts

// ===========================================================================
// Capacités APPLIQUÉES (spec 1.1 §2.3, étape 3) — toujours celles du forfait EFFECTIF.
// ===========================================================================

/** Capacités qui s'appliquent : celles du forfait EFFECTIF (GRATUIT une fois la grâce écoulée). */
export function capacitesEffectives(
  forfait: Forfait,
  expireLe: Date | null,
  now: Date,
): Readonly<CapacitesForfait> {
  return CAPACITES_FORFAIT[forfaitEffectif(forfait, expireLe, now)]
}

/**
 * Paiement en ligne permis : capacité du forfait effectif, OU droit acquis (organisation qui l'avait
 * déjà configuré à la livraison des quotas, spec §1.3). Le droit acquis survit à l'expiration.
 */
export function paiementEnLigneAutorise(
  capacites: Pick<CapacitesForfait, 'paiementEnLigne'>,
  acquis: boolean,
): boolean {
  return capacites.paiementEnLigne || acquis
}
```

Dans `backend/src/lib/i18n.ts`, juste APRÈS la fonction `formatDateApp` (fin de son bloc `}`), ajouter :

```ts

const MO = 1024 * 1024
const GO = 1024 * MO

/**
 * Taille lisible d'un volume de stockage dans la langue donnée (quota de documents, spec 1.1 §4.5) :
 * mégaoctets sous un gigaoctet, gigaoctets au-delà, une décimale au plus. Unités BINAIRES, comme
 * `CAPACITES_FORFAIT` (lib/forfait.ts). FR « 480 Mo » / EN « 480 MB ».
 */
export function formatTailleOctets(octets: number, langue: Langue): string {
  const enGo = octets >= GO
  const valeur = enGo ? octets / GO : octets / MO
  const unite = enGo ? (langue === 'EN' ? 'GB' : 'Go') : langue === 'EN' ? 'MB' : 'Mo'
  const nombre = new Intl.NumberFormat(LOCALE_PAR_LANGUE[langue] ?? 'fr', {
    maximumFractionDigits: 1,
  }).format(valeur)
  return `${nombre} ${unite}`
}
```

- [ ] **Step 5 : Lancer, constater le succès**

Run : `cd backend && npm run test -- --run tests/forfait-capacites-effectives.test.ts tests/format-taille-octets.test.ts`
Expected : PASS.

- [ ] **Step 6 : Build + suite**

Run : `cd backend && npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : build OK ; tous les tests passent.

- [ ] **Step 7 : Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260914120000_organisation_paiement_en_ligne_acquis backend/src/lib/forfait.ts backend/src/lib/i18n.ts backend/tests/forfait-capacites-effectives.test.ts backend/tests/format-taille-octets.test.ts
git commit -m "feat(forfaits): capacites effectives, droit acquis au paiement en ligne et format de taille

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 2 : Service des capacités d'une organisation et quota de stockage

**Files:**
- Create: `backend/src/services/capacites-organisation.service.ts`
- Test: `backend/tests/capacites-organisation.service.test.ts` (create)

**Interfaces:**
- Consumes (Task 1) : `capacitesEffectives`, `paiementEnLigneAutorise`, `CAPACITES_FORFAIT`, `forfaitEffectif`, `type CapacitesForfait`, `type Forfait`.
- Produces :
  - `interface CapacitesOrganisation { forfaitEffectif: Forfait; capacites: Readonly<CapacitesForfait>; paiementEnLigneAcquis: boolean; paiementEnLigneInclus: boolean }`
  - `interface CapacitesPrisma { organisation: { findUnique(args: any): Promise<any> } }`
  - `interface StockagePrisma { document: { aggregate(args: any): Promise<{ _sum: { tailleOctets: number | null } }> } }`
  - `chargerCapacitesOrganisation(prisma: CapacitesPrisma, organisationId: string, now?: Date): Promise<CapacitesOrganisation | null>`
  - `stockageUtiliseOctets(prisma: StockagePrisma): Promise<number>` — organisation EN CONTEXTE
  - `class QuotaStockageDepasseError extends Error { utiliseOctets: number; quotaOctets: number }`
  - `verifierQuotaStockage(prisma: CapacitesPrisma & StockagePrisma, organisationId: string, tailleAjoutOctets: number, now?: Date): Promise<void>`

- [ ] **Step 1 : Tests (échouent)**

Créer `backend/tests/capacites-organisation.service.test.ts` :

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import {
  QuotaStockageDepasseError,
  chargerCapacitesOrganisation,
  stockageUtiliseOctets,
  verifierQuotaStockage,
} from '../src/services/capacites-organisation.service'
import { CAPACITES_FORFAIT } from '../src/lib/forfait'
import { finDeJourneeApp } from '../src/lib/date-app'

const NOW = new Date('2026-09-14T10:00:00Z')
const MO = 1024 * 1024
const fin = (jour: string) => finDeJourneeApp(new Date(`${jour}T12:00:00+01:00`))

function mock(org: any, sommeOctets: number | null = 0) {
  const appels: any[] = []
  const prisma: any = {
    organisation: {
      findUnique: async (args: any) => {
        appels.push(args)
        return org
      },
    },
    document: { aggregate: async () => ({ _sum: { tailleOctets: sommeOctets } }) },
  }
  return { prisma, appels }
}

describe('chargerCapacitesOrganisation', () => {
  it('lit forfait, échéance et droit acquis de l’organisation, par id', async () => {
    const { prisma, appels } = mock({ forfait: 'PRO', forfaitExpireLe: null, paiementEnLigneAcquis: false })
    const c = await chargerCapacitesOrganisation(prisma, 'org-1', NOW)
    expect(appels[0]).toEqual({
      where: { id: 'org-1' },
      select: { forfait: true, forfaitExpireLe: true, paiementEnLigneAcquis: true },
    })
    expect(c).toEqual({
      forfaitEffectif: 'PRO',
      capacites: CAPACITES_FORFAIT.PRO,
      paiementEnLigneAcquis: false,
      paiementEnLigneInclus: true,
    })
  })

  it('PRO expiré : capacités GRATUIT, paiement non inclus sauf droit acquis', async () => {
    const expire = { forfait: 'PRO', forfaitExpireLe: fin('2026-08-01') }
    const sansDroit = await chargerCapacitesOrganisation(mock({ ...expire, paiementEnLigneAcquis: false }).prisma, 'o', NOW)
    expect(sansDroit).toMatchObject({ forfaitEffectif: 'GRATUIT', paiementEnLigneInclus: false })
    const avecDroit = await chargerCapacitesOrganisation(mock({ ...expire, paiementEnLigneAcquis: true }).prisma, 'o', NOW)
    expect(avecDroit).toMatchObject({ forfaitEffectif: 'GRATUIT', paiementEnLigneInclus: true })
  })

  it('organisation introuvable → null', async () => {
    expect(await chargerCapacitesOrganisation(mock(null).prisma, 'x', NOW)).toBeNull()
  })
})

describe('stockageUtiliseOctets', () => {
  it('somme des tailles, 0 sans document', async () => {
    expect(await stockageUtiliseOctets(mock({}, 42).prisma)).toBe(42)
    expect(await stockageUtiliseOctets(mock({}, null).prisma)).toBe(0)
  })
})

describe('verifierQuotaStockage', () => {
  const GRATUIT = { forfait: 'GRATUIT', forfaitExpireLe: null, paiementEnLigneAcquis: false }

  it('sous le quota (limite incluse) : passe', async () => {
    await expect(verifierQuotaStockage(mock(GRATUIT, 490 * MO).prisma, 'o', 10 * MO, NOW)).resolves.toBeUndefined()
  })

  it('au-delà du quota : QuotaStockageDepasseError avec utilisé et quota', async () => {
    const err = await verifierQuotaStockage(mock(GRATUIT, 495 * MO).prisma, 'o', 10 * MO, NOW).catch((e) => e)
    expect(err).toBeInstanceOf(QuotaStockageDepasseError)
    expect(err).toMatchObject({ utiliseOctets: 495 * MO, quotaOctets: 500 * MO })
  })

  it('PRO expiré : quota GRATUIT appliqué', async () => {
    const org = { forfait: 'PRO', forfaitExpireLe: fin('2026-08-01'), paiementEnLigneAcquis: false }
    await expect(verifierQuotaStockage(mock(org, 600 * MO).prisma, 'o', MO, NOW)).rejects.toBeInstanceOf(QuotaStockageDepasseError)
  })

  it('organisation introuvable : quota GRATUIT (le plus restrictif, jamais d’ouverture par défaut)', async () => {
    await expect(verifierQuotaStockage(mock(null, 600 * MO).prisma, 'o', MO, NOW)).rejects.toBeInstanceOf(QuotaStockageDepasseError)
  })
})
```

- [ ] **Step 2 : Lancer, constater l'échec**

Run : `cd backend && npm run test -- --run tests/capacites-organisation.service.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Service**

Créer `backend/src/services/capacites-organisation.service.ts` :

```ts
/**
 * Capacités APPLIQUÉES d'une organisation (spec 1.1 §3.3, étape 3) — point unique lu par les routes
 * documents, paiement et `GET /organisations/moi`. Toujours le forfait EFFECTIF (un Pro expiré au-delà
 * de la grâce retrouve les capacités Gratuit) ; le paiement en ligne tient compte du droit acquis.
 *
 * ⚠️ Ne JAMAIS appeler ceci depuis la CONFIRMATION d'un paiement (webhooks, réconciliation,
 * `confirmerPaiement`) : un membre qui a payé doit voir son versement enregistré même si l'abonnement
 * a expiré entre le démarrage et la confirmation. Seul le DÉMARRAGE d'un paiement est soumis au forfait.
 */
import {
  CAPACITES_FORFAIT,
  capacitesEffectives,
  forfaitEffectif,
  paiementEnLigneAutorise,
  type CapacitesForfait,
  type Forfait,
} from '../lib/forfait'

export interface CapacitesOrganisation {
  forfaitEffectif: Forfait
  capacites: Readonly<CapacitesForfait>
  paiementEnLigneAcquis: boolean
  /** Paiement en ligne permis (capacité effective OU droit acquis). */
  paiementEnLigneInclus: boolean
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** `Organisation` n'est PAS scopée : lecture par id, sans contexte. */
export interface CapacitesPrisma {
  organisation: { findUnique(args: any): Promise<any> }
}
/** `Document` est scopé : l'`aggregate` porte sur l'organisation EN CONTEXTE (extension d'isolation). */
export interface StockagePrisma {
  document: { aggregate(args: any): Promise<{ _sum: { tailleOctets: number | null } }> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function chargerCapacitesOrganisation(
  prisma: CapacitesPrisma,
  organisationId: string,
  now: Date = new Date(),
): Promise<CapacitesOrganisation | null> {
  const org = await prisma.organisation.findUnique({
    where: { id: organisationId },
    select: { forfait: true, forfaitExpireLe: true, paiementEnLigneAcquis: true },
  })
  if (!org) return null
  const expireLe: Date | null = org.forfaitExpireLe ?? null
  const capacites = capacitesEffectives(org.forfait, expireLe, now)
  const acquis = Boolean(org.paiementEnLigneAcquis)
  return {
    forfaitEffectif: forfaitEffectif(org.forfait, expireLe, now),
    capacites,
    paiementEnLigneAcquis: acquis,
    paiementEnLigneInclus: paiementEnLigneAutorise(capacites, acquis),
  }
}

/**
 * Stockage consommé par l'organisation EN CONTEXTE : Σ `Document.tailleOctets`, agrégé côté Postgres
 * (sûr sur un modèle scopé, CLAUDE.md — ne pas rapatrier les lignes). Photos et reçus hors quota.
 */
export async function stockageUtiliseOctets(prisma: StockagePrisma): Promise<number> {
  const r = await prisma.document.aggregate({ _sum: { tailleOctets: true } })
  return r._sum.tailleOctets ?? 0
}

/** Levée quand un envoi ferait dépasser le quota de stockage du forfait effectif. */
export class QuotaStockageDepasseError extends Error {
  readonly utiliseOctets: number
  readonly quotaOctets: number
  constructor(utiliseOctets: number, quotaOctets: number) {
    super(`Quota de stockage dépassé (${utiliseOctets} / ${quotaOctets} octets).`)
    this.name = 'QuotaStockageDepasseError'
    this.utiliseOctets = utiliseOctets
    this.quotaOctets = quotaOctets
  }
}

/**
 * Refuse un envoi qui ferait dépasser le quota (limite INCLUSE : atteindre exactement le quota passe).
 * Organisation introuvable → quota GRATUIT : le plus restrictif, jamais d'ouverture par défaut.
 * Non atomique face à deux envois simultanés (dépassement borné à la taille d'un fichier, 10 Mo) :
 * assumé, le quota protège un coût, pas un invariant financier.
 */
export async function verifierQuotaStockage(
  prisma: CapacitesPrisma & StockagePrisma,
  organisationId: string,
  tailleAjoutOctets: number,
  now: Date = new Date(),
): Promise<void> {
  const capacites = await chargerCapacitesOrganisation(prisma, organisationId, now)
  const quota = (capacites?.capacites ?? CAPACITES_FORFAIT.GRATUIT).quotaStockageOctets
  const utilise = await stockageUtiliseOctets(prisma)
  if (utilise + tailleAjoutOctets > quota) throw new QuotaStockageDepasseError(utilise, quota)
}
```

- [ ] **Step 4 : Lancer, constater le succès**

Run : `cd backend && npm run test -- --run tests/capacites-organisation.service.test.ts`
Expected : PASS (10 tests).

- [ ] **Step 5 : Build + suite**

Run : `cd backend && npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : build OK ; tous les tests passent.

- [ ] **Step 6 : Commit**

```bash
git add backend/src/services/capacites-organisation.service.ts backend/tests/capacites-organisation.service.test.ts
git commit -m "feat(forfaits): capacites appliquees d'une organisation et quota de stockage

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 3 : Quota de stockage sur `POST /documents`

**Files:**
- Modify: `backend/src/routes/documents.route.ts` (imports ; `POST /documents` avant `televerserDocument`)
- Modify: `backend/src/locales/fr/documents.ts`, `backend/src/locales/en/documents.ts`
- Test: `backend/tests/documents-quota.route.test.ts` (create), `backend/tests/documents-quota.integration.test.ts` (create)

**Interfaces:**
- Consumes (Task 2) : `verifierQuotaStockage`, `QuotaStockageDepasseError` ; (Task 1) `formatTailleOctets`.

- [ ] **Step 1 : Test de route (échoue)**

Créer `backend/tests/documents-quota.route.test.ts` (le constructeur multipart est recopié de
`documents.route.test.ts`, qui ne l'exporte pas ; fixtures `FICHIERS`/`MIME`/mocks importées de
`tests/support/documents-mocks.ts`) :

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'
import { buildBlobMock, buildDocumentsMock, FICHIERS, MIME } from './support/documents-mocks'

/**
 * Quota de stockage (spec 1.1 §3.3) sur POST /documents — refus 403 AVANT tout envoi au Blob, message
 * « utilisé sur quota ». Prisma et Blob mockés ; l'aggregate SCOPÉ réel est prouvé en intégration.
 */

const BOUNDARY = '----nkoniTestBoundary'
const MO = 1024 * 1024

function multipart(fields: Record<string, string>, file: { name: string; filename: string; mime: string; buffer: Buffer }): Buffer {
  const parts: Buffer[] = []
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`))
  }
  parts.push(
    Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.mime}\r\n\r\n`,
    ),
  )
  parts.push(file.buffer)
  parts.push(Buffer.from('\r\n'))
  parts.push(Buffer.from(`--${BOUNDARY}--\r\n`))
  return Buffer.concat(parts)
}

describe('POST /documents — quota de stockage', () => {
  let app: FastifyInstance
  let blob: ReturnType<typeof buildBlobMock>

  async function demarrer(sommeOctets: number) {
    const prisma: any = buildDocumentsMock()
    prisma.organisation = {
      findUnique: async () => ({ forfait: 'GRATUIT', forfaitExpireLe: null, paiementEnLigneAcquis: false }),
    }
    prisma.document.aggregate = async () => ({ _sum: { tailleOctets: sommeOctets } })
    blob = buildBlobMock()
    app = await buildApp({ prisma, blob: blob.client, logger: false })
    await app.ready()
  }
  afterEach(async () => {
    await app?.close()
  })

  const envoyer = () =>
    app.inject({
      method: 'POST',
      url: '/documents',
      headers: {
        authorization: `Bearer ${app.jwt.sign({ sub: 'u-sec', role: 'SECRETAIRE', organisationId: 'org-1' })}`,
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
      },
      payload: multipart(
        { entiteType: 'COMMEMORATION', entiteId: 'cm-1', nom: 'acte.pdf' },
        { name: 'fichier', filename: 'acte.pdf', mime: MIME.pdf, buffer: FICHIERS.pdf },
      ),
    })

  it('quota atteint → 403 avec utilisé et quota, aucun envoi au Blob', async () => {
    await demarrer(500 * MO)
    const res = await envoyer()
    expect(res.statusCode).toBe(403)
    expect(res.json().message).toContain('500 Mo sur 500 Mo')
    expect(blob.puts).toHaveLength(0)
  })

  it('sous le quota → 201, comportement nominal inchangé', async () => {
    await demarrer(0)
    const res = await envoyer()
    expect(res.statusCode).toBe(201)
    expect(blob.puts).toHaveLength(1)
  })
})
```

- [ ] **Step 2 : Lancer, constater l'échec**

Run : `cd backend && npm run test -- --run tests/documents-quota.route.test.ts`
Expected : FAIL sur le premier cas (201 au lieu de 403).

- [ ] **Step 3 : Message FR/EN**

Dans `backend/src/locales/fr/documents.ts`, ajouter après la ligne `'documents.fichierTropVolumineux': 'Fichier trop volumineux (10 Mo maximum).',` :

```ts
  'documents.quotaStockage':
    'Espace de stockage plein ({utilise} sur {quota}). Les documents existants restent consultables.',
```

Dans `backend/src/locales/en/documents.ts`, ajouter après la clé `'documents.fichierTropVolumineux'` (quelle que soit sa formulation) :

```ts
  'documents.quotaStockage':
    'Storage space full ({utilise} of {quota}). Existing documents remain available.',
```

- [ ] **Step 4 : Contrôle dans la route**

Dans `backend/src/routes/documents.route.ts`, remplacer :

```ts
import { t, langueDeRequete } from '../lib/i18n'
```

par :

```ts
import { t, langueDeRequete, formatTailleOctets } from '../lib/i18n'
import {
  verifierQuotaStockage,
  QuotaStockageDepasseError,
} from '../services/capacites-organisation.service'
```

Remplacer :

```ts
    try {
      const cree = await televerserDocument(
```

par :

```ts
    // Quota de stockage du forfait EFFECTIF (spec 1.1 §3.3) — AVANT l'envoi au Blob : un refus ne
    // laisse aucun fichier orphelin. Seul l'ENVOI est bloqué ; lecture et téléchargement restent libres.
    const organisationId = req.user.organisationId
    if (organisationId) {
      try {
        await verifierQuotaStockage(app.prisma, organisationId, fichier.buffer.length)
      } catch (err) {
        if (err instanceof QuotaStockageDepasseError) {
          const langue = langueDeRequete(req)
          return reply.code(403).send({
            error: 'Forbidden',
            message: t(langue, 'documents.quotaStockage', {
              utilise: formatTailleOctets(err.utiliseOctets, langue),
              quota: formatTailleOctets(err.quotaOctets, langue),
            }),
          })
        }
        throw err
      }
    }

    try {
      const cree = await televerserDocument(
```

(Si tsc refuse `app.prisma` pour `CapacitesPrisma & StockagePrisma`, caster `app.prisma as unknown as Parameters<typeof verifierQuotaStockage>[0]`, comme les autres services mockables.)

- [ ] **Step 5 : Lancer, constater le succès**

Run : `cd backend && npm run test -- --run tests/documents-quota.route.test.ts tests/documents.route.test.ts`
Expected : PASS (les tests existants signent des jetons SANS `organisationId` → contrôle sauté, inchangés).

- [ ] **Step 6 : Intégration (vraie Postgres, base JETABLE)**

Créer `backend/tests/documents-quota.integration.test.ts`, calqué sur la mise en place de `backend/tests/document-create.integration.test.ts` (lire ce fichier : création d'org, de compte, connexion, Blob mocké, nettoyage ; identifiants UNIQUES à ce nouveau fichier). Scénarios, chacun asserté :
1. Org A **GRATUIT** avec des lignes `Document` insérées directement (`base.document.create`, url factice, `tailleOctets` total = 499 Mo) ; un ADMIN de A envoie un PDF de 2 Mo → **403**, message contenant « 499 Mo » et « 500 Mo », aucune ligne créée.
2. Org B **GRATUIT** vide, qui coexiste avec les 499 Mo de A : un ADMIN de B envoie le même PDF → **201** (l'`aggregate` est bien SCOPÉ : les documents de A ne comptent pas pour B).
3. Org C **PRO** sans échéance avec 11 lignes de 2 000 000 000 octets (≈ 20,5 Go, somme > 2³¹) → envoi d'un PDF → **403** (quota Pro de 20 Go ; prouve aussi que la somme au-delà d'un entier 32 bits est correcte). Si Prisma lève sur cette somme, NE PAS contourner : rapporter l'erreur exacte (BLOCKED).
4. Org C passée en **PRO expiré** (`forfaitExpireLe` il y a 40 jours) avec seulement 600 Mo de documents → **403** (quota Gratuit sur le forfait effectif).

Base : `createdb nkoni_it_quotas` ; `DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_quotas?sslmode=disable" npx prisma migrate deploy` ; `npx prisma generate` ; lancer le fichier puis TOUS les `tests/*.integration.test.ts` sur cette base. **Jamais la base de dev `nkoni`.** Conserver la base pour les Tasks 4 et 5 (le contrôleur la supprime en Task 8).

Sabotage (direction utile) : remplacer temporairement dans la route `verifierQuotaStockage(app.prisma, organisationId, fichier.buffer.length)` par `Promise.resolve()` → les scénarios 1, 3 et 4 doivent échouer ; restaurer.

- [ ] **Step 7 : Build + suite**

Run : `cd backend && npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : build OK ; tous les tests passent.

- [ ] **Step 8 : Commit**

```bash
git add backend/src/routes/documents.route.ts backend/src/locales/fr/documents.ts backend/src/locales/en/documents.ts backend/tests/documents-quota.route.test.ts backend/tests/documents-quota.integration.test.ts
git commit -m "feat(documents): quota de stockage du forfait effectif avant envoi

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 4 : Paiement en ligne réservé au forfait (sauf droit acquis), confirmation jamais bloquée

**Files:**
- Modify: `backend/src/routes/paiements.route.ts` (`POST /moi/paiements`, `GET /moi/paiement-disponible`)
- Modify: `backend/src/routes/organisations.route.ts` (`PUT /organisations/moi/paiement`)
- Modify: `backend/src/locales/fr/paiement.ts`, `backend/src/locales/en/paiement.ts`
- Test: `backend/tests/paiements.route.test.ts` (modify), `backend/tests/paiement-forfait.route.test.ts` (create), `backend/tests/paiement-forfait-expire.integration.test.ts` (create)

**Interfaces:**
- Consumes (Task 2) : `chargerCapacitesOrganisation(prisma, organisationId, now?)` → `{ paiementEnLigneInclus }`.

- [ ] **Step 1 : Tests de route (échouent)**

Créer `backend/tests/paiement-forfait.route.test.ts` :

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app'

/** Paiement en ligne selon le forfait (spec 1.1 §3.3). Mocks : aucune base. */

const GRATUIT = { forfait: 'GRATUIT', forfaitExpireLe: null, paiementEnLigneAcquis: false }
const GRATUIT_ACQUIS = { ...GRATUIT, paiementEnLigneAcquis: true }
const PRO = { forfait: 'PRO', forfaitExpireLe: null, paiementEnLigneAcquis: false }

async function appAvec(prisma: any): Promise<FastifyInstance> {
  const app = await buildApp({ prisma, logger: false })
  await app.ready()
  return app
}
const jeton = (app: FastifyInstance, role: string) => ({
  authorization: `Bearer ${app.jwt.sign({ sub: 'u1', role, organisationId: 'org-1' })}`,
})

describe('GET /moi/paiement-disponible', () => {
  const prisma = (org: any, actif = true): any => ({
    organisation: { findUnique: async () => org },
    parametrePaiement: { findFirst: async () => ({ actif }) },
  })

  it.each([
    ['GRATUIT sans droit acquis', GRATUIT, false],
    ['GRATUIT avec droit acquis', GRATUIT_ACQUIS, true],
    ['PRO', PRO, true],
  ])('%s, config active → actif %s', async (_nom, org, attendu) => {
    const app = await appAvec(prisma(org))
    const res = await app.inject({ method: 'GET', url: '/moi/paiement-disponible', headers: jeton(app, 'MEMBRE_SIMPLE') })
    expect(res.statusCode).toBe(200)
    expect(res.json().actif).toBe(attendu)
    await app.close()
  })

  it('PRO mais config inactive → actif false', async () => {
    const app = await appAvec(prisma(PRO, false))
    const res = await app.inject({ method: 'GET', url: '/moi/paiement-disponible', headers: jeton(app, 'MEMBRE_SIMPLE') })
    expect(res.json().actif).toBe(false)
    await app.close()
  })
})

describe('POST /moi/paiements — démarrage réservé', () => {
  it('GRATUIT sans droit acquis → 403 paiement.reserveForfaitPro, rien n’est démarré', async () => {
    let contributionLue = false
    const app = await appAvec({
      membre: { findFirst: async () => ({ id: 'm1' }) },
      organisation: { findUnique: async () => GRATUIT },
      contribution: { findFirst: async () => { contributionLue = true; return null }, findUnique: async () => { contributionLue = true; return null } },
    })
    const res = await app.inject({
      method: 'POST', url: '/moi/paiements', headers: jeton(app, 'MEMBRE_SIMPLE'),
      payload: { contributionId: 'c1', montant: 12000 },
    })
    expect(res.statusCode).toBe(403)
    expect(contributionLue).toBe(false)
    await app.close()
  })
})

describe('PUT /organisations/moi/paiement — configuration réservée', () => {
  const corps = { provider: 'FAPSHI', identifiants: { apiUser: 'U', apiKey: 'K', environnement: 'SANDBOX' }, actif: true }

  it('GRATUIT sans droit acquis → 403, rien n’est écrit', async () => {
    let ecrit = false
    const app = await appAvec({
      organisation: { findUnique: async () => GRATUIT },
      parametrePaiement: { upsert: async () => { ecrit = true; return {} }, findUnique: async () => null, findFirst: async () => null },
    })
    const res = await app.inject({ method: 'PUT', url: '/organisations/moi/paiement', headers: jeton(app, 'ADMIN'), payload: corps })
    expect(res.statusCode).toBe(403)
    expect(ecrit).toBe(false)
    await app.close()
  })

  it('GRATUIT avec droit acquis → la configuration n’est pas refusée par le forfait', async () => {
    const app = await appAvec({
      organisation: { findUnique: async () => GRATUIT_ACQUIS },
      parametrePaiement: { upsert: async () => ({}), findUnique: async () => null, findFirst: async () => null },
    })
    const res = await app.inject({ method: 'PUT', url: '/organisations/moi/paiement', headers: jeton(app, 'ADMIN'), payload: corps })
    expect(res.statusCode).not.toBe(403)
    await app.close()
  })
})
```

(Le dernier cas peut aboutir à 200 ou à 503 `chiffrementIndisponible` selon l'environnement de test : l'assertion ne porte que sur l'absence de refus par le forfait.)

- [ ] **Step 2 : Lancer, constater l'échec**

Run : `cd backend && npm run test -- --run tests/paiement-forfait.route.test.ts`
Expected : FAIL (GRATUIT → actif true ; POST et PUT non refusés).

- [ ] **Step 3 : Messages FR/EN**

Dans `backend/src/locales/fr/paiement.ts`, ajouter une clé (à la fin de l'objet `messages`) :

```ts
  'paiement.reserveForfaitPro':
    'Le paiement en ligne est inclus dans les forfaits Pro et Entreprise. Contactez-nous pour changer de forfait.',
```

Dans `backend/src/locales/en/paiement.ts` :

```ts
  'paiement.reserveForfaitPro':
    'Online payment is included in the Pro and Enterprise plans. Contact us to change your plan.',
```

- [ ] **Step 4 : Routes de paiement**

Dans `backend/src/routes/paiements.route.ts`, ajouter l'import :

```ts
import { chargerCapacitesOrganisation } from '../services/capacites-organisation.service'
```

Remplacer :

```ts
  /** Fiche du compte connecté (scopée). */
```

par :

```ts
  /**
   * Paiement en ligne permis pour l'organisation (forfait effectif OU droit acquis). Ne s'applique qu'au
   * DÉMARRAGE et à l'indice d'UI — JAMAIS à la confirmation (webhooks, réconciliation) : un membre qui a
   * payé voit toujours son versement enregistré (spec 1.1 §3.3).
   */
  const paiementInclus = async (organisationId: string | undefined): Promise<boolean> => {
    if (!organisationId) return false
    const capacites = await chargerCapacitesOrganisation(app.prisma, organisationId)
    return capacites?.paiementEnLigneInclus ?? false
  }

  /** Fiche du compte connecté (scopée). */
```

Remplacer :

```ts
      const organisationId = req.user.organisationId
      if (!organisationId) {
        return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'organisations.introuvable') })
      }
      try {
        const r = await demarrerPaiement(
```

par :

```ts
      const organisationId = req.user.organisationId
      if (!organisationId) {
        return reply.code(404).send({ error: 'Not Found', message: t(langueDeRequete(req), 'organisations.introuvable') })
      }
      if (!(await paiementInclus(organisationId))) {
        return reply.code(403).send({ error: 'Forbidden', message: t(langueDeRequete(req), 'paiement.reserveForfaitPro') })
      }
      try {
        const r = await demarrerPaiement(
```

Remplacer :

```ts
  app.get('/moi/paiement-disponible', { preHandler: [authenticate] }, async () => {
    const config = await app.prisma.parametrePaiement.findFirst({ select: { actif: true } })
    return { actif: Boolean(config?.actif), montantMin: env.PAIEMENT_MONTANT_MIN }
  })
```

par :

```ts
  // Hors forfait (ni capacité ni droit acquis) : `actif: false`, SANS message — le bouton disparaît et le
  // membre ne voit jamais de message commercial (spec 1.1 §1.1).
  app.get('/moi/paiement-disponible', { preHandler: [authenticate] }, async (req) => {
    const [config, inclus] = await Promise.all([
      app.prisma.parametrePaiement.findFirst({ select: { actif: true } }),
      paiementInclus(req.user.organisationId),
    ])
    return { actif: Boolean(config?.actif) && inclus, montantMin: env.PAIEMENT_MONTANT_MIN }
  })
```

(Si tsc refuse `app.prisma` pour `CapacitesPrisma`, caster comme en Task 3.)

- [ ] **Step 5 : Route de configuration**

Dans `backend/src/routes/organisations.route.ts`, ajouter l'import :

```ts
import { chargerCapacitesOrganisation } from '../services/capacites-organisation.service'
```

Dans le handler de `PUT /organisations/moi/paiement`, remplacer :

```ts
      try {
        return await enregistrerConfigPaiement(app.prisma, organisationId, {
```

par :

```ts
      // Configuration réservée aux forfaits payants, sauf droit acquis (spec 1.1 §1.3/§3.3). Une
      // organisation qui ne l'a plus ne peut pas reconfigurer ; les paiements déjà démarrés se
      // confirment toujours (la confirmation ne lit jamais le forfait).
      const capacites = await chargerCapacitesOrganisation(app.prisma, organisationId)
      if (!capacites?.paiementEnLigneInclus) {
        return reply
          .code(403)
          .send({ error: 'Forbidden', message: t(langueDeRequete(req), 'paiement.reserveForfaitPro') })
      }
      try {
        return await enregistrerConfigPaiement(app.prisma, organisationId, {
```

- [ ] **Step 6 : Tests existants**

`backend/tests/paiements.route.test.ts` : le test « config active → { actif: true, montantMin } » monte un Prisma SANS `organisation` et un jeton `organisationId: 'org-1'` → il échouerait désormais (lecture d'organisation). Ajouter à ses deux mocks `organisation: { findUnique: async () => ({ forfait: 'PRO', forfaitExpireLe: null, paiementEnLigneAcquis: false }) }` (PRO : le test porte sur la config active/absente, pas sur le forfait). Chercher de même tout autre test de `organisations.route.test.ts` ou `parametre-paiement*.test.ts` qui appelle `PUT /organisations/moi/paiement` et lui fournir une organisation PRO. Aucun test ne doit être affaibli.

Run : `cd backend && npm run test -- --run tests/paiement-forfait.route.test.ts tests/paiements.route.test.ts tests/organisations.route.test.ts`
Expected : PASS.

- [ ] **Step 7 : Intégration — le test critique (vraie Postgres, base JETABLE `nkoni_it_quotas`)**

Créer `backend/tests/paiement-forfait-expire.integration.test.ts` en COPIANT `backend/tests/paiement-confirmation.integration.test.ts` avec ces différences exactes :
- `const ORG = 'c0000000-0000-4000-8000-0000000000f8'` et `const TRANS_ID = 'TX-INTEGRATION-EXPIRE-1'` (identifiants propres à ce fichier) ;
- l'organisation est créée **PRO expirée au-delà de la grâce, sans droit acquis** : `data: { id: ORG, nom: 'PaiementExpire', devise: 'FCFA', forfait: 'PRO', forfaitExpireLe: new Date(Date.now() - 40 * 86_400_000), paiementEnLigneAcquis: false }` ;
- docblock : « Invariant critique (spec 1.1 §3.3) : un paiement démarré avant l'expiration se confirme APRÈS — le versement est créé même si l'organisation n'a plus droit au paiement en ligne. » ;
- premier test : AVANT le webhook, asserter que l'organisation n'a effectivement plus le droit (test non vacant) :
  ```ts
  const capacites = await chargerCapacitesOrganisation(base, ORG)
  expect(capacites?.paiementEnLigneInclus).toBe(false)
  ```
  (import `chargerCapacitesOrganisation` depuis `../src/services/capacites-organisation.service`), puis garder à l'identique les assertions du test « REUSSI » (paiement REUSSI, un versement de 12000, contribution incrémentée) ;
- ne pas recopier le test de rejeu (déjà couvert par le fichier d'origine).

Sabotage (direction utile) : ajouter temporairement dans `confirmerParReference` (paiements.route.ts), avant `confirmerPaiement`, `if (!(await paiementInclus(meta.organisationId))) return` → le test doit ÉCHOUER (aucun versement) ; restaurer, relancer → PASS.

Run : `DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_quotas?sslmode=disable" npx vitest --run tests/paiement-forfait-expire.integration.test.ts tests/paiement-confirmation.integration.test.ts`
Expected : PASS.

- [ ] **Step 8 : Build + suite**

Run : `cd backend && npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : build OK ; tous les tests passent. Contrôle : `grep -n "chargerCapacitesOrganisation\|paiementInclus" backend/src/services/paiement.service.ts backend/src/services/paiement-reconciliation.service.ts` → AUCUNE occurrence.

- [ ] **Step 9 : Commit**

```bash
git add backend/src/routes/paiements.route.ts backend/src/routes/organisations.route.ts backend/src/locales/fr/paiement.ts backend/src/locales/en/paiement.ts backend/tests/paiement-forfait.route.test.ts backend/tests/paiements.route.test.ts backend/tests/paiement-forfait-expire.integration.test.ts
git commit -m "feat(paiement): paiement en ligne reserve au forfait, confirmation jamais bloquee

Configuration et demarrage exigent la capacite du forfait effectif ou le droit
acquis ; l'indice d'UI renvoie actif false sans message. Webhooks et
reconciliation ne lisent jamais le forfait (test d'integration critique).

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

(Ajouter à `git add` tout autre fichier de test modifié au Step 6.)

---

### Task 5 : Capacités exposées par `GET /organisations/moi` et refus de membres renvoyant aux Paramètres

**Files:**
- Modify: `backend/src/services/organisation.service.ts` (`OrganisationCourante`, `OrganisationCourantePrisma`, `chargerOrganisationCourante`)
- Modify: `backend/src/locales/fr/membres.ts`, `backend/src/locales/en/membres.ts`
- Test: `backend/tests/organisations.route.test.ts` (modify)

**Interfaces:**
- Consumes (Task 1) : `capacitesEffectives`, `paiementEnLigneAutorise`, `type CapacitesForfait` ; (Task 2) `stockageUtiliseOctets`.
- Produces : `OrganisationCourante` gagne `capacites: Readonly<CapacitesForfait>`, `stockageUtiliseOctets: number`, `paiementEnLigneAcquis: boolean`, `paiementEnLigneInclus: boolean`.

- [ ] **Step 1 : Test (échoue)**

Dans `backend/tests/organisations.route.test.ts`, dans `buildMoiMock`, ajouter `paiementEnLigneAcquis: false` à l'objet renvoyé par `organisation.findUnique`, et ajouter au mock :

```ts
    document: {
      // Σ tailleOctets de l'org en contexte (aggregate scopé en vrai) : 12 Mo.
      aggregate: async () => ({ _sum: { tailleOctets: 12 * 1024 * 1024 } }),
    },
```

Dans le premier test (`ADMIN → 200, …`), compléter le `toMatchObject` avec :

```ts
      capacites: { limiteMembres: 50, quotaStockageOctets: 500 * 1024 * 1024, paiementEnLigne: false },
      stockageUtiliseOctets: 12 * 1024 * 1024,
      paiementEnLigneAcquis: false,
      paiementEnLigneInclus: false,
```

Run : `cd backend && npm run test -- --run tests/organisations.route.test.ts`
Expected : FAIL (champs absents).

- [ ] **Step 2 : Service**

Dans `backend/src/services/organisation.service.ts` :
- ajouter aux imports depuis `../lib/forfait` : `capacitesEffectives`, `paiementEnLigneAutorise`, `type CapacitesForfait` (les ajouter à l'import existant, sans doublon) ; et importer `stockageUtiliseOctets` depuis `./capacites-organisation.service` ;
- dans `interface OrganisationCourante`, après `limiteMembres: number | null`, ajouter :

```ts
  /** Capacités du forfait EFFECTIF (spec 1.1 §3.2) — affichées telles quelles, jamais recalculées. */
  capacites: Readonly<CapacitesForfait>
  /** Stockage consommé : Σ `Document.tailleOctets` (photos et reçus hors quota). */
  stockageUtiliseOctets: number
  /** Droit acquis au paiement en ligne (mesure transitoire §1.3). */
  paiementEnLigneAcquis: boolean
  /** Paiement en ligne permis : capacité effective OU droit acquis. */
  paiementEnLigneInclus: boolean
```

- remplacer :

```ts
export interface OrganisationCourantePrisma {
  organisation: { findUnique(args: any): Promise<any> }
  membre: { count(args?: any): Promise<number> }
}
```

par :

```ts
export interface OrganisationCourantePrisma {
  organisation: { findUnique(args: any): Promise<any> }
  membre: { count(args?: any): Promise<number> }
  document: { aggregate(args: any): Promise<{ _sum: { tailleOctets: number | null } }> }
}
```

- dans le `select` de `chargerOrganisationCourante`, après `forfaitExpireLe: true,`, ajouter `paiementEnLigneAcquis: true,` ;
- remplacer :

```ts
  const nbMembres = await prisma.membre.count({ where: { statut: 'ACTIF' } })
```

par :

```ts
  const [nbMembres, stockageUtilise] = await Promise.all([
    prisma.membre.count({ where: { statut: 'ACTIF' } }),
    stockageUtiliseOctets(prisma),
  ])
  const capacites = capacitesEffectives(org.forfait, org.forfaitExpireLe ?? null, now)
  const paiementEnLigneAcquis = Boolean(org.paiementEnLigneAcquis)
```

- dans l'objet retourné, après la ligne `limiteMembres: …`, ajouter :

```ts
    capacites,
    stockageUtiliseOctets: stockageUtilise,
    paiementEnLigneAcquis,
    paiementEnLigneInclus: paiementEnLigneAutorise(capacites, paiementEnLigneAcquis),
```

(Lire la fonction en entier avant d'éditer : garder `limiteMembres` tel quel ; ne pas renommer `nbMembres`.)

- [ ] **Step 3 : Message de plafond de membres (§4.5)**

Dans `backend/src/locales/fr/membres.ts`, remplacer :

```ts
    'Limite de {plafond} membres actifs atteinte pour le plan gratuit. Les fiches inactives ou décédées ne comptent pas.',
```

par :

```ts
    'Limite de {plafond} membres actifs atteinte pour le forfait Gratuit. Les fiches inactives ou décédées ne comptent pas. Consultez la page Paramètres pour faire évoluer votre forfait.',
```

Dans `backend/src/locales/en/membres.ts`, remplacer :

```ts
  'membres.plafondPlanGratuit': 'Limit of {plafond} active members reached for the free plan. Inactive or deceased records do not count.',
```

par :

```ts
  'membres.plafondPlanGratuit': 'Limit of {plafond} active members reached for the Free plan. Inactive or deceased records do not count. See the Settings page to change your plan.',
```

Chercher les tests qui assertent l'ancien texte : `grep -rn "pour le plan gratuit\|for the free plan" backend/tests frontend/src` ; les aligner (le sens de l'assertion ne change pas).

- [ ] **Step 4 : Lancer, constater le succès**

Run : `cd backend && npm run test -- --run tests/organisations.route.test.ts`
Expected : PASS.

- [ ] **Step 5 : Build + suite + intégrations**

Run : `cd backend && npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'` puis `DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_quotas?sslmode=disable" npx vitest --run tests/*.integration.test.ts`
Expected : tout passe (`membres-quota.integration.test.ts` lit `GET /organisations/moi` en vrai : l'`aggregate` scopé y est exercé).

- [ ] **Step 6 : Commit**

```bash
git add backend/src/services/organisation.service.ts backend/src/locales/fr/membres.ts backend/src/locales/en/membres.ts backend/tests/organisations.route.test.ts
git commit -m "feat(forfaits): capacites effectives et stockage utilise dans GET /organisations/moi

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

(Ajouter tout test aligné au Step 3.)

---

### Task 6 : Paramètres — jauge de stockage, paiement inclus, carte de paiement verrouillée

**Files:**
- Modify: `frontend/src/lib/api/organisation.ts` (`OrganisationCourante`)
- Modify: `frontend/src/lib/format.ts` (après `formatNombre`)
- Modify: `frontend/src/pages/ParametresPage.tsx`
- Modify: `frontend/src/components/ConfigPaiement.tsx`
- Modify: `frontend/src/locales/fr/parametres.ts`, `frontend/src/locales/en/parametres.ts`
- Test: `frontend/src/lib/format-taille.test.ts` (create), `frontend/src/components/ConfigPaiement.test.tsx` (create)

**Interfaces:**
- Consumes (Task 5, API) : `capacites`, `stockageUtiliseOctets`, `paiementEnLigneAcquis`, `paiementEnLigneInclus`.
- Produces : `formatTailleOctets(octets: number): string` (front, langue courante) ; `ConfigPaiement({ inclus?: boolean })`.

- [ ] **Step 1 : Tests (échouent)**

Créer `frontend/src/lib/format-taille.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { formatTailleOctets } from './format'

// Env `node` : i18n non initialisé → locale `fr` (défaut de `locale()`).
const MO = 1024 * 1024
const GO = 1024 * MO

describe('formatTailleOctets (front)', () => {
  it('Mo sous 1 Go, Go au-delà, une décimale au plus', () => {
    expect(formatTailleOctets(480 * MO)).toBe('480 Mo')
    expect(formatTailleOctets(Math.round(2.54 * MO))).toBe('2,5 Mo')
    expect(formatTailleOctets(20 * GO)).toBe('20 Go')
    expect(formatTailleOctets(0)).toBe('0 Mo')
  })
})
```

Créer `frontend/src/components/ConfigPaiement.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ConfigPaiement } from './ConfigPaiement'

const configPaiement = vi.fn()
vi.mock('@/lib/api', () => ({
  organisationApi: { configPaiement: (...a: unknown[]) => configPaiement(...a) },
  messageErreur: (e: unknown) => String(e),
}))
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ accessToken: 'jeton' }) }))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

beforeEach(() => {
  configPaiement.mockReset()
  configPaiement.mockResolvedValue({ configure: false, actif: false, provider: null, environnement: null, identifiantPublic: null, misAJourLe: null })
})
afterEach(cleanup)

describe('ConfigPaiement', () => {
  it('hors forfait (inclus = false) : carte verrouillée, aucune lecture de la configuration', () => {
    render(<ConfigPaiement inclus={false} />)
    expect(screen.getByText('parametres.paiement.reserveForfaitPro')).toBeTruthy()
    expect(configPaiement).not.toHaveBeenCalled()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('inclus (défaut) : lit la configuration comme avant', () => {
    render(<ConfigPaiement />)
    expect(configPaiement).toHaveBeenCalled()
  })
})
```

Run : `cd frontend && npx vitest --run src/lib/format-taille.test.ts src/components/ConfigPaiement.test.tsx`
Expected : FAIL (`formatTailleOctets` absent ; texte verrouillé absent).

- [ ] **Step 2 : Type d'API et format**

Dans `frontend/src/lib/api/organisation.ts`, ajouter à `OrganisationCourante` (après `limiteMembres`), en important `type CapacitesForfait` depuis `@/lib/forfait` :

```ts
  /** Capacités du forfait EFFECTIF, calculées serveur (absentes si l'API n'est pas encore déployée). */
  capacites?: CapacitesForfait
  /** Σ tailles des documents, en octets. */
  stockageUtiliseOctets?: number
  paiementEnLigneAcquis?: boolean
  /** Paiement en ligne permis (capacité OU droit acquis), calculé serveur. */
  paiementEnLigneInclus?: boolean
```

(Champs OPTIONNELS : un front déployé avant le backend ne doit ni planter ni verrouiller.)

Dans `frontend/src/lib/format.ts`, après `formatNombre`, ajouter :

```ts

const MO = 1024 * 1024
const GO = 1024 * MO

/**
 * Taille lisible d'un volume de stockage dans la langue courante — miroir de `formatTailleOctets` du
 * backend (lib/i18n.ts) : Mo sous 1 Go, Go au-delà, une décimale au plus, unités binaires.
 */
export function formatTailleOctets(octets: number): string {
  const enGo = octets >= GO
  const valeur = enGo ? octets / GO : octets / MO
  const en = locale() === 'en'
  const unite = enGo ? (en ? 'GB' : 'Go') : en ? 'MB' : 'Mo'
  return `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(valeur)} ${unite}`
}
```

- [ ] **Step 3 : Carte ConfigPaiement verrouillée**

Dans `frontend/src/components/ConfigPaiement.tsx` :
- ajouter `Lock` à l'import `lucide-react` ;
- remplacer `export function ConfigPaiement() {` par :

```tsx
export function ConfigPaiement({ inclus = true }: { inclus?: boolean }) {
```

- dans le `useEffect` de chargement, remplacer la première ligne `if (!accessToken) return` par `if (!accessToken || !inclus) return` et ajouter `inclus` au tableau de dépendances de cet effet ;
- juste AVANT le `return (` principal du composant (celui qui rend `<Card className="nk-reveal nk-d4 p-6">`), insérer :

```tsx
  // Hors forfait (ni capacité ni droit acquis, spec 1.1 §4.5) : carte verrouillée, sans formulaire ni
  // lecture de la configuration. Les paiements déjà démarrés se confirment toujours côté serveur.
  if (!inclus) {
    return (
      <Card className="nk-reveal nk-d4 p-6">
        <div className="flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-brass" aria-hidden="true" />
          <Overline>{t('parametres.paiement.titre')}</Overline>
        </div>
        <div className="mt-3 flex items-start gap-3 rounded-xl border border-hairline bg-surface-2/40 p-4">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
          <div>
            <p className="text-sm font-medium text-foreground">{t('parametres.paiement.reserveForfaitPro')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t('parametres.paiement.reserveForfaitProDetail')}</p>
          </div>
        </div>
      </Card>
    )
  }

```

⚠️ Règle des hooks : ce `return` anticipé doit se trouver APRÈS tous les appels de hooks du composant (`useState`, `useEffect`…). Le placer immédiatement avant le `return (` principal le garantit ; vérifier qu'aucun hook n'est déclaré plus bas.

- [ ] **Step 4 : Page Paramètres**

Dans `frontend/src/pages/ParametresPage.tsx` :
- ajouter `HardDrive` et `CreditCard` à l'import `lucide-react` ; importer `formatTailleOctets` depuis `@/lib/format` ;
- dans la carte « Volume de membres vs forfait », juste AVANT la balise fermante `</Card>` de cette carte (après le bloc `{illimite ? (…) : (…)}`), insérer :

```tsx
            {/* Stockage et paiement en ligne (spec 1.1 §4.3) — valeurs calculées serveur ; rien si l'API
                ne les fournit pas encore. */}
            {org.capacites && org.stockageUtiliseOctets !== undefined && (
              <div className="mt-5 border-t border-hairline pt-4">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-brass" aria-hidden="true" />
                  <p className="text-sm font-medium text-foreground">
                    {t('parametres.stockage.compteur', {
                      utilise: formatTailleOctets(org.stockageUtiliseOctets),
                      quota: formatTailleOctets(org.capacites.quotaStockageOctets),
                    })}
                  </p>
                </div>
                <div
                  className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2"
                  role="progressbar"
                  aria-valuenow={org.stockageUtiliseOctets}
                  aria-valuemin={0}
                  aria-valuemax={org.capacites.quotaStockageOctets}
                  aria-label={t('parametres.stockage.titre')}
                >
                  <div
                    className={cn('h-full rounded-full transition-all', couleurJauge(pctStockage))}
                    style={{ width: `${pctStockage}%` }}
                  />
                </div>
                {pctStockage >= 100 && (
                  <p className="mt-2 text-xs text-terra">{t('parametres.stockage.plein')}</p>
                )}
              </div>
            )}
            {org.paiementEnLigneInclus !== undefined && (
              <div className="mt-4 flex items-center gap-2 text-sm">
                <CreditCard className="h-4 w-4 text-brass" aria-hidden="true" />
                <span className="text-muted-foreground">{t('parametres.paiementEnLigne.libelle')}</span>
                <span className={cn('font-medium', org.paiementEnLigneInclus ? 'text-jade' : 'text-faint')}>
                  {org.paiementEnLigneInclus
                    ? t('parametres.paiementEnLigne.inclus')
                    : t('parametres.paiementEnLigne.nonInclus')}
                </span>
              </div>
            )}
```

- là où sont calculés `pct`, `limiteNum`, `restants` (dérivés de `org` dans le corps du composant), ajouter :

```tsx
  const pctStockage =
    org?.capacites && org.stockageUtiliseOctets !== undefined && org.capacites.quotaStockageOctets > 0
      ? Math.min(100, Math.round((org.stockageUtiliseOctets / org.capacites.quotaStockageOctets) * 100))
      : 0
```

(Lire la page pour trouver l'endroit exact et respecter la forme — si ces dérivés sont calculés à l'intérieur du rendu conditionnel, calculer `pctStockage` au même endroit.)

- remplacer :

```tsx
          {peutConfigurerPaiement(user?.role) && <ConfigPaiement />}
```

par :

```tsx
          {peutConfigurerPaiement(user?.role) && (
            <ConfigPaiement inclus={org.paiementEnLigneInclus !== false} />
          )}
```

(`!== false` : champ absent → carte normale, jamais de verrouillage par défaut.)

- [ ] **Step 5 : Textes FR/EN**

Dans `frontend/src/locales/fr/parametres.ts`, dans l'objet `parametres`, ajouter les blocs (et, dans le bloc `paiement` EXISTANT, les deux clés `reserveForfaitPro` / `reserveForfaitProDetail`) :

```ts
    stockage: {
      titre: 'Stockage des documents',
      compteur: '{{utilise}} utilisés sur {{quota}}',
      plein: 'Espace plein : l’envoi de documents est bloqué, les documents existants restent consultables.',
    },
    paiementEnLigne: {
      libelle: 'Paiement en ligne :',
      inclus: 'inclus',
      nonInclus: 'non inclus',
    },
```

```ts
      reserveForfaitPro: 'Inclus dans le forfait Pro',
      reserveForfaitProDetail:
        'Le paiement des cotisations par Mobile Money est disponible avec les forfaits Pro et Entreprise. Contactez-nous pour changer de forfait.',
```

Dans `frontend/src/locales/en/parametres.ts`, mêmes emplacements :

```ts
    stockage: {
      titre: 'Document storage',
      compteur: '{{utilise}} used of {{quota}}',
      plein: 'Storage full: uploading documents is blocked, existing documents remain available.',
    },
    paiementEnLigne: {
      libelle: 'Online payment:',
      inclus: 'included',
      nonInclus: 'not included',
    },
```

```ts
      reserveForfaitPro: 'Included in the Pro plan',
      reserveForfaitProDetail:
        'Paying contributions by Mobile Money is available with the Pro and Enterprise plans. Contact us to change your plan.',
```

- [ ] **Step 6 : Lancer, constater le succès**

Run : `cd frontend && npx vitest --run src/lib/format-taille.test.ts src/components/ConfigPaiement.test.tsx`
Expected : PASS.

- [ ] **Step 7 : Build + lint + tests**

Run : `cd frontend && npm run build && npm run lint && npm run test`
Expected : build OK (parité FR/EN vérifiée par tsc) ; lint 0 finding ; tous les tests passent.

- [ ] **Step 8 : Commit**

```bash
git add frontend/src/lib/api/organisation.ts frontend/src/lib/format.ts frontend/src/lib/format-taille.test.ts frontend/src/pages/ParametresPage.tsx frontend/src/components/ConfigPaiement.tsx frontend/src/components/ConfigPaiement.test.tsx frontend/src/locales/fr/parametres.ts frontend/src/locales/en/parametres.ts
git commit -m "feat(parametres): stockage utilise, paiement en ligne inclus et carte de paiement verrouillee

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 7 : Textes publics — accueil et CGU

**Files:**
- Modify: `frontend/src/locales/fr/landing.ts`, `frontend/src/locales/en/landing.ts` (bloc `forfaits`)
- Modify: `frontend/src/pages/LandingPage.tsx` (listes `features` des cartes Gratuit et Pro)
- Modify: `frontend/src/pages/legal/CGUPage.tsx` (§4, date de mise à jour, docblock)

**Interfaces:** aucune.

- [ ] **Step 1 : Accueil FR**

Dans `frontend/src/locales/fr/landing.ts`, bloc `forfaits` :
- remplacer la valeur de `description` par :
  `'Le forfait Gratuit est disponible dès aujourd’hui. Les offres Pro et Entreprise s’activent sur demande — écrivez-nous pour lever les limites (les forfaits ne se règlent pas encore en ligne).'`
- dans `gratuit`, ajouter après `f5` : `f6: '500 Mo de stockage de documents',`
- remplacer le bloc `pro` par :

```ts
      pro: {
        nom: 'Pro',
        tagline: 'Pour grandir',
        prix: 'Tarif à venir',
        bouton: 'Être prévenu du lancement',
        f1: 'Membres illimités',
        f2: 'Cotisations payées en ligne par Mobile Money',
        f3: '20 Go de stockage de documents',
      },
```

- dans `entreprise`, remplacer `f1`, `f2`, `f3` par :

```ts
        f1: 'Tout le forfait Pro',
        f2: 'Accompagnement dédié et support prioritaire',
        f3: 'Facturation annuelle, stockage au-delà de 20 Go sur devis',
```

- [ ] **Step 2 : Accueil EN**

Dans `frontend/src/locales/en/landing.ts`, bloc `forfaits`, mêmes emplacements :
- `description` : `'The Free plan is available today. The Pro and Enterprise plans are activated on request — write to us to lift the limits (plans cannot be paid online yet).'`
- `gratuit.f6: '500 MB of document storage',`
- `pro` :

```ts
      pro: {
        nom: 'Pro',
        tagline: 'To grow',
        prix: 'Pricing coming soon',
        bouton: 'Get notified at launch',
        f1: 'Unlimited members',
        f2: 'Contributions paid online by Mobile Money',
        f3: '20 GB of document storage',
      },
```

- `entreprise.f1..f3` :

```ts
        f1: 'Everything in Pro',
        f2: 'Dedicated onboarding and priority support',
        f3: 'Annual billing, storage beyond 20 GB on quote',
```

- [ ] **Step 3 : Cartes d'accueil**

Dans `frontend/src/pages/LandingPage.tsx`, remplacer :

```tsx
              t('landing.forfaits.gratuit.f5'),
            ]}
```

par :

```tsx
              t('landing.forfaits.gratuit.f5'),
              t('landing.forfaits.gratuit.f6'),
            ]}
```

et remplacer :

```tsx
              t('landing.forfaits.pro.f3'),
              t('landing.forfaits.pro.f4'),
            ]}
```

par :

```tsx
              t('landing.forfaits.pro.f3'),
            ]}
```

Contrôle : `grep -rn "Documents illimités\|Export avancé\|fédérations\|Unlimited documents\|Advanced export\|federations\|pro.f4" frontend/src` → aucune occurrence.

- [ ] **Step 4 : CGU §4**

Dans `frontend/src/pages/legal/CGUPage.tsx`, remplacer le paragraphe de la section `4. Forfaits` (le `<p>` qui commence par « NKONI propose plusieurs forfaits ») par :

```tsx
        <p>
          NKONI propose trois forfaits : Gratuit, Pro et Entreprise. La transparence envers les
          membres (situation, reçus, espace membre, carte de membre) est incluse dans tous les
          forfaits. Le forfait Gratuit est limité à 50 membres actifs et à 500 Mo de stockage de
          documents. Les forfaits Pro et Entreprise lèvent la limite de membres, portent le stockage à
          20 Go et incluent le paiement des cotisations en ligne par Mobile Money ; le forfait
          Entreprise ajoute un accompagnement et une facturation annuelle.
        </p>
        <p>
          L’attribution d’un forfait est, à ce jour, réalisée par nos soins sur demande, sans
          paiement en ligne du forfait. Un forfait payant court jusqu’à une date d’échéance ; à son
          terme, ses fonctionnalités restent actives pendant une période de grâce de 14 jours, puis
          l’organisation retrouve les limites du forfait Gratuit. Aucune donnée n’est alors supprimée :
          les membres et documents existants restent consultables et exportables, seuls l’ajout de
          membres ou de documents au-delà des limites et le paiement en ligne sont suspendus. Une
          organisation qui avait configuré le paiement en ligne avant l’introduction de ces limites le
          conserve.
        </p>
```

Remplacer `majLe="14 septembre 2026"` par `majLe="15 septembre 2026"` si la date de livraison est ultérieure au 14 ; sinon laisser. Dans le docblock, ajouter une ligne : `* §4 aligné sur la spec forfaits (docs/superpowers/specs/2026-09-12-forfaits-echeance-design.md §1.2, §4.6).`

- [ ] **Step 5 : Build + lint + tests**

Run : `cd frontend && npm run build && npm run lint && npm run test`
Expected : build OK (parité FR/EN : `gratuit.f6` et le retrait de `pro.f4` doivent être faits DES DEUX CÔTÉS, sinon tsc échoue) ; lint 0 ; tests passent.

- [ ] **Step 6 : Commit**

```bash
git add frontend/src/locales/fr/landing.ts frontend/src/locales/en/landing.ts frontend/src/pages/LandingPage.tsx frontend/src/pages/legal/CGUPage.tsx
git commit -m "feat(landing): forfaits alignes sur les capacites reelles (accueil et CGU)

Retrait de « Documents illimites », « Export avance » et « federations » ;
paiement en ligne presente comme argument Pro ; stockage mentionne ; CGU §4
decrit capacites, echeance, grace et retour au Gratuit sans perte.

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 8 : Documentation, vérification complète, backfill et visuel

**Files:**
- Create: `docs/architecture-forfaits.md`
- Modify: `CLAUDE.md` (section « Forfaits (SaaS §3.1) » ; « Docs de référence »)
- Modify: `docs/roadmap-v1-vers-GA.md` (ligne 1.1)

- [ ] **Step 1 : CLAUDE.md**

Dans `CLAUDE.md`, remplacer (1 occurrence, `grep -cF`) :

```
(membres actifs, stockage, paiement en ligne — **seul le plafond de membres est APPLIQUÉ aujourd'hui** ; stockage et paiement en ligne sont déclarés pour l'étape 3 de la spec, aucun contrôle ne les lit encore)
```

par :

```
(membres actifs, stockage, paiement en ligne — **les trois sont APPLIQUÉS sur le forfait EFFECTIF** via `services/capacites-organisation.service.ts` : plafond de membres, quota de stockage sur `POST /documents` avant envoi au Blob, paiement en ligne sur la configuration, le démarrage et l'indice `GET /moi/paiement-disponible`, avec le droit acquis `Organisation.paiementEnLigneAcquis` posé par backfill pour les organisations déjà configurées). **⚠️ La CONFIRMATION d'un paiement (webhooks, réconciliation, `confirmerPaiement`) ne lit JAMAIS le forfait** : un membre qui a payé voit son versement enregistré même si l'abonnement a expiré entre-temps (`tests/paiement-forfait-expire.integration.test.ts`). Détail : [`docs/architecture-forfaits.md`](docs/architecture-forfaits.md)
```

Dans la section « Docs de référence », ajouter après l'entrée `docs/architecture-garde-fous.md` :

```
- `docs/architecture-forfaits.md` — **détail complet des forfaits** (spec 1.1, étapes 1-4) : capacités et parité front/back, échéance calculée (jours calendaires Douala, grâce, forfait effectif), prolongation liée à l'aperçu, relances de nuit et bandeau, quotas (stockage, paiement en ligne, droit acquis, confirmation jamais bloquée) et **défauts vécus**. `CLAUDE.md` n'en garde que les invariants ; y aller dès qu'on touche aux forfaits, aux capacités ou aux relances.
```

- [ ] **Step 2 : docs/architecture-forfaits.md**

Créer le document, en français, structuré ainsi (contenu à rédiger à partir de la spec, de `CLAUDE.md` et du code livré — pas de paraphrase inventée) :
1. Principe (ce qui n'est jamais vendu, spec §1.1) et tableau des capacités (§1.2) avec renvoi à `CAPACITES_FORFAIT` et à `forfait-parity.test.ts`.
2. Échéance : états, jours calendaires Douala, forfait effectif calculé et jamais stocké, prolongation (aperçu serveur, écriture liée à l'aperçu), `formatDateApp`.
3. Relances et bandeau : étapes, destinataires, dédoublonnage et réarmement, non désactivable, livraison après commit, suppression logique des notifications.
4. Quotas : `capacites-organisation.service.ts`, stockage (`aggregate` scopé, avant envoi, non atomique assumé), paiement en ligne (où il est contrôlé, où il ne l'est JAMAIS), droit acquis et son backfill, retour à Gratuit sans perte (§4.6).
5. **Défauts vécus** (un paragraphe chacun, avec le test qui les verrouille) : quota qui comptait tous les membres au lieu des actifs et réactivation non contrôlée (PR #131) ; échéances affichées au lendemain depuis Paris (`formatDateApp`) ; double prolongation après réponse perdue (écriture liée à l'aperçu) ; front déployé avant le backend (champs absents tolérés) ; notification supprimée qui réarmait la relance chaque nuit (suppression logique) ; tout défaut trouvé pendant l'étape 3 (repris du ledger).
6. Tests : liste des tests unitaires, de parité et d'intégration par sujet.

- [ ] **Step 3 : Roadmap**

Dans `docs/roadmap-v1-vers-GA.md`, ligne 1.1, remplacer (1 occurrence) :

```
**Reste** : **étape 3 « Quotas »** (stockage — *calibrer d'abord sur l'usage mesuré en production* —, paiement en ligne selon le forfait, textes publics accueil + CGU), puis `docs/architecture-forfaits.md`.
```

par :

```
**✅ Étape 3 « Quotas »** : quota de stockage des documents et paiement en ligne appliqués sur le forfait effectif (droit acquis par backfill pour les organisations déjà configurées, confirmation de paiement jamais bloquée — test d'intégration), jauge de stockage et carte de paiement verrouillée sur Paramètres, textes d'accueil et CGU alignés ; détail dans [`architecture-forfaits.md`](architecture-forfaits.md). **Chantier 1.1 livré** (vente assistée) ; le paiement des forfaits en ligne reste hors périmètre.
```

- [ ] **Step 4 : Vérification complète**

```bash
cd backend
DB="postgresql://$(id -un)@localhost:5432/nkoni_it_quotas?sslmode=disable"
npm run build
npm run test -- --run --exclude '**/*.integration.test.ts'
DATABASE_URL="$DB" npx vitest --run tests/*.integration.test.ts
cd ../frontend && npm run build && npm run lint && npm run test
```

Expected : tout passe. Conserver la base.

- [ ] **Step 5 : Backfill, calibrage et visuel (contrôleur)**

1. **Backfill réel** : base jetable `nkoni_it_backfill` migrée SANS la migration `20260914120000_…` (déplacer temporairement ce dossier hors de `prisma/migrations`, `migrate deploy`), insérer une organisation AVEC une ligne `ParametrePaiement` et une SANS, remettre le dossier, `migrate deploy` → la première a `paiementEnLigneAcquis = true`, la seconde `false`. Supprimer la base.
2. **Calibrage** : comparer la mesure de production fournie par le PO (Σ `tailleOctets` par organisation, max) aux quotas 500 Mo / 20 Go ; si une organisation GRATUITE dépasse ou approche 500 Mo, ou si la distribution appelle d'autres seuils, AJUSTER `CAPACITES_FORFAIT` des deux côtés (+ textes accueil/CGU) avant merge, et le consigner.
3. **Visuel** (données fictives, `scripts/demo-video/seed.mjs`) : Paramètres à 390 et 1280 px en GRATUIT (jauge de stockage, « non inclus », carte de paiement verrouillée) puis en PRO (« inclus », formulaire) ; envoi d'un document refusé quand le quota est atteint (lignes `Document` insérées en SQL) avec le message utilisé/quota ; accueil (cartes de forfaits) et `/cgu` ; aucun débordement horizontal.
4. Arrêter les serveurs ; `dropdb --if-exists --force nkoni_it_quotas`.

- [ ] **Step 6 : Commit**

```bash
git add CLAUDE.md docs/architecture-forfaits.md docs/roadmap-v1-vers-GA.md
git commit -m "docs(forfaits): architecture des forfaits, invariants des quotas, roadmap

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```
