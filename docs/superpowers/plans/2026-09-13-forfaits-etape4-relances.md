# Forfaits — étape 4 « Relances et bandeau » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prévenir le bureau (ADMIN/PRESIDENT) de l'échéance du forfait — notification + push + e-mail la nuit à J-30, J-7, J-1 et à l'entrée en grâce, et bandeau dans l'application.

**Architecture:** Une fonction PURE `etapeRelanceForfait` (lib/forfait.ts) dit quelle étape est atteinte ; un service `forfait-relances.service.ts` crée, org par org sous `orgContext.run`, une notification `FORFAIT_ECHEANCE` dédoublonnée par `entiteId = <org>#<échéance ISO>#<étape>` et collecte push + e-mails, livrés APRÈS le commit par la tâche de nuit existante (même verrou consultatif). Côté front, une règle PURE `bandeauForfait` (lib/bandeau-forfait.ts) décide du bandeau à partir des valeurs CALCULÉES par le serveur (`GET /organisations/moi`), rendu par `BandeauForfait` en tête de `#contenu-principal`.

**Tech Stack:** Backend Node 20 + Fastify 5 + Prisma 7 + Vitest ; frontend Vite + React + react-i18next + Tailwind v4 + Vitest (jsdom par fichier).

**Spec:** `docs/superpowers/specs/2026-09-12-forfaits-echeance-design.md` — §4.1 (relances), §4.4 (bandeau), §5 (tests), §6 étape 4.

## Global Constraints

- Français partout : noms métier, commentaires, messages, commits. Branche `feat/forfaits-relances`, jamais de commit sur `main`, pas de push pendant une tâche.
- Étapes de relance : `J = 30`, `J = 7`, `J = 1`, entrée en grâce (`J = -1`). **Une par nuit au plus** ; tâche manquée → seule l'étape la plus récente atteinte part (pas de rafale).
- Destinataires : comptes **ADMIN** et **PRESIDENT** de l'organisation (actifs). Jamais les autres rôles ni les membres.
- Canaux : notification `FORFAIT_ECHEANCE` + push + **e-mail** ; `envoyerMessage(email, sujet, texte)` : mockable, best-effort, **ne lève jamais**, no-op sans configuration Resend.
- Langue du destinataire (règle i18n du dépôt). Dates d'échéance formatées dans le fuseau **Africa/Douala**.
- Dédoublonnage : `Notification.entiteType = 'Organisation'`, `entiteId = '<organisationId>#<expireLe ISO>#<étape>'` ; une prolongation change `expireLe` → le cycle se réarme.
- **Non désactivable** : `FORFAIT_ECHEANCE` n'est PAS ajouté à `TYPES_NOTIFICATION` ; garde `tests/types-notification-parity.test.ts` : `TYPES_NOTIFICATION ∪ {FORFAIT_ECHEANCE}` = enum Postgres `TypeNotification`.
- Boucle org par org sous `orgContext.run` ; envois HTTP (push, e-mail) **après** le commit.
- Migration : `ADD VALUE` seul dans sa migration.
- Bandeau : visible des seuls ADMIN et PRESIDENT (miroir `peutGererForfait` dans `lib/roles.ts`) ; `ECHEANCE_PROCHE` et `J ≤ 7` → info, fermable pour la session ; `GRACE` → or (`--amber`), **non** fermable ; `EXPIRE` (forfait enregistré non GRATUIT) → neutre, fermable pour la session ; rien de J-30 à J-8. `role="status"`, jamais `alert`. Jetons du design system, aucune valeur oklch en dur. Fermeture en `sessionStorage` (accès protégé par `try/catch`).
- Le front **affiche** les valeurs calculées par le serveur, sans recalculer l'état ; dates d'échéance via `formatDateApp`.
- Tests d'intégration éventuels : base JETABLE uniquement, jamais la base de dev `nkoni`.
- Chaque garde de parité est **saboté dans la direction utile** avant d'être considéré comme vert.
- Trailer de commit : `Co-Authored-By: <modèle réel> <noreply@anthropic.com>`.

---

### Task 1 : Type de notification `FORFAIT_ECHEANCE`, non désactivable, et garde de parité

**Files:**
- Create: `backend/prisma/migrations/20260913180000_type_notification_forfait_echeance/migration.sql`
- Modify: `backend/prisma/schema.prisma` (enum `TypeNotification`)
- Modify: `backend/src/services/notification.service.ts:22-31`, `:84` (`typeActif`), `:176-180` (`estTypeActifPour`)
- Test: `backend/tests/types-notification-parity.test.ts` (create)

**Interfaces:**
- Produces:
  - `type TypeNotification = 'VERSEMENT_RECU' | 'COTISATION_RETARD' | 'REUNION_RAPPEL' | 'FORFAIT_ECHEANCE'`
  - `const TYPES_NOTIFICATION_NON_DESACTIVABLES = ['FORFAIT_ECHEANCE'] as const`
  - `type TypeNotificationDesactivable = Exclude<TypeNotification, 'FORFAIT_ECHEANCE'>`
  - `const TYPES_NOTIFICATION: TypeNotificationDesactivable[]` (inchangé : 3 types)
  - `type PreferencesNotification = Record<TypeNotificationDesactivable, boolean>`
  - `typeActif(raw, type: TypeNotificationDesactivable)`, `estTypeActifPour(prisma, id, type: TypeNotificationDesactivable)`
  - Client Prisma régénéré avec la valeur `FORFAIT_ECHEANCE`.

- [ ] **Step 1 : Écrire le garde (échoue : enum sans `FORFAIT_ECHEANCE`, constante absente)**

Créer `backend/tests/types-notification-parity.test.ts` :

```ts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TYPES_NOTIFICATION,
  TYPES_NOTIFICATION_NON_DESACTIVABLES,
} from '../src/services/notification.service'

/**
 * Garde de parité : types de notification TS ↔ enum Postgres `TypeNotification` (lu EN TEXTE dans le
 * schéma). Les préférences sont DÉRIVÉES de `TYPES_NOTIFICATION` (schéma ajv de PATCH
 * /notifications/preferences) : un type ajouté à l'enum mais oublié des deux listes serait créé sans
 * jamais être désactivable ni affiché, et un avis de service ajouté par erreur à `TYPES_NOTIFICATION`
 * deviendrait désactivable. Le garde exige que chaque valeur de l'enum soit dans EXACTEMENT une liste.
 */
const SCHEMA = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8')

function valeursEnum(nom: string): string[] {
  const m = SCHEMA.match(new RegExp(`enum ${nom} \\{([^}]*)\\}`))
  if (!m) throw new Error(`enum ${nom} introuvable dans schema.prisma`)
  return m[1]
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean)
}

describe('parité TypeNotification (TS ↔ Postgres)', () => {
  const enumPostgres = valeursEnum('TypeNotification')

  it('extraction non vacante', () => {
    expect(enumPostgres.length).toBeGreaterThan(0)
  })

  it('désactivables ∪ non désactivables = enum Postgres', () => {
    expect([...TYPES_NOTIFICATION, ...TYPES_NOTIFICATION_NON_DESACTIVABLES].sort()).toEqual(
      [...enumPostgres].sort(),
    )
  })

  it('aucun type dans les deux listes ; FORFAIT_ECHEANCE est un avis de service non désactivable', () => {
    const desactivables = new Set<string>(TYPES_NOTIFICATION)
    expect(TYPES_NOTIFICATION_NON_DESACTIVABLES.filter((t) => desactivables.has(t))).toEqual([])
    expect(TYPES_NOTIFICATION_NON_DESACTIVABLES).toContain('FORFAIT_ECHEANCE')
  })
})
```

- [ ] **Step 2 : Lancer le garde, constater l'échec**

Run : `cd backend && npm run test -- --run tests/types-notification-parity.test.ts`
Expected : FAIL (`TYPES_NOTIFICATION_NON_DESACTIVABLES` indéfini → `[...undefined]` lève, ou valeurs différentes).

- [ ] **Step 3 : Schéma + migration**

Dans `backend/prisma/schema.prisma`, remplacer :

```prisma
enum TypeNotification {
  VERSEMENT_RECU
  COTISATION_RETARD
  REUNION_RAPPEL
}
```

par :

```prisma
enum TypeNotification {
  VERSEMENT_RECU
  COTISATION_RETARD
  REUNION_RAPPEL
  FORFAIT_ECHEANCE // avis de service (spec 1.1 §4.1) — NON désactivable
}
```

Créer `backend/prisma/migrations/20260913180000_type_notification_forfait_echeance/migration.sql` :

```sql
-- Relances d'échéance du forfait (spec 1.1 §4.1) : notification FORFAIT_ECHEANCE.
-- ADD VALUE SEUL dans sa migration : une valeur d'enum Postgres ne peut pas être utilisée dans la
-- transaction qui l'ajoute (CLAUDE.md, Conventions).
ALTER TYPE "TypeNotification" ADD VALUE 'FORFAIT_ECHEANCE';
```

Run : `cd backend && npx prisma generate`
Expected : `Generated Prisma Client`.

- [ ] **Step 4 : Types côté service**

Dans `backend/src/services/notification.service.ts`, remplacer :

```ts
export type TypeNotification = 'VERSEMENT_RECU' | 'COTISATION_RETARD' | 'REUNION_RAPPEL'

/** Tous les types de notification (source unique pour les préférences). */
export const TYPES_NOTIFICATION: TypeNotification[] = [
  'VERSEMENT_RECU',
  'COTISATION_RETARD',
  'REUNION_RAPPEL',
]

/** Préférences normalisées : un booléen par type (true = activé). */
export type PreferencesNotification = Record<TypeNotification, boolean>
```

par :

```ts
export type TypeNotification =
  | 'VERSEMENT_RECU'
  | 'COTISATION_RETARD'
  | 'REUNION_RAPPEL'
  | 'FORFAIT_ECHEANCE'

/**
 * Avis de SERVICE, jamais désactivables (spec 1.1 §4.1) : l'échéance du forfait concerne la continuité
 * du service de toute l'organisation, pas une préférence de confort. Absents de `TYPES_NOTIFICATION`,
 * donc absents du schéma ajv de PATCH /notifications/preferences (une clé inconnue y est SUPPRIMÉE en
 * silence). Parité avec l'enum Postgres : `tests/types-notification-parity.test.ts`.
 */
export const TYPES_NOTIFICATION_NON_DESACTIVABLES = ['FORFAIT_ECHEANCE'] as const

/** Types que l'utilisateur peut désactiver. */
export type TypeNotificationDesactivable = Exclude<
  TypeNotification,
  (typeof TYPES_NOTIFICATION_NON_DESACTIVABLES)[number]
>

/** Types DÉSACTIVABLES (source unique pour les préférences). */
export const TYPES_NOTIFICATION: TypeNotificationDesactivable[] = [
  'VERSEMENT_RECU',
  'COTISATION_RETARD',
  'REUNION_RAPPEL',
]

/** Préférences normalisées : un booléen par type désactivable (true = activé). */
export type PreferencesNotification = Record<TypeNotificationDesactivable, boolean>
```

Remplacer :

```ts
export function typeActif(notificationsActives: unknown, type: TypeNotification): boolean {
```

par :

```ts
export function typeActif(notificationsActives: unknown, type: TypeNotificationDesactivable): boolean {
```

Remplacer :

```ts
  type: TypeNotification,
): Promise<boolean> {
```

par :

```ts
  type: TypeNotificationDesactivable,
): Promise<boolean> {
```

- [ ] **Step 5 : Vérifier le garde, puis le saboter dans la direction utile**

Run : `cd backend && npm run test -- --run tests/types-notification-parity.test.ts`
Expected : PASS (3 tests).

