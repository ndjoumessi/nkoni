import { describe, expect, it } from 'vitest'
import fr from '@/locales/fr/aide'
import en from '@/locales/en/aide'
import { LIENS_AIDE, NOTIONS_AIDE } from './aide'
import { chargerDocument, estGuide } from '@/content/aide/registre'

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

  /**
   * Chaque « En savoir plus » vise une SECTION RÉELLE de la documentation : l'ancre est confrontée
   * aux identifiants du guide FR (la parité FR/EN des identifiants est tenue par `aide-doc.test.ts`,
   * donc l'EN est couvert). Une ancre fausse n'échoue nulle part ailleurs — le navigateur ouvre
   * simplement la page en haut, sans rapport avec la notion.
   */
  it('les liens « En savoir plus » visent une section existante de la documentation', async () => {
    const liens = Object.entries(LIENS_AIDE)
    expect(liens.length).toBeGreaterThan(0)
    const invalides: string[] = []
    for (const [notion, lien] of liens) {
      const [, guide, ancre] = /^\/aide\/([a-z]+)#([a-z0-9-]+)$/.exec(lien) ?? []
      if (!guide || !ancre || !estGuide(guide)) {
        invalides.push(`${notion} → ${lien}`)
        continue
      }
      const doc = await chargerDocument(guide, 'fr')
      if (!doc.sections.some((s) => s.id === ancre)) invalides.push(`${notion} → ${lien}`)
    }
    expect(invalides).toEqual([])
  })

  it("aucune apostrophe droite entre deux lettres dans les textes (typographie)", () => {
    for (const catalogue of [fr, en]) {
      for (const [notion, { titre, texte }] of Object.entries(catalogue.aide.notions)) {
        expect(`${titre} ${texte}`, notion).not.toMatch(/\p{L}'\p{L}/u)
      }
    }
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
