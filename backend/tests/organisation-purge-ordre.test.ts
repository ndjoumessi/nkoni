import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORDRE_SUPPRESSION, modelesAttendus } from '../src/services/organisation-purge.service'

/**
 * GARDES DE L'ORDRE DE SUPPRESSION (bloquant GA 0.3).
 *
 * `ORDRE_SUPPRESSION` est une liste MANUELLE — comme `SCOPED_MODELS`, et pour les mêmes raisons
 * (le DMMF ne voit ni la référence polymorphe `Document.entiteId`, ni `RefreshToken` qui n'a
 * aucune FK). Une liste manuelle sans garde exécutable dérive silencieusement : ces deux tests
 * sont ce qui la maintient vraie.
 *
 * Ils échouent dans les deux cas qui comptent :
 *   - on ajoute un 27ᵉ modèle scopé sans l'inscrire → il survivrait à la purge (parité) ;
 *   - une migration transforme un `SetNull` en `Restrict` → l'ordre devient invalide et la purge
 *     casserait en production sur une FK (validité topologique).
 */

describe('ORDRE_SUPPRESSION — parité avec les modèles à purger', () => {
  it('couvre exactement les modèles scopés + RefreshToken + Organisation', () => {
    expect([...ORDRE_SUPPRESSION].sort()).toEqual([...modelesAttendus()].sort())
  })

  it('ne contient aucun doublon (un modèle purgé deux fois masquerait une erreur d’ordre)', () => {
    expect(new Set(ORDRE_SUPPRESSION).size).toBe(ORDRE_SUPPRESSION.length)
  })

  it('termine par Organisation — toutes les FK entrantes doivent avoir disparu', () => {
    expect(ORDRE_SUPPRESSION[ORDRE_SUPPRESSION.length - 1]).toBe('Organisation')
  })
})

/**
 * VALIDITÉ TOPOLOGIQUE — dérivée du SCHÉMA, pas d'une liste recopiée à la main.
 *
 * On parse `schema.prisma` plutôt que le DMMF : la relation qui nous intéresse (`Recu.versementId`
 * en `onDelete: Restrict`) y est déclarée explicitement, et le parsing textuel reste cohérent avec
 * `tests/tenant-scoped-models.test.ts` qui procède déjà ainsi.
 *
 * NB : les relations OBLIGATOIRES sans `onDelete` explicite sont en `Restrict` chez Prisma — mais
 * elles pointent toutes vers `Organisation`, déjà placée en dernier par construction. On ne teste
 * donc ici que les `Restrict` DÉCLARÉS, qui sont les seuls à contraindre l'ordre INTERNE.
 */
describe('ORDRE_SUPPRESSION — validité topologique vis-à-vis des FK Restrict du schéma', () => {
  it('tout enfant en onDelete: Restrict est supprimé AVANT son parent', () => {
    const schema = readFileSync(join(__dirname, '../prisma/schema.prisma'), 'utf8')

    const aretes: Array<{ enfant: string; parent: string }> = []
    const regexModel = /model\s+(\w+)\s*\{([^}]*)\}/g
    let m: RegExpExecArray | null
    while ((m = regexModel.exec(schema)) !== null) {
      const enfant = m[1] as string
      const corps = m[2] as string
      for (const ligne of corps.split('\n')) {
        // Ignore les COMMENTAIRES : le schéma explique `onDelete: Restrict` en prose à plusieurs
        // endroits, et les compter produirait de fausses arêtes.
        const sansCommentaire = ligne.split('//')[0] as string
        if (!/onDelete:\s*Restrict/.test(sansCommentaire)) continue
        // `versement      Versement    @relation(fields: [versementId], …)` → parent = Versement
        const rel = /^\s*\w+\s+(\w+)/.exec(sansCommentaire)
        if (rel?.[1]) aretes.push({ enfant, parent: rel[1] })
      }
    }

    // Le schéma DOIT contenir au moins l'arête connue Recu → Versement ; sans elle, le parsing
    // est cassé et le test passerait à vide (piège classique du test qui ne teste rien).
    expect(aretes).toContainEqual({ enfant: 'Recu', parent: 'Versement' })

    for (const { enfant, parent } of aretes) {
      const iEnfant = ORDRE_SUPPRESSION.indexOf(enfant)
      const iParent = ORDRE_SUPPRESSION.indexOf(parent)
      if (iEnfant === -1 || iParent === -1) continue // modèle hors périmètre de purge
      expect(
        iEnfant,
        `${enfant} (index ${iEnfant}) doit être supprimé AVANT ${parent} (index ${iParent}) : FK onDelete Restrict`,
      ).toBeLessThan(iParent)
    }
  })
})
