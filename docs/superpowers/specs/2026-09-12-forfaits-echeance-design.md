# Spécification — Forfaits : paliers, échéance, écrans (chantier 1.1)

> **Statut** : validée par le PO section par section (12/09/2026), à relire avant implémentation.
> **Roadmap** : `docs/roadmap-v1-vers-GA.md` §1.1. **Décision de fond** : vente **assistée** outillée
> (option A) — pas de paiement en ligne des forfaits pour la GA. Le socle construit ici (échéance +
> prolongation) est celui sur lequel un paiement self-service (Stripe ou Mobile Money) se branchera
> plus tard, sans le refaire.

## 0. Contexte et constats de départ

- Seule différence réelle entre forfaits aujourd'hui : **50 membres** en Gratuit ; Pro et Entreprise
  sont illimités et **commercialement indistincts** (`lib/forfait.ts`).
- Un forfait attribué **n'expire jamais** : `Organisation.forfait` n'a pas de date de fin.
- La page d'accueil promet pour Pro « Documents illimités » et « Export avancé », qui **n'existent pas**
  (aucun quota de stockage, exports identiques), et pour Entreprise « fédérations », sans fonctionnalité.
- Le quota de membres était incohérent (actifs affichés, tous comptés) : **corrigé à part** (PR #131),
  prérequis de cette spécification.
- L'adresse de contact publique a été unifiée dans `frontend/src/lib/contact.ts` (PR #132).

## 1. Paliers

### 1.1 Principe — ce qui n'est jamais vendu

**La transparence envers les membres reste gratuite** : statut, reçus, espace membre (`/moi/*`),
carte de membre à QR. C'est la promesse centrale ; une association gratuite qui en montrerait moins à ses
membres saperait l'argument même du produit. On ne vend que : **l'échelle**, **ce qui coûte à NKONI**
(stockage), **ce qui fait gagner du temps ou de l'argent au bureau** (paiement en ligne).

**Corollaire d'interface : un membre ne voit jamais de message commercial.** Une capacité absente est
simplement absente pour lui.

### 1.2 Tableau des capacités

| Capacité | GRATUIT | PRO | ENTREPRISE |
|---|---|---|---|
| Membres **actifs** | 50 | illimité | illimité |
| Membres, cotisations, versements, reçus, espace membre, cartes | ✓ | ✓ | ✓ |
| Réunions, résolutions, votes, tontines, cagnottes, amendes | ✓ | ✓ | ✓ |
| Rapports & exports, export RGPD | ✓ | ✓ | ✓ |
| Stockage des documents | 500 Mo | 20 Go | 20 Go (au-delà : sur devis) |
| Paiement en ligne Mobile Money | — | ✓ | ✓ |
| Accompagnement, support prioritaire, facturation annuelle | — | — | ✓ (service, pas de code) |

- **Tontines et votes restent gratuits** : présentés comme phares pour tous sur la page d'accueil, et les
  tontines sont un segment nommé — les rendre payantes fermerait une cible.
- **Entreprise = Pro techniquement.** La différence est contractuelle (services), aucune ligne de code.
- **Chiffres de stockage provisoires** : à calibrer sur l'usage réel **avant** l'étape de livraison 3
  (cf. §6) par une mesure en production : `Σ Document.tailleOctets` par organisation (distribution, max).
- **Photos hors quota** : 5 Mo max par membre, déjà bornées par le nombre de membres.

### 1.3 Mesure transitoire — paiement en ligne déjà configuré

Une organisation **Gratuite** qui a **déjà** configuré le paiement en ligne au moment de la livraison
**le conserve** (couper un flux d'argent en service serait brutal). Mécanisme explicite et auditable :
colonne `Organisation.paiementEnLigneAcquis Boolean @default(false)`, **backfill à `true`** dans la même
migration pour toute organisation ayant une ligne `ParametrePaiement`. Aucune date « magique » en code.

## 2. Modèle et règles

### 2.1 Schéma (migrations additives)

| Changement | Détail |
|---|---|
| `Organisation.forfaitExpireLe DateTime?` | Fin de la période payée. `NULL` = pas d'échéance. GRATUIT : toujours `NULL`. **Les Pro existants gardent `NULL`** au déploiement → aucune rétrogradation de masse. |
| `Organisation.paiementEnLigneAcquis Boolean @default(false)` | + backfill (§1.3). |
| `enum ActionPlateforme` + `PROLONGER_FORFAIT` | Migration `ADD VALUE` seule (aucun usage SQL dans la même transaction). |
| `enum TypeNotification` + `FORFAIT_ECHEANCE` | Idem. |

`Organisation` n'est **pas** un modèle scopé : aucune entrée `SCOPED_MODELS`, `ORDRE_SUPPRESSION` inchangé.

### 2.2 Source unique des capacités

`backend/src/lib/forfait.ts` remplace `limiteMembresForfait` par une table :

```ts
export const CAPACITES_FORFAIT: Record<Forfait, CapacitesForfait> = {
  GRATUIT:    { limiteMembres: 50,   quotaStockageOctets: 500 * Mo, paiementEnLigne: false },
  PRO:        { limiteMembres: null, quotaStockageOctets: 20 * Go,  paiementEnLigne: true },
  ENTREPRISE: { limiteMembres: null, quotaStockageOctets: 20 * Go,  paiementEnLigne: true },
}
```

Miroir `frontend/src/lib/forfait.ts`, avec un **test de parité inter-couches lu en texte** sur le modèle de
`frontend/src/lib/roles-parity` (le front ne peut pas importer le backend). `limiteMembresForfait` reste
exportée comme dérivation (`CAPACITES_FORFAIT[f].limiteMembres`) pour ne pas toucher ses appelants.

### 2.3 État et forfait effectif — CALCULÉS, jamais stockés

Fonctions **pures**, horloge injectée (`now`), dans `lib/forfait.ts` (+ miroir) :

```ts
joursRestants(expireLe, now): number   // jours CALENDAIRES Africa/Douala : date(expireLe) − date(now)
etatForfait(forfait, expireLe, now): 'SANS_ECHEANCE' | 'ACTIF' | 'ECHEANCE_PROCHE' | 'GRACE' | 'EXPIRE'
forfaitEffectif(forfait, expireLe, now): Forfait   // 'GRATUIT' si EXPIRE, sinon `forfait`
```

**Une seule mesure du temps dans toute la fonctionnalité : `J = joursRestants`, en jours calendaires à
Douala.** États, relances (J-30, J-7…), bandeau (J ≤ 7) et règle de prolongation l'utilisent tous. Une
durée en heures (« depuis 14 × 24 h ») donnerait un résultat différent selon l'heure de passage de la
tâche nocturne. `J = 0` = dernier jour payé, encore couvert (l'échéance est la fin de cette journée).

| État | Condition | Capacités |
|---|---|---|
| `SANS_ECHEANCE` | `expireLe = NULL` (GRATUIT, ou Pro historique) | du forfait enregistré |
| `ACTIF` | `J > 30` | du forfait |
| `ECHEANCE_PROCHE` | `0 ≤ J ≤ 30` | du forfait |
| `GRACE` | `-14 ≤ J ≤ -1` | du forfait |
| `EXPIRE` | `J < -14` | **GRATUIT** |

**Pourquoi calculé et non rétrogradé par une tâche de nuit** : si la tâche échoue une nuit, l'accès se
prolonge **en silence**, et la bascule a jusqu'à 24 h de retard. Le calcul est toujours juste et testable
sans horloge réelle (règle du dépôt : dériver plutôt que tenir à jour). **Le forfait enregistré ne change
jamais tout seul** ; la console affiche « Pro — expiré le … ».

**Tout contrôle de capacité passe par `forfaitEffectif`** : quota de membres (création, import,
réactivation), quota de stockage, paiement en ligne. Aucun lecteur ne lit `Organisation.forfait` brut
pour décider d'une capacité.

### 2.4 Fuseau

L'échéance est la **fin de journée `Africa/Douala`** du dernier jour payé. Nouveau helper
`finDeJourneeApp(date)` dans `lib/date-app.ts` (+ miroir), aux côtés de `anneeCouranteApp`/`moisCourantApp`.
Douala n'a pas d'heure d'été (UTC+1 constant), mais on passe quand même par le helper — jamais
`setHours(23, 59)` sur l'horloge du serveur (UTC).

### 2.5 Prolongation

`nouvelleEcheance(expireLe, now, mois)` (pure) :

- **Base = ancienne échéance** si `J ≥ -14` (payé avant la fin de la grâce : la grâce n'est pas du
  temps offert, payer en avance ne fait perdre aucun jour) ;
- **Base = aujourd'hui** sinon (état `EXPIRE`, ou `expireLe = NULL`) ;
- résultat = `finDeJourneeApp(base + mois)`. `mois ∈ {1, 3, 6, 12}`.

Passer une organisation en **GRATUIT** efface `forfaitExpireLe`.

## 3. API

### 3.1 Plateforme (garde `requireSuperAdmin`, `runUnscoped` justifié dans l'allowlist)

| Route | Effet |
|---|---|
| `POST /platform/organisations/:id/forfait/prolonger` `{ mois: 1\|3\|6\|12, apercu?: boolean }` | `apercu: true` → renvoie `{ echeanceActuelle, nouvelleEcheance, etatApres }` **sans écrire** ; sinon écrit et journalise `PROLONGER_FORFAIT` (snapshot avant/après). 404 si id inconnu ; 409 si forfait GRATUIT. |
| `PATCH /platform/organisations/:id/forfait` (existante) | Inchangée, sauf : passage à GRATUIT → `forfaitExpireLe = NULL`. |
| `GET /platform/organisations` (existante) | Ajoute `forfaitExpireLe`, `etatForfait`. |

**L'aperçu est calculé côté serveur** : la même fonction produit l'aperçu et l'écriture, aucun risque que
l'écran montre une date et que le serveur en écrive une autre.

### 3.2 Organisation (lecture existante enrichie)

`GET /organisations/moi` ajoute : `forfaitExpireLe`, `etatForfait`, `forfaitEffectif`,
`capacites` (effectives), `stockageUtiliseOctets` (`aggregate` scopé sur `Document.tailleOctets` — sûr,
cf. CLAUDE.md), `paiementEnLigneAcquis`.

### 3.3 Contrôles de capacité

| Point d'entrée | Contrôle | Refus |
|---|---|---|
| `POST /membres`, `POST /membres/import`, `PATCH /membres/:id` (→ ACTIF) | quota **actifs** du forfait **effectif** (logique PR #131) | 403 existant |
| `POST /documents` | `stockageUtilise + taille > quota effectif` | 403 `documents.quotaStockage` (utilisé / quota, en Mo) |
| `PUT /organisations/moi/paiement` (configuration) | `capacites.paiementEnLigne \|\| paiementEnLigneAcquis` | 403 `paiement.reserveForfaitPro` |
| `POST /moi/paiements` (démarrage) | idem | 403 |
| `GET /moi/paiement-disponible` | `actif` **et** (capacité **ou** acquis) | `{ actif: false }` — le bouton disparaît, aucun message au membre |
| **Webhooks** `/webhooks/fapshi`, `/webhooks/campay`, **réconciliation** `*/15`, `confirmerPaiement` | **AUCUN contrôle de forfait — jamais** | — |

> ⚠️ **Invariant critique** : un membre qui a payé doit voir son versement enregistré, même si
> l'abonnement de son association a expiré entre le démarrage et la confirmation. Seul le **démarrage**
> d'un nouveau paiement est soumis au forfait. Verrouillé par un test dédié (§5).

## 4. Relances et écrans

### 4.1 Relances (scheduler nocturne existant)

- **Étapes** : `J = 30`, `J = 7`, `J = 1`, entrée en grâce (`J = -1`). Une par nuit au plus : si la tâche
  n'a pas tourné pendant plusieurs jours, seule l'étape la plus récente atteinte est envoyée (pas de rafale
  de rattrapage).
- **Destinataires** : comptes **ADMIN** et **PRESIDENT** de l'organisation. Jamais les autres rôles ni
  les membres.
- **Canaux** : notification `FORFAIT_ECHEANCE` + push + **e-mail**. `EmailClient` ne sait envoyer qu'un
  document (`envoyerDocument`) : ajout de `envoyerMessage(email, sujet, texte)`, même contrat (mockable,
  best-effort, **ne lève jamais**, no-op sans configuration Resend).
- **Langue et devise du destinataire** (règle i18n du dépôt).
- **Dédoublonnage** : motif de `REUNION_RAPPEL` — `Notification.entiteType = 'Organisation'`,
  `entiteId = '<organisationId>#<expireLe ISO>#<étape>'`. Une prolongation change `expireLe` → le cycle
  se **réarme** de lui-même.
- **Non désactivable** (avis de service). ⚠️ Les préférences sont **dérivées** de `TYPES_NOTIFICATION`
  (`notifications.route.ts`, `Object.fromEntries`) : `FORFAIT_ECHEANCE` n'y est **pas** ajouté. Nouveau
  garde `tests/types-notification-parity.test.ts` : `TYPES_NOTIFICATION ∪ { FORFAIT_ECHEANCE }` = enum
  Postgres `TypeNotification` (lu dans le schéma) — un futur type ne peut ni être oublié, ni devenir
  désactivable par accident.
- **Boucle org par org sous `orgContext.run`** (comme les autres tâches) ; envois HTTP **après** le commit.

### 4.2 Console super-admin

- Colonne **Échéance** triable : date + badge (`Actif`, `J-12`, `Grâce J+3`, `Expiré`, `—`).
- Filtre **« À relancer »** = `ECHEANCE_PROCHE ∪ GRACE ∪ EXPIRE` (forfait enregistré non GRATUIT) ;
  compteur en tête.
- Fiche organisation : bloc **Échéance** + bouton **Prolonger** → fenêtre `Modal` (piège de focus
  existant) : choix 1/3/6/12 mois, **aperçu serveur** de la nouvelle date, confirmation.
- Historique plateforme existant : libellé i18n de `PROLONGER_FORFAIT`.
- Hors périmètre : action « échéance permanente ».

### 4.3 Paramètres (`/parametres`)

Carte Forfait : nom, « valable jusqu'au … », badge d'état, jauge membres **actifs** (existante), jauge
**stockage**, « Paiement en ligne : inclus / non inclus ». En `ECHEANCE_PROCHE`/`GRACE`/`EXPIRE` :
explication + bouton **« Nous contacter pour renouveler »** (`mailto:` construit depuis
`lib/contact.ts`). Correction au passage : plafond vide en Pro dans l'aperçu d'import.

### 4.4 Bandeau (coquille `AppShell`, haut de `#contenu-principal`)

Visible des seuls **ADMIN** et **PRESIDENT** (miroir `peutGererForfait` dans `lib/roles.ts`).

| État | Ton | Fermable | Message |
|---|---|---|---|
| `ECHEANCE_PROCHE` et `J ≤ 7` | info | pour la session | « Votre forfait Pro arrive à échéance le … » |
| `GRACE` | or (`--amber`) | **non** | « Forfait expiré le … : les fonctionnalités Pro restent actives jusqu'au … » |
| `EXPIRE` (forfait enregistré non GRATUIT) | neutre | pour la session | « Forfait Pro expiré : fonctionnalités Pro suspendues, rien n'est perdu. » |

Rien de J-30 à J-8 (la notification suffit). Le bandeau `EXPIRE` disparaît quand l'opérateur prolonge
**ou** repasse l'organisation en GRATUIT depuis la console — c'est l'acte qui clôt une relation
commerciale, pas l'écoulement du temps. `role="status"`, jamais `alert`. Jetons du design system,
aucune valeur oklch en dur. Fermeture de session en `sessionStorage` (accès protégé par `try/catch`).

### 4.5 Refus contextualisés

- Plafond de membres : message existant + lien vers Paramètres.
- Stockage plein : « Espace de stockage plein (480 Mo sur 500 Mo). Les documents existants restent
  consultables. »
- Paiement en ligne en Gratuit (non acquis) : carte `ConfigPaiement` verrouillée « Inclus dans le forfait Pro ».

### 4.6 Retour à Gratuit — ce qui ne se passe jamais

Aucune suppression, aucune désactivation. Membres au-delà de 50 : intacts (seuls ajout, import et
réactivation bloqués). Documents au-delà du quota : consultables et téléchargeables (seul l'envoi est
bloqué). Export des données : toujours disponible.

### 4.7 Textes publics

Page d'accueil et CGU §4 alignées sur §1.2 : retrait de « Documents illimités », « Export avancé »,
« fédérations » ; paiement en ligne présenté comme argument Pro ; mention du stockage. **Livré avec
l'étape qui active les quotas** (§6, étape 3), jamais après.

## 5. Tests

| Niveau | Contenu |
|---|---|
| Unitaires purs | `joursRestants` (changement de jour à minuit **Douala**, pas UTC) ; `etatForfait` aux bornes exactes `J = 31, 30, 0, -1, -14, -15` ; `forfaitEffectif` ; `nouvelleEcheance` (avant échéance, en grâce, après grâce, `NULL`) ; `finDeJourneeApp` |
| Parité | `CAPACITES_FORFAIT` back ↔ front (lu en texte) ; `TYPES_NOTIFICATION ∪ {FORFAIT_ECHEANCE}` ↔ enum Postgres |
| Routes (mocks) | prolongation (aperçu n'écrit rien, journalisation, 409 GRATUIT, 403 non super-admin) ; relances (destinataires ADMIN/PRESIDENT seulement, dédoublonnage, réarmement après prolongation) |
| **Intégration (vraie Postgres)** | quota de stockage (`aggregate` scopé) ; quota membres sous forfait **effectif** expiré ; **confirmation de paiement d'une org expirée → versement créé** (le test critique de §3.3) ; backfill `paiementEnLigneAcquis` |
| Front (jsdom) | bandeau : rôles, états, fermeture de session, `role="status"` |

Chaque garde de parité est **saboté dans la direction utile** avant d'être considéré comme vert
(méthode `docs/architecture-garde-fous.md`).

## 6. Ordre de livraison

Chaque étape est une PR autonome, déployable seule, **sans jamais bloquer une capacité avant que
l'opérateur puisse prolonger** :

1. **Capacités** — `CAPACITES_FORFAIT` + miroir + parité. Refactor pur, comportement inchangé.
2. **Échéance** — migrations `forfaitExpireLe` et `PROLONGER_FORFAIT`, fonctions pures, `finDeJourneeApp`,
   route de prolongation + aperçu, forfait **effectif** dans le quota de membres, console (colonne, filtre,
   prolongation), Paramètres (affichage).
3. **Quotas** — *calibrage du stockage mesuré en production d'abord* — stockage documents, paiement en
   ligne (+ migration `paiementEnLigneAcquis` et backfill), test critique de confirmation, textes publics
   (accueil + CGU).
4. **Relances et bandeau** — enum `FORFAIT_ECHEANCE`, `envoyerMessage`, tâche nocturne, garde de parité
   des types, bandeau `AppShell`.

À l'issue : mise à jour de `CLAUDE.md` (section Forfaits) et création de
`docs/architecture-forfaits.md` (détail + défauts rencontrés), selon la règle de maintenance du dépôt.

## 7. Hors périmètre

Paiement en ligne des forfaits (Stripe ou Mobile Money) ; action « échéance permanente » ;
fédérations / multi-organisations ; export avancé ; qualification fiscale des abonnements (expert-comptable).
