/**
 * Catalogue FR du frontend (§4 i18n) — agrège les fragments par namespace (un fichier par
 * page/domaine), chaque fragment exportant en défaut un objet dont la clé de 1er niveau est
 * son namespace (`{ landing: { … } }`). Fusion par spread : les namespaces ne se chevauchent
 * pas → aucun écrasement (permet la parallélisation des lots par page).
 *
 * FR est la source de vérité : `Catalogue` en est dérivé et `en/index.ts` (typé `Catalogue`)
 * doit fournir la même structure → parité vérifiée à la compilation.
 *
 * NB interpolation : react-i18next utilise `{{variable}}` (double accolade).
 */
import common from './common'
import profil from './profil'
import shell from './shell'
import ui from './ui'
import landing from './landing'
import login from './login'
import inscription from './inscription'

const fr = {
  ...common,
  ...profil,
  ...shell,
  ...ui,
  ...landing,
  ...login,
  ...inscription,
}

export default fr

/** Forme du catalogue (dérivée de FR) — `en` doit la respecter à l'identique. */
export type Catalogue = typeof fr
