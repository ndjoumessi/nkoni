// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Tabs, type TabOption } from './Tabs'

afterEach(cleanup)

const OPTIONS: TabOption[] = [
  { value: 'apercu', label: 'Aperçu' },
  { value: 'contributions', label: 'Contributions' },
  { value: 'tontines', label: 'Tontines' },
]

/** Monte le segmented control en portant l'onglet actif comme le ferait la page parente. */
function Harness({ initiale = 'apercu' }: { initiale?: string }) {
  const [v, setV] = useState(initiale)
  return <Tabs value={v} onValueChange={setV} options={OPTIONS} ariaLabel="Sections" />
}

const onglet = (nom: RegExp) => screen.getByRole('tab', { name: nom })

describe('Tabs — segmented control', () => {
  it('marque l’onglet actif (aria-selected) et rend les autres non tabbables (roving tabindex)', () => {
    render(<Harness />)
    expect(onglet(/Aperçu/).getAttribute('aria-selected')).toBe('true')
    expect(onglet(/Aperçu/).getAttribute('tabindex')).toBe('0')
    expect(onglet(/Tontines/).getAttribute('aria-selected')).toBe('false')
    expect(onglet(/Tontines/).getAttribute('tabindex')).toBe('-1')
  })

  it('un clic change l’onglet actif', () => {
    render(<Harness />)
    fireEvent.click(onglet(/Contributions/))
    expect(onglet(/Contributions/).getAttribute('aria-selected')).toBe('true')
    expect(onglet(/Aperçu/).getAttribute('aria-selected')).toBe('false')
  })

  it('→ passe à l’onglet suivant, ← au précédent, avec bouclage', () => {
    render(<Harness />)
    fireEvent.keyDown(onglet(/Aperçu/), { key: 'ArrowRight' })
    expect(onglet(/Contributions/).getAttribute('aria-selected')).toBe('true')
    // ← depuis le premier (après retour) → boucle vers le dernier.
    fireEvent.keyDown(onglet(/Contributions/), { key: 'ArrowLeft' })
    expect(onglet(/Aperçu/).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(onglet(/Aperçu/), { key: 'ArrowLeft' })
    expect(onglet(/Tontines/).getAttribute('aria-selected')).toBe('true')
  })

  it('Home va au premier, Fin au dernier', () => {
    render(<Harness initiale="contributions" />)
    fireEvent.keyDown(onglet(/Contributions/), { key: 'End' })
    expect(onglet(/Tontines/).getAttribute('aria-selected')).toBe('true')
    fireEvent.keyDown(onglet(/Tontines/), { key: 'Home' })
    expect(onglet(/Aperçu/).getAttribute('aria-selected')).toBe('true')
  })

  it('le tablist porte une étiquette accessible', () => {
    render(<Harness />)
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeTruthy()
  })

  it('avec idBase : chaque onglet porte id + aria-controls vers son panneau (paire APG)', () => {
    render(<Tabs value="apercu" onValueChange={() => {}} options={OPTIONS} ariaLabel="Sections" idBase="demo" />)
    const a = onglet(/Aperçu/)
    expect(a.getAttribute('id')).toBe('demo-tab-apercu')
    expect(a.getAttribute('aria-controls')).toBe('demo-panel-apercu')
  })

  it('sans idBase : aucun aria-controls pendouillant', () => {
    render(<Harness />)
    expect(onglet(/Aperçu/).getAttribute('aria-controls')).toBeNull()
  })
})
