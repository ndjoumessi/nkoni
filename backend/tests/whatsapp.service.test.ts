import { describe, it, expect, vi } from 'vitest'
import { envoyerRecuWhatsApp } from '../src/services/whatsapp.service'

/** WhatsApp — envoi BEST-EFFORT : respect téléphone/préférence/dispo, ne lève JAMAIS. */

const META = { nomFichier: 'recu.pdf', legende: 'Votre reçu' }
const PDF = Buffer.from('%PDF-1.4')
// Numéro local camerounais valide (9 chiffres, commence par 6) → normalisé en 237690000000.
const TEL_LOCAL = '690 00 00 00'
const TEL_E164 = '237690000000'

/* eslint-disable @typescript-eslint/no-explicit-any */
const client = (ok = true, dispo = true) => ({
  disponible: () => dispo,
  envoyerDocument: vi.fn(async () => ({ ok })),
})
// notificationsActives null = tout activé ; { VERSEMENT_RECU:false } = désactivé.
const prisma = (actif = true): any => ({
  utilisateur: {
    findUnique: async () => ({ notificationsActives: actif ? null : { VERSEMENT_RECU: false } }),
  },
})

describe('envoyerRecuWhatsApp', () => {
  it('sans téléphone → non envoyé', async () => {
    const r = await envoyerRecuWhatsApp(prisma(), client(), { telephone: null, membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: false, raison: 'sansTelephone' })
  })

  it('téléphone non normalisable → non envoyé (telephoneInvalide), aucun appel réseau', async () => {
    const c = client()
    const r = await envoyerRecuWhatsApp(prisma(), c, { telephone: '12', membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: false, raison: 'telephoneInvalide' })
    expect(c.envoyerDocument).not.toHaveBeenCalled()
  })

  it('client indisponible (pas de config env) → non envoyé', async () => {
    const r = await envoyerRecuWhatsApp(prisma(), client(true, false), { telephone: TEL_LOCAL, membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: false, raison: 'clientIndisponible' })
  })

  it('préférence VERSEMENT_RECU désactivée → non envoyé (aucun appel réseau)', async () => {
    const c = client()
    const r = await envoyerRecuWhatsApp(prisma(false), c, { telephone: TEL_LOCAL, membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: false, raison: 'desactive' })
    expect(c.envoyerDocument).not.toHaveBeenCalled()
  })

  it('nominal → envoyé, le numéro NORMALISÉ (E.164 sans +) est transmis au client', async () => {
    const c = client()
    const r = await envoyerRecuWhatsApp(prisma(), c, { telephone: TEL_LOCAL, membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: true })
    expect(c.envoyerDocument).toHaveBeenCalledWith(TEL_E164, PDF, META)
  })

  it('client qui LÈVE → best-effort : aucune exception, echecEnvoi', async () => {
    const c: any = { disponible: () => true, envoyerDocument: async () => { throw new Error('réseau down') } }
    const r = await envoyerRecuWhatsApp(prisma(), c, { telephone: TEL_LOCAL, membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: false, raison: 'echecEnvoi' })
  })
})
/* eslint-enable @typescript-eslint/no-explicit-any */
