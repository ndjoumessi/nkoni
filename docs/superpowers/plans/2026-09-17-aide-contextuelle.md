# Aide contextuelle « ? » sur les notions clés — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter une icône « ? » accessible à côté de 17 notions métier de NKONI, ouvrant une courte explication FR/EN tirée d'un catalogue central, et clore la roadmap 1.2.

**Architecture:** Un catalogue typé (`lib/aide.ts` : liste des notions et liens optionnels) et un namespace i18n `aide` (FR source, EN miroir typé) portent le contenu. Un composant partagé `components/ui/AideNotion.tsx` rend le bouton « ? » et la bulle en portail via la primitive existante `usePopoverFlottant`. `Field` et `PageHeader` reçoivent une prop optionnelle `aide` pour placer le « ? » à côté de leur libellé sans l'imbriquer dans un `<label>` ou un `<h1>`.

**Tech Stack:** Vite + React 19, react-i18next, Tailwind v4 (jetons du design system), Vitest (`node` + `jsdom` par docblock), oxlint.

**Spec:** `docs/superpowers/specs/2026-09-17-aide-contextuelle-design.md`

## Global Constraints

- Français partout (code métier, commentaires, commits) ; branche `feat/aide-contextuelle` (le commit de la spec y est repris), jamais de commit sur `main`, merge `--no-ff` par PR (le PO fusionne).
- Déclencheur = vrai `<button type="button">`, zone tactile 44 px (classe `.tap-target` existante), nom accessible « Aide : <titre> », `aria-expanded`, `aria-controls`.
- Bulle en **portail** via `usePopoverFlottant` (`components/ui/usePopoverFlottant.tsx`) — ne jamais recréer un popover `absolute`.
- Ouverture au clic et au clavier, **jamais au survol** ; fermeture Échap (focus rendu au « ? »), clic extérieur, second clic.
- Jetons uniquement (`hairline`, `surface`, `brass`, `faint`, `foreground`, `muted-foreground`), aucune valeur oklch en dur ; échelle z des popovers `z-50`.
- **Au plus un « ? » par notion dans un même écran** ; jamais dans les lignes d'un tableau ou d'une liste ; jamais sur les écrans publics (accueil, connexion, inscription, statut) ni la console super-admin.
- Rédaction : vouvoiement, **3 phrases au plus**, aucun nom technique ; EN fidèle ; toute règle citée conforme au code.
- Aucune logique de rôle ni appel réseau dans le composant.
- Front uniquement : aucun fichier sous `backend/` modifié.
- Vérification avant présentation : `cd frontend && npm run build && npm run lint && npm run test` (lint : 0 finding).
- Messages de commit terminés par `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

## Écarts assumés par rapport à la spec (à reporter dans la spec en Task 4)

1. **`recuAnnule` + `envoyerRecu` fusionnées en une notion `recus`** : dans l'application, ces deux notions n'ont de libellé que dans les LIGNES de la liste des versements (badge « Reçu n° … annulé », bouton « Envoyer »), où la spec interdit le « ? ». La notion unique est placée sur l'en-tête de section « Cotisations » de la fiche membre, qui contient ces lignes. **17 notions** au lieu de 18.
2. **`ouvrirAnnee`** : la spec écrivait « nécessaire pour encaisser » ; c'est faux (un versement sur une année non ouverte l'ouvre pour le membre concerné, cf. `BaremePage.tsx` commentaire au-dessus de la carte « Ouvrir »). Le texte ci-dessous est conforme au code.

## File Structure

| Fichier | Rôle |
|---|---|
| `frontend/src/lib/aide.ts` (nouveau) | `NOTIONS_AIDE`, `type NotionAide`, `LIENS_AIDE` |
| `frontend/src/locales/fr/aide.ts`, `en/aide.ts` (nouveaux) + `index.ts` FR/EN | textes des notions |
| `frontend/src/lib/aide-catalogue.test.ts` (nouveau) | complétude FR/EN, jamais vacant |
| `frontend/src/components/ui/AideNotion.tsx` (nouveau) + `.test.tsx` | bouton « ? » + bulle en portail |
| `frontend/src/components/ui/Field.tsx`, `PageHeader.tsx` | prop optionnelle `aide` |
| pages et composants listés en Task 3 | placement des 17 notions |
| `frontend/src/lib/aide-usage.test.ts` (nouveau) | chaque notion utilisée au moins une fois |
| `docs/architecture-frontend.md`, `CLAUDE.md`, `docs/roadmap-v1-vers-GA.md`, la spec | documentation |

---

### Task 1: Catalogue des notions et textes FR/EN

**Files:**
- Create: `frontend/src/lib/aide.ts`
- Create: `frontend/src/locales/fr/aide.ts`, `frontend/src/locales/en/aide.ts`
- Modify: `frontend/src/locales/fr/index.ts`, `frontend/src/locales/en/index.ts`
- Test: `frontend/src/lib/aide-catalogue.test.ts`

**Interfaces:**
- Produces: `NOTIONS_AIDE: readonly [...]` (17 identifiants ci-dessous), `type NotionAide`, `LIENS_AIDE: Partial<Record<NotionAide, string>>`, clés i18n `aide.libelleBouton` (interpolation `{{titre}}`), `aide.enSavoirPlus`, `aide.notions.<notion>.titre`, `aide.notions.<notion>.texte`.

- [ ] **Step 1: Écrire le test de complétude**

`frontend/src/lib/aide-catalogue.test.ts` :

```ts
import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/aide'
import en from '@/locales/en/aide'
import { LIENS_AIDE, NOTIONS_AIDE } from './aide'

