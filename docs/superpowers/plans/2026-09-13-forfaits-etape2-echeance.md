# Forfaits — Étape 2 « Échéance » : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** donner une date de fin aux forfaits payants, calculer leur état et leur forfait effectif
(Gratuit au-delà de la grâce), permettre au SUPER_ADMIN de prolonger depuis la console avec aperçu,
et afficher l'échéance dans la console et dans Paramètres.

**Architecture :** une colonne nullable `Organisation.forfaitExpireLe`. Tout le reste est **calculé**
par des fonctions pures à horloge injectée (`backend/src/lib/forfait.ts`, sur des helpers de dates
calendaires Douala dans `backend/src/lib/date-app.ts`) : état, jours restants, forfait effectif,
nouvelle échéance. Le serveur renvoie ces valeurs calculées ; le front les **affiche** sans les
recalculer. Une route plateforme prolonge par écriture conditionnelle ; le quota de membres lit le
forfait **effectif**.

**Tech Stack :** Node 20, Fastify 5, Prisma 7 (adapter pg), PostgreSQL 18 local / 16 en CI, Vitest ;
React + Vite, Tailwind v4, react-i18next, oxlint.

**Spec :** `docs/superpowers/specs/2026-09-12-forfaits-echeance-design.md` — §2.1 (schéma : colonne
`forfaitExpireLe` et valeur `PROLONGER_FORFAIT` seulement), §2.3, §2.4, §2.5, §3.1, §3.2 (champs
d'échéance seulement), §3.3 (ligne quota de membres), §4.2, §4.3 (affichage), §6 étape 2.

## Global Constraints

- **Une seule mesure du temps** : `J = joursRestants(expireLe, now)` en **jours calendaires
  Africa/Douala**. Jamais de durée en heures pour décider d'un état.
- **Seuils** (spec §2.3) : `ACTIF` si `J > 30` ; `ECHEANCE_PROCHE` si `0 ≤ J ≤ 30` ; `GRACE` si
  `-14 ≤ J ≤ -1` ; `EXPIRE` si `J < -14` ; `SANS_ECHEANCE` si `expireLe = NULL` **ou** forfait `GRATUIT`.
- **Forfait effectif** = `GRATUIT` si `EXPIRE`, sinon le forfait enregistré. **Tout contrôle de capacité
  lit le forfait effectif**, jamais `Organisation.forfait` brut.
- **Échéance** = fin de journée Douala (`23:59:59.999` locale = `22:59:59.999Z`).
- **Prolongation** (spec §2.5) : `mois ∈ {1, 3, 6, 12}` ; base = ancienne échéance si `J ≥ -14`, sinon
  aujourd'hui ; ajout de mois **borné au dernier jour du mois** (31 janvier + 1 mois = 28/29 février).
- **Passer en GRATUIT efface `forfaitExpireLe`.** Prolonger un forfait GRATUIT → **409**.
- **Les Pro existants gardent `forfaitExpireLe = NULL`** au déploiement : aucune rétrogradation.
- **Migrations** additives ; `ALTER TYPE … ADD VALUE` seul dans sa migration (CLAUDE.md, Conventions).
  Après tout changement de schéma : **`npx prisma generate`** (client gitignoré, CLAUDE.md i18n/gotcha).
- **Isolation** : `Organisation` n'est pas un modèle scopé ; toute nouvelle occurrence de
  `orgContext.runUnscoped` s'inscrit dans `backend/tests/runUnscoped-allowlist.test.ts` avec justification.
- **i18n** : tout texte d'interface et tout message serveur en FR **et** EN (catalogues typés : `en/*`
  contre `fr/*`). Erreurs traduites à la frontière HTTP, par type d'erreur.
- **Design system** : jetons uniquement (`brass`, `jade`, `amber`, `terra`, `neutral`…), aucune valeur
  oklch en dur ; primitives existantes (`Badge`, `StatCard`, `Button`, `Modal`).
- **Français** partout (noms, commentaires, commits). **Branche** `feat/forfaits-echeance` (ce plan en est
  le premier commit). Jamais de commit sur `main`, jamais de push pendant les tâches.
- **Vérification** (CLAUDE.md) : backend `build` + tests ; frontend `build` + `lint` (0 finding, lire la
  sortie : oxlint sort en 0 sur les warnings) + `test`.

## Écarts assumés à la lettre de la spec (décidés à l'écriture du plan)

1. **Pas de miroir front des fonctions d'état** (spec §2.3/§2.4 : « + miroir »). Le serveur renvoie
   `etatForfait`, `joursRestants`, `forfaitEffectif`, `finGraceLe` ; le front n'a rien à recalculer. Un
   miroir de **logique** ne se garde pas par une parité textuelle comme la table de l'étape 1 : il
   dériverait sans garde. Coût si faux : ajouter le miroir + un test de comportement croisé.
2. **Prolongation intégrée à la fiche d'organisation**, pas dans une seconde `Modal` (spec §4.2) : la
   fiche est déjà une `Modal` ; en imbriquer une autre superpose deux pièges de focus. Coût si faux :
   extraire le bloc dans une modale.
