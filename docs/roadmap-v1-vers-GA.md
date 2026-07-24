# NKONI — Feuille de route « v1 production » → « v1.0 GA »

_État de départ : produit multi-tenant déployé (Vercel + Railway), fonctionnellement complet et
durci après audit (UI/UX, sécurité, architecture). ~44 000 lignes TS, 30 routes / 33 services
backend, 34 pages frontend, ~660 tests, CI active. Ce qui manque pour une **mise à disposition
générale (GA)** n'est pas fonctionnel mais **opérationnel** : fiabilité, données, légal,
commercialisation, support._

La feuille de route est organisée en trois phases. La **Phase 0** regroupe les bloquants : rien ne
devrait s'ouvrir au grand public tant qu'ils ne sont pas traités. Les phases 1 et 2 peuvent se
paralléliser une fois la Phase 0 engagée.

---

## Définition de « GA » (critères de sortie)

On déclare la v1.0 GA quand, simultanément : (1) une panne ou une erreur serveur est **détectée et
alertée** automatiquement ; (2) une perte de base est **récupérable** par une restauration testée ;
(3) un client peut s'inscrire, comprendre le produit seul et **exporter/supprimer ses données** ; (4)
les **mentions légales** (confidentialité, CGU) sont en ligne ; (5) les **notifications partent
réellement** (canal officiel ou repli) ; (6) le **modèle commercial** (gratuit → payant) est décidé
et opérationnel, même en vente assistée.

---

## Phase 0 — Bloquants GA (à traiter en premier)

