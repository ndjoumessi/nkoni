# Audit UI/UX senior — NKONI (août 2026)

**Périmètre** : `frontend/src` (PWA React 19 + Tailwind v4, design system « Menthe & Encre », dark-only).
**Cible d'usage** : Android bas/milieu de gamme, **360 px**, Cameroun + diaspora. FR/EN.
**Méthode** : lecture du code (chemins + lignes cités), **mesures de contraste calculées**
(oklch → sRGB linéaire → luminance relative WCAG 2.1), analyse de cascade CSS. Aucune
recommandation n'est donnée sans localisation dans le code ou sans mesure.

---

## 0. Verdict

Le design system est **au-dessus de la moyenne du marché** : jetons centralisés, anneau de focus
unique global, `prefers-reduced-motion` traité sérieusement (y compris l'exception motivée des
spinners), primitives partagées (`EmptyState`/`ErrorState`/`Modal` avec piège de focus), `Field`
qui pilote le style **depuis** `aria-invalid`, `Toast` conforme WCAG 2.2.1 (pause au survol **et**
au focus), `GrapheEvolution` avec table `sr-only` et double encodage forme+couleur. C'est un socle
qu'on ne trouve presque jamais dans un produit de cette taille.

Les défauts trouvés ne sont donc pas des lacunes de culture, mais **des angles morts précis** —
majoritairement là où rien d'automatique ne regarde : le rendu à 360 px, la cascade CSS, et le
contraste des **compositions** (texte teinté sur fond teinté de même teinte).

**Trois défauts bloquent réellement un utilisateur** : le CTA primaire sans anneau de focus, les
modales dont les boutons de validation sortent de l'écran, et un tableau dont le contenu est
inatteignable. Les trois sont corrigeables en une journée.

---

## 1. Rapport priorisé

### 🔴 Critique — bloque l'usage ou échoue WCAG AA

| # | Localisation | Problème | Réf. | Correctif |
|---|---|---|---|---|
| C1 | `ui/button-variants.ts:12,17` | Le variant **`brass` (= défaut, le CTA primaire)** pose `shadow-[…]` en couche *utilities*, qui **écrase** le `box-shadow` de l'anneau `:focus-visible` défini en couche *base* (`index.css:174`). Le base cva ajoute `focus-visible:outline-none` → **aucun repli natif**. Résultat : le bouton le plus important de l'app n'a **aucun focus visible au clavier**. Les autres variants (sans `shadow-*`) sont indemnes. | WCAG 2.4.7 | Ajouter un anneau explicite dans le variant (voir §3.2). Vérif : `Tab` jusqu'à « Enregistrer ». |
| C2 | `ui/Modal.tsx:106,121` | Panneau `items-center` **sans `max-h` ni `overflow-y-auto`**, et `document.body.style.overflow='hidden'` (`:91`) verrouille le scroll. Un contenu plus haut que le viewport est **coupé en haut ET en bas** : les boutons de validation deviennent inatteignables. Touche ~15 modales (formulaire dépense, amende, cropper photo, détail org). | WCAG 1.4.10 | `max-h-[85dvh] overflow-y-auto overscroll-contain` (voir §3.3). |
| C3 | `pages/CagnotteDetailPage.tsx:292` | Table des dons dans `Card className="overflow-hidden p-0"` **sans `overflow-x-auto`** → à 360 px les colonnes de droite sont **clippées et inatteignables** (pas de scroll possible). | WCAG 1.4.10 | Ajouter `overflow-x-auto` sur le conteneur. |
| C4 | `ui/Badge.tsx:13-15` (mesure) | **Badges `terra` = 3.58:1** et **`info` = 4.21:1** (texte `text-<ton>` sur `bg-<ton>/12` composité sur `--surface`) → **sous le seuil 4.5:1**. Ce sont les badges **« Non à jour »**, **« Impayée »**, **« En retard »** : les statuts financiers les plus lourds de sens du produit. `jade` 4.88 / `amber` 4.77 / `brass` 5.15 passent de justesse. | WCAG 1.4.3 | Jetons de texte dédiés (voir §2.2). |
| C5 | `index.css:28` + `ui/Badge.tsx:18` | `--text-3xs: 0.68rem` = **10.9 px**, utilisé par `Badge size="sm"` — c'est-à-dire **tous** les badges de statut (`StatutBadges.tsx:28`, tableaux, listes). Sous le plancher de lisibilité de 12 px, sur un public partiellement presbyte et sur écran bas de gamme. | Heuristique lisibilité | Relever `--text-3xs` à `0.75rem` (12 px) ; le commentaire du fichier annonce d'ailleurs « PLANCHER de lisibilité » — il n'est pas tenu. |
| C6 | `pages/CagnotteDetailPage.tsx:321` | Bouton de **suppression** d'un don : aucune classe de taille → cible tactile de **16 × 16 px**. Action **destructive** la plus petite de l'app. | WCAG 2.5.8 | `h-9 w-9` + `tap-target`, ou `Button size="icon"`. |
| C7 | `pages/MonEspacePage.tsx:798,851` | Contrôles **RSVP** et **vote** : `px-3 py-1 text-xs` → **24 px de haut**. Ce sont les deux seules actions réellement *engageantes* de l'espace membre, sur la page **100 % mobile** du produit. | WCAG 2.5.8 | `min-h-11 px-4` (voir §3.5). |
| C8 | `index.html:6` + `index.css` | **Aucune gestion des safe areas** : zéro `env(safe-area-inset-*)`, pas de `viewport-fit=cover`. En **PWA installée** (standalone — le mode nominal du produit, cf. push), le topbar sticky (`AppShell.tsx:484`) et le drawer plein écran (`:535`) passent **sous la barre de gestes Android / l'encoche**. | Ergonomie mobile | Voir §3.6. |

