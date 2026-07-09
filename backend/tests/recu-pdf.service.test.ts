import { describe, it, expect, vi } from 'vitest'
import { genererRecuPdf, produireRecuPdf, chargerDonneesRecuPdf } from '../src/services/recu-pdf.service'

const DONNEES = {
  numero: 'NKONI-2024-000001',
  date: new Date('2024-03-01'),
  membreNom: 'Tchoupa',
  membrePrenom: 'Bernard',
  annee: 2024,
  montant: 10_000,
  mode: 'ESPECES',
}
const CTX = { recuId: 'r1', donnees: DONNEES, membreCompteId: 'u1', membreTelephone: '690', urlPdf: null }

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('genererRecuPdf', () => {
  it('produit un PDF valide (signature %PDF) en FR/FCFA et EN/EUR', async () => {
    const fr = await genererRecuPdf(DONNEES, 'FR', 'FCFA')
    expect(fr.subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(fr.length).toBeGreaterThan(500)
    const en = await genererRecuPdf(DONNEES, 'EN', 'EUR')
    expect(en.subarray(0, 4).toString('latin1')).toBe('%PDF')
  })
})

describe('produireRecuPdf — idempotent, Blob PRIVÉ', () => {
  it('génère + pousse le blob + renseigne urlPdf quand absent', async () => {
    const blob: any = { put: vi.fn(async () => ({ url: 'https://blob/x' })), del: vi.fn(), lireContenu: vi.fn(async () => null) }
    const update = vi.fn(async () => ({}))
    const prisma: any = { recu: { findUnique: vi.fn(), update }, versement: { findUnique: vi.fn() } }

    const res = await produireRecuPdf(prisma, blob, { ...CTX }, 'FR', 'FCFA')
    expect(res.url).toBe('https://blob/x')
    expect(blob.put).toHaveBeenCalledOnce()
    // Le blob reçoit bien un PDF ; urlPdf est persisté.
    expect((blob.put.mock.calls[0][1] as Buffer).subarray(0, 4).toString('latin1')).toBe('%PDF')
    expect(update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { urlPdf: 'https://blob/x' } })
  })

  it('relit le blob existant sans régénérer quand urlPdf est déjà renseigné', async () => {
    const blob: any = { put: vi.fn(), del: vi.fn(), lireContenu: vi.fn(async () => Buffer.from('%PDF-cache')) }
    const update = vi.fn()
    const prisma: any = { recu: { findUnique: vi.fn(), update }, versement: { findUnique: vi.fn() } }

    const res = await produireRecuPdf(prisma, blob, { ...CTX, urlPdf: 'https://blob/y' }, 'FR', 'FCFA')
    expect(res.url).toBe('https://blob/y')
    expect(blob.put).not.toHaveBeenCalled()
    expect(update).not.toHaveBeenCalled()
  })
})

describe('chargerDonneesRecuPdf', () => {
  it('assemble Recu → Versement → Membre (compte + téléphone pour accès/envoi)', async () => {
    const prisma: any = {
      recu: {
        findUnique: async () => ({ id: 'r1', numero: 'NK-1', dateGeneration: new Date('2024-03-01'), versementId: 'v1', urlPdf: null }),
        update: async () => ({}),
      },
      versement: {
        findUnique: async () => ({
          montant: 10_000,
          mode: 'ESPECES',
          contribution: { annee: 2024, membre: { nom: 'T', prenom: 'B', compteUtilisateurId: 'u1', telephone: '690' } },
        }),
      },
    }
    const ctx = await chargerDonneesRecuPdf(prisma, 'r1')
    expect(ctx).toMatchObject({
      recuId: 'r1',
      membreCompteId: 'u1',
      membreTelephone: '690',
      urlPdf: null,
      donnees: { montant: 10_000, annee: 2024, membreNom: 'T', mode: 'ESPECES' },
    })
  })

  it('reçu inexistant → null', async () => {
    const prisma: any = { recu: { findUnique: async () => null, update: async () => ({}) }, versement: { findUnique: async () => null } }
    expect(await chargerDonneesRecuPdf(prisma, 'inconnu')).toBeNull()
  })
})
/* eslint-enable @typescript-eslint/no-explicit-any */