| # | Chantier | Pourquoi c'est bloquant | Effort |
|---|----------|--------------------------|--------|
| 0.1 | **Observabilité** — Sentry back + front, + alerte sur échecs scheduler et échecs d'écriture d'audit (aujourd'hui `console.error` silencieux), + monitoring de disponibilité (`/health`). → **Code livré** : couche `ObservabiliteClient` (back + front), 3 points aveugles câblés (5xx, échec d'audit, échec de scheduler), tri du bruit réseau côté PWA, inerte sans DSN. **`ErrorBoundary` React LIVRÉ** (`a51b8be`) : monté au sommet de l'arbre (`main.tsx`), capte les crashes de rendu, les signale via la couche `observabilite` (inerte sans DSN) et affiche un fallback lisible (`ErrorState` « Une erreur inattendue est survenue » + rechargement) au lieu de l'écran blanc ; 3 tests jsdom. **Reste à faire (actions PO uniquement)** : créer 2 projets Sentry (back + front, DSN distincts), poser `SENTRY_DSN` sur Railway et `VITE_SENTRY_DSN` sur Vercel, brancher un moniteur de disponibilité externe sur `/health`. | Sans détection d'erreur, une panne en prod passe inaperçue jusqu'à ce qu'un client la signale. Point M7 de l'audit, resté ouvert. | Faible |
| 0.2 | **Sauvegardes & restauration** — backups Postgres automatiques (Railway ou dump planifié hors-site), **test de restauration** réel documenté, vérification de la durabilité du store Blob (reçus, photos, documents). → **Procédure écrite : [`RUNBOOK_sauvegardes_restauration.md`](RUNBOOK_sauvegardes_restauration.md)** (critères d'acceptation en §6). Reste à faire : dérouler un premier exercice de restauration et le consigner. | Produit de **transparence financière** : une perte de données de cotisations/reçus est fatale à la confiance. Un backup non testé n'est pas un backup. | Faible/Moyen |
| 0.3 | **Protection des données & légal** — politique de confidentialité + CGU en ligne ; **export** complet des données d'un tenant et **suppression** (offboarding) ; politique de rétention. → **Part technique LIVRÉE** : `GET /platform/organisations/:id/export` (JSON des 26 modèles + manifeste des pièces jointes) et `DELETE /platform/organisations/:id` (SUPER_ADMIN, double verrou suspension + nom de confirmation, purge transactionnelle puis blobs). **Export SELF-SERVICE tenant LIVRÉ** (décision tranchée) : `GET /organisations/moi/export` (ADMIN/PRESIDENT, scopé, réutilise `assemblerExportOrganisation` sans `runUnscoped`) + bouton « Exporter (JSON) » sur `/parametres` ; vérifié en prod. **Fuite corrigée** : l'export (self-service ET plateforme) renvoyait `Utilisateur.passwordHash` — la lecture porte désormais `omit: { passwordHash: true }`, régression verrouillée en intégration. **Confidentialité + CGU mises EN LIGNE** (`/confidentialite`, `/cgu`, publiques, layout `PageLegale`) mais **EN JET** : mentions société (`RAISON SOCIALE`, `NUMÉRO D'IMMATRICULATION`, `ADRESSE DU SIÈGE`, `DATE DE PUBLICATION`) laissées en **placeholders visibles** tant que l'entité n'est pas immatriculée (ne pas publier de valeurs fabriquées sur un document légal). **Reste à faire** : compléter les mentions société une fois l'entité créée, faire relire le juridique, définir la politique de rétention. **Journalisation plateforme livrée** : `PlatformAuditLog` (non scopé, snapshot `organisationCibleId`/`organisationNom`) trace les 5 actions SUPER_ADMIN ; la purge journalise en FAIL-CLOSED (pas de trace ⇒ pas de destruction). Vue `GET /platform/audit-log` + `/super-admin/historique`. Vérifié en conditions réelles (entrée `CHANGER_FORFAIT` GRATUIT → PRO confirmée). | On stocke des PII de membres (noms, téléphones, photos) et des données financières. Obligation légale et condition de confiance avant ouverture publique. | Moyen |
| 0.4 | **Canal de notification fiable** — finaliser les **templates WhatsApp pré-approuvés Meta** (compte Meta Business) **ou** brancher un repli (email transactionnel / SMS). → **Repli EMAIL LIVRÉ** (`ce0ce25`) : `EmailClient` mockable (**Resend**, pièce jointe base64, no-op sans `RESEND_API_KEY`/`RESEND_FROM`), `envoyerRecuEmail` best-effort (n'échoue jamais l'op métier) respectant `notificationsActives`, orchestrateur `envoyerRecu` (WhatsApp d'abord → email en repli), endpoint `POST /recus/:id/envoyer`, champ `Membre.email` (migration), bouton « Envoyer » sur les reçus affichant le canal utilisé, warning prod (`env.ts`) si AUCUN canal (ni WhatsApp `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_ID`, ni email `RESEND_API_KEY`/`RESEND_FROM`) n'est configuré. Tests service + orchestrateur. **✅ CANAL LIVE EN PROD (2026-07-22)** : `RESEND_API_KEY` + `RESEND_FROM=recus@send.nkoni.app` posés sur Railway, domaine `send.nkoni.app` vérifié dans Resend (SPF/DKIM), redéploiement `SUCCESS` (le warning « aucun canal » a disparu des logs de boot). **Envoi de bout en bout VÉRIFIÉ** : reçu envoyé depuis un membre réel → toast « envoyé par email » → Resend **Delivered**. Le repli email tient donc la promesse « au moins un canal fiable ». Les templates WhatsApp Meta restent une amélioration optionnelle (compte Meta Business), non bloquante. | Les relances de cotisation et l'envoi de reçus sont un cœur de valeur. **Bloquant levé** : un canal fiable (email Resend) délivre en prod. | Moyen |

---

## Phase 1 — Passage à l'échelle & commercialisation

| # | Chantier | Enjeu | Effort |
|---|----------|-------|--------|
| 1.1 | **Modèle commercial des forfaits** — décider *self-service* (paiement Mobile Money / carte via un PSP local ou Stripe, cycle d'abonnement, application des limites) **vs** *vente assistée* (attribution manuelle actuelle conservée pour la GA). → **Note (2026-07-24)** : l'**intégration PSP multi-provider est désormais LIVRÉE et éprouvée en prod** — mais pour la collecte des **COTISATIONS des membres**, pas (encore) des forfaits : CamPay **collecte directe** + Fapshi **checkout hébergé**, dispatcher `lib/psp-registry.ts` (routage par `creds.provider`), config chiffrée par org, webhooks publics `/campay`+`/fapshi` avec **confirmation par re-vérification authentifiée** (jamais confiance au corps), réconciliation `*/15`, montant min au runtime, UX de config (récap masqué + confirmation persistante). Détail complet dans `CLAUDE.md` § « Paiement en ligne / PSP ». **C'est le « plus gros morceau » de ce chantier** : le dispatcher est **réutilisable** pour facturer les forfaits en self-service. Reste à trancher le MODÈLE (cycle d'abonnement, application des limites) et à décider si on branche le paiement des forfaits sur cette même abstraction. | Aujourd'hui l'attribution de forfait est une action manuelle SUPER_ADMIN, sans paiement. Pour une GA grand public, il faut au minimum trancher le modèle ; l'intégration paiement — le plus gros morceau si self-service — est désormais **en grande partie dé-risquée** (abstraction PSP en prod). | Moyen/Élevé |
| 1.2 | **Onboarding self-service** — assistant de démarrage guidé, données d'exemple optionnelles, empty states pédagogiques, aide contextuelle, tutoriel « premiers pas ». | Un client qui s'inscrit seul doit atteindre sa première valeur (ajouter des membres, enregistrer un versement) sans accompagnement. Déterminant pour la conversion. | Moyen |
| 1.3 | **Pagination réelle des grandes listes** — au-delà du plafond actuel `PLAFOND_STATUTS_MEMBRES = 1000`, matérialiser/paginer le statut de cotisation pour les organisations PRO/ENTREPRISE illimitées. | Le plafond borné protège aujourd'hui, mais une grande organisation dépassera 1000 membres ; prérequis technique à l'offre « illimité ». | Moyen |
| 1.4 | **Revue de sécurité pré-GA** — audit de dépendances (SCA), rotation documentée des secrets, revue externe légère (pen-test) des flux auth / liens publics signés / isolation. | L'audit initial était interne (Fable 5). Une revue indépendante avant ouverture publique réduit le risque résiduel sur un produit financier. | Faible/Moyen |

---

## Phase 2 — Finitions, support & exploitation

| # | Chantier | Enjeu | Effort |
|---|----------|-------|--------|
| 2.1 | **Documentation** — guide utilisateur et guide administrateur (FR/EN), FAQ, page d'aide intégrée. | Réduit la charge de support et l'abandon. | Moyen |
| 2.2 | **Support & incidents** — page de statut publique, canal de support (email/formulaire), runbook d'incident et de communication, définition d'un SLA de disponibilité. → **LIVRÉ** : page de statut publique `/statut` (interroge `/health`, état opérationnel/incident/vérification, i18n FR/EN) + contact support (mailto), liée au footer · **`docs/RUNBOOK_incidents.md`** (gravités P1/P2/P3, boucle contenir-avant-diagnostiquer, 7 leviers de confinement du rollback à la restauration, catalogue de pannes, modèles de communication FR/EN, régime RGPD des fuites, post-mortem, journal) · **`docs/SLA_disponibilite.md`** (99 % mensuel, délais de réaction par gravité, maintenance, exclusions). **§8.3 FAIT** (`998d56f`) : endpoint **`/ready`** (`SELECT 1`, 200 / **503 `degraded`**, délai 3 s) SÉPARÉ de `/health`, consommé par `/statut` — `/health` reste sans dépendance car c'est le healthcheck Railway (le coupler à la base interdirait de déployer pendant un hoquet DB). Vérifié en prod : `/api/ready` → 200. **⚠️ Le SLA reste une cible SANS INSTRUMENT** tant que les 2 prérequis restants ne sont pas faits : (8.1) poser `SENTRY_DSN`/`VITE_SENTRY_DSN` — **absents de la prod, la couche d'alerte est dormante** ; (8.2) sonde externe sur **`/api/ready`** toutes les 5 min — sans elle `/ready` ne se déclenche que quand un humain ouvre `/statut`. **Reste optionnel** : bandeau d'incident éditable sur `/statut` (aujourd'hui purement automatique), historique d'incidents, formulaire de support (réutilisable via le client Resend). | Cadre d'exploitation attendu d'un SaaS payant. Le `RUNBOOK_bascule_prod` existe déjà comme base. | Faible/Moyen |
| 2.3 | **Décision sur les squelettes V2** — implémenter ou retirer du périmètre GA les modèles déclarés mais inertes (ex. `EvenementFamilial`). → **FAIT** : `EvenementFamilial` (coquille vide, sans route/service/UI) RETIRÉE du schéma — migration `remove_evenement_familial`, retrait de `SCOPED_MODELS` (26→25) et d'`ORDRE_SUPPRESSION`, parités tenant à jour. Plus aucune entité fantôme. | Éviter de livrer des entités « fantômes » ; clarifier le périmètre annoncé. | Faible |
| 2.4 | **Performance & montée en charge** — tests de charge ciblés (dashboard, exports, calcul de statuts), vérification anti-N+1, réglage des budgets de rate-limit. | Confirmer la tenue sous trafic réel multi-tenant avant d'ouvrir les vannes. | Moyen |
| 2.5 | **Passe WCAG finale** — vérification d'accessibilité de bout en bout (les fondations sont déjà solides : focus menthe, pièges de focus, équivalents chiffrés `sr-only`, navigation clavier ARIA). | Finaliser la conformité AA sur l'ensemble des parcours. | Faible |

---

## Séquencement suggéré

1. **Sprint 1–2 (bloquants techniques)** : 0.1 Observabilité + 0.2 Sauvegardes/restauration. Peu
   d'effort, impact maximal sur la fiabilité — à faire avant tout le reste.
2. **Sprint 2–4 (bloquants produit/légal, en parallèle)** : 0.3 Légal/données + 0.4 Canal de
   notification. Le légal peut avancer côté rédaction pendant que la technique traite l'observabilité.
3. **Sprint 4–8 (commercialisation)** : 1.1 Modèle de forfait (décision d'abord, intégration ensuite)
   + 1.2 Onboarding. C'est le chemin critique vers un lancement public monétisable.
4. **En continu** : 1.3 Pagination, 1.4 Revue sécurité, puis Phase 2 (doc, support, perfs, WCAG) au
   fil de l'eau et avant l'annonce GA.

---

## Reports assumés — dettes à traiter dans une version ultérieure

Choix délibérés, pris en connaissance de cause pendant l'implémentation des bloquants 0.1 à 0.3.
Aucun n'est un oubli : chacun a été écarté parce que son coût dépassait le besoin du moment. Ils
sont consignés ici pour ne pas survivre uniquement dans des messages de commit.

| # | Dette | Pourquoi reportée | Ce qui la rendra urgente |
|---|-------|-------------------|--------------------------|
| D2 | **Miroir des fichiers Blob** — documents et photos de membres ne sont sauvegardés nulle part. Les reçus PDF, eux, se régénèrent depuis la base (`produireRecuPdf`). | Demande du code (parcours du store, copie incrémentale) ; le runbook 0.2 documente le risque en attendant. | Le premier client qui téléverse des pièces justificatives ayant une valeur probante. ⚠️ Protéger au passage l'auto-réparation des reçus : une refonte qui la perdrait transformerait une perte Blob en perte de reçus. |
| D3 | **Automatisation des sauvegardes** — le dump chiffré de 0.2 dépend d'un geste humain et d'une seule machine. | Acceptable à un seul tenant réel et 208 Mo de base. | **Avant l'ouverture publique** (cf. §6 du runbook). Un backup qui dépend d'une personne n'en est pas un à l'échelle. |
| D4 | ✅ **RÉSOLU (`a51b8be`)** — **`ErrorBoundary` React** : monté au sommet de l'arbre (`main.tsx`), capte les crashes de rendu, affiche un fallback `ErrorState` lisible (+ rechargement) au lieu de l'écran blanc, et signale via la couche `observabilite`. 3 tests jsdom. (cf. 0.1) | Le manque — écran blanc pour l'utilisateur — est comblé ; l'alerte l'était déjà via `window.onerror`. | — |
| D5 | ✅ **RÉSOLU** — **Export tenant self-service** : `GET /organisations/moi/export` (ADMIN/PRESIDENT, scopé, réutilise `assemblerExportOrganisation` **sans** `runUnscoped`) + bouton « Exporter (JSON) » sur `/parametres`, vérifié en prod. La **suppression**, elle, reste délibérément réservée au SUPER_ADMIN (le choix de sécurité D5 d'origine tient : un ADMIN compromis ne doit pas pouvoir détruire toute une association). (cf. 0.3) | La portabilité en libre-service est livrée ; seule la destruction reste protégée côté plateforme. | — |
| D7 | **Access token survivant à une purge** — `authenticate` ne relit pas la base, un token non expiré d'un tenant supprimé passe encore la garde. | Exposition bornée à 15 min (TTL), lectures vides, écritures en échec FK, refresh mort. | Un raccourcissement du TTL ou une révocation immédiate ne se justifieraient que sur incident réel. |

---

## Ce qui n'est **pas** sur le chemin critique

Le produit est déjà fonctionnellement riche : inutile d'ajouter des modules métier pour la GA. Les
tentations à écarter d'ici là : application mobile native (la PWA couvre le besoin), nouveaux modules
V2 au-delà de l'existant, refonte visuelle (le design system « Menthe & Encre » est mûr). La GA se
gagne sur l'**exploitation**, pas sur de nouvelles fonctionnalités.
