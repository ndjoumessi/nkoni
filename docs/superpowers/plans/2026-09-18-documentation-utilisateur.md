# Documentation utilisateur & administrateur — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** livrer une documentation publique FR/EN — guide du membre, guide du bureau, FAQ — servie par une route `/aide` dont le contenu ne pèse rien sur le paquet initial de l'application.

**Architecture:** le contenu est de la DONNÉE typée (sections → blocs), pas du JSX ni du Markdown, chargée par `import()` dynamique. Un composant de rendu unique traduit ces blocs en HTML accessible et pose les ancres. La coquille publique de mise en page est extraite des pages légales pour être partagée sans dupliquer le gabarit.

**Tech Stack:** React 19, React Router, Tailwind v4, TypeScript, Vitest (`jsdom` par docblock), oxlint.

**Spec:** [`docs/superpowers/specs/2026-09-18-documentation-utilisateur-design.md`](../specs/2026-09-18-documentation-utilisateur-design.md)

## Global Constraints

- **Aucun contenu de documentation dans les catalogues i18n** (`locales/{fr,en}/index.ts` est chargé au démarrage). Seule la coquille d'interface y va, dans le namespace `aideDoc`.
- **Le namespace s'appelle `aideDoc`**, jamais `aide` : `aide` existe déjà pour l'aide contextuelle (`lib/aide.ts`, 17 notions).
- **Les `id` de section sont définitifs** une fois publiés : ce sont des ancres de liens partagés. Kebab-case, sans accent.
- **Toute règle métier énoncée dans un texte est vérifiée dans le code au moment de la rédaction**, fichier à l'appui. Défaut vécu sur l'aide contextuelle : deux textes affirmaient l'inverse du code.
- **Vouvoiement**, phrases courtes, libellés d'interface cités EXACTEMENT tels qu'ils apparaissent (FR et EN), entre guillemets « … ».
- **Aucune capture d'écran, aucune donnée réelle, aucun nom de personne.**
- **Aucune dépendance npm nouvelle.**
- Routes statiques déclarées AVANT les routes paramétrées (invariant `CLAUDE.md`).
- Vérifier `npm run build` + `npm run lint` (0 finding) + `npm run test` avant de présenter un résultat.
- Français partout dans le code : noms de fonctions, commentaires, messages, commits.

---

### Task 1: Coquille publique partagée et rendu des blocs

**Files:**
- Create: `frontend/src/components/public/PagePublique.tsx`
- Create: `frontend/src/content/aide/types.ts`
- Create: `frontend/src/components/aide/RenduDoc.tsx`
- Modify: `frontend/src/pages/legal/PageLegale.tsx`
- Test: `frontend/src/components/aide/RenduDoc.test.tsx`

**Interfaces:**
- Consumes: rien (première tâche).
- Produces: `PagePublique({ titre, sousTitre?, retourLibelle, children })`; les types `Bloc`, `SectionDoc`, `Document` depuis `@/content/aide/types`; `RenduDoc({ document, libelleSommaire })`.

**Pourquoi extraire une coquille :** `PageLegale` porte son chrome EN DUR en français (« Accueil », « Dernière mise à jour »), parce que les pages légales sont volontairement françaises. Les pages d'aide, elles, sont bilingues. On extrait donc la MISE EN PAGE dans `PagePublique`, qui reçoit ses libellés en props ; `PageLegale` lui passe ses chaînes françaises, les pages d'aide leurs chaînes traduites. Aucun gabarit dupliqué, aucune i18n forcée sur les pages légales.

- [ ] **Step 1: Écrire le test de rendu (rouge)**

```tsx
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RenduDoc } from './RenduDoc'
import type { Document } from '@/content/aide/types'

const DOC: Document = {
  titre: 'Guide de test',
  intro: 'Intro du guide.',
  sections: [
    {
      id: 'premiere-section',
      titre: 'Première section',
      blocs: [
        { type: 'paragraphe', texte: 'Un paragraphe.' },
        { type: 'etapes', etapes: ['Ouvrir', 'Enregistrer'] },
        { type: 'liste', items: ['Un', 'Deux'] },
        { type: 'note', ton: 'attention', texte: 'Attention à ceci.' },
        { type: 'lien', vers: '/bareme', libelle: 'Aller au barème' },
      ],
    },
    { id: 'seconde-section', titre: 'Seconde section', blocs: [{ type: 'paragraphe', texte: 'Fin.' }] },
  ],
}

const rendre = () =>
  render(
    <MemoryRouter>
      <RenduDoc document={DOC} libelleSommaire="Sommaire" />
    </MemoryRouter>,
  )

describe('RenduDoc', () => {
  it('rend chaque section dans un <section> portant son id (ancre de lien partagé)', () => {
    const { container } = rendre()
    expect(container.querySelector('section#premiere-section')).toBeTruthy()
    expect(container.querySelector('section#seconde-section')).toBeTruthy()
  })

  it('les titres de section sont des <h2> (le <h1> appartient à la page)', () => {
    rendre()
    expect(screen.getByRole('heading', { level: 2, name: 'Première section' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('le sommaire liste toutes les sections et pointe sur leurs ancres', () => {
    rendre()
    const sommaire = screen.getByRole('navigation', { name: 'Sommaire' })
    const liens = within(sommaire).getAllByRole('link')
    expect(liens.map((l) => l.getAttribute('href'))).toEqual(['#premiere-section', '#seconde-section'])
  })

  it('les étapes sont une liste ORDONNÉE, les items une liste simple', () => {
    const { container } = rendre()
    expect(within(container.querySelector('ol') as HTMLElement).getAllByRole('listitem')).toHaveLength(2)
    expect(container.querySelectorAll('ul[data-bloc="liste"] li')).toHaveLength(2)
  })

  it('un bloc lien rend un Link interne, jamais un <a href> brut', () => {
    rendre()
    expect(screen.getByRole('link', { name: 'Aller au barème' }).getAttribute('href')).toBe('/bareme')
  })

  it('une note « attention » porte role="note" et son texte', () => {
    rendre()
    expect(screen.getByRole('note').textContent).toContain('Attention à ceci.')
  })
})
```