Sabotage (direction utile = l'enum gagne une valeur que le code ignore) : ajouter temporairement une ligne `TEST_SABOTAGE` dans l'enum `TypeNotification` de `schema.prisma`, vérifier par `grep -n TEST_SABOTAGE backend/prisma/schema.prisma` que la ligne est bien là, relancer le test → FAIL attendu sur « désactivables ∪ non désactivables = enum Postgres ». Retirer la ligne, relancer → PASS. Second sabotage : ajouter `'FORFAIT_ECHEANCE'` à `TYPES_NOTIFICATION` (et un cast `as TypeNotificationDesactivable` si tsc s'y oppose — le test ne passe pas par tsc), relancer → FAIL attendu ; retirer.

- [ ] **Step 6 : Build et suite unitaire**

Run : `cd backend && npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : build sans erreur ; tous les tests passent.

- [ ] **Step 7 : Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260913180000_type_notification_forfait_echeance backend/src/services/notification.service.ts backend/tests/types-notification-parity.test.ts
git commit -m "feat(notifications): type FORFAIT_ECHEANCE non desactivable et garde de parite

Avis de service (spec 1.1 §4.1) : absent de TYPES_NOTIFICATION, donc des
preferences. Garde : enum Postgres = desactivables ∪ non desactivables.

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 2 : Étape de relance (pure) et date d'échéance formatée à Douala

**Files:**
- Modify: `backend/src/lib/forfait.ts` (ajout en fin de fichier)
- Modify: `backend/src/lib/i18n.ts` (après `formatDateHeure`)
- Test: `backend/tests/forfait-relance-etape.test.ts` (create), `backend/tests/format-date-app.test.ts` (create)

**Interfaces:**
- Consumes : `etatForfait`, `joursRestants` (lib/forfait.ts, existants) ; `FUSEAU_APP` (lib/date-app.ts).
- Produces :
  - `type EtapeRelanceForfait = 'J30' | 'J7' | 'J1' | 'GRACE'`
  - `etapeRelanceForfait(forfait: Forfait, expireLe: Date | null, now: Date): EtapeRelanceForfait | null`
  - `formatDateApp(date: Date, langue: Langue): string` (backend `lib/i18n.ts`, date longue, fuseau Douala)

- [ ] **Step 1 : Tests (échouent : fonctions absentes)**

Créer `backend/tests/forfait-relance-etape.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import { etapeRelanceForfait } from '../src/lib/forfait'
import { finDeJourneeApp } from '../src/lib/date-app'

/** Horloge FIXE : 13 septembre 2026, 11 h à Douala ; échéances = fins de journée Douala. */
const NOW = new Date('2026-09-13T10:00:00Z')
const fin = (jour: string) => finDeJourneeApp(new Date(`${jour}T12:00:00+01:00`))

describe('etapeRelanceForfait — étape la plus récente atteinte (spec 1.1 §4.1)', () => {
  it.each([
    ['2026-10-14', 31, null],
    ['2026-10-13', 30, 'J30'],
    ['2026-09-21', 8, 'J30'],
    ['2026-09-20', 7, 'J7'],
    ['2026-09-15', 2, 'J7'],
    ['2026-09-14', 1, 'J1'],
    ['2026-09-13', 0, 'J1'],
    ['2026-09-12', -1, 'GRACE'],
    ['2026-08-30', -14, 'GRACE'],
    ['2026-08-29', -15, null],
  ] as const)('échéance %s (J = %i) → %s', (jour, _j, etape) => {
    expect(etapeRelanceForfait('PRO', fin(jour), NOW)).toBe(etape)
  })

  it('GRATUIT ou sans échéance → aucune relance', () => {
    expect(etapeRelanceForfait('GRATUIT', fin('2026-09-20'), NOW)).toBeNull()
    expect(etapeRelanceForfait('ENTREPRISE', null, NOW)).toBeNull()
  })
})
```

Créer `backend/tests/format-date-app.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatDateApp } from '../src/lib/i18n'

// Échéance = fin de journée à Douala (UTC+1) : 30/09/2026 23:59:59.999 = 22:59:59.999Z.
const FIN_30_SEPTEMBRE = new Date('2026-09-30T22:59:59.999Z')

describe('formatDateApp (backend) — date d’échéance lue à Douala', () => {
  let tzInitial: string | undefined
  beforeEach(() => {
    tzInitial = process.env.TZ
    // Process à l'EST de Douala : sans fuseau explicite, la date glisserait au 1er octobre.
    process.env.TZ = 'Asia/Tokyo'
  })
  afterEach(() => {
    process.env.TZ = tzInitial
  })

  it('FR et EN gardent le jour de Douala', () => {
    expect(formatDateApp(FIN_30_SEPTEMBRE, 'FR')).toBe('30 septembre 2026')
    expect(formatDateApp(FIN_30_SEPTEMBRE, 'EN')).toBe('September 30, 2026')
  })
})
```

- [ ] **Step 2 : Lancer, constater l'échec**

Run : `cd backend && npm run test -- --run tests/forfait-relance-etape.test.ts tests/format-date-app.test.ts`
Expected : FAIL (`etapeRelanceForfait is not a function`, `formatDateApp is not a function`).

- [ ] **Step 3 : Implémenter**

À la fin de `backend/src/lib/forfait.ts`, ajouter :

```ts

// ===========================================================================
// Relances d'échéance (spec 1.1 §4.1) — étape CALCULÉE, jamais mémorisée ailleurs que dans la clé de
// dédoublonnage des notifications.
// ===========================================================================

/** Étapes de relance : J-30, J-7, J-1, entrée en grâce. */
export type EtapeRelanceForfait = 'J30' | 'J7' | 'J1' | 'GRACE'

/**
 * Étape de relance la plus RÉCENTE atteinte, ou `null` (rien à envoyer). Renvoyer l'étape atteinte
 * plutôt que « le jour exact » rend une nuit manquée sans effet de rafale : la nuit suivante envoie
 * l'étape en cours, et seulement elle (les précédentes ne sont pas rattrapées).
 */
export function etapeRelanceForfait(
  forfait: Forfait,
  expireLe: Date | null,
  now: Date,
): EtapeRelanceForfait | null {
  const etat = etatForfait(forfait, expireLe, now)
  if (expireLe === null) return null
  if (etat === 'GRACE') return 'GRACE'
  if (etat !== 'ECHEANCE_PROCHE') return null
  const j = joursRestants(expireLe, now)
  if (j <= 1) return 'J1'
  if (j <= 7) return 'J7'
  return 'J30'
}
```

Dans `backend/src/lib/i18n.ts`, remplacer :

```ts
export function formatDateHeure(date: Date, langue: Langue): string {
  return new Intl.DateTimeFormat(LOCALE_PAR_LANGUE[langue] ?? 'fr', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date)
}
```

par :

```ts
export function formatDateHeure(date: Date, langue: Langue): string {
  return new Intl.DateTimeFormat(LOCALE_PAR_LANGUE[langue] ?? 'fr', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date)
}

/**
 * Date longue d'une ÉCHÉANCE (fin de journée à Douala) dans la langue donnée, lue dans le fuseau
 * APPLICATIF : le process tourne en UTC, où 23:59:59 à Douala tombe encore le même jour — mais pas
 * dans tous les fuseaux, et la règle ne doit pas dépendre de l'hébergeur. Miroir de `formatDateApp`
 * du front (lib/utils.ts).
 */
export function formatDateApp(date: Date, langue: Langue): string {
  return new Intl.DateTimeFormat(LOCALE_PAR_LANGUE[langue] ?? 'fr', {
    dateStyle: 'long',
    timeZone: FUSEAU_APP,
  }).format(date)
}
```

En tête de `backend/src/lib/i18n.ts`, remplacer :

```ts
import { en } from '../locales/en'
```

par :

```ts
import { en } from '../locales/en'
import { FUSEAU_APP } from './date-app'
```

(`backend/src/lib/date-app.ts` n'importe rien : pas de cycle.)

- [ ] **Step 4 : Lancer, constater le succès**

Run : `cd backend && npm run test -- --run tests/forfait-relance-etape.test.ts tests/format-date-app.test.ts`
Expected : PASS (12 + 1 tests).

Contrôle du test de fuseau (non vacant) : remplacer temporairement `timeZone: FUSEAU_APP,` par rien dans `formatDateApp`, relancer → FAIL attendu (« 1 octobre 2026 ») ; restaurer.

- [ ] **Step 5 : Build + suite**

Run : `cd backend && npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : build OK ; tous les tests passent.

- [ ] **Step 6 : Commit**

```bash
git add backend/src/lib/forfait.ts backend/src/lib/i18n.ts backend/tests/forfait-relance-etape.test.ts backend/tests/format-date-app.test.ts
git commit -m "feat(forfaits): etape de relance calculee et date d'echeance a Douala

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 3 : E-mail de message simple (`envoyerMessage`)

**Files:**
- Modify: `backend/src/services/email.service.ts` (interface `EmailClient`, `vraiEmailClient`, nouvelle fonction)
- Test: `backend/tests/email-message.test.ts` (create)

**Interfaces:**
- Produces :
  - `EmailClient.envoyerMessage(email: string, sujet: string, texte: string): Promise<{ ok: boolean }>` (ne lève pas)
  - `envoyerMessageEmail(email: EmailClient, adresse: string | null, sujet: string, texte: string): Promise<boolean>` — normalise l'adresse, vérifie la disponibilité, **ne lève jamais**, `true` si délivré.

- [ ] **Step 1 : Tests (échouent)**

Créer `backend/tests/email-message.test.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envoyerMessageEmail, vraiEmailClient } from '../src/services/email.service'

/** Message e-mail SANS pièce jointe (relances d'échéance, spec 1.1 §4.1) — best-effort, ne lève jamais. */

describe('vraiEmailClient.envoyerMessage', () => {
  const envInitial = { cle: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM }
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test'
    process.env.RESEND_FROM = 'NKONI <noreply@exemple.test>'
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (envInitial.cle === undefined) delete process.env.RESEND_API_KEY
    else process.env.RESEND_API_KEY = envInitial.cle
    if (envInitial.from === undefined) delete process.env.RESEND_FROM
    else process.env.RESEND_FROM = envInitial.from
  })

  it('POST Resend avec sujet et texte, sans pièce jointe', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const r = await vraiEmailClient.envoyerMessage('a@exemple.test', 'Sujet', 'Texte')
    expect(r).toEqual({ ok: true })
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }]
    expect(JSON.parse(init.body)).toEqual({
      from: 'NKONI <noreply@exemple.test>',
      to: ['a@exemple.test'],
      subject: 'Sujet',
      text: 'Texte',
    })
  })

  it('sans configuration → { ok: false }, aucun appel réseau', async () => {
    delete process.env.RESEND_API_KEY
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    expect(await vraiEmailClient.envoyerMessage('a@exemple.test', 'S', 'T')).toEqual({ ok: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('réseau qui lève → { ok: false }, aucune exception', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('réseau') }))
    expect(await vraiEmailClient.envoyerMessage('a@exemple.test', 'S', 'T')).toEqual({ ok: false })
  })
})

