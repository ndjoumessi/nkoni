import { describe, expect, it } from 'vitest'
import { MODES_VERSEMENT } from './api'
import fr from '../locales/fr/common'
import en from '../locales/en/common'

/**
 * Garde-fou de COHÉRENCE côté front : la source unique runtime `MODES_VERSEMENT` (`lib/api/types.ts`,
 * miroir de `backend/lib/modes-versement.ts` — le front ne PEUT PAS importer le backend) doit couvrir
 * EXACTEMENT les libellés `commun.modesVersement`, dans les DEUX langues.
 *
 * Pourquoi : ces libellés sont rendus via `cleI18n()`, qui contourne le typage strict du catalogue.
 * Un mode présent dans l'union mais sans libellé (ou l'inverse) afficherait une clé i18n BRUTE à
 * l'écran — en silence, sans que tsc ni oxlint ne bronchent. Ce test transforme ce risque en échec
 * de CI. Il ne relie pas le front au backend (impossible) ; il garde le front cohérent avec lui-même.
 *
 * Modèle : `backend/tests/modes-versement-parity.test.ts` (parité constante ↔ enum), transposé à la
 * paire runtime ↔ libellés.
 */
describe('Cohérence des modes de versement côté front', () => {
  const source = [...MODES_VERSEMENT].sort()

  it('la source runtime n’est pas vide (anti-vacant)', () => {
    expect(source.length).toBeGreaterThan(0)
  })

  it('MODES_VERSEMENT == clés de commun.modesVersement (FR)', () => {
    expect(Object.keys(fr.commun.modesVersement).sort()).toEqual(source)
  })

  it('MODES_VERSEMENT == clés de commun.modesVersement (EN)', () => {
    expect(Object.keys(en.commun.modesVersement).sort()).toEqual(source)
  })
})
