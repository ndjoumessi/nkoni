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
