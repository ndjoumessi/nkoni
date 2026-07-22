import { describe, it, expect, vi } from 'vitest'
import { envoyerRecuEmail } from '../src/services/email.service'

/** Email de repli — envoi BEST-EFFORT : respect adresse/préférence/dispo, ne lève JAMAIS. */

const META = { nomFichier: 'recu.pdf', sujet: 'Votre reçu', corps: 'Ci-joint votre reçu.' }
const PDF = Buffer.from('%PDF-1.4')
// Adresse avec casse/espaces → normalisée en minuscule sans espaces.
const EMAIL_BRUT = '  Test@Example.COM '
const EMAIL_NORM = 'test@example.com'

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

describe('envoyerRecuEmail', () => {
  it('sans email → non envoyé', async () => {
    const r = await envoyerRecuEmail(prisma(), client(), { email: null, membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: false, raison: 'sansEmail' })
  })

  it('email non plausible → non envoyé (emailInvalide), aucun appel réseau', async () => {
    const c = client()
    const r = await envoyerRecuEmail(prisma(), c, { email: 'pas-un-email', membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: false, raison: 'emailInvalide' })
    expect(c.envoyerDocument).not.toHaveBeenCalled()
  })

  it('client indisponible (pas de config env) → non envoyé', async () => {
    const r = await envoyerRecuEmail(prisma(), client(true, false), { email: EMAIL_BRUT, membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: false, raison: 'clientIndisponible' })
  })

  it('préférence VERSEMENT_RECU désactivée → non envoyé (aucun appel réseau)', async () => {
    const c = client()
    const r = await envoyerRecuEmail(prisma(false), c, { email: EMAIL_BRUT, membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: false, raison: 'desactive' })
    expect(c.envoyerDocument).not.toHaveBeenCalled()
  })

  it('nominal → envoyé, l’adresse NORMALISÉE (trim + minuscule) est transmise au client', async () => {
    const c = client()
    const r = await envoyerRecuEmail(prisma(), c, { email: EMAIL_BRUT, membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: true })
    expect(c.envoyerDocument).toHaveBeenCalledWith(EMAIL_NORM, PDF, META)
  })

  it('client qui LÈVE → best-effort : aucune exception, echecEnvoi', async () => {
    const c: any = { disponible: () => true, envoyerDocument: async () => { throw new Error('réseau down') } }
    const r = await envoyerRecuEmail(prisma(), c, { email: EMAIL_BRUT, membreCompteId: 'u1', pdf: PDF, meta: META })
    expect(r).toEqual({ envoye: false, raison: 'echecEnvoi' })
  })
})
/* eslint-enable @typescript-eslint/no-explicit-any */
