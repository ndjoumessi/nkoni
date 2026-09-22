// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RenduLegal } from './RenduLegal'
import type { DocumentLegal } from '@/content/legal/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
}))

afterEach(cleanup)

const DOC: DocumentLegal = {
  titre: 'Terms of Use',
  majLe: '2026-09-14',
  sections: [
    {
      id: 'propriete-des-donnees',
      titre: '5. Ownership',
      blocs: [
        {
          type: 'paragraphe',
          contenu: [
            'See our ',
            { texte: 'privacy policy', vers: '/confidentialite' },
            ' or write to ',
            { texte: 'contact@exemple.test', vers: 'mailto:contact@exemple.test' },
            '.',
          ],
        },
        { type: 'sousTitre', texte: 'Account data' },
        { type: 'liste', items: [['kept for ', { accent: '30 days' }, ';'], ['then deleted.']] },
      ],
    },
  ],
}

describe('RenduLegal', () => {
  const rendre = (traduction: boolean) =>
    render(
      <MemoryRouter>
        <RenduLegal document={DOC} traduction={traduction} />
      </MemoryRouter>,
    )

  it('avertit que seule la version française fait foi — uniquement sur une traduction', () => {
    rendre(true)
    expect(screen.getByRole('note').textContent).toContain('legal.avisTraduction')
    cleanup()
    rendre(false)
    expect(screen.queryByRole('note')).toBeNull()
  })

  it('rend une route interne en navigation SPA et un mailto en lien brut', () => {
    rendre(false)
    // Un `<Link>` de React Router ne recharge pas la page ; un mailto doit rester un `<a href>`.
    expect(screen.getByRole('link', { name: 'privacy policy' }).getAttribute('href')).toBe('/confidentialite')
    expect(screen.getByRole('link', { name: 'contact@exemple.test' }).getAttribute('href')).toBe(
      'mailto:contact@exemple.test',
    )
  })

  it('rend les sections avec leur ancre, les sous-titres et les listes', () => {
    const { container } = rendre(false)
    expect(container.querySelector('section#propriete-des-donnees')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('5. Ownership')
    expect(screen.getByText('Account data')).toBeTruthy()
    const items = container.querySelectorAll('li')
    expect(items).toHaveLength(2)
    expect(items[0]!.textContent).toBe('kept for 30 days;')
  })
})
