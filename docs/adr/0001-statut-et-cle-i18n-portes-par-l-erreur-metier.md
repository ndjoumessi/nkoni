# Le statut HTTP et la clé i18n sont portés par l'erreur métier

Le statut HTTP et la clé de message d'une erreur métier vivaient dans le module route qui
l'attrapait, recopiés dans 26 modules sur 38 — 96 `instanceof`, 11 copies littérales du même
helper — si bien que lire *une* erreur demandait trois fichiers (la classe dans le service, le
statut dans la route, le message dans le catalogue) et qu'une erreur non mappée retombait en 500
opaque, défaut vécu deux fois en production. Nous portons désormais le statut et la clé **sur la
classe d'erreur**, via une base `ErreurMetier` dont le constructeur les exige, et c'est le
gestionnaire d'erreur global — qui existait déjà — qui les rend.

Ce choix repose sur une vérification et non sur une intuition : **60 des 61 classes mappées ont un
statut unique**, le mappage est donc une fonction de la classe et non du couple (classe, route).

## Options écartées

- **Un registre central `classe → (statut, clé)`.** Aucune migration des services, table lisible
  d'un coup d'œil — mais c'est une huitième liste tenue à la main dans un dépôt qui en a déjà sept,
  et rien n'y force l'inscription d'une nouvelle erreur : l'oubli redonne un 500.
- **Des champs `statut`/`cle` sans base commune**, lus en canard-typage. Pas d'héritage à migrer,
  mais rien n'oblige à les déclarer ni ne vérifie la validité de la clé.
- **Garder le helper par route en le typant.** Le plus petit changement, mais il conserve 26 copies
  partielles du catalogue d'erreurs et laisse la localité éclatée sur trois fichiers.

## Conséquences non évidentes

- **`MembreIntrouvableError` est scindée en deux types.** Elle servait à deux faits distincts : la
  ressource absente (404, sans paramètre) et une référence invalide dans le corps d'une requête
  (400, identifiant renvoyé). Deux erreurs presque jumelles surprendront un lecteur ; c'est la
  contrepartie assumée d'une table qui reste une fonction pure de la classe, sans mécanisme de
  dérogation.
- **Une erreur de service n'est pas forcément une erreur HTTP.** Les refus de la tâche de nuit
  (`RetentionRefuseeError`, `OrganisationNonDemoError`) n'atteignent jamais une route : le garde
  les autorise explicitement plutôt que de les forcer dans un moule HTTP qui n'a pas de sens pour
  elles.
- **Le champ `error` du corps de réponse disparaît.** Il était écrit à 61 endroits et lu par
  personne : le client front ne lit que `message`, et aucun test ne l'affirme.
- **Le compilateur ne ferme pas tout.** Écrire `extends Error` au lieu de `extends ErreurMetier`
  compile encore ; c'est un garde textuel, et non le typage, qui l'interdit.
