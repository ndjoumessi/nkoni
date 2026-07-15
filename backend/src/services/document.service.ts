import { Prisma } from '../generated/prisma/client'
import { PERMISSIONS, type Entite, type Role } from '../middlewares/permissions'
import { peutVoirConflit, type ConflitAcces } from './conflit.service'

/**
 * V2 (§5) — Documents / archives. MODULE SENSIBLE.
 *
 * RÈGLE DE SÉCURITÉ : la visibilité d'un Document HÉRITE TOUJOURS de celle de son entité
 * parente — jamais de règle propre au Document. `peutVoirDocument` est une fonction pure
 * qui DÉLÈGUE, selon `entiteType`, à la logique de visibilité déjà écrite de l'entité :
 *   - CONFLIT       → peutVoirConflit (réutilisé tel quel : un doc d'un conflit CONFIDENTIEL
 *                     n'est visible que par auteur/responsable/ADMIN, sans exception)
 *   - MEMBRE        → règle de lecture Membre (MEMBRE_SIMPLE limité à sa propre fiche)
 *   - REUNION       → règle de lecture Réunion (matrice)
 *   - COMMEMORATION → règle de lecture Commémoration (matrice)
 * On ne duplique JAMAIS la logique de confidentialité.
 *
 * STOCKAGE : Vercel Blob. L'URL brute du blob n'est JAMAIS renvoyée au client (elle
 * resterait accessible même à un tiers non autorisé) : le téléchargement passe par un
 * proxy authentifié (route GET /documents/:id/contenu) qui applique peutVoirDocument.
 */

export type EntiteDocument = 'MEMBRE' | 'REUNION' | 'CONFLIT' | 'COMMEMORATION'

/** Identité du demandeur (id = id Utilisateur = sub JWT). */
export interface DemandeurDocument {
  id?: string
  role: Role
}

/* -------------------------------------------------------------------------- */
/* Contraintes fichiers (validation serveur par magic bytes, pas l'extension) */
/* -------------------------------------------------------------------------- */

export const TAILLE_MAX_OCTETS = 10 * 1024 * 1024 // 10 Mo

/** mime-type autorisé → signatures (magic bytes) acceptées en tête de fichier. */
const SIGNATURES: Record<string, number[][]> = {
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]], // %PDF
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  // DOCX = conteneur ZIP (PK\x03\x04).
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    [0x50, 0x4b, 0x03, 0x04],
  ],
}
export const MIMES_AUTORISES = Object.keys(SIGNATURES)

function commencePar(buffer: Buffer, signature: number[]): boolean {
  if (buffer.length < signature.length) return false
  return signature.every((b, i) => buffer[i] === b)
}

/**
 * Valide un fichier téléversé : taille ≤ 10 Mo, mime-type autorisé, ET magic bytes
 * cohérents avec le mime déclaré (empêche de faire passer un fichier pour un autre type
 * via son extension / son Content-Type). Lève une erreur métier (→ 400) sinon.
 */
export function validerFichier(buffer: Buffer, mimetype: string): void {
  if (buffer.length > TAILLE_MAX_OCTETS) throw new FichierTropVolumineuxError()
  const signatures = SIGNATURES[mimetype]
  if (!signatures) throw new TypeFichierNonAutoriseError()
  if (!signatures.some((sig) => commencePar(buffer, sig))) throw new TypeFichierNonAutoriseError()
}

/**
 * True si les magic bytes du `buffer` correspondent au `mimetype` DÉCLARÉ (mime devant être connu).
 * Réutilisé par l'upload de photo membre pour ne pas se fier au seul `Content-Type` (falsifiable).
 */
export function signatureCoherente(buffer: Buffer, mimetype: string): boolean {
  const signatures = SIGNATURES[mimetype]
  return !!signatures && signatures.some((sig) => commencePar(buffer, sig))
}

/* -------------------------------------------------------------------------- */
/* RÈGLE D'ACCÈS — fonction pure (visibilité héritée du parent)               */
/* -------------------------------------------------------------------------- */

/** Lecture générique via la matrice §2 (source de vérité unique). */
function lectureMatrice(entite: Entite, role: Role): boolean {
  return PERMISSIONS[entite][role]?.includes('read') ?? false
}

/** Visibilité d'une fiche Membre : lecture matrice + MEMBRE_SIMPLE limité à SA fiche. */
export function peutVoirMembre(
  membre: { compteUtilisateurId: string | null },
  u: DemandeurDocument,
): boolean {
  if (!lectureMatrice('Membre', u.role)) return false
  if (u.role === 'MEMBRE_SIMPLE') {
    return u.id !== undefined && membre.compteUtilisateurId === u.id
  }
  return true
}