/**
 * Chaque notion du catalogue a un titre et un texte NON VIDES dans les deux langues. Le typage EN
 * garantit la parité des CLÉS avec le FR, pas qu'une notion de `NOTIONS_AIDE` ait bien son entrée :
 * c'est l'objet de ce test.
 */
describe('catalogue d’aide', () => {
  it('n’est jamais vacant', () => {
    expect(NOTIONS_AIDE.length).toBeGreaterThan(0)
  })

  it.each([
    ['fr', fr],
    ['en', en],
  ])('chaque notion a un titre et un texte en %s', (_langue, catalogue) => {
    const notions = catalogue.aide.notions as Record<string, { titre?: string; texte?: string }>
    for (const notion of NOTIONS_AIDE) {
      expect(notions[notion]?.titre?.trim(), `${notion}.titre`).toBeTruthy()
      expect(notions[notion]?.texte?.trim(), `${notion}.texte`).toBeTruthy()
    }
  })

  it('aucune entrée de texte sans notion déclarée (pas de texte orphelin)', () => {
    expect(Object.keys(fr.aide.notions).sort()).toEqual([...NOTIONS_AIDE].sort())
  })

  it('les liens « En savoir plus » visent des routes internes', () => {
    for (const lien of Object.values(LIENS_AIDE)) expect(lien).toMatch(/^\/[a-z]/)
  })

  it('3 phrases au plus par texte (règle de rédaction)', () => {
    for (const catalogue of [fr, en]) {
      for (const { texte } of Object.values(catalogue.aide.notions)) {
        const phrases = texte.split(/(?<=[.!?])\s+/).filter((p) => p.trim().length > 0)
        expect(phrases.length, texte).toBeLessThanOrEqual(3)
      }
    }
  })
})
```

- [ ] **Step 2: Lancer, constater l'échec**

Run: `cd frontend && npx vitest run src/lib/aide-catalogue.test.ts`
Expected: FAIL — `Failed to resolve import "@/locales/fr/aide"`.

- [ ] **Step 3: Écrire `frontend/src/lib/aide.ts`**

```ts
/**
 * Aide contextuelle (spec 2026-09-17) — catalogue des notions expliquées par le « ? » (`AideNotion`).
 *
 * Une notion = un texte, écrit une fois dans `locales/{fr,en}/aide.ts` et réutilisé partout où elle
 * apparaît. Le type `NotionAide` fait échouer la compilation d'une notion inconnue ; la complétude des
 * textes est vérifiée par `aide-catalogue.test.ts`, l'usage de chaque notion par `aide-usage.test.ts`.
 * Toute règle métier citée dans un texte doit rester conforme au code : changer la règle = changer le
 * texte dans la même PR.
 */
export const NOTIONS_AIDE = [
  'bareme',
  'ouvrirAnnee',
  'attendu',
  'verse',
  'valorise',
  'statutCotisation',
  'equilibrage',
  'anneeAdhesion',
  'finContribution',
  'chefSousFamille',
  'chefOrganisation',
  'recus',
  'circuitDepense',
  'modeRotation',
  'cagnotte',
  'voteResolution',
  'forfaitEcheance',
] as const

export type NotionAide = (typeof NOTIONS_AIDE)[number]

