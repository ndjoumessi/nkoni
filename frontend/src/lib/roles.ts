/** Regroupements de rôles pour les autorisations d'affichage côté frontend (miroir §2). */

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

/** Rôles applicatifs + libellés FR (miroir de l'enum Role du backend). */
export const ROLES: { value: string; label: string }[] = [
  { value: 'ADMIN', label: 'Administrateur' },
  { value: 'PRESIDENT', label: 'Président' },
  { value: 'SECRETAIRE', label: 'Secrétaire' },
  { value: 'TRESORIERE', label: 'Trésorière' },
  { value: 'COMMISSAIRE_COMPTES', label: 'Commissaire aux comptes' },
  { value: 'GUIDE_RELIGIEUX', label: 'Guide religieux' },
  { value: 'MEMBRE_SIMPLE', label: 'Membre simple' },
]

/** Libellé FR d'un rôle (repli sur la valeur brute si inconnue). */
export function libelleRole(role: string | undefined): string {
  return ROLES.find((r) => r.value === role)?.label ?? role ?? '—'
}
