import { describe, it, expect } from 'vitest'
import { executerEtapeDemo } from '../src/services/demo-regeneration.service'

/**
 * Étape nocturne de la démo (spec 2026-09-15 §3.2) : n'agit que si `DEMO_ACTIVEE`, ne fait JAMAIS échouer
 * la tâche de nuit, signale un échec à l'observabilité avec `tache: 'DEMO'`.
 */

function deps(demoActivee: boolean) {
  const journal: string[] = []
  const signalements: { contexte: Record<string, unknown> }[] = []
  return {
    journal,
    signalements,
    valeur: {
      prisma: {},
      blob: { del: async () => undefined },
      demoActivee,
      log: { info: (_o: object, msg: string) => void journal.push(`info:${msg}`), error: (_o: object, msg: string) => void journal.push(`error:${msg}`) },
      observabilite: { signaler: (_e: unknown, contexte: Record<string, unknown>) => void signalements.push({ contexte }) },
    },
  }
}

describe('executerEtapeDemo', () => {
  it('démo éteinte : ne régénère rien', async () => {
    const d = deps(false)
    let appels = 0
    await executerEtapeDemo(d.valeur, async () => {
      appels++
      return { statut: 'A_JOUR', demoId: 'x', supprimees: [] }
    })
    expect(appels).toBe(0)
  })

  it('démo activée : régénère et journalise le résultat', async () => {
    const d = deps(true)
    await executerEtapeDemo(d.valeur, async () => ({ statut: 'REGENEREE', demoId: 'org-demo', supprimees: ['ancienne'] }))
    expect(d.journal.some((l) => l.startsWith('info:'))).toBe(true)
    expect(d.signalements).toEqual([])
  })

  it('échec : journalisé, signalé avec tache DEMO, jamais propagé', async () => {
    const d = deps(true)
    await expect(
      executerEtapeDemo(d.valeur, async () => {
        throw new Error('base indisponible')
      }),
    ).resolves.toBeUndefined()
    expect(d.journal.some((l) => l.startsWith('error:'))).toBe(true)
    expect(d.signalements[0]?.contexte).toMatchObject({ source: 'scheduler', tache: 'DEMO' })
  })
})