/** Lien « En savoir plus » optionnel (route interne uniquement). */
export const LIENS_AIDE: Partial<Record<NotionAide, string>> = {
  attendu: '/bareme',
}
```

- [ ] **Step 4: Écrire `frontend/src/locales/fr/aide.ts`**

```ts
/** Aide contextuelle (spec 2026-09-17) — FR source de vérité. Vouvoiement, 3 phrases au plus. */
export default {
  aide: {
    libelleBouton: 'Aide : {{titre}}',
    enSavoirPlus: 'En savoir plus',
    notions: {
      bareme: {
        titre: 'Barème annuel',
        texte:
          "Montant de cotisation fixé pour une année. Il sert à calculer ce que chaque membre doit pour cette année-là. Vous pouvez le configurer à l'avance, mais l'année ne s'ouvre qu'une fois commencée.",
      },
      ouvrirAnnee: {
        titre: 'Ouvrir une année',
        texte:
          "Prépare en une fois la cotisation de l'année pour tous les membres actifs, au montant du barème. Ce n'est pas obligatoire pour encaisser : un versement sur une année non ouverte l'ouvre pour le membre concerné. Une année future ne peut pas être ouverte.",
      },
      attendu: {
        titre: 'Total attendu',
        texte:
          "Ce que les membres doivent au total : le barème de chaque année, depuis l'année d'adhésion de chaque membre jusqu'à l'année en cours ou jusqu'à sa fin de contribution.",
      },
      verse: {
        titre: 'Total collecté',
        texte:
          "L'argent encaissé par les versements enregistrés. L'écart avec le total attendu est le reste à collecter.",
      },
      valorise: {
        titre: 'Montant valorisé',
        texte:
          "C'est le montant qui compte pour le statut de cotisation. Il est égal au montant versé, sauf après un équilibrage, qui répartit autrement les versements entre les années sans changer le total.",
      },
      statutCotisation: {
        titre: 'Statut de cotisation',
        texte:
          "À jour : le montant valorisé couvre tout ce qui est attendu jusqu'à cette année. Partiel : il en couvre une partie. Non à jour : aucun montant n'est encore valorisé.",
      },
      equilibrage: {
        titre: 'Équilibrage',
        texte:
          "Répartit ce qu'un membre a déjà versé entre plusieurs années, par exemple pour solder une année ancienne. Il ne crée ni ne retire d'argent : le total reste le même, seule la répartition change.",
      },
      anneeAdhesion: {
        titre: "Année d'adhésion",
        texte: 'Première année pour laquelle le membre doit cotiser. Les années précédentes ne lui sont pas réclamées.',
      },
      finContribution: {
        titre: 'Fin de contribution',
        texte:
          "Dernière année due par le membre. Elle se remplit automatiquement lorsqu'il devient inactif ou décède, et son historique est conservé.",
      },
      chefSousFamille: {
        titre: 'Chef de sous-famille',
        texte:
          'Membre de référence de la sous-famille à laquelle ce membre est rattaché. Il permet de regrouper les membres d’une même sous-famille.',
      },
      chefOrganisation: {
        titre: "Chef de l'organisation",
        texte:
          "Dirigeant désigné de l'organisation, affiché avec son surnom. Un administrateur ou le président le désigne depuis la fiche du membre.",
      },
      recus: {
        titre: 'Reçus',
        texte:
          "Chaque versement donne un reçu numéroté, que vous pouvez télécharger ou envoyer au membre par les canaux configurés. Pour corriger un versement, annulez d'abord son reçu : il garde son numéro et ne peut plus être partagé. Un nouveau reçu est ensuite émis.",
      },
      circuitDepense: {
        titre: "Circuit d'une dépense",
        texte:
          "Une dépense passe de brouillon à en attente, puis elle est approuvée ou rejetée, et enfin payée. L'approbation revient à l'administrateur, au président ou au commissaire aux comptes. Le paiement revient à l'administrateur, au président ou au trésorier.",
      },
      modeRotation: {
        titre: 'Mode de rotation',
        texte:
          "Ordre fixe : l'ordre des bénéficiaires est fixé dès l'ouverture du cycle. Tirage : à chaque tour, un bénéficiaire est tiré au sort parmi ceux qui n'ont pas encore reçu. Le mode enchère n'est pas encore disponible.",
      },
      cagnotte: {
        titre: 'Cagnotte',
        texte:
          'Collecte ponctuelle pour un événement (mariage, deuil…), avec un objectif et des dons. Elle est suivie à part des cotisations annuelles.',
      },
      voteResolution: {
        titre: "Vote d'une résolution",
        texte:
          "Un dirigeant ouvre le vote, puis chaque membre vote pour, contre ou s'abstient. À la clôture, la résolution est adoptée si les « pour » sont plus nombreux que les « contre ». Les abstentions ne comptent pas.",
      },
      forfaitEcheance: {
        titre: 'Forfait et échéance',
        texte:
          "Le forfait fixe les capacités de l'espace (nombre de membres, stockage, paiement en ligne). À l'échéance, une période de grâce de 14 jours s'ouvre. Ensuite, l'espace repasse au forfait Gratuit sans perdre ses données.",
      },
    },
  },
}
```

- [ ] **Step 5: Écrire `frontend/src/locales/en/aide.ts`**

```ts
/** EN mirror of the contextual help namespace (spec 2026-09-17). At most 3 sentences. */
export default {
  aide: {
    libelleBouton: 'Help: {{titre}}',
    enSavoirPlus: 'Learn more',
    notions: {
      bareme: {
        titre: 'Annual fee schedule',
        texte:
          'The contribution amount set for a year. It is used to work out what each member owes for that year. You can set it in advance, but the year can only be opened once it has started.',
      },
      ouvrirAnnee: {
        titre: 'Open a year',
        texte:
          "Prepares the year's contribution for every active member at once, at the schedule amount. It is not required to record payments: a payment for a year that is not open opens it for that member. A future year cannot be opened.",
      },
      attendu: {
        titre: 'Total expected',
        texte:
          "What members owe in total: each year's schedule, from each member's joining year up to the current year or to their contribution end year.",
      },
      verse: {
        titre: 'Total collected',
        texte: 'The money received through recorded payments. The gap with the total expected is what remains to collect.',
      },
      valorise: {
        titre: 'Credited amount',
        texte:
          'This is the amount that counts for the contribution status. It equals the amount paid, except after a rebalancing, which spreads payments differently across years without changing the total.',
      },
      statutCotisation: {
        titre: 'Contribution status',
        texte:
          'Up to date: the credited amount covers everything expected up to this year. Partial: it covers part of it. Not up to date: nothing has been credited yet.',
      },
      equilibrage: {
        titre: 'Rebalancing',
        texte:
          'Spreads what a member has already paid across several years, for example to settle an older year. It neither adds nor removes money: the total stays the same, only the split changes.',
      },
      anneeAdhesion: {
        titre: 'Joining year',
        texte: 'The first year for which the member owes a contribution. Earlier years are not charged.',
      },
      finContribution: {
        titre: 'Contribution end',
        texte:
          'The last year owed by the member. It is filled in automatically when the member becomes inactive or passes away, and their history is kept.',
      },
      chefSousFamille: {
        titre: 'Sub-family head',
        texte: 'The reference member of the sub-family this member belongs to. It is used to group members of the same sub-family.',
      },
      chefOrganisation: {
        titre: 'Head of the organisation',
        texte:
          "The organisation's designated leader, shown with their nickname. An administrator or the president designates them from the member's page.",
      },
      recus: {
        titre: 'Receipts',
        texte:
          'Each payment produces a numbered receipt that you can download or send to the member through the configured channels. To correct a payment, first cancel its receipt: it keeps its number and can no longer be shared. A new receipt is then issued.',
      },
      circuitDepense: {
        titre: 'Expense workflow',
        texte:
          'An expense goes from draft to pending, is then approved or rejected, and finally paid. Approval is done by the administrator, the president or the auditor. Payment is done by the administrator, the president or the treasurer.',
      },
      modeRotation: {
        titre: 'Rotation mode',
        texte:
          'Fixed order: the order of beneficiaries is set when the cycle opens. Draw: each round, a beneficiary is drawn at random among those who have not received yet. The auction mode is not available yet.',
      },
      cagnotte: {
        titre: 'Fund',
        texte:
          'A one-off collection for an event (wedding, bereavement…), with a target and donations. It is tracked separately from annual contributions.',
      },
      voteResolution: {
        titre: 'Resolution vote',
        texte:
          'A leader opens the vote, then each member votes for, against or abstains. When the vote closes, the resolution is adopted if there are more votes for than against. Abstentions are not counted.',
      },
      forfaitEcheance: {
        titre: 'Plan and expiry',
        texte:
          "The plan sets the space's capabilities (number of members, storage, online payment). At expiry, a 14-day grace period starts. After that, the space returns to the Free plan without losing its data.",
      },
    },
  },
}
```

- [ ] **Step 6: Brancher les catalogues**

Dans `frontend/src/locales/fr/index.ts` : `import aide from './aide'` après `import demo from './demo'`, et `...aide,` après `...demo,` dans l'objet `fr`. Même chose dans `frontend/src/locales/en/index.ts` (objet `en`).

- [ ] **Step 7: Relancer, constater le vert, saboter**

Run: `cd frontend && npx vitest run src/lib/aide-catalogue.test.ts` → PASS.
Sabotage : vider `texte` de `recus` dans `en/aide.ts` (`texte: ''`), vérifier par `grep -n "texte: ''" src/locales/en/aide.ts`, relancer → FAIL sur `recus.texte`. Annuler, relancer → PASS.

- [ ] **Step 8: Build, lint, tests, commit**

Run: `cd frontend && npm run build && npm run lint && npm run test` → tout vert, 0 finding.

```bash
git add frontend/src/lib/aide.ts frontend/src/lib/aide-catalogue.test.ts frontend/src/locales
git commit -m "feat(aide): catalogue des notions et textes FR/EN de l'aide contextuelle

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Composant `AideNotion` et props `aide` de `Field` / `PageHeader`

