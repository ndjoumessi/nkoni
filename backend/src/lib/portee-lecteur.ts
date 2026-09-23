import { ErreurMetier } from './erreur-metier'
import type { CleMessage } from '../locales/fr'

/**
 * PORTÉE DE LECTURE d'un utilisateur — « ce membre est-il le mien ? », en un seul endroit.
 *
 * L'invariant est simple à dire : **un MEMBRE_SIMPLE ne voit que sa propre fiche et ce qui s'y
 * rattache ; tout autre rôle voit son organisation.** Il était écrit sous cinq formes dans une
 * vingtaine de handlers — un `where` plat, le même imbriqué sous `membre`, une comparaison
 * après chargement — et surtout avec DEUX refus différents.
 *
 * **Le refus est 404, et c'est un correctif, pas une harmonisation cosmétique.** Trois routes
 * rendaient 403 (`/membres/:id`, `POST /versements/:id/recu`, `/membres/:id/statut`), deux
 * rendaient 404 (`/membres/:id/releve`, `/membres/:id/photo`). Un 403 dit « cette ressource
 * existe, mais pas pour toi » : comme un MEMBRE_SIMPLE ne voit que sa propre fiche dans les
 * listes, il pouvait ÉNUMÉRER les identifiants des autres membres en distinguant 403 de 404.
 * Le 404 uniforme est la règle déjà écrite partout ailleurs dans ce dépôt (liens publics signés,
 * mutations cross-org via P2025, reçus d'autrui).
 *
 * Ce module rend des FRAGMENTS de `where`, pas des requêtes : les handlers gardent leur `select`
 * et leur tri, et cessent seulement de réencoder la règle d'accès.
 */

/** Ce que le module a besoin de savoir d'un appelant — pas tout `req.user`. */
export interface Lecteur {
  role: string
  sub?: string | undefined
}

/**
 * Le lecteur est-il borné à sa propre fiche ?
 *
 * Seul MEMBRE_SIMPLE l'est. Le SUPER_ADMIN n'apparaît jamais ici (hors matrice, 403 en amont sur
 * toute route tenant), et les rôles de bureau voient l'organisation.
 */
export function lecteurRestreint(user: Lecteur): boolean {
  return user.role === 'MEMBRE_SIMPLE'
}

/**
 * Fragment `where` sur **Membre**. `undefined` = aucune restriction (lecteur de bureau), à
 * répandre tel quel : `{ ...autresFiltres, ...(porteeMembre(user) ?? {}) }`.
 */
export function porteeMembre(user: Lecteur): { compteUtilisateurId: string } | undefined {
  return lecteurRestreint(user) ? { compteUtilisateurId: user.sub ?? '' } : undefined
}

/**
 * Même portée, pour une ressource **jointe** au membre (contribution, versement, amende, reçu).
 * C'est la deuxième des cinq formes qui traînaient dans les handlers.
 */
export function porteeViaMembre(
  user: Lecteur,
): { membre: { compteUtilisateurId: string } } | undefined {
  const portee = porteeMembre(user)
  return portee ? { membre: portee } : undefined
}

/**
 * Fragment `where` désignant **la fiche du compte connecté**, sans condition de rôle.
 *
 * C'est la troisième forme, et la plus répandue : neuf handlers de self-service (`/moi/*`, carte,
 * RSVP, vote, photo, démarrage de paiement, dashboard perso) écrivaient
 * `{ compteUtilisateurId: req.user.sub ?? '' }` à la main. Le fragment est trivial — c'est le
 * FAIT qu'il nomme qui ne l'est pas : « quel membre ce compte désigne-t-il ». Le jour où ce lien
 * change de forme, il y a un endroit à éditer, et le garde textuel le prouve.
 */
export function membreDuCompte(sub: string | undefined): { compteUtilisateurId: string } {
  return { compteUtilisateurId: sub ?? '' }
}

/**
 * Refus d'accès hors portée. **404 UNIFORME**, jamais 403 : le statut ne doit pas révéler qu'une
 * ressource existe. La CLÉ du message varie selon la ressource — c'est l'appelant qui sait s'il
 * parle d'un membre, d'un reçu ou d'une photo — le STATUT, lui, ne varie jamais.
 */
export class HorsPorteeError extends ErreurMetier {
  constructor(cleMessage: CleMessage) {
    super(404, cleMessage, 'Ressource hors de la portée du lecteur.')
  }
}

/**
 * Contrôle d'appartenance **après chargement**, quand la ressource n'a pas pu être filtrée en
 * amont (lecture par id unique). Ne fait rien pour un lecteur de bureau.
 *
 * @param compteDeLaRessource `compteUtilisateurId` du membre auquel la ressource se rattache.
 */
export function exigerPortee(
  user: Lecteur,
  compteDeLaRessource: string | null | undefined,
  cleMessage: CleMessage,
): void {
  if (lecteurRestreint(user) && compteDeLaRessource !== user.sub) {
    throw new HorsPorteeError(cleMessage)
  }
}
