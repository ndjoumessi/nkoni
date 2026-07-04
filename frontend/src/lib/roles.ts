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
