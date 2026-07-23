import { SCOPED_MODELS } from '../lib/tenant-extension'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * EXPORT & SUPPRESSION DÉFINITIVE d'une organisation (bloquant GA 0.3).
 *
 * Réservé au SUPER_ADMIN, sur une organisation DÉJÀ SUSPENDUE (`actif = false`).
 *
 * ⚠️ TROIS RÈGLES NON NÉGOCIABLES — les enfreindre casse silencieusement, pas bruyamment :
 *
 * 1. **Chaque `deleteMany` porte `where.organisationId`.** Ces suppressions tournent sous
 *    `orgContext.runUnscoped` (le SUPER_ADMIN n'a pas d'organisation), donc l'extension
 *    d'isolation est NEUTRALISÉE : un `deleteMany({})` sur `Membre` effacerait TOUTES les
 *    organisations sans lever la moindre erreur. C'est le pire scénario du produit. On supprime
 *    la classe d'erreur au lieu de la tester : `supprimerModele()` construit le `where` lui-même,
 *    aucun appelant ne l'écrit à la main.
 *
 * 2. **Rester en `deleteMany`.** L'audit trail ne se déclenche pas ici — `OPERATIONS_AUDITEES`
 *    ne contient que `create`/`update`/`delete` unitaires, et `intercepterAudit` court-circuite
 *    déjà sous `unscoped`. Une boucle de `delete` unitaires réintroduirait le problème : l'audit
 *    tenterait d'écrire dans `AuditLog` pendant qu'on le vide, et `AuditLog.organisationId` étant
 *    NOT NULL, l'insertion planterait une fois l'`Organisation` supprimée.
 *
 * 3. **La base d'abord, les blobs ENSUITE** (cf. `collecterUrlsBlobs`). Contre-intuitif, justifié
 *    plus bas.
 *
 * La précondition « organisation suspendue » n'est PAS administrative, elle est TECHNIQUE :
 * `notification-scheduler.ts` ne balaie que les organisations `actif: true`, et `auth.route.ts`
 * refuse login et refresh sur un espace inactif. La suspension est donc ce qui garantit qu'aucun
 * écrivain concurrent n'entrera en conflit avec la transaction de purge. Relâcher cette
 * précondition rouvrirait cette porte sans que rien ne le signale.
 */

/**
 * ORDRE DE SUPPRESSION — figé, et non dérivé du schéma.
 *
 * Pourquoi figé : un tri topologique depuis le DMMF Prisma raterait `Document.entiteId`
 * (référence POLYMORPHE, invisible du graphe de relations) et omettrait purement et simplement
 * `RefreshToken` (ni FK, ni `organisationId` — rattaché à rien). Un ordre dérivé exigerait donc
 * des correctifs manuels, c'est-à-dire une constante, avec en plus l'imprévisibilité d'un tri.
 *
 * Deux tests gardent cette liste (`tests/organisation-purge-ordre.test.ts`) : une PARITÉ avec
 * `SCOPED_MODELS` (ajouter un modèle scopé sans l'inscrire ici casse le build) et une VALIDITÉ
 * TOPOLOGIQUE dérivée du DMMF (toute arête `Restrict` enfant→parent doit être respectée) — ce
 * dernier tombe tout seul si une future migration transforme un `SetNull` en `Restrict`.
 *
 * Seules les FK `Restrict` contraignent réellement l'ordre ; les `SetNull` et `Cascade` n'imposent
 * rien. `Membre.chefSousFamilleId` (auto-relation) est en `SetNull` — vérifié en base — donc un
 * `deleteMany` global sur `Membre` ne peut pas se casser sur l'ordre des lignes.
 */
