// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { usePopoverFlottant } from './usePopoverFlottant'
import { GrilleAnnees } from './GrilleAnnees'

/**
 * Preuve STRUCTURELLE que DatePicker et SelecteurAnnee partagent réellement la même infrastructure
 * (finding #5 de la revue), et ne sont pas deux copier-collés renommés. On vérifie au niveau SOURCE
 * que les deux importent les primitives partagées ET que l'infra dupliquée (createPortal, calcul de
 * position, écouteur de clic extérieur) N'EXISTE PLUS dans les composants — elle vit uniquement dans
 * `usePopoverFlottant`.
 */

const lire = (fichier: string) => readFileSync(new URL(fichier, import.meta.url), 'utf8')
const datePicker = lire('./DatePicker.tsx')
const selecteurAnnee = lire('./SelecteurAnnee.tsx')
const hook = lire('./usePopoverFlottant.tsx')

describe('partage de l’infrastructure popover', () => {
  it('les primitives partagées sont exportées et réutilisables', () => {
    expect(typeof usePopoverFlottant).toBe('function')
    expect(typeof GrilleAnnees).toBe('function')
  })

  it('DatePicker ET SelecteurAnnee importent les DEUX primitives partagées', () => {
    for (const src of [datePicker, selecteurAnnee]) {
      expect(src).toMatch(/import\s*\{\s*usePopoverFlottant\s*\}\s*from\s*'\.\/usePopoverFlottant'/)
      expect(src).toMatch(/from\s*'\.\/GrilleAnnees'/)
    }
  })

  it('l’infra dupliquée a bien disparu des composants (elle vit dans le hook)', () => {
    // L'APPEL createPortal(…) + les écouteurs de position/clic extérieur ne sont plus QUE dans le
    // hook (le mot « createPortal » peut rester en prose dans une doc, on cible donc l'appel).
    expect(hook).toMatch(/createPortal\(/)
    expect(datePicker).not.toMatch(/createPortal\(/)
    expect(selecteurAnnee).not.toMatch(/createPortal\(/)
    for (const src of [datePicker, selecteurAnnee]) {
      // plus de calcul de position ni de gestion du scroll/clic extérieur copiés dans le composant
      expect(src).not.toMatch(/getBoundingClientRect/)
      expect(src).not.toMatch(/addEventListener\('scroll'/)
      expect(src).not.toMatch(/addEventListener\('mousedown'/)
    }
  })

  it('la grille d’années n’est plus dupliquée : un seul `role="grid"` à 4 colonnes, dans GrilleAnnees', () => {
    const grille = lire('./GrilleAnnees.tsx')
    expect(grille).toMatch(/grid-cols-4/)
    // Le DatePicker rend la grille via <GrilleAnnees…>, plus par une boucle locale sur les années.
    expect(datePicker).toMatch(/<GrilleAnnees/)
    expect(datePicker).not.toMatch(/anneesGrille\.map/)
    expect(selecteurAnnee).not.toMatch(/anneesGrille\.map/)
  })
})