- [ ] **Step 2: Lancer le test et vérifier qu'il échoue**

Run: `cd frontend && npx vitest run src/components/aide/RenduDoc.test.tsx`
Expected: FAIL — `Failed to resolve import "./RenduDoc"`.

- [ ] **Step 3: Écrire le modèle de contenu**

```ts
// frontend/src/content/aide/types.ts
/**
 * Modèle de contenu de la documentation (spec 2026-09-18). Le contenu est de la DONNÉE, pas du JSX :
 * le rendu, les ancres et le sommaire en découlent, et les chaînes restent courtes donc relisibles
 * en diff. Ce fichier ne contient QUE des types — il peut donc être importé partout sans coût.
 */

export type Bloc =
  | { type: 'paragraphe'; texte: string }
  /** Liste ORDONNÉE : « faites ceci, puis cela ». */
  | { type: 'etapes'; etapes: string[] }
  /** Liste non ordonnée : énumération sans ordre imposé. */
  | { type: 'liste'; items: string[] }
  | { type: 'note'; ton: 'info' | 'attention'; texte: string }
  /** Lien INTERNE à l'application (jamais une URL externe) — validité gardée par un test. */
  | { type: 'lien'; vers: string; libelle: string }

export interface SectionDoc {
  /** Ancre STABLE, kebab-case sans accent. Ne change JAMAIS une fois publiée : des liens la citent. */
  id: string
  titre: string
  blocs: Bloc[]
}

export interface Document {
  titre: string
  intro: string
  sections: SectionDoc[]
}
```

- [ ] **Step 4: Écrire le composant de rendu**

```tsx
// frontend/src/components/aide/RenduDoc.tsx
import { Link } from 'react-router-dom'
import { Info, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Bloc, Document } from '@/content/aide/types'

/**
 * Rendu d'un document d'aide : sommaire d'ancres puis sections. Primitive PARTAGÉE par les trois
 * guides — ne pas recréer de rendu ad hoc. Les titres de section sont des `h2` : le `h1` appartient
 * à la page, qui porte le titre du document.
 */
function RenduBloc({ bloc }: { bloc: Bloc }) {
  switch (bloc.type) {
    case 'paragraphe':
      return <p className="text-sm leading-relaxed text-muted-foreground">{bloc.texte}</p>
    case 'etapes':
      return (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          {bloc.etapes.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ol>
      )
    case 'liste':
      return (
        <ul
          data-bloc="liste"
          className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground"
        >
          {bloc.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )
    case 'note': {
      const attention = bloc.ton === 'attention'
      const Icone = attention ? TriangleAlert : Info
      return (
        <div
          role="note"
          className={cn(
            'flex gap-2.5 rounded-xl border p-3.5 text-sm leading-relaxed',
            attention
              ? 'border-terra/40 bg-terra/10 text-terra-text'
              : 'border-hairline bg-surface text-muted-foreground',
          )}
        >
          <Icone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{bloc.texte}</span>
        </div>
      )
    }
    case 'lien':
      return (
        <Link
          to={bloc.vers}
          className="inline-block text-sm font-medium text-brass underline-offset-4 hover:underline"
        >
          {bloc.libelle}
        </Link>
      )
  }
}

export function RenduDoc({
  document,
  libelleSommaire,
}: {
  document: Document
  libelleSommaire: string
}) {
  return (
    <>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{document.intro}</p>

      <nav aria-label={libelleSommaire} className="mt-8 rounded-xl border border-hairline bg-surface p-4">
        <ol className="space-y-1.5 text-sm">
          {document.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-brass underline-offset-4 hover:underline">
                {s.titre}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-10 space-y-10">
        {document.sections.map((s) => (
          // `scroll-mt` : sans marge de défilement, l'ancre colle le titre au bord haut de l'écran.
          <section key={s.id} id={s.id} className="scroll-mt-24 space-y-3">
            <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
              {s.titre}
            </h2>
            {s.blocs.map((bloc, i) => (
              <RenduBloc key={i} bloc={bloc} />
            ))}
          </section>
        ))}
      </div>
    </>
  )
}

export default RenduDoc
```

- [ ] **Step 5: Extraire la coquille publique**

Créer `frontend/src/components/public/PagePublique.tsx` en DÉPLAÇANT la mise en page de `PageLegale` (en-tête logo + lien retour, conteneur `max-w-3xl`, remontée en haut au montage), avec les libellés en props :

