# NKONI — Récap de session

_Bilan consolidé d'une session de développement full-stack. Sert de point de reprise et de
suivi des points ouverts._

---

## 1. Livré en production

Tout ci-dessous est **mergé sur `main`, déployé et vérifié** (build + lint + tests verts, et
statut de déploiement Railway/Vercel confirmé au statut réel là où le backend était touché).

### Sécurité
- **Bootstrap SUPER_ADMIN** en prod (`superadmin@nkoni.com`) — créé et vérifié de bout en bout
  (login → rôle `SUPER_ADMIN` → `/platform/*` répond 200 avec token, 401 sans).
- **Compte admin** : `admin@nkoni.com` existe et fonctionne. Constat rassurant : **aucun compte
  par défaut faible** (`admin@nkoni.local` / `admin1234`) n'existe en prod.

### Performance & qualité
- **Console plateforme enrichie** (`/super-admin`) : bandeau de KPIs, recherche + filtre par
  statut, tri des colonnes, barre de quota membres/100, dates relatives.
- **Code-splitting par route** : chunk principal 680 → 247 kB (−64 %), avertissement Vite « > 500 kB »
  disparu ; 30+ chunks lazy par route.
- **Lazy-load des catalogues i18n** : `auth-context` 219 → 141 kB ; la langue inactive n'est
  chargée qu'au changement de langue.
- **Audit a11y senior + revue de code** : `aria-required` sur les champs requis, contraste `--faint`
  relevé (WCAG 1.4.3), `prefers-reduced-motion` complété (transitions + animations, spinners
  conservés), utilitaire `.tap-target` (zone tactile ≥ 44px), `role="alert"` sur les erreurs.

### Fonctionnalités
1. **Import CSV/Excel des membres** — parsing client (SheetJS), mapping, prévisualisation, quota
   respecté, tout-ou-rien avec pré-validation, modèles téléchargeables.
2. **Espace membre self-service** — routes `/moi/*` scopées au membre connecté, écran `/mon-espace`
   pour `MEMBRE_SIMPLE` (situation, contributions, réunions, reçus).
3. **Reçus PDF + WhatsApp** — génération PDF (style « Menthe & Encre », Blob privé + proxy
   authentifié), envoi WhatsApp best-effort (mockable, no-op sans config).
4. **Trésorerie / dépenses** — modèle `Depense` scopé, workflow d'approbation
   (BROUILLON → EN_ATTENTE → APPROUVÉE/REJETÉE → PAYÉE), solde de caisse, ventilation par catégorie.
5. **PWA installable + hors-ligne** — manifest + service worker (Workbox), lecture hors-ligne
   (NetworkFirst), écriture hors-ligne avec file IndexedDB + idempotence backend (Versement, Membre).
- **DatePicker trésorerie** — remplacement du champ date natif par le composant maison.
- **Graphiques du tableau de bord** — courbe de recouvrement **cumulé** (collecté cumulé vs
  objectif cumulé, « burn-up » vers le total annuel ; aire, composant partagé avec Rapports)
  + répartitions en donuts.
- **Nom de l'organisation en relief** — `nomOrganisation` propagé aux réponses auth (login /
  me / inscription, champ additif sans migration) ; bloc menthe en tête d'AppShell (sidebar +
  drawer) et nom tronqué dans la topbar mobile. Null pour le SUPER_ADMIN.
- **Chef de l'organisation** — désignation d'un membre comme dirigeant (action mutable réservée
  ADMIN/PRESIDENT via `PATCH /organisations/moi/chef`, garde par rôle distincte des paramètres
  immuables §5) + surnom optionnel. Badge « Chef » (brass) sur la liste et la fiche membre.
  Validation d'appartenance scopée (isolation tenant), écriture en FK scalaire. Également
  AFFICHÉ en lecture seule sur la page Paramètres (ligne « Chef de l'organisation », icône
  couronne, nom + surnom, ou « Non désigné »).
