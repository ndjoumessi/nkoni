# Forfaits — paliers, échéance, quotas (chantier 1.1, spec `2026-09-12-forfaits-echeance-design.md`)

> Référence détaillée pointée par `CLAUDE.md` (§ Forfaits SaaS §3.1). `CLAUDE.md` n'en garde que le
> pointeur et les invariants ; le détail (capacités, échéance, relances, quotas, défauts vécus) vit ici.
> Chantier 1.1 = vente **assistée** (option A, spec §0) : attribution manuelle par le SUPER_ADMIN,
> **pas** de paiement en ligne des forfaits eux-mêmes — le socle échéance/prolongation est celui sur
> lequel un paiement self-service se branchera plus tard.

## 1. Principe et capacités

**Ce qui n'est jamais vendu** (spec §1.1) : la transparence envers les membres reste gratuite en
tout — statut, reçus, espace `/moi/*`, carte à QR. C'est la promesse centrale du produit ; une
association Gratuite qui en montrerait moins à ses membres saperait l'argument même de NKONI. On ne
vend que l'échelle (membres), ce qui coûte à NKONI (stockage) et ce qui fait gagner du temps/argent au
bureau (paiement en ligne). Corollaire d'interface : **un membre ne voit jamais de message
commercial** — une capacité absente lui est simplement absente, sans explication payante (cf. §4).

Table des capacités, source unique `backend/src/lib/forfait.ts::CAPACITES_FORFAIT` (miroir
`frontend/src/lib/forfait.ts`, parité `frontend/src/lib/forfait-parity.test.ts` qui lit les deux
fichiers en TEXTE — le front ne peut pas importer le backend) :

| Capacité | GRATUIT | PRO | ENTREPRISE |
|---|---|---|---|
| Membres actifs | 50 | illimité | illimité |
| Stockage des documents | 500 Mo | 20 Go | 20 Go |
| Paiement en ligne Mobile Money | non | oui | oui |

Entreprise est **techniquement** Pro (mêmes capacités) ; la différence est contractuelle
(accompagnement, facturation annuelle — un service, pas une ligne de code). `limiteMembresForfait`
reste exportée comme **dérivation** de `CAPACITES_FORFAIT[f].limiteMembres` (appelants historiques
inchangés). Tontines et votes restent gratuits pour tous les forfaits (segment phare, pas une cible à
fermer). Photos hors quota de stockage (bornées séparément, 5 Mo/membre × nombre de membres).

## 2. Échéance du forfait

Un forfait payant peut porter une **date de fin** (`Organisation.forfaitExpireLe`, `NULL` = sans
échéance ; GRATUIT est toujours `NULL`, les Pro historiques restent `NULL` au déploiement — aucune
rétrogradation de masse). Tout, autour de cette date, est **calculé** dans `backend/src/lib/forfait.ts`
et **jamais stocké** — une tâche de nuit en échec prolongerait l'accès en silence si l'état était écrit
quelque part :

