/**
 * Catalogue FR du frontend (§4 i18n) — agrège les fragments par namespace (un fichier par
 * page/domaine). Fusion par spread : namespaces disjoints → aucun écrasement (parallélisable).
 * FR = source de vérité ; `Catalogue` en dérive et `en/index` (typé) impose la parité au build.
 * Interpolation react-i18next : {{variable}}.
 */
import common from './common'
import profil from './profil'
import shell from './shell'
import ui from './ui'
import landing from './landing'
import login from './login'
import inscription from './inscription'
import documents from './documents'
import dashboard from './dashboard'
import membres from './membres'
import importMembres from './import'
import monEspace from './monEspace'
import tresorerie from './tresorerie'
import branches from './branches'
import versements from './versements'
import equilibrages from './equilibrages'
import reunions from './reunions'
import resolutions from './resolutions'
import fonctions from './fonctions'
import affectations from './affectations'
import conflits from './conflits'
import commemorations from './commemorations'
import bareme from './bareme'
import rapports from './rapports'
import utilisateurs from './utilisateurs'
import audit from './audit'
import superAdmin from './superAdmin'
import parametres from './parametres'

const fr = {
  ...common,
  ...profil,
  ...shell,
  ...ui,
  ...landing,
  ...login,
  ...inscription,
  ...documents,
  ...dashboard,
  ...membres,
  ...importMembres,
  ...monEspace,
  ...tresorerie,
  ...branches,
  ...versements,
  ...equilibrages,
  ...reunions,
  ...resolutions,
  ...fonctions,
  ...affectations,
  ...conflits,
  ...commemorations,
  ...bareme,
  ...rapports,
  ...utilisateurs,
  ...audit,
  ...superAdmin,
  ...parametres,
}

export default fr

/** Forme du catalogue (dérivée de FR) — `en` doit la respecter à l'identique. */
export type Catalogue = typeof fr
