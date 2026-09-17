# Spécification — Onboarding : aide contextuelle « ? » sur les notions clés (chantier 1.2)

> **Statut** : validée par le PO section par section (17/09/2026), à relire avant le plan d'implémentation.
> **Roadmap** : `docs/roadmap-v1-vers-GA.md` §1.2 — dernier morceau (après `GuideDemarrage`, les
> `EmptyState` à CTA et l'espace de démonstration).

## 0. Décisions de cadrage

- **Pas de tutoriel « premiers pas » supplémentaire** (décision PO) : la mise en route est couverte par
  la checklist `GuideDemarrage` (barème → membres → premier versement), l'espace de démonstration
  (`/demo`, voir un espace rempli) et l'aide contextuelle ci-dessous. La roadmap 1.2 est close par
  cette livraison.
- **Forme retenue** : une icône « ? » à côté des **notions métier** qui déroutent un nouveau venu, ouvrant
  une courte explication FR/EN. Rien n'est masqué, aucune action n'est ajoutée.
- **Approche retenue** : un **catalogue central** (un texte par notion, réutilisé partout) et **un seul
  composant partagé**.
- **Approches écartées** :
  - *Textes d'aide rédigés page par page* : une même notion (« valorisé ») expliquée différemment à
    plusieurs endroits, traductions divergentes.
  - *Contenu servi par le backend* (éditable sans redéploiement) : API, stockage et écran d'édition pour
    un contenu qui change rarement.
  - *Panneau d'aide par page*, *centre d'aide / FAQ* : plus de rédaction à maintenir en deux langues,
    et l'explication n'est pas à l'endroit où la question se pose.

## 1. Composant et catalogue

### 1.1 `components/ui/AideNotion.tsx`

`<AideNotion notion="valorise" />`

- **Déclencheur** : un vrai `<button type="button">` (zone tactile 44 px, icône `CircleHelp` discrète en
  `text-faint`), nom accessible « Aide : <titre de la notion> » (clé i18n `aide.libelleBouton` avec
  interpolation), `aria-expanded`, `aria-controls` vers l'identifiant de la bulle.
- **Bulle** : rendue en **portail** via la primitive partagée `usePopoverFlottant` (comme `DatePicker`,
  immunité aux contextes d'empilement `nk-reveal`) ; `role="dialog"` non modal, `aria-labelledby` sur
  son titre ; contenu = titre + texte (1 à 3 phrases) + lien optionnel « En savoir plus » vers une route
  interne. Largeur bornée (≈ 18 rem), bornée au viewport par la primitive.
- **Ouverture** au clic et au clavier (Entrée / Espace, natifs du bouton) — **jamais au survol** (absent
  sur mobile, gênant pour les lecteurs d'écran). **Fermeture** : Échap, clic extérieur, second clic ; le
  focus revient sur le « ? » après Échap.
- **Style** : jetons du design system (`hairline`, `surface`, `brass`, `faint`), aucune valeur oklch en
  dur, échelle z des popovers (`z-50`).
- Aucune logique de rôle ni appel réseau dans le composant.

### 1.2 Catalogue `lib/aide.ts` et namespace i18n `aide`

- `NOTIONS_AIDE` : tableau `as const` des identifiants de notion ; `type NotionAide = typeof
  NOTIONS_AIDE[number]` → une notion inconnue passée au composant **ne compile pas**.
- Lien « En savoir plus » optionnel : table `LIENS_AIDE: Partial<Record<NotionAide, string>>` (routes
  internes seulement).
- Textes dans `locales/fr/aide.ts` (source de vérité) et `locales/en/aide.ts` (miroir typé contre le
  catalogue FR, parité vérifiée à la compilation comme les autres namespaces), clés
  `aide.notions.<notion>.titre` et `aide.notions.<notion>.texte`, plus `aide.libelleBouton` et
  `aide.enSavoirPlus`.

## 2. Notions, placement et rédaction

### 2.1 Premier lot (18 notions)

| Notion (`id`) | Placement principal | Sens à expliquer (fidèle aux règles du code) |
|---|---|---|
| `bareme` | page Barème (titre) | Montant de cotisation fixé pour une année ; il sert de base au montant attendu de chaque membre. |
| `ouvrirAnnee` | page Barème (« Ouvrir l'année ») | Crée la ligne de cotisation de l'année pour chaque membre actif, à partir du barème ; nécessaire pour encaisser. Impossible pour une année future. |
| `attendu` | tableau de bord (carte « Total attendu ») | Somme des barèmes sur les années où chaque membre doit cotiser (de son adhésion à l'année en cours ou à sa fin de contribution). |
| `verse` | tableau de bord (carte « Total collecté ») | Argent réellement encaissé par les versements enregistrés. |
| `valorise` | fiche membre (montants) | Égal au versé, sauf après un équilibrage qui le répartit autrement entre les années ; c'est lui qui détermine le statut. |
| `statutCotisation` | fiche membre (badge de statut) | À jour si le valorisé couvre l'attendu cumulé, partiel s'il le couvre en partie, non à jour si rien n'est valorisé. Toujours recalculé, jamais figé. |
| `equilibrage` | page Équilibrage (titre) et fiche membre | Répartit ce qu'un membre a déjà versé sur une plage d'années, sans créer ni retirer d'argent ; ne change pas le total. |
| `anneeAdhesion` | formulaire membre | Première année pour laquelle le membre doit cotiser. |
| `finContribution` | formulaire membre | Dernière année due ; renseignée quand le membre devient inactif ou décédé, son historique est conservé. |
| `chefSousFamille` | formulaire membre | Membre de référence de la sous-famille à laquelle ce membre est rattaché. |
| `chefOrganisation` | page Paramètres (chef) | Dirigeant désigné de l'organisation, affiché avec son surnom ; désigné depuis la fiche d'un membre. |
| `recuAnnule` | liste des versements (reçu annulé) | Un reçu annulé garde son numéro et ne peut plus être téléchargé ni partagé ; on l'annule pour corriger un versement puis réémettre un reçu. |
| `envoyerRecu` | liste des versements (« Envoyer ») | Envoie le reçu au membre par les canaux configurés pour l'organisation ; si aucun n'est disponible, l'application l'indique. |
| `circuitDepense` | page Trésorerie (dépenses) | Brouillon → en attente → approuvée ou rejetée → payée ; l'approbation et le paiement sont faits par des rôles différents. |
| `modeRotation` | tontines (création, mode de rotation) | Ordre fixe : les bénéficiaires sont fixés dès l'ouverture du cycle. Tirage : un bénéficiaire tiré au sort à chaque tour parmi ceux qui n'ont pas encore reçu. |
| `cagnotte` | page Cagnottes (titre) | Collecte ponctuelle pour un événement (mariage, deuil…), suivie à part des cotisations annuelles. |
| `voteResolution` | détail de réunion (vote) | Le bureau ouvre le vote, les membres votent, la clôture adopte la résolution si les « pour » dépassent les « contre » (abstentions non comptées). |
| `forfaitEcheance` | page Paramètres (forfait) | Le forfait fixe les capacités de l'espace ; à l'échéance, une période de grâce de 14 jours précède le retour au forfait Gratuit. |

Les emplacements exacts (composant, libellé visé) sont arrêtés dans le plan d'implémentation. Le texte
final de chaque notion est rédigé au plan, en respectant le sens ci-dessus.

### 2.2 Règles de placement

- Le « ? » suit le **libellé** qui nomme la notion (titre de carte, titre de page, étiquette de champ,
  en-tête de section).
- **Au plus un « ? » par notion dans un même écran** ; jamais à l'intérieur des lignes d'un tableau.
- **Jamais sur les écrans publics** (accueil, connexion, inscription, statut).
- Une aide est visible par tous ceux qui voient la notion ; elle n'ouvre aucune action (pas de garde de
  rôle à ajouter).
- Fonctionne tel quel dans l'espace de démonstration (lecture seule).

### 2.3 Règles de rédaction

- Français simple, **vouvoiement** (cohérent avec l'application), **3 phrases au plus** : ce que c'est,
  puis ce que cela change pour l'utilisateur.
- Aucun nom technique (pas de `montantValorise`, pas de nom d'enum).
- Anglais fidèle, même longueur.
- Toute règle citée doit correspondre au code (ex. 14 jours de grâce, abstentions non comptées) ; en cas
  de changement de règle, le texte d'aide est mis à jour dans la même PR.

## 3. Tests, livraison, documentation

### 3.1 Tests

- **Composant** (`AideNotion.test.tsx`, jsdom) : ouverture au clic et à Entrée ; fermeture par Échap
  avec retour du focus au déclencheur ; fermeture au clic extérieur ; nom accessible contenant le titre
  de la notion ; `aria-expanded` cohérent ; bulle rendue en portail (hors du conteneur du bouton) ; lien
  « En savoir plus » présent seulement pour une notion qui en a un.
- **Garde de complétude** (`aide-catalogue.test.ts`) : chaque notion de `NOTIONS_AIDE` a un titre et un
  texte non vides en FR et en EN ; test **jamais vacant** (`NOTIONS_AIDE.length > 0`) ; saboté dans la
  direction utile (retirer un texte EN → rouge).
- **Garde d'usage** : chaque notion du catalogue est utilisée au moins une fois dans `src/` (lecture en
  texte de `notion="<id>"`, hors tests) — pas de texte mort ; sabotage : retirer un usage → rouge.
- **Vérification visuelle** en navigateur (espace de démonstration local, base jetable) : 360 px et
  bureau, bulle lisible et bornée près des bords, aucun débordement horizontal.

### 3.2 Livraison

- **Une PR front** : composant, catalogue FR/EN, placement des 18 notions, tests. Aucun changement
  backend (pas de déploiement Railway).

### 3.3 Documentation

- `docs/architecture-frontend.md` : primitive `AideNotion` (à réutiliser, ne pas recréer d'infobulle ad
  hoc), règles de placement et de rédaction.
- `CLAUDE.md` : ajouter `AideNotion` à la liste « ne pas reconstruire ce qui existe » (une mention).
- Roadmap 1.2 : **terminée** — guide de démarrage, empty states, espace de démonstration, aide
  contextuelle ; tutoriel non retenu (décision PO du 17/09/2026).

## 4. Hors périmètre

- Tutoriel ou visite guidée de l'interface.
- Aide sur les écrans publics et sur la console super-admin.
- Contenu d'aide éditable sans redéploiement.
- Mesure d'usage des aides.
