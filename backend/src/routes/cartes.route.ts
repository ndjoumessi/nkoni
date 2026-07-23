import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { authenticate } from '../middlewares/authenticate'
import { requireRoles } from '../middlewares/permissions'
import { orgContext } from '../lib/org-context'
import { env } from '../lib/env'
import { signerStatutMembre, verifierStatutMembre } from '../lib/recu-lien'
import { calculerStatutsMembres, type MembreAvecStatut } from '../services/membreStatut.service'
import { genererCartesPdf, type DonneesCarte } from '../services/carte.service'
import { formatDateHeure, type Langue } from '../lib/i18n'
import { anneeCouranteApp } from '../lib/date-app'
import QRCode from 'qrcode'

/**
 * Cartes de membre (§4.7) — génération PDF (unité + lot) réservée au bureau, et page PUBLIQUE de
 * vérification de statut ouverte par le QR de la carte (signée, sans auth, isolation tenant
 * préservée). Aucun montant n'est jamais exposé sur la page publique.
 */

const ROLES_BUREAU = ['ADMIN', 'PRESIDENT', 'SECRETAIRE', 'TRESORIERE', 'COMMISSAIRE_COMPTES'] as const

/** URL absolue publique de vérification de statut, encodée dans le QR de la carte. */
function urlStatut(membreId: string): string {
  return `${env.PUBLIC_BASE_URL}/api/membres/${encodeURIComponent(membreId)}/statut-public?t=${signerStatutMembre(membreId)}`
}

function versDonneesCarte(m: MembreAvecStatut): DonneesCarte {
  return {
    id: m.id,
    nom: m.nom,
    prenom: m.prenom,
    branche: m.branche?.nom ?? null,
    anneeAdhesion: m.anneeAdhesion,
    qrUrl: urlStatut(m.id),
  }
}

/* -------------------------------------------------------------------------- */
/* Page publique de statut (rendu HTML autonome, mobile-friendly)             */
/* -------------------------------------------------------------------------- */

const STATUT_UI: Record<
  MembreAvecStatut['statutCotisation'],
  { fr: string; en: string; descFr: string; descEn: string; bg: string; fg: string; dot: string }
> = {
  A_JOUR: {
    fr: 'À jour', en: 'Up to date',
    descFr: 'Cotisations à jour', descEn: 'Contributions up to date',
    bg: '#e9f8f0', fg: '#006a48', dot: '#009b66',
  },
  PARTIEL: {
    fr: 'Partiel', en: 'Partial',
    descFr: 'Cotisations partiellement réglées', descEn: 'Contributions partially paid',
    bg: '#fbf3e2', fg: '#7a5a17', dot: '#c8891a',
  },
  NON_A_JOUR: {
    fr: 'Non à jour', en: 'Overdue',
    descFr: 'Cotisations en retard', descEn: 'Contributions overdue',
    bg: '#fbece9', fg: '#8a2f1c', dot: '#b0432a',
  },
}

