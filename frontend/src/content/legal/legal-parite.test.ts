import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { CONTACT_EMAIL } from '@/lib/contact'
import { TEXTES_LEGAUX, chargerTexteLegal } from './registre'
import type { BlocLegal, DocumentLegal, Segment } from './types'

/**
 * GARDES DES TEXTES LÉGAUX (décision PO du 2026-09-22 : CGU et confidentialité traduites, le
 * FRANÇAIS faisant foi).
 *
 * Comme pour la documentation, le typage ne tient PAS la parité : `DocumentLegal.sections` est un
 * TABLEAU, donc TypeScript vérifie la forme d'une section mais jamais que les deux langues couvrent
 * les mêmes. Sur un document opposable, l'enjeu est plus fort qu'une page d'aide : une clause
 * présente d'un côté et absente de l'autre, ou une DATE de mise à jour qui diverge, et les deux
 * versions ne disent plus la même chose.
 */
const charger = (texte: (typeof TEXTES_LEGAUX)[number], langue: string): Promise<DocumentLegal> =>
  chargerTexteLegal(texte, langue)

/** Signature d'un bloc : ce qui doit concorder entre les langues, le TEXTE excepté. */
function signatureBloc(bloc: BlocLegal): string {
  switch (bloc.type) {
    case 'paragraphe':
      return `paragraphe:${bloc.contenu.map(signatureSegment).join('|')}`
    case 'sousTitre':
      return 'sousTitre'
    case 'liste':
      return `liste:${bloc.items.length}:${bloc.items.map((i) => i.map(signatureSegment).join('|')).join('/')}`
    default: {
      const _exhaustif: never = bloc
      return _exhaustif
    }
  }
}

/** Un lien doit viser la MÊME cible dans les deux langues ; un accent rester un accent. */
function signatureSegment(segment: Segment): string {
  if (typeof segment === 'string') return 'texte'
  if ('accent' in segment) return 'accent'
  return `lien:${segment.vers}`
}

const segments = (bloc: BlocLegal): Segment[] =>
  bloc.type === 'paragraphe' ? bloc.contenu : bloc.type === 'liste' ? bloc.items.flat() : []

/** Toutes les chaînes affichées d'un document (titres, sous-titres, textes, libellés de lien). */
function chaines(document: DocumentLegal): string[] {
  return [
    document.titre,
    ...document.sections.flatMap((s) => [
      s.titre,
      ...s.blocs.flatMap((b) => [
        ...(b.type === 'sousTitre' ? [b.texte] : []),
        ...segments(b).map((seg) =>
          typeof seg === 'string' ? seg : 'accent' in seg ? seg.accent : seg.texte,
        ),
      ]),
    ]),
  ]
}

describe('textes légaux — parité FR/EN', () => {
  it('le registre n’est jamais vide', () => {
    expect(TEXTES_LEGAUX.length).toBeGreaterThan(0)
  })

  it.each(TEXTES_LEGAUX)('%s : mêmes sections, dans le même ordre', async (texte) => {
    const [fr, en] = await Promise.all([charger(texte, 'fr'), charger(texte, 'en')])
    expect(fr.sections.length).toBeGreaterThan(0)
    expect(en.sections.map((s) => s.id)).toEqual(fr.sections.map((s) => s.id))
  })

  it.each(TEXTES_LEGAUX)('%s : même structure de blocs et mêmes cibles de lien', async (texte) => {
    const [fr, en] = await Promise.all([charger(texte, 'fr'), charger(texte, 'en')])
    const signature = (d: DocumentLegal) => d.sections.map((s) => s.blocs.map(signatureBloc))
    expect(signature(fr).flat().length).toBeGreaterThan(0)
    expect(signature(en)).toEqual(signature(fr))
  })

  it.each(TEXTES_LEGAUX)('%s : MÊME date de mise à jour dans les deux langues', async (texte) => {
    // Une traduction publiée avec une date différente ferait croire à deux versions distinctes.
    const [fr, en] = await Promise.all([charger(texte, 'fr'), charger(texte, 'en')])
    expect(fr.majLe).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(en.majLe).toBe(fr.majLe)
  })

  it.each(TEXTES_LEGAUX)('%s : le titre est bien TRADUIT (pas le français recopié)', async (texte) => {
    const [fr, en] = await Promise.all([charger(texte, 'fr'), charger(texte, 'en')])
    expect(en.titre).not.toBe(fr.titre)
  })

  it('une langue inconnue retombe sur le français, version de référence', async () => {
    const [fr, inconnue] = await Promise.all([charger('cgu', 'fr'), charger('cgu', 'de')])
    expect(inconnue.titre).toBe(fr.titre)
  })
})

describe('textes légaux — ancres et liens', () => {
  it.each(TEXTES_LEGAUX)('%s : ancres uniques, en kebab-case sans accent', async (texte) => {
    const doc = await charger(texte, 'fr')
    const ids = doc.sections.map((s) => s.id)
    expect(ids.length).toBeGreaterThan(0)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((id) => !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id))).toEqual([])
  })

  /**
   * Un lien mort dans des CGU est pire qu'ailleurs : c'est la page vers laquelle le texte RENVOIE
   * pour une obligation (« notre politique de confidentialité »). Les routes sont lues en TEXTE
   * dans `App.tsx`, seule source de vérité ; une adresse de contact est confrontée à `CONTACT_EMAIL`.
   */
  const routes = new Set(
    [...readFileSync('src/App.tsx', 'utf8').matchAll(/path="([^"]+)"/g)].map((m) => m[1]),
  )

  it.each(TEXTES_LEGAUX)('%s : chaque lien vise une route déclarée ou l’adresse de contact', async (texte) => {
    const docs = await Promise.all([charger(texte, 'fr'), charger(texte, 'en')])
    const cibles = docs.flatMap((d) =>
      d.sections.flatMap((s) =>
        s.blocs.flatMap((b) =>
          segments(b).flatMap((seg) => (typeof seg === 'object' && 'vers' in seg ? [seg.vers] : [])),
        ),
      ),
    )
    expect(routes.size).toBeGreaterThan(0)
    expect(cibles.length).toBeGreaterThan(0)
    const invalides = cibles.filter((vers) =>
      vers.startsWith('mailto:') ? vers !== `mailto:${CONTACT_EMAIL}` : !routes.has(vers),
    )
    expect(invalides).toEqual([])
  })
})

describe('textes légaux — typographie', () => {
  it.each(TEXTES_LEGAUX)('%s : apostrophe typographique, en FR comme en EN', async (texte) => {
    const docs = await Promise.all([charger(texte, 'fr'), charger(texte, 'en')])
    const textes = docs.flatMap(chaines)
    expect(textes.length).toBeGreaterThan(0)
    expect(textes.filter((t) => /\p{L}'\p{L}/u.test(t))).toEqual([])
  })
})
