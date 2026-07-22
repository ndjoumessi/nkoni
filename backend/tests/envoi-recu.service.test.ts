import { describe, it, expect, vi } from 'vitest'
import { envoyerRecu } from '../src/services/envoi-recu.service'

/**
 * Orchestrateur d'envoi de reçu — WhatsApp d'abord, EMAIL en REPLI. Vérifie que le repli n'est
 * tenté QUE si WhatsApp n'a pas délivré, et que le canal gagnant est correctement rapporté.
 */

const PDF = Buffer.from('%PDF-1.4')
const META_WA = { nomFichier: 'recu.pdf', legende: 'Votre reçu' }
const META_EMAIL = { nomFichier: 'recu.pdf', sujet: 'Votre reçu', corps: 'Ci-joint.' }
const TEL = '690000000' // local camerounais valide
const EMAIL = 'test@example.com'

/* eslint-disable @typescript-eslint/no-explicit-any */
const clientWa = (ok = true, dispo = true) => ({ disponible: () => dispo, envoyerDocument: vi.fn(async () => ({ ok })) })
const clientEmail = (ok = true, dispo = true) => ({ disponible: () => dispo, envoyerDocument: vi.fn(async () => ({ ok })) })
// Préférences toujours actives (le respect de la préférence est testé dans chaque service).
const prisma = (): any => ({ utilisateur: { findUnique: async () => ({ notificationsActives: null }) } })

const params = (over: Partial<{ telephone: string | null; email: string | null }> = {}) => ({
  telephone: TEL as string | null,
  email: EMAIL as string | null,
  membreCompteId: 'u1',
  pdf: PDF,
  metaWhatsApp: META_WA,
  metaEmail: META_EMAIL,
  ...over,
})

describe('envoyerRecu (orchestrateur)', () => {
  it('WhatsApp délivre → canal whatsapp, le repli email n’est PAS tenté', async () => {
    const wa = clientWa()
    const email = clientEmail()
    const r = await envoyerRecu(prisma(), { whatsapp: wa, email }, params())
    expect(r.envoye).toBe(true)
    expect(r.canal).toBe('whatsapp')
    expect(r.email).toEqual({ envoye: false, raison: 'nonTente' })
    expect(email.envoyerDocument).not.toHaveBeenCalled()
  })

  it('WhatsApp indisponible → bascule sur email, canal email', async () => {
    const wa = clientWa(true, false) // client WhatsApp non configuré
    const email = clientEmail()
    const r = await envoyerRecu(prisma(), { whatsapp: wa, email }, params())
    expect(r.canal).toBe('email')
    expect(r.envoye).toBe(true)
    expect(r.whatsapp).toEqual({ envoye: false, raison: 'clientIndisponible' })
    expect(email.envoyerDocument).toHaveBeenCalledOnce()
  })

  it('WhatsApp sans numéro → repli email tenté', async () => {
    const wa = clientWa()
    const email = clientEmail()
    const r = await envoyerRecu(prisma(), { whatsapp: wa, email }, params({ telephone: null }))
    expect(r.canal).toBe('email')
    expect(wa.envoyerDocument).not.toHaveBeenCalled()
    expect(email.envoyerDocument).toHaveBeenCalledOnce()
  })

  it('les deux canaux échouent → non envoyé, canal null, détail des deux raisons', async () => {
    const wa = clientWa(true, false)
    const email = clientEmail(true, false)
    const r = await envoyerRecu(prisma(), { whatsapp: wa, email }, params())
    expect(r.envoye).toBe(false)
    expect(r.canal).toBeNull()
    expect(r.whatsapp).toEqual({ envoye: false, raison: 'clientIndisponible' })
    expect(r.email).toEqual({ envoye: false, raison: 'clientIndisponible' })
  })
})
/* eslint-enable @typescript-eslint/no-explicit-any */
