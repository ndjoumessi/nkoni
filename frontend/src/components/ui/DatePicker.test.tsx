// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { DatePicker } from './DatePicker'

/**
 * DatePicker — le popover est rendu en PORTAIL dans <body> pour échapper à tout contexte
 * d'empilement d'un bloc frère (nk-reveal `forwards`, transform, z-index élevé) qui, sinon,
 * le recouvrirait (bug /audit & /fonctions). jsdom ne peint pas : on prouve donc l'immunité
 * STRUCTURELLEMENT (le popover n'est plus un descendant du bloc piégé → aucun frère ne peut le
 * couvrir) et fonctionnellement (la sélection d'un jour, même « du bas », reste opérante).
 */

// Les libellés i18n ne sont pas l'objet du test ; on court-circuite react-i18next (en fournissant
// `initReactI18next` pour que l'init de `@/lib/i18n`, importé en cascade, ne casse pas).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

afterEach(cleanup)

/** Ouvre le calendrier (le déclencheur est l'unique bouton tant que le popover est fermé). */
function ouvrir() {
  fireEvent.click(screen.getByRole('button'))
  return screen.getByRole('dialog')
}

/** DatePicker suivi d'un bloc frère « hostile » : contexte d'empilement (transform) + z-index fort
 *  — exactement ce qui recouvrait le popover avant le portail. */
function RenduAvecFrereHostile({ onChange }: { onChange: (v: string) => void }) {
  return (
    <div>
      <div data-testid="bloc-parent" style={{ transform: 'translateY(0)' }}>
        <DatePicker value="2026-05-15" onChange={onChange} />
      </div>
      <div style={{ transform: 'translateY(0)', position: 'relative', zIndex: 999 }}>bloc suivant</div>
    </div>
  )
}

