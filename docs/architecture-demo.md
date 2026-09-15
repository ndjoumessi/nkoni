# Espace de démonstration partagé (chantier 1.2, spec `2026-09-15-onboarding-demo-design.md`)

Une organisation **fictive**, **unique** et **partagée**, ouverte sans compte pour voir un espace rempli.
Livrée en trois PR : **socle serveur** (ce document, §1-4), générateur et régénération (à venir, PR 2),
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
