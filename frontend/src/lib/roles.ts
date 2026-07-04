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