describe('DatePicker — popover en portail', () => {
  it('rend le calendrier dans <body>, hors du bloc parent (donc hors d’atteinte des frères)', () => {
    render(<RenduAvecFrereHostile onChange={vi.fn()} />)
    const dialog = ouvrir()
    const parent = screen.getByTestId('bloc-parent')
    expect(parent.contains(dialog)).toBe(false)
    expect(dialog.parentElement).toBe(document.body)
  })

  it('reste sélectionnable malgré un frère à z-index élevé — y compris un jour du bas', () => {
    const onChange = vi.fn()
    render(<RenduAvecFrereHostile onChange={onChange} />)
    const dialog = ouvrir()
    // Jour de la dernière semaine — typiquement celui qui était masqué/non cliquable avant le fix.
    const jourDuBas = dialog.querySelector<HTMLButtonElement>('[data-iso="2026-05-28"]')
    expect(jourDuBas).not.toBeNull()
    fireEvent.click(jourDuBas!)
    expect(onChange).toHaveBeenCalledWith('2026-05-28')
  })

  it('la sélection d’un jour renvoie la date ISO et ferme le calendrier', () => {
    const onChange = vi.fn()
    render(<DatePicker value="2026-05-15" onChange={onChange} />)
    const dialog = ouvrir()
    fireEvent.click(dialog.querySelector<HTMLButtonElement>('[data-iso="2026-05-20"]')!)
    expect(onChange).toHaveBeenCalledWith('2026-05-20')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('reste ouvert quand on interagit DANS le calendrier (portail épargné du clic-extérieur)', () => {
    render(
      <div>
        <DatePicker value="2026-05-15" onChange={vi.fn()} />
        <span data-testid="dehors">ailleurs</span>
      </div>,
    )
    ouvrir()
    // mousedown sur la navigation « mois précédent » (dans le popover portalisé) → reste ouvert.
    fireEvent.mouseDown(screen.getByRole('button', { name: 'ui.datePicker.moisPrecedent' }))
    expect(screen.queryByRole('dialog')).not.toBeNull()
    // mousedown à l'extérieur → ferme.
    fireEvent.mouseDown(screen.getByTestId('dehors'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('la navigation clavier (flèches + Entrée) sélectionne depuis le portail', () => {
    const onChange = vi.fn()
    render(<DatePicker value="2026-05-15" onChange={onChange} />)
    const dialog = ouvrir()
    const grille = dialog.querySelector('[role="grid"]')!
    // Depuis le 15, une flèche droite → 16, Entrée → sélection.
    fireEvent.keyDown(grille, { key: 'ArrowRight' })
    fireEvent.keyDown(grille, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('2026-05-16')
  })

  // Régression : les flèches ‹ / › de navigation de mois doivent RÉELLEMENT changer le mois
  // affiché, sur plusieurs clics consécutifs (prev ET next), sans être annulées.
  it('navigation entre mois : précédent et suivant sur plusieurs clics consécutifs', () => {
    render(<DatePicker value="2026-05-15" onChange={vi.fn()} />)
    const dialog = ouvrir()
    const moisAffiche = () =>
      dialog.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? ''
    const precedent = () =>
      fireEvent.click(screen.getByRole('button', { name: 'ui.datePicker.moisPrecedent' }))
    const suivant = () =>
      fireEvent.click(screen.getByRole('button', { name: 'ui.datePicker.moisSuivant' }))

    expect(moisAffiche()).toMatch(/mai 2026/i)
    precedent()
    expect(moisAffiche()).toMatch(/avril 2026/i)
    precedent()
    expect(moisAffiche()).toMatch(/mars 2026/i)
    precedent()
    expect(moisAffiche()).toMatch(/février 2026/i)
    // Retour en avant.
    suivant()
    expect(moisAffiche()).toMatch(/mars 2026/i)
    suivant()
    expect(moisAffiche()).toMatch(/avril 2026/i)
  })

  const enteteDe = (dialog) => () =>
    dialog.querySelector('[aria-live="polite"]')?.textContent?.trim() ?? ''

  // Sélection rapide (souris) : en-tête → grille d'années → année → grille de mois → mois →
  // retour au calendrier positionné sur le mois/année choisis, puis sélection d'un jour.
  it('sélection rapide (souris) : en-tête → année → mois → calendrier sur le bon mois', () => {
    const onChange = vi.fn()
    render(<DatePicker value="2026-05-15" onChange={onChange} />)
    const dialog = ouvrir()
    const entete = enteteDe(dialog)
    expect(entete()).toMatch(/mai 2026/i)

    fireEvent.click(screen.getByRole('button', { name: 'ui.datePicker.choisirMoisAnnee' }))
    fireEvent.click(screen.getByRole('button', { name: '2027' }))
    fireEvent.click(screen.getByRole('button', { name: 'mars' }))

    expect(entete()).toMatch(/mars 2027/i)
    fireEvent.click(dialog.querySelector('[data-iso="2027-03-10"]'))
    expect(onChange).toHaveBeenCalledWith('2027-03-10')
  })

  // Sélection rapide au CLAVIER dans les nouveaux panneaux (flèches + Entrée).
  it('sélection rapide (clavier) : année puis mois via flèches + Entrée', () => {
    render(<DatePicker value="2026-05-15" onChange={vi.fn()} />)
    const dialog = ouvrir()
    const entete = enteteDe(dialog)
    fireEvent.click(screen.getByRole('button', { name: 'ui.datePicker.choisirMoisAnnee' }))
    // Grille années : focus 2026 → ArrowRight → 2027 → Entrée.
    fireEvent.keyDown(dialog.querySelector('[role="grid"]'), { key: 'ArrowRight' })
    fireEvent.keyDown(dialog.querySelector('[role="grid"]'), { key: 'Enter' })
    // Grille mois de 2027 : focus mai → ArrowRight → juin → Entrée.
    fireEvent.keyDown(dialog.querySelector('[role="grid"]'), { key: 'ArrowRight' })
    fireEvent.keyDown(dialog.querySelector('[role="grid"]'), { key: 'Enter' })
    expect(entete()).toMatch(/juin 2027/i)
  })

  // Échap remonte d'un niveau (mois → années → jours) au lieu de fermer d'emblée.
  it('Échap remonte d’un niveau sans fermer le calendrier', () => {
    render(<DatePicker value="2026-05-15" onChange={vi.fn()} />)
    const dialog = ouvrir()
    fireEvent.click(screen.getByRole('button', { name: 'ui.datePicker.choisirMoisAnnee' }))
    fireEvent.click(screen.getByRole('button', { name: '2027' }))
    // Vue mois → Échap → vue années (la cellule 2027 réapparaît).
    fireEvent.keyDown(dialog.querySelector('[role="grid"]'), { key: 'Escape' })
    expect(screen.getByRole('button', { name: '2027' })).toBeTruthy()
    // Vue années → Échap → vue jours (grille des jours), toujours ouvert.
    fireEvent.keyDown(dialog.querySelector('[role="grid"]'), { key: 'Escape' })
    expect(dialog.querySelector('[data-iso]')).not.toBeNull()
    expect(screen.queryByRole('dialog')).not.toBeNull()
  })
})
