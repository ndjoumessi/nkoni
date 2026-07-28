import { describe, it, expect } from 'vitest'
import {
  executerRappelsReunions,
  executerRappelsReunionsToutesOrgs,
} from '../src/services/notification-scheduler'
import {
  buildNotificationsMock,
  type StoredNotif,
  type MembreSeed,
} from './support/notifications-prisma-mock'

/**
 * Rappels de réunion (REUNION_RAPPEL, § vie associative) — via le point d'entrée manuel
 * `executerRappelsReunions` (now injecté → déterministe, indépendant du vrai cron).
 * Un rappel par (réunion, membre ACTIF à compte lié) pour toute réunion NON annulée à venir
 * dans les 48 h ; dédoublonné ; préférence respectée ; rendu dans la langue du destinataire.
 */

const NOW = new Date('2025-06-15T03:00:00Z')
const DEMAIN = new Date('2025-06-16T18:00:00Z') // dans la fenêtre 48 h
const DANS_5_JOURS = new Date('2025-06-20T18:00:00Z') // hors fenêtre

// Deux membres ACTIF à compte lié + un sans compte (jamais notifié).
const MEMBRES: MembreSeed[] = [
  { id: 'm1', compteUtilisateurId: 'u1' },
  { id: 'm2', compteUtilisateurId: 'u2' },
  { id: 'm3', compteUtilisateurId: null },
]

function rappelExistant(destinataireId: string, reunionId: string): StoredNotif {
  return {
    id: `rap-${destinataireId}-${reunionId}`,
    destinataireId,
    type: 'REUNION_RAPPEL',
    titre: 'Réunion à venir',
    message: 'Réunion le … à ….',
    entiteType: 'Reunion',
    entiteId: reunionId,
    lu: false,
    dateCreation: new Date('2025-06-15T03:00:00Z'),
    dateLecture: null,
  }
}

describe('executerRappelsReunions (§ vie associative)', () => {
  it('notifie chaque membre ACTIF à compte lié pour une réunion à venir dans les 48 h', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: MEMBRES,
      reunions: [{ id: 'r1', date: DEMAIN, lieu: 'Yaoundé' }],
    })
    const res = await executerRappelsReunions(prisma, NOW)
    expect(res.reunions).toBe(1)
    expect(res.notifies).toBe(2) // u1 + u2, pas m3 (sans compte)
    const creees = [...notifs.values()]
    expect(creees.every((n) => n.type === 'REUNION_RAPPEL' && n.entiteId === 'r1')).toBe(true)
    expect(new Set(creees.map((n) => n.destinataireId))).toEqual(new Set(['u1', 'u2']))
  })

  it('ignore une réunion hors de la fenêtre de 48 h', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: MEMBRES,
      reunions: [{ id: 'r1', date: DANS_5_JOURS, lieu: 'Douala' }],
    })
    const res = await executerRappelsReunions(prisma, NOW)
    expect(res.reunions).toBe(0)
    expect(notifs.size).toBe(0)
  })

  it('ignore une réunion ANNULEE', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: MEMBRES,
      reunions: [{ id: 'r1', date: DEMAIN, lieu: 'Yaoundé', statut: 'ANNULEE' }],
    })
    const res = await executerRappelsReunions(prisma, NOW)
    expect(res.reunions).toBe(0)
    expect(notifs.size).toBe(0)
  })

  it('dédoublonnage : une réunion déjà annoncée à un membre ne regénère pas de rappel', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: MEMBRES,
      reunions: [{ id: 'r1', date: DEMAIN, lieu: 'Yaoundé' }],
      notifs: [rappelExistant('u1', 'r1')], // u1 déjà prévenu
    })
    const res = await executerRappelsReunions(prisma, NOW)
    expect(res.notifies).toBe(1) // seul u2 reçoit un nouveau rappel
    expect(notifs.size).toBe(2) // l'existant + celui de u2
  })

  it('préférence REUNION_RAPPEL désactivée → aucun rappel pour ce membre', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [MEMBRES[0]], // m1 → u1
      reunions: [{ id: 'r1', date: DEMAIN, lieu: 'Yaoundé' }],
      utilisateurs: [{ id: 'u1', notificationsActives: { REUNION_RAPPEL: false } }],
    })
    const res = await executerRappelsReunions(prisma, NOW)
    expect(res.notifies).toBe(0)
    expect(notifs.size).toBe(0)
  })

  it('rendu dans la langue du membre DESTINATAIRE (EN) avec date et lieu interpolés', async () => {
    const { prisma, notifs } = buildNotificationsMock({
      membres: [MEMBRES[0]],
      reunions: [{ id: 'r1', date: DEMAIN, lieu: 'Yaoundé' }],
      utilisateurs: [{ id: 'u1', langue: 'EN' }],
    })
    const res = await executerRappelsReunions(prisma, NOW)
    expect(res.notifies).toBe(1)
    const n = [...notifs.values()][0]
    expect(n.titre).toBe('Upcoming meeting')
    expect(n.message).toContain('Yaoundé')
    expect(n.message.startsWith('Meeting on ')).toBe(true)
  })
})

describe('executerRappelsReunionsToutesOrgs (§2.2 — tâche système multi-org)', () => {
  it('itère sur les organisations actives et agrège les résultats par org', async () => {
    const { prisma } = buildNotificationsMock({
      membres: [MEMBRES[0]],
      reunions: [{ id: 'r1', date: DEMAIN, lieu: 'Yaoundé' }],
      organisations: [{ id: 'org-a' }, { id: 'org-b' }],
    })
    const res = await executerRappelsReunionsToutesOrgs(prisma, NOW)
    expect(res.map((r) => r.organisationId)).toEqual(['org-a', 'org-b'])
    // Le mock n'isole pas par org (une seule table en mémoire) — on vérifie surtout l'itération.
    expect(res.every((r) => r.reunions === 1)).toBe(true)
  })
})
