import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatDateApp } from '../src/lib/i18n'

// Échéance = fin de journée à Douala (UTC+1) : 30/09/2026 23:59:59.999 = 22:59:59.999Z.
const FIN_30_SEPTEMBRE = new Date('2026-09-30T22:59:59.999Z')

describe('formatDateApp (backend) — date d’échéance lue à Douala', () => {
  let tzInitial: string | undefined
  beforeEach(() => {
    tzInitial = process.env.TZ
    // Process à l'EST de Douala : sans fuseau explicite, la date glisserait au 1er octobre.
    process.env.TZ = 'Asia/Tokyo'
  })
  afterEach(() => {
    process.env.TZ = tzInitial
  })

  it('FR et EN gardent le jour de Douala', () => {
    expect(formatDateApp(FIN_30_SEPTEMBRE, 'FR')).toBe('30 septembre 2026')
    expect(formatDateApp(FIN_30_SEPTEMBRE, 'EN')).toBe('September 30, 2026')
  })
})
