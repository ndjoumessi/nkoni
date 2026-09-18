// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GuidePage } from './GuidePage'
import type { Document } from '@/content/aide/types'

// Les libellés i18n ne sont pas l'objet du test ; on court-circuite react-i18next (t → clé), comme
// dans les autres tests d'`/aide` (cf. AidePage.test.tsx).
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
}))

// `chargerDocument` est mocké pour contrôler précisément le moment de résolution (succès/échec)
// sans dépendre du contenu réel ni d'un vrai `import()` dynamique.
const chargerDocument = vi.fn()
vi.mock('@/content/aide/registre', () => ({
  chargerDocument: (...args: unknown[]) => chargerDocument(...args),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const DOC: Document = {
  titre: 'Guide du bureau',
  intro: 'Intro du guide.',
  sections: [
    { id: 'mettre-en-route', titre: 'Mettre en route', blocs: [{ type: 'paragraphe', texte: 'a' }] },
    {
      id: 'corriger-une-erreur',
      titre: 'Corriger une erreur',
      blocs: [{ type: 'paragraphe', texte: 'b' }],
    },
  ],
}

describe('GuidePage — défilement vers la section visée par l’ancre (A4)', () => {
  let scrollIntoView: ReturnType<typeof vi.fn>

  beforeEach(() => {
    chargerDocument.mockResolvedValue(DOC)
    // jsdom n'implémente pas scrollIntoView : stub le temps du test (cf. brief A4).
    scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
  })

  it('fait défiler jusqu’à la section du hash une fois le document rendu', async () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/aide/bureau#corriger-une-erreur']}>
        <GuidePage guide="bureau" />
      </MemoryRouter>,
    )

    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1))

    // La cible du défilement doit être LA bonne section, pas seulement « un » appel.
    const cible = container.querySelector('#corriger-une-erreur')
    expect(cible).not.toBeNull()
    expect(scrollIntoView.mock.instances[0]).toBe(cible)
  })

  it('un hash qui ne correspond à aucune section ne casse rien et ne défile pas', async () => {
    render(
      <MemoryRouter initialEntries={['/aide/bureau#section-inexistante']}>
        <GuidePage guide="bureau" />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 2, name: 'Mettre en route' })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('sans hash dans l’URL, ne défile pas', async () => {
    render(
      <MemoryRouter initialEntries={['/aide/bureau']}>
        <GuidePage guide="bureau" />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { level: 2, name: 'Mettre en route' })
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})

describe('GuidePage — erreur de chargement avec reprise (B1)', () => {
  beforeEach(() => {
    chargerDocument.mockRejectedValue(new Error('chunk périmé après déploiement'))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('propose un bouton de reprise qui recharge la page (même choix que ErrorBoundary)', async () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })

    render(
      <MemoryRouter initialEntries={['/aide/bureau']}>
        <GuidePage guide="bureau" />
      </MemoryRouter>,
    )

    // Réutilise la clé i18n de `ErrorBoundary` (`commun.erreurFatale.recharger`), pas une clé neuve.
    const bouton = await screen.findByRole('button', { name: 'commun.erreurFatale.recharger' })
    bouton.click()
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