- `joursRestants(expireLe, now)` — une **seule** mesure du temps dans toute la fonctionnalité : jours
  **calendaires** à `Africa/Douala` (`joursCalendairesEntreApp`, `lib/date-app.ts`), jamais une durée en
  heures (le résultat dépendrait de l'heure de passage de la tâche nocturne). `J = 0` = dernier jour
  payé, encore couvert.
- `etatForfait(forfait, expireLe, now)` — `SANS_ECHEANCE` (Gratuit ou Pro historique) / `ACTIF`
  (`J > 30`) / `ECHEANCE_PROCHE` (`0 ≤ J ≤ 30`) / `GRACE` (`-14 ≤ J ≤ -1`) / `EXPIRE` (`J < -14`).
- `forfaitEffectif(forfait, expireLe, now)` — `GRATUIT` si `EXPIRE`, sinon le forfait enregistré.
  **Tout contrôle de capacité passe par cette fonction** (§4) : jamais `Organisation.forfait` brut. Le
  forfait **enregistré** ne change jamais tout seul ; la console affiche « Pro — expiré le … ».
- `nouvelleEcheance(expireLe, now, mois)` — prolongation (mois ∈ {1, 3, 6, 12}) : base = l'**ancienne**
  échéance tant que `J ≥ -14` (la grâce n'est pas du temps offert : payer en avance ne fait perdre aucun
  jour), sinon aujourd'hui (état `EXPIRE` ou `expireLe = NULL`). Résultat = `finDeJourneeApp(base + mois)`.

`vueEcheance(...)` assemble ces champs (`forfaitExpireLe`, `etatForfait`, `joursRestants`,
`finGraceLe`, `forfaitEffectif`) en une vue **renvoyée telle quelle** par `GET /organisations/moi` : le
front **affiche** ces valeurs sans les recalculer (aucun miroir de logique côté client), et formate les
dates avec `formatDateApp` — jamais `formatDate` (cf. §5, défaut vécu).

**Prolongation** (`services/organisation.service.ts::prolongerForfaitOrganisation`,
`POST /platform/organisations/:id/forfait/prolonger`, SUPER_ADMIN) : aperçu et écriture passent par la
**même fonction** `nouvelleEcheance` — la console montre exactement la date qui sera écrite. L'écriture
est **liée à l'aperçu** : l'appelant hors aperçu doit fournir `echeanceAttendue` (l'échéance qu'il a vue)
et `nouvelleEcheanceAttendue` (la date annoncée) ; si l'un des deux ne correspond plus à ce qu'une
lecture fraîche calcule (réponse perdue, second clic, deux onglets, minuit Douala franchi entre-temps),
rien n'est écrit (`ProlongationConcurrenteError` → 409) — l'écriture valide ce que l'aperçu a **montré**,
pas une date qui aurait pu changer entre-temps. `updateMany.where` porte aussi `forfait: org.forfait` :
un passage en GRATUIT (qui efface l'échéance, §4.6) entre-temps ne se fait jamais écraser par une
prolongation qui le croit encore payant. 409 sur GRATUIT (rien à prolonger), trace plateforme
`PROLONGER_FORFAIT` (snapshot avant/après).

## 3. Relances et bandeau

**Relances de nuit** (`services/forfait-relances.service.ts`, branché dans le scheduler existant) :
pour chaque organisation active à forfait payant daté, l'étape **la plus récente atteinte**
(`etapeRelanceForfait` : `J30`/`J7`/`J1`/`GRACE`) est notifiée — jamais un rattrapage en rafale si la
tâche a manqué plusieurs nuits, seule l'étape en cours part. Destinataires : comptes **ADMIN** et
**PRESIDENT** actifs de l'organisation, jamais les autres rôles ni les membres (une affaire commerciale
entre NKONI et le bureau). Canaux : notification `FORFAIT_ECHEANCE` + push + e-mail
(`envoyerMessageEmail`), dans la langue et la devise du **destinataire**. **Dédoublonnage** par
`entiteId = <organisationId>#<expireLe ISO>#<étape>` : une prolongation change `expireLe`, donc la clé,
et le cycle se **réarme** de lui-même. **Non désactivable** : `FORFAIT_ECHEANCE` est absent de
`TYPES_NOTIFICATION` (dont dérivent les préférences) et listé dans
`TYPES_NOTIFICATION_NON_DESACTIVABLES`, gardé par `tests/types-notification-parity.test.ts`. Push et
e-mails sont **collectés** pendant la boucle (`orgContext.run` par organisation, comme les autres tâches
de nuit) et **livrés après le commit** de la transaction — jamais d'appel réseau dans une transaction.

**Suppression logique des notifications** (`Notification.masqueeLe`) : le dédoublonnage ci-dessus
repose sur l'**existence** de la ligne `Notification` ; `supprimerNotification` faisait auparavant un
`deleteMany`, donc écarter une relance de forfait la faisait **revenir chaque nuit** (§5, défaut vécu).

**Bandeau** (`frontend/src/components/BandeauForfait.tsx`, règle pure `lib/bandeau-forfait.ts`) : visible
des seuls ADMIN/PRESIDENT (miroir `peutGererForfait` de `lib/roles.ts`, gardé par
`roles-parity.test.ts`). `ECHEANCE_PROCHE` avec `joursRestants ≤ JOURS_BANDEAU_PROCHE` (7, la
notification suffit avant) → ton info, fermable pour la session ; `GRACE` → ton or, **jamais
fermable** (spec) ; `EXPIRE` sur un forfait enregistré non GRATUIT → ton neutre, fermable. `role="status"`,
jamais `alert`. La clé de fermeture (`idFermeture`) inclut l'échéance ET l'état : un nouvel état se
ré-affiche même si l'ancien avait été fermé. Fermeture en `sessionStorage` (accès protégé par
`try/catch`, navigation privée/blocage tolérés).