export const ORDRE_SUPPRESSION: readonly string[] = [
  // — Chaîne financière : la plus contrainte (Recu →Restrict→ Versement →Restrict→ Contribution).
  'Recu',
  // AVANT `Versement`/`Contribution` : `Paiement` les référence en SetNull — l'ordre inverse
  // déclencherait un UPDATE ... SET …Id = NULL avant de tout supprimer. Il référence `Membre` en
  // Restrict, donc il DOIT précéder `Membre` (contrainte dure). Le placer ici satisfait les deux.
  'Paiement',
  'Versement',
  'Contribution',
  'EquilibrageDetail',
  'EquilibrageContribution',
  // — Modules feuilles : Restrict vers Membre ou Utilisateur, aucun entre eux.
  'DonCagnotte',
  'CagnotteEvenement',
  'Amende',
  'AffectationFonction',
  'FonctionFamiliale',
  'Resolution',
  'PointOrdreDuJour',
  'Reunion',
  'ConflitMembreConcerne',
  'Conflit',
  'CommemorationMembreConcerne',
  'Commemoration',
  'Document',
  'Notification',
  'Depense',
  'BaremeAnnuel',
  // Config paiement : ne référence que `Organisation` (Restrict) → n'importe où avant elle.
  'ParametrePaiement',
  // AVANT `Utilisateur` : `AuditLog.acteurId` est en SetNull, donc l'ordre inverse fonctionnerait
  // — mais PostgreSQL exécuterait alors un UPDATE ... SET acteurId = NULL par utilisateur
  // supprimé, sur la table la plus volumineuse du tenant. Gain gratuit.
  'AuditLog',
  // — Noyau. `Membre` avant `Utilisateur` pour la même raison (compteUtilisateurId en SetNull).
  // Supprimer les membres pose au passage `Organisation.chefMembreId` à NULL (SetNull).
  'Membre',
  'BrancheFamiliale',
  'Utilisateur',
  // NI FK, NI `organisationId` : invisible du graphe ET de SCOPED_MODELS. Aucun mécanisme du
  // projet ne rappellera son existence — c'est le modèle dont l'oubli laisse des sessions
  // vivantes après la purge. Ses lignes se retrouvent par `utilisateurId`, donc les ids DOIVENT
  // être collectés AVANT la suppression des `Utilisateur` (cf. `supprimerDonneesOrganisation`).
  'RefreshToken',
  // En dernier : toutes les FK entrantes ont disparu.
  'Organisation',
]

/** Modèles attendus dans `ORDRE_SUPPRESSION` = les scopés + les deux non scopés traités ici. */
export const MODELES_HORS_SCOPE = ['RefreshToken', 'Organisation'] as const

/** Levée quand la purge est demandée sur une organisation encore active. → 409. */
export class OrganisationNonSuspendueError extends Error {
  readonly organisationId: string
  constructor(organisationId: string) {
    super(`Organisation ${organisationId} encore active : suspendre avant de supprimer.`)
    this.name = 'OrganisationNonSuspendueError'
    this.organisationId = organisationId
  }
}

/** Une pièce jointe référencée par l'export — sans préfixe d'org sur les pathnames Blob, ce */
/** manifeste est la SEULE table de correspondance permettant de retrouver les fichiers. */
export interface FichierExporte {
  modele: 'Membre' | 'Recu' | 'Document'
  id: string
  champ: string
  url: string
  mime?: string | null
}

export interface ExportOrganisation {
  /** Version du FORMAT d'export (pas de l'application) : un consommateur doit pouvoir s'y fier. */
  version: 1
  genereLe: string
  organisation: Record<string, unknown> | null
  /** Une entrée par modèle scopé, dans l'ordre de `ORDRE_SUPPRESSION`. */
  donnees: Record<string, unknown[]>
  /** Nombre de lignes par modèle — permet de recouper avec les compteurs de suppression. */
  compteurs: Record<string, number>
  fichiers: FichierExporte[]
}

/** Convertit un nom de modèle Prisma en accesseur du client (`AuditLog` → `auditLog`). */
function accesseur(modele: string): string {
  return modele.charAt(0).toLowerCase() + modele.slice(1)
}

/**
 * Assemble l'export COMPLET d'une organisation. LECTURE SEULE.
 *
 * Doit tourner sous `orgContext.runUnscoped` (appelé par une route plateforme) : les modèles
 * scopés sont lus avec un `where.organisationId` explicite, comme pour la suppression.
 */