3. **Écriture conditionnelle** de la prolongation (`updateMany` filtré sur l'ancienne échéance → 409 si
   elle a changé entre la lecture et l'écriture), non exigée par la spec : deux prolongations
   simultanées s'écraseraient sinon en silence (une durée payée perdue).
4. **`finGraceLe`** ajouté aux valeurs renvoyées (non listé en §3.2) : Paramètres doit dire « actif
   jusqu'au … » en grâce, et recalculer 14 jours côté front reproduirait la logique écartée au point 1.
5. **Hors étape 2** (spec §3.2) : `capacites`, `stockageUtiliseOctets`, `paiementEnLigneAcquis` → étape 3.

---

## Carte des fichiers

| Fichier | Action | Responsabilité |
|---|---|---|
| `backend/src/lib/date-app.ts` | Modifier | Dates calendaires Douala : `dateCalendaireApp`, `joursCalendairesEntreApp`, `finDeJourneeApp`, `ajouterMoisApp` |
| `backend/tests/date-app.test.ts` | Modifier | Tests des nouveaux helpers |
| `backend/src/lib/forfait.ts` | Modifier | `EtatForfait`, seuils, `joursRestants`, `etatForfait`, `forfaitEffectif`, `nouvelleEcheance`, `vueEcheance` |
| `backend/tests/forfait-echeance.test.ts` | Créer | Bornes exactes, prolongation, vue |
| `backend/prisma/schema.prisma` | Modifier | Colonne + valeur d'enum |
| `backend/prisma/migrations/20260913090000_forfait_expire_le/migration.sql` | Créer | Colonne nullable |
| `backend/prisma/migrations/20260913090100_action_plateforme_prolonger_forfait/migration.sql` | Créer | `ADD VALUE` |
| `backend/src/services/organisation.service.ts` | Modifier | Vues enrichies, GRATUIT efface l'échéance, `prolongerForfaitOrganisation`, forfait effectif dans Paramètres |
| `backend/src/services/platform-audit.service.ts` | Modifier | Type `ActionPlateforme` |
| `backend/src/routes/platform.route.ts` | Modifier | Route de prolongation, liste d'actions, snapshot d'audit |
| `backend/src/routes/membres.route.ts` | Modifier | Quota sur le forfait effectif |
| `backend/src/locales/{fr,en}/platform.ts` | Modifier | Messages 409 |
| `backend/tests/platform.route.test.ts` | Modifier | Prolongation, GRATUIT efface, liste enrichie |
| `backend/tests/platform-audit.route.test.ts` | Modifier | Filtre `PROLONGER_FORFAIT` accepté |
| `backend/tests/membres-quota.integration.test.ts` | Modifier | Quota et Paramètres sous forfait effectif (vraie base) |
| `backend/tests/runUnscoped-allowlist.test.ts` | Modifier | `platform.route.ts` : 6 → 7 |
| `frontend/src/lib/forfait.ts` | Modifier | Types `EtatForfait`, `PERIODES_PROLONGATION` (aucune logique) |
| `frontend/src/lib/api/platform.ts` | Modifier | Types d'échéance, `prolongerForfait`, action d'audit |
| `frontend/src/lib/api/organisation.ts` | Modifier | Champs d'échéance de `/organisations/moi` |
| `frontend/src/lib/api/membres.ts` | Modifier | `quota.plafond: number \| null` |
| `frontend/src/lib/echeance-forfait.ts` (+ `.test.ts`) | Créer | `estARelancer`, `comparerEcheances` |
| `frontend/src/components/plateforme/BadgeEcheance.tsx` (+ `.test.tsx`) | Créer | Date + badge d'état |
| `frontend/src/components/plateforme/ProlongationForfait.tsx` (+ `.test.tsx`) | Créer | Bloc de prolongation avec aperçu serveur |
| `frontend/src/pages/SuperAdminPage.tsx` | Modifier | Colonne, filtre « À relancer », forfait effectif, fusion des réponses serveur, bloc de prolongation |
| `frontend/src/pages/PlatformAuditPage.tsx` | Modifier | Action `PROLONGER_FORFAIT` |
| `frontend/src/pages/ParametresPage.tsx` | Modifier | Échéance, état, bouton de renouvellement |
| `frontend/src/pages/ImportMembresPage.tsx` | Modifier | Plafond `null` (Pro) affiché correctement |
| `frontend/src/locales/{fr,en}/{commun,superAdmin,parametres,import}.ts` | Modifier | Libellés |
| `CLAUDE.md` | Modifier | Invariants de l'échéance |

---
### Task 1 : Dates calendaires Douala (backend)

**Files :**
- Modify : `backend/src/lib/date-app.ts` (ajout en fin de fichier)
- Modify : `backend/tests/date-app.test.ts` (import + bloc de tests en fin de fichier)

**Interfaces :**
- Consumes : `FUSEAU_APP` (déjà exporté par `date-app.ts`).
- Produces :
  - `dateCalendaireApp(instant: Date): string` — « AAAA-MM-JJ » à Douala
  - `joursCalendairesEntreApp(de: Date, a: Date): number`
  - `finDeJourneeApp(instant: Date): Date`
  - `ajouterMoisApp(instant: Date, mois: number): Date` — midi Douala du jour d'arrivée, borné au dernier jour du mois

- [ ] **Step 1 : Écrire les tests (en échec)**

Dans `backend/tests/date-app.test.ts`, remplacer la ligne d'import :

```ts
import { anneeCouranteApp, moisCourantApp, FUSEAU_APP } from '../src/lib/date-app'
```

par :

```ts
import {
  ajouterMoisApp,
  anneeCouranteApp,
  dateCalendaireApp,
  finDeJourneeApp,
  FUSEAU_APP,
  joursCalendairesEntreApp,
  moisCourantApp,
} from '../src/lib/date-app'
```

puis ajouter **en fin de fichier** :

```ts

describe('date-app — dates calendaires (échéance des forfaits, spec 1.1 §2.4)', () => {
  it('dateCalendaireApp lit le jour de Douala, pas celui du process', () => {
    // 2026-09-12T23:30Z = 13 septembre 00 h 30 à Douala.
    expect(dateCalendaireApp(new Date('2026-09-12T23:30:00Z'))).toBe('2026-09-13')
  })

  it('joursCalendairesEntreApp compte les changements de jour Douala, pas les heures', () => {
    // 23 h 58 le 12 → 00 h 02 le 13 (heure de Douala) : 4 minutes, mais 1 jour calendaire.
    expect(joursCalendairesEntreApp(new Date('2026-09-12T22:58:00Z'), new Date('2026-09-12T23:02:00Z'))).toBe(1)
    expect(joursCalendairesEntreApp(new Date('2026-09-13T10:00:00Z'), new Date('2026-09-13T21:00:00Z'))).toBe(0)
    expect(joursCalendairesEntreApp(new Date('2026-09-13T10:00:00Z'), new Date('2026-08-30T10:00:00Z'))).toBe(-14)
  })

  it('finDeJourneeApp rend 23:59:59.999 heure de Douala du jour applicatif', () => {
    expect(finDeJourneeApp(new Date('2026-09-13T10:00:00Z')).toISOString()).toBe('2026-09-13T22:59:59.999Z')
    // 00 h 30 le 14 à Douala (23 h 30 Z le 13) : c'est la fin du 14 qui est rendue.
    expect(finDeJourneeApp(new Date('2026-09-13T23:30:00Z')).toISOString()).toBe('2026-09-14T22:59:59.999Z')
  })

  it('ajouterMoisApp borne au dernier jour du mois d’arrivée', () => {
    const jour = (iso: string, mois: number) => dateCalendaireApp(ajouterMoisApp(new Date(iso), mois))
    expect(jour('2026-01-31T12:00:00+01:00', 1)).toBe('2026-02-28')
    expect(jour('2028-01-31T12:00:00+01:00', 1)).toBe('2028-02-29')
    expect(jour('2026-08-31T12:00:00+01:00', 3)).toBe('2026-11-30')
    expect(jour('2026-11-15T12:00:00+01:00', 3)).toBe('2027-02-15')
    expect(jour('2026-09-13T12:00:00+01:00', 12)).toBe('2027-09-13')
  })
})
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `cd backend && npm run test -- --run tests/date-app.test.ts`
Expected : **FAIL** sur les 4 nouveaux tests (fonctions inexistantes) ; les tests existants passent.

- [ ] **Step 3 : Implémenter**

Ajouter **en fin de** `backend/src/lib/date-app.ts` :

```ts

/** Date CALENDAIRE (AAAA-MM-JJ) d'un instant, lue dans le fuseau applicatif. */
export function dateCalendaireApp(instant: Date): string {
  // `en-CA` formate en AAAA-MM-JJ : chaîne directement découpable et comparable.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FUSEAU_APP,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

const MS_PAR_JOUR = 86_400_000

/** Découpe « AAAA-MM-JJ » en nombres (défauts NaN : `noUncheckedIndexedAccess`). */
function partiesDate(dateCalendaire: string): [number, number, number] {
  const [annee = NaN, mois = NaN, jour = NaN] = dateCalendaire.split('-').map(Number)
  return [annee, mois, jour]
}

/**
 * Nombre de jours CALENDAIRES (fuseau applicatif) de `de` à `a` : 0 le même jour, 1 le lendemain,
 * négatif si `a` précède `de`. Ne dépend jamais de l'heure : 23 h 58 et 00 h 02 le lendemain à Douala
 * sont à 1 jour, bien qu'à 4 minutes d'écart.
 */
export function joursCalendairesEntreApp(de: Date, a: Date): number {
  const [aDe, mDe, jDe] = partiesDate(dateCalendaireApp(de))
  const [aA, mA, jA] = partiesDate(dateCalendaireApp(a))
  return Math.round((Date.UTC(aA, mA - 1, jA) - Date.UTC(aDe, mDe - 1, jDe)) / MS_PAR_JOUR)
}

/** Écart (ms) entre l'heure murale du fuseau applicatif et UTC, à l'instant donné. */
function decalageAppMs(instant: Date): number {
  const parties = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: FUSEAU_APP,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  )
  const murale = Date.UTC(
    Number(parties['year']),
    Number(parties['month']) - 1,
    Number(parties['day']),
    Number(parties['hour']),
    Number(parties['minute']),
    Number(parties['second']),
  )
  return murale - Math.floor(instant.getTime() / 1000) * 1000
}

/** Dernière milliseconde (23:59:59.999, heure applicative) du jour calendaire contenant `instant`. */
export function finDeJourneeApp(instant: Date): Date {
  const [annee, mois, jour] = partiesDate(dateCalendaireApp(instant))
  const finMurale = Date.UTC(annee, mois - 1, jour, 23, 59, 59, 999)
  return new Date(finMurale - decalageAppMs(new Date(finMurale)))
}

/**
 * Ajoute `mois` mois calendaires au jour applicatif de `instant`, en BORNANT au dernier jour du mois
 * d'arrivée (31 janvier + 1 mois = 28 ou 29 février, jamais 3 mars). Renvoie midi (heure applicative)
 * de ce jour : un instant sans ambiguïté de date, à passer ensuite à `finDeJourneeApp`.
 */
export function ajouterMoisApp(instant: Date, mois: number): Date {
  const [annee, moisDepart, jour] = partiesDate(dateCalendaireApp(instant))
  const index = moisDepart - 1 + mois
  const anneeCible = annee + Math.floor(index / 12)
  const moisCible = ((index % 12) + 12) % 12
  const dernierJour = new Date(Date.UTC(anneeCible, moisCible + 1, 0)).getUTCDate()
  const midiMural = Date.UTC(anneeCible, moisCible, Math.min(jour, dernierJour), 12)
  return new Date(midiMural - decalageAppMs(new Date(midiMural)))
}
```

- [ ] **Step 4 : Vérifier le succès**

Run : `cd backend && npm run test -- --run tests/date-app.test.ts`
Expected : **PASS**, tous les tests du fichier.

Run : `cd backend && npm run build`
Expected : aucune erreur (`noUncheckedIndexedAccess` et `exactOptionalPropertyTypes` sont actifs : c'est
pour eux que `partiesDate` utilise des valeurs par défaut et que `parties['year']` est en crochets).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/lib/date-app.ts backend/tests/date-app.test.ts
git commit -m "feat(dates): jours calendaires, fin de journee et ajout de mois a Douala

Helpers de l'echeance des forfaits (spec 1.1 §2.4) : dateCalendaireApp,
joursCalendairesEntreApp, finDeJourneeApp, ajouterMoisApp (borne au dernier
jour du mois). Jamais d'heures pour compter des jours.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2 : Règles d'échéance (backend)

**Files :**
- Modify : `backend/src/lib/forfait.ts` (import en tête + bloc en fin de fichier)
- Create : `backend/tests/forfait-echeance.test.ts`

**Interfaces :**
- Consumes (Task 1) : `ajouterMoisApp`, `finDeJourneeApp`, `joursCalendairesEntreApp`.
- Produces :
  - `type EtatForfait = 'SANS_ECHEANCE' | 'ACTIF' | 'ECHEANCE_PROCHE' | 'GRACE' | 'EXPIRE'`
  - `JOURS_ECHEANCE_PROCHE = 30`, `JOURS_GRACE = 14`
  - `PERIODES_PROLONGATION = [1, 3, 6, 12] as const`, `type PeriodeProlongation`
  - `joursRestants(expireLe: Date, now: Date): number`
  - `etatForfait(forfait: Forfait, expireLe: Date | null, now: Date): EtatForfait`
  - `forfaitEffectif(forfait: Forfait, expireLe: Date | null, now: Date): Forfait`
  - `nouvelleEcheance(expireLe: Date | null, now: Date, mois: PeriodeProlongation): Date`
  - `interface VueEcheance { forfaitExpireLe: Date | null; etatForfait: EtatForfait; joursRestants: number | null; finGraceLe: Date | null; forfaitEffectif: Forfait }`
  - `vueEcheance(forfait: Forfait, expireLe: Date | null, now: Date): VueEcheance`

- [ ] **Step 1 : Écrire le test (en échec)**

Créer `backend/tests/forfait-echeance.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import {
  etatForfait,
  forfaitEffectif,
  joursRestants,
  nouvelleEcheance,
  vueEcheance,
} from '../src/lib/forfait'
import { finDeJourneeApp } from '../src/lib/date-app'

/**
 * Échéance des forfaits (spec 1.1 §2.3–§2.5). Horloge FIXE : 13 septembre 2026, 11 h à Douala. Les
 * échéances sont des fins de journée Douala (`fin('AAAA-MM-JJ')`), comme en production.
 */
const NOW = new Date('2026-09-13T10:00:00Z')
const fin = (jour: string) => finDeJourneeApp(new Date(`${jour}T12:00:00+01:00`))

describe('joursRestants', () => {
  it('0 le dernier jour payé, négatif après, en jours calendaires Douala', () => {
    expect(joursRestants(fin('2026-09-13'), NOW)).toBe(0)
    expect(joursRestants(fin('2026-09-12'), NOW)).toBe(-1)
    expect(joursRestants(fin('2026-10-13'), NOW)).toBe(30)
  })

  it('bascule à minuit DOUALA, pas à minuit UTC', () => {
    // 23 h 30 Z le 12 = 00 h 30 le 13 à Douala : l'échéance du 13 est « aujourd'hui » (0), pas « demain ».
    expect(joursRestants(fin('2026-09-13'), new Date('2026-09-12T23:30:00Z'))).toBe(0)
  })
})

describe('etatForfait — bornes exactes', () => {
  it.each([
    ['2026-10-14', 31, 'ACTIF'],
    ['2026-10-13', 30, 'ECHEANCE_PROCHE'],
    ['2026-09-13', 0, 'ECHEANCE_PROCHE'],
    ['2026-09-12', -1, 'GRACE'],
    ['2026-08-30', -14, 'GRACE'],
    ['2026-08-29', -15, 'EXPIRE'],
  ] as const)('échéance %s (J = %i) → %s', (jour, j, etat) => {
    expect(joursRestants(fin(jour), NOW)).toBe(j)
    expect(etatForfait('PRO', fin(jour), NOW)).toBe(etat)
  })

  it('sans date ou forfait GRATUIT → SANS_ECHEANCE', () => {
    expect(etatForfait('PRO', null, NOW)).toBe('SANS_ECHEANCE')
    expect(etatForfait('GRATUIT', fin('2026-08-01'), NOW)).toBe('SANS_ECHEANCE')
  })
})

describe('forfaitEffectif', () => {
  it('GRATUIT une fois la grâce écoulée, le forfait enregistré avant', () => {
    expect(forfaitEffectif('PRO', fin('2026-08-29'), NOW)).toBe('GRATUIT')
    expect(forfaitEffectif('ENTREPRISE', fin('2026-08-30'), NOW)).toBe('ENTREPRISE')
    expect(forfaitEffectif('PRO', null, NOW)).toBe('PRO')
    expect(forfaitEffectif('GRATUIT', null, NOW)).toBe('GRATUIT')
  })
})

describe('nouvelleEcheance', () => {
  it('avant l’échéance : prolonge depuis l’ancienne échéance', () => {
    expect(nouvelleEcheance(fin('2026-10-20'), NOW, 1)).toEqual(fin('2026-11-20'))
  })

  it('pendant la grâce : repart de l’ancienne échéance (la grâce n’est pas offerte)', () => {
    expect(nouvelleEcheance(fin('2026-09-08'), NOW, 3)).toEqual(fin('2026-12-08'))
  })

  it('après la grâce : repart d’aujourd’hui', () => {
    expect(nouvelleEcheance(fin('2026-08-29'), NOW, 1)).toEqual(fin('2026-10-13'))
  })

  it('sans échéance : repart d’aujourd’hui', () => {
    expect(nouvelleEcheance(null, NOW, 12)).toEqual(fin('2027-09-13'))
  })

  it('borne au dernier jour du mois et rend une fin de journée Douala', () => {
    expect(nouvelleEcheance(fin('2027-01-31'), NOW, 1)).toEqual(fin('2027-02-28'))
    expect(nouvelleEcheance(null, NOW, 1).toISOString()).toBe('2026-10-13T22:59:59.999Z')
  })
})

describe('vueEcheance', () => {
  it('en grâce : état, jours restants, fin de grâce et forfait effectif', () => {
    expect(vueEcheance('PRO', fin('2026-09-12'), NOW)).toEqual({
      forfaitExpireLe: fin('2026-09-12'),
      etatForfait: 'GRACE',
      joursRestants: -1,
      finGraceLe: fin('2026-09-26'),
      forfaitEffectif: 'PRO',
    })
  })

  it('sans échéance : jours restants et fin de grâce à null', () => {
    expect(vueEcheance('GRATUIT', null, NOW)).toEqual({
      forfaitExpireLe: null,
      etatForfait: 'SANS_ECHEANCE',
      joursRestants: null,
      finGraceLe: null,
      forfaitEffectif: 'GRATUIT',
    })
  })
})
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `cd backend && npm run test -- --run tests/forfait-echeance.test.ts`
Expected : **FAIL** (fonctions inexistantes).

- [ ] **Step 3 : Implémenter**

Dans `backend/src/lib/forfait.ts`, remplacer :

```ts
export const FORFAITS = ['GRATUIT', 'PRO', 'ENTREPRISE'] as const
```

par :

```ts
import { ajouterMoisApp, finDeJourneeApp, joursCalendairesEntreApp } from './date-app'

export const FORFAITS = ['GRATUIT', 'PRO', 'ENTREPRISE'] as const
```

puis ajouter **en fin de fichier** :

```ts

// ===========================================================================
// Échéance du forfait (spec 1.1 §2.3–§2.5) — état, forfait EFFECTIF et prolongation, tous CALCULÉS
// (jamais stockés ni rétrogradés par une tâche de nuit : une tâche en échec prolongerait l'accès en
// silence). Horloge `now` INJECTÉE partout. Une seule mesure du temps : les jours CALENDAIRES à Douala.
// ===========================================================================

/** État de l'échéance d'un forfait. */
export type EtatForfait = 'SANS_ECHEANCE' | 'ACTIF' | 'ECHEANCE_PROCHE' | 'GRACE' | 'EXPIRE'

/** Au plus ce nombre de jours avant l'échéance : « échéance proche ». */
export const JOURS_ECHEANCE_PROCHE = 30
/** Jours de grâce APRÈS l'échéance, capacités du forfait conservées. */
export const JOURS_GRACE = 14

/** Durées de prolongation proposées à l'opérateur (validées par la route). */
export const PERIODES_PROLONGATION = [1, 3, 6, 12] as const
export type PeriodeProlongation = (typeof PERIODES_PROLONGATION)[number]

/** Jours calendaires (Douala) jusqu'à l'échéance : 0 = dernier jour payé, négatif = échéance passée. */
export function joursRestants(expireLe: Date, now: Date): number {
  return joursCalendairesEntreApp(now, expireLe)
}

/** État de l'échéance. GRATUIT ou sans date → `SANS_ECHEANCE`. */
export function etatForfait(forfait: Forfait, expireLe: Date | null, now: Date): EtatForfait {
  if (forfait === 'GRATUIT' || expireLe === null) return 'SANS_ECHEANCE'
  const j = joursRestants(expireLe, now)
  if (j > JOURS_ECHEANCE_PROCHE) return 'ACTIF'
  if (j >= 0) return 'ECHEANCE_PROCHE'
  if (j >= -JOURS_GRACE) return 'GRACE'
  return 'EXPIRE'
}

/** Forfait dont les CAPACITÉS s'appliquent : GRATUIT une fois la grâce écoulée, sinon le forfait enregistré. */
export function forfaitEffectif(forfait: Forfait, expireLe: Date | null, now: Date): Forfait {
  return etatForfait(forfait, expireLe, now) === 'EXPIRE' ? 'GRATUIT' : forfait
}

/**
 * Nouvelle échéance après prolongation de `mois` mois. Base = l'ancienne échéance tant que la grâce
 * court (la grâce n'est pas du temps offert, payer en avance ne fait perdre aucun jour), sinon
 * aujourd'hui (échéance absente ou expirée).
 */
export function nouvelleEcheance(expireLe: Date | null, now: Date, mois: PeriodeProlongation): Date {
  const base = expireLe !== null && joursRestants(expireLe, now) >= -JOURS_GRACE ? expireLe : now
  return finDeJourneeApp(ajouterMoisApp(base, mois))
}

/** Valeurs d'échéance CALCULÉES renvoyées par l'API (le front les affiche sans les recalculer). */
export interface VueEcheance {
  forfaitExpireLe: Date | null
  etatForfait: EtatForfait
  /** `null` si `SANS_ECHEANCE`. */
  joursRestants: number | null
  /** Fin de la période de grâce (fin de journée Douala) ; `null` si `SANS_ECHEANCE`. */
  finGraceLe: Date | null
  forfaitEffectif: Forfait
}

export function vueEcheance(forfait: Forfait, expireLe: Date | null, now: Date): VueEcheance {
  const etat = etatForfait(forfait, expireLe, now)
  const avecEcheance = etat !== 'SANS_ECHEANCE' && expireLe !== null
  return {
    forfaitExpireLe: expireLe,
    etatForfait: etat,
    joursRestants: avecEcheance ? joursRestants(expireLe, now) : null,
    // Jours ENTIERS ajoutés à une fin de journée : Douala est à décalage fixe (UTC+1), la date reste
    // une fin de journée ; `finDeJourneeApp` renormalise par sécurité.
    finGraceLe: avecEcheance ? finDeJourneeApp(new Date(expireLe.getTime() + JOURS_GRACE * 86_400_000)) : null,
    forfaitEffectif: forfaitEffectif(forfait, expireLe, now),
  }
}
```

- [ ] **Step 4 : Vérifier le succès**

Run : `cd backend && npm run test -- --run tests/forfait-echeance.test.ts tests/forfait.test.ts tests/date-app.test.ts`
Expected : **PASS** (le fichier `forfait.test.ts` de l'étape 1 reste vert).

Run : `cd frontend && npx vitest --run src/lib/forfait-parity.test.ts`
Expected : **PASS**, 3 tests — le garde de parité lit `backend/src/lib/forfait.ts` en texte ; l'import
ajouté en tête et le bloc ajouté après la table ne doivent pas le perturber.

Run : `cd backend && npm run build`
Expected : aucune erreur.

- [ ] **Step 5 : Commit**

```bash
git add backend/src/lib/forfait.ts backend/tests/forfait-echeance.test.ts
git commit -m "feat(forfaits): etat, forfait effectif et prolongation calcules

etatForfait (bornes J > 30 / 0..30 / -14..-1 / < -14), forfaitEffectif
(GRATUIT apres la grace), nouvelleEcheance (base = ancienne echeance tant que
la grace court), vueEcheance. Fonctions pures, horloge injectee (spec 1.1
§2.3-§2.5).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3 : Schéma et migrations

**Files :**
- Modify : `backend/prisma/schema.prisma`
- Create : `backend/prisma/migrations/20260913090000_forfait_expire_le/migration.sql`
- Create : `backend/prisma/migrations/20260913090100_action_plateforme_prolonger_forfait/migration.sql`

**Interfaces :**
- Consumes : rien.
- Produces : colonne `Organisation.forfaitExpireLe DateTime?` ; valeur `PROLONGER_FORFAIT` de l'enum
  `ActionPlateforme` ; client Prisma régénéré (types `forfaitExpireLe` disponibles pour les Tasks 4-5) ;
  base locale jetable **`nkoni_it_echeance`** migrée, réutilisée par les Tasks 5 et 10.

- [ ] **Step 1 : Modifier le schéma**

Dans `backend/prisma/schema.prisma`, remplacer :

```prisma
  forfait      Forfait  @default(GRATUIT)
  createdAt    DateTime @default(now())
```

par :

```prisma
  forfait      Forfait  @default(GRATUIT)
  // Échéance du forfait (spec 1.1 §2.1) : fin de la période payée (fin de journée Africa/Douala).
  // NULL = pas d'échéance (GRATUIT, ou Pro historique). L'état et le forfait EFFECTIF sont CALCULÉS
  // (lib/forfait.ts), jamais stockés : ne JAMAIS lire `forfait` brut pour décider d'une capacité.
  forfaitExpireLe DateTime?
  createdAt    DateTime @default(now())
```

Dans `backend/prisma/schema.prisma`, remplacer :

```prisma
enum ActionPlateforme {
  CHANGER_FORFAIT
```

par :

```prisma
enum ActionPlateforme {
  CHANGER_FORFAIT
  PROLONGER_FORFAIT
```

- [ ] **Step 2 : Écrire les deux migrations**

Créer `backend/prisma/migrations/20260913090000_forfait_expire_le/migration.sql` :

```sql
-- Échéance du forfait (spec 1.1 §2.1) — fin de la période payée, en fin de journée Africa/Douala.
-- Additive et NULLABLE : aucune organisation existante ne reçoit d'échéance, donc aucune
-- rétrogradation au déploiement (les Pro historiques restent Pro, sans date, jusqu'à ce que
-- l'opérateur en pose une par la console). NULL = pas d'échéance ; GRATUIT n'en a jamais.
ALTER TABLE "Organisation" ADD COLUMN "forfaitExpireLe" TIMESTAMP(3);
```

Créer `backend/prisma/migrations/20260913090100_action_plateforme_prolonger_forfait/migration.sql` :

```sql
-- Action plateforme « prolonger le forfait » (spec 1.1 §3.1), tracée dans PlatformAuditLog.
-- ADD VALUE SEUL dans sa migration : une valeur d'enum Postgres ne peut pas être utilisée dans la
-- transaction qui l'ajoute (CLAUDE.md, Conventions).
ALTER TYPE "ActionPlateforme" ADD VALUE 'PROLONGER_FORFAIT';
```

- [ ] **Step 3 : Valider les migrations sur une base jetable** (jamais sur la base de dev)

```bash
cd backend
PG=/opt/homebrew/opt/postgresql@18/bin
$PG/dropdb --if-exists --force nkoni_it_echeance
$PG/createdb nkoni_it_echeance
export DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_echeance?sslmode=disable"
npx prisma migrate deploy
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code; echo "diff exit=$?"
$PG/psql "$DATABASE_URL" -tAc "select string_agg(e::text, ',') from unnest(enum_range(NULL::\"ActionPlateforme\")) e"
$PG/psql "$DATABASE_URL" -tAc "select column_name||':'||data_type||':'||is_nullable from information_schema.columns where table_name='Organisation' and column_name='forfaitExpireLe'"
```

Expected : `All migrations have been successfully applied.` ; `No difference detected.` et **`diff exit=0`**
(la base migrée correspond exactement au schéma) ; l'enum liste `…,PROLONGER_FORFAIT` ;
`forfaitExpireLe:timestamp without time zone:YES`.

- [ ] **Step 4 : Régénérer le client et vérifier qu'aucun comportement ne change**

```bash
cd backend
npx prisma generate
npm run build
npm run test -- --run --exclude '**/*.integration.test.ts'
```

Expected : build sans erreur ; tous les tests passent (colonne nullable, rien ne la lit encore).

- [ ] **Step 5 : Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260913090000_forfait_expire_le backend/prisma/migrations/20260913090100_action_plateforme_prolonger_forfait
git commit -m "feat(schema): echeance du forfait et action PROLONGER_FORFAIT

Organisation.forfaitExpireLe nullable (aucune retrogradation au deploiement :
les Pro historiques restent sans date) et valeur PROLONGER_FORFAIT, ADD VALUE
seule dans sa migration. Valide sur base jetable : migrate diff vide.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4 : Vues plateforme, passage en Gratuit, route de prolongation

**Files :**
- Modify : `backend/src/services/organisation.service.ts`
- Modify : `backend/src/services/platform-audit.service.ts`
- Modify : `backend/src/routes/platform.route.ts`
- Modify : `backend/src/locales/fr/platform.ts`, `backend/src/locales/en/platform.ts`
- Test : `backend/tests/platform.route.test.ts`, `backend/tests/platform-audit.route.test.ts`,
  `backend/tests/runUnscoped-allowlist.test.ts`

**Interfaces :**
- Consumes (Task 2) : `vueEcheance`, `etatForfait`, `joursRestants`, `nouvelleEcheance`, `forfaitEffectif`,
  `PERIODES_PROLONGATION`, types `EtatForfait`, `PeriodeProlongation`, `VueEcheance` ; (Task 3) client Prisma
  avec `forfaitExpireLe`.
- Produces :
  - `interface OrganisationResume extends VueEcheance` (toutes les vues plateforme portent `forfaitExpireLe`,
    `etatForfait`, `joursRestants`, `finGraceLe`, `forfaitEffectif`) ;
  - `listerOrganisations(prisma, now = new Date())`, `definirStatutOrganisation(prisma, id, actif, now = new Date())`,
    `definirForfaitOrganisation(prisma, id, forfait, now = new Date())` (GRATUIT → `forfaitExpireLe: null`) ;
  - `prolongerForfaitOrganisation(prisma, id, mois, { apercu, now? }): Promise<ResultatProlongation>` ;
    erreurs `OrganisationIntrouvableError`, `ProlongationForfaitGratuitError`, `ProlongationConcurrenteError` ;
  - route `POST /platform/organisations/:id/forfait/prolonger` `{ mois, apercu? }` → `{ organisation,
    echeanceActuelle, nouvelleEcheance, etatApres, joursRestantsApres }` (dates ISO en JSON) ;
  - `ActionPlateforme` inclut `'PROLONGER_FORFAIT'`.

- [ ] **Step 1 : Écrire les tests (en échec)**

Dans `backend/tests/runUnscoped-allowlist.test.ts`, remplacer :

```ts
  // ci-dessus. 6 appels au total.
  'routes/platform.route.ts': 6,
```

par :

```ts
  // ci-dessus. + PROLONGATION du forfait (spec 1.1 §3.1) : lecture de l'échéance, écriture
  // CONDITIONNELLE et trace dans un seul appel (même justification : pas de contexte org pour le
  // SUPER_ADMIN, `Organisation` lue par id). 7 appels au total.
  'routes/platform.route.ts': 7,
```

Dans `backend/tests/platform.route.test.ts`, remplacer :

```ts
      forfait: 'GRATUIT',
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
```

par :

```ts
      forfait: 'GRATUIT',
      forfaitExpireLe: null as Date | null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    },
```

Dans `backend/tests/platform.route.test.ts`, remplacer :

```ts
      forfait: 'GRATUIT',
      createdAt: new Date('2026-02-01T00:00:00Z'),
    },
```

par :

```ts
      forfait: 'GRATUIT',
      forfaitExpireLe: null as Date | null,
      createdAt: new Date('2026-02-01T00:00:00Z'),
    },
```

Dans `backend/tests/platform.route.test.ts`, remplacer :

```ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platformAudits: any[] = []
  const prisma: any = {
```

par :

```ts
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const platformAudits: any[] = []
  /** `forcerConflit` simule une échéance modifiée entre la lecture et l'écriture conditionnelle. */
  const etat = { forcerConflit: false }
  const prisma: any = {
```

Dans `backend/tests/platform.route.test.ts`, remplacer :

```ts
        updates.push({ id: where.id, ...data })
        return { ...org, ...data }
      },
    },
```

par :

```ts
        updates.push({ id: where.id, ...data })
        return { ...org, ...data }
      },
      // Écriture CONDITIONNELLE de la prolongation : ne s'applique que si l'échéance lue n'a pas bougé.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      updateMany: async ({ where, data }: any) => {
        const org = orgs.find((o) => o.id === where.id)
        const lue = where.forfaitExpireLe === null ? null : where.forfaitExpireLe.getTime()
        const actuelle = org?.forfaitExpireLe ? org.forfaitExpireLe.getTime() : null
        if (!org || etat.forcerConflit || lue !== actuelle) return { count: 0 }
        Object.assign(org, data)
        updates.push({ id: where.id, ...data })
        return { count: 1 }
      },
    },
