import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SCOPED_MODELS } from '../src/lib/tenant-extension'

/**
 * Garde-fou d'ISOLATION (audit C1) : `SCOPED_MODELS` est une allowlist manuelle — un modèle
 * portant `organisationId` mais OUBLIÉ dans le Set ne serait PAS isolé (fail-open silencieux).
 * Ce test parse le schéma Prisma et exige une PARITÉ STRICTE dans les deux sens : tout modèle
 * avec le champ scalaire `organisationId` doit être scopé, et le Set ne doit contenir aucun extra.
 */
describe('Isolation multi-tenant — parité SCOPED_MODELS ↔ schéma Prisma', () => {
  it('tout modèle portant `organisationId` est déclaré scopé (et réciproquement)', () => {
    const schema = readFileSync(join(__dirname, '../prisma/schema.prisma'), 'utf8')
    const modelesAvecOrg = new Set<string>()
    const regexModel = /model\s+(\w+)\s*\{([^}]*)\}/g
    let m: RegExpExecArray | null
    while ((m = regexModel.exec(schema)) !== null) {
      const nom = m[1]
      const corps = m[2]
      // Champ SCALAIRE `organisationId` en début de ligne (pas les `fields: [organisationId]`
      // des relations ni les `@@unique([organisationId, …])`).
      if (/(^|\n)\s*organisationId\s+\w/.test(corps)) modelesAvecOrg.add(nom)
    }
    expect([...modelesAvecOrg].sort()).toEqual([...SCOPED_MODELS].sort())
  })
})

/**
 * Garde-fou de PROSE : `CLAUDE.md` annonce le nombre de modèles scopés en toutes lettres, et ce
 * chiffre est recopié à la main. Rien ne le vérifiait, donc il dérivait en silence — trois
 * compteurs décrivant le MÊME Set ont fini par afficher trois valeurs différentes (27, 28 et 30
 * pour 29 modèles réels). Le libellé du fixture de purge est désormais DÉRIVÉ de
 * `SCOPED_MODELS.size` ; la prose de CLAUDE.md, elle, ne peut pas l'être — d'où ce test.
 *
 * Le fichier étant lu à la RACINE du dépôt, ce test échoue aussi s'il est déplacé ou renommé
 * (readFileSync lève) : c'est voulu, un garde-fou muet ne garde rien.
 */
describe('Isolation multi-tenant — parité CLAUDE.md ↔ SCOPED_MODELS.size', () => {
  it('chaque nombre annoncé devant « SCOPED_MODELS » vaut le compte réel', () => {
    const doc = readFileSync(join(__dirname, '../../CLAUDE.md'), 'utf8')
    // Capture « les 29 `SCOPED_MODELS` » comme « l'un des 29 SCOPED_MODELS » (backticks optionnels).
    const mentions = [...doc.matchAll(/(\d+)\s+`?SCOPED_MODELS`?/g)].map((m) => Number(m[1]))

    // SANS cette garde, le test passerait au VERT le jour où une reformulation ferait disparaître
    // toutes les mentions : zéro correspondance ⇒ zéro assertion ⇒ faux sentiment de couverture.
    expect(mentions.length, 'aucune mention chiffrée de SCOPED_MODELS trouvée dans CLAUDE.md — le test ne garde plus rien').toBeGreaterThan(0)

    const faux = mentions.filter((n) => n !== SCOPED_MODELS.size)
    expect(
      faux,
      `CLAUDE.md annonce ${faux.join(', ')} alors que SCOPED_MODELS en compte ${SCOPED_MODELS.size}`,
    ).toEqual([])
  })
})
