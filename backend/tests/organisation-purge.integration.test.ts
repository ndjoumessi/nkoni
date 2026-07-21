import 'dotenv/config'
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated/prisma/client'
import { prisma as prismaEtendu } from '../src/lib/prisma'
import { orgContext } from '../src/lib/org-context'
import { SCOPED_MODELS } from '../src/lib/tenant-extension'
import {
  ORDRE_SUPPRESSION,
  assemblerExportOrganisation,
  supprimerDonneesOrganisation,
} from '../src/services/organisation-purge.service'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * PURGE D'ORGANISATION contre une VRAIE Postgres (bloquant GA 0.3).
 *
 * Pourquoi ce test ne peut pas être mocké : l'ordre de suppression n'est contraint que par les
 * CLÉS ÉTRANGÈRES, qu'un `tx` mocké n'a pas. Les tests unitaires prouvent que le service
 * interroge le bon ensemble dans le bon ordre ; SEUL celui-ci prouve que la base l'accepte.
 * Leçon directe du défaut de production du 2026-07-21 (garde de suppression validée par un mock,
 * refusée par la FK).
 *
 * Deux organisations : A est purgée, B doit rester INTACTE, modèle par modèle — c'est
 * l'assertion d'isolation, et la purge tournant sous `runUnscoped` (extension neutralisée), rien
 * d'autre ne protège B qu'un `where.organisationId` correct.
 *
 * Exige `DATABASE_URL` + `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`.
 */

/**
 * ⚠️ Identifiants d'organisation PROPRES à ce fichier. Les tests d'intégration partagent UNE
 * base : réutiliser l'id d'un autre fichier fait que son `nettoyer()` supprime nos organisations
 * en cours de route. Le symptôme est trompeur — `Utilisateur.organisationId` passe à NULL par
 * SetNull, ce qui viole le CHECK `Utilisateur_superadmin_org_check` (seul un SUPER_ADMIN peut
 * avoir une org nulle) et fait échouer le nettoyage de l'AUTRE fichier, pas celui-ci.
 * Ids déjà pris ailleurs : …d1, …e1, …e2, …f1, …f2.
 */
const A = 'c0000000-0000-4000-8000-00000000a001'
const B = 'c0000000-0000-4000-8000-00000000a002'

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] })
/** Client NON étendu : setup et assertions doivent voir la base telle qu'elle est. */
const base = new PrismaClient({ adapter })

/** Accesseur Prisma d'un nom de modèle (`AuditLog` → `auditLog`). */
const acc = (m: string) => m.charAt(0).toLowerCase() + m.slice(1)

async function nettoyer(): Promise<void> {
  for (const org of [A, B]) {
    for (const modele of ORDRE_SUPPRESSION) {
      if (modele === 'Organisation' || modele === 'RefreshToken') continue
      await (base as any)[acc(modele)].deleteMany({ where: { organisationId: org } })
    }
    await base.organisation.deleteMany({ where: { id: org } })
  }
  await base.refreshToken.deleteMany({ where: { familleId: { in: [`fam-${A}`, `fam-${B}`] } } })
}

/**
 * Peuple UNE organisation avec au moins une ligne de CHACUN des 26 modèles scopés.
 * C'est le cœur du dispositif : ne peupler que les modèles « importants » laisserait justement
 * les FK non exercées passer inaperçues. Un test de parité (plus bas) échoue si un modèle manque.
 */