**Files:**
- Create: `frontend/src/components/ui/AideNotion.tsx`
- Test: `frontend/src/components/ui/AideNotion.test.tsx`
- Modify: `frontend/src/components/ui/Field.tsx` (fonction `Field`)
- Modify: `frontend/src/components/ui/PageHeader.tsx`

**Interfaces:**
- Consumes (Task 1): `NotionAide`, `LIENS_AIDE` depuis `@/lib/aide` ; clés `aide.libelleBouton`, `aide.enSavoirPlus`, `aide.notions.<notion>.{titre,texte}`.
- Consumes: `usePopoverFlottant({ open, onFermer, largeurDefaut, hauteurDefaut })` → `{ containerRef, triggerRef, popoverRef, rendreFlottant(enfants, { className, 'aria-label' }) }` ; `cleI18n` depuis `@/lib/i18n`.
- Produces: `export function AideNotion({ notion, className }: { notion: NotionAide; className?: string })` ; `Field` prop `aide?: ReactNode` ; `PageHeader` prop `aide?: ReactNode`.

- [ ] **Step 1: Écrire les tests du composant**

`frontend/src/components/ui/AideNotion.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AideNotion } from './AideNotion'
import { Field, Input } from './Field'
import { PageHeader } from './PageHeader'

// t → « clé » ou « clé|{options JSON} » (le libellé du bouton interpole le titre).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (cle: string, o?: object) => (o ? `${cle}|${JSON.stringify(o)}` : cle),
    i18n: { language: 'fr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

afterEach(cleanup)

const rendre = (noeud: React.ReactNode) => render(<MemoryRouter>{noeud}</MemoryRouter>)
const bouton = () => screen.getByRole('button', { name: /aide\.libelleBouton/ })

describe('AideNotion', () => {
  it('bouton accessible : nom contenant le titre de la notion, fermé par défaut', () => {
    rendre(<AideNotion notion="valorise" />)
    const b = bouton()
    expect(b.getAttribute('type')).toBe('button')
    expect(b.getAttribute('aria-label')).toContain('aide.notions.valorise.titre')
    expect(b.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ouvre au clic une bulle en PORTAIL (hors du conteneur), reliée par aria-controls', () => {
    rendre(
      <div data-testid="hote" style={{ transform: 'translateY(0)' }}>
        <AideNotion notion="valorise" />
      </div>,
    )
    fireEvent.click(bouton())
    const bulle = screen.getByRole('dialog')
    expect(bouton().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('hote').contains(bulle)).toBe(false)
    expect(bulle.parentElement).toBe(document.body)
    expect(bulle.textContent).toContain('aide.notions.valorise.texte')
    expect(bouton().getAttribute('aria-controls')).toBe(bulle.querySelector('[id]')?.id)
  })

  it('second clic referme', () => {
    rendre(<AideNotion notion="valorise" />)
    fireEvent.click(bouton())
    fireEvent.click(bouton())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Échap sur le bouton referme et garde le focus sur le « ? »', () => {
    rendre(<AideNotion notion="valorise" />)
    bouton().focus()
    fireEvent.click(bouton())
    fireEvent.keyDown(bouton(), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(bouton())
  })

  it('Échap dans la bulle referme et rend le focus au « ? »', () => {
    rendre(<AideNotion notion="attendu" />)
    fireEvent.click(bouton())
    // Sur le CONTENU de la bulle (le conteneur du portail a son propre Échap, sans refocus).
    fireEvent.keyDown(screen.getByText('aide.notions.attendu.texte'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(bouton())
  })

  it('clic extérieur referme', () => {
    rendre(
      <>
        <p data-testid="dehors">dehors</p>
        <AideNotion notion="valorise" />
      </>,
    )
    fireEvent.click(bouton())
    fireEvent.mouseDown(screen.getByTestId('dehors'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lien « En savoir plus » seulement pour une notion qui en a un', () => {
    rendre(<AideNotion notion="attendu" />)
    fireEvent.click(bouton())
    expect(screen.getByRole('link', { name: 'aide.enSavoirPlus' }).getAttribute('href')).toBe('/bareme')
    cleanup()
    rendre(<AideNotion notion="valorise" />)
    fireEvent.click(bouton())
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('prop aide de Field et PageHeader', () => {
  it('Field : le « ? » est à côté du <label>, pas dedans', () => {
    rendre(
      <Field label="Année d'adhésion" aide={<AideNotion notion="anneeAdhesion" />}>
        <Input />
      </Field>,
    )
    const label = screen.getByText("Année d'adhésion").closest('label') as HTMLLabelElement
    expect(label.querySelector('button')).toBeNull()
    expect(bouton()).toBeTruthy()
    // Le label reste relié au contrôle.
    expect(screen.getByLabelText("Année d'adhésion")).toBeTruthy()
  })

  it('PageHeader : le « ? » est à côté du <h1>, pas dedans', () => {
    rendre(<PageHeader title="Barème" aide={<AideNotion notion="bareme" />} />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('Barème')
    expect(h1.querySelector('button')).toBeNull()
    expect(bouton()).toBeTruthy()
  })
})
```

