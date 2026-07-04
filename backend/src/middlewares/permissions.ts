import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'

/**
 * Middleware de permissions NKONI — encode la matrice de la section 2 de la spec.
 *
 * Séparation des responsabilités :
 *   - L'AUTHENTIFICATION (présence + validité du JWT) est gérée EN AMONT par le hook
 *     d'auth `authenticate` (@fastify/jwt, cf. src/middlewares/authenticate.ts), qui
 *     renvoie 401 si le token est absent/invalide et peuple `req.user`.
 *   - CE middleware ne fait QUE de l'AUTORISATION : il suppose `req.user.role` déjà
 *     présent et vérifie le droit du rôle sur (entité, action). Il renvoie 403 si le
 *     rôle n'a pas la permission. (Il conserve un garde-fou 401 défensif au cas où il
 *     serait branché sans hook d'auth en amont — mais ce n'est pas sa responsabilité
 *     nominale.)
 *
 * Limite assumée pour cette étape (« lecture partielle ») :
 *   Plusieurs cellules de la matrice sont restreintes au périmètre du membre
 *   (« sa propre fiche », « les siennes », « son propre profil »). Ce middleware
 *   vérifie UNIQUEMENT le droit générique d'accès à l'action sur l'entité. Le
 *   filtrage « uniquement ses propres données » sera appliqué DANS la logique de
 *   route (ex. `where: { membreId: req.user.membreId }`), pas ici.
 */

export type Action = 'create' | 'read' | 'update' | 'delete'

export type Entite =
  | 'Membre'
  | 'BrancheFamiliale'
  | 'BaremeAnnuel'
  | 'Contribution'
  | 'Versement'
  | 'Equilibrage'
  | 'Recu'
  | 'Export'
  | 'Utilisateur'
  | 'Reunion'
  | 'Resolution'
  | 'Fonction'
  | 'Affectation'
  | 'Conflit'

export type Role =
  | 'ADMIN'
  | 'PRESIDENT'
  | 'SECRETAIRE'
  | 'TRESORIERE'
  | 'COMMISSAIRE_COMPTES'
  | 'GUIDE_RELIGIEUX'
  | 'MEMBRE_SIMPLE'

// Raccourcis de lisibilité pour la table.
const CRUD: Action[] = ['create', 'read', 'update', 'delete']
const READ: Action[] = ['read']

/**
 * Conventions de mapping des cellules descriptives de la matrice §2 vers les actions
 * CRUD manipulées par le middleware :
 *
 *   - « CRUD »              → create, read, update, delete
 *   - « Lecture » / « Lecture seule » → read
 *   - « Créer/Modifier »   → create, update  (+ read : voir principe ci-dessous)
 *   - « Créer/Appliquer » (Équilibrage) → create  (+ read) ; « Appliquer » fait partie
 *      de la transaction de création de l'équilibrage, ce n'est pas un update de l'entité.
 *   - « Générer » (Reçu)   → create  (+ read) ; générer un reçu crée une ligne Recu.
 *   - « Modifier son propre profil » (Utilisateur/MEMBRE_SIMPLE) → update (+ read)
 *   - « — »                → aucune permission (rôle absent de l'entrée)
 *
 * Principe appliqué et documenté : TOUTE permission d'écriture (create/update/delete)
 * implique implicitement `read` — on ne peut pas modifier ce qu'on ne peut pas lire.
 * Les cellules avec écriture incluent donc `read`.
 *
 * Arbitrage §0 vs §2 (tranché) : le COMMISSAIRE_COMPTES peut « Générer » un reçu.
 * Générer un reçu ne modifie AUCUNE donnée financière (Versement/Contribution restent
 * intouchés) — c'est un document dérivé produit à la demande. C'est donc cohérent avec
 * l'esprit « lecture seule du module financier » du §0. Décision validée, pas de conflit.
 *
 * GUIDE_RELIGIEUX : aucun droit sur les entités MVP (périmètre V2) → absent partout.
 */
