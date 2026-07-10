/** Regroupements de rôles pour les autorisations d'affichage côté frontend (miroir §2). */

/**
 * Rôle plateforme transverse (SaaS §2.3) : il n'appartient à aucune organisation et n'a
 * accès qu'à la console /super-admin (jamais aux pages tenant). Miroir du back.
 */
export function estSuperAdmin(role: string | undefined): boolean {
  return role === 'SUPER_ADMIN'
}

/**
 * Chemin d'accueil après connexion selon le rôle : un SUPER_ADMIN va à la console
 * plateforme, tout autre rôle au tableau de bord de son organisation.
 */
export function cheminApresConnexion(role: string | undefined): string {
  if (estSuperAdmin(role)) return '/super-admin'
  if (estMembreSimple(role)) return '/mon-espace'
  return '/dashboard'
}

/** Rôles autorisés à créer/modifier un membre (Créer/Modifier dans la matrice). */
const GESTION_MEMBRES = ['ADMIN', 'SECRETAIRE']

/** Peut créer/éditer une fiche membre. */
export function peutGererMembres(role: string | undefined): boolean {
  return role !== undefined && GESTION_MEMBRES.includes(role)
}

/** Un MEMBRE_SIMPLE ne voit que sa propre fiche (pas la liste). */
export function estMembreSimple(role: string | undefined): boolean {
  return role === 'MEMBRE_SIMPLE'
}

/** Rôles autorisés à désigner/retirer le chef de l'organisation (miroir du garde backend). */
const DESIGNATION_CHEF = ['ADMIN', 'PRESIDENT']

/** Peut désigner ou retirer le chef de l'organisation (PATCH /organisations/moi/chef). */
export function peutDesignerChef(role: string | undefined): boolean {
  return role !== undefined && DESIGNATION_CHEF.includes(role)
}

/** Rôles autorisés à saisir un versement et à ouvrir une année (Contribution/Versement CRUD §2). */
const GESTION_FINANCE = ['ADMIN', 'TRESORIERE']

/** Peut saisir un versement (POST /versements). */
export function peutSaisirVersement(role: string | undefined): boolean {
  return role !== undefined && GESTION_FINANCE.includes(role)
}

/** Peut ouvrir une année (POST /contributions/ouvrir-annee). */
export function peutOuvrirAnnee(role: string | undefined): boolean {
  return role !== undefined && GESTION_FINANCE.includes(role)
}

/** Rôles avec Lecture sur BaremeAnnuel (§2 : pas SECRETAIRE, pas MEMBRE_SIMPLE). */
const LECTURE_BAREME = ['ADMIN', 'PRESIDENT', 'TRESORIERE', 'COMMISSAIRE_COMPTES']

/** Peut consulter les barèmes annuels. */
export function peutVoirBareme(role: string | undefined): boolean {
  return role !== undefined && LECTURE_BAREME.includes(role)
}

/** Peut créer/modifier un barème annuel (ADMIN uniquement). */
export function peutGererBareme(role: string | undefined): boolean {
  return role === 'ADMIN'
}

/**
 * Rôles autorisés à consulter les rapports financiers (miroir de l'entité `Export`/read
 * côté serveur) : ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE_COMPTES. Pas SECRETAIRE ni
 * MEMBRE_SIMPLE ni GUIDE_RELIGIEUX.
 */
const LECTURE_RAPPORTS = ['ADMIN', 'PRESIDENT', 'TRESORIERE', 'COMMISSAIRE_COMPTES']

/** Trésorerie / dépenses (§5) — miroir des rôles backend (matrice Depense + workflow). */
const LECTURE_DEPENSE = ['ADMIN', 'PRESIDENT', 'TRESORIERE', 'COMMISSAIRE_COMPTES', 'SECRETAIRE']
const GESTION_DEPENSE = ['ADMIN', 'PRESIDENT', 'TRESORIERE']
const APPROBATION_DEPENSE = ['ADMIN', 'PRESIDENT', 'COMMISSAIRE_COMPTES']
const PAIEMENT_DEPENSE = ['ADMIN', 'PRESIDENT', 'TRESORIERE']