/** Échappe le HTML (protège des données membre/organisation dans le rendu). */
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function pageStatut(o: {
  orgNom: string
  nom: string
  prenom: string
  statut: MembreAvecStatut['statutCotisation']
  annee: number
  branche: string | null
  anneeAdhesion: number
  estChef: boolean
  chefSurnom: string | null
  verifieLe: string
  langue: Langue
}): string {
  const en = o.langue === 'EN'
  const s = STATUT_UI[o.statut]
  const label = en ? s.en : s.fr
  const desc = en ? s.descEn : s.descFr
  const membreLbl = en ? 'Member' : 'Membre'
  const anneeLbl = en ? `Year ${o.annee}` : `Année ${o.annee}`
  const verifie = en ? 'Verified with' : 'Vérifié avec'
  const chefLbl = en ? 'Organisation head' : "Chef de l'organisation"
  const nom = `${esc(o.prenom)} ${esc(o.nom)}`.trim()

  // Ligne méta NON financière : branche (si présente) · ancienneté.
  const metaParts: string[] = []
  if (o.branche) metaParts.push(en ? `Branch: ${esc(o.branche)}` : `Branche : ${esc(o.branche)}`)
  metaParts.push(en ? `Member since ${o.anneeAdhesion}` : `Membre depuis ${o.anneeAdhesion}`)
  const meta = metaParts.join(' · ')

  const chefTexte = o.chefSurnom ? `${chefLbl} · ${esc(o.chefSurnom)}` : chefLbl
  const verifieLeLbl = en ? `Verified on ${esc(o.verifieLe)}` : `Vérifié le ${esc(o.verifieLe)}`

  return `<!doctype html><html lang="${en ? 'en' : 'fr'}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${esc(o.orgNom)} — ${nom}</title>
<style>
:root{color-scheme:light}
*{box-sizing:border-box;margin:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f4f6f6;color:#222b2b;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
.card{background:#fff;border-radius:18px;box-shadow:0 8px 40px -18px rgba(0,0,0,.25);max-width:380px;width:100%;padding:28px;text-align:center}
.org{color:#009b66;font-weight:700;font-size:15px;letter-spacing:.02em}
.rule{height:2px;background:#a28137;border-radius:2px;width:44px;margin:12px auto 18px}
.chef{display:inline-block;margin:0 0 10px;padding:5px 14px;border-radius:999px;background:#fbf3e2;color:#7a5a17;font-size:12px;font-weight:600;letter-spacing:.02em}
.membre-lbl{color:#636a6d;font-size:12px;text-transform:uppercase;letter-spacing:.12em}
.membre{font-size:22px;font-weight:700;margin-top:4px}
.meta{color:#636a6d;font-size:13px;margin-top:8px}
.badge{display:inline-flex;align-items:center;gap:9px;margin:22px 0 6px;padding:12px 22px;border-radius:999px;font-size:18px;font-weight:700;background:${s.bg};color:${s.fg}}
.dot{width:11px;height:11px;border-radius:50%;background:${s.dot}}
.desc{color:#636a6d;font-size:13px}
.annee{color:#9aa0a2;font-size:13px;margin-top:6px}
.verif{color:#9aa0a2;font-size:12px;margin-top:16px}
.foot{margin-top:6px;color:#9aa0a2;font-size:12px}
.foot b{color:#009b66}
</style></head><body>
<div class="card">
  <div class="org">${esc(o.orgNom)}</div>
  <div class="rule"></div>
  ${o.estChef ? `<div class="chef">★ ${chefTexte}</div>` : ''}
  <div class="membre-lbl">${membreLbl}</div>
  <div class="membre">${nom}</div>
  <div class="meta">${meta}</div>
  <div class="badge"><span class="dot"></span>${label}</div>
  <div class="desc">${desc}</div>
  <div class="annee">${anneeLbl}</div>
  <div class="verif">${verifieLeLbl}</div>
  <div class="foot">${verifie} <b>NKONI</b></div>
</div></body></html>`
}

