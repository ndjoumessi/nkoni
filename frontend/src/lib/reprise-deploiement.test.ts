// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  doitRecharger,
  installerRepriseDeChunk,
  FENETRE_ANTI_BOUCLE_MS,
} from './reprise-deploiement'

/**
 * Le garde ANTI-BOUCLE est la seule partie dangereuse de ce filet : recharger sans mémoire sur un
 * chunk vraiment introuvable (déploiement cassé, réseau coupé) rendrait l'application inutilisable
 * — un remède pire que le mal. C'est donc lui qu'on verrouille, pas le rechargement lui-même.
 */

vi.mock('@/lib/observabilite', () => ({ signaler: vi.fn() }))

afterEach(() => {
  sessionStorage.clear()
  vi.restoreAllMocks()
})

describe('doitRecharger', () => {
  it('autorise le premier rechargement', () => {
    expect(doitRecharger(null, 1_000_000)).toBe(true)
  })

  it('REFUSE un second rechargement dans la fenêtre — c’est ce qui empêche la boucle', () => {
    const t = 1_000_000
    expect(doitRecharger(String(t), t + FENETRE_ANTI_BOUCLE_MS - 1)).toBe(false)
  })

  it('réautorise une fois la fenêtre passée (un déploiement ultérieur doit pouvoir rattraper)', () => {
    const t = 1_000_000
    expect(doitRecharger(String(t), t + FENETRE_ANTI_BOUCLE_MS + 1)).toBe(true)
  })

  it('ne se bloque pas sur un marqueur illisible', () => {
    expect(doitRecharger('pas-un-nombre', 1_000_000)).toBe(true)
  })
})

describe('installerRepriseDeChunk', () => {
  /** Vite émet cet évènement quand un chunk paresseux ne se charge pas. */
  const emettre = () => {
    const e = new Event('vite:preloadError', { cancelable: true })
    window.dispatchEvent(e)
    return e
  }

  it('recharge UNE fois et neutralise l’évènement (sinon l’ErrorBoundary reprend la main)', () => {
    const recharger = vi.fn()
    const retirer = installerRepriseDeChunk(recharger)
    const e = emettre()
    expect(recharger).toHaveBeenCalledTimes(1)
    expect(e.defaultPrevented, 'sans preventDefault, Vite relance l’erreur').toBe(true)
    retirer()
  })

  it('ne recharge PAS deux fois de suite — le garde anti-boucle tient de bout en bout', () => {
    const recharger = vi.fn()
    const retirer = installerRepriseDeChunk(recharger)
    emettre()
    emettre()
    emettre()
    expect(recharger).toHaveBeenCalledTimes(1)
    retirer()
  })

  it('reste opérant si sessionStorage est indisponible (navigation privée stricte)', () => {
    const recharger = vi.fn()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage bloqué')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('stockage bloqué')
    })
    const retirer = installerRepriseDeChunk(recharger)
    emettre()
    // Sans stockage le garde ne peut pas mémoriser, mais l'utilisateur est bloqué de toute façon :
    // on recharge plutôt que de laisser un écran d'erreur définitif.
    expect(recharger).toHaveBeenCalledTimes(1)
    retirer()
  })

  it('retiré, il ne réagit plus', () => {
    const recharger = vi.fn()
    installerRepriseDeChunk(recharger)()
    emettre()
    expect(recharger).not.toHaveBeenCalled()
  })
})
