import PDFDocument from 'pdfkit'
import { type Langue, type Devise, formatDateHeure } from '../lib/i18n'
import { NK, enteteDocument, montantExport } from './export-style'
import type { BlobClient } from './document.service'

/**
 * PDF d'un Reçu de versement (§4.6) — RÉUTILISE le style premium « Menthe & Encre »
 * (`export-style.ts` : `enteteDocument`, palette assombrie impression, `montantExport` pour le
 * gotcha U+202F). PAS de Puppeteer (aucun chromium sur Railway). Le PDF est stocké dans Vercel
 * Blob en PRIVATE et n'est jamais servi par URL publique (proxy authentifié GET /recus/:id/pdf).
 *
 * Locale + devise du reçu = celles du DESTINATAIRE (le membre), résolues à l'appel.
 */

export interface DonneesRecuPdf {
  numero: string
  date: Date
  membreNom: string
  membrePrenom: string
  annee: number
  montant: number
  mode: string
}

function libelleMode(mode: string, langue: Langue): string {
  const fr: Record<string, string> = { ESPECES: 'Espèces', TIERS: 'Par un tiers', AUTRE: 'Autre' }
  const en: Record<string, string> = { ESPECES: 'Cash', TIERS: 'Third party', AUTRE: 'Other' }
  return (langue === 'EN' ? en : fr)[mode] ?? mode
}

/** Génère le PDF (Buffer) — fonction PURE, testable sans DB ni Blob. */
export function genererRecuPdf(
  donnees: DonneesRecuPdf,
  langue: Langue = 'FR',
  devise: Devise = 'FCFA',
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40 })
    const chunks: Buffer[] = []
    doc.on('data', (c: Buffer) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const GAUCHE = 40
    const DROITE = 555
    const EN = langue === 'EN'

    const yStart = enteteDocument(doc, {
      titre: 'NKONI',
      sousTitre: EN ? 'Payment receipt' : 'Reçu de versement',
      meta: `${EN ? 'No.' : 'N°'} ${donnees.numero}  ·  ${formatDateHeure(donnees.date, langue)}`,
      gauche: GAUCHE,
      droite: DROITE,
    })

    // Champs libellés (colonne label grise / valeur encre).
    const champs: [string, string][] = [
      [EN ? 'Member' : 'Membre', `${donnees.membreNom} ${donnees.membrePrenom}`],
      [EN ? 'Contribution year' : 'Année de contribution', String(donnees.annee)],
      [EN ? 'Payment method' : 'Mode de versement', libelleMode(donnees.mode, langue)],
    ]
    let y = yStart + 8
    for (const [l, v] of champs) {
      doc.fillColor(NK.gris).font('Helvetica').fontSize(11).text(l, GAUCHE, y)
      doc.fillColor(NK.encre).font('Helvetica-Bold').fontSize(11).text(v, GAUCHE + 190, y)
      y += 24
    }

    // Montant reçu — mis en évidence dans un bandeau menthe clair.
    y += 12
    doc.rect(GAUCHE, y, DROITE - GAUCHE, 48).fill(NK.mentheTint)
    doc.fillColor(NK.gris).font('Helvetica').fontSize(10).text(EN ? 'Amount received' : 'Montant reçu', GAUCHE + 14, y + 9)
    doc
      .fillColor(NK.mentheFonce)
      .font('Helvetica-Bold')
      .fontSize(18)
      .text(montantExport(donnees.montant, langue, devise), GAUCHE + 14, y + 22)
    y += 70

    doc.moveTo(GAUCHE, y).lineTo(DROITE, y).lineWidth(0.5).strokeColor(NK.filet).stroke()
    doc
      .fillColor(NK.gris)
      .font('Helvetica')
      .fontSize(9)
      .text(
        EN
          ? 'This receipt confirms the payment recorded above.'
          : 'Ce reçu atteste du versement enregistré ci-dessus.',
        GAUCHE,
        y + 10,
      )

    doc.end()
  })
}

