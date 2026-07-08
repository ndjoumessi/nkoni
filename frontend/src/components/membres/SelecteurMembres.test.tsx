// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SelecteurMembres, type MembreCochable } from './SelecteurMembres'

// `t` court-circuité : renvoie la clé, en y accolant `count` pour tester le compteur.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (cle: string, params?: Record<string, unknown>) =>
      params && 'count' in params ? `${cle}:${params.count}` : cle,
    i18n: { language: 'fr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

afterEach(cleanup)

const MEMBRES: MembreCochable[] = [
  { id: '1', nom: 'Abena', prenom: 'Étienne' },
  { id: '2', nom: 'Biya', prenom: 'Chantal' },
  { id: '3', nom: 'Tchoupa', prenom: 'Jean-Pierre' },
]

/** Monte le composant en portant la sélection comme le ferait la page parente. */
function Harness({ initiale = [] as string[] }: { initiale?: string[] }) {
  const [sel, setSel] = useState<Set<string>>(new Set(initiale))
  const toggle = (id: string) =>
    setSel((p) => {
      const n = new Set(p)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  return <SelecteurMembres membres={MEMBRES} selection={sel} onToggle={toggle} />
}

const chercher = (q: string) => fireEvent.change(screen.getByRole('searchbox'), { target: { value: q } })
const noms = () => screen.getAllByRole('checkbox').map((c) => (c as HTMLElement).closest('label')?.textContent?.trim())

describe('SelecteurMembres — recherche', () => {
  it('filtre par NOM (insensible à la casse)', () => {
    render(<Harness />)
    chercher('BIYA')
    expect(noms()).toEqual(['Chantal Biya'])
  })

  it('filtre par PRÉNOM et insensible aux ACCENTS (« etienne » trouve « Étienne »)', () => {
    render(<Harness />)
    chercher('etienne')
    expect(noms()).toEqual(['Étienne Abena'])
  })

  it('aucun résultat → message clair, pas de liste vide muette', () => {
    render(<Harness />)
    chercher('zzz')
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
    expect(screen.getByText('ui.selecteurMembres.aucunResultat')).toBeTruthy()
  })

  it('la sélection est préservée quand un membre coché sort du filtre', () => {
    render(<Harness />)
    // Coche « Abena », puis recherche « biya » (Abena disparaît de la vue).
    fireEvent.click(screen.getByRole('checkbox', { name: /Abena/ }))
    chercher('biya')
    expect(screen.queryByRole('checkbox', { name: /Abena/ })).toBeNull()
    // En effaçant la recherche, Abena est TOUJOURS coché (sélection jamais perdue).
    chercher('')
    expect((screen.getByRole('checkbox', { name: /Abena/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('le compteur « X sélectionné(s) » se met à jour', () => {
    render(<Harness />)
    expect(screen.getByText('ui.selecteurMembres.selectionnes:0')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /Abena/ }))
    expect(screen.getByText('ui.selecteurMembres.selectionnes:1')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /Biya/ }))
    expect(screen.getByText('ui.selecteurMembres.selectionnes:2')).toBeTruthy()
  })
})