```tsx
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { NkoniMark } from '@/components/ui/NkoniMark'

/**
 * Coquille des pages PUBLIQUES de texte long (légales, aide) — accessibles SANS authentification.
 *
 * Les libellés sont des PROPS et non des `t()` : les pages légales sont volontairement françaises
 * (corps juridique non traduit), les pages d'aide sont bilingues. Un `t()` ici donnerait un corps
 * français sous un chrome anglais. La mise en page, elle, est partagée — ne pas la redupliquer.
 */
export function PagePublique({
  titre,
  sousTitre,
  retourLibelle,
  children,
}: {
  titre: string
  sousTitre?: string
  retourLibelle: string
  children: ReactNode
}) {
  // React Router CONSERVE la position de défilement entre routes : arrivé depuis un pied de page
  // défilé tout en bas, on atterrissait au milieu du texte, titre hors écran. Une page de lecture
  // s'ouvre sur son titre.
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [])

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-hairline">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <Link to="/" className="flex items-center gap-2">
            <NkoniMark className="h-7 w-7" />
            <span className="font-display text-lg font-semibold tracking-tight text-foreground">
              NKONI
            </span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {retourLibelle}
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">{titre}</h1>
        {sousTitre && <p className="mt-2 text-sm text-faint">{sousTitre}</p>}
        {children}
      </div>
    </main>
  )
}

export default PagePublique
```

Puis réécrire `PageLegale` pour la consommer, en conservant EXACTEMENT son rendu actuel (`SectionLegale` et `Placeholder` restent inchangés et exportés depuis `PageLegale`) :

```tsx
export function PageLegale({ titre, majLe, children }: { titre: string; majLe: string; children: ReactNode }) {
  return (
    <PagePublique titre={titre} sousTitre={`Dernière mise à jour : ${majLe}`} retourLibelle="Accueil">
      <div className="mt-8 space-y-9">{children}</div>
    </PagePublique>
  )
}
```

- [ ] **Step 6: Lancer les tests et vérifier qu'ils passent**

Run: `cd frontend && npx vitest run src/components/aide/RenduDoc.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 7: Vérifier que les pages légales n'ont pas bougé**

Run: `cd frontend && npx vitest run && npm run build && npm run lint`
Expected: suite verte, build OK, oxlint sans finding. Ouvrir `/cgu` n'est pas testable ici ; le rendu est conservé par construction (mêmes classes, mêmes chaînes).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/public frontend/src/components/aide frontend/src/content/aide frontend/src/pages/legal/PageLegale.tsx
git commit -m "feat(aide): coquille publique partagée et rendu des blocs de documentation"
```

---

### Task 2: Routes, sommaire, chargement à la demande, FAQ et gardes

**Files:**
- Create: `frontend/src/content/aide/registre.ts`
- Create: `frontend/src/content/aide/fr/faq.ts`
- Create: `frontend/src/content/aide/en/faq.ts`
- Create: `frontend/src/locales/fr/aideDoc.ts`
- Create: `frontend/src/locales/en/aideDoc.ts`
- Create: `frontend/src/pages/aide/AidePage.tsx`
- Create: `frontend/src/pages/aide/GuidePage.tsx`
- Modify: `frontend/src/locales/fr/index.ts`, `frontend/src/locales/en/index.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/content/aide/aide-doc.test.ts` (les trois gardes)
- Test: `frontend/src/pages/aide/AidePage.test.tsx`

**Interfaces:**
- Consumes: `Document`, `SectionDoc`, `Bloc` de `@/content/aide/types`; `RenduDoc`; `PagePublique`.
- Produces: `GUIDES` (`readonly ['membre','bureau','faq']`), `type Guide`, `chargerDocument(guide: Guide, codeLangue: string): Promise<Document>`; routes `/aide`, `/aide/membre`, `/aide/bureau`, `/aide/faq`; clés i18n `aideDoc.*`.

**La FAQ est livrée ICI, pas plus tard :** les trois gardes doivent s'exercer sur un document RÉEL dès leur écriture, sinon elles naissent vacantes. La FAQ est le plus court des trois documents, c'est donc le bon premier contenu.

- [ ] **Step 1: Écrire les trois gardes (rouge)**