/** Parent chargé, structuré selon entiteType (null si l'entité parente n'existe pas). */
export type ParentDocument =
  | { entiteType: 'CONFLIT'; conflit: ConflitAcces }
  | { entiteType: 'MEMBRE'; membre: { compteUtilisateurId: string | null } }
  | { entiteType: 'REUNION' }
  | { entiteType: 'COMMEMORATION' }

/**
 * Le demandeur peut-il VOIR ce document ? Délègue strictement à la visibilité du parent.
 * `parent === null` (entité parente introuvable / orpheline) → refus (défaut fermé).
 */
export function peutVoirDocument(parent: ParentDocument | null, u: DemandeurDocument): boolean {
  if (!parent) return false
  switch (parent.entiteType) {
    case 'CONFLIT':
      // DemandeurDocument a la même forme que DemandeurConflit ({ id?, role }).
      return peutVoirConflit(parent.conflit, u)
    case 'MEMBRE':
      return peutVoirMembre(parent.membre, u)
    case 'REUNION':
      return lectureMatrice('Reunion', u.role)
    case 'COMMEMORATION':
      return lectureMatrice('Commemoration', u.role)
    default:
      return false
  }
}

/**
 * Peut-on TÉLÉVERSER/SUPPRIMER un document rattaché à ce type d'entité ?
 * Règle : le bureau (ADMIN/PRESIDENT/SECRETAIRE) peut pour TOUS les types (secrétariat/
 * archivage), OU tout rôle ayant un droit de MODIFICATION (`update`) sur l'entité parente.
 * Conséquences (auto-adaptatives à la matrice) :
 *   - GUIDE_RELIGIEUX → oui sur COMMEMORATION (il la gère), non ailleurs.
 *   - TRESORIERE → non (aucune modif sur ces 4 entités actuellement).
 * NB : la route exige EN PLUS de pouvoir VOIR le parent (on ne dépose pas sur l'invisible).
 */
const ENTITE_MAP: Record<EntiteDocument, Entite> = {
  MEMBRE: 'Membre',
  REUNION: 'Reunion',
  CONFLIT: 'Conflit',
  COMMEMORATION: 'Commemoration',
}
export function peutGererDocumentPourEntite(entiteType: EntiteDocument, role: Role): boolean {
  if (role === 'ADMIN' || role === 'PRESIDENT' || role === 'SECRETAIRE') return true
  return PERMISSIONS[ENTITE_MAP[entiteType]][role]?.includes('update') ?? false
}

/* -------------------------------------------------------------------------- */
/* Erreurs métier                                                             */
/* -------------------------------------------------------------------------- */

export class DocumentIntrouvableError extends Error {
  constructor() {
    super('Document introuvable.')
    this.name = 'DocumentIntrouvableError'
  }
}
export class AccesDocumentRefuseError extends Error {
  constructor() {
    super("Vous n'avez pas accès à ce document.")
    this.name = 'AccesDocumentRefuseError'
  }
}
export class EntiteParenteIntrouvableError extends Error {
  constructor() {
    super("L'entité à laquelle rattacher le document est introuvable.")
    this.name = 'EntiteParenteIntrouvableError'
  }
}
export class TypeFichierNonAutoriseError extends Error {
  constructor() {
    super('Type de fichier non autorisé (PDF, JPEG, PNG ou DOCX uniquement).')
    this.name = 'TypeFichierNonAutoriseError'
  }
}
export class FichierTropVolumineuxError extends Error {
  constructor() {
    super('Fichier trop volumineux (10 Mo maximum).')
    this.name = 'FichierTropVolumineuxError'
  }
}

/* -------------------------------------------------------------------------- */
/* Surfaces injectées (Prisma + client Blob), mockables                       */
/* -------------------------------------------------------------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DocumentPrisma {
  document: {
    findMany(args?: any): Promise<any[]>
    findUnique(args: any): Promise<any>
    create(args: any): Promise<any>
    delete(args: any): Promise<any>
  }
  conflit: { findUnique(args: any): Promise<any> }
  membre: { findUnique(args: any): Promise<any> }
  reunion: { findUnique(args: any): Promise<any> }
  commemoration: { findUnique(args: any): Promise<any> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Abstraction minimale du stockage Blob (Vercel en prod, mock en test). */
