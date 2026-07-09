/**
 * Résolution de la LANGUE + DEVISE d'un export (contributions §5.9 et rapports).
 *
 * Factorise le bloc auparavant copié-collé dans les 3 routes d'export (exports.route +
 * rapports.route ×2) : langue = préférence de l'utilisateur qui exporte (token) ; devise = celle de
 * son organisation. La devise n'est résolue (requête DB via `resoudreDeviseDestinataire`) QUE si
 * `avecDevise` — les exports Excel gardent des nombres bruts et n'en ont pas besoin (on évite ainsi
 * une requête inutile sur le format .xlsx, qui est le format par défaut).
 */
import type { FastifyRequest } from 'fastify'
import { langueDeRequete, type Langue, type Devise } from './i18n'
import { resoudreDeviseDestinataire, type NotificationPrisma } from '../services/notification.service'

export async function resoudreLocaleExport(
  req: FastifyRequest,
  prisma: NotificationPrisma,
  avecDevise: boolean,
): Promise<{ langue: Langue; devise: Devise }> {
  const langue = langueDeRequete(req)
  const devise =
    avecDevise && req.user.sub ? await resoudreDeviseDestinataire(prisma, req.user.sub) : 'FCFA'
  return { langue, devise }
}
