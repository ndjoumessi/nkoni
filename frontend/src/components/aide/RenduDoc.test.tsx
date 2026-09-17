// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { RenduDoc } from './RenduDoc'
import type { Document } from '@/content/aide/types'

// Pas de `globals`/auto-cleanup dans vitest.config.ts (cf. DatePicker.test.tsx) : sans ce nettoyage,
// chaque `rendre()` s'empile dans le même `document.body` et les requêtes *ByRole* deviennent
// ambiguës (« Found multiple elements ») dès le second test.
afterEach(cleanup)

const DOC: Document = {
  titre: 'Guide de test',
  intro: 'Intro du guide.',
  sections: [
    {
      id: 'premiere-section',
      titre: 'Première section',
      blocs: [
        { type: 'paragraphe', texte: 'Un paragraphe.' },
        { type: 'etapes', etapes: ['Ouvrir', 'Enregistrer'] },
        { type: 'liste', items: ['Un', 'Deux'] },
        { type: 'note', ton: 'attention', texte: 'Attention à ceci.' },
        { type: 'lien', vers: '/bareme', libelle: 'Aller au barème' },
      ],
    },
    { id: 'seconde-section', titre: 'Seconde section', blocs: [{ type: 'paragraphe', texte: 'Fin.' }] },
  ],
}

const rendre = () =>
  render(
    <MemoryRouter>
      <RenduDoc document={DOC} libelleSommaire="Sommaire" />
    </MemoryRouter>,
  )

describe('RenduDoc', () => {
  it('rend chaque section dans un <section> portant son id (ancre de lien partagé)', () => {
    const { container } = rendre()
    expect(container.querySelector('section#premiere-section')).toBeTruthy()
    expect(container.querySelector('section#seconde-section')).toBeTruthy()
  })

  it('les titres de section sont des <h2> (le <h1> appartient à la page)', () => {
    rendre()
    expect(screen.getByRole('heading', { level: 2, name: 'Première section' })).toBeTruthy()
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('le sommaire liste toutes les sections et pointe sur leurs ancres', () => {
    rendre()
    const sommaire = screen.getByRole('navigation', { name: 'Sommaire' })
    const liens = within(sommaire).getAllByRole('link')
    expect(liens.map((l) => l.getAttribute('href'))).toEqual(['#premiere-section', '#seconde-section'])
  })

  it('les étapes sont une liste ORDONNÉE, les items une liste simple', () => {
    const { container } = rendre()
    // Le sommaire est lui aussi un <ol> avec 2 éléments dans ce fixture : cibler le bloc étapes par
    // son data-attribute évite un test vacant (un `querySelector('ol')` générique passerait sans
    // prouver que CE <ol> est bien celui des étapes).
    expect(
      within(container.querySelector('ol[data-bloc="etapes"]') as HTMLElement).getAllByRole('listitem'),
    ).toHaveLength(2)
    expect(container.querySelectorAll('ul[data-bloc="liste"] li')).toHaveLength(2)
  })

  it('un bloc lien rend un Link interne, jamais un <a href> brut', () => {
    rendre()
    expect(screen.getByRole('link', { name: 'Aller au barème' }).getAttribute('href')).toBe('/bareme')
  })

  it('une note « attention » porte role="note" et son texte', () => {
    rendre()
    expect(screen.getByRole('note').textContent).toContain('Attention à ceci.')
  })
})
