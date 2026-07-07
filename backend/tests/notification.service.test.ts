import { describe, it, expect } from 'vitest'
import {
  creerNotification,
  notifierVersement,
  marquerCommeLue,
  marquerToutesCommeLues,
  compterNonLues,
  listerNotifications,
  NotificationIntrouvableError,
} from '../src/services/notification.service'
import { buildNotificationsMock } from './support/notifications-prisma-mock'

/**
 * Service Notifications (§5) — CRUD isolé par destinataire + déclencheur VERSEMENT_RECU.
 * Prisma mocké en mémoire.
 */

describe('notifierVersement (déclencheur §5)', () => {
  it('membre AVEC compte lié → une notification VERSEMENT_RECU pour lui', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [{ id: 'm-avec', compteUtilisateurId: 'u-avec' }],
    })
    await notifierVersement(prisma, {
      versementId: 'v1',
      membreId: 'm-avec',
      montant: 30_000,
      annee: 2025,
    })
    const creees = [...notifs.values()]
    expect(creees).toHaveLength(1)
    expect(creees[0]).toMatchObject({
      destinataireId: 'u-avec',
      type: 'VERSEMENT_RECU',
      entiteType: 'Versement',
      entiteId: 'v1',
      lu: false,
    })
    expect(creees[0].message).toContain('30 000') // 30 000 (espace fine insécable fr-FR)
    expect(creees[0].message).toContain('2025')
  })

  it('rendu dans la langue du DESTINATAIRE (EN), pas de l’acteur qui déclenche', async () => {
    // §4 : un versement peut être saisi par n'importe qui (ex. trésorière FR) ; la notification
    // part au MEMBRE et doit être rendue dans SA langue à lui (ici EN), indépendamment de l'acteur.
    // `notifierVersement` ne reçoit d'ailleurs aucune info sur l'acteur : seul le destinataire compte.
    const { prisma, notifs } = buildNotificationsMock({
      membres: [{ id: 'm-en', compteUtilisateurId: 'u-en' }],
      utilisateurs: [{ id: 'u-en', langue: 'EN' }],
    })
    await notifierVersement(prisma, {
      versementId: 'v1',
      membreId: 'm-en',
      montant: 30_000,
      annee: 2025,
    })
    const n = [...notifs.values()][0]
    expect(n.titre).toBe('Payment recorded')
    expect(n.message).toContain('Your payment of')
    expect(n.message).toContain('has been recorded.')
    expect(n.message).toContain('2025')
  })

  it('langue perso absente → hérite du défaut de l’organisation (EN)', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [{ id: 'm-h', compteUtilisateurId: 'u-h' }],
      utilisateurs: [{ id: 'u-h', langue: null, organisationLangueDefaut: 'EN' }],
    })
    await notifierVersement(prisma, {
      versementId: 'v1',
      membreId: 'm-h',
      montant: 5_000,
      annee: 2026,
    })
    expect([...notifs.values()][0].titre).toBe('Payment recorded')
  })

  it('destinataire FR (défaut) → notification en français', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [{ id: 'm-fr', compteUtilisateurId: 'u-fr' }],
      utilisateurs: [{ id: 'u-fr', langue: 'FR' }],
    })
    await notifierVersement(prisma, {
      versementId: 'v1',
      membreId: 'm-fr',
      montant: 30_000,
      annee: 2025,
    })
    const n = [...notifs.values()][0]
    expect(n.titre).toBe('Versement enregistré')
    expect(n.message).toContain('a été enregistré.')
  })

  it('montant rendu dans la DEVISE de l’org du destinataire (EUR → euros, pas FCFA) — F6', async () => {
    // §5/F6 : le montant d'une notification suit la devise de l'organisation de CELUI qui la reçoit.
    // Un membre d'une org en EUR voit « € », jamais « FCFA », même si l'acteur est ailleurs.
    const { prisma, notifs } = buildNotificationsMock({
      membres: [{ id: 'm-eur', compteUtilisateurId: 'u-eur' }],
      utilisateurs: [{ id: 'u-eur', langue: 'FR', organisationDevise: 'EUR' }],
    })
    await notifierVersement(prisma, {
      versementId: 'v1',
      membreId: 'm-eur',
      montant: 30_000,
      annee: 2025,
    })
    const n = [...notifs.values()][0]
    expect(n.message).toContain('€')
    expect(n.message).not.toContain('FCFA')
  })

  it('sans devise d’org connue → repli FCFA (rétro-compatible)', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [{ id: 'm-def', compteUtilisateurId: 'u-def' }],
      utilisateurs: [{ id: 'u-def', langue: 'FR' }],
    })
    await notifierVersement(prisma, {
      versementId: 'v1',
      membreId: 'm-def',
      montant: 30_000,
      annee: 2025,
    })
    expect([...notifs.values()][0].message).toContain('FCFA')
  })

  it('membre SANS compte → aucune notification créée', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [{ id: 'm-sans', compteUtilisateurId: null }],
    })
    await notifierVersement(prisma, {
      versementId: 'v2',
      membreId: 'm-sans',
      montant: 10_000,
      annee: 2025,
    })
    expect(notifs.size).toBe(0)
  })

  it('préférence VERSEMENT_RECU désactivée → aucune notif (pas de notif fantôme)', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [{ id: 'm-avec', compteUtilisateurId: 'u-avec' }],
      utilisateurs: [{ id: 'u-avec', notificationsActives: { VERSEMENT_RECU: false } }],
    })
    await notifierVersement(prisma, {
      versementId: 'v3',
      membreId: 'm-avec',
      montant: 5_000,
      annee: 2025,
    })
    expect(notifs.size).toBe(0)
  })
})

