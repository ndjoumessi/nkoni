// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { usePopoverFlottant } from './usePopoverFlottant'
import { DatePicker } from './DatePicker'

/**
 * SORTIE des popovers (`nk-popover-out`) — et le déplacement de responsabilité qu'elle impose :
 * c'est désormais le HOOK qui décide du montage, plus l'appelant. Un appelant qui réintroduirait
 * `{open && rendreFlottant(…)}` retirerait toute possibilité d'animer une sortie, exactement comme
 * pour `Modal` ; le test `garde` ci-dessous verrouille ce point sur les six consommateurs réels.
 *
 * jsdom ne peint pas : on prouve ici le CYCLE DE VIE (survit, puis disparaît), l'INERTIE pendant la
 * sortie (hors arbre a11y, non cliquable) et la conservation de l'ORIGINE — le reste (la courbe,
 * la durée) est du CSS, mesuré ailleurs.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

/** Durée de `.nk-popover-out` (index.css) + marge. */
const APRES_SORTIE_MS = 180

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

/** Consommateur MINIMAL du hook : un déclencheur, une bulle. Reproduit le contrat des six vrais. */
function Harnais() {
  const [open, setOpen] = useState(false)
  const { containerRef, triggerRef, rendreFlottant } = usePopoverFlottant({
    open,
    onFermer: () => setOpen(false),
  })
  return (
    <div ref={containerRef}>
      <button type="button" ref={triggerRef} onClick={() => setOpen((v) => !v)}>
        declencheur
      </button>
      {rendreFlottant(<p>contenu de la bulle</p>, {
        className: 'bulle',
        'aria-label': 'ma bulle',
      })}
    </div>
  )
}

const bulle = () => document.querySelector('.bulle')

describe('Popover — cycle de vie de la sortie', () => {
  it('ne rend rien tant qu’on n’a pas ouvert', () => {
    render(<Harnais />)
    expect(bulle()).toBeNull()
    expect(screen.queryByText('contenu de la bulle')).toBeNull()
  })

  it('ferme en DEUX temps : la bulle survit avec la classe de sortie, puis disparaît', () => {
    render(<Harnais />)
    fireEvent.click(screen.getByText('declencheur'))
    expect(bulle()?.className).toContain('nk-popover-in')
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.click(screen.getByText('declencheur'))
    // Toujours montée, et en train de SORTIR.
    expect(bulle()?.className).toContain('nk-popover-out')
    expect(screen.getByText('contenu de la bulle')).toBeTruthy()

    avancer(APRES_SORTIE_MS)
    expect(bulle()).toBeNull()
  })

  it('sous prefers-reduced-motion, démonte sans attendre la durée de l’animation', () => {
    poserReducedMotion(true)
    render(<Harnais />)
    fireEvent.click(screen.getByText('declencheur'))
    fireEvent.click(screen.getByText('declencheur'))
    avancer(1)
    expect(bulle()).toBeNull()
  })

  it('une réouverture pendant la sortie annule celle-ci', () => {
    render(<Harnais />)
    fireEvent.click(screen.getByText('declencheur'))
    fireEvent.click(screen.getByText('declencheur'))
    expect(bulle()?.className).toContain('nk-popover-out')

    fireEvent.click(screen.getByText('declencheur'))
    expect(bulle()?.className).toContain('nk-popover-in')
    expect(bulle()?.className).not.toContain('nk-popover-out')

    // Le minuteur de la sortie annulée ne doit pas démonter la bulle rouverte.
    avancer(APRES_SORTIE_MS)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('Popover — inerte pendant la sortie', () => {
  it('quitte l’arbre d’accessibilité et cesse de recevoir les clics', () => {
    render(<Harnais />)
    fireEvent.click(screen.getByText('declencheur'))
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('ma bulle')

    fireEvent.click(screen.getByText('declencheur'))
    // Le rôle disparaît DÈS la fermeture : pour un lecteur d'écran, la bulle est déjà partie.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(bulle()?.getAttribute('aria-hidden')).toBe('true')
    expect(bulle()?.className).toContain('pointer-events-none')
  })

  it('garde son ORIGINE pendant la sortie : elle rétrécit vers son déclencheur', () => {
    render(<Harnais />)
    fireEvent.click(screen.getByText('declencheur'))
    const origineOuverte = (bulle() as HTMLElement).style.transformOrigin
    // Anti-vacuité : sans origine posée à l'ouverture, le test ne prouverait rien.
    expect(origineOuverte).not.toBe('')

    fireEvent.click(screen.getByText('declencheur'))
    expect((bulle() as HTMLElement).style.transformOrigin).toBe(origineOuverte)
    expect((bulle() as HTMLElement).style.visibility).toBe('visible')
  })
})

describe('Popover — un consommateur RÉEL en profite', () => {
  it('choisir une date lance la sortie du calendrier au lieu de l’escamoter', () => {
    render(<DatePicker value="2026-05-15" onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.click(screen.getByText('20'))
    // Sémantiquement fermé (plus de dialogue), mais encore à l'écran, en train de sortir.
    expect(screen.queryByRole('dialog')).toBeNull()
    const sortante = document.querySelector('.nk-popover-out')
    expect(sortante).not.toBeNull()

    avancer(APRES_SORTIE_MS)
    expect(document.querySelector('.nk-popover-out')).toBeNull()
  })
})

describe('Popover — garde sur les six consommateurs', () => {
  it('aucun n’entoure rendreFlottant d’une condition (ce qui tuerait la sortie)', async () => {
    const fs = await import('node:fs')
    const fichiers = [
      'src/components/ui/DatePicker.tsx',
      'src/components/ui/SelecteurAnnee.tsx',
      'src/components/ui/AideNotion.tsx',
      'src/components/membres/SelecteurMembreUnique.tsx',
      'src/components/AppShell.tsx',
      'src/pages/MembreDetailPage.tsx',
    ]
    let vus = 0
    for (const f of fichiers) {
      const src = fs.readFileSync(f, 'utf8')
      const appels = src.match(/rendreFlottant\(/g) ?? []
      expect(appels.length, `${f} n'appelle plus rendreFlottant`).toBeGreaterThan(0)
      vus += appels.length
      // `X && rendreFlottant(` ou `X ? rendreFlottant(` → l'appelant reprend la main sur le montage.
      expect(
        /(&&|\?)\s*\n?\s*(\w+\.)?rendreFlottant\(/.test(src),
        `${f} conditionne rendreFlottant : le hook ne peut plus animer la sortie`,
      ).toBe(false)
    }
    // Anti-vacuité : si la liste devenait vide ou les fichiers illisibles, le test passerait.
    expect(vus).toBeGreaterThanOrEqual(6)
  })
})
