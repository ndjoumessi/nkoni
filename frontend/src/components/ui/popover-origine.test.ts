import { describe, it, expect } from 'vitest'
import { origineDepuisDeclencheur } from './usePopoverFlottant'

/**
 * Origine de transformation d'un popover. Le bornage horizontal est la seule partie qui ne se
 * devine pas — d'où ce test, qui porte moins sur le calcul que sur les deux cas de bord.
 */
describe('origine d’un popover — il grandit depuis son déclencheur', () => {
  it('cas courant : l’origine tombe au centre du déclencheur, mesurée depuis la bulle', () => {
    // Déclencheur centré en x=250, bulle posée à x=100 → 150 px depuis son bord gauche.
    expect(origineDepuisDeclencheur(250, 100, 300, false)).toBe('150px top')
  })

  it('bascule vers le haut : l’origine passe en `bottom`', () => {
    // La bulle touche alors le déclencheur par le BAS. Garder `top` la ferait grandir en
    // s'éloignant de lui — l'inverse de l'effet recherché.
    expect(origineDepuisDeclencheur(250, 100, 300, true)).toBe('150px bottom')
  })

  it('déclencheur à GAUCHE de la bulle : l’origine est ramenée à son bord', () => {
    // Arrive quand la bulle a été décalée vers la droite pour tenir dans la fenêtre. Sans bornage
    // l'origine serait négative, donc HORS de la bulle, qui grandirait depuis un point à côté.
    expect(origineDepuisDeclencheur(20, 100, 300, false)).toBe('0px top')
  })

  it('déclencheur à DROITE de la bulle : l’origine est ramenée à son bord opposé', () => {
    expect(origineDepuisDeclencheur(900, 100, 300, false)).toBe('300px top')
  })

  it('l’origine reste TOUJOURS dans les bornes de la bulle', () => {
    for (const centre of [-500, 0, 137, 400, 5000]) {
      const x = Number.parseInt(origineDepuisDeclencheur(centre, 100, 300, false), 10)
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThanOrEqual(300)
    }
  })
})
