/**
 * Catalogue EN (§4 i18n) — agrège les fragments par namespace. Typé `Messages` → le
 * compilateur exige EXACTEMENT les mêmes clés que FR (parité ; clé manquante = erreur build).
 */
import type { Messages } from '../fr'
import { messages as communMsgs } from './commun'
import { messages as permissionsMsgs } from './permissions'
import { messages as authMsgs } from './auth'
import { messages as utilisateursMsgs } from './utilisateurs'
import { messages as organisationsMsgs } from './organisations'
import { messages as platformMsgs } from './platform'
import { messages as membresMsgs } from './membres'
import { messages as branchesMsgs } from './branches'
import { messages as fonctionsMsgs } from './fonctions'
import { messages as affectationsMsgs } from './affectations'
import { messages as contributionsMsgs } from './contributions'
import { messages as versementsMsgs } from './versements'
import { messages as baremeMsgs } from './bareme'
import { messages as equilibragesMsgs } from './equilibrages'
import { messages as recusMsgs } from './recus'
import { messages as reunionsMsgs } from './reunions'
import { messages as resolutionsMsgs } from './resolutions'
import { messages as conflitsMsgs } from './conflits'
import { messages as commemorationsMsgs } from './commemorations'
import { messages as documentsMsgs } from './documents'
import { messages as auditMsgs } from './audit'
import { messages as dashboardMsgs } from './dashboard'
import { messages as rapportsMsgs } from './rapports'
import { messages as exportsMsgs } from './exports'

export const en: Messages = {
  ...communMsgs,
  ...permissionsMsgs,
  ...authMsgs,
  ...utilisateursMsgs,
  ...organisationsMsgs,
  ...platformMsgs,
  ...membresMsgs,
  ...branchesMsgs,
  ...fonctionsMsgs,
  ...affectationsMsgs,
  ...contributionsMsgs,
  ...versementsMsgs,
  ...baremeMsgs,
  ...equilibragesMsgs,
  ...recusMsgs,
  ...reunionsMsgs,
  ...resolutionsMsgs,
  ...conflitsMsgs,
  ...commemorationsMsgs,
  ...documentsMsgs,
  ...auditMsgs,
  ...dashboardMsgs,
  ...rapportsMsgs,
  ...exportsMsgs,
}
