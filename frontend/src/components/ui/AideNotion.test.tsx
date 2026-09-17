// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AideNotion } from './AideNotion'
import { Field, Input } from './Field'
import { PageHeader } from './PageHeader'

// t → « clé » ou « clé|{options JSON} » (le libellé du bouton interpole le titre).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (cle: string, o?: object) => (o ? `${cle}|${JSON.stringify(o)}` : cle),
    i18n: { language: 'fr' },
  }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

afterEach(cleanup)

const rendre = (noeud: React.ReactNode) => render(<MemoryRouter>{noeud}</MemoryRouter>)
const bouton = () => screen.getByRole('button', { name: /aide\.libelleBouton/ })

describe('AideNotion', () => {
  it('bouton accessible : nom contenant le titre de la notion, fermé par défaut', () => {
    rendre(<AideNotion notion="valorise" />)
    const b = bouton()
    expect(b.getAttribute('type')).toBe('button')
    expect(b.getAttribute('aria-label')).toContain('aide.notions.valorise.titre')
    expect(b.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('ouvre au clic une bulle en PORTAIL (hors du conteneur), reliée par aria-controls', () => {
    rendre(
      <div data-testid="hote" style={{ transform: 'translateY(0)' }}>
        <AideNotion notion="valorise" />
      </div>,
    )
    fireEvent.click(bouton())
    const bulle = screen.getByRole('dialog')
    expect(bouton().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByTestId('hote').contains(bulle)).toBe(false)
    expect(bulle.parentElement).toBe(document.body)
    expect(bulle.textContent).toContain('aide.notions.valorise.texte')
    expect(bouton().getAttribute('aria-controls')).toBe(bulle.querySelector('[id]')?.id)
  })

  it('second clic referme', () => {
    rendre(<AideNotion notion="valorise" />)
    fireEvent.click(bouton())
    fireEvent.click(bouton())
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Échap sur le bouton referme et garde le focus sur le « ? »', () => {
    rendre(<AideNotion notion="valorise" />)
    bouton().focus()
    fireEvent.click(bouton())
    fireEvent.keyDown(bouton(), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(bouton())
  })

  it('Échap dans la bulle referme et rend le focus au « ? »', () => {
    rendre(<AideNotion notion="attendu" />)
    fireEvent.click(bouton())
    // Sur l'élément FOCALISÉ (le conteneur de contenu, cf. test d'entrée de focus ci-dessous) —
    // pas un <p> non focalisable, qui ne recevrait jamais Échap en pratique.
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(bouton())
  })

  it('ouverture : le focus entre dans la bulle (le conteneur de contenu), WCAG 2.1.1/2.4.3', () => {
    rendre(<AideNotion notion="valorise" />)
    fireEvent.click(bouton())
    const bulle = screen.getByRole('dialog')
    expect(bulle.contains(document.activeElement)).toBe(true)
    expect(document.activeElement).not.toBe(bouton())
  })

  it('« En savoir plus » est le prochain élément focalisable après le contenu ; le focaliser garde la bulle ouverte', () => {
    rendre(<AideNotion notion="attendu" />)
    fireEvent.click(bouton())
    const bulle = screen.getByRole('dialog')
    const conteneur = document.activeElement as HTMLElement
    const lien = screen.getByRole('link', { name: 'aide.enSavoirPlus' })
    const focalisables = Array.from(bulle.querySelectorAll<HTMLElement>('[tabindex], a[href]'))
    expect(focalisables).toEqual([conteneur, lien])
    lien.focus()
    expect(document.activeElement).toBe(lien)
    expect(screen.queryByRole('dialog')).not.toBeNull()
  })

  it('le focus quittant la bulle ET le déclencheur referme SANS voler le focus', () => {
    rendre(
      <>
        <button type="button">ailleurs</button>
        <AideNotion notion="valorise" />
      </>,
    )
    fireEvent.click(bouton())
    const conteneur = document.activeElement as HTMLElement
    const ailleurs = screen.getByRole('button', { name: 'ailleurs' })
    fireEvent.focusOut(conteneur, { relatedTarget: ailleurs })
    expect(screen.queryByRole('dialog')).toBeNull()
    // Pas reconquis par le déclencheur : l'utilisateur est parti ailleurs délibérément (le
    // conteneur démonté retombe sur <body>, jamais le comportement d'Échap qui refocalise le « ? »).
    expect(document.activeElement).not.toBe(bouton())
  })

  it('Échap dans la bulle ne remonte pas jusqu\'à un listener natif sur `window` (ex. Modal)', () => {
    const espion = vi.fn()
    window.addEventListener('keydown', espion)
    try {
      rendre(<AideNotion notion="valorise" />)
      fireEvent.click(bouton())
      fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
      expect(espion).not.toHaveBeenCalled()
    } finally {
      window.removeEventListener('keydown', espion)
    }
  })

  it('clic extérieur referme', () => {
    rendre(
      <>
        <p data-testid="dehors">dehors</p>
        <AideNotion notion="valorise" />
      </>,
    )
    fireEvent.click(bouton())
    fireEvent.mouseDown(screen.getByTestId('dehors'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('lien « En savoir plus » seulement pour une notion qui en a un', () => {
    rendre(<AideNotion notion="attendu" />)
    fireEvent.click(bouton())
    expect(screen.getByRole('link', { name: 'aide.enSavoirPlus' }).getAttribute('href')).toBe('/bareme')
    cleanup()
    rendre(<AideNotion notion="valorise" />)
    fireEvent.click(bouton())
    expect(screen.queryByRole('link')).toBeNull()
  })
})

describe('prop aide de Field et PageHeader', () => {
  it('Field : le « ? » est à côté du <label>, pas dedans', () => {
    rendre(
      <Field label="Année d'adhésion" aide={<AideNotion notion="anneeAdhesion" />}>
        <Input />
      </Field>,
    )
    const label = screen.getByText("Année d'adhésion").closest('label') as HTMLLabelElement
    expect(label.querySelector('button')).toBeNull()
    expect(bouton()).toBeTruthy()
    // Le label reste relié au contrôle.
    expect(screen.getByLabelText("Année d'adhésion")).toBeTruthy()
  })

  it('PageHeader : le « ? » est à côté du <h1>, pas dedans', () => {
    rendre(<PageHeader title="Barème" aide={<AideNotion notion="bareme" />} />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('Barème')
    expect(h1.querySelector('button')).toBeNull()
    expect(bouton()).toBeTruthy()
  })
})
