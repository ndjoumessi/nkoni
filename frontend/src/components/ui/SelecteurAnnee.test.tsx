// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SelecteurAnnee } from './SelecteurAnnee'

// Les libellés i18n ne sont pas l'objet du test ; on court-circuite react-i18next.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

afterEach(cleanup)

/** Ouvre le popover (le déclencheur est l'unique bouton tant qu'il est fermé). */
function ouvrir() {
  fireEvent.click(screen.getByRole('button'))
  return screen.getByRole('dialog')
}

describe('SelecteurAnnee', () => {
  it('affiche l’année et ouvre la grille en PORTAIL (hors du parent piégé)', () => {
    render(
      <div data-testid="hote" style={{ transform: 'translateY(0)' }}>
        <SelecteurAnnee value={2026} onChange={vi.fn()} />
      </div>,
    )
    expect(screen.getByRole('button').textContent).toContain('2026')
    const dialog = ouvrir()
    expect(screen.getByTestId('hote').contains(dialog)).toBe(false)
    expect(dialog.parentElement).toBe(document.body)
    expect(dialog.querySelector('[aria-live="polite"]')?.textContent).toMatch(/2020\s*–\s*2029/)
  })

  it('sélection d’une année (souris) → onChange puis fermeture', () => {
    const onChange = vi.fn()
    render(<SelecteurAnnee value={2026} onChange={onChange} />)
    ouvrir()
    fireEvent.click(screen.getByRole('button', { name: '2023' }))
    expect(onChange).toHaveBeenCalledWith(2023)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('navigation de décennie (‹ / ›)', () => {
    render(<SelecteurAnnee value={2026} onChange={vi.fn()} />)
    const dialog = ouvrir()
    const plage = () => dialog.querySelector('[aria-live="polite"]')?.textContent ?? ''
    fireEvent.click(screen.getByRole('button', { name: 'ui.selecteurAnnee.decenniePrecedente' }))
    expect(plage()).toMatch(/2010\s*–\s*2019/)
    fireEvent.click(screen.getByRole('button', { name: 'ui.selecteurAnnee.decennieSuivante' }))
    expect(plage()).toMatch(/2020\s*–\s*2029/)
  })

  it('navigation clavier : flèche + Entrée sélectionne, Échap ferme', () => {
    const onChange = vi.fn()
    render(<SelecteurAnnee value={2026} onChange={onChange} />)
    const dialog = ouvrir()
    // 2026 → ArrowRight → 2027 → Entrée
    fireEvent.keyDown(dialog.querySelector('[role="grid"]')!, { key: 'ArrowRight' })
    fireEvent.keyDown(dialog.querySelector('[role="grid"]')!, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(2027)
    // ré-ouvre puis Échap ferme sans sélection
    onChange.mockClear()
    fireEvent.click(screen.getByRole('button'))
    fireEvent.keyDown(screen.getByRole('dialog').querySelector('[role="grid"]')!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('respecte les bornes : une année hors [min, max] est désactivée et non sélectionnable', () => {
    const onChange = vi.fn()
    render(<SelecteurAnnee value={2026} min={2020} max={2027} onChange={onChange} />)
    ouvrir()
    const btn2028 = screen.getByRole('button', { name: '2028' }) as HTMLButtonElement
    expect(btn2028.disabled).toBe(true)
    fireEvent.click(btn2028)
    expect(onChange).not.toHaveBeenCalled()
    // une année dans les bornes reste sélectionnable
    fireEvent.click(screen.getByRole('button', { name: '2025' }))
    expect(onChange).toHaveBeenCalledWith(2025)
  })
})