/* -------------------------------------------------------------------------- */
/* Chargement + production idempotente (stockage Blob privé)                  */
/* -------------------------------------------------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RecuPdfPrisma {
  recu: {
    findUnique(args: any): Promise<any>
    update(args: any): Promise<any>
  }
  versement: { findUnique(args: any): Promise<any> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface ContexteRecuPdf {
  recuId: string
  donnees: DonneesRecuPdf
  /** compte Utilisateur lié au membre (pour le contrôle d'accès + la locale destinataire). */
  membreCompteId: string | null
  /** Téléphone du membre (pour l'envoi WhatsApp) — null si absent. */
  membreTelephone: string | null
  /** Email de contact du membre (pour le repli email §4.6) — null si absent. */
  membreEmail: string | null
  /**
   * `null` = reçu ACTIF. Renseigné ⇒ ANNULÉ : les routes de téléchargement et d'envoi WhatsApp
   * DOIVENT refuser. Sans ce champ, un reçu annulé restait servi tel quel — en particulier via le
   * lien public signé (`/recus/:id/pdf-public`), dont la signature HMAC n'expire pas et a déjà été
   * partagée sur WhatsApp : le membre aurait continué à télécharger indéfiniment un document
   * corrigé, ce qui vide l'annulation de son sens. Le PDF étant mis en cache sur Blob (production
   * idempotente), on ne peut pas non plus « tamponner ANNULÉ » a posteriori : on refuse.
   */
  annuleLe: Date | null
  urlPdf: string | null
}

/** Charge les données nécessaires au PDF + au contrôle d'accès (Recu → Versement → Membre). */
export async function chargerDonneesRecuPdf(
  prisma: RecuPdfPrisma,
  recuId: string,
): Promise<ContexteRecuPdf | null> {
  const recu = await prisma.recu.findUnique({
    where: { id: recuId },
    select: {
      id: true,
      numero: true,
      dateGeneration: true,
      versementId: true,
      urlPdf: true,
      annuleLe: true,
    },
  })
  if (!recu) return null
  // Reçu ORPHELIN (son versement a été supprimé) → forcément ANNULÉ, donc jamais servi de toute
  // façon. On sort AVANT le findUnique : `where: { id: null }` ne renvoie PAS null, il lève une
  // `PrismaClientValidationError` — hors de tout mappage typé, donc 500, y compris sur le lien
  // PUBLIC signé dont la garantie est un 404 UNIFORME (pas de fuite d'existence).
  if (!recu.versementId) return null
  const versement = await prisma.versement.findUnique({
    where: { id: recu.versementId },
    select: {
      montant: true,
      mode: true,
      contribution: {
        select: {
          annee: true,
          membre: {
            select: {
              nom: true,
              prenom: true,
              compteUtilisateurId: true,
              telephone: true,
              email: true,
            },
          },
        },
      },
    },
  })
  if (!versement) return null
  const membre = versement.contribution?.membre
  return {
    recuId: recu.id,
    donnees: {
      numero: recu.numero,
      date: recu.dateGeneration,
      membreNom: membre?.nom ?? '',
      membrePrenom: membre?.prenom ?? '',
      annee: versement.contribution?.annee ?? 0,
      montant: versement.montant,
      mode: versement.mode,
    },
    membreCompteId: membre?.compteUtilisateurId ?? null,
    membreTelephone: membre?.telephone ?? null,
    membreEmail: membre?.email ?? null,
    annuleLe: recu.annuleLe ?? null,
    urlPdf: recu.urlPdf,
  }
}

/**
 * Produit le PDF du reçu, IDEMPOTENT : si `urlPdf` existe et que le blob est lisible → le relit ;
 * sinon (re)génère, pousse dans Blob PRIVATE et renseigne `urlPdf`. Renvoie le buffer + l'URL.
 */
export async function produireRecuPdf(
  prisma: RecuPdfPrisma,
  blob: BlobClient,
  ctx: ContexteRecuPdf,
  langue: Langue,
  devise: Devise,
): Promise<{ buffer: Buffer; url: string }> {
  if (ctx.urlPdf) {
    const existant = await blob.lireContenu(ctx.urlPdf)
    if (existant) return { buffer: existant, url: ctx.urlPdf }
    // Blob perdu / illisible → on régénère ci-dessous.
  }
  const buffer = await genererRecuPdf(ctx.donnees, langue, devise)
  const pathname = `recus/${ctx.recuId}/${globalThis.crypto.randomUUID()}`
  const { url } = await blob.put(pathname, buffer, { contentType: 'application/pdf' })
  await prisma.recu.update({ where: { id: ctx.recuId }, data: { urlPdf: url } })
  return { buffer, url }
}
