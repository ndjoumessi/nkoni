/**
 * Catalogue EN du frontend (§4 i18n) — agrège les fragments. Typé `Catalogue` → le compilateur
 * exige EXACTEMENT la même structure de clés que FR (parité ; clé manquante = erreur de build).
 */
import type { Catalogue } from '../fr'
import common from './common'
import profil from './profil'
import shell from './shell'
import ui from './ui'
import landing from './landing'
import login from './login'
import inscription from './inscription'

const en: Catalogue = {
  ...common,
  ...profil,
  ...shell,
  ...ui,
  ...landing,
  ...login,
  ...inscription,
}

export default en