describe('envoyerMessageEmail', () => {
  const client = (ok = true, dispo = true) => ({
    disponible: () => dispo,
    envoyerDocument: vi.fn(async () => ({ ok })),
    envoyerMessage: vi.fn(async () => ({ ok })),
  })

  it('adresse normalisée transmise, true si délivré', async () => {
    const c = client()
    expect(await envoyerMessageEmail(c, '  Bureau@Exemple.TEST ', 'S', 'T')).toBe(true)
    expect(c.envoyerMessage).toHaveBeenCalledWith('bureau@exemple.test', 'S', 'T')
  })

  it('adresse absente ou invalide, ou client indisponible → false sans appel', async () => {
    const c = client()
    expect(await envoyerMessageEmail(c, null, 'S', 'T')).toBe(false)
    expect(await envoyerMessageEmail(c, 'pas-un-email', 'S', 'T')).toBe(false)
    expect(await envoyerMessageEmail(client(true, false), 'a@exemple.test', 'S', 'T')).toBe(false)
    expect(c.envoyerMessage).not.toHaveBeenCalled()
  })

  it('client qui lève → false, aucune exception', async () => {
    const c = { disponible: () => true, envoyerDocument: vi.fn(), envoyerMessage: async () => { throw new Error('x') } }
    expect(await envoyerMessageEmail(c, 'a@exemple.test', 'S', 'T')).toBe(false)
  })
})
```

- [ ] **Step 2 : Lancer, constater l'échec**

Run : `cd backend && npm run test -- --run tests/email-message.test.ts`
Expected : FAIL (`envoyerMessage` / `envoyerMessageEmail` absents).

- [ ] **Step 3 : Implémenter**

Dans `backend/src/services/email.service.ts`, remplacer :

```ts
  /** Envoie le PDF en pièce jointe à l'adresse. Renvoie `{ ok }` ; NE LÈVE PAS (best-effort géré ici). */
  envoyerDocument(email: string, pdf: Buffer, meta: EmailMeta): Promise<{ ok: boolean }>
}
```

par :

```ts
  /** Envoie le PDF en pièce jointe à l'adresse. Renvoie `{ ok }` ; NE LÈVE PAS (best-effort géré ici). */
  envoyerDocument(email: string, pdf: Buffer, meta: EmailMeta): Promise<{ ok: boolean }>
  /** Envoie un message TEXTE sans pièce jointe (relances d'échéance). Même contrat : NE LÈVE PAS. */
  envoyerMessage(email: string, sujet: string, texte: string): Promise<{ ok: boolean }>
}
```

Remplacer :

```ts
          attachments: [{ filename: meta.nomFichier, content: pdf.toString('base64') }],
        }),
      })
      return { ok: res.ok }
    } catch {
      return { ok: false }
    }
  },
}
```

par :

```ts
          attachments: [{ filename: meta.nomFichier, content: pdf.toString('base64') }],
        }),
      })
      return { ok: res.ok }
    } catch {
      return { ok: false }
    }
  },
  async envoyerMessage(email, sujet, texte) {
    const cle = process.env['RESEND_API_KEY']
    const expediteur = process.env['RESEND_FROM']
    if (!cle || !expediteur) return { ok: false }
    try {
      const res = await fetch(RESEND_API, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: expediteur, to: [email], subject: sujet, text: texte }),
      })
      return { ok: res.ok }
    } catch {
      return { ok: false }
    }
  },
}

/**
 * Envoie un message texte à une adresse — BEST-EFFORT, ne lève JAMAIS. Adresse normalisée AVANT tout
 * envoi (une adresse non retenue n'est jamais transmise). Aucune préférence lue ici : l'appelant
 * n'y recourt que pour des avis de service non désactivables (spec 1.1 §4.1).
 */
export async function envoyerMessageEmail(
  email: EmailClient,
  adresse: string | null,
  sujet: string,
  texte: string,
): Promise<boolean> {
  try {
    const normalisee = normaliserEmail(adresse)
    if (!normalisee || !email.disponible()) return false
    const res = await email.envoyerMessage(normalisee, sujet, texte)
    return res.ok
  } catch {
    return false
  }
}
```

- [ ] **Step 4 : Lancer, constater le succès**

Run : `cd backend && npm run test -- --run tests/email-message.test.ts tests/email.service.test.ts`
Expected : PASS.

- [ ] **Step 5 : Build + suite**

Run : `cd backend && npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : build OK (aucun autre implémenteur de `EmailClient` dans `src/` : `grep -rn "envoyerDocument(" backend/src` ne montre que `email.service.ts` et `whatsapp.service.ts`, qui a sa propre interface) ; tous les tests passent.

- [ ] **Step 6 : Commit**