/**
 * Champs à OMETTRE modèle par modèle dans l'export. Un export quitte le périmètre de l'application
 * (téléchargé sur un poste, transmis, archivé) : rien de ce qui vaut identifiant ne doit y figurer,
 * même sous forme dérivée ou chiffrée.
 *
 *  - `Utilisateur.passwordHash` — hash argon2 (fuite corrigée le 2026-07-22).
 *  - `ParametrePaiement.identifiantsChiffres` — identifiants PSP de l'organisation. C'est un
 *    ciphertext AES-256-GCM, donc illisible sans `PSP_ENCRYPTION_KEY` — mais la clé est UNIQUE pour
 *    toute la plateforme : sa compromission transformerait rétroactivement chaque export archivé en
 *    identifiants de paiement exploitables. Et l'API refuse DÉJÀ de renvoyer ce secret
 *    (`lireConfigPaiement` n'expose que des méta) : l'export ne doit pas contredire cette règle.
 */
const CHAMPS_EXCLUS_EXPORT: Record<string, Record<string, true> | undefined> = {
  Utilisateur: { passwordHash: true },
  ParametrePaiement: { identifiantsChiffres: true },
}

export async function assemblerExportOrganisation(
  prisma: any,
  organisationId: string,
  maintenant: Date = new Date(),
): Promise<ExportOrganisation> {
  const organisation = await prisma.organisation.findUnique({ where: { id: organisationId } })

  const donnees: Record<string, unknown[]> = {}
  const compteurs: Record<string, number> = {}

  for (const modele of ORDRE_SUPPRESSION) {
    if (modele === 'Organisation' || modele === 'RefreshToken') continue
    // Champs SECRETS à ne jamais faire sortir dans un export téléchargeable — ni pour un
    // ADMIN/PRESIDENT tenant (self-service), ni pour le SUPER_ADMIN (export plateforme) : les deux
    // routes partagent cette fonction, donc l'exclusion se fait ICI, une seule fois pour les deux.
    const omit = CHAMPS_EXCLUS_EXPORT[modele]
    const lignes = await prisma[accesseur(modele)].findMany({ where: { organisationId }, omit })
    donnees[modele] = lignes
    compteurs[modele] = lignes.length
  }

  return {
    version: 1,
    genereLe: maintenant.toISOString(),
    organisation: organisation ?? null,
    donnees,
    compteurs,
    fichiers: construireManifeste(donnees),
  }
}

/** Extrait le manifeste des pièces jointes depuis les données déjà lues (aucune requête). */
function construireManifeste(donnees: Record<string, unknown[]>): FichierExporte[] {
  const fichiers: FichierExporte[] = []
  for (const m of (donnees['Membre'] ?? []) as any[]) {
    if (m.photoBlobUrl) {
      fichiers.push({ modele: 'Membre', id: m.id, champ: 'photoBlobUrl', url: m.photoBlobUrl, mime: m.photoMime ?? null })
    }
  }
  for (const r of (donnees['Recu'] ?? []) as any[]) {
    if (r.urlPdf) {
      fichiers.push({ modele: 'Recu', id: r.id, champ: 'urlPdf', url: r.urlPdf, mime: 'application/pdf' })
    }
  }
  for (const d of (donnees['Document'] ?? []) as any[]) {
    // `Document.url` est NOT NULL — pas de garde nécessaire, mais on reste défensif sur un export
    // reconstruit à la main.
    if (d.url) fichiers.push({ modele: 'Document', id: d.id, champ: 'url', url: d.url, mime: d.mimeType ?? null })
  }
  return fichiers
}

/**
 * URLs des blobs à purger — fonction PURE, prenant l'EXPORT en entrée et non Prisma.
 *
 * Ce choix de signature n'est pas cosmétique : il rend l'invariant de sécurité STRUCTUREL plutôt
 * que disciplinaire. Toute URL qu'on s'apprête à supprimer figure nécessairement dans l'export
 * qui vient d'être produit — donc récupérable si la purge des blobs échoue à mi-course.
 *
 * C'est ce qui autorise l'ordre « base d'abord, blobs ensuite ». L'ordre inverse serait pourtant
 * tentant (les pathnames Blob n'étant pas préfixés par organisation, la base est la seule source
 * d'appartenance tenant→fichier), mais il est strictement pire : s'il échoue APRÈS la purge des
 * blobs, on laisse un tenant VIVANT dont les `Document.url` pointent dans le vide — colonne NOT
 * NULL, donc aucun état « document sans fichier » n'existe, la corruption est irréparable.
 * Un blob orphelin n'est qu'un coût de stockage, et il reste rejouable depuis l'export.
 */