export function peutVoirTresorerie(role: string | undefined): boolean {
  return role !== undefined && LECTURE_DEPENSE.includes(role)
}
export function peutGererDepense(role: string | undefined): boolean {
  return role !== undefined && GESTION_DEPENSE.includes(role)
}
export function peutApprouverDepense(role: string | undefined): boolean {
  return role !== undefined && APPROBATION_DEPENSE.includes(role)
}
export function peutMarquerPayee(role: string | undefined): boolean {
  return role !== undefined && PAIEMENT_DEPENSE.includes(role)
}

/** Peut consulter la page Rapports financiers (nav + page). */
export function peutVoirRapports(role: string | undefined): boolean {
  return role !== undefined && LECTURE_RAPPORTS.includes(role)
}

/** Peut simuler/appliquer un équilibrage entre années (Equilibrage `create` §2 : ADMIN + TRESORIERE). */
export function peutEquilibrer(role: string | undefined): boolean {
  return role !== undefined && GESTION_FINANCE.includes(role)
}

/** Rôles avec Lecture sur Equilibrage (§2 : ADMIN, PRESIDENT, TRESORIERE, COMMISSAIRE). */
const LECTURE_EQUILIBRAGE = ['ADMIN', 'PRESIDENT', 'TRESORIERE', 'COMMISSAIRE_COMPTES']

/** Peut consulter l'historique des équilibrages d'un membre. */
export function peutVoirEquilibrage(role: string | undefined): boolean {
  return role !== undefined && LECTURE_EQUILIBRAGE.includes(role)
}

/** Peut gérer les comptes utilisateurs (CRUD complet §2 : ADMIN uniquement). */
export function peutGererUtilisateurs(role: string | undefined): boolean {
  return role === 'ADMIN'
}

/** Peut consulter le journal d'audit (V2 §5 : ADMIN uniquement). */
export function peutVoirAudit(role: string | undefined): boolean {
  return role === 'ADMIN'
}

/**
 * Peut voir les paramètres de l'organisation (§5, miroir de la matrice `Organisation:read`) :
 * tous les rôles de l'organisation SAUF MEMBRE_SIMPLE (le quota/forfait relève de la gestion).
 * Le SUPER_ADMIN n'accède jamais aux pages tenant.
 */
export function peutVoirParametres(role: string | undefined): boolean {
  return role !== undefined && role !== 'MEMBRE_SIMPLE' && role !== 'SUPER_ADMIN'
}

/* Réunions / Résolutions (V1.1 §5) — miroir de la matrice permissions.ts ------ */

/** Rôles avec Lecture sur les réunions (tous sauf GUIDE_RELIGIEUX). */
const LECTURE_REUNIONS = [
  'ADMIN',
  'PRESIDENT',
  'SECRETAIRE',
  'TRESORIERE',
  'COMMISSAIRE_COMPTES',
  'MEMBRE_SIMPLE',
]

/** Peut consulter les réunions & résolutions (lien de nav, listes, détail). */
export function peutVoirReunions(role: string | undefined): boolean {
  return role !== undefined && LECTURE_REUNIONS.includes(role)
}

/** Rôles avec create/update sur réunions & résolutions (édition, ordre du jour). */
const GESTION_REUNIONS = ['ADMIN', 'PRESIDENT', 'SECRETAIRE']

/** Peut créer/modifier une réunion, éditer l'ordre du jour, ajouter des résolutions. */
export function peutGererReunions(role: string | undefined): boolean {
  return role !== undefined && GESTION_REUNIONS.includes(role)
}

/** Peut supprimer une réunion / une résolution (delete réservé ADMIN, PRESIDENT). */
const SUPPRESSION_REUNIONS = ['ADMIN', 'PRESIDENT']
export function peutSupprimerReunion(role: string | undefined): boolean {
  return role !== undefined && SUPPRESSION_REUNIONS.includes(role)
}

/* Fonctions/organes + nominations (V1.1 §5) — miroir de la matrice permissions.ts */

/** Lecture des fonctions & de l'historique des nominations (tous sauf GUIDE_RELIGIEUX). */
const LECTURE_FONCTIONS = [
  'ADMIN',
  'PRESIDENT',
  'SECRETAIRE',
  'TRESORIERE',
  'COMMISSAIRE_COMPTES',
  'MEMBRE_SIMPLE',
]
export function peutVoirFonctions(role: string | undefined): boolean {
  return role !== undefined && LECTURE_FONCTIONS.includes(role)
}