```ts
// frontend/src/content/aide/aide-doc.test.ts
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { GUIDES, chargerDocument } from './registre'
import type { Document } from './types'

/**
 * GARDES DE LA DOCUMENTATION (spec 2026-09-18).
 *
 * La parité FR/EN n'est PAS tenue par le typage : `Document` porte un TABLEAU de sections, donc
 * TypeScript vérifie la forme mais n'oblige pas à couvrir les mêmes sections — contrairement aux
 * catalogues i18n, qui sont des objets à clés fixes. D'où ces gardes exécutables.
 */

const charger = async (guide: (typeof GUIDES)[number], langue: string): Promise<Document> =>
  chargerDocument(guide, langue)

describe('documentation — parité FR/EN', () => {
  it.each(GUIDES)('%s : mêmes sections, dans le même ordre, en FR et en EN', async (guide) => {
    const [fr, en] = await Promise.all([charger(guide, 'fr'), charger(guide, 'en')])
    expect(fr.sections.length).toBeGreaterThan(0)
    expect(en.sections.map((s) => s.id)).toEqual(fr.sections.map((s) => s.id))
  })

  it.each(GUIDES)('%s : aucun titre EN laissé en français (traduction oubliée)', async (guide) => {
    const [fr, en] = await Promise.all([charger(guide, 'fr'), charger(guide, 'en')])
    const identiques = fr.sections.filter((s, i) => s.titre === en.sections[i]?.titre)
    expect(identiques.map((s) => s.id)).toEqual([])
  })
})

describe('documentation — ancres', () => {
  it.each(GUIDES)('%s : identifiants uniques et en kebab-case sans accent', async (guide) => {
    const doc = await charger(guide, 'fr')
    const ids = doc.sections.map((s) => s.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([])
  })
})

describe('documentation — liens internes', () => {
  /**
   * Un lien vers une page disparue est pire qu'une absence de lien : il donne confiance puis
   * envoie dans le vide. On lit les routes DÉCLARÉES dans `App.tsx` en TEXTE — c'est la seule
   * source de vérité, et un `path` supprimé fait donc échouer ce test.
   */
  const routes = new Set(
    [...readFileSync('src/App.tsx', 'utf8').matchAll(/path="([^"]+)"/g)].map((m) => m[1]),
  )
  const couvre = (vers: string): boolean =>
    [...routes].some((r) => r === vers || (r.includes(':') && new RegExp(`^${r.replace(/:[^/]+/g, '[^/]+')}$`).test(vers)))

  it.each(GUIDES)('%s : chaque bloc lien pointe vers une route déclarée', async (guide) => {
    const docs = await Promise.all([charger(guide, 'fr'), charger(guide, 'en')])
    const liens = docs.flatMap((d) =>
      d.sections.flatMap((s) => s.blocs.filter((b) => b.type === 'lien').map((b) => b.vers)),
    )
    expect(routes.size).toBeGreaterThan(0)
    expect(liens.filter((v) => !couvre(v))).toEqual([])
  })
})
```

- [ ] **Step 2: Lancer les gardes et vérifier qu'elles échouent**

Run: `cd frontend && npx vitest run src/content/aide/aide-doc.test.ts`
Expected: FAIL — `Failed to resolve import "./registre"`.

- [ ] **Step 3: Écrire le registre de chargement**

```ts
// frontend/src/content/aide/registre.ts
import type { Document } from './types'

/**
 * Chargement À LA DEMANDE des documents d'aide. Le contenu ne passe JAMAIS par les catalogues i18n
 * (`locales/{fr,en}/index.ts` est chargé au démarrage) : il alourdirait le paquet initial pour tout
 * le monde, y compris un membre sur mobile qui ne le lira pas.
 */
export const GUIDES = ['membre', 'bureau', 'faq'] as const
export type Guide = (typeof GUIDES)[number]

type Chargeur = () => Promise<{ default: Document }>

const CHARGEURS: Record<'fr' | 'en', Record<Guide, Chargeur>> = {
  fr: {
    membre: () => import('./fr/membre'),
    bureau: () => import('./fr/bureau'),
    faq: () => import('./fr/faq'),
  },
  en: {
    membre: () => import('./en/membre'),
    bureau: () => import('./en/bureau'),
    faq: () => import('./en/faq'),
  },
}

export function estGuide(valeur: string): valeur is Guide {
  return (GUIDES as readonly string[]).includes(valeur)
}

/**
 * `codeLangue` est le code i18n courant (`fr` / `en`). Une langue inconnue retombe sur le français :
 * un texte dans la mauvaise langue vaut mieux qu'une page vide.
 */
export async function chargerDocument(guide: Guide, codeLangue: string): Promise<Document> {
  const langue = codeLangue.toLowerCase().startsWith('en') ? 'en' : 'fr'
  return (await CHARGEURS[langue][guide]()).default
}
```

- [ ] **Step 4: Écrire la FAQ française**

Créer `frontend/src/content/aide/fr/faq.ts` exportant `const faq: Document` en défaut. **Douze sections, ids EXACTS ci-dessous** (ordre imposé). Chaque réponse fait 1 à 4 blocs. Avant d'écrire une réponse, OUVRIR le fichier cité et vérifier la règle : si le code dit autre chose, c'est le code qui fait foi et il faut le signaler dans le rapport de tâche.

