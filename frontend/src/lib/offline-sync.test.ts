import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { classifierEchec, soumettreOuEnfiler, synchroniser } from './offline-sync'
import { ApiError, definirModeDemo, versementsApi } from './api'
import { enfiler, listerFile, marquerErreur, retirerDeLaFile, type MutationEnAttente } from './offline-queue'

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

/** Revue I5 : la démo démarre PENDANT une synchro déjà en cours (garde lue à chaque itération). */
describe('synchro en cours quand la démo démarre', () => {
  const fetchOriginal = globalThis.fetch
  const mutation = (id: string): MutationEnAttente =>
    ({ id, type: 'versement', payload: {}, cleIdempotence: `cle-${id}`, creeLe: 0 }) as unknown as MutationEnAttente
  let chemins: string[] = []

  beforeEach(() => {
    definirModeDemo(null)
    chemins = []
    vi.mocked(marquerErreur).mockClear()
    vi.mocked(retirerDeLaFile).mockClear()
    vi.mocked(listerFile).mockResolvedValue([mutation('m1'), mutation('m2')])
  })
  afterEach(() => {
    definirModeDemo(null)
    globalThis.fetch = fetchOriginal
    vi.mocked(listerFile).mockResolvedValue([])
  })

  it('la 1re mutation passe, la démo démarre pendant son appel : la 2de n’est ni appliquée ni marquée en erreur', async () => {
    globalThis.fetch = vi.fn(async (url: unknown) => {
      chemins.push(String(url))
      definirModeDemo({ messageRefus: () => 'lecture seule' }) // entrée en démo pendant l'appel
      return new Response(JSON.stringify({ id: 'v1' }), { status: 201 })
    }) as unknown as typeof fetch

    const creer = vi.spyOn(versementsApi, 'create')

    expect(await synchroniser('jeton-reel')).toEqual({ reussis: 1, echecs: 0 })
    expect(chemins).toHaveLength(1)
    // La 2de n'est même pas TENTÉE (garde d'itération), pas seulement « refusée puis ignorée ».
    expect(creer).toHaveBeenCalledTimes(1)
    creer.mockRestore()
    expect(retirerDeLaFile).toHaveBeenCalledTimes(1)
    expect(marquerErreur).not.toHaveBeenCalled()
  })

  it('échec client reçu alors que la démo a démarré entre-temps : jamais marqué en erreur', async () => {
    globalThis.fetch = vi.fn(async (url: unknown) => {
      chemins.push(String(url))
      definirModeDemo({ messageRefus: () => 'lecture seule' })
      return new Response(JSON.stringify({ message: 'refus' }), { status: 400 })
    }) as unknown as typeof fetch

    expect(await synchroniser('jeton-reel')).toEqual({ reussis: 0, echecs: 0 })
    expect(chemins).toHaveLength(1)
    expect(marquerErreur).not.toHaveBeenCalled()
  })
})
