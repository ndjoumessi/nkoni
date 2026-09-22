// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import TexteLegalPage from './TexteLegalPage'
import MentionsLegalesPage from './MentionsLegalesPage'
import type { DocumentLegal } from '@/content/legal/types'

/**
 * Pages légales (décision PO du 2026-09-22). Ce qui est verrouillé ici : la langue de lecture
 * atteint bien le CHARGEUR (une traduction affichée en français serait indétectable autrement), et
 * le lecteur anglophone est averti — soit que sa version est une traduction de courtoisie (CGU,
 * confidentialité), soit que la page n'existe qu'en français (mentions légales).
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

describe('MentionsLegalesPage', () => {
  it('en anglais : dit que la page n’existe qu’en français', () => {
    langue = 'en'
    rendre(<MentionsLegalesPage />)
    expect(screen.getByRole('note').textContent).toContain('legal.mentionsFrancaisUniquement')
  })

  it('en français : aucun avis, et la date de mise à jour est formatée', () => {
    rendre(<MentionsLegalesPage />)
    expect(screen.queryByRole('note')).toBeNull()
    // `legal.majLe` reçoit une date FORMATÉE, pas l'ISO brut du composant.
    expect(screen.getByText(/legal\.majLe/).textContent).toContain('septembre')
  })
})