| `id` | Question (titre) | Substance | Vérifier dans |
|---|---|---|---|
| `annee-non-encaissable` | « Je ne peux pas enregistrer un versement sur une année » | Il faut un barème pour l'année, et une contribution ouverte pour ce membre ; le formulaire ouvre l'année ciblée à la volée. | `backend/src/services/contribution.service.ts` |
| `membre-non-a-jour-alors-quil-a-paye` | « Un membre a payé mais reste “non à jour” » | L'attendu couvre toute la fenêtre d'adhésion, pas la seule année courante ; distinguer versé et valorisé. | `backend/src/services/membreStatut.service.ts` |
| `modifier-un-versement` | « Je ne peux pas modifier un versement » | Un reçu ACTIF bloque la modification ; l'annuler débloque. | `backend/src/routes/versements.route.ts` |
| `supprimer-un-versement` | « Que devient le reçu si je supprime le versement ? » | Le reçu survit en trace lecture seule et garde son numéro ; il ne peut pas être réutilisé. | `backend/src/services/recu-pdf.service.ts` |
| `ajout-de-membre-bloque` | « Je ne peux plus ajouter de membre » | Plafond de membres ACTIFS du forfait ; une fiche inactive ou décédée ne consomme rien. | `backend/src/lib/forfait.ts` |
| `canal-denvoi-du-recu` | « Par quel moyen le reçu est-il envoyé ? » | WhatsApp d'abord, e-mail en repli, notification sur le téléphone ; si aucun canal n'est configuré, rien ne part. | `backend/src/services/envoi-recu.service.ts` |
| `reouvrir-une-annee` | « J'ai rouvert une année et rien ne s'est passé » | L'opération est idempotente ; « Rien à créer » signifie que tout existait déjà, et rouvrir reste utile après l'ajout de membres. | `backend/src/services/contribution.service.ts` |
| `annee-future` | « Je ne peux pas ouvrir l'année prochaine » | Une année future n'est pas encaissable ; configurer son barème en avance reste permis. | `backend/src/services/contribution.service.ts` |
| `mot-de-passe-oublie` | « J'ai oublié mon mot de passe » | Un administrateur le réinitialise depuis la fiche utilisateur. | `backend/src/routes/utilisateurs.route.ts` |
| `sessions-et-deconnexion` | « Changer mon mot de passe m'a déconnecté partout » | C'est voulu : les autres sessions tombent, protection en cas de compte compromis. | `backend/src/services/auth.service.ts` |
| `qui-voit-quoi` | « Qui peut voir quoi ? » | Visibilité héritée du parent pour les documents ; le détail nominatif des votes est réservé au bureau. | `backend/src/middlewares/permissions.ts` |
| `donnees-et-suppression` | « Puis-je récupérer ou supprimer mes données ? » | Export self-service par un dirigeant ; suppression définitive sur demande, irréversible. | `backend/src/services/organisation-purge.service.ts` |

Gabarit du fichier :

```ts
import type { Document } from '../types'

const faq: Document = {
  titre: 'Questions fréquentes',
  intro: 'Les réponses aux situations les plus courantes.',
  sections: [
    {
      id: 'annee-non-encaissable',
      titre: 'Je ne peux pas enregistrer un versement sur une année',
      blocs: [{ type: 'paragraphe', texte: '…' }],
    },
    // … onze autres, dans l'ordre du tableau
  ],
}

export default faq
```

- [ ] **Step 5: Écrire la FAQ anglaise**

`frontend/src/content/aide/en/faq.ts` : MÊMES `id`, dans le MÊME ordre, titres et textes traduits. Traduction, pas transposition : les libellés d'interface cités doivent être les libellés ANGLAIS réels (vérifier dans `locales/en/`).

- [ ] **Step 6: Écrire le namespace i18n de coquille**

```ts
// frontend/src/locales/fr/aideDoc.ts
export default {
  aideDoc: {
    titre: 'Aide',
    intro: 'Guides d’utilisation et réponses aux questions fréquentes.',
    retour: 'Accueil',
    sommaire: 'Sommaire',
    chargement: 'Chargement de l’aide…',
    guides: {
      membre: { titre: 'Guide du membre', description: 'Consulter sa situation, payer, ses reçus, voter.' },
      bureau: { titre: 'Guide du bureau', description: 'Mettre en route, encaisser, justifier, piloter.' },
      faq: { titre: 'Questions fréquentes', description: 'Les blocages les plus courants, expliqués.' },
    },
  },
}
```

EN miroir dans `frontend/src/locales/en/aideDoc.ts` (`Help`, `Home`, `Contents`, `Loading help…`, `Member guide`, `Committee guide`, `Frequently asked questions`). Ajouter `import aideDoc from './aideDoc'` et `...aideDoc,` dans les DEUX `index.ts` — le typage de `en/index` impose la parité des clés.

- [ ] **Step 7: Écrire les pages**

`AidePage.tsx` — sommaire, dans `PagePublique`, listant les trois guides avec un `Link` vers `/aide/<guide>` et la description i18n.

`GuidePage.tsx` — reçoit `guide: Guide` en prop, charge le document avec `chargerDocument(guide, i18n.language)` dans un `useEffect`, affiche `t('aideDoc.chargement')` pendant le chargement, puis `PagePublique` + `RenduDoc`. Recharger quand `i18n.language` change. En cas d'échec du chargement, afficher la primitive `ErrorState` existante plutôt qu'une page vide.

- [ ] **Step 8: Déclarer les routes**

Dans `App.tsx`, après `/statut` et AVANT toute route paramétrée :

```tsx
<Route path="/aide" element={<AidePage />} />
<Route path="/aide/membre" element={<GuidePage guide="membre" />} />
<Route path="/aide/bureau" element={<GuidePage guide="bureau" />} />
<Route path="/aide/faq" element={<GuidePage guide="faq" />} />
```

Les pages d'aide sont PUBLIQUES : hors `ProtectedRoute`, comme les pages légales. Les importer en `lazy()` comme les autres pages de route.

- [ ] **Step 9: Écrire le test de la page sommaire**

