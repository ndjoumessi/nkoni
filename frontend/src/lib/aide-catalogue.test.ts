import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/aide'
import en from '@/locales/en/aide'
import { LIENS_AIDE, NOTIONS_AIDE } from './aide'

/**
 * Chaque notion du catalogue a un titre et un texte NON VIDES dans les deux langues. Le typage EN
 * garantit la parité des CLÉS avec le FR, pas qu'une notion de `NOTIONS_AIDE` ait bien son entrée :
 * c'est l'objet de ce test.
 */
describe("catalogue d'aide", () => {
  it("n'est jamais vacant", () => {
    expect(NOTIONS_AIDE.length).toBeGreaterThan(0)
  })

  it.each([
    ['fr', fr],
    ['en', en],
  ])("chaque notion a un titre et un texte en %s", (_langue, catalogue) => {
    const notions = catalogue.aide.notions as Record<string, { titre?: string; texte?: string }>
    for (const notion of NOTIONS_AIDE) {
      expect(notions[notion]?.titre?.trim(), `${notion}.titre`).toBeTruthy()
      expect(notions[notion]?.texte?.trim(), `${notion}.texte`).toBeTruthy()
    }
  })

  it("aucune entrée de texte sans notion déclarée (pas de texte orphelin)", () => {
    expect(Object.keys(fr.aide.notions).sort()).toEqual([...NOTIONS_AIDE].sort())
  })

  it('les liens « En savoir plus » visent des routes internes', () => {
    for (const lien of Object.values(LIENS_AIDE)) expect(lien).toMatch(/^\/[a-z]/)
  })

  it("3 phrases au plus par texte (règle de rédaction)", () => {
    for (const catalogue of [fr, en]) {
      for (const { texte } of Object.values(catalogue.aide.notions)) {
        const phrases = texte.split(/(?<=[.!?])\s+/).filter((p) => p.trim().length > 0)
        expect(phrases.length, texte).toBeLessThanOrEqual(3)
      }
    }
  })
})