export function collecterUrlsBlobs(exp: ExportOrganisation): string[] {
  return [...new Set(exp.fichiers.map((f) => f.url).filter(Boolean))]
}

/** Client Blob minimal requis par la purge (mockable — cf. `services/document.service.ts`). */
export interface BlobPurgeClient {
  del(url: string): Promise<void>
}

/**
 * Supprime les blobs APRÈS le commit de la transaction. NE LÈVE JAMAIS : à ce stade les données
 * sont déjà parties, la transaction ne peut plus être annulée — faire échouer la requête ne
 * réparerait rien et masquerait une purge réussie. Les échecs sont RENVOYÉS pour rejeu manuel.
 */
export async function purgerBlobs(
  blob: BlobPurgeClient,
  urls: string[],
  concurrence = 10,
): Promise<{ supprimes: number; echecs: string[] }> {
  let supprimes = 0
  const echecs: string[] = []

  for (let i = 0; i < urls.length; i += concurrence) {
    const lot = urls.slice(i, i + concurrence)
    const resultats = await Promise.allSettled(lot.map((u) => blob.del(u)))
    resultats.forEach((r, idx) => {
      if (r.status === 'fulfilled') supprimes += 1
      else echecs.push(lot[idx] as string)
    })
  }
  return { supprimes, echecs }
}

/**
 * Supprime TOUTES les données de l'organisation, dans l'ordre de `ORDRE_SUPPRESSION`.
 *
 * `tx` = client de transaction Prisma, fourni par l'appelant (une seule `$transaction` pour les
 * 28 étapes : une purge interrompue laisserait un tenant à moitié effacé, non réparable par un
 * simple réessai). Renvoie le nombre de lignes supprimées par modèle — seule preuve exploitable
 * a posteriori que la purge a été complète.
 *
 * @param utilisateurIds ids collectés AVANT la suppression des `Utilisateur` (cf. `RefreshToken`,
 *                       qui n'a pas de FK et ne peut donc plus être retrouvé ensuite).
 */
export async function supprimerDonneesOrganisation(
  tx: any,
  organisationId: string,
  utilisateurIds: string[],
): Promise<Record<string, number>> {
  // Relecture de la précondition DANS la transaction : un `/reactiver` concurrent passerait
  // sinon entre le contrôle de la route et la purge.
  const org = await tx.organisation.findUnique({
    where: { id: organisationId },
    select: { id: true, actif: true },
  })
  if (!org) return {}
  if (org.actif !== false) throw new OrganisationNonSuspendueError(organisationId)

  const compteurs: Record<string, number> = {}

  for (const modele of ORDRE_SUPPRESSION) {
    if (modele === 'Organisation') {
      const r = await tx.organisation.delete({ where: { id: organisationId } })
      compteurs['Organisation'] = r ? 1 : 0
      continue
    }
    if (modele === 'RefreshToken') {
      // Pas d'`organisationId` sur ce modèle : on cible par utilisateur. Lots de 1000 pour éviter
      // un `IN (...)` démesuré sur une grosse organisation.
      let total = 0
      for (let i = 0; i < utilisateurIds.length; i += 1000) {
        const lot = utilisateurIds.slice(i, i + 1000)
        const r = await tx.refreshToken.deleteMany({ where: { utilisateurId: { in: lot } } })
        total += r.count
      }
      compteurs['RefreshToken'] = total
      continue
    }
    compteurs[modele] = await supprimerModele(tx, modele, organisationId)
  }

  return compteurs
}

/**
 * Suppression scopée d'UN modèle. Le `where.organisationId` est construit ICI et nulle part
 * ailleurs : aucun appelant n'a l'occasion de l'oublier (cf. règle 1 en tête de fichier).
 */
async function supprimerModele(tx: any, modele: string, organisationId: string): Promise<number> {
  const res = await tx[accesseur(modele)].deleteMany({ where: { organisationId } })
  return res.count
}

/** Les modèles attendus dans l'ordre = scopés ∪ {RefreshToken, Organisation}. Exposé pour le test. */
export function modelesAttendus(): string[] {
  return [...SCOPED_MODELS, ...MODELES_HORS_SCOPE]
}