```tsx
// @vitest-environment jsdom
// frontend/src/pages/aide/AidePage.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AidePage from './AidePage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
}))

describe('AidePage', () => {
  it('propose les trois entrées, chacune liée à sa route', () => {
    render(
      <MemoryRouter>
        <AidePage />
      </MemoryRouter>,
    )
    const cibles = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(cibles).toEqual(expect.arrayContaining(['/aide/membre', '/aide/bureau', '/aide/faq']))
  })
})
```

- [ ] **Step 10: Lancer tous les tests**

Run: `cd frontend && npx vitest run src/content/aide src/pages/aide src/components/aide`
Expected: PASS — gardes de parité, d'ancres et de liens vertes sur la FAQ ; les guides `membre` et `bureau` n'existent pas encore, donc **retirer temporairement `'membre'` et `'bureau'` de `GUIDES` n'est PAS permis** : créer à la place `fr/membre.ts`, `en/membre.ts`, `fr/bureau.ts`, `en/bureau.ts` réduits à une section `placeholder` unique, remplacés intégralement aux tâches 3 et 4.

- [ ] **Step 11: Saboter chaque garde et vérifier qu'elle échoue**

1. Parité : dans `en/faq.ts`, supprimer la dernière section → le test de parité doit échouer. Restaurer.
2. Ancres : dupliquer un `id` dans `fr/faq.ts` → le test d'unicité doit échouer. Restaurer.
3. Liens : ajouter un bloc `{ type: 'lien', vers: '/route-inexistante', libelle: 'x' }` → le test de liens doit échouer. Restaurer.

Vérifier après chaque sabotage que la modification s'est bien appliquée (relire le fichier) avant d'interpréter le résultat.

- [ ] **Step 12: Vérifier le poids du paquet initial**

Run: `cd frontend && npm run build`
Puis : `grep -rl "Questions fréquentes" dist/assets/*.js | head`
Expected: le texte de la FAQ apparaît dans un chunk SÉPARÉ, jamais dans `index-*.js`. Si l'inverse, le chargement dynamique ne fonctionne pas et la tâche n'est pas terminée.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/content/aide frontend/src/pages/aide frontend/src/locales frontend/src/App.tsx
git commit -m "feat(aide): routes publiques, chargement à la demande, FAQ FR/EN et gardes"
```

---

### Task 3: Guide du membre (FR/EN)

**Files:**
- Modify: `frontend/src/content/aide/fr/membre.ts` (remplace le contenu réduit de la tâche 2)
- Modify: `frontend/src/content/aide/en/membre.ts`

**Interfaces:**
- Consumes: `Document` de `@/content/aide/types`; les gardes de la tâche 2 s'appliquent automatiquement.
- Produces: un document de dix sections aux `id` figés ci-dessous, consommé par `/aide/membre`.

**Dix sections, ids EXACTS et ordre imposé.** Public : un membre sans responsabilité (`MEMBRE_SIMPLE`). Ne jamais décrire une action qu'il ne peut pas faire — vérifier la matrice dans `backend/src/middlewares/permissions.ts` au moindre doute.

| `id` | Titre FR | Ce que la section doit dire | Vérifier dans |
|---|---|---|---|
| `se-connecter` | Se connecter | Première connexion avec les identifiants remis par le bureau, changement de mot de passe, oubli. | `frontend/src/pages/LoginPage.tsx` |
| `ma-situation` | Ma situation | Où lire attendu, versé et reste à payer, et sur quelles années. | `frontend/src/pages/MonEspacePage.tsx` |
| `mon-statut` | Comprendre mon statut | Ce que « à jour », « partiel » et « non à jour » signifient ; ce que « valorisé » recouvre. | `backend/src/services/membreStatut.service.ts` |
| `payer-en-ligne` | Payer en ligne | Disponible seulement si l'organisation l'a configuré ; montant plafonné au reste dû ; que faire si le paiement n'aboutit pas. | `backend/src/routes/paiements.route.ts` |
| `mes-recus` | Mes reçus | Consulter, télécharger, partager le lien d'un reçu ; un reçu annulé cesse d'être accessible. | `backend/src/routes/recus.route.ts` |
| `reunions-et-votes` | Réunions et votes | Confirmer sa présence, voter une résolution ouverte, revoter écrase le vote précédent. | `backend/src/services/vote.service.ts` |
| `ma-carte` | Ma carte de membre | À quoi sert le QR, ce que la page publique montre — et surtout ce qu'elle ne montre pas (aucun montant). | `backend/src/routes/cartes.route.ts` |
| `notifications` | Notifications | Activer les notifications sur son téléphone, choisir lesquelles, celles qu'on ne peut pas désactiver. | `frontend/src/components/NotificationPreferences.tsx` |
| `hors-connexion` | Utiliser l'application sans réseau | Ce qui reste consultable, ce qui est mis en attente et renvoyé au retour du réseau. | `frontend/src/lib/offline-queue.ts` |
| `mon-profil` | Mon profil | Photo, langue de l'interface, coordonnées. | `frontend/src/pages/MonProfilPage.tsx` |

- [ ] **Step 1: Écrire le guide français**

Remplacer `fr/membre.ts` par les dix sections. Contraintes : vouvoiement, 1 à 5 blocs par section, libellés d'interface cités exactement, un bloc `note` de ton `attention` partout où une action est irréversible ou bloquante. Utiliser des blocs `etapes` pour les marches à suivre, jamais un paragraphe qui énumère.

- [ ] **Step 2: Vérifier les gardes**

Run: `cd frontend && npx vitest run src/content/aide/aide-doc.test.ts`
Expected: les ancres et les liens passent ; **la parité ÉCHOUE** tant que l'anglais n'est pas écrit — c'est le comportement attendu et la preuve que la garde travaille.

- [ ] **Step 3: Écrire le guide anglais**

Remplacer `en/membre.ts` : mêmes `id`, même ordre, textes traduits, libellés d'interface anglais réels (vérifier `frontend/src/locales/en/`).

- [ ] **Step 4: Vérifier**

Run: `cd frontend && npx vitest run && npm run build && npm run lint`
Expected: tout vert, 0 finding.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/content/aide
git commit -m "feat(aide): guide du membre (FR/EN)"
```

