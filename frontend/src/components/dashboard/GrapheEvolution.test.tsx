// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { GrapheEvolution, type PointEvolution } from './GrapheEvolution'

/**
 * Graphe d'évolution partagé (§10) : on vérifie le CONTRAT D'ACCESSIBILITÉ commun aux deux
 * variantes — un `role="img"` résumé + une table `sr-only` portant les valeurs chiffrées
 * (jamais d'encodage par la couleur seule) — et l'état vide.
 */

afterEach(cleanup)

const POINTS: PointEvolution[] = [
  { cle: '1', label: 'janv.', attendu: 10_000, collecte: 6_000, taux: 60 },
  { cle: '2', label: 'févr.', attendu: 10_000, collecte: 4_000, taux: 40 },
]

const props = {
  titre: 'Recouvrement',
  legendeAttendu: 'Attendu',
  legendeCollecte: 'Collecté',
  labelColonne: 'Mois',
  resumeAria: 'Résumé du graphe',
  aucuneDonnee: 'Aucune donnée',
}

describe('GrapheEvolution (partagé)', () => {
  for (const variant of ['barres', 'aire'] as const) {
    it(`variante ${variant} : role=img + table sr-only avec les valeurs`, () => {
      render(<GrapheEvolution points={POINTS} variant={variant} {...props} />)

      // Résumé accessible du visuel.
      expect(screen.getByRole('img', { name: 'Résumé du graphe' })).toBeTruthy()

      // Équivalent chiffré : une table avec une ligne par point + libellés.
      const table = screen.getByRole('table')
      const lignes = within(table).getAllByRole('row')
      // 1 en-tête + 2 données.
      expect(lignes).toHaveLength(3)
      expect(within(table).getByRole('rowheader', { name: 'janv.' })).toBeTruthy()
      expect(table.textContent).toContain('60') // taux présent → colonne %
    })
  }

  it('état vide quand tous les points sont à zéro', () => {
    render(
      <GrapheEvolution
        points={[{ cle: '1', label: 'janv.', attendu: 0, collecte: 0 }]}
        variant="aire"
        {...props}
      />,
    )
    expect(screen.getByText('Aucune donnée')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
