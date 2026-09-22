// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AidePage from '@/pages/aide/AidePage'
import StatutPage from '@/pages/StatutPage'
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context'
import type { AuthUser } from '@/lib/api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
}))

// La page de statut sonde le serveur au montage : ces appels ne sont pas le sujet ici, seul
// l'en-tête l'est. On les neutralise pour que le rendu soit synchrone et sans réseau.
vi.mock('@/lib/api', async (original) => ({
  ...(await original<typeof import('@/lib/api')>()),
  statutApi: { incidentPublic: () => new Promise(() => {}) },
}))
vi.stubGlobal('fetch', () => new Promise(() => {}))

afterEach(cleanup)

/** Contexte minimal : seul `user` est lu par le chrome des pages d'aide. */
function contexte(role: string): AuthContextValue {
  return { user: { id: 'u1', email: 'a@asso.cm', role } as AuthUser } as AuthContextValue
}

function rendre(auth?: AuthContextValue) {
  const page = (
    <MemoryRouter>
      <AidePage />
    </MemoryRouter>
  )
  render(auth ? <AuthContext.Provider value={auth}>{page}</AuthContext.Provider> : page)
}

const lienRetour = (libelle: string) => screen.getByRole('link', { name: libelle }).getAttribute('href')

describe('chrome des pages publiques (aide, pages légales)', () => {
  it('visiteur : retour à l’accueil public et sélecteur de langue visible', () => {
    rendre()
    expect(lienRetour('aideDoc.retour')).toBe('/')
    expect(screen.getByRole('group', { name: 'commun.langue.selecteur' })).not.toBeNull()
  })

  it('connecté : retour à SON application, sans sélecteur de langue (la page suit son compte)', () => {
    rendre(contexte('TRESORIERE'))
    expect(lienRetour('aideDoc.retourApplication')).toBe('/dashboard')
    expect(screen.queryByRole('group', { name: 'commun.langue.selecteur' })).toBeNull()
  })

  it('membre simple connecté : retour vers son espace, pas le tableau de bord', () => {
    rendre(contexte('MEMBRE_SIMPLE'))
    expect(lienRetour('aideDoc.retourApplication')).toBe('/mon-espace')
  })
})

/**
 * `/statut` garde sa propre coquille (mesure étroite, sur-titre) mais NON son en-tête : elle
 * consomme le même `useChromePublic`. C'est la page qu'ouvre quelqu'un qui n'arrive pas à se
 * connecter — sans sélecteur, un visiteur anglophone n'avait aucun moyen d'y basculer de langue,
 * alors que les pages légales et l'aide le lui offraient. Redupliquer l'en-tête les ferait diverger
 * de nouveau : ce test est ce qui l'interdit.
 */
describe('chrome de la page de statut', () => {
  const rendreStatut = (auth?: AuthContextValue) => {
    const page = (
      <MemoryRouter>
        <StatutPage />
      </MemoryRouter>
    )
    render(auth ? <AuthContext.Provider value={auth}>{page}</AuthContext.Provider> : page)
  }

  it('visiteur : sélecteur de langue visible et retour à l’accueil public', () => {
    rendreStatut()
    expect(screen.getByRole('group', { name: 'commun.langue.selecteur' })).not.toBeNull()
    expect(lienRetour('aideDoc.retour')).toBe('/')
  })

  it('connecté : retour vers SON application, sans sélecteur (la page suit son compte)', () => {
    rendreStatut(contexte('TRESORIERE'))
    expect(screen.queryByRole('group', { name: 'commun.langue.selecteur' })).toBeNull()
    expect(lienRetour('aideDoc.retourApplication')).toBe('/dashboard')
  })
})