## 4. Quotas (étape 3)

Point d'entrée unique : `backend/src/services/capacites-organisation.service.ts`, lu par les routes
documents, paiement et `GET /organisations/moi`. `chargerCapacitesOrganisation` relit l'organisation,
calcule le **forfait effectif** (§2) et renvoie `capacites` (celles du forfait effectif),
`paiementEnLigneAcquis` (colonne brute) et `paiementEnLigneInclus` (`capacites.paiementEnLigne ||
paiementEnLigneAcquis` — le droit acquis, §1.3, survit à l'expiration).

- **Stockage** (`POST /documents`, `verifierQuotaStockage`) : `stockageUtiliseOctets` agrège
  `Σ Document.tailleOctets` **côté Postgres** (`document.aggregate`, sûr sur un modèle scopé — CLAUDE.md,
  ne pas rapatrier les lignes) ; photos et reçus sont hors quota (Documents seulement). Le contrôle
  refuse un envoi qui **dépasserait** le quota (limite incluse : atteindre exactement le quota passe),
  et une organisation introuvable retombe sur le quota GRATUIT — le plus restrictif, jamais d'ouverture
  par défaut. **Non atomique** face à deux envois simultanés : un dépassement possible est borné à la
  taille d'un fichier (10 Mo, `TAILLE_MAX_OCTETS` de `document.service.ts`) — assumé : le quota protège
  un coût de stockage, pas un invariant financier, contrairement au solde de trésorerie.
- **Paiement en ligne** : contrôlé à quatre endroits distincts — la **configuration**
  (`PUT /organisations/moi/paiement`, refusée y compris pour désactiver une config existante — choix
  de simplicité fidèle à la spec, la plateforme peut le faire au besoin), le **démarrage**
  (`POST /moi/paiements`, message **neutre** au membre — jamais `paiement.reserveForfaitPro`, réservé au
  bureau sur le PUT : la spec §1.1 « un membre ne voit jamais de message commercial » prime), l'**indice** `GET /moi/paiement-disponible` (`{ actif: false }` sans explication —
  le bouton « Payer » disparaît simplement) et la carte `ConfigPaiement` verrouillée côté Paramètres
  (« inclus dans le forfait Pro »). **⚠️ La confirmation d'un paiement ne les lit jamais** :
  webhooks Fapshi/CamPay, réconciliation `*/15` et `confirmerPaiement` créent le versement sans consulter
  le forfait — un membre qui a payé voit son versement enregistré même si l'abonnement de son
  association a expiré entre le démarrage et la confirmation (spec §3.3, invariant critique).
- **Droit acquis** (`Organisation.paiementEnLigneAcquis`, migration
  `20260914120000_organisation_paiement_en_ligne_acquis`) : `false` par défaut, **backfillé à `true`**
  dans la même migration pour toute organisation ayant déjà une ligne `ParametrePaiement` — couper un
  flux d'argent déjà en service serait brutal. Aucune date « magique » en code : le mécanisme est
  explicite et auditable (une colonne, un backfill, dans la même migration).
