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

## Mouvement — jetons et règles (`src/index.css`)

Le design system centralisait les COULEURS en jetons et laissait le mouvement en courbes recopiées
à la main. Deux jetons, même règle, même raison — une animation qui n'a pas le ressenti de sa
voisine se remarque sans qu'on sache dire pourquoi :

| jeton | courbe | quand |
|---|---|---|
| `--ease-entree` | `cubic-bezier(0.22, 1, 0.36, 1)` | tout ce qui **entre** — popover, modale, toast, révélation de page |
| `--ease-trajet` | `cubic-bezier(0.77, 0, 0.175, 1)` | ce qui **se déplace en restant à l'écran** — jauges de progression |
| `--ease-sortie` | `cubic-bezier(0.5, 1, 0.89, 1)` | tout ce qui **sort** — popover, modale, voile, toast (cf. ci-dessous) |

**Ne JAMAIS utiliser `ease-in` sur de l'interface.** Il retarde le premier mouvement, c'est-à-dire
exactement l'instant que l'œil surveille : à durée égale, il paraît plus lent. Les courbes natives
(`ease`, `ease-out`) sont par ailleurs trop molles — il leur manque le départ franc qui fait lire
une animation comme intentionnelle. Les deux ci-dessus en sont les variantes fortes.

**Budget : 300 ms.** Presse-papier des durées retenues — pression d'un bouton 150 ms, popover
150 ms, modale 200 ms, révélation de page 280 ms, jauge 500 ms (c'est une donnée qui se lit, pas
une transition d'écran). Une **sortie est toujours plus courte que son entrée** (toast : 240 ms à
l'aller, 160 au retour ; modale : 200 et 140) : à ce moment-là l'utilisateur en a fini, le faire attendre est une
politesse mal placée.

### Deux courbes, deux SENS : `--ease-entree` entre, `--ease-sortie` sort

La courbe d'origine est réglée pour les **entrées** : son départ très franc est ce qui donne la
sensation de réponse immédiate à l'ouverture. Sur une sortie, ce même départ consomme tout le
mouvement d'un coup et laisse une queue invisible — pendant laquelle, pour une modale, le panneau
reste monté et le verrou de défilement tenu.

Mesuré dans le moteur (animation mise en pause et parcourue image par image, sur le CSS du bundle
construit). Part du mouvement déjà jouée à la **première image** (17 ms), puis durée réellement
employée pour 99 % du mouvement :

| sortie | durée déclarée | 1ʳᵉ image avant → après | durée employée avant → après |
|---|---|---|---|
| popover | 110 ms | 55 % → **28 %** | 88 → **105 ms** |
| modale / voile | 140 ms | 47 % → **23 %** | 91 → **125 ms** |
| toast | 160 ms | 42 % → **20 %** | 104 → **143 ms** |

Autrement dit, l'ancienne courbe ne dépensait que les deux tiers de la durée écrite. **Une durée
déclarée est désormais une durée vue.** `--ease-sortie` (easeOutQuad) étale le mouvement **sans
retarder le départ** : elle reste un ease-out, la règle « jamais d'ease-in sur de l'interface »
n'est pas entamée — et le garde le vérifie sur le `y1` de la courbe.

La frontière n'est donc pas une durée, c'est le **sens** : ce qui arrive prend `--ease-entree`, ce
qui part prend `--ease-sortie`. Trois invariants sont verrouillés par `lib/mouvement-parite.test.ts`
(courbe par sens, sortie plus courte que son entrée, départ jamais retardé).

### La SORTIE des popovers, et un déplacement de responsabilité

Les six popovers — `DatePicker`, `SelecteurAnnee`, `AideNotion`, `SelecteurMembreUnique`, le menu de
compte d'`AppShell`, le menu d'actions de la fiche membre — partagent `usePopoverFlottant`.
`nk-popover-out` (110 ms, échelle de retour à 0,96) referme le geste que
`nk-popover-in` ouvrait.

**C'est désormais le HOOK qui décide du montage**, plus l'appelant : `rendreFlottant` rend `null`
quand il n'y a rien à afficher, et les six sites ont perdu leur `{open && …}`. Réintroduire cette
condition redonnerait à l'appelant la décision du démontage et retirerait au hook toute possibilité
d'animer — même contrainte que `Modal`. Un **garde textuel** (`popover-sortie.test.tsx`) interdit la
régression sur les six fichiers : il vérifie qu'aucun n'écrit `… && rendreFlottant(` ni
`… ? rendreFlottant(`, et compte les appels pour ne pas passer à vide si la liste se vidait.

Trois différences avec la modale, toutes vérifiées plutôt que supposées :

1. **Pas de gel du contenu.** La modale devait figer le sien parce que l'appelant remet sa donnée à
   zéro dans `onClose`. Les popovers, eux, affichent leur PROPRE état interne (vue du calendrier,
   requête de recherche, catalogue d'aide), qu'aucun des six ne réinitialise à la fermeture —
   contrôlé un par un. Rien ne se vide, rien à figer.
2. **Les `coords` sont GELÉES pendant la sortie** (et les écouteurs de scroll/resize détachés) : la
   bulle rétrécit **vers son déclencheur**, en conservant le `transform-origin` calculé à
   l'ouverture. Elle repart par où elle est venue au lieu de s'effacer sur place — et elle ne suit
   plus un défilement qu'elle ne commente plus.
3. **Le focus est déjà revenu** : les appelants le rendent au déclencheur dans leur `fermerEt…`.
   La bulle sortante devient alors **`inert`** — ni tabulable, ni cliquable, ni annoncée (cf. le
   point 2 de la modale ci-dessous : ici c'étaient **46** boutons de jour du calendrier qui
   restaient focusables sous un `aria-hidden`).

`positionne` (dont `AideNotion` se sert pour focaliser son contenu) vaut `open && coords !== null` :
pendant la sortie, personne ne doit y renvoyer le focus.

### La SORTIE de la modale, et les trois choses qu'elle a obligé à traiter

Pendant longtemps la modale entrait en 200 ms et disparaissait d'un coup. L'asymétrie se remarque
sans qu'on sache la nommer : le geste n'a pas de fin, il est interrompu. `nk-modale-out` /
`nk-voile-out` (140 ms, même courbe, échelle qui revient à 0,97) referment ce geste.

Le vrai coût n'est pas l'animation, c'est ce qu'elle implique : **la modale doit survivre à sa
fermeture**. `Modal` la garde montée 140 ms de plus (`DUREE_SORTIE_MS`), ce qui crée trois
problèmes qu'une animation « posée vite » laisserait derrière elle :

1. **Le contenu se vide sous les yeux.** 27 des 32 appels pilotent la modale par la donnée qu'elle
   affiche (`open={cible !== null}`) et remettent cette donnée à zéro dans `onClose`. Pendant la
   sortie, le panneau afficherait donc un nom qui s'efface, un montant devenu « — » — quand il ne
   planterait pas sur un `cible.montant` devenu nul. `Modal` **fige** donc la dernière image
   commitée (contenu **et titre**, qui se dérive souvent du même état) et la rejoue. Le gel est
   mémorisé dans un effet, PAS pendant le rendu : au rendu de fermeture, `children` porte déjà le
   contenu vidé.
2. **Ce qui part doit être inerte** — et « inerte » veut dire TROIS choses, pas deux. La première
   version posait `aria-hidden` (un lecteur d'écran n'annonce pas un dialogue en train de
   disparaître), `pointer-events-none` (un clic pressé pendant la sortie ne doit pas atteindre un
   bouton FIGÉ, donc une action qui n'est plus celle affichée) et `disabled` sur le voile et la
   croix. **Mesuré sur l'application réelle, il restait 7 éléments focusables** dans la modale —
   les champs et les boutons du formulaire, qui vivent dans le contenu figé et ne peuvent donc pas
   être désarmés un par un. La souris était bloquée, le clavier non : un conteneur `aria-hidden`
   qui garde des éléments focusables est exactement ce qu'interdit la règle `aria-hidden-focus`.
   D'où l'attribut **`inert`**, qui fait les trois à la fois — hors tabulation, hors pointeur, hors
   arbre d'accessibilité. `aria-hidden` reste à côté en ceinture et bretelles et ne viole plus
   rien, puisque plus rien n'y est focusable. En revanche le **focus revient au déclencheur dès la
   fermeture**, sans attendre l'animation : une décoration ne doit jamais faire patienter le
   clavier.

   La leçon dépasse le correctif : `disabled` sur deux boutons donnait l'IMPRESSION que le problème
   était traité, et c'est cette impression qui l'a laissé passer la revue comme les tests. Il a
   fallu compter les éléments restants dans l'application qui tourne — espace de démonstration en
   production — pour le voir.
3. **Le verrou de défilement se relâche au DÉMONTAGE**, pas au début de la sortie — sinon la page
   bougerait derrière un panneau encore visible.

Corollaire d'écriture, et **la seule chose à retenir côté appelant** : `<Modal>` doit rester monté
et recevoir `open={condition}`. La forme `{condition && <Modal open …>}` lui retire toute
possibilité d'animer, puisque c'est l'appelant qui décide du démontage. Les cinq sites qui
l'utilisaient ont été convertis ; deux d'entre eux (`TresoreriePage`) portaient l'état d'une saisie
dans le composant qui enveloppait la modale — la coquille a été remontée dans la page et le corps
du formulaire reçoit une **`key` d'ouverture** qui le réinitialise. C'est le moyen React de remettre
un sous-arbre à neuf, sans effet de synchronisation d'état, et sans quoi un montant tapé puis
abandonné reparaîtrait à l'ouverture suivante, prêt à être soumis par erreur.

**Mesure, et ce qu'elle apprend sur la courbe.** `--ease-entree` est un ease-out FORT : à 78 ms sur
les 140, l'opacité est déjà à 0,02 et l'échelle à 0,9705. La sortie nominale de 140 ms est donc
perçue autour de 80, le reste étant une queue invisible. Ce n'est pas un défaut — une fermeture doit
être prompte, et `nk-toast-out` a exactement la même caractéristique — mais il faut le savoir avant
de « raccourcir » ces durées : à 100 ms nominales, la sortie ne se lirait plus comme un mouvement,
seulement comme une coupe.

**`nk-reveal` est l'animation la plus vue de l'application** — 129 emplois, rejouée à chaque
navigation. Elle était à 600 ms avec une cascade jusqu'à 390 ms : la dernière carte d'un tableau de
bord se posait 990 ms après le clic. À 280 ms avec une cascade à 30 ms (et `staggerDelay` à 25 ms
plafonné à 8), elle se pose à 430 ms — l'application paraît deux fois plus rapide sans qu'une seule
requête aille plus vite. **C'est le levier de performance PERÇUE le moins cher du projet : ne pas
le redépenser en rallongeant cette animation.**

**Les popovers grandissent depuis leur DÉCLENCHEUR**, jamais depuis leur centre :
`usePopoverFlottant` calcule `transform-origin` en même temps que la position, et bascule en
`bottom` quand la bulle s'ouvre au-dessus. Le bornage horizontal n'est pas de la prudence — une
bulle décalée pour tenir dans la fenêtre peut ne plus contenir son déclencheur, et l'origine
sortirait de l'élément (fonction pure `origineDepuisDeclencheur`, testée). **Exception : la
modale**, qui n'est ancrée à rien et grandit donc depuis son centre.

**Ne jamais animer une action au CLAVIER.** La palette ⌘K portait l'animation d'un toast : 240 ms
placées entre l'intention de quelqu'un qui sait déjà ce qu'il cherche et sa frappe suivante. Elle
s'ouvre désormais sans transition. La règle vaut pour tout raccourci, pas seulement celui-là.

**Ne pas écrire `transition-all`.** Il met en transition des propriétés qui ne changent pas, et
réserve des surprises le jour où l'une d'elles se met à changer. Nommer ce qui bouge :
`transition-[width]` pour une jauge, `transition-colors` pour un élément de navigation,
`transition-opacity` pour un indicateur. Le `transition` de Tailwind (sans `-all`) est une liste
CURÉE et convient aux composants dont plusieurs propriétés changent vraiment (bouton, carte).

**Ne jamais partir de `scale(0)`.** Rien, dans le monde réel, ne surgit du néant — même un ballon
dégonflé a une forme. Les entrées partent de 0,96–0,97, les sorties y reviennent (0,94 pour le
popover, 0,97 pour la modale, 0,98 pour les toasts). **Plancher : 0,90**, désormais tenu par un
garde plutôt que par la prose — la règle existait depuis l'origine et rien ne l'appliquait.

**Le recul compte moins par son amplitude que par sa DIRECTION.** Mesuré sur le calendrier réel
(304 px) : à 0,96 les bords ne se déplaçaient que de 6 px sur les trois quarts du parcours, soit
rien de perceptible — l'opacité portait tout le geste et l'échelle ne servait plus. Descendue à
0,94, le déplacement passe à 9 px : toujours invisible isolément, mais assez pour qu'on sente la
bulle partir VERS son déclencheur au lieu de s'évaporer sur place. Si un effet de sortie paraît
trop discret, **le levier est le recul, pas la durée** — allonger ferait attendre.

`prefers-reduced-motion` est traité GLOBALEMENT (`*` → durées à 0,01 ms), avec une exception
délibérée pour `animate-spin` : un indicateur de chargement porte une information.

## Cycle de chargement d'une page — `hooks/useRessource.ts`

Le couple `AbortController` + drapeau `actif` + `setLoading`/`setError` + garde `AbortError` était
recopié dans **32 des 44 pages**, pour 36 cycles au total. `useRessource(charger, deps, cleErreur)`
le porte désormais, et c'est le seul endroit où il est testé (`useRessource.test.tsx`, 7 cas :
annulation au démontage, garde `AbortError`, repli du message, relance sur dépendance déclarée,
non-relance sur simple rendu).

**Deux pièges, deux `ref`.** `charger` et `t` ont une identité neuve à chaque rendu. Les mettre
dans les dépendances de l'effet relance le chargement en boucle — défaut trouvé par le test du
module (8 628 appels), pas en production. Ils passent donc par des `ref` toujours à jour, et
l'effet ne repart que sur les `deps` DÉCLARÉES par l'appelant. Corollaire heureux pour `t` :
changer de langue ne recharge plus les données de la page.

**Le message de repli est TRADUIT** (`commun.erreurGenerique` par défaut). Les pages passaient par
`lib/api::messageErreur`, qui rend des chaînes **françaises en dur** (« Impossible de contacter le
serveur… ») dans 93 appels : un lecteur anglophone hors réseau lisait du français. Migrer une page
vers ce module ferme ce trou au passage.

**Tout est migré : 37 cycles, 0 restant.** Les sept premiers étaient les cycles « une ressource,
un état ». Les trente autres étaient COMPOSITES, et c'est là que le module a montré ce qu'il vaut :

- **un `Promise.all` réparti sur plusieurs états devient UN objet.** `MembresPage` en tenait quatre
  (items, total, résumé, branches) issus d'UNE réponse : ce n'étaient pas quatre états mais quatre
  champs, et les stocker séparément permettait de les désynchroniser ;
- **deux ressources plutôt qu'une quand le chargement est en CASCADE.** `MembreDetailPage` charge
  la fiche (qui pilote l'état de chargement) puis cinq lectures annexes best-effort ; les fondre
  ferait attendre la page sur la plus lente. Idem pour `MonEspacePage` : sans fiche membre liée
  (404, cas NORMAL), les dix listes n'ont pas lieu d'être — c'est ce que porte `pret` ;
- **le brouillon n'est pas la donnée.** Sur les formulaires (`MembreFormPage`, `CagnotteFormPage`,
  `ConflitDetailPage`…) il reste un petit `useEffect` d'AMORÇAGE, sans requête ni annulation : la
  ressource chargée est une donnée, les champs éditables sont un brouillon qui diverge dès la
  première frappe ;
- **une seule ressource pour trois modes.** `RapportsPage` en avait trois branches ; le résultat
  porte désormais le mode qui l'a produit — sans ce marqueur, une réponse en retard d'un mode
  précédent écraserait celle du mode courant ;
- **un cas garde son effet, et pour une raison.** La photo de `/moi` crée une URL d'objet qu'il faut
  RÉVOQUER au démontage. Aucune ressource ne peut le faire à sa place.

`hooks/useDashboard.ts` a disparu : il était l'ancêtre du module avec un seul consommateur, et la
revue demandait de le GÉNÉRALISER, pas de le laisser à côté.

**Deux pièges rencontrés en migrant, tous deux attrapés par `oxlint`** : un repli `?? []` écrit en
ligne fabrique un tableau NEUF à chaque rendu et invalide les mémoïsations en aval (d'où les
`useMemo`) ; et un setter dérivé (`setContributions`, `setReunions`…) doit être stabilisé par
`useCallback` dès qu'il entre dans les dépendances d'un `useCallback` d'action.

**Garde textuel** (`useRessource.test.tsx`) : aucun composant ne construit son propre
`AbortController`. Sans exception — les deux derniers cas récalcitrants ont été migrés plutôt
qu'inscrits sur une allowlist que personne ne relirait.

**⚠️ La garde `AbortError` absente de 14 cycles n'est PAS un défaut**, contrairement à ce qu'on
pourrait croire en la comptant : le drapeau `actif` est mis à `false` AVANT `controller.abort()`
dans la fonction de nettoyage, donc aucune écriture d'état ne passe. La garde est une ceinture en
plus des bretelles. Vérifié avant de l'annoncer comme un bug.

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