async function semer(orgId: string, actif: boolean): Promise<void> {
  await base.organisation.create({
    data: { id: orgId, nom: `Org ${orgId.slice(-2)}`, devise: 'FCFA', actif },
  })
  const u = await base.utilisateur.create({
    data: { organisationId: orgId, email: `purge-${orgId}@test.local`, passwordHash: 'x', role: 'ADMIN' },
  })
  const br = await base.brancheFamiliale.create({ data: { organisationId: orgId, nom: 'Branche' } })
  const m = await base.membre.create({
    data: {
      organisationId: orgId, nom: 'Djoumessi', prenom: 'Romel', anneeAdhesion: 2024,
      brancheId: br.id, compteUtilisateurId: u.id,
      // Pièce jointe : alimente le manifeste de l'export.
      photoBlobUrl: `https://blob.test/${orgId}/photo`, photoMime: 'image/png',
    },
  })
  // Chef de l'organisation : FK Organisation → Membre en SetNull, exercée par la purge.
  await base.organisation.update({ where: { id: orgId }, data: { chefMembreId: m.id } })

  await base.baremeAnnuel.create({ data: { organisationId: orgId, annee: 2025, montantAttendu: 12000 } })
  const c = await base.contribution.create({
    data: { organisationId: orgId, membreId: m.id, annee: 2025, montantAttendu: 12000 },
  })
  const v = await base.versement.create({
    data: {
      organisationId: orgId, contributionId: c.id, montant: 2000,
      dateVersement: new Date('2025-06-01T00:00:00Z'), mode: 'ESPECES',
    },
  })
  await base.recu.create({
    data: {
      organisationId: orgId, versementId: v.id, numero: `NKONI-2025-${orgId.slice(-3)}`,
      genereParId: u.id, urlPdf: `https://blob.test/${orgId}/recu.pdf`,
    },
  })
  const eq = await base.equilibrageContribution.create({
    data: {
      organisationId: orgId, membreId: m.id, anneeDebut: 2024, anneeFin: 2025,
      totalPeriode: 24000, auteurId: u.id,
    },
  })
  await base.equilibrageDetail.create({
    data: { organisationId: orgId, equilibrageId: eq.id, annee: 2025, montantAvant: 12000, montantApres: 12000 },
  })

  const reu = await base.reunion.create({
    data: { organisationId: orgId, date: new Date('2025-03-01T00:00:00Z'), lieu: 'Douala' },
  })
  await base.pointOrdreDuJour.create({
    data: { organisationId: orgId, reunionId: reu.id, titre: 'Point 1', ordre: 1 },
  })
  await base.resolution.create({
    data: { organisationId: orgId, reunionId: reu.id, texte: 'Résolution' },
  })
  const f = await base.fonctionFamiliale.create({ data: { organisationId: orgId, nom: 'Trésorier' } })
  await base.affectationFonction.create({
    data: { organisationId: orgId, fonctionId: f.id, membreId: m.id, dateDebut: new Date('2025-01-01T00:00:00Z') },
  })
  await base.evenementFamilial.create({ data: { organisationId: orgId } })

  const cf = await base.conflit.create({
    data: {
      organisationId: orgId, titre: 'Conflit', description: 'desc',
      niveauConfidentialite: 'BUREAU', auteurId: u.id,
    },
  })
  await base.conflitMembreConcerne.create({
    data: { organisationId: orgId, conflitId: cf.id, membreId: m.id },
  })
  const com = await base.commemoration.create({
    data: { organisationId: orgId, titre: 'Commémoration', date: new Date('2025-11-01T00:00:00Z') },
  })
  await base.commemorationMembreConcerne.create({
    data: { organisationId: orgId, commemorationId: com.id, membreId: m.id },
  })
  await base.document.create({
    data: {
      organisationId: orgId, nom: 'piece.pdf', url: `https://blob.test/${orgId}/doc.pdf`,
      typeFichier: 'application/pdf', tailleOctets: 1024, entiteType: 'MEMBRE',
      entiteId: m.id, televerseParId: u.id,
    },
  })
  await base.auditLog.create({
    data: { organisationId: orgId, entiteType: 'Membre', entiteId: m.id, action: 'CREATE', acteurId: u.id },
  })
  await base.notification.create({
    data: {
      // `destinataireId` pointe vers Utilisateur (et non Membre) — relation en Cascade.
      organisationId: orgId, destinataireId: u.id, type: 'VERSEMENT_RECU',
      titre: 'Reçu', message: 'Versement enregistré',
    },
  })
  await base.depense.create({
    data: {
      organisationId: orgId, montant: 5000, date: new Date('2025-05-01T00:00:00Z'),
      description: 'Achat', saisiParId: u.id,
    },
  })
  const cag = await base.cagnotteEvenement.create({
    data: { organisationId: orgId, titre: 'Cagnotte', creeParId: u.id },
  })
  await base.donCagnotte.create({
    data: {
      organisationId: orgId, cagnotteId: cag.id, membreId: m.id, montant: 1000,
      date: new Date('2025-07-01T00:00:00Z'), saisiParId: u.id,
    },
  })
  await base.amende.create({
    data: {
      organisationId: orgId, membreId: m.id, motif: 'Retard', montant: 500,
      dateAmende: new Date('2025-08-01T00:00:00Z'), creeParId: u.id,
    },
  })
  // NON scopé, sans FK : c'est le modèle que rien ne rappelle.
  await base.refreshToken.create({
    data: {
      jti: `jti-${orgId}`, utilisateurId: u.id, familleId: `fam-${orgId}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  })
}

/** Compte les lignes de chaque modèle scopé pour une organisation. */
async function compter(orgId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const modele of SCOPED_MODELS) {
    out[modele] = await (base as any)[acc(modele)].count({ where: { organisationId: orgId } })
  }
  return out
}

beforeEach(async () => {
  await nettoyer()
  await semer(A, false) // A est SUSPENDUE : précondition de la purge
  await semer(B, true)
})

afterAll(async () => {
  await nettoyer()
  await base.$disconnect()
})

describe('fixture — couverture des 26 modèles', () => {
  it('peuple au moins une ligne de CHAQUE modèle scopé (sinon le test ne prouve rien)', async () => {
    const c = await compter(A)
    const vides = Object.entries(c).filter(([, n]) => n === 0).map(([m]) => m)
    expect(vides, `modèles non peuplés par le fixture : ${vides.join(', ')}`).toEqual([])
  })
})

describe('purge complète contre une vraie base', () => {
  it('supprime TOUT pour l’org A, sans violer aucune clé étrangère', async () => {
    const utilisateurIds = (await base.utilisateur.findMany({ where: { organisationId: A }, select: { id: true } }))
      .map((u) => u.id)

    // Le flux réel : runUnscoped enveloppant la transaction. Si la propagation AsyncLocalStorage
    // ne tenait pas à travers `$transaction`, l'extension fail-close lèverait TenantContextError
    // dès le premier deleteMany — c'est le test canari du plan.
    const compteurs = await orgContext.runUnscoped(async () =>
      await (prismaEtendu as any).$transaction(
        (tx: any) => supprimerDonneesOrganisation(tx, A, utilisateurIds),
        { timeout: 120_000, maxWait: 15_000 },
      ),
    )

    expect(compteurs['Organisation']).toBe(1)
    const restant = await compter(A)
    const nonVides = Object.entries(restant).filter(([, n]) => n > 0).map(([m]) => m)
    expect(nonVides, `lignes résiduelles : ${nonVides.join(', ')}`).toEqual([])
    expect(await base.organisation.findUnique({ where: { id: A } })).toBeNull()
  })

  it('purge les RefreshToken de l’org A (le modèle sans FK ni organisationId)', async () => {
    const utilisateurIds = (await base.utilisateur.findMany({ where: { organisationId: A }, select: { id: true } }))
      .map((u) => u.id)
    await orgContext.runUnscoped(async () =>
      await (prismaEtendu as any).$transaction(
        (tx: any) => supprimerDonneesOrganisation(tx, A, utilisateurIds),
        { timeout: 120_000 },
      ),
    )
    expect(await base.refreshToken.count({ where: { familleId: `fam-${A}` } })).toBe(0)
    // Ceux de B survivent : la purge ne déborde pas.
    expect(await base.refreshToken.count({ where: { familleId: `fam-${B}` } })).toBe(1)
  })

  it('laisse l’organisation B INTACTE, modèle par modèle', async () => {
    const avant = await compter(B)
    const utilisateurIds = (await base.utilisateur.findMany({ where: { organisationId: A }, select: { id: true } }))
      .map((u) => u.id)
    await orgContext.runUnscoped(async () =>
      await (prismaEtendu as any).$transaction(
        (tx: any) => supprimerDonneesOrganisation(tx, A, utilisateurIds),
        { timeout: 120_000 },
      ),
    )
    expect(await compter(B)).toEqual(avant)
    expect(await base.organisation.findUnique({ where: { id: B } })).not.toBeNull()
  })
})

describe('export', () => {
  it('contient toutes les lignes et le manifeste des pièces jointes', async () => {
    const exp = await orgContext.runUnscoped(async () =>
      await assemblerExportOrganisation(prismaEtendu as any, A),
    )
    expect(exp.version).toBe(1)
    expect(exp.organisation).toMatchObject({ id: A })
    for (const modele of SCOPED_MODELS) {
      expect(exp.compteurs[modele], `${modele} absent de l'export`).toBeGreaterThan(0)
    }
    // Manifeste : photo de membre + PDF de reçu + document.
    const urls = exp.fichiers.map((f) => f.url).sort()
    expect(urls).toEqual([
      `https://blob.test/${A}/doc.pdf`,
      `https://blob.test/${A}/photo`,
      `https://blob.test/${A}/recu.pdf`,
    ])
  })
})