```

Dans `backend/tests/platform.route.test.ts`, remplacer :

```ts
  return { prisma, updates, platformAudits }
```

par :

```ts
  return { prisma, updates, platformAudits, orgs, etat }
```

Dans `backend/tests/platform.route.test.ts`, remplacer :

```ts
  beforeEach(async () => {
    const mock = buildMock()
    updates = mock.updates
    app = await appAvec(mock.prisma)
  })
```

par :

```ts
  let mock: ReturnType<typeof buildMock>

  beforeEach(async () => {
    mock = buildMock()
    updates = mock.updates
    app = await appAvec(mock.prisma)
  })
```

Dans `backend/tests/platform.route.test.ts`, remplacer :

```ts
        payload: { forfait: 'ENTREPRISE' },
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
```

par :

```ts
        payload: { forfait: 'ENTREPRISE' },
      })
      expect(res.statusCode).toBe(404)
    })
  })

  describe('Échéance — vues plateforme (spec 1.1)', () => {
    const orgA = () => {
      const org = mock.orgs.find((o) => o.id === 'org-a')
      if (!org) throw new Error('org-a absente du mock')
      return org
    }

    it('la liste porte l’état CALCULÉ et le forfait EFFECTIF', async () => {
      orgA().forfait = 'PRO'
      orgA().forfaitExpireLe = new Date('2020-01-01T22:59:59.999Z') // expirée depuis longtemps
      const res = await app.inject({ method: 'GET', url: '/platform/organisations', headers: superAdmin(app) })
      expect(res.statusCode).toBe(200)
      const vue = res.json().organisations.find((o: { id: string }) => o.id === 'org-a')
      expect(vue).toMatchObject({
        forfait: 'PRO',
        forfaitExpireLe: '2020-01-01T22:59:59.999Z',
        etatForfait: 'EXPIRE',
        forfaitEffectif: 'GRATUIT',
      })
    })

    it('repasser en GRATUIT efface l’échéance', async () => {
      orgA().forfait = 'PRO'
      orgA().forfaitExpireLe = new Date('2030-01-01T22:59:59.999Z')
      const res = await app.inject({
        method: 'PATCH',
        url: '/platform/organisations/org-a/forfait',
        headers: superAdmin(app),
        payload: { forfait: 'GRATUIT' },
      })
      expect(res.statusCode).toBe(200)
      expect(updates).toContainEqual({ id: 'org-a', forfait: 'GRATUIT', forfaitExpireLe: null })
      expect(res.json().organisation).toMatchObject({
        forfait: 'GRATUIT',
        forfaitExpireLe: null,
        etatForfait: 'SANS_ECHEANCE',
      })
    })
  })

  describe('Prolongation — POST /platform/organisations/:id/forfait/prolonger', () => {
    const prolonger = (payload: Record<string, unknown>, id = 'org-a', entetes = superAdmin(app)) =>
      app.inject({ method: 'POST', url: `/platform/organisations/${id}/forfait/prolonger`, headers: entetes, payload })

    beforeEach(() => {
      const org = mock.orgs.find((o) => o.id === 'org-a')
      if (!org) throw new Error('org-a absente du mock')
      org.forfait = 'PRO'
      org.forfaitExpireLe = null
    })

    it('aperçu : calcule la nouvelle échéance SANS rien écrire ni journaliser', async () => {
      const res = await prolonger({ mois: 3, apercu: true })
      expect(res.statusCode).toBe(200)
      expect(res.json().nouvelleEcheance).toMatch(/T22:59:59\.999Z$/) // fin de journée Douala
      expect(updates).toHaveLength(0)
      expect(mock.platformAudits).toHaveLength(0)
    })

    it('écriture : écrit EXACTEMENT la date annoncée par l’aperçu, et journalise', async () => {
      const apercu = (await prolonger({ mois: 12, apercu: true })).json()
      const res = await prolonger({ mois: 12 })
      expect(res.statusCode).toBe(200)
      expect(res.json().nouvelleEcheance).toBe(apercu.nouvelleEcheance)
      expect(updates).toHaveLength(1)
      expect(updates[0]?.forfaitExpireLe.toISOString()).toBe(apercu.nouvelleEcheance)
      expect(res.json().organisation).toMatchObject({ forfaitExpireLe: apercu.nouvelleEcheance, etatForfait: 'ACTIF' })
      expect(mock.platformAudits).toHaveLength(1)
      expect(mock.platformAudits[0]).toMatchObject({
        action: 'PROLONGER_FORFAIT',
        organisationCibleId: 'org-a',
        donneesAvant: { forfait: 'PRO', forfaitExpireLe: null },
        donneesApres: { forfaitExpireLe: apercu.nouvelleEcheance, mois: 12 },
      })
    })

    it('forfait GRATUIT → 409, rien d’écrit', async () => {
      const org = mock.orgs.find((o) => o.id === 'org-a')
      if (org) org.forfait = 'GRATUIT'
      const res = await prolonger({ mois: 1 })
      expect(res.statusCode).toBe(409)
      expect(updates).toHaveLength(0)
    })

    it('échéance modifiée entre lecture et écriture → 409, rien d’écrit ni journalisé', async () => {
      mock.etat.forcerConflit = true
      const res = await prolonger({ mois: 1 })
      expect(res.statusCode).toBe(409)
      expect(updates).toHaveLength(0)
      expect(mock.platformAudits).toHaveLength(0)
    })

    it('organisation inconnue → 404', async () => {
      expect((await prolonger({ mois: 1 }, 'org-inconnue')).statusCode).toBe(404)
    })

    it('durée hors liste (2 mois) → 400', async () => {
      expect((await prolonger({ mois: 2 })).statusCode).toBe(400)
    })

    it('rôle tenant (ADMIN) → 403', async () => {
      expect((await prolonger({ mois: 1 }, 'org-a', adminTenant(app))).statusCode).toBe(403)
    })
  })
})
```

Dans `backend/tests/platform-audit.route.test.ts`, remplacer :

```ts
  it('filtre par organisation ciblée', async () => {
```

par :

```ts
  it('le filtre accepte PROLONGER_FORFAIT (liste d’actions du schéma alignée sur l’enum)', async () => {
    const lignes = [
      ...rows,
      { id: 'e4', action: 'PROLONGER_FORFAIT', organisationCibleId: 'org-a', acteurEmail: 'sa@n', dateAction: new Date() },
    ]
    app = await appAvec(buildMock({ auditRows: lignes }))
    const res = await app.inject({
      method: 'GET',
      url: '/platform/audit-log?action=PROLONGER_FORFAIT',
      headers: superAdmin(app),
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().items.map((r: any) => r.id)).toEqual(['e4'])
  })

  it('filtre par organisation ciblée', async () => {
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `cd backend && npm run test -- --run tests/platform.route.test.ts tests/platform-audit.route.test.ts tests/runUnscoped-allowlist.test.ts`

Expected : **FAIL** — les tests « Échéance » et « Prolongation » (champs absents, route inexistante → 404),
le filtre `PROLONGER_FORFAIT` (400 : valeur hors du schéma de la route), et l'allowlist (`platform.route.ts` :
6 appels trouvés, 7 attendus). Les tests existants passent.

- [ ] **Step 3 : Implémenter**

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
import { limiteMembresForfait, type Forfait } from '../lib/forfait'
```

par :

```ts
import {
  etatForfait,
  forfaitEffectif,
  joursRestants,
  limiteMembresForfait,
  nouvelleEcheance,
  vueEcheance,
  type EtatForfait,
  type Forfait,
  type PeriodeProlongation,
  type VueEcheance,
} from '../lib/forfait'
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
/** Vue plateforme d'une organisation cliente (aucune donnée métier interne). */
export interface OrganisationResume {
```

par :

```ts
/**
 * Vue plateforme d'une organisation cliente (aucune donnée métier interne). Porte les champs
 * d'échéance CALCULÉS (spec 1.1 §2.3) : la console les affiche sans les recalculer.
 */
export interface OrganisationResume extends VueEcheance {
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
  organisation: {
    findMany(args: any): Promise<any[]>
    update(args: any): Promise<any>
  }
  membre: { groupBy(args: any): Promise<any[]> }
```

par :

```ts
  organisation: {
    findMany(args: any): Promise<any[]>
    findUnique(args: any): Promise<any>
    update(args: any): Promise<any>
    updateMany(args: any): Promise<{ count: number }>
  }
  membre: { groupBy(args: any): Promise<any[]> }
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
export async function listerOrganisations(
  prisma: PlateformePrisma,
): Promise<OrganisationResume[]> {
  const orgs = await prisma.organisation.findMany({
    select: {
      id: true,
      nom: true,
      devise: true,
      langueDefaut: true,
      actif: true,
      forfait: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
```

par :

```ts
export async function listerOrganisations(
  prisma: PlateformePrisma,
  now: Date = new Date(),
): Promise<OrganisationResume[]> {
  const orgs = await prisma.organisation.findMany({
    select: SELECT_ORGANISATION_PLATEFORME,
    orderBy: { createdAt: 'desc' },
  })
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
  return orgs.map((o) => ({
    id: o.id,
    nom: o.nom,
    devise: o.devise,
    langueDefaut: o.langueDefaut,
    actif: o.actif,
    forfait: o.forfait,
    createdAt: o.createdAt,
    nbMembres: compteur.get(o.id) ?? 0,
  }))
```

par :

```ts
  return orgs.map((o) => ({ ...versVuePlateforme(o, now), nbMembres: compteur.get(o.id) ?? 0 }))
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
/**
 * Liste les organisations clientes avec leur statut, date de création et nombre de membres.
```

par :

```ts
/** Colonnes d'une vue plateforme d'organisation — échéance comprise, pour calculer `VueEcheance`. */
const SELECT_ORGANISATION_PLATEFORME = {
  id: true,
  nom: true,
  devise: true,
  langueDefaut: true,
  actif: true,
  forfait: true,
  forfaitExpireLe: true,
  createdAt: true,
} as const

/** Ligne lue avec `SELECT_ORGANISATION_PLATEFORME` → vue plateforme (sans compteur de membres). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function versVuePlateforme(o: any, now: Date): Omit<OrganisationResume, 'nbMembres'> {
  return {
    id: o.id,
    nom: o.nom,
    devise: o.devise,
    langueDefaut: o.langueDefaut,
    actif: o.actif,
    forfait: o.forfait,
    createdAt: o.createdAt,
    ...vueEcheance(o.forfait, o.forfaitExpireLe ?? null, now),
  }
}

/**
 * Liste les organisations clientes avec leur statut, date de création et nombre de membres.
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
  id: string,
  actif: boolean,
): Promise<Omit<OrganisationResume, 'nbMembres'>> {
  const org = await prisma.organisation.update({
    where: { id },
    data: { actif },
    select: {
      id: true,
      nom: true,
      devise: true,
      langueDefaut: true,
      actif: true,
      forfait: true,
      createdAt: true,
    },
  })
  return org
}
```

par :

```ts
  id: string,
  actif: boolean,
  now: Date = new Date(),
): Promise<Omit<OrganisationResume, 'nbMembres'>> {
  const org = await prisma.organisation.update({
    where: { id },
    data: { actif },
    select: SELECT_ORGANISATION_PLATEFORME,
  })
  return versVuePlateforme(org, now)
}
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
  id: string,
  forfait: Forfait,
): Promise<Omit<OrganisationResume, 'nbMembres'>> {
  const org = await prisma.organisation.update({
    where: { id },
    // FK/scalaire directe (Organisation n'est pas un modèle scopé).
    data: { forfait },
    select: {
      id: true,
      nom: true,
      devise: true,
      langueDefaut: true,
      actif: true,
      forfait: true,
      createdAt: true,
    },
  })
  return org
}
```

par :

```ts
  id: string,
  forfait: Forfait,
  now: Date = new Date(),
): Promise<Omit<OrganisationResume, 'nbMembres'>> {
  const org = await prisma.organisation.update({
    where: { id },
    // FK/scalaire directe (Organisation n'est pas un modèle scopé). Repasser en GRATUIT EFFACE
    // l'échéance (spec 1.1 §2.5) : le Gratuit n'en a jamais, et une date résiduelle ressusciterait
    // un état « expiré » trompeur si l'organisation redevenait Pro plus tard.
    data: forfait === 'GRATUIT' ? { forfait, forfaitExpireLe: null } : { forfait },
    select: SELECT_ORGANISATION_PLATEFORME,
  })
  return versVuePlateforme(org, now)
}

// ===========================================================================
// Prolongation de l'échéance du forfait (spec 1.1 §2.5/§3.1) — action PLATEFORME (SUPER_ADMIN).
// ===========================================================================

/** Organisation inconnue (→ 404). */
export class OrganisationIntrouvableError extends Error {
  constructor(readonly organisationId: string) {
    super(`Organisation introuvable : ${organisationId}`)
    this.name = 'OrganisationIntrouvableError'
  }
}

/** Le forfait GRATUIT n'a pas d'échéance : rien à prolonger (→ 409). */
export class ProlongationForfaitGratuitError extends Error {
  constructor(readonly organisationId: string) {
    super(`Forfait GRATUIT sans échéance : ${organisationId}`)
    this.name = 'ProlongationForfaitGratuitError'
  }
}

/** L'échéance a changé entre la lecture et l'écriture — prolongation concurrente (→ 409). */
export class ProlongationConcurrenteError extends Error {
  constructor(readonly organisationId: string) {
    super(`Échéance modifiée pendant la prolongation : ${organisationId}`)
    this.name = 'ProlongationConcurrenteError'
  }
}

export interface ResultatProlongation {
  /** Vue de l'organisation APRÈS prolongation (inchangée en aperçu). */
  organisation: Omit<OrganisationResume, 'nbMembres'>
  echeanceActuelle: Date | null
  nouvelleEcheance: Date
  etatApres: EtatForfait
  joursRestantsApres: number
}

/**
 * Calcule — et, hors aperçu, ÉCRIT — la nouvelle échéance d'un forfait payant. Aperçu et écriture
 * passent par la MÊME fonction `nouvelleEcheance` : la console montre exactement la date écrite.
 * L'écriture est CONDITIONNELLE à l'échéance lue : si une autre prolongation l'a modifiée entre-temps,
 * rien n'est écrit (`ProlongationConcurrenteError`) plutôt que d'écraser une durée déjà payée.
 */
export async function prolongerForfaitOrganisation(
  prisma: PlateformePrisma,
  id: string,
  mois: PeriodeProlongation,
  options: { apercu: boolean; now?: Date },
): Promise<ResultatProlongation> {
  const now = options.now ?? new Date()
  const org = await prisma.organisation.findUnique({
    where: { id },
    select: SELECT_ORGANISATION_PLATEFORME,
  })
  if (!org) throw new OrganisationIntrouvableError(id)
  if (org.forfait === 'GRATUIT') throw new ProlongationForfaitGratuitError(id)

  const echeanceActuelle: Date | null = org.forfaitExpireLe ?? null
  const echeance = nouvelleEcheance(echeanceActuelle, now, mois)
  const resultat = (ligne: unknown): ResultatProlongation => ({
    organisation: versVuePlateforme(ligne, now),
    echeanceActuelle,
    nouvelleEcheance: echeance,
    etatApres: etatForfait(org.forfait, echeance, now),
    joursRestantsApres: joursRestants(echeance, now),
  })
  if (options.apercu) return resultat(org)

  const { count } = await prisma.organisation.updateMany({
    where: { id, forfaitExpireLe: echeanceActuelle },
    data: { forfaitExpireLe: echeance },
  })
  if (count !== 1) throw new ProlongationConcurrenteError(id)
  return resultat({ ...org, forfaitExpireLe: echeance })
}
```

Dans `backend/src/services/platform-audit.service.ts`, remplacer :

```ts
export type ActionPlateforme = 'CHANGER_FORFAIT' | 'SUSPENDRE' | 'REACTIVER' | 'PURGER' | 'EXPORTER'
```

par :

```ts
export type ActionPlateforme =
  | 'CHANGER_FORFAIT'
  | 'PROLONGER_FORFAIT'
  | 'SUSPENDRE'
  | 'REACTIVER'
  | 'PURGER'
  | 'EXPORTER'
```

Dans `backend/src/routes/platform.route.ts`, remplacer :

```ts
import {
  listerOrganisations,
  definirStatutOrganisation,
  definirForfaitOrganisation,
} from '../services/organisation.service'
import { FORFAITS, type Forfait } from '../lib/forfait'
```

par :

```ts
import {
  listerOrganisations,
  definirStatutOrganisation,
  definirForfaitOrganisation,
  prolongerForfaitOrganisation,
  OrganisationIntrouvableError,
  ProlongationConcurrenteError,
  ProlongationForfaitGratuitError,
} from '../services/organisation.service'
import { FORFAITS, PERIODES_PROLONGATION, type Forfait, type PeriodeProlongation } from '../lib/forfait'
```

Dans `backend/src/routes/platform.route.ts`, remplacer :

```ts
  'CHANGER_FORFAIT',
  'SUSPENDRE',
```

par :

```ts
  'CHANGER_FORFAIT',
  'PROLONGER_FORFAIT',
  'SUSPENDRE',
```

Dans `backend/src/routes/platform.route.ts`, remplacer :

```ts
 *   DELETE /platform/organisations/:id           → purge DÉFINITIVE (double verrou, cf. plus bas)
```

par :

```ts
 *   DELETE /platform/organisations/:id           → purge DÉFINITIVE (double verrou, cf. plus bas)
 *   POST   /platform/organisations/:id/forfait/prolonger → prolonge l'échéance (aperçu possible)
```

Dans `backend/src/routes/platform.route.ts`, remplacer :

```ts
            select: { forfait: true },
          })
```

par :

```ts
            select: { forfait: true, forfaitExpireLe: true },
          })
```

Dans `backend/src/routes/platform.route.ts`, remplacer :

```ts
            donneesAvant: { forfait: avant?.forfait ?? null },
```

par :

```ts
            donneesAvant: {
              forfait: avant?.forfait ?? null,
              forfaitExpireLe: avant?.forfaitExpireLe?.toISOString() ?? null,
            },
```

Dans `backend/src/routes/platform.route.ts`, remplacer :

```ts
        throw err
      }
    },
  )
}

/**
 * Applique le changement de statut d'une organisation
```

par :

```ts
        throw err
      }
    },
  )

  // POST /platform/organisations/:id/forfait/prolonger — prolonge l'échéance du forfait (spec 1.1
  // §3.1). `apercu: true` calcule la nouvelle date SANS écrire : la console affiche exactement ce que
  // l'écriture produira (même fonction). 404 id inconnu ; 409 forfait GRATUIT (pas d'échéance) ou
  // échéance modifiée entre la lecture et l'écriture (écriture conditionnelle, cf. service).
  app.post<{ Params: { id: string }; Body: { mois: PeriodeProlongation; apercu?: boolean } }>(
    '/platform/organisations/:id/forfait/prolonger',
    {
      ...garde,
      schema: {
        body: {
          type: 'object',
          required: ['mois'],
          additionalProperties: false,
          properties: {
            mois: { type: 'integer', enum: [...PERIODES_PROLONGATION] },
            apercu: { type: 'boolean' },
          },
        },
      },
    },
    async (req, reply) => {
      const langue = langueDeRequete(req)
      const apercu = req.body.apercu === true
      try {
        // `runUnscoped` : flux plateforme sans contexte d'organisation (le journal lit `Utilisateur`,
        // modèle scopé) — lecture de l'échéance, écriture conditionnelle et trace dans UN seul appel.
        return await orgContext.runUnscoped(async () => {
          const resultat = await prolongerForfaitOrganisation(app.prisma, req.params.id, req.body.mois, {
            apercu,
          })
          if (!apercu) {
            await journaliserBestEffort({
              acteurId: req.user.sub ?? '',
              action: 'PROLONGER_FORFAIT',
              organisationCibleId: resultat.organisation.id,
              organisationNom: resultat.organisation.nom,
              donneesAvant: {
                forfait: resultat.organisation.forfait,
                forfaitExpireLe: resultat.echeanceActuelle?.toISOString() ?? null,
              },
              donneesApres: {
                forfaitExpireLe: resultat.nouvelleEcheance.toISOString(),
                mois: req.body.mois,
              },
            })
          }
          return resultat
        })
      } catch (err) {
        if (err instanceof OrganisationIntrouvableError) {
          return reply.code(404).send({ error: 'Not Found', message: t(langue, 'platform.organisationIntrouvable') })
        }
        if (err instanceof ProlongationForfaitGratuitError) {
          return reply.code(409).send({ error: 'Conflict', message: t(langue, 'platform.prolongationForfaitGratuit') })
        }
        if (err instanceof ProlongationConcurrenteError) {
          return reply.code(409).send({ error: 'Conflict', message: t(langue, 'platform.prolongationConcurrente') })
        }
        throw err
      }
    },
  )
}

/**
 * Applique le changement de statut d'une organisation
```

Dans `backend/src/locales/fr/platform.ts`, remplacer :

```ts
    "Le journal d'audit est momentanément indisponible : la suppression est annulée (aucune donnée effacée). Réessayez.",
} as const
```

par :

```ts
    "Le journal d'audit est momentanément indisponible : la suppression est annulée (aucune donnée effacée). Réessayez.",
  // Prolongation d'échéance (spec 1.1 §3.1).
  'platform.prolongationForfaitGratuit':
    "Le forfait Gratuit n'a pas d'échéance : attribuez d'abord un forfait Pro ou Entreprise.",
  'platform.prolongationConcurrente':
    "L'échéance de cette organisation vient d'être modifiée : rechargez la page puis relancez la prolongation.",
} as const
```

Dans `backend/src/locales/en/platform.ts`, remplacer :

```ts
    'The audit log is temporarily unavailable: deletion cancelled (no data erased). Please retry.',
}
```

par :

```ts
    'The audit log is temporarily unavailable: deletion cancelled (no data erased). Please retry.',
  'platform.prolongationForfaitGratuit': 'The Free plan has no end date: assign a Pro or Enterprise plan first.',
  'platform.prolongationConcurrente':
    "This organisation's end date has just changed: reload the page and extend it again.",
}
```

- [ ] **Step 4 : Vérifier le succès**

Run : `cd backend && npm run test -- --run tests/platform.route.test.ts tests/platform-audit.route.test.ts tests/runUnscoped-allowlist.test.ts tests/organisations.route.test.ts`
Expected : **PASS**.

Run : `cd backend && npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : build sans erreur, tous les tests passent.

- [ ] **Step 5 : Commit**

```bash
git add backend/src/services/organisation.service.ts backend/src/services/platform-audit.service.ts backend/src/routes/platform.route.ts backend/src/locales/fr/platform.ts backend/src/locales/en/platform.ts backend/tests/platform.route.test.ts backend/tests/platform-audit.route.test.ts backend/tests/runUnscoped-allowlist.test.ts
git commit -m "feat(plateforme): prolongation du forfait avec apercu serveur

POST /platform/organisations/:id/forfait/prolonger : apercu et ecriture par la
meme fonction, ecriture CONDITIONNELLE sur l'ancienne echeance (409 si
concurrente), 409 sur GRATUIT, trace PROLONGER_FORFAIT. Vues plateforme
enrichies de l'etat calcule ; repasser en GRATUIT efface l'echeance.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5 : Forfait effectif dans le quota de membres et dans Paramètres

**Files :**
- Modify : `backend/src/routes/membres.route.ts`
- Modify : `backend/src/services/organisation.service.ts`
- Test : `backend/tests/membres-quota.integration.test.ts` (vraie Postgres)

**Interfaces :**
- Consumes (Task 2) : `forfaitEffectif`, `vueEcheance` ; (Task 3) base `nkoni_it_echeance` migrée.
- Produces : `limiteMembresOrganisation` lit le forfait **effectif** (création, import, réactivation) ;
  `interface OrganisationCourante extends VueEcheance` et `chargerOrganisationCourante(prisma, organisationId,
  now = new Date())` — `GET /organisations/moi` renvoie les champs d'échéance et un `limiteMembres` effectif.

- [ ] **Step 1 : Écrire les tests d'intégration (en échec)**

Pourquoi en intégration : le contrôle dépend de la colonne `forfaitExpireLe` présente dans le `select`. Un
mock qui renvoie l'objet entier masquerait son oubli (CLAUDE.md : un invariant porté par la requête ne se
prouve qu'en intégration).

Dans `backend/tests/membres-quota.integration.test.ts`, remplacer :

```ts
  it('import : 50 actifs → importer 1 actif reste un dépassement (403 au commit)', async () => {
```

par :

```ts
  it('forfait PRO EXPIRÉ au-delà de la grâce : le plafond Gratuit s’applique de nouveau (création 403)', async () => {
    // Relit la colonne `forfaitExpireLe` : un mock renvoyant l'objet entier masquerait son oubli dans le
    // `select` — d'où ce cas en intégration (spec 1.1 §3.3, forfait EFFECTIF).
    await preparer(PLAFOND, 0)
    await base.organisation.update({
      where: { id: ORG },
      data: { forfait: 'PRO', forfaitExpireLe: new Date(Date.now() - 20 * 86_400_000) },
    })
    try {
      const res = await app.inject({
        method: 'POST', url: '/membres', headers: entetes(),
        payload: { nom: 'Apres', prenom: 'Expiration', anneeAdhesion: 2024 },
      })
      expect(res.statusCode).toBe(403)
      const moi = await app.inject({ method: 'GET', url: '/organisations/moi', headers: entetes() })
      expect(moi.json()).toMatchObject({ forfait: 'PRO', etatForfait: 'EXPIRE', forfaitEffectif: 'GRATUIT', limiteMembres: PLAFOND })
    } finally {
      await base.organisation.update({ where: { id: ORG }, data: { forfait: 'GRATUIT', forfaitExpireLe: null } })
    }
  })

  it('forfait PRO à échéance future : aucun plafond (création 201)', async () => {
    await preparer(PLAFOND, 0)
    await base.organisation.update({
      where: { id: ORG },
      data: { forfait: 'PRO', forfaitExpireLe: new Date(Date.now() + 60 * 86_400_000) },
    })
    try {
      const res = await app.inject({
        method: 'POST', url: '/membres', headers: entetes(),
        payload: { nom: 'Pro', prenom: 'Actif', anneeAdhesion: 2024 },
      })
      expect(res.statusCode).toBe(201)
    } finally {
      await base.organisation.update({ where: { id: ORG }, data: { forfait: 'GRATUIT', forfaitExpireLe: null } })
    }
  })

  it('import : 50 actifs → importer 1 actif reste un dépassement (403 au commit)', async () => {
```

- [ ] **Step 2 : Vérifier l'échec**

```bash
cd backend
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_echeance?sslmode=disable" npx vitest --run tests/membres-quota.integration.test.ts
```

Expected : **FAIL** sur « forfait PRO EXPIRÉ au-delà de la grâce » (201 au lieu de 403 : le forfait brut PRO
est encore lu) ; « forfait PRO à échéance future » passe déjà.

- [ ] **Step 3 : Implémenter**

Dans `backend/src/routes/membres.route.ts`, remplacer :

```ts
import { limiteMembresForfait, type Forfait } from '../lib/forfait'
```

par :

```ts
import { forfaitEffectif, limiteMembresForfait, type Forfait } from '../lib/forfait'
```

Dans `backend/src/routes/membres.route.ts`, remplacer :

```ts
 * (Pro/Entreprise). Lit `Organisation.forfait` (modèle NON scopé → findUnique par id).
```

par :

```ts
 * (Pro/Entreprise). Lit le forfait EFFECTIF — forfait + échéance, spec 1.1 §2.3 — de l'organisation
 * (modèle NON scopé → findUnique par id).
```

Dans `backend/src/routes/membres.route.ts`, remplacer :

```ts
    select: { forfait: true },
  })
  return limiteMembresForfait((org?.forfait ?? 'GRATUIT') as Forfait)
```

par :

```ts
    select: { forfait: true, forfaitExpireLe: true },
  })
  // Forfait EFFECTIF : un Pro expiré depuis plus de 14 jours retrouve le plafond Gratuit. Ne jamais
  // lire `forfait` brut pour décider d'une capacité.
  return limiteMembresForfait(
    forfaitEffectif((org?.forfait ?? 'GRATUIT') as Forfait, org?.forfaitExpireLe ?? null, new Date()),
  )
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
/** Paramètres immuables de l'organisation + volume actuel de membres et sa limite de forfait. */
export interface OrganisationCourante {
```

par :

```ts
/**
 * Paramètres immuables de l'organisation + volume actuel de membres et sa limite de forfait, + champs
 * d'échéance CALCULÉS (spec 1.1 §3.2), affichés tels quels par l'écran Paramètres.
 */
export interface OrganisationCourante extends VueEcheance {
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
  /** Plafond du forfait — pour situer `nbMembres` (ex. 42 / 50). `null` = illimité (Pro/Entreprise). */
```

par :

```ts
  /** Plafond du forfait EFFECTIF — pour situer `nbMembres` (ex. 42 / 50). `null` = illimité. */
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
  organisationId: string,
): Promise<OrganisationCourante | null> {
```

par :

```ts
  organisationId: string,
  now: Date = new Date(),
): Promise<OrganisationCourante | null> {
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
      forfait: true,
      createdAt: true,
      chefMembreId: true,
```

par :

```ts
      forfait: true,
      forfaitExpireLe: true,
      createdAt: true,
      chefMembreId: true,
```

Dans `backend/src/services/organisation.service.ts`, remplacer :

```ts
    limiteMembres: limiteMembresForfait(org.forfait),
```

par :

```ts
    ...vueEcheance(org.forfait, org.forfaitExpireLe ?? null, now),
    limiteMembres: limiteMembresForfait(forfaitEffectif(org.forfait, org.forfaitExpireLe ?? null, now)),
```

- [ ] **Step 4 : Vérifier le succès**

```bash
cd backend
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_echeance?sslmode=disable" npx vitest --run tests/membres-quota.integration.test.ts
npm run build
npm run test -- --run --exclude '**/*.integration.test.ts'
```

Expected : **PASS** (12 tests d'intégration) ; build sans erreur ; tous les tests unitaires passent
(`organisations.route.test.ts` utilise `toMatchObject` : les champs ajoutés ne le cassent pas).

- [ ] **Step 5 : Commit**

```bash
git add backend/src/routes/membres.route.ts backend/src/services/organisation.service.ts backend/tests/membres-quota.integration.test.ts
git commit -m "feat(forfaits): le quota de membres lit le forfait EFFECTIF

Un Pro expire depuis plus de 14 jours retrouve le plafond Gratuit a la
creation, a l'import et a la reactivation. GET /organisations/moi renvoie
l'etat d'echeance et un limiteMembres effectif. Prouve en integration (le
select doit inclure forfaitExpireLe).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6 : Types d'API et journal plateforme (frontend)

**Files :**
- Modify : `frontend/src/lib/forfait.ts`, `frontend/src/lib/api/platform.ts`, `frontend/src/lib/api/organisation.ts`,
  `frontend/src/lib/api/membres.ts`, `frontend/src/pages/PlatformAuditPage.tsx`,
  `frontend/src/locales/fr/superAdmin.ts`, `frontend/src/locales/en/superAdmin.ts`

**Interfaces :**
- Consumes (Tasks 4-5) : forme JSON des réponses (dates ISO).
- Produces :
  - `frontend/src/lib/forfait.ts` : `type EtatForfait`, `PERIODES_PROLONGATION`, `type PeriodeProlongation`
    (**aucune fonction** : écart assumé n° 1) ;
  - `interface EcheanceForfait { forfaitExpireLe: string | null; etatForfait: EtatForfait; joursRestants: number | null;
    finGraceLe: string | null; forfaitEffectif: Forfait }` ; `PlatformOrganisation` et `OrganisationCourante` l'étendent ;
  - `interface ApercuProlongation` et `platformApi.prolongerForfait(id, mois, apercu, accessToken)` ;
  - `ActionPlateforme` inclut `'PROLONGER_FORFAIT'` ; `quota.plafond: number | null`.

- [ ] **Step 1 : Modifier les types, le client et le journal**

Dans `frontend/src/lib/forfait.ts`, remplacer :

```ts
  return CAPACITES_FORFAIT[forfait]?.limiteMembres ?? null
}
```

par :

```ts
  return CAPACITES_FORFAIT[forfait]?.limiteMembres ?? null
}

/**
 * État de l'échéance d'un forfait (spec 1.1 §2.3) — TYPE seulement : la valeur est CALCULÉE par le
 * serveur et affichée telle quelle, jamais recalculée ici (un miroir de logique dériverait sans garde).
 */
export type EtatForfait = 'SANS_ECHEANCE' | 'ACTIF' | 'ECHEANCE_PROCHE' | 'GRACE' | 'EXPIRE'

/** Durées de prolongation proposées (le serveur les valide : toute autre valeur → 400). */
export const PERIODES_PROLONGATION = [1, 3, 6, 12] as const
export type PeriodeProlongation = (typeof PERIODES_PROLONGATION)[number]
```

Dans `frontend/src/lib/api/platform.ts`, remplacer :

```ts
import type { Forfait } from '@/lib/forfait'
```

par :

```ts
import type { EtatForfait, Forfait, PeriodeProlongation } from '@/lib/forfait'
```

Dans `frontend/src/lib/api/platform.ts`, remplacer :

```ts
export interface PlatformOrganisation {
```

par :

```ts
/** Champs d'échéance CALCULÉS par le serveur (spec 1.1 §2.3) — dates ISO. */
export interface EcheanceForfait {
  forfaitExpireLe: string | null
  etatForfait: EtatForfait
  /** `null` si `SANS_ECHEANCE`. */
  joursRestants: number | null
  /** Fin de la période de grâce ; `null` si `SANS_ECHEANCE`. */
  finGraceLe: string | null
  /** Forfait dont les capacités s'appliquent (GRATUIT après la grâce). */
  forfaitEffectif: Forfait
}

export interface PlatformOrganisation extends EcheanceForfait {
```

Dans `frontend/src/lib/api/platform.ts`, remplacer :

```ts
type OrganisationStatut = Omit<PlatformOrganisation, 'nbMembres'>
```

par :

```ts
type OrganisationStatut = Omit<PlatformOrganisation, 'nbMembres'>

/** Réponse de la prolongation (aperçu ou écriture) — POST /platform/organisations/:id/forfait/prolonger. */
export interface ApercuProlongation {
  organisation: OrganisationStatut
  echeanceActuelle: string | null
  nouvelleEcheance: string
  etatApres: EtatForfait
  joursRestantsApres: number
}
```

Dans `frontend/src/lib/api/platform.ts`, remplacer :

```ts
      json: { forfait },
    }),
```

par :

```ts
      json: { forfait },
    }),
  /**
   * Prolonge l'échéance du forfait (SUPER_ADMIN). `apercu: true` → nouvelle date calculée SANS écriture
   * (la console affiche exactement ce que l'écriture produira). 409 si GRATUIT ou échéance modifiée.
   */
  prolongerForfait: (id: string, mois: PeriodeProlongation, apercu: boolean, accessToken: string) =>
    request<ApercuProlongation>(`/platform/organisations/${id}/forfait/prolonger`, {
      method: 'POST',
      accessToken,
      json: { mois, apercu },
    }),
```

Dans `frontend/src/lib/api/platform.ts`, remplacer :

```ts
export type ActionPlateforme = 'CHANGER_FORFAIT' | 'SUSPENDRE' | 'REACTIVER' | 'PURGER' | 'EXPORTER'
```

par :

```ts
export type ActionPlateforme =
  | 'CHANGER_FORFAIT'
  | 'PROLONGER_FORFAIT'
  | 'SUSPENDRE'
  | 'REACTIVER'
  | 'PURGER'
  | 'EXPORTER'
```

Dans `frontend/src/lib/api/organisation.ts`, remplacer :

```ts
import type { Forfait } from '@/lib/forfait'
```

par :

```ts
import type { Forfait } from '@/lib/forfait'
import type { EcheanceForfait } from './platform'
```

Dans `frontend/src/lib/api/organisation.ts`, remplacer :

```ts
export interface OrganisationCourante {
```

par :

```ts
export interface OrganisationCourante extends EcheanceForfait {
```

Dans `frontend/src/lib/api/membres.ts`, remplacer :

```ts
  quota: { actuel: number; plafond: number; aCreer: number; depasse: boolean }
```

par :

```ts
  /** `plafond: null` = forfait sans plafond (Pro/Entreprise). */
  quota: { actuel: number; plafond: number | null; aCreer: number; depasse: boolean }
```

Dans `frontend/src/pages/PlatformAuditPage.tsx`, remplacer :

```tsx
import { formatDateHeure, cn } from '@/lib/utils'
```

par :

```tsx
import { formatDate, formatDateHeure, cn } from '@/lib/utils'
```

Dans `frontend/src/pages/PlatformAuditPage.tsx`, remplacer :

```tsx
const ACTIONS: ActionPlateforme[] = ['CHANGER_FORFAIT', 'SUSPENDRE', 'REACTIVER', 'PURGER', 'EXPORTER']
```

par :

```tsx
const ACTIONS: ActionPlateforme[] = [
  'CHANGER_FORFAIT',
  'PROLONGER_FORFAIT',
  'SUSPENDRE',
  'REACTIVER',
  'PURGER',
  'EXPORTER',
]
```

Dans `frontend/src/pages/PlatformAuditPage.tsx`, remplacer :

```tsx
  CHANGER_FORFAIT: 'brass',
```

par :

```tsx
  CHANGER_FORFAIT: 'brass',
  PROLONGER_FORFAIT: 'jade',
```

Dans `frontend/src/pages/PlatformAuditPage.tsx`, remplacer :

```tsx
      return `${String(av.forfait ?? '—')} → ${String(ap.forfait ?? '—')}`
```

par :

```tsx
      return `${String(av.forfait ?? '—')} → ${String(ap.forfait ?? '—')}`
    case 'PROLONGER_FORFAIT':
      return `${typeof av.forfaitExpireLe === 'string' ? formatDate(av.forfaitExpireLe) : '—'} → ${typeof ap.forfaitExpireLe === 'string' ? formatDate(ap.forfaitExpireLe) : '—'}`
```

Dans `frontend/src/locales/fr/superAdmin.ts`, remplacer :

```ts
        CHANGER_FORFAIT: 'Forfait modifié',
```

par :

```ts
        CHANGER_FORFAIT: 'Forfait modifié',
        PROLONGER_FORFAIT: 'Forfait prolongé',
```

Dans `frontend/src/locales/en/superAdmin.ts`, remplacer :

```ts
        CHANGER_FORFAIT: 'Plan changed',
```

par :

```ts
        CHANGER_FORFAIT: 'Plan changed',
        PROLONGER_FORFAIT: 'Plan extended',
```

- [ ] **Step 2 : Vérifier**

Run : `cd frontend && npm run build && npm run lint && npm run test`
Expected : build sans erreur (le `Record<ActionPlateforme, …>` de `PlatformAuditPage` force l'entrée
`PROLONGER_FORFAIT` ; le garde de parité `forfait-parity.test.ts` reste vert malgré les exports ajoutés
après la table) ; lint sans finding ; tous les tests passent.

- [ ] **Step 3 : Commit**

```bash
git add frontend/src/lib/forfait.ts frontend/src/lib/api/platform.ts frontend/src/lib/api/organisation.ts frontend/src/lib/api/membres.ts frontend/src/pages/PlatformAuditPage.tsx frontend/src/locales/fr/superAdmin.ts frontend/src/locales/en/superAdmin.ts
git commit -m "feat(front): types d'echeance, prolongation et journal PROLONGER_FORFAIT

Types des valeurs calculees par le serveur (aucune logique recopiee), client
prolongerForfait, action PROLONGER_FORFAIT dans l'historique plateforme,
plafond d'import nullable.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7 : Console — colonne Échéance, filtre « À relancer », forfait effectif

**Files :**
- Create : `frontend/src/lib/echeance-forfait.ts` (+ `.test.ts`)
- Create : `frontend/src/components/plateforme/BadgeEcheance.tsx` (+ `.test.tsx`)
- Modify : `frontend/src/pages/SuperAdminPage.tsx`
- Modify : `frontend/src/locales/{fr,en}/common.ts`, `frontend/src/locales/{fr,en}/superAdmin.ts`

**Interfaces :**
- Consumes (Task 6) : `PlatformOrganisation` (champs d'échéance), `EtatForfait`.
- Produces : `estARelancer(o)`, `comparerEcheances(a, b)` ; composant `BadgeEcheance({ etat, joursRestants, expireLe,
  masquerDate? })` (réutilisé par les Tasks 8 et 9) ; libellés `commun.echeance.*`.

- [ ] **Step 1 : Écrire les tests (en échec)**

Créer `frontend/src/lib/echeance-forfait.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { comparerEcheances, estARelancer } from './echeance-forfait'

// Env `node` (défaut des *.test.ts) : fonctions pures.
describe('estARelancer', () => {
  it.each(['ECHEANCE_PROCHE', 'GRACE', 'EXPIRE'] as const)('forfait payant en %s → à relancer', (etat) => {
    expect(estARelancer({ forfait: 'PRO', etatForfait: etat })).toBe(true)
  })

  it('forfait payant actif ou sans échéance → rien à relancer', () => {
    expect(estARelancer({ forfait: 'ENTREPRISE', etatForfait: 'ACTIF' })).toBe(false)
    expect(estARelancer({ forfait: 'PRO', etatForfait: 'SANS_ECHEANCE' })).toBe(false)
  })

  it('forfait GRATUIT → jamais à relancer', () => {
    expect(estARelancer({ forfait: 'GRATUIT', etatForfait: 'EXPIRE' })).toBe(false)
  })
})

describe('comparerEcheances', () => {
  it('trie par date croissante, les organisations sans échéance en dernier', () => {
    const lignes = [
      { id: 'sans', forfaitExpireLe: null },
      { id: 'mars', forfaitExpireLe: '2027-03-01T22:59:59.999Z' },
      { id: 'janvier', forfaitExpireLe: '2027-01-01T22:59:59.999Z' },
    ]
    expect([...lignes].sort(comparerEcheances).map((l) => l.id)).toEqual(['janvier', 'mars', 'sans'])
  })
})
```

Créer `frontend/src/components/plateforme/BadgeEcheance.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { BadgeEcheance } from './BadgeEcheance'

// Les libellés ne sont pas l'objet du test : t → « clé » ou « clé:count ».
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (cle: string, o?: { count?: number }) => (o?.count === undefined ? cle : `${cle}:${o.count}`),
    i18n: { language: 'fr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

afterEach(cleanup)

const ISO = '2026-10-13T22:59:59.999Z'

describe('BadgeEcheance', () => {
  it('sans échéance : un tiret, aucun badge', () => {
    render(<BadgeEcheance etat="SANS_ECHEANCE" joursRestants={null} expireLe={null} />)
    expect(screen.getByText('commun.echeance.sans')).toBeTruthy()
  })

  it('échéance proche : jours restants', () => {
    render(<BadgeEcheance etat="ECHEANCE_PROCHE" joursRestants={12} expireLe={ISO} />)
    expect(screen.getByText('commun.echeance.proche:12')).toBeTruthy()
  })

  it('grâce : jours ÉCOULÉS depuis l’échéance, en positif', () => {
    render(<BadgeEcheance etat="GRACE" joursRestants={-3} expireLe={ISO} />)
    expect(screen.getByText('commun.echeance.grace:3')).toBeTruthy()
  })

  it('expiré : libellé expiré ; la date est masquable', () => {
    const { container } = render(<BadgeEcheance etat="EXPIRE" joursRestants={-40} expireLe={ISO} masquerDate />)
    expect(screen.getByText('commun.echeance.expire')).toBeTruthy()
    expect(container.querySelectorAll('span.text-muted-foreground')).toHaveLength(0)
  })
})
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `cd frontend && npx vitest --run src/lib/echeance-forfait.test.ts src/components/plateforme/BadgeEcheance.test.tsx`
Expected : **FAIL** (modules introuvables).

- [ ] **Step 3 : Implémenter les deux modules**

Créer `frontend/src/lib/echeance-forfait.ts` :

```ts
import type { EtatForfait, Forfait } from '@/lib/forfait'

/**
 * Règles d'AFFICHAGE de l'échéance côté console (spec 1.1 §4.2). Aucune règle de calcul ici : l'état
 * vient du serveur. Fichier séparé du composant pour le Fast Refresh (un module de composants
 * n'exporte que des composants).
 */

/** États qui appellent une relance commerciale. */
const ETATS_A_RELANCER: readonly EtatForfait[] = ['ECHEANCE_PROCHE', 'GRACE', 'EXPIRE']

/** Organisation à relancer : forfait PAYANT enregistré, en échéance proche, en grâce ou expiré. */
export function estARelancer(o: { forfait: Forfait; etatForfait: EtatForfait }): boolean {
  return o.forfait !== 'GRATUIT' && ETATS_A_RELANCER.includes(o.etatForfait)
}

/** Tri par échéance croissante ; les organisations sans échéance passent en dernier. */
export function comparerEcheances(a: { forfaitExpireLe: string | null }, b: { forfaitExpireLe: string | null }): number {
  if (a.forfaitExpireLe === null && b.forfaitExpireLe === null) return 0
  if (a.forfaitExpireLe === null) return 1
  if (b.forfaitExpireLe === null) return -1
  return new Date(a.forfaitExpireLe).getTime() - new Date(b.forfaitExpireLe).getTime()
}
```

Créer `frontend/src/components/plateforme/BadgeEcheance.tsx` :

```tsx
import { useTranslation } from 'react-i18next'
import { Badge, type BadgeProps } from '@/components/ui/Badge'
import type { EtatForfait } from '@/lib/forfait'
import { formatDate } from '@/lib/utils'

/** Teinte par état (jetons du design system). */
const TON: Record<EtatForfait, BadgeProps['tone']> = {
  SANS_ECHEANCE: 'neutral',
  ACTIF: 'jade',
  ECHEANCE_PROCHE: 'amber',
  GRACE: 'amber',
  EXPIRE: 'terra',
}

const DATE_COURTE = { day: 'numeric', month: 'short', year: 'numeric' } as const

interface Props {
  etat: EtatForfait
  joursRestants: number | null
  expireLe: string | null
  /** Masque la date quand le contexte l'énonce déjà (phrase de Paramètres). */
  masquerDate?: boolean
}

/**
 * Échéance d'un forfait : date + badge d'état (spec 1.1 §4.2). Affiche les valeurs CALCULÉES par le
 * serveur (`etatForfait`, `joursRestants`), sans les recalculer.
 */
export function BadgeEcheance({ etat, joursRestants, expireLe, masquerDate = false }: Props) {
  const { t } = useTranslation()
  if (etat === 'SANS_ECHEANCE' || expireLe === null || joursRestants === null) {
    return <span className="text-faint">{t('commun.echeance.sans')}</span>
  }
  const libelle =
    etat === 'ACTIF'
      ? t('commun.echeance.actif')
      : etat === 'ECHEANCE_PROCHE'
        ? t('commun.echeance.proche', { count: joursRestants })
        : etat === 'GRACE'
          ? t('commun.echeance.grace', { count: -joursRestants })
          : t('commun.echeance.expire')
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
      {!masquerDate && <span className="text-sm text-muted-foreground">{formatDate(expireLe, DATE_COURTE)}</span>}
      <Badge tone={TON[etat]} size="sm">
        {libelle}
      </Badge>
    </span>
  )
}
```

Run : `cd frontend && npx vitest --run src/lib/echeance-forfait.test.ts src/components/plateforme/BadgeEcheance.test.tsx`
Expected : **PASS**, 10 tests.

- [ ] **Step 4 : Libellés et console**

Dans `frontend/src/locales/fr/common.ts`, remplacer :

```ts
    forfaits: { GRATUIT: 'Gratuit', PRO: 'Pro', ENTREPRISE: 'Entreprise' },
```

par :

```ts
    forfaits: { GRATUIT: 'Gratuit', PRO: 'Pro', ENTREPRISE: 'Entreprise' },
    // États d'échéance d'un forfait (spec 1.1) — badge partagé console plateforme / Paramètres.
    echeance: {
      sans: '—',
      actif: 'Actif',
      proche_one: 'J-{{count}}',
      proche_other: 'J-{{count}}',
      grace_one: 'Grâce J+{{count}}',
      grace_other: 'Grâce J+{{count}}',
      expire: 'Expiré',
    },
```

Dans `frontend/src/locales/en/common.ts`, remplacer :

```ts
    forfaits: { GRATUIT: 'Free', PRO: 'Pro', ENTREPRISE: 'Enterprise' },
```

par :

```ts
    forfaits: { GRATUIT: 'Free', PRO: 'Pro', ENTREPRISE: 'Enterprise' },
    echeance: {
      sans: '—',
      actif: 'Active',
      proche_one: 'D-{{count}}',
      proche_other: 'D-{{count}}',
      grace_one: 'Grace D+{{count}}',
      grace_other: 'Grace D+{{count}}',
      expire: 'Expired',
    },
```

Dans `frontend/src/locales/fr/superAdmin.ts`, remplacer :

```ts
      pressionQuotaFiltre: 'Cliquer pour filtrer les espaces concernés',
```

par :

```ts
      pressionQuotaFiltre: 'Cliquer pour filtrer les espaces concernés',
      aRelancer: 'À relancer',
      aRelancerFiltre: 'Échéance proche, en grâce ou expirée — cliquer pour filtrer',
```

Dans `frontend/src/locales/fr/superAdmin.ts`, remplacer :

```ts
      quotaRetirer: 'Retirer le filtre de quota',
```

par :

```ts
      quotaRetirer: 'Retirer le filtre de quota',
      relanceActif: 'À relancer',
      relanceRetirer: 'Retirer le filtre « à relancer »',
```

Dans `frontend/src/locales/fr/superAdmin.ts`, remplacer :

```ts
      identifiant: 'Identifiant',
```

par :

```ts
      identifiant: 'Identifiant',
      echeance: 'Échéance',
```

Dans `frontend/src/locales/fr/superAdmin.ts`, remplacer :

```ts
      quotaAtteint: 'Plafond du forfait atteint',
```

par :

```ts
      quotaAtteint: 'Plafond du forfait atteint',
      echeance: 'Échéance',
```

Dans `frontend/src/locales/en/superAdmin.ts`, remplacer :

```ts
      pressionQuotaFiltre: 'Click to filter the affected spaces',
```

par :

```ts
      pressionQuotaFiltre: 'Click to filter the affected spaces',
      aRelancer: 'To follow up',
      aRelancerFiltre: 'Ending soon, in grace or expired — click to filter',
```

Dans `frontend/src/locales/en/superAdmin.ts`, remplacer :

```ts
      quotaRetirer: 'Remove quota filter',
```

par :

```ts
      quotaRetirer: 'Remove quota filter',
      relanceActif: 'To follow up',
      relanceRetirer: 'Remove the follow-up filter',
```

Dans `frontend/src/locales/en/superAdmin.ts`, remplacer :

```ts
      identifiant: 'Identifier',
```

par :

```ts
      identifiant: 'Identifier',
      echeance: 'End date',
```

Dans `frontend/src/locales/en/superAdmin.ts`, remplacer :

```ts
      quotaAtteint: 'Plan limit reached',
```

par :

```ts
      quotaAtteint: 'Plan limit reached',
      echeance: 'End date',
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
  Gauge,
  Languages,
```

par :

```tsx
  Gauge,
  BellRing,
  Languages,
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
import { FORFAITS, limiteMembresForfait, type Forfait } from '@/lib/forfait'
```

par :

```tsx
import { FORFAITS, limiteMembresForfait, type Forfait } from '@/lib/forfait'
import { comparerEcheances, estARelancer } from '@/lib/echeance-forfait'
import { BadgeEcheance } from '@/components/plateforme/BadgeEcheance'
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
type ColonneTri = 'organisation' | 'forfait' | 'membres' | 'creee' | 'statut'
```

par :

```tsx
type ColonneTri = 'organisation' | 'forfait' | 'echeance' | 'membres' | 'creee' | 'statut'
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
/** Une org « proche du plafond » = forfait plafonné ET ≥ 80 % du quota membres (signal d'attention/upsell). */
function estProchePlafond(o: PlatformOrganisation): boolean {
  const max = limiteMembresForfait(o.forfait)
```

par :

```tsx
/**
 * Une org « proche du plafond » = forfait plafonné ET ≥ 80 % du quota membres (signal d'attention/upsell).
 * Forfait EFFECTIF (spec 1.1) : un Pro expiré retrouve le plafond Gratuit — la console doit le montrer.
 */
function estProchePlafond(o: PlatformOrganisation): boolean {
  const max = limiteMembresForfait(o.forfaitEffectif)
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
function estAuPlafond(o: PlatformOrganisation): boolean {
  const max = limiteMembresForfait(o.forfait)
```

par :

```tsx
function estAuPlafond(o: PlatformOrganisation): boolean {
  const max = limiteMembresForfait(o.forfaitEffectif)
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
  quota: boolean
  tri: { col: ColonneTri; dir: SortDir }
```

par :

```tsx
  quota: boolean
  relance: boolean
  tri: { col: ColonneTri; dir: SortDir }
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
  const [filtreQuota, setFiltreQuota] = useState<boolean>(() => chargerPrefs().quota ?? false)
```

par :

```tsx
  const [filtreQuota, setFiltreQuota] = useState<boolean>(() => chargerPrefs().quota ?? false)
  const [filtreRelance, setFiltreRelance] = useState<boolean>(() => chargerPrefs().relance ?? false)
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
        JSON.stringify({ statut: filtreStatut, forfait: filtreForfait, quota: filtreQuota, tri }),
      )
    } catch {
      /* localStorage indisponible (navigation privée / quota) : on ignore, non bloquant. */
    }
  }, [filtreStatut, filtreForfait, filtreQuota, tri])
```

par :

```tsx
        JSON.stringify({ statut: filtreStatut, forfait: filtreForfait, quota: filtreQuota, relance: filtreRelance, tri }),
      )
    } catch {
      /* localStorage indisponible (navigation privée / quota) : on ignore, non bloquant. */
    }
  }, [filtreStatut, filtreForfait, filtreQuota, filtreRelance, tri])
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
      auPlafond: liste.filter(estAuPlafond).length,
    }
```

par :

```tsx
      auPlafond: liste.filter(estAuPlafond).length,
      // Échéance (spec 1.1 §4.2) : forfaits payants en échéance proche, en grâce ou expirés.
      aRelancer: liste.filter(estARelancer).length,
    }
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
      if (filtreQuota && !estProchePlafond(o)) return false
      return true
    })
  }, [organisations, recherche, filtreStatut, filtreForfait, filtreQuota])
```

par :

```tsx
      if (filtreQuota && !estProchePlafond(o)) return false
      if (filtreRelance && !estARelancer(o)) return false
      return true
    })
  }, [organisations, recherche, filtreStatut, filtreForfait, filtreQuota, filtreRelance])
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
        case 'forfait':
          return rangForfait(a.forfait) - rangForfait(b.forfait)
```

par :

```tsx
        case 'forfait':
          return rangForfait(a.forfait) - rangForfait(b.forfait)
        case 'echeance':
          return comparerEcheances(a, b)
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
    setFiltreQuota(false)
  }
```

par :

```tsx
    setFiltreQuota(false)
    setFiltreRelance(false)
  }
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
      await platformApi.changerForfait(org.id, forfait, accessToken)
      toast.success(t('superAdmin.toast.forfaitMisAJour'), org.nom)
```

par :

```tsx
      const { organisation } = await platformApi.changerForfait(org.id, forfait, accessToken)
      // Reprend l'état RENVOYÉ par le serveur : repasser en GRATUIT efface l'échéance et recalcule
      // l'état — la mise à jour optimiste ne touchait que `forfait` et laissait une échéance périmée.
      setOrganisations((prev) =>
        prev ? prev.map((o) => (o.id === org.id ? { ...o, ...organisation } : o)) : prev,
      )
      toast.success(t('superAdmin.toast.forfaitMisAJour'), org.nom)
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
      t('superAdmin.export.identifiant'),
      t('superAdmin.table.creeeLe'),
    ]
    const lignes = triees.map((o) => {
      const limite = limiteMembresForfait(o.forfait)
      return [
        o.nom,
        t(cleForfait(o.forfait)),
        o.nbMembres,
        limite ?? t('superAdmin.table.illimite'),
```

par :

```tsx
      t('superAdmin.export.identifiant'),
      t('superAdmin.table.creeeLe'),
      t('superAdmin.export.echeance'),
    ]
    const lignes = triees.map((o) => {
      const limite = limiteMembresForfait(o.forfaitEffectif)
      return [
        o.nom,
        t(cleForfait(o.forfait)),
        o.nbMembres,
        limite ?? t('superAdmin.table.illimite'),
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
        o.id,
        formatDate(o.createdAt, DATE_LONGUE),
      ]
```

par :

```tsx
        o.id,
        formatDate(o.createdAt, DATE_LONGUE),
        o.forfaitExpireLe ? formatDate(o.forfaitExpireLe, DATE_LONGUE) : '—',
      ]
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
          onChange={(f) => changerForfait(o, f)}
          t={t}
        />
      ),
    },
    {
      key: 'membres',
```

par :

```tsx
          onChange={(f) => changerForfait(o, f)}
          t={t}
        />
      ),
    },
    {
      key: 'echeance',
      header: t('superAdmin.table.echeance'),
      width: '10rem',
      sortable: true,
      cell: (o) => <BadgeEcheance etat={o.etatForfait} joursRestants={o.joursRestants} expireLe={o.forfaitExpireLe} />,
    },
    {
      key: 'membres',
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
      cell: (o) => {
        const max = limiteMembresForfait(o.forfait)
```

par :

```tsx
      cell: (o) => {
        const max = limiteMembresForfait(o.forfaitEffectif)
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
        {/* Répartition des forfaits — barre empilée + légende chiffrée. */}
```

par :

```tsx
        {/* À relancer (spec 1.1 §4.2) : bande pleine largeur, affichée SEULEMENT s'il y a des espaces
            concernés — une tuile permanente à zéro serait du bruit. Cliquable : bascule le filtre. */}
        {!loading && !error && kpis.aRelancer > 0 && (
          <StatCard
            icon={BellRing}
            tone="amber"
            label={t('superAdmin.kpi.aRelancer')}
            value={String(kpis.aRelancer)}
            hint={t('superAdmin.kpi.aRelancerFiltre')}
            onClick={() => setFiltreRelance((v) => !v)}
            className={cn('nk-reveal nk-d1 mt-4', filtreRelance && 'ring-2 ring-brass/50')}
          />
        )}

        {/* Répartition des forfaits — barre empilée + légende chiffrée. */}
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
                {t('superAdmin.filtres.quotaActif')}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
```

par :

```tsx
                {t('superAdmin.filtres.quotaActif')}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            {filtreRelance && (
              <button
                type="button"
                onClick={() => setFiltreRelance(false)}
                aria-label={t('superAdmin.filtres.relanceRetirer')}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber/40 bg-amber/[0.08] px-3 py-1.5 text-xs font-medium text-amber transition-colors hover:bg-amber/[0.14] focus:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
              >
                {t('superAdmin.filtres.relanceActif')}
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
                <QuotaMembres
                  n={detailOrg.nbMembres}
                  max={limiteMembresForfait(detailOrg.forfait)}
                  illimiteLabel={t('superAdmin.table.illimite')}
                  ariaLabel={t('superAdmin.table.quotaAria', {
                    n: detailOrg.nbMembres,
                    max: limiteMembresForfait(detailOrg.forfait) ?? t('superAdmin.table.illimite'),
                  })}
                />
```

par :

```tsx
                <QuotaMembres
                  n={detailOrg.nbMembres}
                  max={limiteMembresForfait(detailOrg.forfaitEffectif)}
                  illimiteLabel={t('superAdmin.table.illimite')}
                  ariaLabel={t('superAdmin.table.quotaAria', {
                    n: detailOrg.nbMembres,
                    max: limiteMembresForfait(detailOrg.forfaitEffectif) ?? t('superAdmin.table.illimite'),
                  })}
                />
```

Contrôle : `grep -c "limiteMembresForfait(o.forfait)\|limiteMembresForfait(detailOrg.forfait)" frontend/src/pages/SuperAdminPage.tsx`
doit renvoyer **0** (toutes les lectures de plafond passent par le forfait effectif).

- [ ] **Step 5 : Vérifier**

Run : `cd frontend && npm run build && npm run lint && npm run test`
Expected : build sans erreur ; lint sans finding ; tous les tests passent.

- [ ] **Step 6 : Commit**

```bash
git add frontend/src/lib/echeance-forfait.ts frontend/src/lib/echeance-forfait.test.ts frontend/src/components/plateforme/BadgeEcheance.tsx frontend/src/components/plateforme/BadgeEcheance.test.tsx frontend/src/pages/SuperAdminPage.tsx frontend/src/locales/fr/common.ts frontend/src/locales/en/common.ts frontend/src/locales/fr/superAdmin.ts frontend/src/locales/en/superAdmin.ts
git commit -m "feat(console): colonne echeance et filtre « a relancer »

Badge d'echeance (valeurs du serveur), bande « a relancer » affichee seulement
s'il y a des espaces concernes, quota lu sur le forfait effectif, etat renvoye
par le serveur repris apres changement de forfait, echeance dans l'export CSV.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8 : Console — prolongation dans la fiche d'organisation

**Files :**
- Create : `frontend/src/components/plateforme/ProlongationForfait.tsx` (+ `.test.tsx`)
- Modify : `frontend/src/pages/SuperAdminPage.tsx`, `frontend/src/locales/{fr,en}/superAdmin.ts`

**Interfaces :**
- Consumes (Task 6) : `platformApi.prolongerForfait`, `ApercuProlongation`, `PERIODES_PROLONGATION` ; (Task 7) `BadgeEcheance`.
- Produces : composant `ProlongationForfait({ org, accessToken, onProlonge })`.

- [ ] **Step 1 : Écrire le test (en échec)**

Créer `frontend/src/components/plateforme/ProlongationForfait.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { PlatformOrganisation } from '@/lib/api'
import { ProlongationForfait } from './ProlongationForfait'

const prolongerForfait = vi.fn()
vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {},
  platformApi: { prolongerForfait: (...a: unknown[]) => prolongerForfait(...a) },
}))
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
// t → « clé » ou « clé|{options JSON} » : on vérifie les clés et les paramètres, pas la traduction.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (cle: string, o?: object) => (o ? `${cle}|${JSON.stringify(o)}` : cle),
    i18n: { language: 'fr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

afterEach(cleanup)
beforeEach(() => {
  prolongerForfait.mockReset()
  prolongerForfait.mockImplementation(async (_id: string, mois: number, apercu: boolean) => ({
    organisation: { ...ORG_PRO, forfaitExpireLe: '2027-09-13T22:59:59.999Z' },
    echeanceActuelle: null,
    nouvelleEcheance: `2027-0${Math.min(mois, 9)}-13T22:59:59.999Z`,
    etatApres: 'ACTIF',
    joursRestantsApres: 365,
    apercu,
  }))
})

const ORG_PRO: PlatformOrganisation = {
  id: 'org-1',
  nom: 'Les Bâtisseurs',
  devise: 'FCFA',
  langueDefaut: 'FR',
  actif: true,
  forfait: 'PRO',
  createdAt: '2026-01-01T00:00:00Z',
  nbMembres: 12,
  forfaitExpireLe: null,
  etatForfait: 'SANS_ECHEANCE',
  joursRestants: null,
  finGraceLe: null,
  forfaitEffectif: 'PRO',
}

describe('ProlongationForfait', () => {
  it('forfait GRATUIT : explique l’absence d’échéance, aucun appel serveur', () => {
    render(<ProlongationForfait org={{ ...ORG_PRO, forfait: 'GRATUIT' }} accessToken="jeton" onProlonge={vi.fn()} />)
    expect(screen.getByText('superAdmin.prolongation.gratuit')).toBeTruthy()
    expect(prolongerForfait).not.toHaveBeenCalled()
  })

  it('demande un APERÇU serveur (apercu = true) dès l’affichage, puis à chaque durée choisie', async () => {
    render(<ProlongationForfait org={ORG_PRO} accessToken="jeton" onProlonge={vi.fn()} />)
    await waitFor(() => expect(prolongerForfait).toHaveBeenCalledWith('org-1', 1, true, 'jeton'))
    fireEvent.click(screen.getByLabelText('superAdmin.prolongation.mois|{"count":12}'))
    await waitFor(() => expect(prolongerForfait).toHaveBeenCalledWith('org-1', 12, true, 'jeton'))
  })

  it('le bouton reste inactif tant que l’aperçu n’est pas arrivé', () => {
    prolongerForfait.mockImplementation(() => new Promise(() => {}))
    render(<ProlongationForfait org={ORG_PRO} accessToken="jeton" onProlonge={vi.fn()} />)
    const bouton = screen.getByRole('button') as HTMLButtonElement
    expect(bouton.disabled).toBe(true)
  })

  it('prolonger : écrit (apercu = false) et remonte la vue renvoyée par le serveur', async () => {
    const onProlonge = vi.fn()
    render(<ProlongationForfait org={ORG_PRO} accessToken="jeton" onProlonge={onProlonge} />)
    const bouton = (await screen.findByRole('button')) as HTMLButtonElement
    await waitFor(() => expect(bouton.disabled).toBe(false))
    fireEvent.click(bouton)
    await waitFor(() => expect(prolongerForfait).toHaveBeenCalledWith('org-1', 1, false, 'jeton'))
    await waitFor(() =>
      expect(onProlonge).toHaveBeenCalledWith(expect.objectContaining({ id: 'org-1', forfaitExpireLe: '2027-09-13T22:59:59.999Z' })),
    )
  })
})
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `cd frontend && npx vitest --run src/components/plateforme/ProlongationForfait.test.tsx`
Expected : **FAIL** (module introuvable).

- [ ] **Step 3 : Implémenter le composant**

Créer `frontend/src/components/plateforme/ProlongationForfait.tsx` :

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ApiError, platformApi, type ApercuProlongation, type PlatformOrganisation } from '@/lib/api'
import { PERIODES_PROLONGATION, type PeriodeProlongation } from '@/lib/forfait'
import { cn, formatDate } from '@/lib/utils'
import { BadgeEcheance } from './BadgeEcheance'

interface Props {
  org: PlatformOrganisation
  accessToken: string
  /** Reçoit la vue d'organisation renvoyée par le serveur après une prolongation réussie. */
  onProlonge: (organisation: ApercuProlongation['organisation']) => void
}

/**
 * Prolongation de l'échéance du forfait, intégrée à la fiche d'organisation (spec 1.1 §4.2). La fiche
 * étant déjà une `Modal`, pas de seconde modale : deux pièges de focus ne s'empilent pas. La nouvelle
 * date affichée vient d'un APERÇU SERVEUR (même fonction que l'écriture) : jamais d'écart entre ce qui
 * est annoncé et ce qui est écrit.
 */
export function ProlongationForfait({ org, accessToken, onProlonge }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const [mois, setMois] = useState<PeriodeProlongation>(1)
  const [apercu, setApercu] = useState<ApercuProlongation | null>(null)
  const [erreurApercu, setErreurApercu] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const gratuit = org.forfait === 'GRATUIT'

  // Aperçu à chaque durée choisie, et après prolongation (l'échéance a changé → nouvel aperçu).
  useEffect(() => {
    if (gratuit) return
    let actif = true
    setApercu(null)
    setErreurApercu(null)
    platformApi
      .prolongerForfait(org.id, mois, true, accessToken)
      .then((r) => {
        if (actif) setApercu(r)
      })
      .catch((err: unknown) => {
        if (actif) setErreurApercu(err instanceof ApiError ? err.message : t('superAdmin.toast.reessayer'))
      })
    return () => {
      actif = false
    }
  }, [org.id, org.forfaitExpireLe, mois, gratuit, accessToken, t])

  const prolonger = async () => {
    setEnCours(true)
    try {
      const r = await platformApi.prolongerForfait(org.id, mois, false, accessToken)
      onProlonge(r.organisation)
      toast.success(t('superAdmin.prolongation.succes'), formatDate(r.nouvelleEcheance))
    } catch (err) {
      toast.error(
        t('superAdmin.prolongation.echec'),
        err instanceof ApiError ? err.message : t('superAdmin.toast.reessayer'),
      )
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="rounded-xl border border-hairline p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-2xs font-medium uppercase tracking-[0.12em] text-faint">
          {t('superAdmin.prolongation.titre')}
        </span>
        <BadgeEcheance etat={org.etatForfait} joursRestants={org.joursRestants} expireLe={org.forfaitExpireLe} />
      </div>

      {gratuit ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('superAdmin.prolongation.gratuit')}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <fieldset>
            <legend className="text-sm text-muted-foreground">{t('superAdmin.prolongation.duree')}</legend>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {PERIODES_PROLONGATION.map((p) => (
                <label
                  key={p}
                  className={cn(
                    'flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brass/60',
                    mois === p
                      ? 'border-brass/60 bg-brass/10 text-foreground'
                      : 'border-hairline text-muted-foreground hover:bg-surface-2',
                  )}
                >
                  <input
                    type="radio"
                    name={`prolongation-${org.id}`}
                    value={p}
                    checked={mois === p}
                    onChange={() => setMois(p)}
                    className="sr-only"
                  />
                  {t('superAdmin.prolongation.mois', { count: p })}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {erreurApercu ??
              (apercu
                ? t('superAdmin.prolongation.apercu', { date: formatDate(apercu.nouvelleEcheance) })
                : t('superAdmin.prolongation.calcul'))}
          </p>
          <div className="flex justify-end">
            <Button icon={CalendarClock} loading={enCours} disabled={apercu === null} onClick={prolonger}>
              {t('superAdmin.prolongation.bouton', { count: mois })}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
```

Run : `cd frontend && npx vitest --run src/components/plateforme/ProlongationForfait.test.tsx`
Expected : **PASS**, 4 tests.

- [ ] **Step 4 : Brancher dans la fiche et ajouter les libellés**

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
import { BadgeEcheance } from '@/components/plateforme/BadgeEcheance'
```

par :

```tsx
import { BadgeEcheance } from '@/components/plateforme/BadgeEcheance'
import { ProlongationForfait } from '@/components/plateforme/ProlongationForfait'
```

Dans `frontend/src/pages/SuperAdminPage.tsx`, remplacer :

```tsx
                    max: limiteMembresForfait(detailOrg.forfaitEffectif) ?? t('superAdmin.table.illimite'),
                  })}
                />
              </div>
            </div>
```

par :

```tsx
                    max: limiteMembresForfait(detailOrg.forfaitEffectif) ?? t('superAdmin.table.illimite'),
                  })}
                />
              </div>
            </div>

            {/* Échéance + prolongation (spec 1.1 §4.2) — dans la fiche, pas dans une seconde modale. */}
            {accessToken && (
              <ProlongationForfait
                org={detailOrg}
                accessToken={accessToken}
                onProlonge={(organisation) =>
                  setOrganisations((prev) =>
                    prev ? prev.map((o) => (o.id === organisation.id ? { ...o, ...organisation } : o)) : prev,
                  )
                }
              />
            )}
```

Dans `frontend/src/locales/fr/superAdmin.ts`, remplacer :

```ts
    detail: {
      forfait: 'Forfait',
      fermer: 'Fermer',
    },
```

par :

```ts
    detail: {
      forfait: 'Forfait',
      fermer: 'Fermer',
    },
    prolongation: {
      titre: 'Échéance',
      gratuit: 'Le forfait Gratuit n’a pas d’échéance.',
      duree: 'Prolonger de',
      mois_one: '{{count}} mois',
      mois_other: '{{count}} mois',
      calcul: 'Calcul de la nouvelle échéance…',
      apercu: 'Nouvelle échéance : {{date}}',
      bouton_one: 'Prolonger de {{count}} mois',
      bouton_other: 'Prolonger de {{count}} mois',
      succes: 'Forfait prolongé',
      echec: 'Prolongation impossible',
    },
```

Dans `frontend/src/locales/en/superAdmin.ts`, remplacer :

```ts
    detail: {
      forfait: 'Plan',
      fermer: 'Close',
    },
```

par :

```ts
    detail: {
      forfait: 'Plan',
      fermer: 'Close',
    },
    prolongation: {
      titre: 'End date',
      gratuit: 'The Free plan has no end date.',
      duree: 'Extend by',
      mois_one: '{{count}} month',
      mois_other: '{{count}} months',
      calcul: 'Computing the new end date…',
      apercu: 'New end date: {{date}}',
      bouton_one: 'Extend by {{count}} month',
      bouton_other: 'Extend by {{count}} months',
      succes: 'Plan extended',
      echec: 'Could not extend the plan',
    },
```

- [ ] **Step 5 : Vérifier**

Run : `cd frontend && npm run build && npm run lint && npm run test`
Expected : build sans erreur ; lint sans finding ; tous les tests passent.

- [ ] **Step 6 : Commit**

```bash
git add frontend/src/components/plateforme/ProlongationForfait.tsx frontend/src/components/plateforme/ProlongationForfait.test.tsx frontend/src/pages/SuperAdminPage.tsx frontend/src/locales/fr/superAdmin.ts frontend/src/locales/en/superAdmin.ts
git commit -m "feat(console): prolonger le forfait depuis la fiche d'organisation

Choix 1/3/6/12 mois, apercu SERVEUR de la nouvelle echeance avant confirmation,
bouton inactif tant que l'apercu n'est pas arrive. Integre a la fiche (deja une
modale) plutot qu'une seconde modale.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9 : Paramètres — échéance et renouvellement ; aperçu d'import en Pro

**Files :**
- Create : `frontend/src/components/EcheanceForfaitOrganisation.tsx` (+ `.test.tsx`)
- Modify : `frontend/src/pages/ParametresPage.tsx`, `frontend/src/pages/ImportMembresPage.tsx`
- Modify : `frontend/src/locales/{fr,en}/parametres.ts`, `frontend/src/locales/{fr,en}/import.ts`

**Interfaces :**
- Consumes (Task 6) : `OrganisationCourante` (champs d'échéance) ; (Task 7) `BadgeEcheance` ; `CONTACT_EMAIL`
  (`frontend/src/lib/contact.ts`, existant).
- Produces : composant `EcheanceForfaitOrganisation({ org })`.

- [ ] **Step 1 : Écrire le test (en échec)**

Créer `frontend/src/components/EcheanceForfaitOrganisation.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { OrganisationCourante } from '@/lib/api'
import { EcheanceForfaitOrganisation } from './EcheanceForfaitOrganisation'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

afterEach(cleanup)

const BASE: OrganisationCourante = {
  id: 'org-1',
  nom: 'Les Bâtisseurs',
  devise: 'FCFA',
  langueDefaut: 'FR',
  forfait: 'PRO',
  createdAt: '2026-01-01T00:00:00Z',
  nbMembres: 12,
  limiteMembres: null,
  chefMembreId: null,
  chefSurnom: null,
  chefNom: null,
  chefPrenom: null,
  forfaitExpireLe: '2026-10-13T22:59:59.999Z',
  etatForfait: 'ACTIF',
  joursRestants: 60,
  finGraceLe: '2026-10-27T22:59:59.999Z',
  forfaitEffectif: 'PRO',
}

describe('EcheanceForfaitOrganisation', () => {
  it('sans échéance : rien n’est affiché', () => {
    const { container } = render(
      <EcheanceForfaitOrganisation org={{ ...BASE, etatForfait: 'SANS_ECHEANCE', forfaitExpireLe: null }} />,
    )
    expect(container.innerHTML).toBe('')
  })

  it('actif : la date de validité, sans appel au renouvellement', () => {
    render(<EcheanceForfaitOrganisation org={BASE} />)
    expect(screen.getByText('parametres.forfait.valableJusquau')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it.each(['GRACE', 'EXPIRE'] as const)('%s : l’échéance est dite PASSÉE, jamais « valable jusqu’au »', (etat) => {
    render(<EcheanceForfaitOrganisation org={{ ...BASE, etatForfait: etat }} />)
    expect(screen.getByText('parametres.forfait.echuLe')).toBeTruthy()
    expect(screen.queryByText('parametres.forfait.valableJusquau')).toBeNull()
  })

  it.each(['ECHEANCE_PROCHE', 'GRACE', 'EXPIRE'] as const)('%s : explication + lien de renouvellement vers le contact', (etat) => {
    render(<EcheanceForfaitOrganisation org={{ ...BASE, etatForfait: etat }} />)
    expect(screen.getByText(`parametres.forfait.explication.${etat}`)).toBeTruthy()
    const lien = screen.getByRole('link')
    expect(lien.getAttribute('href')).toMatch(/^mailto:romel\.djoumessi@gmail\.com\?subject=/)
  })
})
```

- [ ] **Step 2 : Vérifier l'échec**

Run : `cd frontend && npx vitest --run src/components/EcheanceForfaitOrganisation.test.tsx`
Expected : **FAIL** (module introuvable).

- [ ] **Step 3 : Implémenter le composant**

Créer `frontend/src/components/EcheanceForfaitOrganisation.tsx` :

```tsx
import { useTranslation } from 'react-i18next'
import { Mail } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { BadgeEcheance } from '@/components/plateforme/BadgeEcheance'
import type { OrganisationCourante } from '@/lib/api'
import { CONTACT_EMAIL } from '@/lib/contact'
import { cleI18n } from '@/lib/i18n'
import { formatDate } from '@/lib/utils'

/**
 * Échéance du forfait de l'organisation courante (spec 1.1 §4.3) — affichage seul, valeurs calculées
 * par le serveur. Rien sans échéance. Hors période « actif », explication + contact de renouvellement
 * (vente assistée : pas de paiement dans l'application).
 */
export function EcheanceForfaitOrganisation({ org }: { org: OrganisationCourante }) {
  const { t } = useTranslation()
  if (org.etatForfait === 'SANS_ECHEANCE' || org.forfaitExpireLe === null) return null

  const forfait = t(cleI18n(`commun.forfaits.${org.forfait}`))
  const date = formatDate(org.forfaitExpireLe)
  const sujet = t('parametres.forfait.sujetRenouvellement', { nom: org.nom })
  // Échéance PASSÉE (grâce ou expiré) : « valable jusqu'au <date passée> » serait faux.
  const echu = org.etatForfait === 'GRACE' || org.etatForfait === 'EXPIRE'

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-hairline p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground">
          {t(echu ? 'parametres.forfait.echuLe' : 'parametres.forfait.valableJusquau', { forfait, date })}
        </p>
        <BadgeEcheance etat={org.etatForfait} joursRestants={org.joursRestants} expireLe={org.forfaitExpireLe} masquerDate />
      </div>
      {org.etatForfait !== 'ACTIF' && (
        <>
          <p className="text-sm text-muted-foreground">
            {t(cleI18n(`parametres.forfait.explication.${org.etatForfait}`), {
              forfait,
              date,
              fin: formatDate(org.finGraceLe),
            })}
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(sujet)}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {t('parametres.forfait.renouveler')}
          </a>
        </>
      )}
    </div>
  )
}
```

Run : `cd frontend && npx vitest --run src/components/EcheanceForfaitOrganisation.test.tsx`
Expected : **PASS**, 7 tests.

- [ ] **Step 4 : Brancher Paramètres, corriger l'aperçu d'import, libellés**

Dans `frontend/src/pages/ParametresPage.tsx`, remplacer :

```tsx
import { ConfigPaiement } from '@/components/ConfigPaiement'
```

par :

```tsx
import { ConfigPaiement } from '@/components/ConfigPaiement'
import { EcheanceForfaitOrganisation } from '@/components/EcheanceForfaitOrganisation'
```

Dans `frontend/src/pages/ParametresPage.tsx`, remplacer :

```tsx
                {t(cleI18n(`commun.forfaits.${org.forfait}`))}
              </span>
            </div>

```

par :

```tsx
                {t(cleI18n(`commun.forfaits.${org.forfait}`))}
              </span>
            </div>

            <EcheanceForfaitOrganisation org={org} />

```

Dans `frontend/src/pages/ImportMembresPage.tsx`, remplacer :

```tsx
            {rapport.quota.depasse
              ? t('import.apercu.quotaDepasse', rapport.quota)
              : t('import.apercu.quotaOk', rapport.quota)}
```

par :

```tsx
            {rapport.quota.depasse
              ? t('import.apercu.quotaDepasse', rapport.quota)
              : rapport.quota.plafond === null
                ? t('import.apercu.quotaIllimite', rapport.quota)
                : t('import.apercu.quotaOk', rapport.quota)}
```

Dans `frontend/src/locales/fr/import.ts`, remplacer :

```ts
      quotaOk: 'Quota : {{actuel}} + {{aCreer}} / {{plafond}} membres actifs',
```

par :

```ts
      quotaOk: 'Quota : {{actuel}} + {{aCreer}} / {{plafond}} membres actifs',
      quotaIllimite: 'Quota : {{actuel}} + {{aCreer}} membres actifs (forfait sans plafond)',
```

Dans `frontend/src/locales/en/import.ts`, remplacer :

```ts
      quotaOk: 'Quota: {{actuel}} + {{aCreer}} / {{plafond}} active members',
```

par :

```ts
      quotaOk: 'Quota: {{actuel}} + {{aCreer}} / {{plafond}} active members',
      quotaIllimite: 'Quota: {{actuel}} + {{aCreer}} active members (no limit on this plan)',
```

Dans `frontend/src/locales/fr/parametres.ts`, remplacer :

```ts
      limiteAtteinte: 'Limite du forfait atteinte',
    },
```

par :

```ts
      limiteAtteinte: 'Limite du forfait atteinte',
    },
    forfait: {
      valableJusquau: 'Forfait {{forfait}} valable jusqu’au {{date}}',
      echuLe: 'Forfait {{forfait}} arrivé à échéance le {{date}}',
      renouveler: 'Nous contacter pour renouveler',
      sujetRenouvellement: 'NKONI — renouvellement du forfait de {{nom}}',
      explication: {
        ECHEANCE_PROCHE: 'Votre forfait {{forfait}} arrive à échéance le {{date}}. Contactez-nous pour le renouveler sans interruption.',
        GRACE: 'Votre forfait {{forfait}} a expiré le {{date}}. Ses fonctionnalités restent actives jusqu’au {{fin}} : renouvelez-le d’ici là.',
        EXPIRE: 'Votre forfait {{forfait}} a expiré le {{date}} : ses fonctionnalités sont suspendues, vos données sont intactes. Contactez-nous pour le renouveler.',
      },
    },
```

Dans `frontend/src/locales/en/parametres.ts`, remplacer :

```ts
      limiteAtteinte: 'Plan limit reached',
    },
```

par :

```ts
      limiteAtteinte: 'Plan limit reached',
    },
    forfait: {
      valableJusquau: '{{forfait}} plan valid until {{date}}',
      echuLe: '{{forfait}} plan ended on {{date}}',
      renouveler: 'Contact us to renew',
      sujetRenouvellement: 'NKONI — plan renewal for {{nom}}',
      explication: {
        ECHEANCE_PROCHE: 'Your {{forfait}} plan ends on {{date}}. Contact us to renew it without interruption.',
        GRACE: 'Your {{forfait}} plan expired on {{date}}. Its features remain active until {{fin}}: renew it before then.',
        EXPIRE: 'Your {{forfait}} plan expired on {{date}}: its features are suspended and your data is intact. Contact us to renew it.',
      },
    },
```

- [ ] **Step 5 : Vérifier**

Run : `cd frontend && npm run build && npm run lint && npm run test`
Expected : build sans erreur ; lint sans finding ; tous les tests passent.

- [ ] **Step 6 : Commit**

```bash
git add frontend/src/components/EcheanceForfaitOrganisation.tsx frontend/src/components/EcheanceForfaitOrganisation.test.tsx frontend/src/pages/ParametresPage.tsx frontend/src/pages/ImportMembresPage.tsx frontend/src/locales/fr/parametres.ts frontend/src/locales/en/parametres.ts frontend/src/locales/fr/import.ts frontend/src/locales/en/import.ts
git commit -m "feat(parametres): echeance du forfait et contact de renouvellement

Date de validite (ou « arrive a echeance » une fois passee), etat, explication
et lien de renouvellement hors periode active. Apercu d'import : plus de
plafond vide en forfait sans plafond.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 10 : Invariants dans CLAUDE.md, vérification complète et visuelle

**Files :**
- Modify : `CLAUDE.md` (section « Forfaits (SaaS §3.1) »)

**Interfaces :**
- Consumes : tout ce qui précède ; base `nkoni_it_echeance` (Task 3).
- Produces : la prose de `CLAUDE.md` décrit l'échéance et l'invariant « forfait effectif » ; preuve de
  vérification complète ; base jetable supprimée.

- [ ] **Step 1 : Documenter les invariants**

Dans `CLAUDE.md`, remplacer (1 occurrence, vérifier avec `grep -cF`) :

```
en lisant le forfait et en n'appliquant le plafond QUE si non `null`
```

par :

```
en lisant le forfait **EFFECTIF** (cf. « Échéance » ci-dessous) et en n'appliquant le plafond QUE si non `null`
```

Puis remplacer (1 occurrence) :

```
console super-admin = sélecteur de forfait par org (MAJ optimiste).
```

par :

```
console super-admin = sélecteur de forfait par org (MAJ optimiste, puis état RENVOYÉ par le serveur repris : repasser en GRATUIT efface l'échéance). **Échéance (spec 1.1, étape 2)** — `Organisation.forfaitExpireLe` (NULL = sans échéance ; les Pro historiques restent NULL, aucune rétrogradation au déploiement). L'état (`etatForfait` : `ACTIF` / `ECHEANCE_PROCHE` ≤ 30 j / `GRACE` 14 j / `EXPIRE`) et le **forfait EFFECTIF** (GRATUIT une fois la grâce écoulée) sont **CALCULÉS** en jours CALENDAIRES Africa/Douala par `lib/forfait.ts` (horloge injectée), **jamais stockés ni rétrogradés par une tâche de nuit** — qui prolongerait l'accès en silence si elle échouait. **Tout contrôle de capacité lit le forfait effectif, jamais `Organisation.forfait` brut**, et son `select` doit inclure `forfaitExpireLe` : un mock ne verrait pas l'oubli (couvert en intégration, `membres-quota.integration.test.ts`). Le front **affiche** les valeurs calculées (`etatForfait`, `joursRestants`, `finGraceLe`, `forfaitEffectif`) sans les recalculer — aucun miroir de logique. Prolongation = `POST /platform/organisations/:id/forfait/prolonger` : `apercu` calculé par la MÊME fonction que l'écriture, écriture CONDITIONNELLE sur l'ancienne échéance (409 si concurrente), 409 sur GRATUIT, trace `PROLONGER_FORFAIT`.
```

- [ ] **Step 2 : Vérification complète backend** (intégrations comprises, sur la base migrée)

```bash
cd backend
npm run build
npm run test -- --run --exclude '**/*.integration.test.ts'
DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_echeance?sslmode=disable" npx vitest --run tests/*.integration.test.ts
```

Expected : build sans erreur ; tous les tests unitaires passent ; **tous** les fichiers d'intégration passent
(la CI les exécute aussi : l'export et la purge lisent `Organisation`).

- [ ] **Step 3 : Vérification complète frontend**

Run : `cd frontend && npm run build && npm run lint && npm run test`
Expected : build sans erreur ; lint sans aucune ligne de finding ; tous les tests passent.

- [ ] **Step 4 : Vérification VISUELLE aux largeurs réelles** (CLAUDE.md : `tsc`/`oxlint` ne voient pas la mise en page)

Prérequis : `scripts/demo-video/node_modules` installé (`cd scripts/demo-video && npm install`).

1. Démarrer le backend sur la base jetable et le frontend (ports libres 3100 et 5310) :

```bash
PORT=3100 DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_echeance?sslmode=disable" \
  JWT_ACCESS_SECRET=verif-access-local JWT_REFRESH_SECRET=verif-refresh-local \
  CORS_ORIGIN=http://localhost:5310 NODE_ENV=development npx --prefix backend tsx backend/src/app.ts
VITE_API_URL=http://localhost:3100 npm run dev --prefix frontend -- --port 5310 --strictPort
```

2. Données FICTIVES : une association (seed de la vidéo de démo), passée en Pro EN GRÂCE ; trois organisations
   aux autres états ; un compte super-admin local.

```bash
API=http://localhost:3100 node scripts/demo-video/seed.mjs
PG=/opt/homebrew/opt/postgresql@18/bin
DB="postgresql://$(id -un)@localhost:5432/nkoni_it_echeance?sslmode=disable"
$PG/psql "$DB" -q <<'SQL'
UPDATE "Organisation" SET forfait='PRO', "forfaitExpireLe" = date_trunc('day', now() AT TIME ZONE 'Africa/Douala') - interval '3 days' + interval '22 hours 59 minutes 59.999 seconds' WHERE nom='Association Les Bâtisseurs';
INSERT INTO "Organisation"(id, nom, devise, forfait, "forfaitExpireLe") VALUES
 (gen_random_uuid(), 'Amicale Kamga', 'FCFA', 'PRO', now() + interval '12 days'),
 (gen_random_uuid(), 'Tontine Bonapriso', 'FCFA', 'ENTREPRISE', now() + interval '200 days'),
 (gen_random_uuid(), 'Famille Essomba', 'EUR', 'PRO', now() - interval '40 days');
SQL
(cd backend && DATABASE_URL="$DB" SUPERADMIN_EMAIL=plateforme@verif.local SUPERADMIN_PASSWORD='Verif-Plan-2026!' npm run seed:superadmin)
```

3. Enregistrer ce script dans un fichier temporaire (hors dépôt), par exemple `/tmp/verif-echeance.mjs`, puis
   `node /tmp/verif-echeance.mjs /tmp/verif-echeance` (le dossier doit exister) :

```js
import { chromium } from '/Users/nelson/Documents/Projets/nkoni/scripts/demo-video/node_modules/playwright-core/index.mjs'
const OUT = process.argv[2]
const FRONT = 'http://localhost:5310'
const b = await chromium.launch({ args: ['--enable-gpu', '--use-angle=metal'] })
async function session(email, password, viewport) {
  const p = await b.newPage({ viewport, deviceScaleFactor: 1, locale: 'fr-FR', timezoneId: 'Africa/Douala', colorScheme: 'dark' })
  await p.goto(`${FRONT}/login`)
  await p.fill('input[type=email]', email); await p.fill('input[type=password]', password)
  await p.click('button[type=submit]')
  return p
}
const erreurs = []
// Console super-admin, bureau
let p = await session('plateforme@verif.local', 'Verif-Plan-2026!', { width: 1280, height: 900 })
p.on('pageerror', (e) => erreurs.push('page: ' + e.message))
await p.waitForURL('**/super-admin'); await p.getByText('Amicale Kamga').first().waitFor(); await p.waitForTimeout(1200)
await p.screenshot({ path: `${OUT}/console-1280.png`, fullPage: true })
const debordeBureau = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth)
// filtre « à relancer »
const bande = p.getByText('À relancer', { exact: true }).first()
const bandePresente = await bande.count()
if (bandePresente) { await bande.click(); await p.waitForTimeout(500) }
const lignesFiltrees = await p.locator('tbody tr').count()
await p.screenshot({ path: `${OUT}/console-filtre-1280.png`, fullPage: false })
// fiche Bâtisseurs + prolongation
await p.getByRole('button', { name: /Voir le détail de Association Les Bâtisseurs/ }).click()
await p.getByText(/^Nouvelle échéance :/).first().waitFor({ timeout: 8000 })
await p.screenshot({ path: `${OUT}/fiche-prolongation-1280.png` })
const apercu = await p.getByText(/^Nouvelle échéance :/).first().textContent()
// Mobile
const m = await session('plateforme@verif.local', 'Verif-Plan-2026!', { width: 390, height: 844 })
await m.waitForURL('**/super-admin'); await m.getByText('Amicale Kamga').first().waitFor(); await m.waitForTimeout(1200)
await m.screenshot({ path: `${OUT}/console-390.png`, fullPage: true })
const debordeMobile = await m.evaluate(() => document.documentElement.scrollWidth > innerWidth)
// Paramètres (trésorière ADMIN de l'org en grâce)
const s = await session('tresoriere@batisseurs.demo', 'Demo-Nkoni-2026!', { width: 390, height: 844 })
await s.waitForURL('**/dashboard'); await s.evaluate(() => { history.pushState({}, '', '/parametres'); dispatchEvent(new PopStateEvent('popstate')) })
await s.getByText('arrivé à échéance le', { exact: false }).first().waitFor({ timeout: 8000 })
await s.getByText('arrivé à échéance le', { exact: false }).first().scrollIntoViewIfNeeded()
await s.waitForTimeout(600)
await s.screenshot({ path: `${OUT}/parametres-390.png` })
const debordeParam = await s.evaluate(() => document.documentElement.scrollWidth > innerWidth)
console.log(JSON.stringify({ debordeBureau, bandePresente, lignesFiltrees, apercu, debordeMobile, debordeParam, erreurs }))
await b.close()
```

Expected (sortie JSON du script) : `debordeBureau: false`, `debordeMobile: false`, `debordeParam: false` ;
`bandePresente: 1` ; `lignesFiltrees: 3` (Amicale Kamga en échéance proche, Les Bâtisseurs en grâce, Famille
Essomba expirée) ; `apercu` = « Nouvelle échéance : <échéance des Bâtisseurs + 1 mois> » (base = ancienne
échéance, la grâce n'est pas offerte) ; `erreurs: []`. Ouvrir les captures du dossier de sortie et vérifier :
bande « À relancer » sous les indicateurs, bloc Échéance lisible dans la fiche, carte Paramètres disant
« arrivé à échéance le … » (jamais « valable jusqu'au » une date passée), bouton « Nous contacter pour
renouveler ».

4. Arrêter les deux serveurs.

- [ ] **Step 5 : Nettoyer**

```bash
/opt/homebrew/opt/postgresql@18/bin/dropdb --if-exists --force nkoni_it_echeance
git status --short
```

Expected : aucun fichier non suivi en dehors du dépôt normal (les captures et le script de vérification
vivent hors du dépôt).

- [ ] **Step 6 : Commit**

```bash
git add CLAUDE.md
git commit -m "docs(forfaits): invariants de l'echeance dans CLAUDE.md

Forfait effectif calcule en jours calendaires Douala, jamais stocke ni
retrograde par une tache de nuit ; tout controle de capacite lit le forfait
effectif (select avec forfaitExpireLe, prouve en integration) ; prolongation
avec apercu serveur et ecriture conditionnelle.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
