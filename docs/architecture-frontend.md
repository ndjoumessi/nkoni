# Frontend — architecture applicative (`frontend/src/`)

> Référence détaillée pointée par `CLAUDE.md` (§ Frontend). `CLAUDE.md` n'en garde que le pointeur
> et les invariants à ne pas violer ; le détail, les raisons structurelles et les bugs vécus vivent
> ici. Design system « Menthe & Encre » : voir la section *Structure & stack* de `CLAUDE.md`.

- **Routing** (`App.tsx`) : `react-router-dom` déclaratif. Trois zones : pages publiques (`/`, `/login`, `/inscription`), console **plateforme** `/super-admin` (garde `SuperAdminRoute`, layout autonome **hors** `AppShell`), et pages tenant sous `<ProtectedLayout>` = `ProtectedRoute` (garde d'auth) + `AppShell` (coquille + nav) via `<Outlet/>`. **Routes statiques déclarées avant les paramétrées** (`/membres/nouveau` avant `/membres/:id`). **Largeur de contenu = `AppShell.classeLargeur(pathname)`** (liste de chemins codée en dur, appliquée AU contenu ET à la barre supérieure) : formulaires/réglages étroits (`max-w-3xl`), tables denses larges (`max-w-7xl` : `/audit`, `/membres`, `/utilisateurs`), défaut `max-w-6xl`. Elle DÉGRADE en douceur — une route non listée prend le défaut, jamais de casse — donc **ajouter une page dense = penser à l'inscrire dans `classeLargeur`** (sinon elle s'affichera en largeur intermédiaire au lieu de pleine).
- **Session** (`contexts/AuthContext.tsx` + `auth-context.ts`) : l'access token vit **uniquement en mémoire React** (jamais en `localStorage`). La persistance entre reloads repose sur le cookie httpOnly du refresh — au montage, `AuthContext` tente un `/auth/refresh` silencieux puis `/auth/me` pour réhydrater `user`. `useAuth()` expose `login`/`inscription`/`logout`/`changerLangue` + `user`/`accessToken`/`isAuthenticated`/`loading`. Il applique la langue (`appliquerLangue`, §4) **et la devise** (`appliquerDevise`, §5/F6) du serveur, enregistre le **pont d'auth** du client HTTP (`configurerAuthBridge` : token rafraîchi ↔ setState, session expirée ↔ logout) et arme le refresh proactif.
- **Client HTTP** (`lib/api.ts`) : `fetch` minimal, **`credentials: 'include'` obligatoire** (envoi du cookie refresh). Le token est passé explicitement en `Bearer` par appel. **Refresh-on-401** : au 1er 401 d'une requête authentifiée, `request()` appelle `/auth/refresh` (**dédupliqué** — une seule promesse en vol pour N requêtes concurrentes), remplace le token (`onTokenRefreshed` → `AuthContext`) et **rejoue la requête UNE fois** (`permettreRetry` anti-boucle) ; si le refresh échoue → `onSessionExpired` vide la session → `ProtectedRoute` redirige vers `/login`. `AuthContext` arme aussi un **refresh proactif** ~60 s avant l'expiration de l'access token (TTL 15 min). `ApiError` porte le statut HTTP ; `messageErreur(e)` distingue réponse d'erreur serveur vs rejet `fetch` (réseau/CORS). Base : `VITE_API_URL` (défaut `http://localhost:3000`) — en prod, proxy same-origin Vercel (`/api/*`). **Découpage par domaine (audit archi)** : `lib/api.ts` n'est plus qu'un **barrel** (`export * from './api/*'`) ; le cœur HTTP (`request`, `ApiError`, `messageErreur`, refresh-on-401, `configurerAuthBridge`) vit dans `lib/api/core.ts` (`request` EXPORTÉ pour les modules), les types transverses (`Paginated<T>`, `StatutContribution`, `ModeVersement`…) dans `lib/api/types.ts`, et **un module par domaine** `lib/api/<domaine>.ts` (membres, cagnottes, amendes, rapports…) exportant son objet `<domaine>Api` + ses types. **Tous les imports restent `from '@/lib/api'`** (le barrel préserve chaque nom exporté) — ne pas importer un sous-module directement. `tsc -b` garantit l'absence d'export dupliqué à travers le barrel.
- **Pages & data-fetching** : une page par écran dans `pages/` (liste/détail/formulaire par entité). Chargement de données **dans la page** (`useState`/`useEffect` + fonctions de `api.ts`) ; peu de hooks partagés (`hooks/useDashboard.ts`). Miroir des permissions dans `lib/roles.ts` pour masquer/afficher les actions selon le rôle (source de vérité = matrice backend).
- **Popovers/overlays ancrés à un déclencheur** : **rendus en portail** (`createPortal` dans `<body>`) + `position: fixed` calculée depuis le `getBoundingClientRect()` du déclencheur (recalcul au scroll capture + resize + changement de vue). **Raison structurelle** : `nk-reveal` anime en `forwards` → laisse un `transform` résiduel → chaque bloc animé devient un **contexte d'empilement** ; un popover simplement `absolute` (même `z-40`) reste piégé dans son bloc parent et se fait **recouvrir** par le bloc frère suivant (autre `nk-reveal`/transform/z-index) → illisible ET non cliquable (bugs vécus `/audit` puis `/fonctions`). Le portail l'immunise structurellement.
  - **`Button` rend `type="button"` par DÉFAUT** (`components/ui/Button.tsx`) : un `<button>` natif sans `type` vaut `submit`, donc tout bouton d'action posé dans un `<form>` soumettait le formulaire au lieu d'agir (bug vécu sur « Changer d'année »). **Soumettre exige donc `type="submit"` EXPLICITE** — ce que font déjà tous les boutons de soumission. Ne pas retirer ce défaut. **`ghost` n'est PAS un bouton d'action** : sans bordure ni soulignement au repos, il se lit comme une légende (même bug « Changer d'année », côté affordance cette fois) — réserver `ghost` aux zones où le contexte porte déjà l'affordance (barre d'icônes, ligne de tableau) et prendre **`outline` + icône** pour une action isolée au fil du texte.
  - **Primitives PARTAGÉES** (ne PAS redupliquer) : `components/ui/usePopoverFlottant.tsx` (portail + positionnement `fixed` avec bascule verticale/bornage viewport + clic-extérieur épargnant le portail + Échap `defaultPrevented`-safe → `rendreFlottant(children, {className, 'aria-label'})`) et `components/ui/GrilleAnnees.tsx` (grille d'années par décennie : nav décennie ‹/›, cellules hors `[min,max]` désactivées, clavier, **contrôlée** — le parent garde `focusAnnee`/le focus roving/`conserverFocusRef`/l'annonce aria-live). Réutilisées par **`DatePicker`** (calendrier + sélection rapide mois/année : en-tête cliquable → grille années → grille mois) ET **`SelecteurAnnee`** (année seule, ex. barème ; Entrée sur le déclencheur soumet le formulaire — parité `<input>`). **`components/membres/SelecteurMembreUnique.tsx`** = sélecteur d'UN membre **cherchable** (remplace un `<select>` natif ingérable à 30+ membres ; `usePopoverFlottant` + `normaliserTexte` recherche sans casse/accents ; **navigation clavier combobox APG** : `role="combobox"` + `aria-activedescendant`/`aria-controls`, flèches ↑/↓ + Entrée, surbrillance + `scrollIntoView`, ids via `useId` ; prop `optionTous` → mode filtre) — réutilisé Amendes + Cagnottes (bénéficiaire/don), à préférer à tout nouveau `<select>` de membre.
  - **Autres primitives partagées (ne PAS redupliquer)** : `ui/Skeleton.tsx` (`Skeleton`, `StatCardSkeleton`, `RowsSkeleton` — la primitive EXISTE, un audit l'a crue manquante) ; `ui/DataTable.tsx` porte `loading`/`skeletonRows`/`empty` (états mutualisés ; **zébrure `zebra` calculée sur l'INDEX, pas en `nth-child` — les lignes `expandable` s'intercalent et fausseraient la parité CSS**) ; `ui/StatCard.tsx` accepte `to` (drill-down navigué, rendu en `<Link>`) **ou** `onClick` (action sur place, rendu en `<button>`) — jamais un gestionnaire sur un `<div>`, qui serait inatteignable au clavier ; `ui/Tabs.tsx` = segmented control APG (roving `tabIndex`, ←/→ bouclants + Home/Fin) dont les helpers d'id vivent dans **`ui/tabs-ids.ts`** — fichier SÉPARÉ pour la même raison que `button-variants.ts` l'est de `Button.tsx` (un export non-composant casse le Fast Refresh → `react(only-export-components)`, or `oxlint` doit rester à 0 finding, et **il SORT en code 0 sur les warnings**, donc la CI ne l'attraperait pas). **`aria-controls` n'est émis que sur l'onglet ACTIF** : le motif « panneau unique réutilisé » ne monte qu'un panneau, un `aria-controls` sur un onglet inactif pointerait vers un id absent du DOM.
  - **N'adopter `DataTable.empty` QUE sur un vide SIMPLE.** Les 15 pages-listes (Membres, Amendes, Cagnottes, Utilisateurs, Tontines…) ont un `EmptyState` PLEINE PAGE (icône + CTA de création + variante « filtres actifs ») **et** `RowsSkeleton` : les convertir vers le `empty` en cellule serait un DOWNGRADE (perte du CTA). Seul `TresoreriePage` avait le motif simple (un `<p>` nu) et a été converti.
  - **Piège de focus + verrou de scroll** : `Modal.tsx` l'embarque déjà ; pour les autres overlays `aria-modal` **sans** Modal (CommandPalette ⌘K, drawer mobile de l'`AppShell`), utiliser le hook PARTAGÉ `hooks/useFocusTrap.ts` (`useFocusTrap(ref, active)` : mémorise le déclencheur + verrouille le scroll body, boucle Tab/Shift+Tab dans `ref`, restaure au close ; **ne force PAS le focus initial** — le composant le pose lui-même ; Échap/clic-extérieur restent gérés par l'appelant). Reprend la logique de `Modal` **sans** la refactorer — ne pas rustiner un trap ad hoc.
  - **Focus roving** : les flèches ‹/› d'en-tête posent `conserverFocusRef` pour que l'effet de focus ne les vole PAS vers une cellule (sinon l'activation clavier répétée casse). **aria-live** : région `sr-only` dédiée (un `aria-label` sur le bouton d'en-tête masquerait l'annonce du changement).
  - Échelle z : contenu/nav `z-40` · popover portail & `Modal` `z-50` · `Toast`/`CommandPalette` `z-[100]`. **Ne PAS** rustiner un recouvrement au cas par cas avec des `z-index` sur les cartes. Tests composant sous **jsdom** (`*.test.tsx`, docblock `// @vitest-environment jsdom`) ; `partage-popover.test.ts` prouve au niveau source que les deux composants importent bien les primitives (pas de copier-coller).
  - **Un changement de mise en page peut invalider une hypothèse TACITE du code existant, que `tsc`/`oxlint` ne voient pas** (c'est du layout, pas du type). Défauts vécus, tous révélés par une refonte visuelle et jamais par la CI : un espaceur « fantôme » calant un bouton et supposant des libellés d'UNE ligne (cassé quand une carte passe à demi-largeur → libellé sur 2 lignes → input désaligné), une taille d'image fixe (QR rogné), un `aria-controls`/`aria-label` supposant un rôle ou un motif porteur (onglets, `role="img"`), un état pilotant une VISIBILITÉ qui bascule au mauvais moment (confirmation du formulaire paiement repliée par `setConfig`). Règle : après toute refonte visuelle, **vérifier le rendu aux largeurs RÉELLES** (mobile 360 px ET la largeur effective du conteneur, ex. une carte en 2 colonnes = demi-largeur), pas seulement la compilation ; et **préférer supprimer l'hypothèse** (empiler les champs) plutôt que la compenser (ajuster la hauteur du fantôme, forcer `whitespace-nowrap`), qui recrée le piège au changement de largeur suivant.

## Aide contextuelle — `ui/AideNotion` (spec 2026-09-17)

- **Primitive unique** : `<AideNotion notion="…" />` rend un « ? » (bouton 24 px sans `.tap-target`, nom accessible
  « Aide : <titre> ») et une bulle en PORTAIL via `usePopoverFlottant`. Ouverture au clic/clavier, jamais
  au survol ; à l'ouverture, le focus se déplace dans la bulle — titre et texte lus, Tab atteint le lien « En savoir plus » quand la notion en a un — mais SEULEMENT une fois celle-ci positionnée donc visible (drapeau `positionne` de `usePopoverFlottant` : un navigateur ignore un `focus()` sur un élément `visibility:hidden`) ; le départ du focus la ferme sans rendre le focus au « ? » (sauf un `focusout` sans `relatedTarget`, ignoré : Safari ne focalise pas un bouton cliqué), et Échap ne ferme que la bulle (jamais un modal parent). Ne pas créer d'infobulle ad hoc.
- **Contenu** : `lib/aide.ts` (`NOTIONS_AIDE`, `LIENS_AIDE`) + namespace i18n `aide` (FR source, EN
  miroir). Une notion inconnue ne compile pas ; `aide-catalogue.test.ts` (textes non vides FR/EN, pas
  d'orphelin, 3 phrases max) et `aide-usage.test.ts` (chaque notion placée) gardent le catalogue.
- **Placement** : à côté d'un libellé — props `aide` de `Field` et `PageHeader` (jamais dans un `<label>`
  ou un `<h1>`), ou `flex items-center gap-1` autour d'un `Overline`. Au plus un « ? » par notion par
  écran, jamais dans une ligne de liste/tableau, jamais sur les écrans publics. Notion dans un `Modal` ⇒ pas d'entrée `LIENS_AIDE` (le piège à focus du Modal refermerait la bulle avant le lien).
- **« En savoir plus » = une SECTION de la documentation publique** (`LIENS_AIDE` typé
  `` `/aide/${Guide}#${string}` ``), ouverte dans un **NOUVEL ONGLET** (`<a target="_blank">`, annonce
  `sr-only`) : le « ? » est souvent posé à côté d'un champ de formulaire, et naviguer dans l'onglet
  ferait perdre la saisie. `aide-catalogue.test.ts` confronte chaque ancre aux sections RÉELLES du
  guide — une ancre fausse ne casse rien ailleurs, elle ouvre juste la page en haut, sans rapport.
- **Rédaction** : vouvoiement, 3 phrases au plus, aucun nom technique ; une règle métier citée suit le
  code (la changer = changer le texte dans la même PR).

## Documentation publique — `/aide/*` (spec 2026-09-18)

- **Le contenu est de la DONNÉE, pas du JSX ni un catalogue i18n.** `content/aide/types.ts` définit
  un modèle de blocs pur : `Bloc` (union `paragraphe` / `etapes` liste ORDONNÉE / `liste` non ordonnée /
  `note` avec un `ton` `info`|`attention` / `lien` interne uniquement), `SectionDoc` (`id` ancre STABLE
  kebab-case sans accent + `titre` + `blocs`) et `Document` (`titre` + `intro` + `sections`). Un guide
  FR/EN est donc deux fichiers de données (`content/aide/fr/<guide>.ts` / `en/<guide>.ts`), jamais une
  clé de plus dans `locales/{fr,en}/`. **Raison** : `locales/{fr,en}/index.ts` est chargé au DÉMARRAGE
  pour tout le monde ; y loger des guides entiers alourdirait le paquet initial d'un membre qui ne les
  lira jamais. `components/aide/RenduDoc.tsx` rend un `Document` (sommaire en `<nav>`, sections en
  `<section id>` avec `<h2>`, notes en `role="note"`, liens en `Link` React Router jamais `<a href>`) ;
  son `switch` sur `bloc.type` porte une garde d'exhaustivité (`const _exhaustif: never = bloc`) car
  `tsconfig.app.json` n'active ni `strict` ni `noImplicitReturns` — sans elle, un type de `Bloc` ajouté
  et oublié dans le rendu disparaîtrait silencieusement au lieu de casser `tsc`.
- **Registre de chargement à la demande** : `content/aide/registre.ts` exporte `GUIDES = ['membre',
  'bureau', 'faq']`, `type Guide`, `estGuide` et `chargerDocument(guide, codeLangue)`. Chaque guide/langue
  est un `import()` dynamique (`() => import('./fr/membre')`, etc.) → un CHUNK séparé par guide et par
  langue, absent d'`index-*.js` (vérifié par grep sur la sortie de `npm run build`). `codeLangue` inconnu
  retombe sur le FR (un texte dans la mauvaise langue vaut mieux qu'une page vide). `pages/aide/AidePage.tsx`
  (sommaire, dérive ses trois entrées de `GUIDES`) et `pages/aide/GuidePage.tsx` (charge via
  `chargerDocument`, recharge au changement de `i18n.language`, affiche `ErrorState` sur échec) sont les
  deux seuls consommateurs.
- **Trois gardes exécutables** (`content/aide/aide-doc.test.ts`), nécessaires car la parité FR/EN d'un
  `Document` n'est PAS tenue par le typage — contrairement à un catalogue i18n (objet à clés fixes),
  `Document.sections` est un TABLEAU : TypeScript vérifie la forme d'une section, jamais qu'un guide FR
  et son pendant EN couvrent les mêmes sections. (1) **Parité** : mêmes `id` de section, dans le même
  ordre, FR et EN, pour chaque guide de `GUIDES` ; une sous-garde recense EXPLICITEMENT (`toEqual`, jamais
  `toEqual([])` en dur) les titres identiques FR/EN légitimes, pour qu'une traduction oubliée (id absent
  de la liste mais titre inchangé) fasse échouer le test au lieu de se fondre dans une coïncidence
  acceptée. (2) **Ancres** : `id` uniques et en kebab-case sans accent — un ancien lien externe ou un
  favori ne doit jamais casser. (3) **Liens internes** : chaque bloc `lien` de chaque guide (FR et EN)
  doit pointer vers une route RÉELLEMENT déclarée dans `App.tsx`, lu en TEXTE (seule source de vérité) —
  un lien vers une page disparue est pire qu'une absence de lien, il donne confiance puis envoie dans le
  vide.
- **`PagePublique` (`components/public/PagePublique.tsx`) existe parce que le chrome des pages légales
  est FIGÉ en français.** La spec demandait de réutiliser telle quelle la coquille existante des pages
  légales (`PageLegale`) pour l'aide ; en pratique `PageLegale` portait son en-tête/logo/lien retour en
  chaînes françaises EN DUR (le corps juridique n'est pas traduit, volontairement) — la réutiliser sans
  changement aurait affiché un guide anglais sous un chrome français. `PagePublique` extrait donc la mise
  en page pure (logo, lien retour, titre, sous-titre optionnel) avec ses libellés en PROPS, jamais en
  `t()` : `PageLegale` lui passe ses chaînes françaises en dur (inchangé pour l'existant), les pages
  `/aide/*` lui passent des libellés résolus par `t()` (bilingues). L'intention de la spec — ne pas
  dupliquer le gabarit — est respectée ; son moyen (réutiliser `PageLegale` en l'état) ne l'était pas.
- **Le chrome des pages d'aide dépend de QUI lit** (`pages/aide/chrome-aide.tsx::useChromeAide`, via
  les props `retourVers`/`actions` de `PagePublique`). Connecté (démo comprise) : retour vers SON
  application (`cheminApresConnexion`) et **pas de sélecteur de langue** — la page suit déjà la langue
  du compte, et `LangueToggle` ne persiste qu'en local, ce qui désaccorderait l'interface de la
  préférence serveur. Visiteur : retour à l'accueil et `LangueToggle` visible (son seul moyen de changer
  de langue avant connexion). Le contexte est lu par `useContext(AuthContext)`, pas `useAuth()` : page
  publique, un contexte absent vaut « visiteur » au lieu de lever. À 360 px, le nom « NKONI » s'efface
  quand l'en-tête porte des actions (logo + sélecteur + retour tiennent alors sur une ligne).
- **Typographie** : apostrophe typographique (’) dans tout texte de la documentation et de l'aide
  contextuelle, FR et EN — gardée par `aide-doc.test.ts` (parcours de TOUTES les chaînes d'un
  `Document`) et `aide-catalogue.test.ts`. L'apostrophe droite revient à chaque rédaction au clavier.
- **Précache hors-ligne assumé.** Le service worker (`vite-plugin-pwa`, `globPatterns` incluant `js`)
  précache TOUS les chunks JS buildés, y compris les six chunks de documentation (3 guides × FR/EN) —
  comme n'importe quelle autre page chargée à la demande, ils ne bénéficient d'aucune exclusion
  particulière. Chaque PWA installée les télécharge donc en arrière-plan (~20 Ko compressés au total),
  même pour un membre qui ne consultera jamais `/aide` : c'est le prix assumé d'une aide lisible
  hors connexion, cohérent avec le choix de rendre `/aide/*` publique et robuste au réseau.

## Textes légaux — `/cgu`, `/confidentialite`, `/mentions-legales` (décision PO 2026-09-22)

- **Les TROIS textes sont traduits ; le FRANÇAIS fait foi.** Motif : l'application
  est bilingue et le Cameroun compte une population anglophone — un membre anglophone acceptait
  jusque-là des conditions qu'il ne pouvait pas lire. Mais ces textes engagent l'éditeur et n'ont pas
  encore été relus par un juriste (bloquant GA 0.3) : l'anglais est donc publié comme **traduction de
  courtoisie**, avec la mention « seule la version française fait foi ». Cet encart est posé par
  `RenduLegal`, **une fois**, et non dans chaque document : une traduction ajoutée demain l'obtient
  sans qu'on y pense, et personne ne peut en publier une en oubliant l'avertissement dans son fichier.
- **Les mentions légales ont d'abord été laissées en français** — formalité du droit français (LCEN
  art. 6-III), sans portée pour un lecteur anglophone —, avec un avis le disant. Une capture du PO
  (2026-09-22) a montré ce que ça donnait vraiment : un chrome anglais sur un corps français, et
  surtout un document déclarant `lang="en"` sur du texte français. Un lecteur d'écran en anglais
  prononce alors « Le service NKONI, accessible à l'adresse… » avec la phonétique anglaise —
  inintelligible (**WCAG 3.1.2**), sur une page que le test TalkBack allait traverser. Elles sont donc
  traduites aussi, et **les valeurs légales ne le sont PAS** (raison sociale, SIREN/SIRET, code APE,
  adresses des hébergeurs) : les transposer en dirait plus que la source. **Leçon générale** : une
  page à moitié traduite n'est pas un compromis, c'est une page que le lecteur d'écran ne sait pas
  lire — soit on traduit, soit on marque les parties dans leur langue (`lang` sur le fragment).
- **Modèle de contenu DISTINCT de celui de l'aide** (`content/legal/types.ts`) : un paragraphe
  juridique est une suite de **segments** (texte, mise en évidence, lien), parce que les liens et les
  emphases vivent À L'INTÉRIEUR d'une phrase (« notre politique de confidentialité », « 30 jours ») —
  alors qu'un bloc d'aide est une chaîne entière avec ses liens en blocs séparés. Le reste suit la
  documentation : donnée typée, chargée par `import()` à la demande, jamais un catalogue i18n.
- **La date de mise à jour est stockée en ISO** et formatée dans la langue de lecture. Deux chaînes
  rédigées à la main (« 14 septembre 2026 » / « September 14, 2026 ») finiraient par diverger, et sur
  un document opposable la date engage — un garde vérifie d'ailleurs qu'elle est IDENTIQUE FR/EN.
- **Gardes** (`content/legal/legal-parite.test.ts`, tous sabotés) : mêmes sections dans le même ordre ;
  même séquence de blocs ET mêmes cibles de lien ; même date ; titre réellement traduit ; ancres
  uniques en kebab-case ; apostrophes typographiques ; et chaque lien vise une cible ÉNUMÉRÉE — route
  déclarée dans `App.tsx`, `CONTACT_EMAIL`, le téléphone publié, ou l'un des hôtes d'hébergeurs listés
  dans le test. Ces cibles hors application DÉSIGNENT des tiers dans un document opposable : en
  ajouter une doit passer par une relecture, pas par un schéma d'URL permissif. Le typage ne peut rien ici : `sections` est un TABLEAU, une clause
  présente d'un côté et absente de l'autre compile parfaitement.
- **Effet de bord mesuré** : le corps juridique était jusque-là importé statiquement, donc présent
  dans le paquet initial de TOUS les visiteurs. Les trois pages sont désormais paresseuses et leur
  contenu part par langue (chunks de 4 à 7 Ko) ; plus une ligne de texte légal dans `index-*.js`.
- **Transcription vérifiée** : le passage du JSX à la donnée a été contrôlé mot à mot contre la version
  git précédente (661, 729 et 199 mots, identiques). Sur un texte opposable, « ça s'affiche pareil »
  ne suffit pas. Plus aucune page légale en JSX : `PageLegale`/`SectionLegale` ont été supprimés.
- Le chrome (retour, sélecteur de langue pour un visiteur) vient de `useChromePublic`, PARTAGÉ avec
  l'aide (`components/public/chrome-public.tsx`, ex-`pages/aide/chrome-aide.tsx`).

