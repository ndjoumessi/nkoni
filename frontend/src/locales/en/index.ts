/**
 * Catalogue EN du frontend (§4 i18n) — typé `Catalogue` → parité FR/EN vérifiée à la compilation.
 */
import type { Catalogue } from '../fr'
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
import offline from './offline'
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
import cagnottes from './cagnottes'
import amendes from './amendes'

const en: Catalogue = {
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
  ...offline,
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
  ...cagnottes,
  ...amendes,
}

export default en
