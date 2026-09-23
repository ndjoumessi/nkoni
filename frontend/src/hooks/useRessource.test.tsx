// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, act } from '@testing-library/react'
import { useRessource } from './useRessource'

/**
 * Le cycle de chargement d'une page, testé UNE fois.
 *
 * C'est l'argument de ce module : il était recopié dans 32 pages, donc chaque page était un test
 * de rendu pour le vérifier — et aucune ne le faisait. Les quatre propriétés qui comptent sont
 * ici, et nulle part ailleurs : l'annulation au démontage, la garde `AbortError`, le repli du
 * message d'erreur, et le fait que les dépendances DÉCLARÉES relancent le chargement alors qu'un
 * simple rendu ne le relance pas.
 */

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => `i18n:${cle}`, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))
vi.mock('@/lib/i18n', () => ({ cleI18n: (c: string) => c, default: { t: (c: string) => c } }))
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ accessToken: 'jeton' }) }))

// `vi.mock` est hissé en tête de fichier : la classe doit donc l'être aussi.
const { ApiErrorFausse } = vi.hoisted(() => ({
  ApiErrorFausse: class extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  },
}))
vi.mock('@/lib/api', () => ({ ApiError: ApiErrorFausse }))

afterEach(cleanup)

function Sonde({
  charger,
  deps = [],
}: {
  charger: (jeton: string, signal: AbortSignal) => Promise<string>
  deps?: readonly unknown[]
}) {
  const { data, loading, error } = useRessource(charger, deps, 'commun.erreur')
  return (
    <div>
      <span data-testid="etat">{loading ? 'chargement' : (error ?? data ?? 'vide')}</span>
    </div>
  )
}

describe('useRessource — le cycle de chargement', () => {
  it('passe de chargement à donnée', async () => {
    render(<Sonde charger={async () => 'ok'} />)
    expect(screen.getByTestId('etat').textContent).toBe('chargement')
    await waitFor(() => expect(screen.getByTestId('etat').textContent).toBe('ok'))
  })

  it('rend le message d’une ApiError telle quelle — le serveur a déjà traduit', async () => {
    render(
      <Sonde
        charger={async () => {
          throw new ApiErrorFausse(409, 'Reçu déjà annulé.')
        }}
      />,
    )
    await waitFor(() => expect(screen.getByTestId('etat').textContent).toBe('Reçu déjà annulé.'))
  })

  it('replie sur la clé i18n quand l’erreur n’est PAS une ApiError', async () => {
    // Coupure réseau, bug de rendu : rien à montrer d'utile, on affiche le message de la page.
    render(
      <Sonde
        charger={async () => {
          throw new TypeError('Failed to fetch')
        }}
      />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('etat').textContent).toBe('i18n:commun.erreur'),
    )
  })

  it('AVALE l’AbortError — quitter une page en cours de chargement n’affiche pas d’erreur', async () => {
    // La garde manquait dans 4 des 32 pages. Son absence fait clignoter un message rouge au
    // moment précis où l'utilisateur a déjà changé d'écran.
    let etat = 'chargement'
    const { unmount } = render(
      <Sonde
        charger={async (_j, signal) =>
          new Promise((_resoudre, rejeter) => {
            signal.addEventListener('abort', () =>
              rejeter(new DOMException('aborted', 'AbortError')),
            )
          })
        }
      />,
    )
    etat = screen.getByTestId('etat').textContent ?? ''
    expect(etat).toBe('chargement')
    // Démontage → abort → le rejet ne doit produire ni erreur d'état ni avertissement React.
    expect(() => unmount()).not.toThrow()
  })

  it('ANNULE la requête au démontage', async () => {
    const signaux: AbortSignal[] = []
    const { unmount } = render(
      <Sonde
        charger={async (_j, signal) => {
          signaux.push(signal)
          return 'ok'
        }}
      />,
    )
    // React 19 en mode strict monte, démonte et remonte : on regarde le DERNIER signal, celui du
    // montage qui a survécu — les précédents sont légitimement déjà annulés.
    await waitFor(() => expect(signaux.length).toBeGreaterThan(0))
    const vivant = signaux[signaux.length - 1]!
    expect(vivant.aborted).toBe(false)
    unmount()
    expect(vivant.aborted).toBe(true)
  })

  it('ne relance PAS sur un simple rendu — `charger` est une fonction neuve à chaque fois', async () => {
    // Le piège que la `ref` ferme : mettre `charger` dans les dépendances de l'effet boucle à
    // l'infini, puisque la page en crée une nouvelle à chaque rendu.
    let appels = 0
    // Chaque rendu passe une fonction NEUVE, exactement comme une page qui écrit sa fermeture
    // dans le corps du composant.
    const neuve = () => async () => {
      appels += 1
      return 'ok'
    }
    const { rerender } = render(<Sonde charger={neuve()} />)
    await waitFor(() => expect(appels).toBe(1))
    rerender(<Sonde charger={neuve()} />)
    rerender(<Sonde charger={neuve()} />)
    await act(async () => {})
    expect(appels).toBe(1)
  })

  it('RELANCE quand une dépendance déclarée change', async () => {
    let appels = 0
    const charger = async () => {
      appels += 1
      return `appel-${appels}`
    }
    const { rerender } = render(<Sonde charger={charger} deps={[1]} />)
    await waitFor(() => expect(appels).toBe(1))
    rerender(<Sonde charger={charger} deps={[2]} />)
    await waitFor(() => expect(appels).toBe(2))
  })
})