### 🟡 Majeur — dégrade nettement l'expérience

| # | Localisation | Problème | Correctif |
|---|---|---|---|
| M1 | `pages/MonEspacePage.tsx:741-754` | Deux boutons `h-8 w-8` **adjacents** (`gap-1`) portant tous deux `.tap-target` → les hitbox de 44 px **se chevauchent**. C'est précisément l'usage interdit par le commentaire de l'utilitaire (`index.css:299-300` : « à réserver aux boutons ISOLÉS »). Un appui sur « supprimer » peut déclencher « marquer lu » et inversement. | Passer à `h-11 w-11` visuels, ou écarter (`gap-3`) et retirer un `tap-target`. |
| M2 | `pages/AmendesPage.tsx:355-370` | **4 boutons de 28 px** (valider / éditer / annuler / supprimer) espacés de 6 px, dans une cellule de tableau. Densité inatteignable au pouce ; mélange actions bénignes et destructives. | `h-9 w-9` + `gap-2`, ou menu d'actions « ⋯ » en mobile. |
| M3 | `ui/DataTable.tsx:96-97` | `<table className="w-full">` **sans `min-w-`** dans un `overflow-x-auto`. En `table-layout:auto` le navigateur **comprime** les colonnes à leur `min-content` au lieu de déborder → à 360 px on obtient un **écrasement/wrap sauvage** plutôt qu'un scroll franc. Le seul endroit correct du repo est `RapportsPage.tsx:260` (`min-w-max`). Concerne 10+ tableaux de 5 à 7 colonnes. | `min-w-max md:min-w-0` + `px-3 sm:px-4` sur les cellules. |
| M4 | Transverse | **Aucun retour tactile à l'appui** : `-webkit-tap-highlight-color: transparent` (`index.css:153`) supprime le halo natif, `hover:` n'existe pas au doigt, et seuls `brass` (`active:brightness-95`) et quelques boutons ont un état `active:`. Sur Android, la majorité des boutons icône **ne réagissent pas visuellement** à l'appui. | Ajouter `active:` (échelle ou fond) aux variants et aux boutons icône. |
| M5 | `pages/FonctionsPage.tsx:128` | `grid-cols-3` **sans variante responsive** pour 3 `StatCard` (`p-5`) → ~69 px de contenu utile par carte à 360 px, avec un `text-2xl` et un label `tracking-[0.12em]`. Toutes les autres pages de liste font `grid-cols-2 … lg:grid-cols-4`. | `grid-cols-2 sm:grid-cols-3`. |
| M6 | `pages/SuperAdminPage.tsx:615-668` | 4 largeurs fixes en `rem` (9.5+10+8.5+7 = **560 px**) + 2 colonnes libres → table d'environ **800 px** imposés. Idem `UtilisateursPage.tsx:248` (13 rem), `AuditLogPage.tsx:287` (11.5 rem + `whitespace-nowrap`). | Conditionner les `width` au `md:` ou les supprimer. |
| M7 | `components/membres/CropperPhoto.tsx:11,108` | Viewport de recadrage **fixe à 280 px** en style inline, dans une `Modal` (`p-4` + `p-6` = 80 px de gouttières) → **déborde dès 359 px**, et -60 px sur un écran de 320 px. | `Math.min(280, window.innerWidth - 96)`. |
| M8 | `ui/Skeleton.tsx:4-36` | Squelettes sans `aria-hidden` → un lecteur d'écran rencontre des `<div>` vides ; **aucune annonce de chargement** au niveau page (`DashboardPage.tsx:420`, `MembreDetailPage.tsx:311`, `MonEspacePage.tsx:301`). `DataTable:151` et `Button:35` font pourtant correctement `aria-busy`. | `aria-hidden` sur le bloc + `aria-busy`/`role="status"` sur le conteneur (voir §3.4). |
| M9 | `components/dashboard/AnalyseMembres.tsx:33-37,141` | **Seul cas d'information encodée par la couleur seule** : le seuil de performance (≥80 % jade / ≥50 % amber / sinon terra) n'existe que dans la teinte de la barre. | Ajouter le niveau en texte ou `role="progressbar"` + `aria-label`. |
| M10 | `pages/CagnottesPage.tsx:26-30`, `CagnotteDetailPage.tsx:276-277`, `SuperAdminPage.tsx:832` | Barres de progression **totalement muettes** (ni `role`, ni `aria-label`, ni `aria-hidden`) — alors que 5 autres barres du repo font correctement `role="progressbar"` (`ParametresPage:199`, `MonEspacePage:634`, `TontineDetailPage:301`…). | Aligner sur le pattern existant. |
| M11 | Mesures | `text-terra` sur `--surface-3` = **4.18:1** et `text-emerald-deep` sur `--surface-3` = **3.88:1** → échec AA sur **survol de carte** et **bouton `outline` au survol** (`button-variants.ts:19` → `hover:bg-surface-3`). | Couvert par les jetons de texte du §2.2. |
| M12 | `ui/button-variants.ts:25-26` | `sm` = 36 px et `md` = 40 px — **les deux tailles par défaut** — sont sous 44 px. `Pagination.tsx:34,46` utilise `sm`. `ui/Tabs.tsx:74` = 36 px (tous les onglets de l'app). | Passer `md` à `h-11` (44 px) au moins en mobile ; `sm` réservé au desktop dense. |

### 🟢 Mineur — finition

| # | Localisation | Problème |
|---|---|---|
| m1 | `index.css:96` | `--hairline` (blanc 10 %) = **2.74:1** sur `--surface`. Acceptable tant que la bordure reste **décorative** (les cartes se distinguent aussi par leur fond) ; à relever vers `--hairline-strong` (4.12:1) partout où la bordure **porte seule** la délimitation (ex. champs de formulaire). |
| m2 | `dashboard/GrapheEvolution.tsx:288` | L'unique graduation de l'axe Y utilise `formatNombre(max)` — **sans unité monétaire**, alors que la table `sr-only` utilise `formatMontant`. Le lecteur voyant ne sait pas s'il lit des FCFA ou un effectif. |
| m3 | `components/membres/CarteMembre.tsx:90` | QR code en `alt=""` : un alternatif décrivant l'action (« QR de vérification du statut ») serait plus utile qu'un vide. |
| m4 | `pages/EquilibrageFormPage.tsx:309` | `aria-invalid` posé **sans** `aria-describedby` ni message associé → bordure rouge muette. |
| m5 | `ui/DataTable.tsx:93-99` | En-tête `sticky` **neutralisé en mobile** (assumé et commenté). Sur une liste longue à 360 px, plus de repère de colonnes après quelques lignes. |
| m6 | `VersementFormPage.tsx:190`, `MembreFormPage.tsx:211` | Erreur serveur **uniquement en toast** (8 s) : ratée, l'information est perdue. 8 autres pages ont un bloc `role="alert"` persistant — pattern à généraliser sur les formulaires financiers. |
| m7 | `ui/DatePicker.tsx:487` | Cellules de jour de 36 px, jointives (`gap-0.5`), sur 42 cellules → sélection de date imprécise au pouce. |

---

## 2. Système de jetons

### 2.1 Pourquoi je ne réécris pas votre fichier de jetons

La méthodologie d'audit standard fournit ici un fichier `:root` complet et générique. **Ce serait une
erreur dans votre cas**, et je l'écarte délibérément :

1. Vous avez **déjà** une couche de jetons centralisée, commentée et cohérente (`index.css:76-140`),
   avec une règle explicite dans `CLAUDE.md` : *« Ne pas recopier de valeurs oklch en dur »*,
   *« un thème = édition des VALEURS de jetons, les noms restent stables »*.
2. Votre couche shadcn **dérive** de la couche NKONI (`--primary: var(--brass)`…). Injecter un jeu
   `--color-primary/-hover/-active` générique **inverserait** ce sens de dépendance et casserait le
   remap.
3. Vos jetons portent des **avertissements de mesure** (`--surface-3`, `--faint`) que j'ai vérifiés
   et qui sont **exacts** (5.21 et 5.61 mesurés — vos chiffres au centième près).

Le livrable utile n'est donc pas un fichier neuf, mais **les ajouts manquants, dans votre
nomenclature**.

### 2.2 Ajout requis — jetons de TEXTE sur fond teinté (corrige C4 et M11)

Le problème structurel : `Badge` compose `text-<ton>` sur `bg-<ton>/12`. Fond et texte partageant la
**même teinte**, le fond remonte la luminance du substrat et **écrase le ratio**. Un jeton d'accent
ne peut pas servir à la fois d'aplat, de bordure et de texte-sur-lui-même.

Valeurs calculées (première valeur conforme **à la fois** au badge et au pire cas `--surface-3`) :

```css
:root {
  /* --- Accents (inchangés : aplats, bordures, graphiques, barres) --- */
  --terra: oklch(0.66 0.15 28);
  --info:  oklch(0.72 0.09 240);

  /* --- NOUVEAU : variantes TEXTE, pour un libellé posé sur un fond de la MÊME teinte
     (badges `bg-<ton>/12`, encadrés d'alerte) ou sur `--surface-3` (survol de carte,
     bouton `outline` au survol). Mesuré : texte sur `bg-<ton>/12` composité sur
     `--surface` — terra 3.58 → 4.51:1, info 4.21 → 4.51:1 (seuil AA 4.5).
     ⚠️ Même discipline que `--faint`/`--surface-3` : toute retouche re-mesure le ratio. --- */
  --terra-text: oklch(0.80 0.15 28);   /* corail clair — lisible en dark, reste « alerte » */
  --info-text:  oklch(0.76 0.09 240);
  --emerald-deep-text: oklch(0.72 0.15 163); /* emerald-deep en texte : 3.88 → conforme */
}
```

À déclarer dans `@theme inline` pour obtenir les utilitaires :

```css
--color-terra-text: var(--terra-text);
--color-info-text: var(--info-text);
--color-emerald-deep-text: var(--emerald-deep-text);
```

> **Pourquoi pas simplement baisser l'opacité du fond ?** Testé : même à `/5`, `terra` plafonne à
> 4.50:1 — le gain vient presque entièrement du jeton, pas du fond. Et un fond à 5 % ne se distingue
> plus de la surface : le badge perdrait sa lisibilité de forme. La correction doit porter sur le
> **texte**.

> **Compromis visuel assumé** : `terra-text` à L=0.80 est un corail plus clair que le rouge actuel.
> C'est le prix normal du rouge en dark mode — un rouge « vif » saturé est structurellement illisible
> sur fond sombre. Le rouge d'origine reste utilisé pour les bordures, aplats et barres.

### 2.3 Jetons manquants par rapport à l'état de l'art (à ajouter quand le besoin se présente)

Votre échelle est volontairement resserrée, ce qui est sain. Manquent seulement, si vous les
rencontrez : `--shadow-sm/md/lg` (les ombres sont aujourd'hui écrites en arbitraire dans
`button-variants.ts:17`), et des durées `--duration-fast/base/slow` (150/200/300 ms) — les valeurs
sont actuellement en dur (`duration-150`, `0.24s`, `0.6s`), cohérentes mais non centralisées.
**Non bloquant** : à faire au prochain besoin, pas en refonte.

---

## 3. Composants — code prêt à coller

### 3.1 `Badge` — appliquer les jetons de texte

```tsx
// ui/Badge.tsx — variantes de ton
tone: {
  neutral: 'border-hairline-strong bg-surface-2 text-muted-foreground',
  brass:   'border-brass/30 bg-brass/10 text-brass',
  jade:    'border-jade/30 bg-jade/12 text-jade',
  amber:   'border-amber/30 bg-amber/12 text-amber',
  // Texte = jeton `*-text` (plus clair) : le fond de MÊME teinte écrase sinon le
  // ratio (terra 3.58:1 mesuré). Le fond et la bordure gardent le jeton d'accent.
  terra:   'border-terra/35 bg-terra/12 text-terra-text',
  info:    'border-info/35 bg-info/12 text-info-text',
},
size: {
  sm: 'px-2.5 py-0.5 text-2xs',  // ← 3xs (10.9px) → 2xs (11.5px) ; ou relever --text-3xs à 0.75rem
  md: 'px-3 py-1 text-xs',
  lg: 'px-4 py-1.5 text-sm',
},
```

### 3.2 `Button` — restaurer l'anneau de focus sur le CTA (C1)

```ts
// ui/button-variants.ts
export const buttonVariants = cva(
  'group relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap ' +
  'rounded-full font-semibold transition-all duration-150 ease-out ' +
  // L'anneau global (`index.css:174`, couche BASE) est écrasé par tout `shadow-*` de la couche
  // UTILITIES — c'est le cas du variant `brass`. On repose donc un anneau EXPLICITE ici, qui
  // vit dans la même couche que l'ombre et coexiste avec elle (ring ≠ box-shadow).
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brass/60 ' +
  'focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ' +
  'disabled:pointer-events-none disabled:opacity-55',
  { /* … variants inchangés … */ },
)
```

> Vérification en 10 s : `Tab` jusqu'au bouton « Enregistrer » d'un formulaire. Avant : rien.
> Après : anneau menthe. À faire sur les **cinq** variants (le défaut `brass` étant le seul cassé,
> les autres ne régressent pas — `ring-*` et `shadow-*` sont deux propriétés distinctes).

### 3.3 `Modal` — rendre le contenu long atteignable (C2)

```tsx
// ui/Modal.tsx:106 — conteneur
<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
  {/* … overlay … */}
  {/* :121 — panneau */}
  <div className="nk-toast-in relative my-auto flex max-h-[85dvh] w-full max-w-md flex-col
                  overflow-hidden rounded-2xl border border-hairline bg-surface p-0 shadow-xl">
    {/* En-tête FIXE (titre + fermeture) */}
    <div className="shrink-0 p-6 pb-0">{/* … */}</div>
    {/* Corps SCROLLABLE : c'est lui qui débloque les boutons de validation sur petit écran */}
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">{children}</div>
  </div>
</div>
```

`dvh` (et non `vh`) est important sur Android : il suit la barre d'URL rétractable.
`overscroll-contain` évite que le scroll « traverse » vers le body verrouillé.

### 3.4 `Skeleton` — silence pour les lecteurs d'écran, annonce pour l'état (M8)

```tsx
// ui/Skeleton.tsx
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    // Purement décoratif : le lecteur d'écran ne doit pas rencontrer des div vides.
    // L'état de chargement est porté par le CONTENEUR (aria-busy + role="status"), pas ici.
    <div aria-hidden="true" className={cn('nk-shimmer relative overflow-hidden rounded-lg bg-surface-2', className)} {...props} />
  )
}
```

Au niveau page (`DashboardPage.tsx:420` et équivalents) :

```tsx
<div role="status" aria-busy={loading} aria-live="polite">
  {loading ? (<><span className="sr-only">{t('commun.chargement')}</span><DashboardSkeleton /></>) : <Contenu />}
</div>
```

### 3.5 Cibles tactiles — RSVP / vote (C7)

```tsx
// MonEspacePage.tsx:798 et :851
className={cn(
  // 44 px de haut minimum : ce sont les deux seules actions engageantes de l'espace membre,
  // sur la page la plus mobile du produit. `min-h-11` plutôt que `h-11` pour rester
  // compatible avec un libellé qui passerait sur deux lignes en EN.
  'inline-flex min-h-11 items-center rounded-full border px-4 text-sm transition-colors',
  'active:scale-[0.97]', // retour tactile : `hover` n'existe pas au doigt (cf. M4)
  actif ? RSVP_TON[s] : 'border-hairline text-muted-foreground',
)}
```

### 3.6 Safe areas (C8)

```html
<!-- index.html:6 -->
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

```css
/* index.css — @layer utilities */
/* PWA installée (standalone) : le topbar sticky et le drawer plein écran passent sinon sous
   l'encoche et sous la barre de gestes Android. Sans `viewport-fit=cover`, env() vaut 0. */
.pt-safe { padding-top: env(safe-area-inset-top, 0px); }
.pb-safe { padding-bottom: env(safe-area-inset-bottom, 0px); }
```

À appliquer sur `AppShell.tsx:484` (topbar → `pt-safe`) et `:535` (drawer → `pt-safe pb-safe`).

### 3.7 `DataTable` — scroll franc plutôt qu'écrasement (M3)

```tsx
// ui/DataTable.tsx:96
<div className={cn('overflow-x-auto md:overflow-visible', className)}>
  {/* `min-w-max` en mobile : sans lui, table-layout:auto COMPRIME les colonnes à leur
     min-content au lieu de déborder → wrap sauvage illisible plutôt qu'un scroll franc. */}
  <table className="w-full min-w-max border-collapse text-sm md:min-w-0">
```

Et réduire le padding cellule en mobile : `px-3 py-2.5 sm:px-4` (32 px gagnés par colonne).

---

## 4. Graphiques

`GrapheEvolution` est **conforme** (role="img" + aria-label, table `sr-only` complète, double
encodage forme + couleur, infobulle en `pointer-events-none`). Seul manque : l'unité sur l'axe Y (m2).

Adéquation type ↔ donnée, sur vos données réelles :

| Donnée NKONI | Type actuel | Verdict |
|---|---|---|
| Collecté cumulé vs objectif, par mois | Aire cumulée + N-1 | ✅ Correct — la série temporelle appelle une ligne/aire ; le cumul « à date » borné au mois courant est le bon choix (comparer un cumul à un total annuel écraserait la courbe). |
| Attendu vs collecté par mois | Barres (piste + remplissage) | ✅ Correct — comparaison de deux grandeurs par catégorie discrète. |
| Répartition des statuts (à jour / partiel / non à jour) | Donut + légende chiffrée | ✅ Correct — **3 parts**, sous la limite de 5 au-delà de laquelle le donut devient illisible. |
| Taux de recouvrement global | Jauge circulaire + % au centre | ✅ Correct — métrique unique ; la jauge est lisible car le chiffre porte l'information. |
| Recouvrement **par branche** | Barres horizontales | ⚠️ Correct en type, **défaillant en encodage** : le seuil de performance n'est donné que par la couleur (M9). |

Règle non tenue à corriger : *ne jamais encoder une information par la seule couleur* → M9.
Règle tenue partout ailleurs : infobulles doublées d'un équivalent textuel, légendes visibles.

---

## 5. Checklist de production

**Accessibilité**
- [x] Anneau `:focus-visible` global unique (`index.css:174`)
- [ ] **…mais écrasé sur le CTA primaire** → C1
- [x] Champs : label associé, `aria-invalid`, `aria-describedby`, message `role="alert"` (`Field.tsx:88-115`)
- [x] Icônes décoratives en `aria-hidden`, aucun `<img>` sans `alt`
- [x] Erreurs serveur annoncées (toast `role="alert"` / blocs `role="alert"`)
- [ ] Contraste AA sur **tous** les textes → C4, C5, M11
- [ ] Information jamais portée par la couleur seule → M9
- [ ] Chargement annoncé (`aria-busy` / `role="status"`) → M8

**Tactile & mobile**
- [ ] Toutes les cibles ≥ 44 px → C6, C7, M1, M2, M12, m7
- [ ] Aucun contenu inatteignable horizontalement → C3, M3, M6
- [ ] Safe areas respectées → C8
- [ ] Retour visuel à l'appui (`active:`) → M4
- [x] Navigation mobile au pouce (drawer + focus trap + Échap, `AppShell.tsx:443-454`)

**Layout**
- [ ] Testé à 320 / 360 / 375 px → M5, M6, M7
- [x] Largeur de page centralisée (`AppShell.classeLargeur`)

**Typographie**
- [ ] Aucun texte < 12 px → C5
- [x] Deux familles seulement (Geist + IBM Plex Mono pour `.num`)

**États**
- [x] `EmptyState` / `ErrorState` partagés, avec CTA
- [x] `loading` sur `Button` et `DataTable`
- [ ] Erreur persistante (non-toast) sur les formulaires financiers → m6

**Dark mode & thème**
- [x] Dark-only assumé, `color-scheme: dark`, zéro surface claire
- [x] Jetons centralisés, dérivation shadcn correcte
- [ ] Jetons de texte sur fond teinté → §2.2

**Animations**
- [x] `prefers-reduced-motion` traité globalement, exception spinners motivée (`index.css:272-291`)
- [x] `transform`/`opacity` uniquement, durées 150–600 ms
- [ ] Durées centralisées en jetons (mineur, §2.3)

**Graphiques**
- [x] Types adaptés aux données, légendes visibles, table `sr-only`
- [ ] Unité sur l'axe Y → m2 ; couleur seule sur les branches → M9

---

## 6. Plan d'exécution proposé (4 PR)

| PR | Contenu | Effort | Gain |
|---|---|---|---|
| **1 — Bloquants** | C1 (focus CTA), C2 (modale scrollable), C3 (table clippée) | ~2 h | Débloque 3 usages réellement empêchés |
| **2 — Contraste & lisibilité** | C4 + C5 + M11 (jetons `*-text`, `--text-3xs`) | ~2 h | Conformité AA sur les statuts financiers |
| **3 — Tactile** | C6, C7, M1, M2, M4, M12 | ~4 h | Utilisabilité réelle au pouce |
| **4 — Mobile & a11y de finition** | C8, M3, M5, M6, M7, M8, M9, M10 | ~5 h | PWA propre à 360 px |

Mineurs (m1–m7) : au fil de l'eau.

**Vérification** : `tsc` et `oxlint` ne voient **rien** de cet audit. Les seuls contrôles valides sont
(1) le script de contraste (§ mesures, reproductible), (2) `Tab` au clavier sur chaque écran, et
(3) l'inspection à 360 px avec la PWA **installée** (le mode standalone est le seul qui révèle C8).
