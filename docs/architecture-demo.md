# Espace de démonstration partagé (chantier 1.2, spec `2026-09-15-onboarding-demo-design.md`)

Une organisation **fictive**, **unique** et **partagée**, ouverte sans compte pour voir un espace rempli.
Livrée en trois PR : **socle serveur** (ce document, §1-4), générateur et régénération (§5, PR 2),
front de démonstration (§6, PR 3).

## 1. Marqueur et interrupteur

- `Organisation.estDemo` (défaut `false`). Écarté : réutiliser une organisation suspendue — elle
  s'afficherait « suspendue » et reposerait sur le fait qu'`authenticate` ne lit pas `actif`.
- `DEMO_ACTIVEE` (Railway) : `true` = sessions émises et régénération nocturne ; sinon démo éteinte.
  Décoration `app.demoActivee`, injectable dans `buildApp` pour les tests.

## 2. Session : une seule porte d'entrée

- `POST /demo/session` (public, 10/min par IP) : 404 si la démo est éteinte ou absente ; sinon un access
  token du premier ADMIN actif de la démo la plus récente, porteur de **`demo: true`**, **sans cookie de
  refresh** — le cookie d'un administrateur réel connecté dans le même navigateur a le même nom et le même
  chemin, l'écraser le déconnecterait.
- Login et refresh **refusent** un compte d'organisation démo (login : même réponse que des identifiants
  invalides). Conséquence voulue : aucun jeton de la démo **sans** claim `demo` ne peut exister.

## 3. Lecture seule

- Garde dans `authenticate` (toutes les routes tenant y passent, une route future est couverte sans y
  penser) : jeton `demo` + méthode autre que GET/HEAD → 403 `commun.demoLectureSeule`, avant toute requête
  en base. Règle pure `lib/demo.ts::estRequeteAutoriseeEnDemo`.
- Exceptions par « MÉTHODE motif » **exact** : `POST /equilibrages/simuler` seulement (`POST /equilibrages`
  applique réellement). Ajouter une exception = prouver qu'elle n'écrit rien (base, Blob, envoi) ; la liste
  est figée par `tests/demo.test.ts`.
- Ce que la validation ajv impose aux tests : elle précède les préhandlers, un corps invalide rend 400 sans
  prouver le garde — les tests envoient des corps valides et vérifient que la base n'est pas touchée.

## 4. Tâches de fond et console

- Retards, rappels de réunion, relances de forfait (e-mail Resend) et réconciliation PSP filtrent
  `estDemo: false`. **Verrou textuel** `tests/demo-taches-de-fond.test.ts` sur tout `organisation.findMany(`
  de `src/` **ENTIER** (client Prisma généré exclu) : parité STRICTE par fichier (comme
  `runUnscoped-allowlist.test.ts`) contre un compte d'appels non filtrés attendu — `organisation.service.ts: 1`
  (console plateforme) et `retention.service.ts: 1` (purge), toute autre occurrence non filtrée fait échouer
  le test. Les commentaires `//` et `/* */` sont retirés de chaque appel extrait avant la recherche du motif.
  Preuve contre Postgres dans `demo-taches-de-fond.integration.test.ts`. Toute nouvelle boucle de fond doit
  filtrer la démo. **Piège vécu** : un commentaire contenant `estDemo: false` PLACÉ DANS l'appel `findMany(...)`
  satisfaisait l'ancienne version (textuelle naïve) du verrou sans que le filtre existe réellement — d'où le
  retrait des commentaires avant l'analyse.
- La purge de rétention s'applique aussi à la démo (inoffensif, elle est régénérée bien avant 12 mois).
- Console plateforme : la démo est listée (badge « Démo ») mais exclue des indicateurs ; suspendre,
  réactiver, exporter, supprimer, changer ou prolonger son forfait → **409** (préhandler `refuserSiDemo`).

## 5. Génération et régénération (PR 2)

- **Description pure** `services/demo-donnees.ts` : 45 membres fictifs (42 actifs : 25 à jour, 11
  partiels, 6 en retard ; 2 inactifs, 1 décédé), barèmes sur 3 ans, versements jamais futurs, 8
  dépenses. Déterministe par indices ; seules les dates suivent `now`. La cohérence avec la règle de
  statut RÉELLE est testée sans base (`demo-donnees.test.ts`).
- **Générateur** `genererOrganisationDemo` : organisation créée par `inscrireOrganisation` (e-mail en
  `.invalid`, mot de passe jeté), marquée `estDemo: true, actif: false` pendant le remplissage — invisible
  de `POST /demo/session` et des tâches de fond — puis activée. Remplissage par les **services réels**
  (versements, reçus dont un annulé puis réémis, tontine, votes, fonctions) sous `auditContext.run` +
  `orgContext.run` ; écriture directe seulement là où la création vit dans une route. **Rien n'est
  envoyé** : les envois (notifications, reçus, paiements) vivent dans les routes. Une erreur supprime
  l'organisation partielle avant de remonter. Preuve : `reconcilierVersements` sans écart.