export const cartesRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const bureau = requireRoles([...ROLES_BUREAU])

  // Charge les octets des photos (Blob PRIVÉ) pour un ensemble de membres → map id→Buffer.
  // Best-effort : un blob illisible est ignoré (la carte retombe sur les initiales).
  const chargerPhotos = async (ids: string[]): Promise<Map<string, Buffer>> => {
    const lignes = await app.prisma.membre.findMany({
      where: { id: { in: ids } },
      select: { id: true, photoBlobUrl: true },
    })
    const avecUrl = lignes.filter((l) => l.photoBlobUrl)
    const buffers = await Promise.all(
      avecUrl.map((l) => app.blob.lireContenu(l.photoBlobUrl as string).catch(() => null)),
    )
    const map = new Map<string, Buffer>()
    avecUrl.forEach((l, i) => {
      const b = buffers[i]
      if (b) map.set(l.id, b)
    })
    return map
  }

  const avecPhoto = (dc: DonneesCarte, photos: Map<string, Buffer>): DonneesCarte => {
    const p = photos.get(dc.id)
    return p ? { ...dc, photo: p } : dc
  }

  // GET /membres/cartes — PDF EN LOT (grille A4 découpable) de tous les membres non décédés.
  app.get('/membres/cartes', { preHandler: [authenticate, bureau] }, async (req, reply) => {
    const annee = anneeCouranteApp()
    const { items: membres } = await calculerStatutsMembres(app.prisma, annee)
    const actifs = membres.filter((m) => m.statut !== 'DECEDE')
    const photos = await chargerPhotos(actifs.map((m) => m.id))
    const org = await app.prisma.organisation.findUnique({
      where: { id: req.user.organisationId ?? '' },
      select: { nom: true, langueDefaut: true },
    })
    const cartes = actifs.map((m) => avecPhoto(versDonneesCarte(m), photos))
    const pdf = await genererCartesPdf(cartes, org?.nom ?? 'NKONI', org?.langueDefaut ?? 'FR')
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', 'inline; filename="cartes-membres.pdf"')
    return reply.send(pdf)
  })

  // GET /membres/:id/carte — PDF d'UNE carte (centrée A4).
  app.get<{ Params: { id: string } }>(
    '/membres/:id/carte',
    { preHandler: [authenticate, bureau] },
    async (req, reply) => {
      const annee = anneeCouranteApp()
      const { items: membres } = await calculerStatutsMembres(app.prisma, annee, { id: req.params.id })
      const m = membres[0]
      if (!m) return reply.code(404).send({ error: 'Not Found' })
      const photos = await chargerPhotos([m.id])
      const org = await app.prisma.organisation.findUnique({
        where: { id: req.user.organisationId ?? '' },
        select: { nom: true, langueDefaut: true },
      })
      const pdf = await genererCartesPdf([avecPhoto(versDonneesCarte(m), photos)], org?.nom ?? 'NKONI', org?.langueDefaut ?? 'FR')
      reply.header('Content-Type', 'application/pdf')
      reply.header('Content-Disposition', `inline; filename="carte-${m.nom}.pdf"`)
      return reply.send(pdf)
    },
  )

  // GET /moi/carte — SELF-SERVICE : le membre connecté télécharge SA propre carte (PDF centré A4).
  // Même génération que la route bureau, mais résolue depuis le compte (`req.user.sub`) et SANS garde
  // bureau — un membre a droit à sa carte. Scopé (le membre a son org en contexte). Pas de fiche
  // liée → 404 (aucune fuite d'existence).
  app.get('/moi/carte', { preHandler: [authenticate] }, async (req, reply) => {
    const membre = await app.prisma.membre.findFirst({
      where: { compteUtilisateurId: req.user.sub ?? '' },
      select: { id: true },
    })
    if (!membre) return reply.code(404).send({ error: 'Not Found' })
    const annee = anneeCouranteApp()
    const { items } = await calculerStatutsMembres(app.prisma, annee, { id: membre.id })
    const m = items[0]
    if (!m) return reply.code(404).send({ error: 'Not Found' })
    const photos = await chargerPhotos([m.id])
    const org = await app.prisma.organisation.findUnique({
      where: { id: req.user.organisationId ?? '' },
      select: { nom: true, langueDefaut: true },
    })
    const pdf = await genererCartesPdf(
      [avecPhoto(versDonneesCarte(m), photos)],
      org?.nom ?? 'NKONI',
      org?.langueDefaut ?? 'FR',
    )
    reply.header('Content-Type', 'application/pdf')
    reply.header('Content-Disposition', 'inline; filename="ma-carte-nkoni.pdf"')
    return reply.send(pdf)
  })

  // GET /moi/carte-apercu — SELF-SERVICE : mêmes données + MÊME QR signé que le PDF, mais en JSON,
  // pour un rendu VISUEL de la carte dans l'app (« voir sa carte »). Le PDF (/moi/carte) reste
  // l'export officiel imprimable. Aucun montant. Résolu depuis le compte, 404 sans fiche liée.
  app.get('/moi/carte-apercu', { preHandler: [authenticate] }, async (req, reply) => {
    const membre = await app.prisma.membre.findFirst({
      where: { compteUtilisateurId: req.user.sub ?? '' },
      select: { id: true, photoBlobUrl: true },
    })
    if (!membre) return reply.code(404).send({ error: 'Not Found' })
    const annee = anneeCouranteApp()
    const { items } = await calculerStatutsMembres(app.prisma, annee, { id: membre.id })
    const m = items[0]
    if (!m) return reply.code(404).send({ error: 'Not Found' })
    const org = await app.prisma.organisation.findUnique({
      where: { id: req.user.organisationId ?? '' },
      select: { nom: true, chefMembreId: true, chefSurnom: true },
    })
    // QR rendu côté serveur (lib `qrcode` déjà utilisée pour le PDF) → aucune dépendance front.
    const qrDataUrl = await QRCode.toDataURL(urlStatut(m.id), {
      margin: 0,
      width: 240,
      errorCorrectionLevel: 'M',
    })
    return {
      orgNom: org?.nom ?? 'NKONI',
      nom: m.nom,
      prenom: m.prenom,
      branche: m.branche?.nom ?? null,
      anneeAdhesion: m.anneeAdhesion,
      statutCotisation: m.statutCotisation,
      estChef: org?.chefMembreId === m.id,
      chefSurnom: org?.chefSurnom ?? null,
      aPhoto: membre.photoBlobUrl !== null,
      qrDataUrl,
    }
  })

  // GET /membres/:id/statut-public?t=<sig> — PAGE PUBLIQUE (QR de la carte). PAS d'auth : la
  // signature HMAC (liée à cet id membre) autorise. Isolation tenant préservée — l'org du membre
  // est résolue HORS scope (l'`await` DANS runUnscoped est OBLIGATOIRE, cf. §4.6), puis le statut
  // est calculé DANS le contexte de cette org. Aucun montant exposé.
  app.get<{ Params: { id: string }; Querystring: { t?: string } }>(
    '/membres/:id/statut-public',
    {
      schema: {
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['t'],
          properties: { t: { type: 'string' } },
        },
      } as const,
    },
    async (req, reply) => {
      const { id } = req.params
      if (!req.query.t || !verifierStatutMembre(id, req.query.t)) {
        return reply.code(404).send({ error: 'Not Found' })
      }
      const meta = await orgContext.runUnscoped(async () => {
        return await app.prisma.membre.findUnique({ where: { id }, select: { organisationId: true } })
      })
      if (!meta) return reply.code(404).send({ error: 'Not Found' })

      const html = await orgContext.run({ organisationId: meta.organisationId }, async () => {
        const annee = anneeCouranteApp()
        const { items: membres } = await calculerStatutsMembres(app.prisma, annee, { id })
        const m = membres[0]
        if (!m) return null
        const org = await app.prisma.organisation.findUnique({
          where: { id: meta.organisationId },
          select: { nom: true, langueDefaut: true, chefMembreId: true, chefSurnom: true },
        })
        const langue = org?.langueDefaut ?? 'FR'
        return pageStatut({
          orgNom: org?.nom ?? 'NKONI',
          nom: m.nom,
          prenom: m.prenom,
          statut: m.statutCotisation,
          annee,
          branche: m.branche?.nom ?? null,
          anneeAdhesion: m.anneeAdhesion,
          estChef: org?.chefMembreId === m.id,
          chefSurnom: org?.chefSurnom ?? null,
          verifieLe: formatDateHeure(new Date(), langue),
          langue,
        })
      })
      if (!html) return reply.code(404).send({ error: 'Not Found' })
      reply.header('Content-Type', 'text/html; charset=utf-8')
      return reply.send(html)
    },
  )
}

export default cartesRoutes