export interface BlobClient {
  put(pathname: string, data: Buffer, opts: { contentType: string }): Promise<{ url: string }>
  del(url: string): Promise<void>
  /**
   * Lit le CONTENU d'un blob par son URL (store PRIVÉ → authentifié par token, jamais d'URL
   * publique). Renvoie le buffer, ou `null` si le blob est indisponible (absent / non modifié).
   * Utilisé par le proxy de téléchargement authentifié (l'URL brute n'est jamais exposée).
   */
  lireContenu(url: string): Promise<Buffer | null>
}

/** Métadonnées exposées au client (SANS l'url brute du blob). */
const DOCUMENT_SELECT = {
  id: true,
  nom: true,
  description: true,
  typeFichier: true,
  tailleOctets: true,
  entiteType: true,
  entiteId: true,
  dateTeleversement: true,
  createdAt: true,
  televersePar: { select: { id: true, email: true, role: true } },
} as const

/* -------------------------------------------------------------------------- */
/* Chargement du parent polymorphe                                            */
/* -------------------------------------------------------------------------- */

/** Charge l'entité parente (champs strictement nécessaires à la décision d'accès). */
export async function chargerParent(
  prisma: DocumentPrisma,
  entiteType: EntiteDocument,
  entiteId: string,
): Promise<ParentDocument | null> {
  switch (entiteType) {
    case 'CONFLIT': {
      const c = await prisma.conflit.findUnique({
        where: { id: entiteId },
        select: { niveauConfidentialite: true, auteurId: true, responsableSuiviId: true },
      })
      return c ? { entiteType, conflit: c } : null
    }
    case 'MEMBRE': {
      const m = await prisma.membre.findUnique({
        where: { id: entiteId },
        select: { id: true, compteUtilisateurId: true },
      })
      return m ? { entiteType, membre: m } : null
    }
    case 'REUNION': {
      const r = await prisma.reunion.findUnique({ where: { id: entiteId }, select: { id: true } })
      return r ? { entiteType } : null
    }
    case 'COMMEMORATION': {
      const c = await prisma.commemoration.findUnique({
        where: { id: entiteId },
        select: { id: true },
      })
      return c ? { entiteType } : null
    }
    default:
      return null
  }
}

/* -------------------------------------------------------------------------- */
/* Téléversement                                                              */
/* -------------------------------------------------------------------------- */

export interface TeleverserDocumentParams {
  nom: string
  description?: string
  entiteType: EntiteDocument
  entiteId: string
  fichier: { buffer: Buffer; mimetype: string }
}

/**
 * Téléverse un document : valide le fichier, vérifie l'existence + l'accès au parent,
 * pousse le blob, puis crée l'enregistrement DB. Si l'écriture DB échoue APRÈS l'upload
 * blob, on nettoie le blob orphelin (best-effort + log).
 */
export async function televerserDocument(
  prisma: DocumentPrisma,
  blob: BlobClient,
  params: TeleverserDocumentParams,
  uploader: DemandeurDocument,
) {
  // 1. Fichier (taille + type par magic bytes).
  validerFichier(params.fichier.buffer, params.fichier.mimetype)

  // 2. Parent existant.
  const parent = await chargerParent(prisma, params.entiteType, params.entiteId)
  if (!parent) throw new EntiteParenteIntrouvableError()

  // 3. Autorisation : droit de gérer un doc de ce type d'entité ET pouvoir VOIR le parent
  //    (on ne dépose jamais un document sur une entité qu'on n'a pas le droit de voir).
  if (
    !peutGererDocumentPourEntite(params.entiteType, uploader.role) ||
    !peutVoirDocument(parent, uploader)
  ) {
    throw new AccesDocumentRefuseError()
  }
  if (!uploader.id) throw new AccesDocumentRefuseError()

  // 4. Upload blob (chemin unique, insensible au nom).
  const pathname = `documents/${params.entiteType}/${params.entiteId}/${randomId()}`
  const { url } = await blob.put(pathname, params.fichier.buffer, {
    contentType: params.fichier.mimetype,
  })

  // 5. Enregistrement DB ; en cas d'échec, on retire le blob orphelin.
  try {
    return await prisma.document.create({
      // Forme UNCHECKED (FK scalaires), comme TOUS les autres creates scopés : indispensable
      // pour que l'extension d'isolation puisse injecter le SCALAIRE `organisationId`. Une forme
      // relation (`televersePar: { connect }`) basculerait Prisma en input « checked », où
      // `organisationId` scalaire n'existe pas et la relation `organisation` devient obligatoire
      // → « Argument `organisation` is missing ». D'où `televerseParId` scalaire, pas `connect`.
      data: {
        nom: params.nom,
        ...(params.description !== undefined ? { description: params.description } : {}),
        url,
        typeFichier: params.fichier.mimetype,
        tailleOctets: params.fichier.buffer.length,
        entiteType: params.entiteType,
        entiteId: params.entiteId,
        televerseParId: uploader.id,
      } as Prisma.DocumentUncheckedCreateInput,
      select: DOCUMENT_SELECT,
    })
  } catch (err) {
    await blob.del(url).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[documents] blob orphelin après échec DB, suppression échouée :', url, e)
    })
    throw err
  }
}

