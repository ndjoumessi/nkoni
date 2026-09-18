/**
 * Jeu de données de CHARGE (roadmap 2.4) — organisations fictives de taille paramétrable, écrites
 * directement en `createMany` (des dizaines de milliers de lignes : passer par les services prendrait
 * des minutes et n'apporterait rien à une mesure de lecture).
 *
 * Données FICTIVES : noms tirés d'une courte liste, courriels en `.test` (domaine réservé, RFC 2606),
 * aucun téléphone. Ne tourne QUE sur une base jetable (`exigerBaseJetable`).
 *
 * Forme d'une organisation de N membres, choisie pour ressembler à une vraie association après
 * plusieurs années d'usage plutôt qu'à un cas d'école :
 * - barèmes sur `ANNEES` années ; adhésions réparties sur cette fenêtre (≈ 5 années dues en moyenne) ;
 * - 6 % de membres INACTIFS (fin de contribution posée), 2 % DÉCÉDÉS ;
 * - une contribution par membre et par année due ; 0 à 3 versements par contribution, avec des
 *   années soldées, partielles et impayées ; cumuls `montantVerse`/`montantValorise` COHÉRENTS avec
 *   les versements (la réconciliation doit rendre zéro écart, sinon on mesurerait un état impossible).
 */
import { randomUUID } from 'node:crypto'
import argon2 from 'argon2'
import type { PrismaClient } from '../src/lib/prisma'
import { orgContext } from '../src/lib/org-context'
import { supprimerDonneesOrganisation } from '../src/services/organisation-purge.service'

export const MOT_DE_PASSE_CHARGE = 'Charge-Perf-2026!'
export const PREFIXE_ORG = 'Charge perf'
export const ANNEE_FIN = 2026
export const ANNEES = 10
const MONTANT_BAREME = 12_000
const LOT = 5_000

const NOMS = ['Abena', 'Mbarga', 'Ngo Bassa', 'Tchoupo', 'Essomba', 'Fotso', 'Kamdem', 'Nkolo', 'Owona', 'Tamba']
const PRENOMS = ['Aline', 'Brice', 'Carine', 'Didier', 'Estelle', 'Fabrice', 'Grace', 'Hervé', 'Inès', 'Joël']

/**
 * Refuse toute base dont le nom n'annonce pas une base jetable — même règle que
 * `retention.integration.test.ts`. Ce script ÉCRIT des dizaines de milliers de lignes et en SUPPRIME.
 */