```bash
git add backend/src/services/email.service.ts backend/tests/email-message.test.ts
git commit -m "feat(email): message texte sans piece jointe, best-effort

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 4 : Service des relances d'échéance (création dédoublonnée, org par org)

**Files:**
- Create: `backend/src/services/forfait-relances.service.ts`
- Modify: `backend/src/locales/fr/notifications.ts`, `backend/src/locales/en/notifications.ts`
- Test: `backend/tests/forfait-relances.service.test.ts` (create)

**Interfaces:**
- Consumes : `etapeRelanceForfait`, `vueEcheance`, `type EtapeRelanceForfait`, `type Forfait` (lib/forfait.ts) ; `formatDateApp`, `t`, `type Langue` (lib/i18n.ts) ; `creerNotification`, `resoudreLangueDestinataire`, `type NotificationPrisma` (notification.service.ts) ; `type PushEnAttente` (push.service.ts) ; `orgContext` (lib/org-context.ts).
- Produces :
  - `export const ROLES_RELANCE_FORFAIT = ['ADMIN', 'PRESIDENT'] as const` (lu EN TEXTE par le garde front de la Task 6 : garder exactement la forme `const ROLES_RELANCE_FORFAIT = [`)
  - `interface OrganisationRelance { id: string; forfait: Forfait; forfaitExpireLe: Date | null }`
  - `interface EmailEnAttente { email: string; sujet: string; texte: string }`
  - `interface RelancesForfaitResult { organisationId: string; etape: EtapeRelanceForfait | null; notifies: number; aPousser: PushEnAttente[]; aEnvoyer: EmailEnAttente[] }`
  - `interface RelancesForfaitPrisma` (surface mockable)
  - `cleRelanceForfait(organisationId: string, expireLe: Date, etape: EtapeRelanceForfait): string`
  - `executerRelancesForfait(prisma: RelancesForfaitPrisma, org: OrganisationRelance, now?: Date): Promise<RelancesForfaitResult>`
  - `executerRelancesForfaitToutesOrgs(prisma: RelancesForfaitPrisma, now?: Date): Promise<RelancesForfaitResult[]>`

- [ ] **Step 1 : Tests (échouent : module absent)**

Créer `backend/tests/forfait-relances.service.test.ts` :

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import {
  cleRelanceForfait,
  executerRelancesForfait,
  executerRelancesForfaitToutesOrgs,
} from '../src/services/forfait-relances.service'
import { finDeJourneeApp } from '../src/lib/date-app'
import { orgContext } from '../src/lib/org-context'

/**
 * Relances d'échéance (spec 1.1 §4.1). Horloge FIXE : 13 septembre 2026, 11 h à Douala.
 * Le mock APPLIQUE les filtres `role in` / `actif` et ENREGISTRE le `where` reçu : un mock qui les
 * ignorerait laisserait passer une requête sans filtre de rôle (tous les comptes relancés).
 */
const NOW = new Date('2026-09-13T10:00:00Z')
const fin = (jour: string) => finDeJourneeApp(new Date(`${jour}T12:00:00+01:00`))

interface Compte { id: string; email: string; role: string; actif?: boolean; langue?: 'FR' | 'EN' | null }

const COMPTES: Compte[] = [
  { id: 'u-admin', email: 'admin@exemple.test', role: 'ADMIN' },
  { id: 'u-pres', email: 'pres@exemple.test', role: 'PRESIDENT', langue: 'EN' },
  { id: 'u-tres', email: 'tres@exemple.test', role: 'TRESORIERE' },
  { id: 'u-membre', email: 'membre@exemple.test', role: 'MEMBRE_SIMPLE' },
  { id: 'u-admin-inactif', email: 'ancien@exemple.test', role: 'ADMIN', actif: false },
]

function mock(options: { notifs?: any[]; organisations?: any[] } = {}) {
  const notifs: any[] = [...(options.notifs ?? [])]
  const appels = { findManyWhere: [] as any[], contextes: [] as (string | undefined)[] }
  const prisma: any = {
    notification: {
      create: async ({ data }: any) => { notifs.push({ id: `n${notifs.length}`, ...data }); return data },
      findFirst: async ({ where }: any) =>
        notifs.find((n) => Object.entries(where).every(([k, v]) => n[k] === v)) ?? null,
      findMany: async () => notifs,
      updateMany: async () => ({ count: 0 }),
      deleteMany: async () => ({ count: 0 }),
      count: async () => notifs.length,
    },
    membre: { findUnique: async () => null },
    utilisateur: {
      findMany: async ({ where }: any) => {
        appels.findManyWhere.push(where)
        appels.contextes.push(orgContext.organisationId())
        return COMPTES.filter(
          (c) => where.role.in.includes(c.role) && (c.actif ?? true) === where.actif,
        ).map((c) => ({ id: c.id, email: c.email }))
      },
      findUnique: async ({ where }: any) => {
        const c = COMPTES.find((x) => x.id === where.id)
        return c ? { langue: c.langue ?? null, organisation: { langueDefaut: 'FR' } } : null
      },
      update: async () => ({}),
    },
    organisation: { findMany: async () => options.organisations ?? [] },
  }
  return { prisma, notifs, appels }
}

const ORG = (expireLe: Date | null, forfait = 'PRO') => ({ id: 'org-1', forfait, forfaitExpireLe: expireLe })

describe('executerRelancesForfait', () => {
  it('J-7 : notifie les seuls ADMIN et PRESIDENT actifs, dans leur langue, et prépare push + e-mail', async () => {
    const { prisma, notifs, appels } = mock()
    const r = await executerRelancesForfait(prisma, ORG(fin('2026-09-20')) as any, NOW)

    expect(appels.findManyWhere[0]).toEqual({ role: { in: ['ADMIN', 'PRESIDENT'] }, actif: true })
    expect(r.etape).toBe('J7')
    expect(r.notifies).toBe(2)
    expect(notifs.map((n) => n.destinataireId).sort()).toEqual(['u-admin', 'u-pres'])
    const cle = cleRelanceForfait('org-1', fin('2026-09-20'), 'J7')
    expect(notifs.every((n) => n.type === 'FORFAIT_ECHEANCE' && n.entiteType === 'Organisation' && n.entiteId === cle)).toBe(true)

    const fr = notifs.find((n) => n.destinataireId === 'u-admin')
    expect(fr.message).toContain('20 septembre 2026')
    expect(fr.message).toContain('Pro')
    const en = notifs.find((n) => n.destinataireId === 'u-pres')
    expect(en.message).toContain('September 20, 2026')

    expect(r.aPousser.map((p) => p.destinataireId).sort()).toEqual(['u-admin', 'u-pres'])
    expect(r.aEnvoyer.map((e) => e.email).sort()).toEqual(['admin@exemple.test', 'pres@exemple.test'])
    // Corps de l'e-mail = message + pied (renvoi vers Paramètres), sujet = titre.
    const mailFr = r.aEnvoyer.find((e) => e.email === 'admin@exemple.test')!
    expect(mailFr.sujet).toBe(fr.titre)
    expect(mailFr.texte.startsWith(fr.message)).toBe(true)
    expect(mailFr.texte).toContain('Paramètres')
  })

  it('dédoublonné : une seconde nuit à la même étape ne recrée rien', async () => {
    const { prisma, notifs } = mock()
    await executerRelancesForfait(prisma, ORG(fin('2026-09-20')) as any, NOW)
    const r = await executerRelancesForfait(prisma, ORG(fin('2026-09-20')) as any, new Date('2026-09-14T10:00:00Z'))
    expect(r.notifies).toBe(0)
    expect(r.aPousser).toEqual([])
    expect(r.aEnvoyer).toEqual([])
    expect(notifs).toHaveLength(2)
  })

  it('nuit(s) manquée(s) : seule l’étape la plus récente part, pas de rattrapage', async () => {
    const { prisma, notifs } = mock()
    // Échéance au 18/09 (J = 5) : J-30 jamais envoyée → seule J-7 part.
    const r = await executerRelancesForfait(prisma, ORG(fin('2026-09-18')) as any, NOW)
    expect(r.etape).toBe('J7')
    expect(new Set(notifs.map((n) => n.entiteId))).toEqual(new Set([cleRelanceForfait('org-1', fin('2026-09-18'), 'J7')]))
  })

  it('réarmement : une prolongation change la clé, le cycle repart', async () => {
    const { prisma } = mock()
    await executerRelancesForfait(prisma, ORG(fin('2026-09-20')) as any, NOW)
    // Prolongé d'un mois (20/10, J = 37) : rien ; plus tard, à J-30 de la NOUVELLE échéance, relance.
    expect((await executerRelancesForfait(prisma, ORG(fin('2026-10-20')) as any, NOW)).notifies).toBe(0)
    const r = await executerRelancesForfait(prisma, ORG(fin('2026-10-20')) as any, new Date('2026-09-21T10:00:00Z'))
    expect(r.etape).toBe('J30')
    expect(r.notifies).toBe(2)
  })

  it('grâce : message avec la fin de grâce', async () => {
    const { prisma, notifs } = mock()
    const r = await executerRelancesForfait(prisma, ORG(fin('2026-09-12')) as any, NOW)
    expect(r.etape).toBe('GRACE')
    expect(notifs.find((n) => n.destinataireId === 'u-admin').message).toContain('26 septembre 2026')
  })

  it.each([
    ['actif (J = 40)', ORG(fin('2026-10-23'))],
    ['expiré au-delà de la grâce', ORG(fin('2026-08-24'))],
    ['sans échéance', ORG(null)],
    ['GRATUIT', ORG(fin('2026-09-20'), 'GRATUIT')],
  ])('%s → rien, sans même lire les comptes', async (_nom, org) => {
    const { prisma, notifs, appels } = mock()
    const r = await executerRelancesForfait(prisma, org as any, NOW)
    expect(r).toEqual({ organisationId: 'org-1', etape: null, notifies: 0, aPousser: [], aEnvoyer: [] })
    expect(notifs).toHaveLength(0)
    expect(appels.findManyWhere).toHaveLength(0)
  })
})

describe('executerRelancesForfaitToutesOrgs', () => {
  it('lit les organisations actives payantes avec échéance, et traite chacune DANS son contexte', async () => {
    const orgs = [
      { id: 'org-a', forfait: 'PRO', forfaitExpireLe: fin('2026-09-20') },
      { id: 'org-b', forfait: 'ENTREPRISE', forfaitExpireLe: fin('2026-09-12') },
    ]
    const { prisma, appels } = mock({ organisations: orgs })
    let whereOrgs: any
    const findManyOrgs = prisma.organisation.findMany
    prisma.organisation.findMany = async (args: any) => { whereOrgs = args; return findManyOrgs(args) }

    const r = await executerRelancesForfaitToutesOrgs(prisma, NOW)

    expect(whereOrgs.where).toEqual({ actif: true, forfait: { not: 'GRATUIT' }, forfaitExpireLe: { not: null } })
    expect(r.map((x) => [x.organisationId, x.etape])).toEqual([['org-a', 'J7'], ['org-b', 'GRACE']])
    expect(appels.contextes).toEqual(['org-a', 'org-b'])
  })
})
```

- [ ] **Step 2 : Lancer, constater l'échec**

Run : `cd backend && npm run test -- --run tests/forfait-relances.service.test.ts`
Expected : FAIL (module introuvable).

- [ ] **Step 3 : Messages FR/EN**

Dans `backend/src/locales/fr/notifications.ts`, remplacer :

```ts
  'notifications.reunionRappel.message': 'Réunion le {date} à {lieu}.',
} as const
```

par :

```ts
  'notifications.reunionRappel.message': 'Réunion le {date} à {lieu}.',
  // Échéance du forfait (spec 1.1 §4.1) — destinataires ADMIN/PRESIDENT, avis de service.
  'notifications.forfaitEcheance.titre': 'Échéance de votre forfait NKONI',
  'notifications.forfaitEcheance.J30':
    'Votre forfait {forfait} arrive à échéance le {date}, dans {jours} jours. Contactez-nous pour le renouveler sans interruption.',
  'notifications.forfaitEcheance.J7':
    'Votre forfait {forfait} arrive à échéance le {date}, dans {jours} jours. Contactez-nous pour le renouveler sans interruption.',
  'notifications.forfaitEcheance.J1':
    'Votre forfait {forfait} arrive à échéance le {date}. Renouvelez-le dès maintenant pour éviter toute interruption.',
  'notifications.forfaitEcheance.GRACE':
    "Votre forfait {forfait} a expiré le {date}. Ses fonctionnalités restent actives jusqu'au {fin} : renouvelez-le d'ici là.",
  'notifications.forfaitEcheance.pied':
    'Pour renouveler, écrivez-nous depuis la page Paramètres de votre espace NKONI.',
  'notifications.forfaits.GRATUIT': 'Gratuit',
  'notifications.forfaits.PRO': 'Pro',
  'notifications.forfaits.ENTREPRISE': 'Entreprise',
} as const
```

Dans `backend/src/locales/en/notifications.ts`, remplacer :

```ts
  'notifications.reunionRappel.message': 'Meeting on {date} at {lieu}.',
}
```

par :

```ts
  'notifications.reunionRappel.message': 'Meeting on {date} at {lieu}.',
  // Plan end date (spec 1.1 §4.1) — recipients ADMIN/PRESIDENT, service notice.
  'notifications.forfaitEcheance.titre': 'Your NKONI plan end date',
  'notifications.forfaitEcheance.J30':
    'Your {forfait} plan ends on {date}, in {jours} days. Contact us to renew it without interruption.',
  'notifications.forfaitEcheance.J7':
    'Your {forfait} plan ends on {date}, in {jours} days. Contact us to renew it without interruption.',
  'notifications.forfaitEcheance.J1':
    'Your {forfait} plan ends on {date}. Renew it now to avoid any interruption.',
  'notifications.forfaitEcheance.GRACE':
    'Your {forfait} plan expired on {date}. Its features remain active until {fin}: renew it before then.',
  'notifications.forfaitEcheance.pied':
    'To renew, write to us from the Settings page of your NKONI space.',
  'notifications.forfaits.GRATUIT': 'Free',
  'notifications.forfaits.PRO': 'Pro',
  'notifications.forfaits.ENTREPRISE': 'Enterprise',
}
```

(`J30`/`J7` portent `{jours}` : ces étapes couvrent J = 8..30 et J = 2..7, jamais « 1 jour » ; `J1` couvre J = 1 et J = 0, d'où un texte sans compte.)

- [ ] **Step 4 : Service**

Créer `backend/src/services/forfait-relances.service.ts` :

```ts
/**
 * Relances d'ÉCHÉANCE du forfait (spec 1.1 §4.1) — tâche de nuit, branchée dans `demarrerScheduler`.
 *
 * Pour chaque organisation active dont le forfait PAYANT a une échéance, l'étape la plus récente atteinte
 * (`etapeRelanceForfait` : J-30, J-7, J-1, entrée en grâce) est notifiée aux comptes ADMIN et PRESIDENT
 * actifs — jamais aux autres rôles, jamais aux membres : c'est une affaire commerciale entre NKONI et le
 * bureau. Trois invariants :
 *   - DÉDOUBLONNAGE par `entiteId = <org>#<échéance ISO>#<étape>` (motif de REUNION_RAPPEL) : une étape
 *     part une fois ; une prolongation change l'échéance, donc la clé, et le cycle se RÉARME seul.
 *   - AVIS DE SERVICE : aucune préférence consultée (`FORFAIT_ECHEANCE` n'est pas désactivable).
 *   - AUCUN envoi HTTP ici : on COLLECTE push et e-mails, livrés APRÈS le commit de la transaction de
 *     nuit par `livrerRelancesForfait` (jamais d'appel réseau dans une transaction).
 */
import {
  etapeRelanceForfait,
  vueEcheance,
  type EtapeRelanceForfait,
  type Forfait,
} from '../lib/forfait'
import { formatDateApp, t, type Langue } from '../lib/i18n'
import { orgContext } from '../lib/org-context'
import {
  creerNotification,
  resoudreLangueDestinataire,
  type NotificationPrisma,
} from './notification.service'
import type { PushEnAttente } from './push.service'

/** Destinataires des relances. Miroir front : `GESTION_FORFAIT` (lib/roles.ts), garde `roles-parity`. */
export const ROLES_RELANCE_FORFAIT = ['ADMIN', 'PRESIDENT'] as const

export interface OrganisationRelance {
  id: string
  forfait: Forfait
  forfaitExpireLe: Date | null
}

/** Un e-mail à envoyer APRÈS le commit. */
export interface EmailEnAttente {
  email: string
  sujet: string
  texte: string
}

export interface RelancesForfaitResult {
  organisationId: string
  /** Étape atteinte, `null` si rien à relancer. */
  etape: EtapeRelanceForfait | null
  /** Notifications effectivement créées cette nuit. */
  notifies: number
  aPousser: PushEnAttente[]
  aEnvoyer: EmailEnAttente[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Surface Prisma (mockable). `utilisateur` est SCOPÉ : appelé sous `orgContext.run`. */
export interface RelancesForfaitPrisma extends NotificationPrisma {
  notification: NotificationPrisma['notification'] & { findFirst(args: any): Promise<any> }
  utilisateur: NotificationPrisma['utilisateur'] & {
    findMany(args: any): Promise<{ id: string; email: string }[]>
  }
  organisation: { findMany(args: any): Promise<OrganisationRelance[]> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Clé de dédoublonnage d'une étape pour une échéance donnée. */
export function cleRelanceForfait(
  organisationId: string,
  expireLe: Date,
  etape: EtapeRelanceForfait,
): string {
  return `${organisationId}#${expireLe.toISOString()}#${etape}`
}

const CLE_NOM_FORFAIT = {
  GRATUIT: 'notifications.forfaits.GRATUIT',
  PRO: 'notifications.forfaits.PRO',
  ENTREPRISE: 'notifications.forfaits.ENTREPRISE',
} as const

const CLE_MESSAGE = {
  J30: 'notifications.forfaitEcheance.J30',
  J7: 'notifications.forfaitEcheance.J7',
  J1: 'notifications.forfaitEcheance.J1',
  GRACE: 'notifications.forfaitEcheance.GRACE',
} as const

function rediger(
  langue: Langue,
  etape: EtapeRelanceForfait,
  org: OrganisationRelance & { forfaitExpireLe: Date },
  now: Date,
): { titre: string; message: string } {
  const vue = vueEcheance(org.forfait, org.forfaitExpireLe, now)
  return {
    titre: t(langue, 'notifications.forfaitEcheance.titre'),
    message: t(langue, CLE_MESSAGE[etape], {
      forfait: t(langue, CLE_NOM_FORFAIT[org.forfait]),
      date: formatDateApp(org.forfaitExpireLe, langue),
      jours: vue.joursRestants ?? 0,
      fin: vue.finGraceLe ? formatDateApp(vue.finGraceLe, langue) : '',
    }),
  }
}

/**
 * Relances de l'organisation EN CONTEXTE (appelée sous `orgContext.run`). `now` injecté → déterministe.
 */
export async function executerRelancesForfait(
  prisma: RelancesForfaitPrisma,
  org: OrganisationRelance,
  now: Date = new Date(),
): Promise<RelancesForfaitResult> {
  const etape = etapeRelanceForfait(org.forfait, org.forfaitExpireLe, now)
  const resultat: RelancesForfaitResult = {
    organisationId: org.id,
    etape: null,
    notifies: 0,
    aPousser: [],
    aEnvoyer: [],
  }
  if (etape === null || org.forfaitExpireLe === null) return resultat
  resultat.etape = etape

  const entiteId = cleRelanceForfait(org.id, org.forfaitExpireLe, etape)
  const destinataires = await prisma.utilisateur.findMany({
    where: { role: { in: [...ROLES_RELANCE_FORFAIT] }, actif: true },
    select: { id: true, email: true },
  })

  for (const u of destinataires) {
    const deja = await prisma.notification.findFirst({
      where: { destinataireId: u.id, type: 'FORFAIT_ECHEANCE', entiteType: 'Organisation', entiteId },
    })
    if (deja) continue

    const langue = await resoudreLangueDestinataire(prisma, u.id)
    const { titre, message } = rediger(langue, etape, { ...org, forfaitExpireLe: org.forfaitExpireLe }, now)
    await creerNotification(prisma, {
      destinataireId: u.id,
      type: 'FORFAIT_ECHEANCE',
      titre,
      message,
      entiteType: 'Organisation',
      entiteId,
    })
    resultat.aPousser.push({ destinataireId: u.id, titre, message })
    resultat.aEnvoyer.push({
      email: u.email,
      sujet: titre,
      texte: `${message}\n\n${t(langue, 'notifications.forfaitEcheance.pied')}`,
    })
    resultat.notifies += 1
  }
  return resultat
}

/**
 * Relances POUR TOUTES LES ORGANISATIONS actives à forfait payant daté (même patron d'itération scopée
 * que les autres tâches de nuit : jamais un `runUnscoped` global). `Organisation` n'est pas scopée :
 * sa lecture ne demande pas de contexte.
 */
export async function executerRelancesForfaitToutesOrgs(
  prisma: RelancesForfaitPrisma,
  now: Date = new Date(),
): Promise<RelancesForfaitResult[]> {
  const orgs = await prisma.organisation.findMany({
    where: { actif: true, forfait: { not: 'GRATUIT' }, forfaitExpireLe: { not: null } },
    select: { id: true, forfait: true, forfaitExpireLe: true },
  })
  const resultats: RelancesForfaitResult[] = []
  for (const org of orgs) {
    const r = await orgContext.run({ organisationId: org.id }, async () =>
      executerRelancesForfait(prisma, org, now),
    )
    resultats.push(r)
  }
  return resultats
}
```

- [ ] **Step 5 : Lancer, constater le succès**

Run : `cd backend && npm run test -- --run tests/forfait-relances.service.test.ts`
Expected : PASS (10 tests).

Sabotage (direction utile) : dans le service, remplacer temporairement `where: { role: { in: [...ROLES_RELANCE_FORFAIT] }, actif: true },` par `where: { actif: true },` → le premier test doit échouer (le mock reçoit un `where` sans rôle → `where.role` indéfini lève, et l'assertion sur le `where` échoue). Restaurer, relancer → PASS. Second sabotage : supprimer le `if (deja) continue` → le test « dédoublonné » échoue ; restaurer.

- [ ] **Step 6 : Build + suite**

Run : `cd backend && npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : build OK (la parité FR/EN des catalogues est vérifiée par tsc) ; tous les tests passent.

- [ ] **Step 7 : Commit**

```bash
git add backend/src/services/forfait-relances.service.ts backend/src/locales/fr/notifications.ts backend/src/locales/en/notifications.ts backend/tests/forfait-relances.service.test.ts
git commit -m "feat(forfaits): relances d'echeance dedoublonnees pour ADMIN et PRESIDENT

Etape la plus recente atteinte (J-30, J-7, J-1, grace), cle <org>#<echeance>#<etape>
qui se rearme a la prolongation, langue du destinataire, push et e-mails
collectes pour envoi apres commit.

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 5 : Livraison après commit et branchement dans la tâche de nuit

**Files:**
- Modify: `backend/src/services/forfait-relances.service.ts` (ajout `livrerRelancesForfait`)
- Modify: `backend/src/services/notification-scheduler.ts` (`demarrerScheduler`)
- Test: `backend/tests/forfait-relances-livraison.test.ts` (create)

**Interfaces:**
- Consumes : `RelancesForfaitResult` (Task 4) ; `notifierParPush`, `type PushClient`, `type PushPrisma`, `type PushObservabilite` (push.service.ts) ; `envoyerMessageEmail`, `type EmailClient` (Task 3) ; `executerRelancesForfaitToutesOrgs` (Task 4).
- Produces :
  - `livrerRelancesForfait(deps: { prisma: PushPrisma; push: PushClient; email: EmailClient; observabilite?: PushObservabilite }, resultats: RelancesForfaitResult[]): Promise<{ emailsEnvoyes: number }>` — ne lève jamais ; push sous `orgContext.run` de l'org, lien `/parametres`.

- [ ] **Step 1 : Test (échoue : fonction absente)**

Créer `backend/tests/forfait-relances-livraison.test.ts` :

```ts
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'
import { livrerRelancesForfait } from '../src/services/forfait-relances.service'
import { orgContext } from '../src/lib/org-context'

const resultat = (organisationId: string, n: number) => ({
  organisationId,
  etape: 'J7' as const,
  notifies: n,
  aPousser: Array.from({ length: n }, (_, i) => ({ destinataireId: `${organisationId}-u${i}`, titre: 'T', message: 'M' })),
  aEnvoyer: Array.from({ length: n }, (_, i) => ({ email: `u${i}@${organisationId}.test`, sujet: 'S', texte: 'X' })),
})

function deps(emailOk: (adresse: string) => boolean = () => true) {
  const contextesPush: (string | undefined)[] = []
  const prisma: any = {
    pushSubscription: {
      findMany: async () => {
        contextesPush.push(orgContext.organisationId())
        return [{ endpoint: 'https://push.test/1', p256dh: 'p', auth: 'a' }]
      },
      deleteMany: async () => ({ count: 0 }),
      create: async () => ({}),
    },
  }
  const push = { disponible: () => true, envoyer: vi.fn(async () => ({ ok: true })) }
  const email = {
    disponible: () => true,
    envoyerDocument: vi.fn(),
    envoyerMessage: vi.fn(async (adresse: string) => {
      if (adresse.startsWith('boom')) throw new Error('réseau')
      return { ok: emailOk(adresse) }
    }),
  }
  return { prisma, push, email, contextesPush }
}

describe('livrerRelancesForfait (après commit)', () => {
  it('pousse chaque notification DANS le contexte de son organisation, vers /parametres, et envoie les e-mails', async () => {
    const d = deps()
    const r = await livrerRelancesForfait(d, [resultat('org-a', 2), resultat('org-b', 1), resultat('org-c', 0)])

    expect(d.contextesPush).toEqual(['org-a', 'org-a', 'org-b'])
    expect(d.push.envoyer).toHaveBeenCalledTimes(3)
    expect((d.push.envoyer.mock.calls[0] as any[])[1]).toEqual({ titre: 'T', message: 'M', url: '/parametres' })
    expect(d.email.envoyerMessage).toHaveBeenCalledTimes(3)
    expect(r).toEqual({ emailsEnvoyes: 3 })
  })

  it('un e-mail en échec ou qui lève n’interrompt pas les suivants', async () => {
    const d = deps((a) => !a.startsWith('u0'))
    const res = resultat('org-a', 2)
    res.aEnvoyer.unshift({ email: 'boom@org-a.test', sujet: 'S', texte: 'X' })
    const r = await livrerRelancesForfait(d, [res])
    expect(d.email.envoyerMessage).toHaveBeenCalledTimes(3)
    expect(r).toEqual({ emailsEnvoyes: 1 })
  })
})
```

- [ ] **Step 2 : Lancer, constater l'échec**

Run : `cd backend && npm run test -- --run tests/forfait-relances-livraison.test.ts`
Expected : FAIL (`livrerRelancesForfait is not a function`).

- [ ] **Step 3 : Implémenter la livraison**

Dans `backend/src/services/forfait-relances.service.ts`, remplacer :

```ts
import type { PushEnAttente } from './push.service'
```

par :

```ts
import {
  notifierParPush,
  type PushClient,
  type PushEnAttente,
  type PushObservabilite,
  type PushPrisma,
} from './push.service'
import { envoyerMessageEmail, type EmailClient } from './email.service'
```

À la fin du fichier, ajouter :

```ts

/**
 * Livraison APRÈS le commit de la transaction de nuit : Web Push (par organisation, sous son contexte :
 * `PushSubscription` est scopé) puis e-mails. Ne lève JAMAIS : `notifierParPush` et
 * `envoyerMessageEmail` sont best-effort, et les notifications sont déjà en base — un envoi raté ne
 * doit pas faire croire que la relance n'a pas eu lieu.
 */
export async function livrerRelancesForfait(
  deps: {
    prisma: PushPrisma
    push: PushClient
    email: EmailClient
    observabilite?: PushObservabilite
  },
  resultats: RelancesForfaitResult[],
): Promise<{ emailsEnvoyes: number }> {
  let emailsEnvoyes = 0
  for (const r of resultats) {
    if (r.aPousser.length > 0) {
      await orgContext.run({ organisationId: r.organisationId }, async () => {
        for (const p of r.aPousser) {
          await notifierParPush(
            deps.prisma,
            deps.push,
            p.destinataireId,
            { titre: p.titre, message: p.message, url: '/parametres' },
            deps.observabilite,
          )
        }
      })
    }
    for (const e of r.aEnvoyer) {
      if (await envoyerMessageEmail(deps.email, e.email, e.sujet, e.texte)) emailsEnvoyes += 1
    }
  }
  return { emailsEnvoyes }
}
```

(Si `notifierParPush` a une signature d'`observabilite` différente de `deps.observabilite` sous `exactOptionalPropertyTypes`, passer `deps.observabilite` tel quel : le paramètre est optionnel `observabilite?: PushObservabilite`.)

- [ ] **Step 4 : Lancer, constater le succès**

Run : `cd backend && npm run test -- --run tests/forfait-relances-livraison.test.ts`
Expected : PASS (2 tests).

- [ ] **Step 5 : Brancher dans la tâche de nuit**

Dans `backend/src/services/notification-scheduler.ts`, remplacer :

```ts
import { anneeCouranteApp } from '../lib/date-app'
```

par :

```ts
import { anneeCouranteApp } from '../lib/date-app'
import {
  executerRelancesForfaitToutesOrgs,
  livrerRelancesForfait,
  type RelancesForfaitPrisma,
} from './forfait-relances.service'
```

Remplacer :

```ts
            // Deux tâches de nuit sous LE MÊME verrou : retards de cotisation + rappels de réunion.
            const retards = await executerVerificationRetardsToutesOrgs(
              tx as SchedulerPrisma,
              anneeCourante,
            )
            const rappels = await executerRappelsReunionsToutesOrgs(tx as SchedulerPrisma)
            return { retards, rappels }
```

par :

```ts
            // Trois tâches de nuit sous LE MÊME verrou : retards de cotisation, rappels de réunion,
            // relances d'échéance du forfait (spec 1.1 §4.1).
            const retards = await executerVerificationRetardsToutesOrgs(
              tx as SchedulerPrisma,
              anneeCourante,
            )
            const rappels = await executerRappelsReunionsToutesOrgs(tx as SchedulerPrisma)
            const relancesForfait = await executerRelancesForfaitToutesOrgs(
              tx as RelancesForfaitPrisma,
            )
            return { retards, rappels, relancesForfait }
```

Remplacer :

```ts
          const { retards, rappels } = resultats
```

par :

```ts
          const { retards, rappels, relancesForfait } = resultats
```

Remplacer :

```ts
          } catch (errPush) {
            app.log.error({ err: errPush }, 'Envoi Web Push post-tâches de nuit échoué (notifications déjà créées)')
            app.observabilite.signaler(errPush, { source: 'scheduler', tache: 'WEB_PUSH' })
          }
```

par :

```ts
          } catch (errPush) {
            app.log.error({ err: errPush }, 'Envoi Web Push post-tâches de nuit échoué (notifications déjà créées)')
            app.observabilite.signaler(errPush, { source: 'scheduler', tache: 'WEB_PUSH' })
          }
          // Relances d'échéance : push (lien /parametres) + e-mails, APRÈS le commit. Ne lève pas ;
          // le try/catch ne protège que d'un défaut imprévu, signalé à part comme le push.
          let emailsForfait = 0
          try {
            const livraison = await livrerRelancesForfait(
              {
                prisma: app.prisma as unknown as PushPrisma,
                push: app.push,
                email: app.email,
                observabilite: app.observabilite,
              },
              relancesForfait,
            )
            emailsForfait = livraison.emailsEnvoyes
          } catch (errRelance) {
            app.log.error({ err: errRelance }, 'Livraison des relances de forfait échouée (notifications déjà créées)')
            app.observabilite.signaler(errRelance, { source: 'scheduler', tache: 'FORFAIT_ECHEANCE_LIVRAISON' })
          }
```

Remplacer :

```ts
          const rappelsNotifies = rappels.reduce((s, r) => s + r.notifies, 0)
          app.log.info(
            { organisations: retards.length, verifies, notifies, rappelsNotifies },
            'Tâches de nuit terminées (retards de cotisation + rappels de réunion, toutes organisations)',
          )
```

par :

```ts
          const rappelsNotifies = rappels.reduce((s, r) => s + r.notifies, 0)
          const relancesForfaitNotifiees = relancesForfait.reduce((s, r) => s + r.notifies, 0)
          app.log.info(
            {
              organisations: retards.length,
              verifies,
              notifies,
              rappelsNotifies,
              relancesForfaitNotifiees,
              emailsForfait,
            },
            'Tâches de nuit terminées (retards, rappels de réunion, relances de forfait — toutes organisations)',
          )
```

Remplacer :

```ts
            tache: 'COTISATION_RETARD+REUNION_RAPPEL',
```

par :

```ts
            tache: 'COTISATION_RETARD+REUNION_RAPPEL+FORFAIT_ECHEANCE',
```

Remplacer :

```ts
    'Scheduler notifications démarré (COTISATION_RETARD + REUNION_RAPPEL — 03:00 Africa/Douala)',
```

par :

```ts
    'Scheduler notifications démarré (COTISATION_RETARD + REUNION_RAPPEL + FORFAIT_ECHEANCE — 03:00 Africa/Douala)',
```

- [ ] **Step 6 : Build + suite**

Run : `cd backend && npm run build && npm run test -- --run --exclude '**/*.integration.test.ts'`
Expected : build OK (`app.email` est décoré dans `app.ts`) ; tous les tests passent. Contrôle : `grep -n "relancesForfait" backend/src/services/notification-scheduler.ts` montre la création dans la transaction ET la livraison dans le `.then`.

- [ ] **Step 7 : Commit**

```bash
git add backend/src/services/forfait-relances.service.ts backend/src/services/notification-scheduler.ts backend/tests/forfait-relances-livraison.test.ts
git commit -m "feat(scheduler): relances de forfait dans la tache de nuit, livrees apres commit

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 6 : Front — types de notification, `peutGererForfait` et règle du bandeau

**Files:**
- Modify: `frontend/src/lib/api/notifications.ts:7-8`
- Modify: `frontend/src/components/NotificationPreferences.tsx` (4 occurrences de `TypeNotification`)
- Modify: `frontend/src/pages/MonEspacePage.tsx` (import lucide, `NOTIF_ICONE`, `NOTIF_TON`)
- Modify: `frontend/src/lib/roles.ts` (après `peutConfigurerPaiement`)
- Modify: `frontend/src/lib/roles-parity.test.ts` (nouveau `describe`)
- Create: `frontend/src/lib/bandeau-forfait.ts`
- Test: `frontend/src/lib/bandeau-forfait.test.ts` (create)

**Interfaces:**
- Consumes : `OrganisationCourante` (`@/lib/api`, champs `id`, `forfait`, `forfaitExpireLe`, `etatForfait`, `joursRestants`) ; `ROLES_RELANCE_FORFAIT` du service backend (Task 4, lu en texte).
- Produces :
  - `type TypeNotification` incluant `'FORFAIT_ECHEANCE'`, `type TypeNotificationDesactivable`, `PreferencesNotification = Record<TypeNotificationDesactivable, boolean>`
  - `peutGererForfait(role: string | undefined): boolean`
  - `JOURS_BANDEAU_PROCHE = 7`
  - `interface BandeauForfaitVue { cle: 'proche' | 'grace' | 'expire'; ton: 'info' | 'or' | 'neutre'; fermable: boolean; idFermeture: string }`
  - `bandeauForfait(org): BandeauForfaitVue | null`, `estBandeauFerme(id: string): boolean`, `fermerBandeau(id: string): void`

- [ ] **Step 1 : Tests (échouent)**

Créer `frontend/src/lib/bandeau-forfait.test.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bandeauForfait, estBandeauFerme, fermerBandeau } from './bandeau-forfait'

// Env `node` : règle pure ; `sessionStorage` y est ABSENT, ce qui teste aussi la tolérance d'accès.
const ORG = {
  id: 'org-1',
  forfait: 'PRO' as const,
  forfaitExpireLe: '2026-09-20T22:59:59.999Z',
  etatForfait: 'ECHEANCE_PROCHE' as const,
  joursRestants: 7,
}

describe('bandeauForfait (spec 1.1 §4.4)', () => {
  it('échéance proche à J ≤ 7 : info, fermable', () => {
    expect(bandeauForfait(ORG)).toMatchObject({ cle: 'proche', ton: 'info', fermable: true })
    expect(bandeauForfait({ ...ORG, joursRestants: 0 })).toMatchObject({ cle: 'proche' })
  })

  it('échéance proche de J-30 à J-8 : rien (la notification suffit)', () => {
    expect(bandeauForfait({ ...ORG, joursRestants: 8 })).toBeNull()
    expect(bandeauForfait({ ...ORG, joursRestants: 30 })).toBeNull()
  })

  it('grâce : or, NON fermable', () => {
    expect(bandeauForfait({ ...ORG, etatForfait: 'GRACE', joursRestants: -3 })).toMatchObject({
      cle: 'grace',
      ton: 'or',
      fermable: false,
    })
  })

  it('expiré sur forfait payant : neutre, fermable', () => {
    expect(bandeauForfait({ ...ORG, etatForfait: 'EXPIRE', joursRestants: -20 })).toMatchObject({
      cle: 'expire',
      ton: 'neutre',
      fermable: true,
    })
  })

  it('actif, sans échéance, ou champs absents (API pas encore déployée) : rien', () => {
    expect(bandeauForfait({ ...ORG, etatForfait: 'ACTIF', joursRestants: 60 })).toBeNull()
    expect(bandeauForfait({ ...ORG, etatForfait: 'SANS_ECHEANCE', forfaitExpireLe: null, joursRestants: null })).toBeNull()
    expect(bandeauForfait({ id: 'org-1', forfait: 'PRO' } as never)).toBeNull()
  })

  it('l’identifiant de fermeture change avec l’échéance et l’état : un nouvel état se ré-affiche', () => {
    const proche = bandeauForfait(ORG)!
    const grace = bandeauForfait({ ...ORG, etatForfait: 'GRACE', joursRestants: -1 })!
    const prolonge = bandeauForfait({ ...ORG, forfaitExpireLe: '2026-09-19T22:59:59.999Z' })!
    expect(grace.idFermeture).not.toBe(proche.idFermeture)
    expect(prolonge.idFermeture).not.toBe(proche.idFermeture)
  })
})

describe('fermeture de session', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stockage indisponible (accès qui lève) : jamais fermé, aucune exception', () => {
    expect(estBandeauFerme('x')).toBe(false)
    expect(() => fermerBandeau('x')).not.toThrow()
  })

  it('stockage disponible : fermer puis relire', () => {
    const memoire = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => memoire.get(k) ?? null,
      setItem: (k: string, v: string) => void memoire.set(k, v),
    })
    expect(estBandeauFerme('cle')).toBe(false)
    fermerBandeau('cle')
    expect(estBandeauFerme('cle')).toBe(true)
  })
})
```

Dans `frontend/src/lib/roles-parity.test.ts`, à la fin du fichier, ajouter :

```ts

describe('parité inter-couches : bandeau d’échéance ↔ destinataires des relances', () => {
  // Le bandeau (front) et les relances de nuit (back) s'adressent aux MÊMES rôles (spec 1.1 §4.1/§4.4).
  const SERVICE_TS = resolve(ICI, '../../../backend/src/services/forfait-relances.service.ts')

  it('GESTION_FORFAIT miroite ROLES_RELANCE_FORFAIT', () => {
    const service = readFileSync(SERVICE_TS, 'utf8')
    const m = service.match(/const ROLES_RELANCE_FORFAIT\s*=\s*\[([^\]]*)\]/)
    if (!m) throw new Error('ROLES_RELANCE_FORFAIT introuvable dans forfait-relances.service.ts')
    const serveur = rolesDe(m[1])
    expect(serveur.length).toBeGreaterThan(0)
    expect(rolesFront(readFileSync(ROLES_TS, 'utf8'), 'GESTION_FORFAIT')).toEqual(serveur)
  })
})
```

- [ ] **Step 2 : Lancer, constater l'échec**

Run : `cd frontend && npx vitest --run src/lib/bandeau-forfait.test.ts src/lib/roles-parity.test.ts`
Expected : FAIL (module `./bandeau-forfait` introuvable ; « Constante front introuvable : GESTION_FORFAIT »).

- [ ] **Step 3 : Types de notification**

Dans `frontend/src/lib/api/notifications.ts`, remplacer :

```ts
export type TypeNotification = 'VERSEMENT_RECU' | 'COTISATION_RETARD' | 'REUNION_RAPPEL'
export type PreferencesNotification = Record<TypeNotification, boolean>
```

par :

```ts
export type TypeNotification =
  | 'VERSEMENT_RECU'
  | 'COTISATION_RETARD'
  | 'REUNION_RAPPEL'
  | 'FORFAIT_ECHEANCE'
/** Types désactivables : `FORFAIT_ECHEANCE` est un avis de service (miroir de `TYPES_NOTIFICATION` backend). */
export type TypeNotificationDesactivable = Exclude<TypeNotification, 'FORFAIT_ECHEANCE'>
export type PreferencesNotification = Record<TypeNotificationDesactivable, boolean>
```

Dans `frontend/src/components/NotificationPreferences.tsx`, remplacer CHACUNE des 4 occurrences du mot `TypeNotification` par `TypeNotificationDesactivable` (import `type TypeNotification,`, `const TYPES: TypeNotification[]`, `useState<TypeNotification | null>`, `basculer = async (cle: TypeNotification,`). Contrôle : `grep -n "TypeNotification\b" frontend/src/components/NotificationPreferences.tsx` ne doit plus rien renvoyer.

Dans `frontend/src/pages/MonEspacePage.tsx`, remplacer :

```tsx
  CalendarDays,
```

par (première occurrence, dans l'import `lucide-react`) :

```tsx
  CalendarClock,
  CalendarDays,
```

Remplacer :

```tsx
  REUNION_RAPPEL: CalendarDays,
}
```

par :

```tsx
  REUNION_RAPPEL: CalendarDays,
  FORFAIT_ECHEANCE: CalendarClock,
}
```

Remplacer :

```tsx
  REUNION_RAPPEL: '--brass',
}
```

par :

```tsx
  REUNION_RAPPEL: '--brass',
  FORFAIT_ECHEANCE: '--amber',
}
```

(Si `CalendarClock` est déjà importé dans ce fichier, ne pas le dupliquer.)

- [ ] **Step 4 : Rôles et règle du bandeau**

Dans `frontend/src/lib/roles.ts`, remplacer :

```ts
export function peutConfigurerPaiement(role: string | undefined): boolean {
  return role !== undefined && CONFIG_PAIEMENT.includes(role)
}
```

par :

```ts
export function peutConfigurerPaiement(role: string | undefined): boolean {
  return role !== undefined && CONFIG_PAIEMENT.includes(role)
}

/**
 * Miroir des DESTINATAIRES des relances d'échéance (`ROLES_RELANCE_FORFAIT`,
 * backend/src/services/forfait-relances.service.ts) — pas d'une route. Parité : `roles-parity.test.ts`.
 */
const GESTION_FORFAIT = ['ADMIN', 'PRESIDENT']

/** Voit le bandeau d'échéance du forfait (spec 1.1 §4.4) : le bureau dirigeant, jamais les membres. */
export function peutGererForfait(role: string | undefined): boolean {
  return role !== undefined && GESTION_FORFAIT.includes(role)
}
```

Créer `frontend/src/lib/bandeau-forfait.ts` :

```ts
import type { OrganisationCourante } from '@/lib/api'

/**
 * Règle d'AFFICHAGE du bandeau d'échéance (spec 1.1 §4.4). Aucune règle de calcul : l'état et les jours
 * restants viennent du serveur (`GET /organisations/moi`). Fichier séparé du composant (Fast Refresh).
 */

/** En deçà (inclus) de ce nombre de jours, l'échéance proche s'affiche en bandeau ; avant, la notification suffit. */
export const JOURS_BANDEAU_PROCHE = 7

export interface BandeauForfaitVue {
  cle: 'proche' | 'grace' | 'expire'
  ton: 'info' | 'or' | 'neutre'
  /** Fermable pour la session ; la grâce ne l'est jamais (spec). */
  fermable: boolean
  /** Clé de fermeture : change avec l'échéance ET l'état, pour qu'un nouvel état se ré-affiche. */
  idFermeture: string
}

type OrgBandeau = Pick<OrganisationCourante, 'id' | 'forfait' | 'forfaitExpireLe' | 'etatForfait' | 'joursRestants'>

export function bandeauForfait(org: OrgBandeau): BandeauForfaitVue | null {
  // `== null` : une API pas encore déployée renvoie `undefined` pour ces champs.
  if (org.etatForfait == null || org.forfaitExpireLe == null) return null
  const idFermeture = `nkoni:bandeau-forfait:${org.id}:${org.forfaitExpireLe}:${org.etatForfait}`
  switch (org.etatForfait) {
    case 'ECHEANCE_PROCHE':
      return org.joursRestants != null && org.joursRestants <= JOURS_BANDEAU_PROCHE
        ? { cle: 'proche', ton: 'info', fermable: true, idFermeture }
        : null
    case 'GRACE':
      return { cle: 'grace', ton: 'or', fermable: false, idFermeture }
    case 'EXPIRE':
      return org.forfait !== 'GRATUIT' ? { cle: 'expire', ton: 'neutre', fermable: true, idFermeture } : null
    default:
      return null
  }
}

/** Le bandeau a-t-il été fermé dans cette session ? Accès au stockage protégé (navigation privée, blocage). */
export function estBandeauFerme(id: string): boolean {
  try {
    return sessionStorage.getItem(id) === '1'
  } catch {
    return false
  }
}

export function fermerBandeau(id: string): void {
  try {
    sessionStorage.setItem(id, '1')
  } catch {
    // Stockage indisponible : la fermeture vaut pour l'affichage courant seulement.
  }
}
```

- [ ] **Step 5 : Lancer, constater le succès ; saboter le garde de parité**

Run : `cd frontend && npx vitest --run src/lib/bandeau-forfait.test.ts src/lib/roles-parity.test.ts`
Expected : PASS.

Sabotage (direction utile = l'AUTRE côté) : dans `backend/src/services/forfait-relances.service.ts`, remplacer temporairement `['ADMIN', 'PRESIDENT'] as const` par `['ADMIN', 'PRESIDENT', 'TRESORIERE'] as const`, vérifier par `grep -n "ROLES_RELANCE_FORFAIT = " backend/src/services/forfait-relances.service.ts` que la modification a pris, relancer `roles-parity.test.ts` → FAIL attendu. Restaurer, relancer → PASS.

- [ ] **Step 6 : Build + lint + tests**

Run : `cd frontend && npm run build && npm run lint && npm run test`
Expected : build OK (tsc attrape tout `Record<TypeNotification, …>` incomplet) ; lint sans finding ; tous les tests passent.

- [ ] **Step 7 : Commit**

```bash
git add frontend/src/lib/api/notifications.ts frontend/src/components/NotificationPreferences.tsx frontend/src/pages/MonEspacePage.tsx frontend/src/lib/roles.ts frontend/src/lib/roles-parity.test.ts frontend/src/lib/bandeau-forfait.ts frontend/src/lib/bandeau-forfait.test.ts
git commit -m "feat(front): notification FORFAIT_ECHEANCE, peutGererForfait et regle du bandeau

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 7 : Front — composant `BandeauForfait` dans la coquille

**Files:**
- Create: `frontend/src/components/BandeauForfait.tsx`
- Test: `frontend/src/components/BandeauForfait.test.tsx` (create)
- Modify: `frontend/src/components/AppShell.tsx` (import + rendu en tête de `#contenu-principal`)
- Modify: `frontend/src/locales/fr/shell.ts`, `frontend/src/locales/en/shell.ts`

**Interfaces:**
- Consumes : `peutGererForfait` (Task 6) ; `bandeauForfait`, `estBandeauFerme`, `fermerBandeau` (Task 6) ; `organisationApi.moi`, `type OrganisationCourante` (`@/lib/api`) ; `useAuth` (`@/contexts/auth-context`) ; `formatDateApp`, `cn` (`@/lib/utils`) ; `cleI18n` (`@/lib/i18n`).
- Produces : `export function BandeauForfait(): JSX.Element | null`.

- [ ] **Step 1 : Test (échoue : composant absent)**

Créer `frontend/src/components/BandeauForfait.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { OrganisationCourante } from '@/lib/api'
import { BandeauForfait } from './BandeauForfait'

const moi = vi.fn()
vi.mock('@/lib/api', () => ({ organisationApi: { moi: (...a: unknown[]) => moi(...a) } }))
let role = 'ADMIN'
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ user: { role }, accessToken: 'jeton' }) }))
// t → « clé » ou « clé|{options JSON} ».
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (cle: string, o?: object) => (o ? `${cle}|${JSON.stringify(o)}` : cle),
    i18n: { language: 'fr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const ORG: OrganisationCourante = {
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
  forfaitExpireLe: '2026-09-18T22:59:59.999Z',
  etatForfait: 'ECHEANCE_PROCHE',
  joursRestants: 5,
  finGraceLe: '2026-10-02T22:59:59.999Z',
  forfaitEffectif: 'PRO',
}

const rendre = () => render(<MemoryRouter><BandeauForfait /></MemoryRouter>)

beforeEach(() => {
  role = 'ADMIN'
  moi.mockReset()
  sessionStorage.clear()
})
afterEach(cleanup)

describe('BandeauForfait (spec 1.1 §4.4)', () => {
  it.each(['TRESORIERE', 'SECRETAIRE', 'MEMBRE_SIMPLE'])('%s : rien, et aucune lecture de l’organisation', (r) => {
    role = r
    const { container } = rendre()
    expect(container.innerHTML).toBe('')
    expect(moi).not.toHaveBeenCalled()
  })

  it('PRESIDENT, échéance à J-5 : bandeau role=status fermable, fermeture mémorisée pour la session', async () => {
    role = 'PRESIDENT'
    moi.mockResolvedValue(ORG)
    rendre()
    const bandeau = await screen.findByRole('status')
    expect(bandeau.textContent).toContain('shell.bandeauForfait.proche')
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'shell.bandeauForfait.fermer' }))
    expect(screen.queryByRole('status')).toBeNull()

    cleanup()
    rendre()
    await waitFor(() => expect(moi).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('grâce : bandeau NON fermable', async () => {
    moi.mockResolvedValue({ ...ORG, etatForfait: 'GRACE', joursRestants: -3 })
    rendre()
    expect((await screen.findByRole('status')).textContent).toContain('shell.bandeauForfait.grace')
    expect(screen.queryByRole('button', { name: 'shell.bandeauForfait.fermer' })).toBeNull()
  })

  it('expiré : bandeau fermable', async () => {
    moi.mockResolvedValue({ ...ORG, etatForfait: 'EXPIRE', joursRestants: -20, forfaitEffectif: 'GRATUIT' })
    rendre()
    expect((await screen.findByRole('status')).textContent).toContain('shell.bandeauForfait.expire')
    expect(screen.getByRole('button', { name: 'shell.bandeauForfait.fermer' })).toBeTruthy()
  })

  it('échéance à J-12 ou actif : rien', async () => {
    moi.mockResolvedValue({ ...ORG, joursRestants: 12 })
    const { container } = rendre()
    await waitFor(() => expect(moi).toHaveBeenCalled())
    expect(container.querySelector('[role="status"]')).toBeNull()
  })

  it('lecture en échec : rien, aucune erreur affichée', async () => {
    moi.mockRejectedValue(new Error('réseau'))
    const { container } = rendre()
    await waitFor(() => expect(moi).toHaveBeenCalled())
    expect(container.innerHTML).toBe('')
  })
})
```

- [ ] **Step 2 : Lancer, constater l'échec**

Run : `cd frontend && npx vitest --run src/components/BandeauForfait.test.tsx`
Expected : FAIL (module `./BandeauForfait` introuvable).

- [ ] **Step 3 : Composant**

Créer `frontend/src/components/BandeauForfait.tsx` :

```tsx
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, Info, X, type LucideIcon } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { organisationApi, type OrganisationCourante } from '@/lib/api'
import { bandeauForfait, estBandeauFerme, fermerBandeau, type BandeauForfaitVue } from '@/lib/bandeau-forfait'
import { cleI18n } from '@/lib/i18n'
import { peutGererForfait } from '@/lib/roles'
import { cn, formatDateApp } from '@/lib/utils'

/** Teinte par ton — jetons du design system (même palette que la bannière d'incident de /statut). */
const STYLE: Record<BandeauForfaitVue['ton'], { cadre: string; texte: string; icone: LucideIcon }> = {
  info: { cadre: 'border-brass/30 bg-brass/[0.07]', texte: 'text-brass', icone: Info },
  or: { cadre: 'border-amber/30 bg-amber/[0.07]', texte: 'text-amber', icone: AlertTriangle },
  neutre: { cadre: 'border-hairline bg-surface', texte: 'text-muted-foreground', icone: CalendarClock },
}

/**
 * Bandeau d'échéance du forfait, en tête du contenu (spec 1.1 §4.4). Réservé au bureau dirigeant
 * (`peutGererForfait`) : un membre ne voit jamais de message commercial (§1.1). Lit
 * `GET /organisations/moi` une fois par session d'affichage de la coquille ; en cas d'échec, n'affiche
 * rien (le bandeau est un rappel, pas une fonctionnalité). `role="status"` : message d'information,
 * jamais une alerte qui interromprait un lecteur d'écran.
 */
export function BandeauForfait() {
  const { t } = useTranslation()
  const { user, accessToken } = useAuth()
  const autorise = peutGererForfait(user?.role)
  const [org, setOrg] = useState<OrganisationCourante | null>(null)
  const [fermes, setFermes] = useState<string[]>([])

  useEffect(() => {
    if (!autorise || !accessToken) return
    const controleur = new AbortController()
    organisationApi
      .moi(accessToken, controleur.signal)
      .then(setOrg)
      .catch(() => undefined)
    return () => controleur.abort()
  }, [autorise, accessToken])

  if (!autorise || !org) return null
  const vue = bandeauForfait(org)
  if (!vue) return null
  if (vue.fermable && (fermes.includes(vue.idFermeture) || estBandeauFerme(vue.idFermeture))) return null

  const style = STYLE[vue.ton]
  const Icone = style.icone
  const params = {
    forfait: t(cleI18n(`commun.forfaits.${org.forfait}`)),
    date: formatDateApp(org.forfaitExpireLe),
    fin: formatDateApp(org.finGraceLe),
  }

  return (
    <div role="status" className={cn('mb-6 flex items-start gap-3 rounded-2xl border p-4', style.cadre)}>
      <Icone className={cn('mt-0.5 h-5 w-5 shrink-0', style.texte)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{t(cleI18n(`shell.bandeauForfait.${vue.cle}`), params)}</p>
        <Link to="/parametres" className={cn('mt-1 inline-block text-sm font-medium underline-offset-4 hover:underline', style.texte)}>
          {t('shell.bandeauForfait.voir')}
        </Link>
      </div>
      {vue.fermable && (
        <button
          type="button"
          onClick={() => {
            fermerBandeau(vue.idFermeture)
            setFermes((f) => [...f, vue.idFermeture])
          }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
          aria-label={t('shell.bandeauForfait.fermer')}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
```

(Vérifier que le jeton `text-amber` existe comme `text-brass` : `grep -n "\-\-color-amber\|--amber" frontend/src/index.css`. S'il n'y a pas d'utilitaire `text-amber`, prendre celui utilisé par la bannière de maintenance de `pages/StatutPage.tsx`, qui l'emploie déjà.)

- [ ] **Step 4 : Textes FR/EN**

Dans `frontend/src/locales/fr/shell.ts`, remplacer :

```ts
  shell: {
    organisation: 'Organisation',
```

par :

```ts
  shell: {
    organisation: 'Organisation',
    // Bandeau d'échéance du forfait (spec 1.1 §4.4) — ADMIN/PRESIDENT seulement.
    bandeauForfait: {
      proche: 'Votre forfait {{forfait}} arrive à échéance le {{date}}.',
      grace: "Forfait {{forfait}} expiré le {{date}} : ses fonctionnalités restent actives jusqu'au {{fin}}.",
      expire: "Forfait {{forfait}} expiré : ses fonctionnalités sont suspendues, rien n'est perdu.",
      voir: 'Voir le forfait',
      fermer: 'Masquer ce message',
    },
```

Dans `frontend/src/locales/en/shell.ts`, remplacer :

```ts
  shell: {
    organisation: 'Organisation',
```

par :

```ts
  shell: {
    organisation: 'Organisation',
    // Plan end-date banner (spec 1.1 §4.4) — ADMIN/PRESIDENT only.
    bandeauForfait: {
      proche: 'Your {{forfait}} plan ends on {{date}}.',
      grace: '{{forfait}} plan expired on {{date}}: its features remain active until {{fin}}.',
      expire: '{{forfait}} plan expired: its features are suspended, nothing is lost.',
      voir: 'View the plan',
      fermer: 'Hide this message',
    },
```

- [ ] **Step 5 : Montage dans la coquille**

Dans `frontend/src/components/AppShell.tsx`, remplacer :

```tsx
import { CommandPalette } from '@/components/CommandPalette'
```

par :

```tsx
import { BandeauForfait } from '@/components/BandeauForfait'
import { CommandPalette } from '@/components/CommandPalette'
```

Remplacer :

```tsx
          className={cn('mx-auto px-5 py-8 sm:px-8 sm:py-10', largeur)}
        >
          {children}
```

par :

```tsx
          className={cn('mx-auto px-5 py-8 sm:px-8 sm:py-10', largeur)}
        >
          <BandeauForfait />
          {children}
```

- [ ] **Step 6 : Lancer, constater le succès**

Run : `cd frontend && npx vitest --run src/components/BandeauForfait.test.tsx`
Expected : PASS (8 tests).

- [ ] **Step 7 : Build + lint + tests**

Run : `cd frontend && npm run build && npm run lint && npm run test`
Expected : build OK (parité FR/EN des catalogues vérifiée par tsc) ; lint sans finding ; tous les tests passent.

- [ ] **Step 8 : Commit**

```bash
git add frontend/src/components/BandeauForfait.tsx frontend/src/components/BandeauForfait.test.tsx frontend/src/components/AppShell.tsx frontend/src/locales/fr/shell.ts frontend/src/locales/en/shell.ts
git commit -m "feat(shell): bandeau d'echeance du forfait pour le bureau dirigeant

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```

---

### Task 8 : Invariants dans CLAUDE.md, roadmap, vérification complète et visuelle

**Files:**
- Modify: `CLAUDE.md` (section « Forfaits (SaaS §3.1) » et « Scheduler notifications »)
- Modify: `docs/roadmap-v1-vers-GA.md` (ligne 1.1)

**Interfaces:**
- Consumes : tout ce qui précède.

- [ ] **Step 1 : CLAUDE.md**

Dans `CLAUDE.md`, remplacer (1 occurrence, vérifier avec `grep -cF`) :

```
Prolongation = `POST /platform/organisations/:id/forfait/prolonger` : `apercu` calculé par la MÊME fonction que l'écriture, écriture CONDITIONNELLE sur l'ancienne échéance (409 si concurrente), 409 sur GRATUIT, trace `PROLONGER_FORFAIT`.
```

par :

```
Prolongation = `POST /platform/organisations/:id/forfait/prolonger` : `apercu` calculé par la MÊME fonction que l'écriture, écriture CONDITIONNELLE sur l'ancienne échéance (409 si concurrente), 409 sur GRATUIT, trace `PROLONGER_FORFAIT`. **Relances (étape 4)** — `services/forfait-relances.service.ts`, branché dans la tâche de nuit : étape la plus récente atteinte (`etapeRelanceForfait` : J-30/J-7/J-1/grâce, jamais de rattrapage en rafale), notification `FORFAIT_ECHEANCE` aux seuls ADMIN/PRESIDENT actifs, dédoublonnée par `entiteId = <org>#<échéance ISO>#<étape>` (une prolongation change la clé → le cycle se réarme), push + e-mail (`envoyerMessage`) **collectés dans la transaction et livrés APRÈS le commit**. **`FORFAIT_ECHEANCE` n'est PAS désactivable** : absent de `TYPES_NOTIFICATION` (dont dérive le schéma des préférences) et listé dans `TYPES_NOTIFICATION_NON_DESACTIVABLES` — garde `tests/types-notification-parity.test.ts` (enum Postgres = désactivables ∪ non désactivables). Bandeau `components/BandeauForfait.tsx` en tête de `#contenu-principal` (ADMIN/PRESIDENT via `peutGererForfait`, miroir de `ROLES_RELANCE_FORFAIT` gardé par `roles-parity.test.ts`) : règle d'affichage pure `lib/bandeau-forfait.ts`, `role="status"`, grâce non fermable.
```

- [ ] **Step 2 : Roadmap**

Dans `docs/roadmap-v1-vers-GA.md`, remplacer (1 occurrence) :

```
**Reste** : **étape 3 « Quotas »** (stockage — *calibrer d'abord sur l'usage mesuré en production* —, paiement en ligne selon le forfait, textes publics accueil + CGU) et **étape 4 « Relances et bandeau »** (notifications d'échéance par la tâche de nuit, bandeau dans l'application), puis `docs/architecture-forfaits.md`.
```

par :

```
**✅ Étape 4 « Relances et bandeau »** : relances de nuit J-30/J-7/J-1/grâce aux ADMIN/PRESIDENT (notification non désactivable `FORFAIT_ECHEANCE` + push + e-mail, dédoublonnées et réarmées à la prolongation), bandeau d'échéance dans la coquille. **Reste** : **étape 3 « Quotas »** (stockage — *calibrer d'abord sur l'usage mesuré en production* —, paiement en ligne selon le forfait, textes publics accueil + CGU), puis `docs/architecture-forfaits.md`.
```

- [ ] **Step 3 : Vérification complète backend** (intégrations comprises, base JETABLE)

```bash
createdb nkoni_it_relances
cd backend
DB="postgresql://$(id -un)@localhost:5432/nkoni_it_relances?sslmode=disable"
DATABASE_URL="$DB" npx prisma migrate deploy
npx prisma generate
npm run build
npm run test -- --run --exclude '**/*.integration.test.ts'
DATABASE_URL="$DB" npx vitest --run tests/*.integration.test.ts
```

Expected : migration `20260913180000_type_notification_forfait_echeance` appliquée ; build OK ; tous les tests unitaires et d'intégration passent. **Conserver la base** pour le step 5.

- [ ] **Step 4 : Vérification complète frontend**

Run : `cd frontend && npm run build && npm run lint && npm run test`
Expected : build OK ; lint sans finding ; tous les tests passent.

- [ ] **Step 5 : Vérification réelle de la tâche de nuit et visuelle (contrôleur)**

1. Backend sur la base jetable (port 3100) et frontend (port 5310) via les outils de preview ; données fictives (`scripts/demo-video/seed.mjs`), organisation passée en PRO avec échéance à J-5 :
   `UPDATE "Organisation" SET forfait='PRO', "forfaitExpireLe" = date_trunc('day', now() AT TIME ZONE 'Africa/Douala') + interval '5 days' + interval '22 hours 59 minutes 59.999 seconds' WHERE nom='Association Les Bâtisseurs';`
2. Exécuter la tâche réelle contre la base (script temporaire hors dépôt, `tsx`) : `executerRelancesForfaitToutesOrgs(prisma)` puis relire `SELECT type, "entiteId", "destinataireId" FROM "Notification" WHERE type='FORFAIT_ECHEANCE'` → une ligne par ADMIN/PRESIDENT, clé `…#J7` ; relancer → aucune ligne de plus.
3. Captures à 390 px et 1280 px : tableau de bord de la trésorière ADMIN (bandeau « arrive à échéance », fermable) ; puis passer l'échéance en grâce (`- interval '3 days'`) → bandeau or non fermable ; compte membre (`awa.ngono@batisseurs.demo`) → aucun bandeau. Aucun débordement horizontal.
4. Arrêter les serveurs ; `dropdb --if-exists --force nkoni_it_relances`.

- [ ] **Step 6 : Commit**

```bash
git add CLAUDE.md docs/roadmap-v1-vers-GA.md
git commit -m "docs(forfaits): invariants des relances et du bandeau, roadmap a jour

Co-Authored-By: <modèle réel> <noreply@anthropic.com>"
```