/** create/update sur fonctions & affectations (créer une fonction, nommer un titulaire). */
const GESTION_FONCTIONS = ['ADMIN', 'PRESIDENT', 'SECRETAIRE']
export function peutGererFonctions(role: string | undefined): boolean {
  return role !== undefined && GESTION_FONCTIONS.includes(role)
}

/** delete d'une fonction (réservé ADMIN, PRESIDENT). */
const SUPPRESSION_FONCTIONS = ['ADMIN', 'PRESIDENT']
export function peutSupprimerFonction(role: string | undefined): boolean {
  return role !== undefined && SUPPRESSION_FONCTIONS.includes(role)
}

/* Conflits (V2 §4.4) — module sensible ---------------------------------------
 * NB : la visibilité fine (PUBLIC/BUREAU/CONFIDENTIEL) est appliquée CÔTÉ SERVEUR.
 * Ici on ne gouverne que l'accès au module (nav/page) et le droit de déclarer. */

/** Accès au module Conflits (nav + pages) : tous SAUF GUIDE_RELIGIEUX (exclu). */
const ACCES_CONFLITS = [
  'ADMIN',
  'PRESIDENT',
  'SECRETAIRE',
  'TRESORIERE',
  'COMMISSAIRE_COMPTES',
  'MEMBRE_SIMPLE',
]
export function peutVoirConflits(role: string | undefined): boolean {
  return role !== undefined && ACCES_CONFLITS.includes(role)
}

/** Peut déclarer un conflit : ADMIN, PRESIDENT, SECRETAIRE (bureau). */
const DECLARATION_CONFLITS = ['ADMIN', 'PRESIDENT', 'SECRETAIRE']
export function peutDeclarerConflit(role: string | undefined): boolean {
  return role !== undefined && DECLARATION_CONFLITS.includes(role)
}

/* Commémorations / cérémonies (V2) — domaine du GUIDE_RELIGIEUX --------------- */

/** Lecture des commémorations : tous les rôles authentifiés. */
export function peutVoirCommemorations(role: string | undefined): boolean {
  return role !== undefined
}

/** Créer/modifier une commémoration : GUIDE_RELIGIEUX, ADMIN, PRESIDENT, SECRETAIRE. */
const GESTION_COMMEMORATIONS = ['ADMIN', 'GUIDE_RELIGIEUX', 'PRESIDENT', 'SECRETAIRE']
export function peutGererCommemorations(role: string | undefined): boolean {
  return role !== undefined && GESTION_COMMEMORATIONS.includes(role)
}

/** Supprimer une commémoration : GUIDE_RELIGIEUX, ADMIN (domaine du guide). */
const SUPPRESSION_COMMEMORATIONS = ['ADMIN', 'GUIDE_RELIGIEUX']
export function peutSupprimerCommemoration(role: string | undefined): boolean {
  return role !== undefined && SUPPRESSION_COMMEMORATIONS.includes(role)
}

/* Documents (V2 §5) — miroir de peutGererDocumentPourEntite côté serveur -------
 * (le serveur reste l'autorité ; ce miroir ne sert qu'à afficher/masquer l'UI d'upload).
 * Règle : bureau pour tous les types, OU GUIDE_RELIGIEUX pour les COMMEMORATION. */
const BUREAU_DOCS = ['ADMIN', 'PRESIDENT', 'SECRETAIRE']
export function peutGererDocument(
  role: string | undefined,
  entiteType: 'MEMBRE' | 'REUNION' | 'CONFLIT' | 'COMMEMORATION',
): boolean {
  if (role === undefined) return false
  if (BUREAU_DOCS.includes(role)) return true
  return entiteType === 'COMMEMORATION' && role === 'GUIDE_RELIGIEUX'
}

/**
 * Rôles applicatifs assignables (miroir de l'enum Role du backend, hors SUPER_ADMIN transverse).
 * Les LIBELLÉS ne vivent plus ici : ils sont rendus par `t('utilisateurs.roles.<valeur>')` (§4 i18n).
 */
export const ROLES = [
  'ADMIN',
  'PRESIDENT',
  'SECRETAIRE',
  'TRESORIERE',
  'COMMISSAIRE_COMPTES',
  'GUIDE_RELIGIEUX',
  'MEMBRE_SIMPLE',
] as const