describe('sécurité de la purge', () => {
  it('REFUSE de purger une organisation encore ACTIVE (B)', async () => {
    await expect(
      orgContext.runUnscoped(async () =>
        await (prismaEtendu as any).$transaction(
          (tx: any) => supprimerDonneesOrganisation(tx, B, []),
          { timeout: 120_000 },
        ),
      ),
    ).rejects.toThrow(/encore active/i)
    // Rien n'a bougé.
    expect(await base.organisation.findUnique({ where: { id: B } })).not.toBeNull()
  })

  it('ROLLBACK total si la transaction échoue en cours de route', async () => {
    const avant = await compter(A)
    const utilisateurIds = (await base.utilisateur.findMany({ where: { organisationId: A }, select: { id: true } }))
      .map((u) => u.id)

    await expect(
      orgContext.runUnscoped(async () =>
        await (prismaEtendu as any).$transaction(async (tx: any) => {
          await supprimerDonneesOrganisation(tx, A, utilisateurIds)
          // Panne APRÈS la purge, avant le commit.
          throw new Error('panne simulée')
        }, { timeout: 120_000 }),
      ),
    ).rejects.toThrow('panne simulée')

    // Toutes les lignes sont revenues : la purge est atomique.
    expect(await compter(A)).toEqual(avant)
    expect(await base.organisation.findUnique({ where: { id: A } })).not.toBeNull()
  })
})
