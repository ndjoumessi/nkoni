import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { classifierEchec, soumettreOuEnfiler, synchroniser } from './offline-sync'
import { ApiError, definirModeDemo } from './api'
import { enfiler, listerFile } from './offline-queue'

vi.mock('./offline-queue', () => ({
  enfiler: vi.fn(async () => undefined),
  listerFile: vi.fn(async () => []),
  retirerDeLaFile: vi.fn(async () => undefined),
  marquerErreur: vi.fn(async () => undefined),
}))

/** classifierEchec : ApiError (réponse serveur) = client ; rejet fetch = réseau. */
describe('classifierEchec', () => {
  it('ApiError (4xx/5xx) → client (ne pas rejouer en boucle)', () => {
    expect(classifierEchec(new ApiError(409, 'Conflit'))).toBe('client')
    expect(classifierEchec(new ApiError(400, 'Invalide'))).toBe('client')
  })
  it('rejet fetch (TypeError réseau) → reseau (rejeu ultérieur)', () => {
    expect(classifierEchec(new TypeError('Failed to fetch'))).toBe('reseau')
    expect(classifierEchec(new Error('offline'))).toBe('reseau')
  })
})

/** Démo (spec 2026-09-15 §2.2) : aucune écriture à mettre en file, et surtout aucun rejeu de la file
 *  RÉELLE de ce navigateur avec un jeton démo (chaque mutation serait marquée en erreur). */
describe('file hors-ligne en mode démo', () => {
  beforeEach(() => {
    vi.mocked(enfiler).mockClear()
    vi.mocked(listerFile).mockClear()
    definirModeDemo({ messageRefus: () => 'lecture seule' })
  })
  afterEach(() => {
    definirModeDemo(null)
    vi.unstubAllGlobals()
  })

  it('hors ligne : rien n’est enfilé, l’appel est tenté (et refusé localement)', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const appel = vi.fn(async () => {
      throw new ApiError(403, 'lecture seule')
    })
    await expect(soumettreOuEnfiler('versement', {}, appel)).rejects.toMatchObject({ status: 403 })
    expect(appel).toHaveBeenCalledTimes(1)
    expect(enfiler).not.toHaveBeenCalled()
  })

  it('synchroniser ne lit même pas la file', async () => {
    expect(await synchroniser('jeton-demo')).toEqual({ reussis: 0, echecs: 0 })
    expect(listerFile).not.toHaveBeenCalled()
  })
})