/* -------------------------------------------------------------------------- */
/* Lecture (filtrée par la visibilité héritée)                               */
/* -------------------------------------------------------------------------- */

/**
 * Liste les documents VISIBLES par `u`, optionnellement filtrés par entité. On charge le
 * parent de chaque (entiteType, entiteId) — mis en cache — puis on filtre par
 * peutVoirDocument. Jamais renvoyé un document dont le parent n'est pas visible.
 */
export async function listerDocumentsVisibles(
  prisma: DocumentPrisma,
  u: DemandeurDocument,
  filtre?: { entiteType?: EntiteDocument; entiteId?: string },
) {
  const where: Record<string, unknown> = {}
  if (filtre?.entiteType) where['entiteType'] = filtre.entiteType
  if (filtre?.entiteId) where['entiteId'] = filtre.entiteId

  const docs = await prisma.document.findMany({
    where,
    orderBy: { dateTeleversement: 'desc' },
    select: DOCUMENT_SELECT,
  })

  const cache = new Map<string, ParentDocument | null>()
  const visibles: typeof docs = []
  for (const d of docs) {
    const cle = `${d.entiteType}:${d.entiteId}`
    if (!cache.has(cle)) cache.set(cle, await chargerParent(prisma, d.entiteType, d.entiteId))
    if (peutVoirDocument(cache.get(cle) ?? null, u)) visibles.push(d)
  }
  return visibles
}

/**
 * Récupère un document si `u` est autorisé à le voir (via son parent). Renvoie aussi
 * l'URL blob interne (pour le proxy de téléchargement). 404 si absent OU non autorisé
 * (comme les conflits : ne pas divulguer l'existence d'un document confidentiel).
 */
export async function getDocumentPourTelechargement(
  prisma: DocumentPrisma,
  id: string,
  u: DemandeurDocument,
): Promise<{ url: string; typeFichier: string; nom: string }> {
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { url: true, typeFichier: true, nom: true, entiteType: true, entiteId: true },
  })
  if (!doc) throw new DocumentIntrouvableError()
  const parent = await chargerParent(prisma, doc.entiteType, doc.entiteId)
  if (!peutVoirDocument(parent, u)) throw new DocumentIntrouvableError()
  return { url: doc.url, typeFichier: doc.typeFichier, nom: doc.nom }
}

/* -------------------------------------------------------------------------- */
/* Suppression (Blob + DB)                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Supprime un document : retire le fichier du Blob PUIS l'enregistrement DB. Autorisé
 * pour qui peut gérer les documents de ce type d'entité ET voir le parent ; l'ADMIN peut
 * toujours (nettoyage, y compris documents orphelins).
 */
export async function supprimerDocument(
  prisma: DocumentPrisma,
  blob: BlobClient,
  id: string,
  u: DemandeurDocument,
): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { url: true, entiteType: true, entiteId: true },
  })
  if (!doc) throw new DocumentIntrouvableError()

  if (u.role !== 'ADMIN') {
    const parent = await chargerParent(prisma, doc.entiteType, doc.entiteId)
    if (!peutGererDocumentPourEntite(doc.entiteType, u.role) || !peutVoirDocument(parent, u)) {
      throw new AccesDocumentRefuseError()
    }
  }

  // Blob d'abord : garantit que le fichier disparaît du stockage ; la DB suit.
  await blob.del(doc.url)
  await prisma.document.delete({ where: { id } })
}

/* -------------------------------------------------------------------------- */
/* Utilitaire                                                                 */
/* -------------------------------------------------------------------------- */

/** Identifiant opaque pour le chemin de blob (évite les collisions / fuite de nom). */
function randomId(): string {
  // crypto global (Node 20+) ; pas de dépendance externe.
  return globalThis.crypto.randomUUID()
}
