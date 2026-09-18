// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AidePage from './AidePage'
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context'
import type { AuthUser } from '@/lib/api'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
}))

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

describe('chrome des pages d’aide', () => {
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