describe('CRUD notifications isolé par destinataire', () => {
  const seed = () =>
    buildNotificationsMock({
      notifs: [
        mkNotif('a1', 'u-a', false, '2026-06-01'),
        mkNotif('a2', 'u-a', true, '2026-06-02'),
        mkNotif('b1', 'u-b', false, '2026-06-03'),
      ],
    })

  it('listerNotifications ne renvoie que les siennes, récentes d’abord', async () => {
    const { prisma } = seed()
    const list = (await listerNotifications(prisma, 'u-a')) as { id: string }[]
    expect(list.map((n) => n.id)).toEqual(['a2', 'a1']) // u-b absent, tri desc
  })

  it('compterNonLues compte uniquement ses non-lues', async () => {
    const { prisma } = seed()
    expect(await compterNonLues(prisma, 'u-a')).toBe(1) // a1 non lue (a2 lue)
    expect(await compterNonLues(prisma, 'u-b')).toBe(1)
  })

  it('marquerCommeLue : OK pour le destinataire, positionne lu + dateLecture', async () => {
    const { prisma, notifs } = seed()
    const now = new Date('2026-06-10T08:00:00Z')
    await marquerCommeLue(prisma, 'a1', 'u-a', now)
    expect(notifs.get('a1')).toMatchObject({ lu: true, dateLecture: now })
  })

  it('marquerCommeLue : REFUSE si ce n’est pas le destinataire (NotificationIntrouvableError)', async () => {
    const { prisma, notifs } = seed()
    // u-b tente de marquer la notif a1 de u-a.
    await expect(marquerCommeLue(prisma, 'a1', 'u-b')).rejects.toBeInstanceOf(
      NotificationIntrouvableError,
    )
    expect(notifs.get('a1')?.lu).toBe(false) // inchangée
  })

  it('marquerToutesCommeLues n’affecte que ses non-lues', async () => {
    const { prisma, notifs } = seed()
    const count = await marquerToutesCommeLues(prisma, 'u-a')
    expect(count).toBe(1) // seule a1 était non lue
    expect(notifs.get('b1')?.lu).toBe(false) // celle de u-b intacte
  })

  it('creerNotification pose les champs et lu=false par défaut', async () => {
    const { prisma, notifs } = buildNotificationsMock()
    await creerNotification(prisma, {
      destinataireId: 'u-x',
      type: 'COTISATION_RETARD',
      titre: 'T',
      message: 'M',
    })
    expect([...notifs.values()][0]).toMatchObject({ destinataireId: 'u-x', lu: false })
  })
})

/** Fabrique une notification stockée pour les fixtures. */
function mkNotif(id: string, destinataireId: string, lu: boolean, date: string) {
  return {
    id,
    destinataireId,
    type: 'VERSEMENT_RECU',
    titre: 'T',
    message: 'M',
    entiteType: null,
    entiteId: null,
    lu,
    dateCreation: new Date(date),
    dateLecture: null,
  }
}