export function exigerBaseJetable(url: string | undefined): string {
  const nom = url ? new URL(url).pathname.replace(/^\//, '') : ''
  if (!/_it_|test|perf/.test(nom)) {
    throw new Error(
      `Base « ${nom || '(aucune)'} » refusée : le jeu de charge n'écrit que sur une base jetable ` +
        '(nom contenant « _it_ », « test » ou « perf »).',
    )
  }
  return nom
}

/** Générateur pseudo-aléatoire DÉTERMINISTE (mulberry32) : deux exécutions mesurent le même jeu. */
function alea(graine: number): () => number {
  let a = graine
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

async function parLots<T>(lignes: T[], ecrire: (lot: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < lignes.length; i += LOT) await ecrire(lignes.slice(i, i + LOT))
}

export interface OrganisationDeCharge {
  organisationId: string
  taille: number
  admin: { email: string; motDePasse: string }
  membreSimple: { email: string; motDePasse: string; membreId: string }
  lignes: { membres: number; contributions: number; versements: number }
}

export async function genererOrganisationDeCharge(
  prisma: PrismaClient,
  taille: number,
): Promise<OrganisationDeCharge> {
  const hasard = alea(taille)
  const suffixe = randomUUID().slice(0, 8)
  const passwordHash = await argon2.hash(MOT_DE_PASSE_CHARGE)

  // `Organisation` n'est pas un modèle scopé : écriture sans contexte.
  const org = await prisma.organisation.create({
    data: { nom: `${PREFIXE_ORG} ${taille} (${suffixe})`, devise: 'FCFA', forfait: 'PRO' },
  })

  return orgContext.run({ organisationId: org.id }, async () => {
    const anneeDebut = ANNEE_FIN - ANNEES + 1
    await prisma.baremeAnnuel.createMany({
      data: Array.from({ length: ANNEES }, (_, i) => ({
        annee: anneeDebut + i,
        montantAttendu: MONTANT_BAREME,
      })) as never,
    })

    const branches = Array.from({ length: 10 }, (_, i) => ({ id: randomUUID(), nom: `Branche ${i + 1}` }))
    await prisma.brancheFamiliale.createMany({ data: branches as never })

    const membres: Record<string, unknown>[] = []
    const contributions: Record<string, unknown>[] = []
    const versements: Record<string, unknown>[] = []

    for (let i = 0; i < taille; i++) {
      const id = randomUUID()
      const anneeAdhesion = anneeDebut + Math.floor(hasard() * ANNEES)
      const tirage = hasard()
      const statut = tirage < 0.02 ? 'DECEDE' : tirage < 0.08 ? 'INACTIF' : 'ACTIF'
      const anneeFinContribution =
        statut === 'ACTIF' ? null : Math.min(ANNEE_FIN, anneeAdhesion + Math.floor(hasard() * 3))
      membres.push({
        id,
        nom: NOMS[i % NOMS.length],
        prenom: `${PRENOMS[Math.floor(hasard() * PRENOMS.length)]} ${i + 1}`,
        statut,
        anneeAdhesion,
        anneeFinContribution,
        brancheId: branches[i % branches.length]!.id,
        dateNaissance: new Date(Date.UTC(1950 + Math.floor(hasard() * 50), Math.floor(hasard() * 12), 1 + Math.floor(hasard() * 28))),
      })

      const derniere = anneeFinContribution ?? ANNEE_FIN
      for (let annee = anneeAdhesion; annee <= derniere; annee++) {
        const contributionId = randomUUID()
        // Profil de paiement : 55 % soldées, 25 % partielles, 20 % impayées.
        const p = hasard()
        const du = p < 0.55 ? MONTANT_BAREME : p < 0.8 ? Math.round(MONTANT_BAREME * (0.2 + hasard() * 0.6)) : 0
        let verse = 0
        const nbVersements = du === 0 ? 0 : 1 + Math.floor(hasard() * 3)
        for (let v = 0; v < nbVersements; v++) {
          const montant = v === nbVersements - 1 ? du - verse : Math.floor(du / nbVersements)
          if (montant <= 0) continue
          verse += montant
          versements.push({
            id: randomUUID(),
            contributionId,
            montant,
            mode: hasard() < 0.5 ? 'ESPECES' : 'MOBILE_MONEY',
            dateVersement: new Date(Date.UTC(annee, Math.floor(hasard() * 12), 1 + Math.floor(hasard() * 28))),
          })
        }
        contributions.push({
          id: contributionId,
          membreId: id,
          annee,
          montantAttendu: MONTANT_BAREME,
          montantVerse: verse,
          montantValorise: verse,
        })
      }
    }

    await parLots(membres, (lot) => prisma.membre.createMany({ data: lot as never }))
    await parLots(contributions, (lot) => prisma.contribution.createMany({ data: lot as never }))
    await parLots(versements, (lot) => prisma.versement.createMany({ data: lot as never }))

    const admin = { email: `admin-${suffixe}@charge.test`, motDePasse: MOT_DE_PASSE_CHARGE }
    const simple = { email: `membre-${suffixe}@charge.test`, motDePasse: MOT_DE_PASSE_CHARGE }
    await prisma.utilisateur.createMany({
      data: [
        { email: admin.email, passwordHash, role: 'ADMIN' },
        { email: simple.email, passwordHash, role: 'MEMBRE_SIMPLE' },
      ] as never,
    })
    const compteSimple = await prisma.utilisateur.findUniqueOrThrow({
      where: { email: simple.email },
      select: { id: true },
    })
    const premierActif = membres.find((m) => m['statut'] === 'ACTIF')!
    await prisma.membre.update({
      where: { id: premierActif['id'] as string },
      data: { compteUtilisateurId: compteSimple.id },
    })

    return {
      organisationId: org.id,
      taille,
      admin,
      membreSimple: { ...simple, membreId: premierActif['id'] as string },
      lignes: { membres: membres.length, contributions: contributions.length, versements: versements.length },
    }
  })
}

/** Supprime UNE organisation de charge par le service de purge RÉEL (suspension d'abord : la purge l'exige). */
export async function supprimerOrganisationDeCharge(prisma: PrismaClient, id: string): Promise<void> {
  await orgContext.runUnscoped(async () => {
    await prisma.organisation.update({ where: { id }, data: { actif: false } })
    const utilisateurs = await prisma.utilisateur.findMany({
      where: { organisationId: id },
      select: { id: true },
    })
    await prisma.$transaction(
      (tx) => supprimerDonneesOrganisation(tx, id, utilisateurs.map((u) => u.id)),
      { timeout: 120_000 },
    )
  })
}

/** Supprime les organisations de charge d'une exécution précédente (repérées par leur préfixe). */
export async function nettoyerOrganisationsDeCharge(prisma: PrismaClient): Promise<number> {
  const orgs = await orgContext.runUnscoped(async () =>
    prisma.organisation.findMany({ where: { nom: { startsWith: PREFIXE_ORG } }, select: { id: true } }),
  )
  for (const { id } of orgs) await supprimerOrganisationDeCharge(prisma, id)
  return orgs.length
}
