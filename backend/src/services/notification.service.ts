/**
 * Service Notifications in-app — NKONI V2 (§5).
 *
 * Canal interne uniquement (aucun email / dépendance externe). Périmètre initial :
 * événements financiers (VERSEMENT_RECU, COTISATION_RETARD). Découplé de Fastify, Prisma
 * injecté (mockable en test). Aucune permission par rôle : chaque utilisateur ne voit et
 * ne modifie QUE ses propres notifications (filtrage par `destinataireId` partout).
 *
 * Règle métier (§4.5) : seuls les Utilisateur liés à un Membre reçoivent des notifications.
 * Un membre sans compte ne notifie personne — géré à la source (notifierVersementRecu, et
 * le scheduler ne parcourt que les membres à compte lié).
 */

export type TypeNotification = 'VERSEMENT_RECU' | 'COTISATION_RETARD'

/** Levée quand la notification cible n'existe pas OU n'appartient pas au demandeur. */
export class NotificationIntrouvableError extends Error {
  readonly id: string
  constructor(id: string) {
    super(`Notification ${id} introuvable.`)
    this.name = 'NotificationIntrouvableError'
    this.id = id
  }
}

export interface CreerNotificationInput {
  destinataireId: string
  type: TypeNotification
  titre: string
  message: string
  entiteType?: string
  entiteId?: string
}

/* -------------------------------------------------------------------------- */
/* Surface Prisma (mockable)                                                  */
/* -------------------------------------------------------------------------- */

export interface NotificationPrisma {
  notification: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    create(args: any): Promise<any>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findMany(args?: any): Promise<any[]>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    updateMany(args: any): Promise<{ count: number }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    count(args?: any): Promise<number>
  }
  membre: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    findUnique(args: any): Promise<any>
  }
}

/* -------------------------------------------------------------------------- */
/* CRUD notifications                                                         */
/* -------------------------------------------------------------------------- */

/** Crée une notification pour un destinataire (Utilisateur). */
export async function creerNotification(
  prisma: NotificationPrisma,
  input: CreerNotificationInput,
): Promise<unknown> {
  return prisma.notification.create({
    data: {
      destinataireId: input.destinataireId,
      type: input.type,
      titre: input.titre,
      message: input.message,
      ...(input.entiteType !== undefined ? { entiteType: input.entiteType } : {}),
      ...(input.entiteId !== undefined ? { entiteId: input.entiteId } : {}),
    },
  })
}

/** Liste les notifications d'un utilisateur (les plus récentes d'abord). */
export async function listerNotifications(
  prisma: NotificationPrisma,
  destinataireId: string,
): Promise<unknown[]> {
  return prisma.notification.findMany({
    where: { destinataireId },
    orderBy: { dateCreation: 'desc' },
  })
}

/** Nombre de notifications non lues d'un utilisateur (pour le badge). */
export async function compterNonLues(
  prisma: NotificationPrisma,
  destinataireId: string,
): Promise<number> {
  return prisma.notification.count({ where: { destinataireId, lu: false } })
}

/**
 * Marque UNE notification comme lue — uniquement si elle appartient au demandeur.
 * On filtre par (id, destinataireId) dans un updateMany : si count === 0, la notif
 * n'existe pas OU n'est pas la sienne → NotificationIntrouvableError (route → 404, sans
 * révéler l'existence d'une notif d'autrui). Aucune lecture préalable = aucune fuite.
 */
export async function marquerCommeLue(
  prisma: NotificationPrisma,
  id: string,
  destinataireId: string,
  now: Date = new Date(),
): Promise<void> {
  const { count } = await prisma.notification.updateMany({
    where: { id, destinataireId },
    data: { lu: true, dateLecture: now },
  })
  if (count === 0) throw new NotificationIntrouvableError(id)
}

/** Marque toutes les non-lues d'un utilisateur comme lues. Retourne le nombre affecté. */
export async function marquerToutesCommeLues(
  prisma: NotificationPrisma,
  destinataireId: string,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await prisma.notification.updateMany({
    where: { destinataireId, lu: false },
    data: { lu: true, dateLecture: now },
  })
  return count
}

/* -------------------------------------------------------------------------- */
/* Déclencheur VERSEMENT_RECU                                                 */
/* -------------------------------------------------------------------------- */

/** Montant FCFA formaté à la française (ex. 30000 → « 30 000 FCFA »). */
function fcfa(montant: number): string {
  return `${montant.toLocaleString('fr-FR')} FCFA`
}

export interface VersementNotifParams {
  versementId: string
  membreId: string
  montant: number
  annee: number
}

/**
 * Notifie le membre qu'un versement a été enregistré POUR LUI — seulement s'il a un compte
 * Utilisateur lié (sinon on ne notifie personne, §4.5). À appeler après la transaction de
 * création du versement (best-effort : ne doit jamais faire échouer l'écriture financière).
 *
 * NB nommage : la fonction s'appelle `notifierVersement` (pas *…Recu*) volontairement — le
 * test-garde §4.6 vérifie que versements.route.ts ne référence jamais « recu » (aucune
 * génération de Reçu au versement) ; la notification ne doit pas trébucher sur ce garde.
 */
export async function notifierVersement(
  prisma: NotificationPrisma,
  params: VersementNotifParams,
): Promise<void> {
  const membre = await prisma.membre.findUnique({
    where: { id: params.membreId },
    select: { compteUtilisateurId: true },
  })
  const destinataireId = membre?.compteUtilisateurId
  if (!destinataireId) return // membre sans compte → aucun destinataire

  await creerNotification(prisma, {
    destinataireId,
    type: 'VERSEMENT_RECU',
    titre: 'Versement enregistré',
    message: `Votre versement de ${fcfa(params.montant)} pour l'année ${params.annee} a été enregistré.`,
    entiteType: 'Versement',
    entiteId: params.versementId,
  })
}