- **Retour à Gratuit — ce qui ne se passe jamais** (spec §4.6) : aucune suppression, aucune
  désactivation. Passer une organisation en GRATUIT efface `forfaitExpireLe` (repasser Pro plus tard ne
  ressuscite pas un état « expiré » trompeur), mais ne touche ni aux membres au-delà de 50 (seuls ajout,
  import, réactivation sont bloqués), ni aux documents au-delà du quota (consultables/téléchargeables,
  seul l'envoi est bloqué), ni à l'export des données (toujours disponible). `paiementEnLigneAcquis`
  n'est jamais réinitialisé par un changement de forfait : le droit acquis survit tel quel.

## 5. Défauts vécus

- **Quota de membres qui comptait tous les membres (pas seulement les actifs), et réactivation non
  contrôlée** (PR #131, prérequis de la spec citée en §0) : l'écran Paramètres affichait les actifs
  alors que création, import et le compteur de la console super-admin comptaient tous les membres, et
  repasser une fiche inactive en ACTIF ne contrôlait rien. Verrouillé en intégration —
  `backend/tests/membres-quota.integration.test.ts` (les mocks de `membre.count` ignorent le `where`,
  ce quota ne se prouve qu'en intégration).
- **Échéances affichées au lendemain depuis Paris** : une date d'échéance formatée avec `formatDate`
  (fuseau du poste) plutôt que `formatDateApp` (Douala) glisse d'un jour l'été depuis l'Europe. Les
  relances (`forfait-relances.service.ts::rediger`) et le front n'utilisent que `formatDateApp` —
  couvert par les tests unitaires purs de `lib/forfait.ts`/`date-app.ts`
  (`backend/tests/forfait.test.ts`, `forfait-echeance.test.ts`) qui fixent `now` à des bornes exactes
  autour de minuit Douala.
- **Double prolongation après une réponse perdue** (second clic, deux onglets, minuit Douala franchi) :
  sans lien entre l'aperçu montré et l'écriture, rejouer une prolongation après un timeout réseau
  aurait pu prolonger deux fois. Résolu par l'écriture liée à l'aperçu (§2) ; verrouillé en intégration —
  `backend/tests/forfait-prolongation.integration.test.ts` (cas 2 : rejouer exactement le même corps →
  409, la date en base ne bouge pas).
- **Front déployé avant le backend** : un déploiement Vercel/Railway décorrélé (cf. Watch Path dans `CLAUDE.md`) peut afficher un front qui attend `capacites`/`etatForfait`/
  `stockageUtiliseOctets` alors que l'API ne les renvoie pas encore. Toutes les lectures de ces champs
  sont gardées par `!== undefined`/`== null` (jamais un accès direct qui lèverait) — `ParametresPage.tsx`
  et `lib/bandeau-forfait.ts::bandeauForfait` (« API pas encore déployée »). Verrouillé par
  `frontend/src/lib/bandeau-forfait.test.ts` (cas « champs absents »).
- **Notification supprimée qui réarmait la relance chaque nuit** : `supprimerNotification` faisait un
  `deleteMany`, donc écarter une relance de forfait la faisait revenir à la nuit suivante — le
  dédoublonnage (`findFirst` sur destinataire/type/entité) ne trouvait plus la ligne effacée. Corrigé
  par la suppression **logique** (`Notification.masqueeLe`, migration
  `20260914090000_notification_masquee_le`, additive et nullable, aucun backfill nécessaire —
  `masqueeLe IS NULL` ⇒ visible pour tout l'historique). Verrouillé en intégration, contre une vraie
  Postgres car le défaut traversait deux couches (scheduler + route DELETE authentifiée) —
  `backend/tests/forfait-relances.integration.test.ts`.
- **Twins `formatTailleOctets` (front/back) divergents près de 1 Go** : les deux implémentations
  choisissaient l'unité (Mo/Go) avant d'arrondir, produisant « 1 024 Mo » juste sous 1 Go côté backend au
  lieu de « 1 Go » — un écart visible seulement à la frontière exacte. Alignés (unité choisie **après**
  arrondi) ; verrouillé par `backend/tests/format-taille-octets.test.ts` et
  `frontend/src/lib/format-taille.test.ts` (cas GO-1, juste sous 1 Go).
- **Jauge de stockage sans texte accessible** : la barre de progression `/parametres` n'exposait qu'un
  pourcentage via ARIA (`aria-valuenow`/`aria-valuemax`), illisible pour un lecteur d'écran sans faire le
  calcul. Un `aria-valuetext` explicite (« 480 Mo sur 500 Mo ») a été ajouté.
- **Non atomique, quota de stockage** (assumé, pas corrigé) : deux envois simultanés proches du quota
  peuvent tous deux passer le contrôle avant que l'un des deux n'écrive — le dépassement possible reste
  borné à la taille d'un fichier (10 Mo). Documenté en commentaire (`capacites-organisation.service.ts`)
  plutôt que verrouillé par un test : ce n'est pas un invariant financier, contrairement au solde de
  trésorerie qui, lui, ne tolère aucune fenêtre de concurrence.

## 6. Tests

- **Unitaires purs** — `backend/tests/forfait.test.ts`, `forfait-echeance.test.ts`,
  `forfait-relance-etape.test.ts`, `forfait-capacites-effectives.test.ts` : `joursRestants` aux bornes
  exactes (`J = 31, 30, 0, -1, -14, -15`), `etatForfait`, `forfaitEffectif`, `nouvelleEcheance` (avant
  échéance, en grâce, après grâce, `NULL`), `etapeRelanceForfait`, `capacitesEffectives` ;
  `finDeJourneeApp` dans `date-app.test.ts`, `formatTailleOctets` dans `format-taille-octets.test.ts`.
  Front : `frontend/src/lib/forfait.test.ts`, `echeance-forfait.test.ts`, `bandeau-forfait.test.ts`,
  `format-taille.test.ts`.
- **Parité inter-couches** — `frontend/src/lib/forfait-parity.test.ts` (`CAPACITES_FORFAIT` back ↔
  front) et `frontend/src/lib/roles-parity.test.ts` (`peutGererForfait` ↔ `ROLES_RELANCE_FORFAIT`) ;
  `backend/tests/types-notification-parity.test.ts` (`TYPES_NOTIFICATION ∪ {FORFAIT_ECHEANCE}` ↔ enum
  Postgres).
- **Services et routes (mocks)** — `backend/tests/capacites-organisation.service.test.ts`,
  `forfait-relances.service.test.ts`,
  `forfait-relances-livraison.test.ts` (destinataires ADMIN/PRESIDENT seulement, dédoublonnage,
  livraison après commit) ; `documents-quota.route.test.ts` (403 avec utilisé/quota, aucun envoi au
  Blob) ; `paiement-forfait.route.test.ts` (configuration/démarrage refusés, message neutre au membre).
  Aucune de ces routes ne prouve les `where` : les mocks d'`aggregate`/`count` ignorent leurs arguments.
- **Intégration (vraie Postgres)** —
  `documents-quota.integration.test.ts` (`aggregate` scopé, somme > 2³¹, forfait Pro expiré) ;
  `membres-quota.integration.test.ts` (actifs seulement, réactivation, forfait effectif expiré) ;
  `forfait-prolongation.integration.test.ts` (écriture liée à l'aperçu, double clic → 409, passage
  GRATUIT) ; `forfait-relances.integration.test.ts` (suppression logique, non-réarmement) ;
  `paiement-forfait-expire.integration.test.ts` (confirmation de paiement jamais bloquée par un forfait
  expiré — le test critique de la spec §3.3).
- **Front (jsdom)** — `BandeauForfait.test.tsx`, `EcheanceForfaitOrganisation.test.tsx`,
  `plateforme/ProlongationForfait.test.tsx` (rôles, états, fermeture de session, `role="status"`),
  `ConfigPaiement.test.tsx` (carte verrouillée quand le paiement en ligne n'est pas inclus).