- [ ] **Step 2: Lancer, constater l'échec**

Run: `cd frontend && npx vitest run src/components/ui/AideNotion.test.tsx`
Expected: FAIL — `Failed to resolve import "./AideNotion"`.

- [ ] **Step 3: Écrire `frontend/src/components/ui/AideNotion.tsx`**

```tsx
import { useCallback, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CircleHelp } from 'lucide-react'
import { LIENS_AIDE, type NotionAide } from '@/lib/aide'
import { cleI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { usePopoverFlottant } from './usePopoverFlottant'

/**
 * Aide contextuelle (spec 2026-09-17) : un « ? » à côté d'une notion métier, qui ouvre une courte
 * explication tirée du catalogue (`lib/aide.ts` + namespace i18n `aide`). Primitive PARTAGÉE — ne pas
 * recréer d'infobulle ad hoc.
 *
 * - Ouverture au clic et au clavier, JAMAIS au survol (absent sur mobile, gênant au lecteur d'écran).
 * - Bulle en PORTAIL via `usePopoverFlottant` (immunité aux contextes d'empilement `nk-reveal`).
 * - Échap referme et rend le focus au « ? » ; clic extérieur et second clic referment.
 * - Placement : à côté d'un libellé, jamais DANS un `<label>` ou un titre (`Field`/`PageHeader` ont une
 *   prop `aide`), jamais dans une ligne de tableau ; au plus un « ? » par notion dans un écran.
 */
export function AideNotion({ notion, className }: { notion: NotionAide; className?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const idTexte = useId()
  const fermer = useCallback(() => setOpen(false), [])
  const { containerRef, triggerRef, rendreFlottant } = usePopoverFlottant({
    open,
    onFermer: fermer,
    largeurDefaut: 288,
    hauteurDefaut: 160,
  })

  const titre = t(cleI18n(`aide.notions.${notion}.titre`))
  const lien = LIENS_AIDE[notion]

  const fermerEtRefocaliser = () => {
    setOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <span ref={containerRef} className={cn('relative inline-flex align-middle', className)}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault()
            fermerEtRefocaliser()
          }
        }}
        aria-label={t('aide.libelleBouton', { titre })}
        aria-expanded={open}
        aria-controls={open ? idTexte : undefined}
        className="tap-target inline-flex h-5 w-5 items-center justify-center rounded-full text-faint transition-colors hover:text-brass focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60"
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open &&
        rendreFlottant(
          <div
            id={idTexte}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                fermerEtRefocaliser()
              }
            }}
            className="w-72 max-w-[calc(100vw-1rem)] rounded-xl border border-hairline-strong bg-surface p-4 text-left normal-case tracking-normal shadow-2xl"
          >
            <p className="text-sm font-semibold text-foreground">{titre}</p>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {t(cleI18n(`aide.notions.${notion}.texte`))}
            </p>
            {lien && (
              <Link
                to={lien}
                onClick={() => setOpen(false)}
                className="mt-2 inline-block text-sm font-medium text-brass underline-offset-4 hover:underline"
              >
                {t('aide.enSavoirPlus')}
              </Link>
            )}
          </div>,
          { className: 'z-50', 'aria-label': titre },
        )}
    </span>
  )
}
```

Note : `aria-controls` vise l'élément `#idTexte` à l'intérieur du dialog rendu par la primitive (qui ne permet pas de poser un `id` sur son conteneur) ; le test l'asserte ainsi. L'Échap posé sur le contenu fait `preventDefault`, donc le gestionnaire Échap de la primitive ne double-ferme pas.

- [ ] **Step 4: Prop `aide` de `Field` (`frontend/src/components/ui/Field.tsx`)**

Ajouter `aide?: ReactNode` à la déstructuration et au type des props de `Field`, avec le commentaire `/** « ? » d'aide contextuelle, rendu À CÔTÉ du <label> (jamais dedans : un bouton dans un label est un contrôle imbriqué). */`. Remplacer le bloc `<label …>…</label>` par :

```tsx
      {aide ? (
        <div className="mb-1.5 flex items-center gap-1">
          <label
            htmlFor={controlId}
            className="flex items-center gap-1 text-2xs font-medium uppercase tracking-[0.1em] text-faint"
          >
            {label}
            {required && (
              <span className="text-brass" aria-hidden="true">
                *
              </span>
            )}
          </label>
          {aide}
        </div>
      ) : (
        <label
          htmlFor={controlId}
          className="mb-1.5 flex items-center gap-1 text-2xs font-medium uppercase tracking-[0.1em] text-faint"
        >
          {label}
          {required && (
            <span className="text-brass" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
```

