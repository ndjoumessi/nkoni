# ADR-0002 — « Combien ce membre doit-il ? » : l'historisation prime

**Statut** : accepté · **Date** : 2026-09-23 · **Décideur** : PO
**Portée** : `backend/src/services/attendu.ts` et ses quatre lectures

## Contexte

« Ce que doit un membre » avait **deux vérités stockées** et **quatre lectures** qui ne
s'accordaient pas :

| stockage | nature |
|---|---|
| `BaremeAnnuel.montantAttendu` | **vivant** — éditable à tout moment depuis la page Barème |
| `Contribution.montantAttendu` | **figé** — copié depuis le barème à l'ouverture de l'année pour ce membre |

| lecture | lisait | conséquence |
|---|---|---|
| statut du membre (`statutContribution`) | barème **vivant** | corriger un barème changeait le statut de tout le monde, rétroactivement |
| taux de recouvrement (`rapport.service`) | barème **vivant** × nb éligibles | supposait que tous doivent la même chose |
| plafond de paiement (`paiement.service`) | **snapshot** | un membre « en retard » ne pouvait pas payer la différence |
| export Excel (`export.service`) | **snapshot** | le fichier et l'écran se contredisaient |

Trois docblocks affirmaient en prose être « miroir exact » les uns des autres — le signe qu'aucun
mécanisme ne le garantissait.

Le défaut n'est pas théorique : éditer un barème à la hausse rendait « en retard », du jour au
lendemain, un membre qui avait payé exactement ce qu'on lui avait demandé — **tout en lui
interdisant de payer la différence**, puisque le plafond de paiement, lui, lisait le snapshot.

## Décision

**Le montant figé à l'ouverture fait foi. Le barème ne vaut que pour ce qui reste à ouvrir.**

En une phrase opérationnelle : *pour chaque année de la fenêtre d'éligibilité, le snapshot s'il
existe, le barème sinon.* Une année sans `Contribution` n'a rien de figé — c'est une année
attendue mais pas encore ouverte, et le barème courant dit ce qu'elle vaudra.

Un module unique, `services/attendu.ts`, possède la question. Les quatre lectures passent par son
interface ; la règle d'éligibilité, qui était recopiée dans quatre modules et maintenue par
commentaire, y est écrite une fois.

## Options écartées

- **Le barème vivant fait foi, le snapshot devient un cache.** Pratique pour corriger une erreur de
  saisie, mais un membre à jour peut se retrouver en retard sans avoir rien fait. Sur un produit de
  transparence financière, faire bouger une somme déjà communiquée est le pire des deux maux.
- **Le barème vivant, mais sur l'année en cours seulement.** Correspond à « on ajuste la cotisation
  en cours d'exercice, on ne rouvre pas les exercices clos ». Écartée pour une raison de coût de
  compréhension : elle ajoute une règle de bord (« quelle est l'année en cours », déjà un sujet
  délicat à cause du fuseau `Africa/Douala`) pour un cas d'usage que rien ne réclamait.
- **Ne rien décider et documenter l'écart.** C'était l'état antérieur. Trois docblocks le
  « documentaient » déjà, et l'écart a survécu.

## Conséquences non évidentes

- **Le seul moyen de perdre le snapshot est un `select` Prisma incomplet.** La colonne est NOT NULL
  en base : une ligne ne l'a jamais absent. Une requête qui l'omet fait retomber le calcul sur le
  barème vivant, **en silence**, avec un montant plausible. Le typage ne peut pas l'attraper —
  plusieurs services reçoivent un client Prisma typé `any`. D'où un garde TEXTUEL
  (`tests/attendu.test.ts`) : tout `select` de contributions lisant `montantValorise` lit aussi
  `montantAttendu`. **Trois `select` l'omettaient déjà** (`membreStatut`, `dashboard`,
  `notification-scheduler`), et deux autres ont été trouvés à l'exécution.
- **Le cumul parcourt l'UNION barèmes ∪ contributions**, et pas seulement les barèmes. Sinon une
  année ouverte dont le barème a depuis été supprimé disparaîtrait de l'attendu — le membre
  deviendrait « à jour » par effacement de sa dette.
- **Le taux de recouvrement n'est plus `barème × effectif`.** Il somme l'attendu membre par membre.
  La formule courte supposait que tous doivent la même chose, ce qui redevient faux dès qu'un
  barème est édité après des ouvertures.
- **`attenduDeLAnnee` rend `undefined`, pas `0`**, pour une année ni ouverte ni barémée : l'appelant
  doit pouvoir distinguer « rien dû » d'« inconnu ».
- **L'écriture, elle, reste sur le barème vivant.** `ouvrirAnnee`/`ouvrirAnneeMembre` copient le
  barème courant dans le snapshot — c'est précisément le geste d'historisation, et le seul endroit
  où le barème doit primer.
- **Conséquence opérationnelle pour le PO** : corriger un barème après des ouvertures n'a plus
  d'effet rétroactif. Pour répercuter une correction sur des contributions déjà ouvertes, il
  faudra un geste EXPLICITE (non implémenté — aucun besoin exprimé). C'est voulu : une révision
  de montants déjà communiqués doit être une décision, pas un effet de bord d'une édition.
