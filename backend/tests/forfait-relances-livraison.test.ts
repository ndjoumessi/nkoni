/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'
import { livrerRelancesForfait } from '../src/services/forfait-relances.service'
import { orgContext } from '../src/lib/org-context'

const resultat = (organisationId: string, n: number) => ({
  organisationId,
  etape: 'J7' as const,
  notifies: n,
  aPousser: Array.from({ length: n }, (_, i) => ({ destinataireId: `${organisationId}-u${i}`, titre: 'T', message: 'M' })),
  aEnvoyer: Array.from({ length: n }, (_, i) => ({ email: `u${i}@${organisationId}.test`, sujet: 'S', texte: 'X' })),
})

function deps(emailOk: (adresse: string) => boolean = () => true) {
  const contextesPush: (string | undefined)[] = []
  const prisma: any = {
    pushSubscription: {
      findMany: async () => {
        contextesPush.push(orgContext.organisationId())
        return [{ endpoint: 'https://push.test/1', p256dh: 'p', auth: 'a' }]
      },
      deleteMany: async () => ({ count: 0 }),
      create: async () => ({}),
    },
  }
  const push = { disponible: () => true, envoyer: vi.fn(async () => ({ ok: true })) }
  const email = {
    disponible: () => true,
    envoyerDocument: vi.fn(),
    envoyerMessage: vi.fn(async (adresse: string) => {
      if (adresse.startsWith('boom')) throw new Error('réseau')
      return { ok: emailOk(adresse) }
    }),
  }
  return { prisma, push, email, contextesPush }
}

describe('livrerRelancesForfait (après commit)', () => {
  it('pousse chaque notification DANS le contexte de son organisation, vers /parametres, et envoie les e-mails', async () => {
    const d = deps()
    const r = await livrerRelancesForfait(d, [resultat('org-a', 2), resultat('org-b', 1), resultat('org-c', 0)])

    expect(d.contextesPush).toEqual(['org-a', 'org-a', 'org-b'])
    expect(d.push.envoyer).toHaveBeenCalledTimes(3)
    expect((d.push.envoyer.mock.calls[0] as any[])[1]).toEqual({ titre: 'T', message: 'M', url: '/parametres' })
    expect(d.email.envoyerMessage).toHaveBeenCalledTimes(3)
    expect(r).toEqual({ emailsEnvoyes: 3 })
  })

  it('un e-mail en échec ou qui lève n’interrompt pas les suivants', async () => {
    const d = deps((a) => !a.startsWith('u0'))
    const res = resultat('org-a', 2)
    res.aEnvoyer.unshift({ email: 'boom@org-a.test', sujet: 'S', texte: 'X' })
    const r = await livrerRelancesForfait(d, [res])
    expect(d.email.envoyerMessage).toHaveBeenCalledTimes(3)
    expect(r).toEqual({ emailsEnvoyes: 1 })
  })
})