(Sans `aide`, le rendu est strictement identique à l'existant.)

- [ ] **Step 5: Prop `aide` de `PageHeader` (`frontend/src/components/ui/PageHeader.tsx`)**

Ajouter `aide?: ReactNode` aux props (même commentaire, « à côté du titre »). Remplacer le `<h1 …>{title}</h1>` par :

```tsx
          {aide ? (
            <div className="mt-1 flex items-center gap-2">
              <h1 className="text-balance font-display text-[1.9rem] font-semibold leading-tight tracking-tight text-foreground">
                {title}
              </h1>
              {aide}
            </div>
          ) : (
            <h1 className="mt-1 text-balance font-display text-[1.9rem] font-semibold leading-tight tracking-tight text-foreground">
              {title}
            </h1>
          )}
```

- [ ] **Step 6: Relancer, constater le vert, saboter**

Run: `cd frontend && npx vitest run src/components/ui/AideNotion.test.tsx` → PASS.
Sabotages (vérifiés par `grep`, puis annulés) :
1. Retirer `triggerRef.current?.focus()` de `fermerEtRefocaliser` → « Échap dans la bulle … rend le focus » au rouge.
2. Dans `Field`, rendre `{aide}` à l'intérieur du `<label>` → « le « ? » est à côté du <label> » au rouge.

- [ ] **Step 7: Build, lint, tests, commit**

Run: `cd frontend && npm run build && npm run lint && npm run test` → tout vert, 0 finding.

```bash
git add frontend/src/components/ui/AideNotion.tsx frontend/src/components/ui/AideNotion.test.tsx frontend/src/components/ui/Field.tsx frontend/src/components/ui/PageHeader.tsx
git commit -m "feat(aide): composant AideNotion (« ? » en portail) et prop aide de Field/PageHeader

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Placer les 17 notions et garde d'usage

**Files:**
- Test: `frontend/src/lib/aide-usage.test.ts` (nouveau)
- Modify: `frontend/src/pages/BaremePage.tsx`, `frontend/src/components/dashboard/RecouvrementHero.tsx`, `frontend/src/pages/MembreDetailPage.tsx`, `frontend/src/pages/EquilibrageFormPage.tsx`, `frontend/src/pages/MembreFormPage.tsx`, `frontend/src/pages/ParametresPage.tsx`, `frontend/src/pages/TresoreriePage.tsx`, `frontend/src/pages/TontinesPage.tsx`, `frontend/src/pages/CagnottesPage.tsx`, `frontend/src/pages/ReunionDetailPage.tsx`

**Interfaces:**
- Consumes (Tasks 1-2): `AideNotion` (`@/components/ui/AideNotion`), `NOTIONS_AIDE` (`@/lib/aide`), props `aide` de `Field` et `PageHeader`.

- [ ] **Step 1: Écrire la garde d'usage**

`frontend/src/lib/aide-usage.test.ts` :

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NOTIONS_AIDE } from './aide'

/**
 * Chaque notion du catalogue est placée au moins une fois (`notion="<id>"` dans `src/`, tests exclus) :
 * pas de texte mort à maintenir en deux langues. Lecture EN TEXTE, comme les autres gardes de parité.
 */
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom)
    if (statSync(chemin).isDirectory()) return fichiers(chemin)
    return /\.tsx$/.test(nom) && !/\.test\.tsx$/.test(nom) ? [chemin] : []
  })
}

describe('aide contextuelle — usage', () => {
  it('chaque notion du catalogue est placée au moins une fois', () => {
    const source = fichiers(SRC).map((f) => readFileSync(f, 'utf8')).join('\n')
    const utilisees = new Set([...source.matchAll(/notion="([A-Za-z]+)"/g)].map((m) => m[1]))
    expect(utilisees.size).toBeGreaterThan(0) // jamais vacant
    expect(NOTIONS_AIDE.filter((n) => !utilisees.has(n))).toEqual([])
  })
})
```

Run: `cd frontend && npx vitest run src/lib/aide-usage.test.ts` → FAIL (les 17 notions absentes).

- [ ] **Step 2: Placements**

Dans chaque fichier, ajouter `import { AideNotion } from '@/components/ui/AideNotion'` avec les autres imports `@/components/ui/*`.

1. `BaremePage.tsx` — `bareme` et `ouvrirAnnee` :
   - `<PageHeader overline={t('bareme.overline')} title={t('bareme.titre')} …` → ajouter la prop `aide={<AideNotion notion="bareme" />}`.
   - Remplacer `<Overline>{t('bareme.ouvrir.titre')}</Overline>` par :
     ```tsx
     <div className="flex items-center gap-1">
       <Overline>{t('bareme.ouvrir.titre')}</Overline>
       <AideNotion notion="ouvrirAnnee" />
     </div>
     ```
2. `RecouvrementHero.tsx` — `verse` et `attendu` : juste après `{t('dashboard.hero.totalCollecte')}` (dans le même `<span className="flex items-center gap-2.5 …">`), ajouter `<AideNotion notion="verse" />` ; juste après `{t('dashboard.hero.totalAttendu')}`, ajouter `<AideNotion notion="attendu" />`. (Le héros est rendu une fois par vue du tableau de bord : une seule occurrence par écran.)
3. `MembreDetailPage.tsx` — `statutCotisation`, `valorise`, `equilibrage`, `recus` :
   - Dans le `description` du `PageHeader`, remplacer `{statut && <StatutCotisationBadge statut={statut.statut} size="sm" />}` par :
     ```tsx
     {statut && (
       <span className="inline-flex items-center gap-1">
         <StatutCotisationBadge statut={statut.statut} size="sm" />
         <AideNotion notion="statutCotisation" />
       </span>
     )}
     ```
   - Remplacer `<Overline>{t('membres.detail.totalValorise')}</Overline>` par :
     ```tsx
     <div className="flex items-center gap-1">
       <Overline>{t('membres.detail.totalValorise')}</Overline>
       <AideNotion notion="valorise" />
     </div>
     ```
   - Juste après le lien d'action `{t('membres.detail.equilibrer')}` (le `ButtonLink`/`Link` vers `/membres/${membre.id}/equilibrage`, fermé), ajouter `<AideNotion notion="equilibrage" />` comme élément frère dans le même conteneur. **Ne pas** le placer aussi sur `EquilibrageFormPage` depuis cet écran ; la page Équilibrage a le sien (étape 4), c'est un autre écran.
   - Remplacer `<Overline>{t('membres.detail.contributions')}</Overline>` (en-tête de la carte « Cotisations » qui contient la liste des versements et leurs reçus) par :
     ```tsx
     <div className="flex items-center gap-1">
       <Overline>{t('membres.detail.contributions')}</Overline>
       <AideNotion notion="recus" />
     </div>
     ```
4. `EquilibrageFormPage.tsx` — `equilibrage` : ajouter `aide={<AideNotion notion="equilibrage" />}` au `PageHeader` (`title={t('equilibrages.header.titre')}`).
5. `MembreFormPage.tsx` — `anneeAdhesion`, `chefSousFamille`, `finContribution` : ajouter la prop `aide` aux trois `Field` :
   - `label={t('membres.form.champ.anneeAdhesion')}` → `aide={<AideNotion notion="anneeAdhesion" />}`
   - `label={t('membres.form.champ.chefSousFamille')}` → `aide={<AideNotion notion="chefSousFamille" />}`
   - `label={t('membres.form.champ.anneeFinContribution')}` → `aide={<AideNotion notion="finContribution" />}`
6. `ParametresPage.tsx` — `chefOrganisation`, `forfaitEcheance` :
   - Ajouter à la fonction locale `Info` une prop optionnelle `aide?: ReactNode` (importer `type ReactNode` depuis `react`) et rendre `<dt>` ainsi :
     ```tsx
     <dt className="flex items-center gap-1 text-2xs font-medium uppercase tracking-[0.12em] text-faint">
       {label}
       {aide}
     </dt>
     ```
     puis `<Info icon={Crown} label={t('parametres.infos.chef')} value={chefLabel} aide={<AideNotion notion="chefOrganisation" />} />`.
   - Remplacer le `<span className="text-xs uppercase tracking-wide text-faint">{t(cleI18n(`commun.forfaits.${org.forfait}`))}</span>` par :
     ```tsx
     <span className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-faint">
       {t(cleI18n(`commun.forfaits.${org.forfait}`))}
       <AideNotion notion="forfaitEcheance" />
     </span>
     ```
7. `TresoreriePage.tsx` — `circuitDepense` : remplacer `<Overline>{t('tresorerie.liste.titre')}</Overline>` par :
   ```tsx
   <div className="flex items-center gap-1">
     <Overline>{t('tresorerie.liste.titre')}</Overline>
     <AideNotion notion="circuitDepense" />
   </div>
   ```
8. `TontinesPage.tsx` — `modeRotation` : ajouter `aide={<AideNotion notion="modeRotation" />}` au `Field` `label={t('tontines.creation.modeRotation')}`.
9. `CagnottesPage.tsx` — `cagnotte` : ajouter `aide={<AideNotion notion="cagnotte" />}` au `PageHeader` (`title={t('cagnottes.liste.titre')}`).
10. `ReunionDetailPage.tsx` — `voteResolution` : dans l'en-tête de la carte Résolutions (`<div className="flex items-center gap-2"><Gavel …/><Overline>{t('resolutions.titre')}</Overline></div>`), ajouter `<AideNotion notion="voteResolution" />` après l'`Overline`.

Garder la règle : un seul « ? » par notion dans un même écran (vérifier que `MembreDetailPage` ne contient chaque `notion="…"` qu'une fois : `grep -c 'notion="' src/pages/MembreDetailPage.tsx` doit valoir 4).

- [ ] **Step 3: Vérifier la garde d'usage et la saboter**

Run: `cd frontend && npx vitest run src/lib/aide-usage.test.ts` → PASS.
Sabotage : retirer `<AideNotion notion="cagnotte" />` de `CagnottesPage.tsx`, vérifier par `grep -c 'notion="cagnotte"' src/pages/CagnottesPage.tsx` (0), relancer → FAIL listant `cagnotte`. Rétablir → PASS.

- [ ] **Step 4: Tests existants des pages touchées**

Les tests jsdom existants qui montent ces pages ou composants (ex. `pages/MembreDetailPage.test.tsx`, `components/SortieDemo.integration.test.tsx`, `pages/SuperAdminPage.test.tsx`) doivent rester verts sans modification ; si l'un d'eux cherche un élément par un nom désormais ambigu (un second bouton dans un menu, par exemple), resserrer son sélecteur plutôt que retirer l'aide.

Run: `cd frontend && npm run build && npm run lint && npm run test` → tout vert, 0 finding.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(aide): « ? » sur les 17 notions clés et garde d'usage

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Documentation

**Files:**
- Modify: `docs/superpowers/specs/2026-09-17-aide-contextuelle-design.md`
- Modify: `docs/architecture-frontend.md`
- Modify: `CLAUDE.md`
- Modify: `docs/roadmap-v1-vers-GA.md` (ligne 1.2)

- [ ] **Step 1: Spec — reporter les deux écarts**

Dans §2.1 : remplacer les lignes `recuAnnule` et `envoyerRecu` par une ligne unique :

```markdown
| `recus` | fiche membre (en-tête de la carte « Cotisations ») | Chaque versement donne un reçu numéroté, téléchargeable ou envoyé au membre par les canaux configurés ; pour corriger un versement, on annule d'abord son reçu, qui garde son numéro et ne circule plus, puis un nouveau reçu est émis. |
```

Remplacer le sens de `ouvrirAnnee` par : « Prépare en une fois la cotisation de l'année pour tous les membres actifs, au montant du barème ; pas obligatoire pour encaisser (un versement sur une année non ouverte l'ouvre pour le membre) ; impossible pour une année future. » Remplacer « Premier lot (18 notions) » par « Premier lot (17 notions) » et ajouter sous le tableau :

```markdown
> Écart de mise en œuvre (plan 2026-09-17) : `recuAnnule` et `envoyerRecu` fusionnées en `recus`, faute de
> libellé hors des lignes de liste (où le « ? » est interdit, §2.2).
```

Dans §3.2, remplacer « placement des 18 notions » par « placement des 17 notions ».

- [ ] **Step 2: `docs/architecture-frontend.md`**

Ajouter une section (à la suite des primitives partagées) :

```markdown
## Aide contextuelle — `ui/AideNotion` (spec 2026-09-17)

- **Primitive unique** : `<AideNotion notion="…" />` rend un « ? » (`.tap-target`, nom accessible
  « Aide : <titre> ») et une bulle en PORTAIL via `usePopoverFlottant`. Ouverture au clic/clavier, jamais
  au survol ; Échap rend le focus au « ? ». Ne pas créer d'infobulle ad hoc.
- **Contenu** : `lib/aide.ts` (`NOTIONS_AIDE`, `LIENS_AIDE`) + namespace i18n `aide` (FR source, EN
  miroir). Une notion inconnue ne compile pas ; `aide-catalogue.test.ts` (textes non vides FR/EN, pas
  d'orphelin, 3 phrases max) et `aide-usage.test.ts` (chaque notion placée) gardent le catalogue.
- **Placement** : à côté d'un libellé — props `aide` de `Field` et `PageHeader` (jamais dans un `<label>`
  ou un `<h1>`), ou `flex items-center gap-1` autour d'un `Overline`. Au plus un « ? » par notion par
  écran, jamais dans une ligne de liste/tableau, jamais sur les écrans publics.
- **Rédaction** : vouvoiement, 3 phrases au plus, aucun nom technique ; une règle métier citée suit le
  code (la changer = changer le texte dans la même PR).
```

- [ ] **Step 3: `CLAUDE.md`**

Dans le bloc « Frontend — architecture applicative », puce « **Ne PAS reconstruire ce qui existe** », ajouter après `` `Tabs` (…) `` le fragment : `` / `AideNotion` (« ? » d'aide contextuelle, catalogue `lib/aide.ts` + i18n `aide` ; props `aide` de `Field`/`PageHeader`) ``. Aucune autre modification.

- [ ] **Step 4: Roadmap 1.2**

Dans la ligne 1.2 de `docs/roadmap-v1-vers-GA.md` : remplacer `→ **PARTIEL** :` par `→ **TERMINÉ** :` et remplacer `**Reste ensuite** : aide contextuelle, tutoriel.` par `**Aide contextuelle livrée** (« ? » sur 17 notions clés, catalogue FR/EN, spec [`superpowers/specs/2026-09-17-aide-contextuelle-design.md`](superpowers/specs/2026-09-17-aide-contextuelle-design.md)) ; **tutoriel non retenu** (décision PO du 17/09/2026 : guide de démarrage + espace de démonstration + aide contextuelle couvrent la mise en route).`

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-17-aide-contextuelle-design.md docs/architecture-frontend.md CLAUDE.md docs/roadmap-v1-vers-GA.md
git commit -m "docs(aide): primitive AideNotion, roadmap 1.2 terminée, écarts reportés dans la spec

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Vérification visuelle (contrôleur)

Exécutée par la session qui orchestre, avec les outils navigateur ; aucun commit.

- [ ] **Step 1: Environnement** — base jetable `nkoni_it_demo` (jamais `nkoni`) : si absente, `createdb nkoni_it_demo`, `npx prisma migrate deploy`, puis `npm run demo:generer` depuis `backend/` avec `DATABASE_URL` pointant sur elle et des secrets JWT locaux. Configurations `demo-front-backend` (port 3200, `DEMO_ACTIVEE=true`, `CORS_ORIGIN=http://localhost:5320`) et `demo-front-frontend` (port 5320, `VITE_API_URL=http://localhost:3200`) ajoutées temporairement à `.claude/launch.json` (ignoré par git), démarrées par `preview_start`.
- [ ] **Step 2: Parcours** (bureau puis `resize_window` mobile) via `/demo` : tableau de bord (verse, attendu), Barème (bareme, ouvrirAnnee), fiche d'un membre en retard (statutCotisation, valorise, equilibrage, recus), Équilibrage, Nouveau membre (3 champs), Trésorerie, Tontines (création), Cagnottes, détail d'une réunion passée, Paramètres. Pour chaque « ? » : ouverture au clic, texte lisible, bulle bornée à l'écran (pas de débordement horizontal : `document.documentElement.scrollWidth === innerWidth`), Échap referme. Captures bureau et mobile de deux bulles (une près du bord droit).
- [ ] **Step 3: Nettoyage** — `preview_stop`, retrait des deux configurations de `.claude/launch.json`, `resize_window` preset `desktop`.
