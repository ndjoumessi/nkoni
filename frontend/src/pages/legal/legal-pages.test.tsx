// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TexteLegalPage from './TexteLegalPage'
import type { DocumentLegal } from '@/content/legal/types'

/**
 * Pages légales (décision PO du 2026-09-22). Ce qui est verrouillé ici : la langue de lecture
 * atteint bien le CHARGEUR (une traduction affichée en français serait indétectable autrement) et
 * le lecteur anglophone est averti que sa version est une traduction de courtoisie. Les trois textes
 * — CGU, confidentialité et mentions légales — passent par la même page.
 */
let langue = 'fr'
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (cle: string, opts?: Record<string, unknown>) => (opts ? `${cle} ${JSON.stringify(opts)}` : cle),
    i18n: { language: langue },
  }),
}))

const chargerTexteLegal = vi.fn()
vi.mock('@/content/legal/registre', async (original) => ({
  ...(await original<typeof import('@/content/legal/registre')>()),
  chargerTexteLegal: (...args: unknown[]) => chargerTexteLegal(...args),
}))

const doc = (titre: string): DocumentLegal => ({
  titre,
  majLe: '2026-09-14',
  sections: [{ id: 'objet', titre: '1. Purpose', blocs: [{ type: 'paragraphe', contenu: ['Texte.'] }] }],
})

beforeEach(() => {
  langue = 'fr'
  chargerTexteLegal.mockReset()
})
afterEach(cleanup)

const rendre = (ui: React.ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('TexteLegalPage', () => {
  it('charge le texte DANS LA LANGUE de lecture et affiche son titre', async () => {
    langue = 'en'
    chargerTexteLegal.mockResolvedValue(doc('Terms of Use'))
    rendre(<TexteLegalPage texte="cgu" />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Terms of Use'))
    expect(chargerTexteLegal).toHaveBeenCalledWith('cgu', 'en')
  })

  it('en anglais : avertit que seule la version française fait foi', async () => {
    langue = 'en'
    chargerTexteLegal.mockResolvedValue(doc('Terms of Use'))
    rendre(<TexteLegalPage texte="cgu" />)
    await waitFor(() => expect(screen.getByRole('note').textContent).toContain('legal.avisTraduction'))
  })

  it('en français : aucun avertissement (c’est la version de référence)', async () => {
    chargerTexteLegal.mockResolvedValue(doc('Conditions générales d’utilisation'))
    rendre(<TexteLegalPage texte="cgu" />)
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeTruthy())
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('échec de chargement : état d’erreur avec reprise, jamais une page blanche', async () => {
    chargerTexteLegal.mockRejectedValue(new Error('chunk périmé'))
    rendre(<TexteLegalPage texte="confidentialite" />)
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('legal.erreurTitre'))
  })
})

describe('les trois textes passent par la même page', () => {
  it.each(['cgu', 'confidentialite', 'mentions-legales'] as const)('%s : chargé dans la langue de lecture', async (texte) => {
    langue = 'en'
    chargerTexteLegal.mockResolvedValue(doc('Legal notice'))
    rendre(<TexteLegalPage texte={texte} />)
    await waitFor(() => expect(chargerTexteLegal).toHaveBeenCalledWith(texte, 'en'))
  })
})
