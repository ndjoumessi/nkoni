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

  // RÉGRESSION (revue) : parité avec l'ancien <input> — Entrée sur le déclencheur (fermé) SOUMET le
  // formulaire environnant au lieu d'ouvrir le popover ; le picker s'ouvre via flèche bas / Espace.
  it('Entrée sur le déclencheur soumet le formulaire (n’ouvre pas le popover)', () => {
    const onSubmit = vi.fn((e) => e.preventDefault())
    render(
      <form onSubmit={onSubmit}>
        <SelecteurAnnee value={2026} onChange={vi.fn()} />
      </form>,
    )
    const trigger = screen.getByRole('button')
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull() // le popover ne s'est PAS ouvert

    // …et la flèche bas ouvre bien le popover (sans soumettre).
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  // RÉGRESSION (revue, même famille que le DatePicker) : la flèche ‹ de décennie garde le focus sur
  // le bouton (pas de vol vers une cellule-année).
  it('la navigation de décennie garde le focus sur le bouton ‹', () => {
    render(<SelecteurAnnee value={2026} onChange={vi.fn()} />)
    const dialog = ouvrir()
    const plage = () => dialog.querySelector('[aria-live="polite"]')?.textContent ?? ''
    const prec = screen.getByRole('button', { name: 'ui.selecteurAnnee.decenniePrecedente' })

    prec.focus()
    expect(document.activeElement).toBe(prec)
    fireEvent.click(prec)
    expect(document.activeElement).toBe(prec) // focus conservé (sans le fix : volé vers une année)
    expect(plage()).toMatch(/2010\s*–\s*2019/)
  })
})

// État « non défini » (nullable) + mode optionnel — ajouté pour réutiliser le composant sur
// l'année de fin de contribution d'un membre (champ facultatif, §4.1).
describe('SelecteurAnnee — état optionnel / nullable', () => {
  it('value=null → le déclencheur affiche le placeholder (défaut « — »)', () => {
    render(<SelecteurAnnee value={null} onChange={vi.fn()} />)
    expect(screen.getByRole('button').textContent).toContain('—')
  })

  it('placeholder personnalisable quand value=null', () => {
    render(<SelecteurAnnee value={null} placeholder="Non défini" onChange={vi.fn()} />)
    expect(screen.getByRole('button').textContent).toContain('Non défini')
  })

  it('value=null s’ouvre et permet de choisir une année (point d’entrée = année courante)', () => {
    const onChange = vi.fn()
    const anneeCourante = new Date().getFullYear()
    render(<SelecteurAnnee value={null} min={1900} max={anneeCourante} onChange={onChange} />)
    ouvrir()
    // La grille est centrée sur la décennie de l'année courante → cette cellule est présente.
    fireEvent.click(screen.getByRole('button', { name: String(anneeCourante) }))
    expect(onChange).toHaveBeenCalledWith(anneeCourante)
  })

  it('mode optionnel : « Effacer » rappelle onChange(null) puis ferme', () => {
    const onChange = vi.fn()
    render(<SelecteurAnnee value={2024} optionnel onChange={onChange} />)
    ouvrir()
    fireEvent.click(screen.getByRole('button', { name: 'ui.selecteurAnnee.effacer' }))
    expect(onChange).toHaveBeenCalledWith(null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('« Effacer » absent hors mode optionnel (même quand une année est définie)', () => {
    render(<SelecteurAnnee value={2024} onChange={vi.fn()} />)
    ouvrir()
    expect(screen.queryByRole('button', { name: 'ui.selecteurAnnee.effacer' })).toBeNull()
  })

  it('« Effacer » absent quand rien n’est défini (value=null), même en mode optionnel', () => {
    render(<SelecteurAnnee value={null} optionnel onChange={vi.fn()} />)
    ouvrir()
    expect(screen.queryByRole('button', { name: 'ui.selecteurAnnee.effacer' })).toBeNull()
  })

  // Hors <Field> (ex. « Ouvrir une année » du formulaire Versement) : le déclencheur doit porter
  // un nom accessible via `aria-label`, sinon il n'en aurait aucun.
  it('aria-label nomme le déclencheur quand il n’est pas dans un <Field>', () => {
    render(<SelecteurAnnee value={2026} onChange={vi.fn()} aria-label="Année à ouvrir" />)
    expect(screen.getByRole('button', { name: 'Année à ouvrir' })).toBeTruthy()
  })
})
