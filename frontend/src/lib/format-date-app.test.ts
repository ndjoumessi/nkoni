import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { formatDate, formatDateApp } from './utils'

// Env `node`. Échéance = fin de journée à Douala (UTC+1) : 30/09/2026 23:59:59.999 = 22:59:59.999Z.
const FIN_30_SEPTEMBRE = '2026-09-30T22:59:59.999Z'
const NUMERIQUE: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' }

describe('formatDateApp — échéance lue dans le fuseau applicatif', () => {
  let tzInitial: string | undefined
  beforeEach(() => {
    tzInitial = process.env.TZ
    // Poste de la diaspora, à l'est de Douala (Paris en heure d'été = UTC+2).
    process.env.TZ = 'Europe/Paris'
  })
  afterEach(() => {
    process.env.TZ = tzInitial
  })

  it('formatDate (fuseau du poste) glisse au lendemain — le défaut que formatDateApp corrige', () => {
    expect(formatDate(FIN_30_SEPTEMBRE, NUMERIQUE)).toBe('01/10/2026')
  })

  it('formatDateApp garde le jour de Douala', () => {
    expect(formatDateApp(FIN_30_SEPTEMBRE, NUMERIQUE)).toBe('30/09/2026')
  })

  it('repli sur « — » si absente', () => {
    expect(formatDateApp(null)).toBe('—')
  })
})
