# Spécification — Onboarding : espace de démonstration partagé en lecture seule (chantier 1.2)

> **Statut** : validée par le PO section par section (15/09/2026), à relire avant le plan d'implémentation.
> **Roadmap** : `docs/roadmap-v1-vers-GA.md` §1.2 — premier des trois morceaux restants (données
> d'exemple ; l'aide contextuelle et le tutoriel viendront ensuite, chacun avec sa spec).

## 0. Contexte et décisions de cadrage

- Déjà livré pour 1.2 : la checklist `GuideDemarrage` (dashboard) et les `EmptyState` à CTA des pages-listes.
- **But des données d'exemple (décision PO)** : **voir un espace rempli** — comprendre ce que NKONI apporte
  (dashboard vivant, statuts, reçus, trésorerie) avant de saisir ses vraies données. Les exemples sont
  **jetables** et ne se **mélangent jamais** au réel. Ce n'est pas un modèle de départ à conserver.
- **Approche retenue** : une organisation fictive **unique, partagée, en lecture seule**, ouverte sans compte.
- **Approches écartées** :
  - *Démo personnelle jetable* (un espace modifiable par visiteur, purgé à 7 j) : un compte n'appartient
    qu'à une organisation (pas de bascule de session), et la base se remplirait d'espaces jetables.
  - *Exemples injectés dans l'espace réel* : les numéros de reçu consommés par de faux versements ne
    reviennent pas (`genererNumeroSequentiel` lit `max(numero)`), le journal d'audit garde la trace des
    exemples effacés, chaque table scopée devrait porter un marqueur. Sur un produit de transparence
    financière, une ligne fictive oubliée est un défaut grave.

### Ce que la démo ne fait jamais

1. **Écrire** au nom d'un visiteur : aucune requête autre que GET/HEAD n'aboutit avec un jeton de démo.
2. **Envoyer** un message réel : ni WhatsApp, ni e-mail, ni push, ni paiement.
3. **Déconnecter** l'administrateur réel qui l'ouvre dans le même navigateur.
4. **Apparaître** dans les chiffres de la plateforme (console super-admin).

## 1. Organisation de démonstration et garde serveur

### 1.1 Modèle

- `Organisation.estDemo Boolean @default(false)` — migration additive, aucun backfill.
- Écarté : réutiliser une organisation suspendue (`actif = false`). Elle apparaîtrait « suspendue » dans la
  console, et cela reposerait sur le fait qu'`authenticate` ne lit pas `actif` (vrai aujourd'hui,
  `middlewares/authenticate.ts`, mais non garanti demain).
