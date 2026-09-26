// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Modal } from './Modal'

/**
 * Modale — SORTIE ANIMÉE (`nk-modale-out` / `nk-voile-out`).
 *
 * Ce que ces tests protègent n'est pas l'animation elle-même (jsdom ne peint pas), mais les trois
 * propriétés qui la rendent possible SANS régression fonctionnelle, et qu'une « simplification »
 * ferait sauter sans que rien d'autre ne casse :
 *  1. le panneau survit à la fermeture, puis disparaît — s'il restait, la page serait bloquée ;
 *  2. son contenu est FIGÉ pendant ce sursis (l'appelant remet sa donnée à zéro dans `onClose`) ;
 *  3. il est INERTE pendant ce sursis (`inert` : ni tabulable, ni cliquable, ni annoncé ; plus
 *     d'Échap) et le focus est DÉJÀ revenu au déclencheur — une décoration ne fait pas attendre
 *     le clavier.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

/** Durée de `.nk-modale-out` (index.css) + marge : au-delà, le panneau doit avoir disparu. */
const APRES_SORTIE_MS = 200

function poserReducedMotion(reduit: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: reduit && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
      onchange: null,
    }),
  })
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  poserReducedMotion(false)
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

function avancer(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

/**
 * Appelant REPRÉSENTATIF du dépôt : la modale est pilotée par la donnée qu'elle affiche
 * (`open={cible !== null}`) et cette donnée est remise à zéro par `onClose`. C'est exactement la
 * forme de 27 des 32 appels — et celle qui ferait clignoter le contenu sans le gel.
 */
function AppelantPiloteParLaDonnee() {
  const [cible, setCible] = useState<{ nom: string } | null>({ nom: 'Awa Mbarga' })
  return (
    <>
      <button type="button" onClick={() => setCible({ nom: 'Awa Mbarga' })}>
        rouvrir
      </button>
      <Modal open={cible !== null} onClose={() => setCible(null)} title="Confirmer la suppression">
        <p>Supprimer {cible?.nom ?? '—'} ?</p>
      </Modal>
    </>
  )
}

describe('Modal — cycle de vie de la sortie', () => {
  it('ferme en DEUX temps : le panneau survit avec la classe de sortie, puis disparaît', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Modal open onClose={onClose} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog').querySelector('.nk-modale-in')).not.toBeNull()

    rerender(
      <Modal open={false} onClose={onClose} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    // Toujours monté, et en train de SORTIR (c'est tout l'objet de la feature).
    const panneau = document.querySelector('.nk-modale-out')
    expect(panneau).not.toBeNull()
    expect(document.querySelector('.nk-voile-out')).not.toBeNull()
    expect(screen.getByText('contenu')).toBeTruthy()

    avancer(APRES_SORTIE_MS)
    expect(document.querySelector('.nk-modale-out')).toBeNull()
    expect(screen.queryByText('contenu')).toBeNull()
  })

  it('ne rend rien tant que `open` est faux (pas de sortie fantôme au montage)', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    expect(screen.queryByText('contenu')).toBeNull()
    expect(document.querySelector('.nk-modale-out')).toBeNull()
  })

  it('libère le défilement du body au DÉMONTAGE, pas au début de la sortie', () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    expect(document.body.style.overflow).toBe('hidden')

    rerender(
      <Modal open={false} onClose={() => {}} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    // Pendant la sortie : encore verrouillé, sinon la page bougerait derrière un panneau visible.
    expect(document.body.style.overflow).toBe('hidden')

    avancer(APRES_SORTIE_MS)
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('sous prefers-reduced-motion, démonte sans attendre la durée de l’animation', () => {
    poserReducedMotion(true)
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    rerender(
      <Modal open={false} onClose={() => {}} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    // Le minuteur est posé à 0 ms : un seul tour de boucle suffit, très en dessous des 140 ms.
    avancer(1)
    expect(screen.queryByText('contenu')).toBeNull()
  })

  it('une réouverture pendant la sortie annule celle-ci et rend le contenu VIVANT', () => {
    render(<AppelantPiloteParLaDonnee />)
    fireEvent.click(screen.getByLabelText('ui.modal.fermer', { selector: 'button.absolute' }))
    expect(document.querySelector('.nk-modale-out')).not.toBeNull()

    fireEvent.click(screen.getByText('rouvrir'))
    expect(document.querySelector('.nk-modale-out')).toBeNull()
    expect(document.querySelector('.nk-modale-in')).not.toBeNull()
    expect(screen.getByRole('dialog')).toBeTruthy()

    // Et le minuteur de la sortie annulée ne doit pas démonter la modale rouverte.
    avancer(APRES_SORTIE_MS)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('Modal — contenu figé pendant la sortie', () => {
  it('rejoue la dernière image au lieu du contenu vidé par onClose', () => {
    render(<AppelantPiloteParLaDonnee />)
    // Anti-vacuité : le nom est bien affiché AVANT la fermeture, sinon le test ne prouve rien.
    expect(screen.getByText(/Awa Mbarga/)).toBeTruthy()

    fireEvent.click(screen.getByLabelText('ui.modal.fermer', { selector: 'button.absolute' }))

    // L'appelant a remis `cible` à null : sans le gel, on lirait « Supprimer — ? ».
    expect(screen.getByText(/Awa Mbarga/)).toBeTruthy()
    expect(screen.queryByText(/Supprimer — \?/)).toBeNull()

    avancer(APRES_SORTIE_MS)
    expect(screen.queryByText(/Awa Mbarga/)).toBeNull()
  })

  it('fige aussi le TITRE, qui se dérive souvent du même état', () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Modifier une dépense">
        <p>contenu</p>
      </Modal>,
    )
    // La fermeture fait basculer le titre chez l'appelant (édition → création).
    rerender(
      <Modal open={false} onClose={() => {}} title="Nouvelle dépense">
        <p>contenu</p>
      </Modal>,
    )
    expect(screen.getByText('Modifier une dépense')).toBeTruthy()
    expect(screen.queryByText('Nouvelle dépense')).toBeNull()
  })
})

describe('Modal — inerte pendant la sortie', () => {
  it('Échap ne rappelle plus onClose une fois la fermeture engagée', () => {
    const onClose = vi.fn()
    const { rerender } = render(
      <Modal open onClose={onClose} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <Modal open={false} onClose={onClose} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('sort de l’arbre d’accessibilité et cesse d’être cliquable', () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true')

    rerender(
      <Modal open={false} onClose={() => {}} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    const conteneur = document.querySelector('.nk-modale-out')?.parentElement
    expect(conteneur?.className).toContain('fixed')
    expect(conteneur?.getAttribute('aria-hidden')).toBe('true')
    expect(conteneur?.className).toContain('pointer-events-none')
  })

  it('devient INERT — le clavier ne peut plus y entrer', () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Titre">
        <button type="button">action du formulaire</button>
      </Modal>,
    )
    const ouvert = screen.getByRole('dialog')
    expect(ouvert.hasAttribute('inert')).toBe(false)
    // Anti-vacuité : le bouton du contenu est bien là, c'est lui qu'il s'agit de neutraliser.
    expect(screen.getByText('action du formulaire')).toBeTruthy()

    rerender(
      <Modal open={false} onClose={() => {}} title="Titre">
        <button type="button">action du formulaire</button>
      </Modal>,
    )
    const conteneur = document.querySelector('.nk-modale-out')?.parentElement
    // `pointer-events-none` bloquait la SOURIS ; c'est `inert` qui coupe le CLAVIER. Mesuré en
    // production : sans lui, 7 éléments restaient focusables sous un `aria-hidden` — la règle
    // `aria-hidden-focus` violée pendant toute la sortie.
    expect(conteneur?.hasAttribute('inert')).toBe(true)
  })

  it('rend le focus au déclencheur DÈS la fermeture, sans attendre l’animation', () => {
    const declencheur = document.createElement('button')
    declencheur.textContent = 'ouvrir'
    document.body.appendChild(declencheur)
    declencheur.focus()
    expect(document.activeElement).toBe(declencheur)

    const { rerender } = render(
      <Modal open onClose={() => {}} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    expect(document.activeElement).not.toBe(declencheur)

    rerender(
      <Modal open={false} onClose={() => {}} title="Titre">
        <p>contenu</p>
      </Modal>,
    )
    // Avant même la fin de la sortie.
    expect(document.activeElement).toBe(declencheur)
    declencheur.remove()
  })
})
