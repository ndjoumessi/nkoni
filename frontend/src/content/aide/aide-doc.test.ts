import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { GUIDES, chargerDocument } from './registre'
import type { Bloc, Document } from './types'

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

  // Un titre EN identique au titre FR PEUT être une coïncidence légitime (« Notifications », par
  // exemple) : la liste ci-dessous n'est donc PAS vide par défaut. Elle est asserté EXACTEMENT
  // contre une constante NOMMÉE (jamais `toEqual([])` en dur, cf. C3) — une coïncidence nouvelle
  // doit être inscrite ici après relecture, et une traduction oubliée (id absent de cette liste
  // mais titres identiques) fait échouer le test.
  //
  // Aujourd'hui vide : aucune coïncidence recensée dans les trois documents. Une constante VIDE
  // mais NOMMÉE rend l'intention lisible (« on a vérifié, il n'y en a pas » plutôt qu'un
  // `toEqual([])` que le lecteur suivant pourrait prendre pour un test resté à compléter).
  const TITRES_IDENTIQUES_ASSUMES: string[] = []

  it.each(GUIDES)('%s : titres identiques FR/EN recensés explicitement', async (guide) => {
    const [fr, en] = await Promise.all([charger(guide, 'fr'), charger(guide, 'en')])
    const identiques = fr.sections.filter((s, i) => s.titre === en.sections[i]?.titre)
    expect(identiques.map((s) => s.id)).toEqual(TITRES_IDENTIQUES_ASSUMES)
  })

  /**
   * La parité d'`id`/titre (ci-dessus) ne prouve PAS qu'une section est traduite en entier : elle
   * passerait telle quelle si un bloc EN perdait une étape, une note, ou un lien vers une AUTRE
   * route que son homologue FR (spec §5 : « une section traduite à moitié ne passe pas »). On
   * compare donc, section par section, la SIGNATURE de la séquence de blocs : même `type` dans le
   * même ordre, même `ton` pour une note, même `vers` pour un lien, même nombre d'étapes/d'éléments
   * pour `etapes`/`liste`. Le TEXTE lui-même reste volontairement hors de la comparaison — FR et EN
   * ne sont pas des traductions mot à mot — seule la STRUCTURE doit concorder.
   */
  const signatureBloc = (bloc: Bloc): string => {
    switch (bloc.type) {
      case 'note':
        return `note:${bloc.ton}`
      case 'lien':
        return `lien:${bloc.vers}`
      case 'etapes':
        return `etapes:${bloc.etapes.length}`
      case 'liste':
        return `liste:${bloc.items.length}`
      case 'paragraphe':
        return 'paragraphe'
      default: {
        const _exhaustif: never = bloc
        return _exhaustif
      }
    }
  }

  it.each(GUIDES)('%s : même séquence de blocs (type, ton, vers, nombre) en FR et en EN', async (guide) => {
    const [fr, en] = await Promise.all([charger(guide, 'fr'), charger(guide, 'en')])
    const signature = (doc: Document) => doc.sections.map((s) => s.blocs.map(signatureBloc))
    expect(signature(fr).flat().length).toBeGreaterThan(0)
    expect(signature(en)).toEqual(signature(fr))
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
    [...routes].some(
      (r) => r === vers || (r.includes(':') && new RegExp(`^${r.replace(/:[^/]+/g, '[^/]+')}$`).test(vers)),
    )

  it.each(GUIDES)('%s : chaque bloc lien pointe vers une route déclarée', async (guide) => {
    const docs = await Promise.all([charger(guide, 'fr'), charger(guide, 'en')])
    const liens = docs.flatMap((d) =>
      d.sections.flatMap((s) => s.blocs.filter((b) => b.type === 'lien').map((b) => b.vers)),
    )
    expect(routes.size).toBeGreaterThan(0)
    expect(liens.filter((v) => !couvre(v))).toEqual([])
  })
})
