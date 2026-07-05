import { describe, it, expect } from 'vitest'
import { executerVerificationRetards } from '../src/services/notification-scheduler'
import {
  buildNotificationsMock,
  type StoredNotif,
  type MembreSeed,
} from './support/notifications-prisma-mock'

/**
 * Scheduler COTISATION_RETARD (§5) — via le point d'entrée manuel `executerVerificationRetards`
 * (anneeCourante + now injectés → déterministe, indépendant du vrai cron et de l'horloge).
 */

const ANNEE = 2025
const NOW = new Date('2025-06-15T03:00:00Z')
const baremes = [{ annee: 2025, montantAttendu: 10_000 }]

// Membres ACTIF avec compte lié, aux statuts variés pour 2025 (barème 10 000).
const MEMBRES: MembreSeed[] = [
  { id: 'm1', compteUtilisateurId: 'u1', anneeAdhesion: 2025, contributions: [] }, // NON_A_JOUR
  {
    id: 'm2',
    compteUtilisateurId: 'u2',
    anneeAdhesion: 2025,
    contributions: [{ annee: 2025, montantValorise: 10_000 }],
  }, // A_JOUR
  {
    id: 'm3',
    compteUtilisateurId: 'u3',
    anneeAdhesion: 2025,
    contributions: [{ annee: 2025, montantValorise: 4_000 }],
  }, // PARTIEL
  { id: 'm4', compteUtilisateurId: null, anneeAdhesion: 2025, contributions: [] }, // NON_A_JOUR mais SANS compte
]

function notifRetard(id: string, destinataireId: string, lu: boolean, date: string): StoredNotif {
  return {
    id,
    destinataireId,
    type: 'COTISATION_RETARD',
    titre: 'Cotisation en retard',
    message: "Votre cotisation n'est pas à jour.",
    entiteType: 'Membre',
    entiteId: 'm1',
    lu,
    dateCreation: new Date(date),
    dateLecture: lu ? new Date(date) : null,
  }
}

describe('executerVerificationRetards (§5)', () => {
  it('notifie SEULEMENT les membres NON_A_JOUR à compte lié (pas A_JOUR/PARTIEL/sans compte)', async () => {
    const { prisma, notifs } = buildNotificationsMock({ membres: MEMBRES, baremes })
    const res = await executerVerificationRetards(prisma, ANNEE, NOW)

    expect(res.verifies).toBe(3) // m4 (sans compte) n'est même pas chargé
    expect(res.notifies).toBe(1) // seul m1
    const creees = [...notifs.values()]
    expect(creees).toHaveLength(1)
    expect(creees[0]).toMatchObject({ destinataireId: 'u1', type: 'COTISATION_RETARD' })
  })

  it('anti-spam : pas de nouvelle notif si une COTISATION_RETARD non lue < 7 j existe déjà', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [MEMBRES[0]], // m1 NON_A_JOUR
      baremes,
      notifs: [notifRetard('old', 'u1', false, '2025-06-12T03:00:00Z')], // 3 jours avant NOW
    })
    const res = await executerVerificationRetards(prisma, ANNEE, NOW)
    expect(res.notifies).toBe(0)
    expect(notifs.size).toBe(1) // toujours la seule existante
  })

  it('doublon autorisé après 7 jours (la notif non lue existante est trop ancienne)', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [MEMBRES[0]],
      baremes,
      notifs: [notifRetard('vieille', 'u1', false, '2025-06-01T03:00:00Z')], // 14 jours avant NOW
    })
    const res = await executerVerificationRetards(prisma, ANNEE, NOW)
    expect(res.notifies).toBe(1) // rappel recréé
    expect(notifs.size).toBe(2)
  })

  it('une notif récente déjà LUE ne bloque pas (l’anti-spam ne vise que les non lues)', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [MEMBRES[0]],
      baremes,
      notifs: [notifRetard('lue', 'u1', true, '2025-06-12T03:00:00Z')], // récente mais LUE
    })
    const res = await executerVerificationRetards(prisma, ANNEE, NOW)
    expect(res.notifies).toBe(1)
    expect(notifs.size).toBe(2)
  })

  it('préférence COTISATION_RETARD désactivée → aucune notif même si NON_A_JOUR', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [MEMBRES[0]], // m1 NON_A_JOUR → u1
      baremes,
      utilisateurs: [{ id: 'u1', notificationsActives: { COTISATION_RETARD: false } }],
    })
    const res = await executerVerificationRetards(prisma, ANNEE, NOW)
    expect(res.notifies).toBe(0)
    expect(notifs.size).toBe(0)
  })

  it('indépendance des types : désactiver VERSEMENT_RECU n’empêche pas COTISATION_RETARD', async () => {
    const { prisma } = buildNotificationsMock({
      membres: [MEMBRES[0]],
      baremes,
      utilisateurs: [{ id: 'u1', notificationsActives: { VERSEMENT_RECU: false } }],
    })
    const res = await executerVerificationRetards(prisma, ANNEE, NOW)
    expect(res.notifies).toBe(1) // COTISATION_RETARD reste actif
  })
})
