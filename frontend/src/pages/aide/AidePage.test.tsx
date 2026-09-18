// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AidePage from './AidePage'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
}))

afterEach(cleanup)

describe('AidePage', () => {
  it('propose les trois entrées, chacune liée à sa route', () => {
    render(
      <MemoryRouter>
        <AidePage />
      </MemoryRouter>,
    )
    const cibles = screen.getAllByRole('link').map((l) => l.getAttribute('href'))
    expect(cibles).toEqual(expect.arrayContaining(['/aide/membre', '/aide/bureau', '/aide/faq']))
  })
})