- Au plus **une** organisation `estDemo = true` visible à la fois (cf. §3.2 : la régénération crée la
  nouvelle avant de supprimer l'ancienne ; `POST /demo/session` prend la plus récente).

### 1.2 Émission de session — `POST /demo/session` (public)

- Répond `404` si `DEMO_ACTIVEE` n'est pas `true` ou si aucune organisation de démo n'existe.
- Sinon `200 { accessToken, user }` pour le compte ADMIN de l'organisation de démo, **sans cookie de
  refresh** (le cookie du visiteur, s'il est administrateur ailleurs, n'est jamais écrasé — même nom et
  même chemin, `lib/session.ts`).
- Le jeton porte un claim **`demo: true`** en plus des claims habituels (`sub`, `role`, `organisationId`,
  `langue`). TTL = celui de l'access token (15 min).
- `config.rateLimit` : **10 / minute** par IP (même motif que `auth.route.ts`, `trustProxy` actif).
- Le compte ADMIN de démo est **lié à une fiche membre** (le président fictif) : « Mon espace » montre
  alors une situation personnelle réaliste.

### 1.3 Connexion normale refusée

`POST /auth/login` et `POST /auth/refresh` refusent tout compte dont l'organisation est `estDemo` (même
réponse que des identifiants invalides, pas de fuite d'existence). `POST /demo/session` est l'**unique**
porte d'entrée : un jeton de l'organisation de démo **sans** claim `demo` ne peut donc pas exister.

### 1.4 Garde lecture seule

- Dans `authenticate`, juste après `jwtVerify` : si `req.user.demo === true` et que la méthode n'est ni
  `GET` ni `HEAD` → **403** `{ error: 'Forbidden', message: t(langue, 'demo.lectureSeule') }`.
- **Unique exception** : `POST /equilibrages/simuler` (calcul pur, aucune écriture). L'exception est une
  liste explicite dans le garde, testée.
- `authenticate` couvre toutes les routes tenant ; il bloque entre autres `POST /moi/paiements`
  (démarrage de paiement réel), `POST /recus/:id/envoyer` et `/recus/:id/whatsapp` (envois réels),
  `POST/DELETE /notifications/push/subscribe`, `PATCH /notifications/*/lu`, `PATCH /auth/me/langue`.
- Les routes `/platform/*` restent inaccessibles (`requireSuperAdmin`, le jeton est ADMIN).

### 1.5 Tâches de fond

Les tâches qui bouclent sur les organisations actives **ajoutent `estDemo: false`** à leur filtre :

| Tâche | Fichier | Sans ce filtre |
|---|---|---|
| Nuit : `COTISATION_RETARD`, `REUNION_RAPPEL` | `services/notification-scheduler.ts` | lignes `Notification` écrites chaque nuit |
| Relances de forfait | `services/forfait-relances.service.ts` | e-mail Resend au compte ADMIN de démo (si échéance posée) |
| Réconciliation des paiements `*/15` | `services/paiement-reconciliation.service.ts` | appels PSP (aucun `Paiement` en attente n'est semé, défense en profondeur) |

La **purge de rétention** continue de s'appliquer à toutes les organisations (inoffensif : la démo est
régénérée bien avant 12 mois). Chaque filtre est prouvé **en intégration** (un mock ignore le `where`).

### 1.6 Blob

- Aucune photo ni aucun document n'est semé : avatars en initiales, miroir hors-site R2
  (`lib/blob-mirror.ts`, lit les URL en base) non concerné.
- Un reçu consulté en PDF est généré puis mis en cache sur Blob **une fois** (`produireRecuPdf`, écriture
  sur un GET, déjà le comportement normal). Accepté : le nombre de reçus est borné, et la suppression de
  l'ancienne démo (§3.2) efface ses blobs comme toute purge d'organisation.

### 1.7 Console super-admin

- `listerOrganisations` renvoie `estDemo` ; la console affiche un badge « Démo » et **exclut** l'organisation
  de démo des indicateurs (total, actives, membres, répartition des forfaits, à relancer, payants sans échéance).
- Suspendre, changer le forfait, prolonger, exporter ou supprimer l'organisation de démo depuis la console :
  **409** côté serveur (elle est gérée par la régénération), boutons masqués côté front.

## 2. Session de démonstration côté front

### 2.1 Points d'entrée

- Page d'accueil : bouton « Voir un espace d'exemple » à côté du CTA principal du héros et près de la vidéo
  (`components/landing/…`, `pages/LandingPage.tsx`).
- Page de connexion : lien « Voir un espace d'exemple ».
- Checklist `GuideDemarrage` (administrateur à l'espace vide) : lien « Voir à quoi ressemble un espace rempli ».
- Tous mènent à **`/demo`** (route publique), qui appelle `POST /demo/session`, active le mode démo et
  navigue vers `/`. Échec (404, réseau) : message clair et retour à l'accueil.
- Entrées masquées tant que le backend répond 404 ? **Non** : les liens restent visibles, `/demo` explique
  que la démo est momentanément indisponible. (Pas d'appel au chargement de la landing juste pour cacher un lien.)

### 2.2 État `modeDemo` (`contexts/AuthContext.tsx`, `lib/api/core.ts`)

En mode démo :
- **Aucun rafraîchissement** : ni le rejeu sur 401 (`rafraichirAccessToken`, `core.ts`), ni le minuteur
  proactif — tous deux restaureraient la vraie session depuis le cookie.
- **Expiration (401)** : nouvelle demande `POST /demo/session` silencieuse, puis rejeu une fois (même
  garde anti-boucle que le refresh). Échec → sortie de la démo.
- **Langue** : appliquée localement (i18n + `localStorage`), pas de `PATCH /auth/me/langue`.
- **File hors-ligne** désactivée (aucune écriture à mettre en file).
- **« Quitter la démo »** : vide la session en mémoire, **n'appelle jamais `/auth/logout`** (qui révoquerait
  la famille de refresh réelle), puis relance l'hydratation normale : l'admin retrouve son espace, le
  visiteur revient à l'accueil.
- **Rechargement** pendant la démo : la démo s'arrête (non persistée), la session réelle éventuelle revient.

### 2.3 Bandeau

`components/BandeauDemo.tsx`, en tête de `#contenu-principal`, **au-dessus** du bandeau de forfait :
« Espace de démonstration — données fictives, lecture seule » + boutons « Créer mon espace » (`/inscription`,
quitte d'abord la démo) et « Quitter ». `role="status"`, non fermable. FR/EN.

### 2.4 Écritures

- Formulaires et boutons restent **visibles** (on montre ce que fait le produit).
- En mode démo, le client HTTP (`core.ts`) refuse **localement** toute méthode autre que GET/HEAD, sauf
  `POST /equilibrages/simuler`, en levant une `ApiError` 403 portant le message traduit
  « Démo en lecture seule — créez votre espace pour enregistrer » ; les écrans l'affichent comme tout refus
  serveur. Le serveur reste l'autorité (§1.4) et renvoie le même message.
- Bouton de **relance WhatsApp** (`lienRelanceWhatsApp`, dashboard + fiche membre) : **désactivé** en mode
  démo — un lien `wa.me` n'est pas une requête API, le garde ne le verrait pas, et un numéro fictif peut
  appartenir à quelqu'un.
- Exports et PDF (GET) fonctionnent.

## 3. Données fictives et régénération

### 3.1 Contenu

Toutes les données sont **fictives** (noms inventés, aucune personne réelle), saisies en français comme les
données d'une vraie organisation (le contenu saisi n'est jamais traduit), devise FCFA.

- Organisation « Association Exemple NKONI », forfait **PRO sans échéance** (toutes les capacités, pas de
  bandeau), paiement en ligne **non configuré** (aucun identifiant PSP).
- ~45 membres, 3 branches, 1 chef ; répartition réaliste : ~60 % à jour, ~25 % partiels, ~15 % en retard,
  2 inactifs, 1 décédé. Téléphones au format camerounais mais **inutilisables** pour un envoi en démo (§2.4).
- Barèmes sur 3 années (année courante incluse), contributions ouvertes.
- ~150 versements sur 24 mois (espèces, Mobile Money saisi à la main, virement), leurs **reçus**, dont
  **un reçu annulé**.
- 8 dépenses couvrant tout le workflow (`BROUILLON` → `PAYEE`, dont une `REJETEE`).
- 1 cagnotte ouverte avec dons ; 1 tontine `ORDRE_FIXE` à mi-cycle (mises et reversements des tours échus) ;
  3 amendes (encaissée, en attente, annulée).
- 1 réunion passée (ordre du jour, présences, compte-rendu, résolution **adoptée par vote**), 1 réunion à venir.
- Fonctions sociales (président, trésorière, secrétaire…) avec leurs titulaires.

**Génération par les services réels** (`versement.service`, `recu.service`, `tontine.service`, `vote.service`…),
jamais par insertions brutes : les invariants (cumuls `montantVerse`/`montantValorise`, numérotation des reçus,
un reçu actif par versement) tiennent par construction. Écritures sous `orgContext.run({ organisationId })`.
**Déterministe** : générateur pseudo-aléatoire à graine fixe ; seules les dates suivent « aujourd'hui »
(`now` injecté, jours applicatifs Douala). Preuve : `reconcilierVersements` renvoie **zéro écart** sur la
démo générée.

### 3.2 Régénération

Sans elle la démo vieillit : en janvier, « l'année courante » serait vide.

- **Interrupteur** `DEMO_ACTIVEE` (variable backend) : absent ou ≠ `true` → `POST /demo/session` = 404 et
  aucune génération nocturne. Désactivé par défaut en dev et en tests.
- **Étape nocturne** distincte, après la rétention, **seulement sur l'instance qui détient le verrou**
  (`verrouObtenu`, comme la rétention), best-effort (log + `observabilite.signaler`, tâche `DEMO`) :
  si aucune démo n'existe, ou si la plus récente a plus de **7 jours** → **générer la nouvelle d'abord**,
  puis **supprimer les anciennes**. Pas de trou : un visiteur sur l'ancienne reçoit un 401/404, le front
  redemande un jeton (§2.2) et bascule sur la nouvelle sans le voir.
- **Suppression** : fonction dédiée `supprimerOrganisationDemo(prisma, organisationId)` qui réutilise
  `ORDRE_SUPPRESSION`, le scoping des `deleteMany` et le nettoyage des blobs de
  `services/organisation-purge.service.ts`, **sans** passer par la précondition humaine (suspension +
  confirmation du nom) — mais qui **relit `estDemo === true`** juste avant de supprimer et **refuse**
  sinon. Journalisée dans `PlatformAuditLog` : nouvelle valeur d'enum `ActionPlateforme.SUPPRIMER_DEMO`
  (migration dédiée ; la valeur n'est utilisée que par le code, jamais dans la migration qui l'ajoute),
  `acteurId = 'systeme'`, `acteurEmail = 'systeme@nkoni'` (les deux colonnes sont obligatoires), snapshot du
  nom et des volumes. Contrairement à `PURGER`, journal **best-effort** : l'objet supprimé est fictif et
  régénérable, bloquer la régénération sur un échec d'écriture du journal ferait vieillir la démo.
- **Commande manuelle** `npm run demo:generer` (`backend/prisma/generer-demo.ts`) : même chemin que l'étape
  nocturne (génère puis supprime les anciennes), pour la première création en production. Exécutée par le PO.

## 4. Tests, livraison, documentation

### 4.1 Découpage en 3 PR (chacune déployable seule ; rien de visible tant que `DEMO_ACTIVEE` est éteint)

**PR 1 — Socle serveur** : migration `estDemo`, claim `demo`, garde dans `authenticate`, `POST /demo/session`,
refus de login/refresh, filtres des tâches de fond, console (badge, exclusions, 409).
- Jeton démo : 403 sur POST/PUT/PATCH/DELETE représentatifs, 200 sur GET, 200 sur `/equilibrages/simuler`.
- Login et refresh refusés pour un compte d'organisation démo.
- `DEMO_ACTIVEE` absent → 404 ; organisation démo absente → 404 ; limite de débit.
- Tâches de fond : l'organisation démo est ignorée — **intégration** (vraie Postgres).
- Console : exclusions et 409.
- Sabotages dans la direction utile : garde retiré → rouge ; filtre `estDemo` retiré d'une tâche → rouge.

**PR 2 — Générateur et régénération** : migration `SUPPRIMER_DEMO`, générateur, `supprimerOrganisationDemo`,
étape nocturne, `npm run demo:generer`.
- Intégration (base jetable `nkoni_it_*`, jamais `nkoni`) : génération → `reconcilierVersements` = 0 écart,
  volumes attendus (membres, versements, reçus dont un annulé…) ; régénération → nouvelle démo présente,
  ancienne absente, **une organisation réelle intacte** (comptes de lignes identiques avant/après) ;
  suppression **refusée** sur une organisation non démo ; deux régénérations → une seule démo.
- Étape nocturne : non exécutée sans verrou, sans `DEMO_ACTIVEE`, ou démo récente.

**PR 3 — Front** : `modeDemo`, route `/demo`, `BandeauDemo`, points d'entrée, refus local des écritures,
WhatsApp désactivé, « Quitter la démo », i18n FR/EN.
- `core.ts` : pas de refresh en mode démo, renouvellement du jeton démo sur 401, refus local d'une écriture.
- « Quitter » n'appelle pas `/auth/logout`.
- Bandeau affiché en mode démo seulement.
- Vérification visuelle en navigateur (la démo ne demande aucun mot de passe), 360 px et bureau.

### 4.2 Documentation

- `docs/architecture-demo.md` (nouveau) : détail et raisons.
- `CLAUDE.md` : pointeur + invariants (un jeton `demo` n'écrit jamais ; la suppression de démo relit
  `estDemo` ; toute nouvelle tâche de fond qui boucle sur les organisations filtre `estDemo: false`).
- Roadmap 1.2 mise à jour.

### 4.3 Mise en service (PO)

1. Poser `DEMO_ACTIVEE=true` sur le service Railway `nkoni`.
2. Lancer une fois `npm run demo:generer` contre la base de production (commande fournie dans le runbook
   de `architecture-demo.md`, même précaution que le rechiffrement PSP : URL lue depuis Railway, jamais collée).
3. Ouvrir `/demo` en production : bandeau, dashboard rempli, une écriture refusée.

## 5. Hors périmètre

- Aide contextuelle et tutoriel « premiers pas » (autres morceaux de 1.2).
- Démo en anglais avec contenu traduit (le contenu saisi n'est jamais traduit ; l'interface l'est).
- Démo interactive (écritures réelles) et modèle de départ pré-rempli pour un nouvel espace.
- Mesure de conversion (clics « Voir un espace d'exemple » → inscriptions).
