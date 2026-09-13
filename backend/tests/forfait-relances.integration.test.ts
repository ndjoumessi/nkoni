import 'dotenv/config'
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { prisma as prismaEtendu } from '../src/lib/prisma'
import { buildApp } from '../src/app'
import { hashPassword } from '../src/services/auth.service'
import { finDeJourneeApp } from '../src/lib/date-app'
import { executerRelancesForfaitToutesOrgs } from '../src/services/forfait-relances.service'

/**
 * F1 (fix-wave, spec 1.1 §4.1) — ÉCARTER une relance de forfait ne doit plus la RÉARMER la nuit
 * suivante. Avant le correctif, `supprimerNotification` faisait un `deleteMany` : le dédoublonnage
 * de `executerRelancesForfait` (`findFirst` sur destinataireId/type/entiteType/entiteId) ne
 * trouvait alors plus la ligne et recréait la notification à la prochaine tâche de nuit.
 *
 * Contre une vraie Postgres car le dédoublonnage traverse deux couches distinctes (le scheduler
 * ET la route DELETE authentifiée) et c'est précisément CETTE composition — pas une seule fonction
 * — que le défaut concernait. Un mock JS aurait pu être écrit pour prouver la forme du correctif
 * sans jamais reproduire le bug (cf. `forfait-relances.service.test.ts` pour la version mockée du
 * dédoublonnage seul).
 *
 * Exige `DATABASE_URL` (base JETABLE, JAMAIS `nkoni`) + `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`.
 */

const ORG = 'e6000000-0000-4000-8000-000000000061'
const ADMIN_EMAIL = 'admin@forfait-relances-it.local'
const ADMIN_PASSWORD = 'secret-relances-123'
const TRESORIERE_EMAIL = 'tresoriere@forfait-relances-it.local'

const base = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL'] }) })
let app: FastifyInstance
let jetonAdmin = ''
let adminId = ''

async function nettoyer(): Promise<void> {
  const comptes = await base.utilisateur.findMany({ where: { organisationId: ORG }, select: { id: true } })
  await base.notification.deleteMany({ where: { destinataireId: { in: comptes.map((c) => c.id) } } })
  await base.refreshToken.deleteMany({ where: { utilisateurId: { in: comptes.map((c) => c.id) } } })
  await base.utilisateur.deleteMany({ where: { organisationId: ORG } })
  await base.organisation.deleteMany({ where: { id: ORG } })
}

// Échéance à J-5 (fin de journée Africa/Douala) : ECHEANCE_PROCHE, étape J7 (jours <= 7).
const now = new Date('2026-09-14T10:00:00Z')
const echeanceJ5 = finDeJourneeApp(new Date(now.getTime() + 5 * 86_400_000))

beforeAll(async () => {
  await nettoyer()
  await base.organisation.create({
    data: { id: ORG, nom: 'Relances Forfait IT', devise: 'FCFA', forfait: 'PRO', forfaitExpireLe: echeanceJ5 },
  })
  const admin = await base.utilisateur.create({
    data: {
      organisationId: ORG,
      email: ADMIN_EMAIL,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      role: 'ADMIN',
      actif: true,
    },
  })
  adminId = admin.id
  await base.utilisateur.create({
    data: {
      organisationId: ORG,
      email: TRESORIERE_EMAIL,
      passwordHash: await hashPassword('secret-tresoriere-123'),
      role: 'TRESORIERE',
      actif: true,
    },
  })
  app = await buildApp({ logger: false })
  const login = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  })
  expect(login.statusCode).toBe(200)
  jetonAdmin = login.json().accessToken
  expect(jetonAdmin).toBeTruthy()
})

afterAll(async () => {
  await app.close()
  await nettoyer()
  await base.$disconnect()
})

const entetes = () => ({ authorization: `Bearer ${jetonAdmin}` })

describe('Relances de forfait — écarter une notification ne la réarme plus (F1)', () => {
  beforeEach(async () => {
    await base.notification.deleteMany({ where: { destinataireId: adminId } })
  })

  it('1→4 : relance créée pour l’ADMIN seul, écartée par DELETE, la 2e nuit ne recrée rien, la ligne survit masquée', async () => {
    // (1) Tâche de nuit : 1 notification FORFAIT_ECHEANCE pour l'ADMIN, aucune pour la TRESORIERE
    // (ROLES_RELANCE_FORFAIT = ADMIN/PRESIDENT uniquement).
    const premiereNuit = await executerRelancesForfaitToutesOrgs(prismaEtendu as any, now)
    const resultatOrg = premiereNuit.find((r) => r.organisationId === ORG)
    expect(resultatOrg?.etape).toBe('J7')
    expect(resultatOrg?.notifies).toBe(1)

    const notifsEnBase = await base.notification.findMany({ where: { destinataireId: adminId } })
    expect(notifsEnBase).toHaveLength(1)
    const notifId = notifsEnBase[0]!.id
    expect(notifsEnBase[0]!.type).toBe('FORFAIT_ECHEANCE')
    expect(notifsEnBase[0]!.masqueeLe).toBeNull()

    // (2) L'ADMIN écarte la notification via la route authentifiée → 204, plus listée.
    const suppression = await app.inject({
      method: 'DELETE',
      url: `/notifications/${notifId}`,
      headers: entetes(),
    })
    expect(suppression.statusCode).toBe(204)

    const liste = await app.inject({ method: 'GET', url: '/notifications', headers: entetes() })
    expect(liste.statusCode).toBe(200)
    expect(liste.json()).toEqual([])

    // (3) Relance : la tâche de nuit tourne à nouveau (même étape J7, échéance inchangée) → 0 créée.
    const secondeNuit = await executerRelancesForfaitToutesOrgs(prismaEtendu as any, now)
    const resultatOrg2 = secondeNuit.find((r) => r.organisationId === ORG)
    expect(resultatOrg2?.notifies).toBe(0)

    // (4) La ligne existe TOUJOURS en base, avec `masqueeLe` non nul (suppression LOGIQUE).
    const enBaseApres = await base.notification.findMany({ where: { destinataireId: adminId } })
    expect(enBaseApres).toHaveLength(1)
    expect(enBaseApres[0]!.id).toBe(notifId)
    expect(enBaseApres[0]!.masqueeLe).not.toBeNull()
  })
})