export const PERMISSIONS: Record<Entite, Partial<Record<Role, Action[]>>> = {
  Membre: {
    ADMIN: CRUD,
    PRESIDENT: READ,
    SECRETAIRE: ['create', 'read', 'update'], // Créer/Modifier (+ read)
    TRESORIERE: READ,
    COMMISSAIRE_COMPTES: READ,
    MEMBRE_SIMPLE: READ, // sa propre fiche (filtrage en route)
  },
  BrancheFamiliale: {
    ADMIN: CRUD,
    PRESIDENT: READ,
    SECRETAIRE: READ,
    TRESORIERE: READ,
    COMMISSAIRE_COMPTES: READ,
    // MEMBRE_SIMPLE : —
  },
  BaremeAnnuel: {
    ADMIN: CRUD,
    PRESIDENT: READ,
    // SECRETAIRE : —
    TRESORIERE: READ,
    COMMISSAIRE_COMPTES: READ,
    // MEMBRE_SIMPLE : —
  },
  Contribution: {
    ADMIN: CRUD,
    PRESIDENT: READ,
    // SECRETAIRE : —
    TRESORIERE: CRUD,
    COMMISSAIRE_COMPTES: READ, // Lecture seule
    MEMBRE_SIMPLE: READ, // les siennes (filtrage en route)
  },
  Versement: {
    ADMIN: CRUD,
    PRESIDENT: READ,
    // SECRETAIRE : —
    TRESORIERE: CRUD,
    COMMISSAIRE_COMPTES: READ, // Lecture seule
    MEMBRE_SIMPLE: READ, // les siens (filtrage en route)
  },
  Equilibrage: {
    ADMIN: ['create', 'read'], // Créer/Appliquer (+ read)
    PRESIDENT: READ,
    // SECRETAIRE : —
    TRESORIERE: ['create', 'read'], // Créer/Appliquer (+ read)
    COMMISSAIRE_COMPTES: READ, // Lecture seule
    // MEMBRE_SIMPLE : —
  },
  Recu: {
    ADMIN: ['create', 'read'], // Générer (+ read)
    PRESIDENT: ['create', 'read'], // Générer
    // SECRETAIRE : —
    TRESORIERE: ['create', 'read'], // Générer
    COMMISSAIRE_COMPTES: ['create', 'read'], // Générer (cf. note §0 vs §2)
    MEMBRE_SIMPLE: ['create', 'read'], // Générer les siens (filtrage en route)
  },
  Export: {
    // Matrice §2, ligne « Export PDF/Excel » : Oui pour ces 4 rôles, Non pour les autres.
    // SECRETAIRE et MEMBRE_SIMPLE : — (absents → 403). GUIDE_RELIGIEUX : — (V2).
    ADMIN: READ,
    PRESIDENT: READ,
    TRESORIERE: READ,
    COMMISSAIRE_COMPTES: READ,
  },
  Utilisateur: {
    ADMIN: CRUD,
    // PRESIDENT / SECRETAIRE / TRESORIERE / COMMISSAIRE_COMPTES : —
    MEMBRE_SIMPLE: ['read', 'update'], // Modifier son propre profil (filtrage en route)
  },
  // V1.1 (§5) — pas de matrice explicite dans la spec ; permissions calquées sur l'esprit
  // du §2 (validé avec le PO). La permission `Reunion` gouverne aussi ses PointOrdreDuJour
  // (sous-ressource). GUIDE_RELIGIEUX : aucun droit (comme le reste du MVP).
  Reunion: {
    ADMIN: CRUD,
    PRESIDENT: CRUD,
    SECRETAIRE: ['create', 'read', 'update'], // secrétariat : Créer/Modifier (pas de delete)
    TRESORIERE: READ,
    COMMISSAIRE_COMPTES: READ,
    MEMBRE_SIMPLE: READ,
  },
  Resolution: {
    ADMIN: CRUD,
    PRESIDENT: CRUD,
    SECRETAIRE: ['create', 'read', 'update'],
    TRESORIERE: READ,
    COMMISSAIRE_COMPTES: READ,
    MEMBRE_SIMPLE: READ,
  },
  // V1.1 (§5) — Fonctions/organes + historique des nominations. Permissions calquées
  // sur l'esprit du §2 (comme Reunion). L'écriture d'une Affectation se limite à la
  // création (mono-titulaire avec clôture auto) : pas d'update/delete d'affectation
  // exposé, l'historique est immuable. GUIDE_RELIGIEUX : aucun droit.
  Fonction: {
    ADMIN: CRUD,
    PRESIDENT: CRUD,
    SECRETAIRE: ['create', 'read', 'update'], // tenue des registres (pas de delete)
    TRESORIERE: READ,
    COMMISSAIRE_COMPTES: READ,
    MEMBRE_SIMPLE: READ,
  },
  Affectation: {
    ADMIN: CRUD,
    PRESIDENT: CRUD,
    SECRETAIRE: ['create', 'read', 'update'], // nommer/consigner (pas de delete)
    TRESORIERE: READ,
    COMMISSAIRE_COMPTES: READ,
    MEMBRE_SIMPLE: READ,
  },
  // V2 (§4.4) — Conflits. La matrice ne gouverne QUE la déclaration (`create`),
  // réservée au bureau : ADMIN, PRESIDENT, SECRETAIRE. La LECTURE et la MODIFICATION
  // ne passent PAS par cette matrice : elles dépendent du niveau de confidentialité et
  // de l'identité du demandeur, via les fonctions pures peutVoirConflit /
  // peutModifierConflit (cf. conflit.service.ts) — pas un simple droit générique
  // d'entité. Les routes de lecture/màj n'utilisent donc que `authenticate`.
  Conflit: {
    ADMIN: ['create'],
    PRESIDENT: ['create'],
    SECRETAIRE: ['create'],
    // TRESORIERE / COMMISSAIRE_COMPTES / MEMBRE_SIMPLE / GUIDE_RELIGIEUX : pas de déclaration.
  },
}

/**
 * Factory : retourne un preHandler Fastify qui autorise la requête si le rôle de
 * l'utilisateur authentifié possède `action` sur `entite`, sinon répond 403.
 *
 * @example
 *   app.get('/membres', { preHandler: [authenticate, requirePermission('Membre', 'read')] }, handler)
 */
export function requirePermission(
  entite: Entite,
  action: Action,
): preHandlerHookHandler {
  return async function permissionPreHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    // Lecture découplée de @fastify/jwt : on lit `req.user` (peuplé en amont par le
    // hook d'auth) via un cast local, sans dépendre du typage du plugin JWT ici.
    const user = (req as unknown as { user?: { role?: Role } }).user
    const role = user?.role

    // Garde-fou défensif : l'auth (401) est normalement déjà traitée en amont.
    if (!role) {
      reply.code(401).send({ error: 'Unauthorized', message: 'Authentification requise.' })
      return
    }

    const actionsAutorisees = PERMISSIONS[entite][role] ?? []
    if (!actionsAutorisees.includes(action)) {
      reply.code(403).send({
        error: 'Forbidden',
        message: `Le rôle ${role} n'a pas la permission '${action}' sur l'entité '${entite}'.`,
      })
      return
    }

    // Autorisé : ne rien renvoyer laisse Fastify poursuivre vers le handler.
  }
}
