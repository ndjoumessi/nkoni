/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'
import {
  QuotaStockageDepasseError,
  chargerCapacitesOrganisation,
  stockageUtiliseOctets,
  verifierQuotaStockage,
} from '../src/services/capacites-organisation.service'
import { CAPACITES_FORFAIT } from '../src/lib/forfait'
import { finDeJourneeApp } from '../src/lib/date-app'

const NOW = new Date('2026-09-14T10:00:00Z')
const MO = 1024 * 1024
const fin = (jour: string) => finDeJourneeApp(new Date(`${jour}T12:00:00+01:00`))

function mock(org: any, sommeOctets: number | null = 0) {
  const appels: any[] = []
  const prisma: any = {
    organisation: {
      findUnique: async (args: any) => {
        appels.push(args)
        return org
      },
    },
    document: { aggregate: async () => ({ _sum: { tailleOctets: sommeOctets } }) },
  }
  return { prisma, appels }
}

describe('chargerCapacitesOrganisation', () => {
  it('lit forfait, échéance et droit acquis de l’organisation, par id', async () => {
    const { prisma, appels } = mock({ forfait: 'PRO', forfaitExpireLe: null, paiementEnLigneAcquis: false })
    const c = await chargerCapacitesOrganisation(prisma, 'org-1', NOW)
    expect(appels[0]).toEqual({
      where: { id: 'org-1' },
      select: { forfait: true, forfaitExpireLe: true, paiementEnLigneAcquis: true },
    })
    expect(c).toEqual({
      forfaitEffectif: 'PRO',
      capacites: CAPACITES_FORFAIT.PRO,
      paiementEnLigneAcquis: false,
      paiementEnLigneInclus: true,
    })
  })

  it('PRO expiré : capacités GRATUIT, paiement non inclus sauf droit acquis', async () => {
    const expire = { forfait: 'PRO', forfaitExpireLe: fin('2026-08-01') }
    const sansDroit = await chargerCapacitesOrganisation(mock({ ...expire, paiementEnLigneAcquis: false }).prisma, 'o', NOW)
    expect(sansDroit).toMatchObject({ forfaitEffectif: 'GRATUIT', paiementEnLigneInclus: false })
    const avecDroit = await chargerCapacitesOrganisation(mock({ ...expire, paiementEnLigneAcquis: true }).prisma, 'o', NOW)
    expect(avecDroit).toMatchObject({ forfaitEffectif: 'GRATUIT', paiementEnLigneInclus: true })
  })

  it('organisation introuvable → null', async () => {
    expect(await chargerCapacitesOrganisation(mock(null).prisma, 'x', NOW)).toBeNull()
  })
})

describe('stockageUtiliseOctets', () => {
  it('somme des tailles, 0 sans document', async () => {
    expect(await stockageUtiliseOctets(mock({}, 42).prisma)).toBe(42)
    expect(await stockageUtiliseOctets(mock({}, null).prisma)).toBe(0)
  })
})

describe('verifierQuotaStockage', () => {
  const GRATUIT = { forfait: 'GRATUIT', forfaitExpireLe: null, paiementEnLigneAcquis: false }

  it('sous le quota (limite incluse) : passe', async () => {
    await expect(verifierQuotaStockage(mock(GRATUIT, 490 * MO).prisma, 'o', 10 * MO, NOW)).resolves.toBeUndefined()
  })

  it('au-delà du quota : QuotaStockageDepasseError avec utilisé et quota', async () => {
    const err = await verifierQuotaStockage(mock(GRATUIT, 495 * MO).prisma, 'o', 10 * MO, NOW).catch((e) => e)
    expect(err).toBeInstanceOf(QuotaStockageDepasseError)
    expect(err).toMatchObject({ utiliseOctets: 495 * MO, quotaOctets: 500 * MO })
  })

  it('PRO expiré : quota GRATUIT appliqué', async () => {
    const org = { forfait: 'PRO', forfaitExpireLe: fin('2026-08-01'), paiementEnLigneAcquis: false }
    await expect(verifierQuotaStockage(mock(org, 600 * MO).prisma, 'o', MO, NOW)).rejects.toBeInstanceOf(QuotaStockageDepasseError)
  })

  it('organisation introuvable : quota GRATUIT (le plus restrictif, jamais d’ouverture par défaut)', async () => {
    await expect(verifierQuotaStockage(mock(null, 600 * MO).prisma, 'o', MO, NOW)).rejects.toBeInstanceOf(QuotaStockageDepasseError)
  })
})