---

### Task 4: Guide du bureau (FR/EN)

**Files:**
- Modify: `frontend/src/content/aide/fr/bureau.ts`
- Modify: `frontend/src/content/aide/en/bureau.ts`

**Interfaces:**
- Consumes: `Document` de `@/content/aide/types`.
- Produces: un document de treize sections aux `id` figés ci-dessous, consommé par `/aide/bureau`.

**Treize sections, ids EXACTS et ordre imposé.** Public : ADMIN, PRÉSIDENT, TRÉSORIÈRE, SECRÉTAIRE. Chaque section qui décrit une action réservée DOIT dire quel rôle peut la faire.

| `id` | Titre FR | Ce que la section doit dire | Vérifier dans |
|---|---|---|---|
| `mettre-en-route` | Mettre en route votre espace | L'ordre qui marche : barème de l'année, puis ouverture de l'année, puis membres, puis désignation du chef. | `frontend/src/pages/BaremePage.tsx` |
| `ajouter-des-membres` | Ajouter des membres | Création unitaire et import de fichier ; ce que le quota du forfait limite ; une fiche inactive ne consomme rien. | `backend/src/routes/membres.route.ts` |
| `encaisser-un-versement` | Encaisser un versement | Modes de paiement, choix de l'année sur toute la fenêtre d'adhésion, ouverture ciblée automatique. | `backend/src/services/versement.service.ts` |
| `recus` | Générer et envoyer un reçu | Génération manuelle, envoi, numérotation séquentielle. | `backend/src/routes/recus.route.ts` |
| `corriger-une-erreur` | Corriger une erreur | **La voie annuler → corriger → réémettre** ; pourquoi un reçu actif bloque la modification ET la suppression ; un reçu annulé cesse de circuler même par son lien déjà partagé. | `backend/src/routes/recus.route.ts` |
| `suivre-le-recouvrement` | Suivre le recouvrement | Statuts, liste des membres à relancer, relance WhatsApp et qui peut la déclencher. | `frontend/src/components/dashboard/RecouvrementHero.tsx` |
| `tresorerie-et-depenses` | Trésorerie et dépenses | Circuit brouillon → en attente → approuvée → payée ; l'approbation et le paiement relèvent de rôles DIFFÉRENTS. | `backend/src/services/tresorerie.service.ts` |
| `vie-associative` | Réunions, résolutions et votes | Ordre du jour, mise au vote explicite, clôture, compte-rendu ; le dépouillement nominatif est réservé au bureau. | `backend/src/services/vote.service.ts` |
| `autres-caisses` | Cagnottes, amendes et tontines | En bref, avec la règle qui compte : la tontine ne fait pas partie de la trésorerie de l'association. | `backend/src/services/tontine.service.ts` |
| `comptes-et-roles` | Comptes et rôles | Créer un utilisateur, réinitialiser un mot de passe, et ce que chaque rôle peut faire. | `backend/src/middlewares/permissions.ts` |
| `forfait` | Votre forfait | Limites, échéance, période de grâce de 14 jours, ce qui se passe ensuite ; un paiement déjà effectué reste enregistré. | `backend/src/lib/forfait.ts` |
| `exports-et-rapports` | Exports et rapports | Quoi exporter, en quel format, et que la langue du document suit celle de l'interface. | `backend/src/services/export.service.ts` |
| `parametres-immuables` | Ce qui ne se change pas | Paramètres figés à la création et raison de ce choix. | `backend/src/routes/organisations.route.ts` |

- [ ] **Step 1: Écrire le guide français**

Mêmes contraintes qu'à la tâche 3. La section `corriger-une-erreur` est la plus importante du document : elle mérite des `etapes` explicites et une `note` de ton `attention`.

- [ ] **Step 2: Vérifier les gardes**

Run: `cd frontend && npx vitest run src/content/aide/aide-doc.test.ts`
Expected: parité en échec tant que l'anglais manque.

- [ ] **Step 3: Écrire le guide anglais**

Mêmes `id`, même ordre, libellés d'interface anglais réels.

- [ ] **Step 4: Vérifier**

