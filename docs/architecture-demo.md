# Espace de démonstration partagé (chantier 1.2, spec `2026-09-15-onboarding-demo-design.md`)

Une organisation **fictive**, **unique** et **partagée**, ouverte sans compte pour voir un espace rempli.
Livrée en trois PR : **socle serveur** (ce document, §1-4), générateur et régénération (§5, PR 2),
front de démonstration (à venir, PR 3).

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

## Mise en service (PO)

1. Poser `DEMO_ACTIVEE=true` sur le service Railway `nkoni`.
2. Générer la démo une fois contre la base de production, sans jamais coller son URL (depuis
   `backend/`, seul endroit où `npm run demo:generer` se résout) :

   ```bash
   railway run --service nkoni -- sh -c 'u="$(railway variables --service Postgres --kv | grep "^DATABASE_PUBLIC_URL=" | cut -d= -f2-)"; [ -n "$u" ] || { echo "URL de la base introuvable"; exit 1; }; DATABASE_URL="$u" npm run demo:generer'
   ```

   Attendu : `✔ Démo générée : <uuid>` et un code de sortie 0 (compter quelques minutes).
3. Contrôle : `POST https://nkoni.vercel.app/api/demo/session` répond 200 ; la console super-admin
   montre l'organisation avec le badge « Démo ». Le front de démonstration arrive avec la PR 3.
