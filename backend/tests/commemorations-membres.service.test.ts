import { describe, it, expect, vi } from 'vitest'
import { listerMembresSelectionnables } from '../src/services/commemoration.service'
import { PLAFOND_OPTIONS_MEMBRES } from '../src/services/membreStatut.service'

/**
 * `GET /commemorations/membres` garde sa propre route (le GUIDE_RELIGIEUX gère les commémorations
 * sans droit de lecture sur `Membre`, il ne peut donc pas appeler `/membres/options`), mais suit le
 * MÊME plafond : sans `take`, une très grande organisation chargeait tous ses membres d'un bloc.
 */
describe('listerMembresSelectionnables', () => {
  it('borne la lecture au plafond des sélecteurs et reste une identité légère', async () => {
    const findMany = vi.fn(async () => [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await listerMembresSelectionnables({ membre: { findMany } } as any)
    expect(findMany).toHaveBeenCalledTimes(1)
    const args = findMany.mock.calls[0][0] as { take?: number; select: Record<string, unknown> }
    expect(args.take).toBe(PLAFOND_OPTIONS_MEMBRES)
    expect(Object.keys(args.select).sort()).toEqual(['id', 'nom', 'prenom'])
  })
})
