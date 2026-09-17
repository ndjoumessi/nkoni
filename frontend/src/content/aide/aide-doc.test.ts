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

  // Un titre EN identique au titre FR PEUT être une coïncidence légitime (« Notifications », par
  // exemple) : la liste ci-dessous n'est donc PAS vide par défaut. Elle est asserté EXACTEMENT
  // (`toEqual`, jamais `toEqual([])` en dur) — une coïncidence nouvelle doit être inscrite ici
  // après relecture, et une traduction oubliée (id absent de cette liste mais titres identiques)
  // fait échouer le test.
  it.each(GUIDES)('%s : titres identiques FR/EN recensés explicitement', async (guide) => {
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