- **Suppression** `supprimerOrganisationDemo` : purge de tenant réutilisée sans la précondition humaine ;
  la nature de démo est relue DANS la transaction (`updateMany` conditionnel sur `estDemo: true`), une
  organisation réelle n'est jamais effaçable par ce chemin. Journal `SUPPRIMER_DEMO` best-effort, acteur
  `systeme`.
- **Régénération** `regenererDemo` : démo active de moins de 7 jours → rien ; sinon générer la nouvelle
  **puis** supprimer les anciennes. Les démos inactives de plus d'une heure sont des générations
  interrompues (supprimées) ; plus jeunes, une génération peut être en cours (laissées). Étape nocturne
  `executerEtapeDemo` après la rétention, sur l'instance qui a le verrou, éteinte sans `DEMO_ACTIVEE`,
  jamais bloquante (`tache: 'DEMO'`).
- **Tests d'intégration** : la base est partagée par des fichiers en parallèle ; ceux qui listent les
  démos passent par `tests/support/prisma-espion.ts` pour ne voir que leurs propres organisations.

## 6. Front de démonstration (PR 3)

- **Entrée** : route publique `/demo` (`pages/DemoPage.tsx`), atteinte depuis le héros et la vidéo de
  l'accueil, la page de connexion et le guide de démarrage. Les liens restent visibles démo éteinte :
  la page explique l'indisponibilité (404), aucun appel n'est fait sur la landing pour les masquer. La
  page attend la fin de la réhydratation de la session réelle avant d'ouvrir la démo. **Écart assumé
  avec la spec §2.1** (« mène à `/` ») : elle mène à l'espace du rôle démo (`cheminApresConnexion`,
  donc le tableau de bord) — `/` est la landing publique, y renvoyer le visiteur masquerait la démo
  qu'il vient d'ouvrir.
- **Mode démo du client HTTP** (`lib/api/core.ts`, posé par `AuthContext`) : écritures refusées
  LOCALEMENT (403, même message que le serveur) selon `lib/demo.ts`, miroir de `backend/src/lib/demo.ts`
  gardé par `demo-parity.test.ts` ; téléversements multipart (fetch bruts) couverts un par un ;
  « rafraîchir » = redemander `POST /demo/session` (`credentials: 'omit'`), jamais `/auth/refresh` qui
  restaurerait la session réelle. **Génération de session** : un refresh lancé avant l'entrée (ou la
  sortie) de démo ne propage jamais son jeton. `request` ne déclenche pas `onSessionExpired` quand le
  refresh a été rendu obsolète par un changement de mode (génération de session changée pendant
  l'attente) : le 401 remonte simplement, sans vider la session fraîchement installée. **La génération
  est capturée AVANT l'envoi** de la requête : un GET démo encore en vol quand le visiteur quitte la
  démo, qui revient en 401, ne tente ni refresh ni expiration — sinon un second `/auth/refresh`
  partirait avec le même cookie que celui de la sortie (détection de réutilisation → famille de
  l'administrateur réel révoquée).
- **Sortie par une route publique `/demo/sortie`** (`pages/SortieDemoPage.tsx`, déclarée à côté de
  `/demo`, hors coquille protégée). Le bandeau (« Quitter la démo », « Créer mon espace » avec
  `state.destination = '/inscription'`) et l'action de compte de la coquille (menu desktop et tiroir
  mobile, où « Se déconnecter » devient « Quitter la démo » en démo) ne font que NAVIGUER vers cette
  route ; la page exécute `quitterDemo()` une seule fois puis mène à la destination, sinon à l'espace du
  rôle réel, sinon à `/`. **Pourquoi** : déclenchée sous `ProtectedRoute`, la sortie vidait la session
  (`user=null`, `loading=true`) et `setLoading(false)` était rendu AVANT le changement de location, que
  le routeur pousse dans une transition → `ProtectedRoute` rendait `<Navigate to="/login">`, dont l'effet
  écrasait la destination (le visiteur atterrissait sur `/login`) ; chez l'administrateur réel,
  l'ancienne URL démo se remontait sous la vraie session. Arrivée directe hors démo : la page ne fait
  que naviguer. Seul chemin non routé : l'échec du renouvellement démo (`onSessionExpired`) appelle
  `quitterDemo()` dans le contexte — le visiteur est alors renvoyé vers `/login` par `ProtectedRoute`
  (page publique, pas de boucle), l'administrateur réel reste sur l'URL courante avec sa session.
  Test de bout en bout (vrais `AuthProvider`/`ProtectedRoute`/`AppShell`, seul `fetch` simulé) :
  `components/SortieDemo.integration.test.tsx`.
- **Ne jamais déconnecter l'administrateur réel** : `quitterDemo` (via `/demo/sortie`, échec du
  renouvellement) n'appelle jamais `/auth/logout` — qui révoquerait la famille de
  refresh du cookie — ni `purgerDonneesLocales` (file hors-ligne réelle) ; il réhydrate la session
  depuis le cookie. Filet serveur écarté : `/auth/logout` ne lit que ce cookie, il ne peut pas savoir
  que l'appel vient d'un onglet en démo ; le second filet est le refus local de `POST /auth/logout`.
  La sortie de démo est « single-flight » : des sorties concurrentes (double clic, « Se déconnecter »
  pendant un renouvellement échoué) partagent une seule promesse, et une sortie pendant la
  réhydratation initiale réutilise ce refresh en vol — deux `/auth/refresh` simultanés avec le même
  cookie déclencheraient la détection de réutilisation du serveur et révoqueraient la famille de
  l'administrateur réel. Après l'attente, la session réelle n'est appliquée que si la démo n'a pas été
  rouverte entre-temps (sinon données réelles sous le bandeau démo). Tests : `AuthContext.test.tsx`,
  `api-demo.test.ts`.
