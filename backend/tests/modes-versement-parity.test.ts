import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MODES_VERSEMENT } from '../src/lib/modes-versement'

/**
 * Garde EXÉCUTABLE : la constante partagée `MODES_VERSEMENT` doit valoir EXACTEMENT l'enum Postgres
 * `ModeVersement` du schéma. Sans elle, ajouter une valeur d'enum (ou en retirer) sans reporter la
 * constante repasserait au vert alors que l'API refuserait/accepterait le mauvais ensemble.
 * Lit le SCHÉMA en texte (source de vérité), comme `tenant-scoped-models.test.ts`.
 */
describe('Parité modes de versement (constante ↔ enum Postgres)', () => {
  it('MODES_VERSEMENT == enum ModeVersement du schéma', () => {
    const schema = readFileSync(join(__dirname, '../prisma/schema.prisma'), 'utf8')
    const bloc = schema.match(/enum ModeVersement \{([^}]*)\}/)
    expect(bloc).not.toBeNull()
    const duSchema = bloc![1]
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('//'))
    // Anti-vacant : si le regex ne capturait rien, le test passerait à tort.
    expect(duSchema.length).toBeGreaterThan(0)
    expect([...duSchema].sort()).toEqual([...MODES_VERSEMENT].sort())
  })
})