- **Journal d'audit plus lisible** — dans le détail déplié d'une entrée, les champs monétaires
  sont rendus en devise (`formatMontant`) et les champs de plomberie `idempotenceKey` /
  `organisationId` sont masqués (CREATE, DELETE et diff UPDATE).
- **Identité visuelle & login** — nouveau logo NKONI « Cercle d'union » (membres menthe autour de
  la cagnotte émeraude→or, chef en or) appliqué partout (NkoniMark, favicon, icônes PWA régénérées,
  remplace l'ancien logo mauve générique) ; page de connexion enrichie en deux colonnes (panneau de
  marque + 3 arguments de valeur sur desktop, formulaire seul sur mobile).
- **Audit UI/UX (9 fichiers)** — cibles tactiles agrandies (boutons Réunions/Documents → 44 px),
  accessibilité (aria-label des selects de filtre Trésorerie, aria-current="step"
  sur le fil d'import), états explicites (erreur inline `role="alert"` + loader `RowsSkeleton` sur
  Trésorerie, distinction panne réseau vs absence de fiche sur Mon espace), et nettoyage tokens
  (RecouvrementHero + EmptyState : `var(--brass|jade|hairline)` / `color-mix` au lieu d'oklch en dur).
- **Écran Utilisateurs & formulaires** — création de compte déplacée en modale (liste d'abord) + avatars
  à initiales sur les lignes ; FormSection passé en container query (`@container` + `@lg:grid-cols-2`) →
  2 colonnes en pleine largeur, 1 colonne en modale/mobile, plus de champ tronqué ni de label coupé.
- **Landing publique enrichie (§0)** — page d'accueil `/` étoffée : « Opérationnel en trois étapes »,
  segments (associations / familles élargies / tontines), bloc sécurité & isolation, FAQ et footer ;
  contenu entièrement traduit FR/EN (parité de clés vérifiée à la compilation).
- **Sélecteur de langue FR/EN public (§4)** — composant `LangueToggle` (pilule accessible, persiste
  via `appliquerLangue` en `localStorage`, sans compte — distinct du sélecteur « Mon profil » côté
  serveur) présent sur tout le parcours non authentifié : hero + footer de la landing, et pages login
  et inscription (en haut à droite). Un visiteur peut basculer la langue avant toute connexion.
- **Placeholder inscription générique (§4)** — le champ « Nom de l'organisation » n'affiche plus un
  vrai nom de famille en exemple mais un placeholder neutre (FR « Famille, amicale ou tontine… » /
  EN « Family, association or tontine… »), dans les deux langues.
- **Modifier / supprimer un versement (§4.4)** — depuis la fiche membre (rôles ADMIN/TRÉSORIÈRE) :
  édition en modale et suppression avec confirmation. Le backend reporte le **delta** sur
  `montantVerse` + `montantValorise` (édition) ou décrémente les totaux (suppression) **en
  transaction** ; routes `PATCH`/`DELETE /versements/:id` confirmées déployées en prod.
- **Modifier une dépense (§5)** — depuis l'écran Trésorerie, édition d'une dépense au statut
  **BROUILLON** ou **EN_ATTENTE** uniquement (action réservée aux rôles de gestion) : réutilise le
  formulaire de création en mode édition, sans toucher au statut (les transitions restent gérées par
  les actions de ligne) ; s'appuie sur la route existante `PATCH /depenses/:id`.
- **Écran & exports Rapports — comparaison (§5.9/§10)** — tableau de comparaison **compact** :
  la variation passe **sous** la valeur (fin des colonnes Δ séparées → ~2× moins de colonnes,
  anti-débordement) + dégradé de bord conditionnel signalant un scroll résiduel. Variation des
  **PDF** en pourcentage **signé et localisé** (`pourcentExport` : normalisation PDFKit U+202F/U+00A0
  + signe moins U+2212 → ASCII). Sémantique de variation centralisée dans `variationPourcent`
  (source unique) : **« Nouveau »** = apparition (base 0 → valeur positive, badge menthe + `Sparkles`),
  **0 → 0 = « 0 % »** (resté à zéro), et **« n/a »** désormais réservé aux années **sans barème**
  (vraiment incomparable). Cohérent écran + PDF + Excel, FR/EN.
- **Audit UX — lots finaux (transverse)** — trois lots de polish issus d'un audit senior :
  - *Quick wins transverses* — `<html lang>` **dynamique** suivant la langue active (WCAG 3.1.1) ;
    **Toast a11y** (auto-fermeture en pause au survol/focus WCAG 2.2.1, `role="alert"` pour les
    erreurs, labels traduits) ; cibles tactiles **44 px** (bouton œil élargi dans le `pr-11`
    réservé, sans réintroduire `.tap-target`) ; `Select` **tokenisé** (chevron `<ChevronDown>`
    couleur `--faint` au lieu d'un data-URI figeant un hex) ; **purge des oklch en dur** restants
    (`:focus-visible`, `::selection`, `.nk-aura`, `.nk-weave`, ombre CTA → `color-mix` sur tokens).
  - *Modal / feedback / erreurs* (C1/C2/M6) — **piège de focus** complet de la `Modal` (mémorise le
    déclencheur, boucle Tab/Shift+Tab, restaure au close) ; feedback de validation du formulaire de
    dépense ; **primitive `ErrorState`** (miroir d'`EmptyState` en tons `--terra`, `role="alert"`,
    bouton « Réessayer »), appliquée à Dashboard / Membres / Réunions / Fiche membre / Trésorerie.
  - *Lot final* (M7/M8/M10/M11/M12 + mineurs) — **enums traduits** (rôles/statuts, plus de libellés
    figés) ; **UtilisateursPage** (validation + confirmation de changement de rôle) ; **AppShell**
    a11y (skip-link, drawer) ; micro-typo tokenisée ; grille Réunions. Front-only (Vercel) ; grâce
    au Watch Path, aucun de ces merges n'a déclenché de déploiement Railway.
- **Partage WhatsApp du reçu (§4.6)** — depuis la fiche membre, un bouton ouvre `wa.me` avec un
  message pré-rempli **personnalisé** (prénom du membre + nom d'organisation en gras + n° de reçu,
  montant, lien) et un **lien PUBLIC signé** de téléchargement : `GET /recus/:id/pdf-public?t=<sig>`
  (HMAC-SHA256 lié à l'id du reçu, vérif en **temps constant**, `404` uniforme = pas d'énumération).
  Le membre télécharge SON reçu **sans compte** ; la signature tient lieu d'autorisation. **Isolation
  tenant préservée** : l'org du reçu est résolue `runUnscoped` (id déjà autorisé) puis le PDF est
  généré DANS `orgContext.run({ organisationId })`. Signature calculée avec un **secret dédié
  `RECU_LINK_SECRET`** (repli sur `JWT_ACCESS_SECRET` → aucune migration, liens existants préservés ;
  cf. §2). `signaturePartage` n'est renvoyée que sur les endpoints authentifiés (jamais publique
  tant que non partagée). Côté front : `urlPartage` (URL absolue via le proxy same-origin) +
  `telephoneWaMe` (numéro au format international sans `+`).
- **Cartes de membre imprimables + QR de vérification (§4.7)** — PDF « Menthe & Encre » (fond menthe
  clair + bandeau d'en-tête, branche masquée si absente), généré à l'**unité** (`GET /membres/:id/carte`,
  fiche membre) ou en **lot** A4 découpable (`GET /membres/cartes`, page Membres) — réservé au bureau
  (pas MEMBRE_SIMPLE). Chaque carte porte un **QR** vers une page PUBLIQUE de vérification
  (`GET /membres/:id/statut-public?t=<sig>`) : HTML autonome affichant nom + **statut de cotisation**
  (À jour / Partiel / Non à jour) de l'année courante, **SANS aucun montant**. Signature HMAC à
  **préfixe distinct** (`carte-statut:v1:` ≠ reçus, séparation de domaine), secret dédié
  `RECU_LINK_SECRET` (repli `JWT_ACCESS_SECRET`), **isolation tenant préservée** (`await` DANS
  `runUnscoped`, cf. §4.6), `esc()` anti-XSS, `noindex`. Carte + page bilingues FR/EN (suivent
  `Organisation.langueDefaut`). Dép. `qrcode` ; nouvelle env `PUBLIC_BASE_URL` (défaut
  `nkoni.vercel.app`) pour l'URL absolue du QR. Test d'intégration `cartes-statut-public` (vraie
  Postgres) verrouille le chemin signature-valide → 200 HTML. **By-design** : le QR expose nom +
  statut (jamais de montant) de façon permanente à quiconque le scanne — la fonction même d'une carte
  vérifiable ; la signature empêche l'énumération.
- **Relevé de compte membre — PDF « relevé bancaire » (§4.8)** — `GET /membres/:id/releve` (proxy
  authentifié) : synthèse (total attendu / valorisé cumulés, **reste à payer**, statut) + tableau
  **par année** (attendu / versé / valorisé, ligne TOTAL) + tableau **mouvements** (versements
  chronologiques : date, année, mode, montant). RÉUTILISE l'export « Menthe & Encre »
  (`enteteDocument` + `dessinerCorpsPremium`) — **aucune duplication** ; `dessinerCorpsPremium`
  renvoie désormais le **y de fin** (retour additif `void→number`) pour EMPILER les deux tableaux.
  Statut + totaux = même source de vérité que la fiche/carte (`calculerStatutsMembres`). Accès :
  rôles bureau **et** MEMBRE_SIMPLE sur SA propre fiche (404 sinon, pas de fuite). Locale + **devise
  du DESTINATAIRE** (le membre, repli défaut org), comme les reçus. Bilingue FR/EN (`releve.service`).
  Front : bouton « Relevé de compte » sur la fiche membre (`membresApi.telechargerReleve`,
  `ouvrirBlobPdf`), i18n `membres.releve.*`. Service pur (données → Buffer), rendu vérifié FR + EN.
  **Correctif « par année » (recoupe la synthèse)** : le tableau annuel se construisait à partir des
  seules `Contribution` existantes → une année **au barème mais sans contribution** (fréquent à
  l'adhésion) gonflait le total attendu de la synthèse sans y figurer (incohérence visible).
  Désormais il couvre TOUTES les années de la **borne §4.1** `[anneeAdhesion .. min(anneeCourante,
  anneeFinContribution)]` (union barème ∪ contributions), l'attendu venant du **barème courant** —
  même source que la synthèse → recoupement exact ; les mouvements sont aussi bornés à cette fenêtre.
- **Cagnottes d'événement (§4.9)** — collectes de solidarité ponctuelles (deuil, mariage, naissance…),
  **poche SÉPARÉE** de la trésorerie générale : dons des membres → **reversement au bénéficiaire**
  (jamais mêlé au solde de caisse). 2 modèles SCOPÉS (`CagnotteEvenement`, `DonCagnotte` → 24ᵉ/25ᵉ
  SCOPED_MODEL) + 2 enums (`TypeCagnotte` DEUIL/MARIAGE/NAISSANCE/AUTRE, `StatutCagnotte`
  OUVERTE/CLOTUREE). Bénéficiaire = **membre OU nom libre** (FK `ON DELETE SET NULL`). Suivi **par
  membre** (chaque don enregistré : membre, montant, mode, date, note). Cycle OUVERTE→CLOTUREE
  (rouvrable) ; clôture = saisie du **montant reversé** borné à `[0, collecté]`. `routes/cagnottes.route.ts` :
  CRUD cagnotte + dons (add/del) + `cloturer`/`rouvrir`. Permissions : entité `Cagnotte` (gestion =
  bureau) ; les FLUX D'ARGENT (dons, reversement, clôture, suppression) gardés par
  `requireRoles(['ADMIN','PRESIDENT','TRESORIERE'])`. Lecture ouverte à tous. Écritures en **FK
  scalaires** (`creeParId`/`saisiParId`/`cagnotteId`/`membreId`, `organisationId` injecté).
  Logique métier PURE testée : `cagnotte.service.ts` (collecte, solde, progression %, `validerReversement`)
  — 5/5. Front : nav « Cagnottes », pages liste (cartes + barre de progression, sections en cours/
  clôturées), détail (synthèse collecté/reversé/solde + table des dons + modales don/clôture/suppression),
  formulaire création/édition ; `cagnottesApi`, miroir rôles (`peutVoirCagnottes`/`peutGererCagnotte`/
  `peutSaisirDon`), i18n `cagnottes.*` FR/EN. **Migration `cagnottes_evenement`** générée et committée
  (additive : 2 `CREATE TYPE` + 2 tables + FK) ; s'applique en prod via `prisma migrate deploy` au
  déploiement Railway (`startCommand`).

- **Amendes / pénalités (§4.10)** — sanctions financières saisies **manuellement** par le bureau
  (retard de cotisation, absence réunion, autre), poche de suivi **séparée** (n'affecte pas encore le
  solde de trésorerie). 1 modèle SCOPÉ `Amende` (26ᵉ) + 2 enums (`TypeAmende`, `StatutAmende`
  IMPAYEE/PAYEE/ANNULEE). Cycle **IMPAYEE → PAYEE | ANNULEE** (transitions validées, service pur) ;
  édition/suppression seulement si IMPAYEE. `routes/amendes.route.ts` : CRUD + `payer` (encaissement,
  mode + date) + `annuler`. Permissions : entité `Amende` (saisie/édition = bureau) ; ENCAISSEMENT &
  ANNULATION gardés par `requireRoles(['ADMIN','PRESIDENT','TRESORIERE'])` ; MEMBRE_SIMPLE ne voit
  QUE ses amendes (filtrage en route). Écritures FK scalaires (`membreId`/`creeParId`). `GET /amendes`
  renvoie la liste + **totaux dû/encaissé** (ANNULEE exclues). Service pur testé 3/3
  (`amende.service.ts` : transitions, totaux). Front : nav « Amendes », page unique (totaux + filtres
  statut/membre + table + modales création/édition/encaissement/annulation/suppression), `amendesApi`,
  miroir rôles (`peutVoirAmendes`/`peutGererAmende`/`peutEncaisserAmende`), i18n `amendes.*` FR/EN.
  **Migration `amendes_penalites`** générée et committée (additive : 2 `CREATE TYPE` + table + FK) ;
  s'applique en prod via `prisma migrate deploy` au déploiement Railway (`startCommand`).

- **Photo du membre (§4.11)** — vraie carte d'identité : la carte PDF affiche désormais un **avatar**
  (photo si présente, sinon **initiales** sur fond menthe) à gauche, infos à droite, QR en bas — layout
  unifié. 2 colonnes nullables sur `Membre` (`photoBlobUrl`, `photoMime`), photo stockée sur le **Blob
  PRIVÉ** (jamais exposée au client). `routes/membre-photo.route.ts` : `POST /membres/:id/photo`
  (multipart, **JPEG/PNG** ≤ 5 Mo, remplace + supprime l'ancien blob), `GET` (proxy authentifié,
  MEMBRE_SIMPLE = sa propre photo), `DELETE`. Rendu carte : `carte.service` prend `photo?: Buffer`
  (fallback initiales robuste `try/catch`), `cartes.route` charge les octets (best-effort). **La photo
  n'apparaît PAS sur la page publique de statut** (PII fort). Front : `AvatarMembre` (fetch blob
  authentifié → objectURL, fallback initiales, révocation), carte profil sur la fiche membre avec
  **Changer / Retirer** (gestion) ; `membresApi.{chargerPhoto,uploadPhoto,supprimerPhoto}` ;
  i18n `membres.photo.*` FR/EN. **Migration `photo_membre`** générée et committée (additive : 2
  colonnes TEXT nullables) ; s'applique en prod via `prisma migrate deploy` au déploiement Railway.

- **Dashboard enrichi — N vs N-1, anniversaires, reste à collecter (§ dashboard)** — trois ajouts
  au tableau de bord, **sans migration** (agrégats en lecture). (1) **Comparaison N-1** : le graphe
  d'évolution mensuelle superpose la collecte du même mois l'**année précédente**
  (`construireEvolutionMensuelle` prend désormais `versementsN1`, ventilation factorisée en `ventiler`,
  champ additif `collecteN1`). (2) **Anniversaires du mois** : nouvelle carte `AnniversairesCard`
  listant les membres dont l'anniversaire tombe dans le mois courant, triés par jour — fonction pure
  `anniversairesDuMois` (mois/jour lus en **UTC**, membres sans `dateNaissance` ignorés). (3) **Reste
  à collecter** : ligne `RecouvrementHero` affichant `max(0, attendu − collecté)` en ton `--terra`.
  Service pur testé (+2 cas). i18n `dashboard.{hero.resteACollecter, anniversaires.*, evolution.n1}`
  FR/EN.
- **Dashboard — vue financière consolidée + relance WhatsApp (§ dashboard)** — deux ajouts pour le
  dirigeant, **sans migration**. (1) **Vue financière consolidée** (`FinancesConsolideesCard`) :
  au-delà des seules cotisations, agrège en **un aller-retour groupé** (`calculerFinancesConsolidees`,
  `Promise.all`) le **solde de caisse** (Σ versements − Σ dépenses APPROUVÉE/PAYÉE), les **cagnottes
  ouvertes** (nombre + collecté) et les **amendes** (dû IMPAYÉ / encaissé PAYÉ) — vue de TOUT l'argent
  de l'association. Calculée en **route** et greffée sur le dashboard **uniquement** pour les rôles
  dirigeants (ADMIN / PRESIDENT / COMMISSAIRE_COMPTES) ; champ `financesConsolidees?` optionnel.
  (2) **Relance WhatsApp** : dans la liste « membres à relancer » (`AnalyseMembres`), un bouton `wa.me`
  par membre ouvre un message pré-rempli **personnalisé** (prénom + reste dû), numéro normalisé via
  `telephoneWaMe` (masqué si téléphone absent/invalide). Service pur testé (+3), route testée (+1).
  i18n `dashboard.{consolide.*, analyse.relancerWhatsApp, analyse.relanceMessage}` FR/EN.

### Migrations appliquées en prod
- `tresorerie_depense` — additive (table `Depense` + 2 enums via `CREATE TYPE`).
- `idempotence_offline` — additive (colonne `idempotenceKey` nullable + index unique par org sur
  `Versement` et `Membre`).
- `chef_organisation` — additive (`Organisation.chefMembreId` FK Membre `ON DELETE SET NULL` +
  `chefSurnom`, colonnes nullables).
- `cagnottes_evenement` — additive (2 `CREATE TYPE` `TypeCagnotte`/`StatutCagnotte` + tables
  `CagnotteEvenement` et `DonCagnotte` + FK, dont bénéficiaire `ON DELETE SET NULL` et don→cagnotte
  `ON DELETE CASCADE`). Aucune opération destructive.
- `amendes_penalites` — additive (2 `CREATE TYPE` `TypeAmende`/`StatutAmende` + table `Amende` + 2
  index + 2 FK `ON DELETE RESTRICT` vers `Organisation`/`Membre`). Aucune opération destructive.
- `photo_membre` — additive (`Membre.photoBlobUrl` + `photoMime`, 2 colonnes TEXT nullables). Aucune
  opération destructive.

### Robustesse / dette traitée
- **i18n durci (audit FR/EN)** — (1) `t()` FRONTEND désormais **typé** contre le catalogue
  (`src/react-i18next.d.ts` : `declare module 'i18next'` + `resources: { translation: Catalogue }`)
  → une clé statique inexistante devient une **erreur de build** ; les ~11 clés DYNAMIQUES
  (`` t(`ns.${var}`) ``) sont enveloppées dans le helper `cleI18n()` (identité runtime). (2) Les
  messages des routes récentes (cagnottes/amendes/photo) migrés des maps inline vers le **catalogue
  central** (fragments `fr,en/{cagnottes,amendes,photoMembre}.ts` + index) → `t(langue, 'clé')`,
  clés vérifiées à la compilation (`CleMessage`) et parité FR/EN garantie (`Messages`). Audit :
  1328 clés front utilisées toutes présentes, énums complets FR+EN, zéro chaîne en dur.
- **Durcissement idempotence `P2002`** — le re-fetch par `idempotenceKey` (POST /versements, /membres)
  n'a lieu QUE si `err.meta.target` cible bien l'unique `(organisationId, idempotenceKey)` ; un P2002
  sur une autre contrainte est relevé (plus avalé en re-fetch d'une mauvaise ligne / null).
- **Icônes PNG PWA** — `pwa-192x192`, `pwa-512x512` (any) + `pwa-maskable-512x512` (maskable, zone de
  sécurité) dérivées de `favicon.svg`, référencées dans le manifest et précachées (`favicon.svg` conservé).
- **Normalisation téléphone E.164** — `normaliserTelephone` (défaut Cameroun `237`, indicatif
  paramétrable) appliquée avant tout envoi WhatsApp : local `6XXXXXXXX → 2376XXXXXXXX`, nettoyage
  espaces/`+`/`00`, numéro invalide → pas d'envoi.

### Infra / déploiement
- **Watch Path Railway `/backend/**`** — le service backend ne rebuild QUE si un fichier sous
  `backend/` change. Un push qui ne touche PAS `backend/` (ex. `frontend/` seul, ou `docs/`) ne
  déclenche donc plus de déploiement Railway (avant : tout push `main` rebuildait le backend
  inutilement). Conséquence à connaître : « aucun nouveau déploiement Railway » après un tel push
  est désormais **normal**, pas un échec — ne vérifier le statut Railway que quand `backend/` a
  réellement changé. Les migrations vivent sous `backend/prisma/`, donc bien couvertes par le
  Watch Path. **Nuance** : le motif `/backend/**` englobe AUSSI `backend/tests/**` → un changement
  **test-only backend déclenche quand même un déploiement** (inoffensif : image runtime identique,
  les tests ne sont pas embarqués). Non filtré volontairement : un pattern de négation
  (`!/backend/tests/**`) risquerait, mal évalué, de bloquer un vrai déploiement backend — trop
  sensible pour un gain marginal.
- **Migrations en `startCommand`, pas de pre-deploy step** — on garde
  `npx prisma migrate deploy && npm run start` (défini dans `/backend/railway.json`). Le `&&`
  fournit déjà le fail-safe (migration KO → boot avorté → déploiement FAILED → Railway sert le
  dernier déploiement sain). Un pre-deploy step n'apporterait un gain qu'en **multi-réplicas**
  (course de migrations concurrentes) — non pertinent : NKONI tourne en **instance unique**
  (cron `node-cron` in-process). À reconsidérer seulement si passage multi-instances.

---

## 2. À faire côté PO (déploiement / config)

- **Variables d'env à poser sur Railway** (pour activer l'envoi WhatsApp des reçus) :
  - `WHATSAPP_TOKEN` — token **système permanent** (pas le token temporaire 24h), permission
    `whatsapp_business_messaging`.
  - `WHATSAPP_PHONE_ID` — *Phone number ID* Meta Cloud API.
  - Sans ces variables : le PDF reste téléchargeable, l'envoi WhatsApp est un no-op inoffensif.
- **`RECU_LINK_SECRET` (Railway, recommandé, non obligatoire)** — secret dédié à la signature de
  **tous les liens publics signés** : liens de téléchargement des reçus (partage `wa.me`, §4.6) **ET**
  QR de vérification de statut des cartes de membre (§4.7). Les deux usages emploient le même secret
  mais des **préfixes distincts** (`recu-pdf-public:v1:` vs `carte-statut:v1:`), donc une signature
  ne vaut jamais d'un domaine à l'autre. Le code **replie sur `JWT_ACCESS_SECRET`** s'il est absent :
  ne rien poser = comportement inchangé, aucune migration. Poser une valeur **aléatoire distincte**
  active la **séparation des clés** → on peut alors **révoquer** ces liens (en tournant ce seul
  secret) **SANS invalider les sessions JWT** (donc sans déconnecter tout le monde). **Attention** :
  le tourner révoque **à la fois** les liens de reçus déjà partagés **ET** les QR des cartes déjà
  imprimées/distribuées (ils renverront alors `404`). À faire quand on veut cette capacité de
  révocation ; sinon, sans objet.

---

## 3. QA manuelles restantes (non couvrables en test unitaire)

- **Espace membre** : connexion en `MEMBRE_SIMPLE` → ne voir QUE ses propres données.
- **Cycle hors-ligne PWA** : installer → couper le réseau → saisir un versement/membre → reconnecter
  → vérifier le rejeu sans doublon.
- **DatePicker trésorerie** : ouvrir « Nouvelle dépense » → le calendrier doit s'afficher **au-dessus**
  de la modale (popover et Modal sont tous deux `z-50`).
- **Dashboard** : carte « Recouvrement cumulé » (courbe burn-up) + donuts de répartition bien affichés ;
  superposition **N-1** sur le graphe mensuel, carte **Anniversaires du mois**, ligne **Reste à
  collecter** (hero) ; en rôle dirigeant : carte **Vue financière consolidée** (solde caisse /
  cagnottes / amendes) et bouton **relance WhatsApp** sur les membres à relancer (ouvre `wa.me`
  pré-rempli, masqué si téléphone absent).
- **Nom de l'organisation** : après reconnexion (token réhydraté), le nom de l'org apparaît dans le
  bloc menthe en haut de la barre latérale (et tronqué dans la topbar mobile).
- **Rapports** : retrait d'année en mode comparaison (bouton agrandi, plus d'overlay).
- **Changement de langue** FR ↔ EN dans Mon Profil (charge le catalogue à la volée).

---

## 4. Points ouverts / dette légère (aucun bloquant)

- **Rotation du mot de passe `admin@nkoni.com`** — optionnelle (hygiène). Via Mon Profil.
- **WhatsApp — templates pré-approuvés** — la **normalisation E.164** des téléphones est FAITE
  (cf. §1). Restent, tous deux en attente de la création du **compte Meta Business** : les
  **templates pré-approuvés** (obligatoires hors de la fenêtre de 24h Meta ; le code envoie
  aujourd'hui un document brut) et la pose des **env vars** `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID`
  (cf. §2).

---

## 5. Idées de features futures (non construites)

Priorisées pour le marché (Afrique de l'Ouest, mobile-first) :

- **Paiement Mobile Money** (MTN MoMo / Orange Money) — le plus gros levier : collecte directe des
  cotisations + rapprochement automatique.
- **Notifications SMS** (complément du WhatsApp déjà en place).
- **Forfaits payants** — monétisation au-delà du plan gratuit (100 membres), idéalement facturés par MoMo.
- **Module tontine rotative** — tour de rôle des bénéficiaires, cycles, suivi des « mains » (si les
  tontines deviennent une cible réelle).