- **Non persistée** : un rechargement met fin à la démo. Langue changée localement ; file hors-ligne
  ni alimentée ni rejouée (et une synchro DÉJÀ en cours s'arrête à l'itération suivante, sans marquer
  en erreur les mutations restantes) ; minuteur de refresh proactif coupé (et, s'il tire pendant
  l'entrée en démo, il ne fait rien).
- **Caches du service worker** : toute requête émise en démo porte l'en-tête `X-Nkoni-Demo: 1`
  (`entetesDemo()` de `lib/api/core.ts`, étalé par `request` et par chaque GET binaire brut) et le
  `runtimeCaching` Workbox (`vite.config.ts`) ne prend pas en charge une requête qui le porte : les
  réponses fictives ne sont ni écrites ni lues dans le cache. Une purge seule ne suffisait pas — clé =
  URL, NetworkFirst avec 5 s de délai réseau, purge non attendue et réponse arrivée après la purge
  réécrite : données réelles sous le bandeau (réseau mobile lent), ou fictives chez l'administrateur.
  La purge reste faite à l'entrée et à la sortie, désormais attendue avant de naviguer. Gardes :
  `api-demo.test.ts` (en-tête présent/absent, tout fetch brut authentifié l'étale, nom identique dans
  `vite.config.ts`). CORS en développement : `@fastify/cors` ne liste pas `allowedHeaders`, il renvoie
  les en-têtes demandés au préflight — aucun changement serveur.
- **Bandeau** `components/BandeauDemo.tsx` au-dessus du bandeau de forfait, non fermable,
  `role="status"` ; « Créer mon espace » quitte la démo (via `/demo/sortie`) puis ouvre `/inscription`.
- **Effets navigateur hors HTTP désactivés** — la garde lecture seule ne voit que les requêtes API :
  - **WhatsApp** (relance du dashboard et de la fiche membre, partage `wa.me` du reçu dans
    `VersementsList`) : contrôle désactivé et expliqué, aucun `window.open` — un numéro fictif peut
    appartenir à quelqu'un (§0.2, jamais de message réel) ;
  - **Web Push** (`NotificationPreferences`) : interrupteur désactivé et expliqué, ni
    `Notification.requestPermission` ni `pushManager` — le navigateur abonnait l'appareil AVANT le refus
    local de `pushApi.subscribe`, laissant un abonnement orphelin que l'administrateur réel voyait ensuite
    « actif ».

## Mise en service (PO)

1. Poser `DEMO_ACTIVEE=true` sur le service Railway `nkoni`.
2. Générer la démo une fois contre la base de production, sans jamais coller son URL (depuis
   `backend/`, seul endroit où `npm run demo:generer` se résout) :

   ```bash
   railway run --service nkoni -- sh -c 'u="$(railway variables --service Postgres --kv | grep "^DATABASE_PUBLIC_URL=" | cut -d= -f2-)"; [ -n "$u" ] || { echo "URL de la base introuvable"; exit 1; }; DATABASE_URL="$u" npm run demo:generer'
   ```

   Attendu : `✔ Démo générée : <uuid>` et un code de sortie 0 (compter quelques minutes).
3. Contrôle : ouvrir `https://nkoni.vercel.app/demo` — le tableau de bord de « Association Exemple
   NKONI » s'affiche avec le bandeau « Espace de démonstration » ; tenter une écriture (ex. « + Versement »
   puis enregistrer) affiche le refus « lecture seule » ; « Quitter la démo » ramène à l'accueil (ou à
   votre espace si vous étiez connecté, sans avoir à vous reconnecter). La console super-admin montre
   l'organisation avec le badge « Démo ».
