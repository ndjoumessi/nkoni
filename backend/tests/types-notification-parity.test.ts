import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  TYPES_NOTIFICATION,
  TYPES_NOTIFICATION_NON_DESACTIVABLES,
} from '../src/services/notification.service'

/**
 * Garde de parité : types de notification TS ↔ enum Postgres `TypeNotification` (lu EN TEXTE dans le
 * schéma). Les préférences sont DÉRIVÉES de `TYPES_NOTIFICATION` (schéma ajv de PATCH
 * /notifications/preferences) : un type ajouté à l'enum mais oublié des deux listes serait créé sans
 * jamais être désactivable ni affiché, et un avis de service ajouté par erreur à `TYPES_NOTIFICATION`
 * deviendrait désactivable. Le garde exige que chaque valeur de l'enum soit dans EXACTEMENT une liste.
 */
const SCHEMA = readFileSync(resolve(__dirname, '../prisma/schema.prisma'), 'utf8')

function valeursEnum(nom: string): string[] {
  const m = SCHEMA.match(new RegExp(`enum ${nom} \\{([^}]*)\\}`))
  if (!m) throw new Error(`enum ${nom} introuvable dans schema.prisma`)
  return m[1]
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, '').trim())
    .filter(Boolean)
}

describe('parité TypeNotification (TS ↔ Postgres)', () => {
  const enumPostgres = valeursEnum('TypeNotification')

  it('extraction non vacante', () => {
    expect(enumPostgres.length).toBeGreaterThan(0)
  })

  it('désactivables ∪ non désactivables = enum Postgres', () => {
    expect([...TYPES_NOTIFICATION, ...TYPES_NOTIFICATION_NON_DESACTIVABLES].sort()).toEqual(
      [...enumPostgres].sort(),
    )
  })

  it('aucun type dans les deux listes ; FORFAIT_ECHEANCE est un avis de service non désactivable', () => {
    const desactivables = new Set<string>(TYPES_NOTIFICATION)
    expect(TYPES_NOTIFICATION_NON_DESACTIVABLES.filter((t) => desactivables.has(t))).toEqual([])
    expect(TYPES_NOTIFICATION_NON_DESACTIVABLES).toContain('FORFAIT_ECHEANCE')
  })
})