Run: `cd frontend && npx vitest run && npm run build && npm run lint`
Expected: tout vert.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/content/aide
git commit -m "feat(aide): guide du bureau (FR/EN)"
```

---

### Task 5: Navigation et documentation du dépôt

**Files:**
- Modify: `frontend/src/pages/LandingPage.tsx` (pied de page légal, ~ligne 388)
- Modify: `frontend/src/components/AppShell.tsx` (menu compte, à côté de `/mon-profil`)
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/locales/fr/landing.ts`, `frontend/src/locales/en/landing.ts`, `frontend/src/locales/fr/shell.ts`, `frontend/src/locales/en/shell.ts`, `frontend/src/locales/fr/login.ts`, `frontend/src/locales/en/login.ts`
- Modify: `CLAUDE.md`, `docs/architecture-frontend.md`, `docs/roadmap-v1-vers-GA.md`
- Test: `frontend/src/pages/aide/acces-aide.test.tsx`

**Interfaces:**
- Consumes: les routes `/aide` et `/aide/faq` de la tâche 2.
- Produces: aucun nouveau module.

- [ ] **Step 1: Écrire le test d'accès (rouge)**

```tsx
// @vitest-environment jsdom
// frontend/src/pages/aide/acces-aide.test.tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import LandingPage from '@/pages/LandingPage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
}))

describe('accès à l’aide', () => {
  it('le pied de page de l’accueil mène à /aide', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    )
    expect(screen.getAllByRole('link').map((l) => l.getAttribute('href'))).toContain('/aide')
  })
})
```

Si `LandingPage` exige des dépendances non triviales en test, restreindre l'assertion au pied de page en extrayant le test sur le composant réellement rendu ; ne PAS supprimer l'assertion.

- [ ] **Step 2: Vérifier l'échec**

Run: `cd frontend && npx vitest run src/pages/aide/acces-aide.test.tsx`
Expected: FAIL — `/aide` absent des liens.

- [ ] **Step 3: Ajouter les trois points d'entrée**

1. Pied de page de l'accueil : un `Link` vers `/aide` dans la barre légale, avant « Confidentialité », séparé par le même `·`, libellé `t('landing.footerNav.aide')`.
2. Menu compte de la coquille : une entrée « Aide » vers `/aide`, à côté de « Mon profil », libellé `t('shell.aide')`.
3. Page de connexion : un lien discret vers `/aide/faq`, libellé `t('login.besoinAide')` — c'est le cas « je n'arrive pas à me connecter », que la documentation doit servir sans compte.

Ajouter les six clés i18n correspondantes (FR + EN).

- [ ] **Step 4: Vérifier**

Run: `cd frontend && npx vitest run && npm run build && npm run lint`
Expected: tout vert, 0 finding.

- [ ] **Step 5: Documenter dans le dépôt**

1. `CLAUDE.md`, section frontend, dans la liste « ne PAS reconstruire » : ajouter `RenduDoc` / `PagePublique` avec la règle « le contenu d'aide est de la donnée typée chargée à la demande, JAMAIS un catalogue i18n — il alourdirait le paquet initial pour tous ».
2. `docs/architecture-frontend.md` : une section « Documentation publique » décrivant le modèle de blocs, le registre de chargement, les trois gardes et la raison de `PagePublique` (chrome français figé des pages légales).
3. `docs/roadmap-v1-vers-GA.md`, ligne 2.1 : marquer la documentation livrée, en précisant ce qui reste hors périmètre (guide super-administrateur, recherche plein texte, captures).

- [ ] **Step 6: Commit**

```bash
git add frontend/src CLAUDE.md docs
git commit -m "feat(aide): points d'entrée vers la documentation et note d'architecture"
```

---

## Auto-revue du plan

**Couverture de la spec.** §1 cadrage → tâches 3, 4 (deux guides), 2 (FAQ), toutes publiques. §2 contrainte de paquet → tâche 2, étape 12 (vérification sur la sortie de build). §3 architecture → tâches 1 et 2. §4 plan de contenu → tâches 2, 3, 4, sections et `id` repris à l'identique. §5 gardes → tâche 2, étapes 1 et 11 (sabotage). §6 navigation → tâche 5. §7 hors périmètre → aucune tâche, par construction. §8 critères de sortie → répartis sur les étapes de vérification de chaque tâche.

**Écart assumé avec la spec.** La spec annonce « le rendu réutilise la coquille publique existante des pages légales ». En planifiant, il apparaît que cette coquille porte son chrome EN DUR en français, volontairement. La réutiliser telle quelle donnerait un guide anglais sous un en-tête français. Le plan extrait donc la mise en page dans `PagePublique`, que les deux consomment : l'intention de la spec — ne pas dupliquer le gabarit — est respectée, son moyen est corrigé.

**Placeholders.** Aucun « TBD » ni « gérer les cas limites ». Les tâches 3 et 4 ne contiennent pas la prose finale — c'est le livrable du rédacteur — mais fixent pour chaque section son `id`, son titre, sa substance et le fichier où vérifier la règle, ce qui est exécutable sans autre contexte.

**Cohérence des types.** `Document`, `SectionDoc`, `Bloc` définis en tâche 1 et consommés tels quels ensuite. `chargerDocument(guide, codeLangue)` défini en tâche 2, appelé par `GuidePage` et par les gardes avec la même signature. `GUIDES` est la seule source de la liste des guides, utilisée par le registre, les gardes et le sommaire.
