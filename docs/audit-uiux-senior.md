# Audit UI/UX senior — NKONI frontend

Audit conduit contre le code réel (`frontend/src`) + les captures de l'écran « Mon espace ».
Cadre : les 8 axes obligatoires (a11y/contraste → touch → layout → typo/couleur → composants →
navigation → animations → thème). Références `fichier:ligne` pour chaque point.

## Contexte

Fintech SaaS multi-tenant (cotisations, tontines, transparence financière). Stack : Vite + React
+ Tailwind v4 + shadcn (couche CSS) + design system **« Menthe & Encre »** (dark-only, tokens oklch
dans `src/index.css`). PWA hors-ligne. Marché Cameroun / Afrique de l'Ouest (Android bas de gamme,
360–375 px, réseau lent). UI FR/EN. Devise FCFA/XAF.

## Verdict d'ensemble

Le socle est **déjà de qualité production** sur la majorité des critères — c'est rare et il faut le
dire : anneau `:focus-visible` unique (`index.css:164`), neutralisation `prefers-reduced-motion`
avec exception assumée pour `animate-spin` (`index.css:262`), échelle typo plancher `--text-3xs`
(`index.css:29`), montants tabulaires `.num` (`index.css:154`), `Field` qui génère `id`/`aria-invalid`/
`aria-describedby`/`role="alert"` (`Field.tsx:86`), `Modal` piège de focus + Escape + clic overlay +
verrou de scroll (`Modal.tsx:45`), `DataTable` tri accessible `aria-sort` (`DataTable.tsx:90`),
`GrapheEvolution` `role="img"` + table `sr-only` + distinction forme ET couleur (`GrapheEvolution.tsx:503`).

Les écarts réels tiennent en trois familles : **(1) cibles tactiles sous 44 px** sur un marché
mobile-first, **(2) états manquants mutualisés** (vide/skeleton dans `DataTable`), **(3) la page
« Mon espace »** — hiérarchie plate, espace gaspillé, action primaire noyée, pas de segmentation.

---

## 1 — Rapport de problèmes priorisé

| Prio | Localisation | Problème | WCAG/Heuristique | Correctif |
|------|--------------|----------|------------------|-----------|
| 🔴 | `BaremePage.tsx:422`, `SuperAdminPage.tsx:602/611/881` | Boutons-icône `h-8 w-8` (32 px) SANS `.tap-target` — hitbox sous le seuil | WCAG 2.5.5 / iOS HIG 44 / Android 48 | Ajouter `tap-target` (l'utilitaire existe déjà `index.css:287`) ou variante `iconSm` |
| 🔴 | `button-variants.ts:24` (`sm: h-8`) — ~110 usages / 32 fichiers | Bouton `size="sm"` = 32 px, courant dans les barres d'action denses (Trésorerie, Rapports, SuperAdmin) | WCAG 2.5.5 | Relever `sm` à `h-9` (36) + hitbox 44 sur mobile via `tap-target`, ou variante tactile |
| 🟡 | `DataTable.tsx` (tout) | Aucun état **vide** ni **skeleton** intégré → réinventé page par page (~30 fichiers en `animate-pulse`/`nk-shimmer` ad hoc) | Nielsen « visibilité de l'état » ; cohérence | Props `empty` + `loading` sur `DataTable` + primitive `Skeleton` partagée |
| 🟡 | `MonEspacePage.tsx` (situation) | Action n°1 du membre (régler le reste dû, ex. 23 925 FCFA) uniquement dans le tableau, ligne par ligne — aucun CTA proéminent | Nielsen « visibilité / action primaire » | CTA « Payer le reste » à côté de la barre de progression |
| 🟡 | `MonEspacePage.tsx` (sections) | Hiérarchie plate : tous les titres en même overline `text-2xs uppercase` ; 7+ sections en scroll unique ; large vide horizontal desktop | Loi de Fitts / hiérarchie visuelle | Segmentation par onglets + layout colonne + rail droit + 3 niveaux typo |
| 🟡 | `MonEspacePage.tsx` | Pas de segmentation — Aperçu/Contributions/Tontines/Reçus empilés | Nielsen « reconnaissance » | Segmented control (`Tabs`) collant sous l'en-tête |
| 🟡 | `MonEspacePage.tsx` (réunions/notifs vides) | États vides en carte pleine (« Aucune réunion à venir ») = bruit qui dilue l'information | Densité / signal-bruit | Ligne compacte muette ou repli dans le rail |
| ✅ | `index.css:97/123` `--faint`/`--muted-foreground` | **Mesuré (résolu)** : sur les 4 surfaces (`canvas`/`surface`/`surface-2`/`surface-3`), `--faint` va de 6.56:1 à **4.65:1** et `--muted-foreground` de 7.91:1 à **5.61:1** — au-dessus du seuil AA 4.5:1 partout. Pire cas = `surface-3` (fond de SURVOL des cartes et boutons `outline`) | WCAG 1.4.3 | Aucun changement requis ; le commentaire « relevé pour tenir AA » est validé. **Marge mince sur `--faint`/`surface-3` (4.65)** : assombrir `--faint` ou éclaircir `--surface-3` casserait AA |
| 🟢 | `MonEspacePage.tsx` (situation + carte) | Badge « Partiel » affiché deux fois (en-tête + carte de membre) | Cohérence / redondance | Garder un seul point de vérité du statut |
| 🟢 | `MonEspacePage.tsx` (carte de membre) | Carte de membre volumineuse (carte dans carte) au milieu du flux de données | Rythme visuel | Déplacer dans le rail droit, format compact |
| 🟢 | `button-variants.ts` (`ghost`) | `ghost` sans bordure au repos se lit comme une légende quand isolé (déjà noté dans CLAUDE.md) | Affordance | Réserver `ghost` aux zones portant déjà l'affordance ; sinon `outline` |

Aucun problème 🔴 de contraste avéré, de focus manquant ou de piège clavier n'a été trouvé dans le
socle — le système les traite déjà globalement. Les deux 🔴 ci-dessus relèvent de la cible tactile
sur un marché explicitement mobile bas de gamme, où le seuil 44 px est structurant.

---

## 2 — Système de tokens

Point important : NKONI possède **déjà** un système de tokens supérieur au gabarit générique de cet
audit — oklch (gamut large, cohérence perceptuelle), dark-native, remap shadcn dérivé, anneau focus
et reduced-motion centralisés. **Ne pas le remplacer par une échelle hex** : ce serait une régression
et contredirait la règle du projet (source de vérité = couche NKONI, cf. CLAUDE.md).

Ce qui est déjà couvert (validé) : couleurs de marque + sémantiques (`--brass` menthe, `--jade`,
`--amber` or, `--terra` alerte, `--info`), surfaces à 4 niveaux (`--canvas`/`--surface`/`--surface-2`/
`--surface-3`), texte (`--foreground`/`--muted-foreground`/`--faint`), bordures (`--hairline`/
`-strong`), focus (`--ring`), typo (`--font-sans` Geist / `--font-mono` IBM Plex).

Ajouts recommandés (compléments, pas remplacement) :

```css
:root {
  /* États explicites du CTA primaire (aujourd'hui via hover:brightness — OK mais non tokenisé) */
  --brass-hover:  oklch(0.87 0.14 168);
  --brass-active: oklch(0.81 0.14 168);

  /* Tons sémantiques -bg / -text déjà appliqués par Badge/StatCard mais non nommés au niveau token :
     les remonter en tokens évite les color-mix recopiés. */
  --success-bg: color-mix(in oklch, var(--jade) 12%, transparent);
  --warning-bg: color-mix(in oklch, var(--amber) 12%, transparent);
  --danger-bg:  color-mix(in oklch, var(--terra) 12%, transparent);

  /* Ombres tokenisées (aujourd'hui en oklch inline dans Toast.tsx:119, glassmorphism-…:154) */
  --shadow-sm: 0 1px 2px oklch(0 0 0 / 0.20);
  --shadow-md: 0 4px 12px oklch(0 0 0 / 0.28);
  --shadow-lg: 0 8px 24px oklch(0 0 0 / 0.35);
}
```

Espacement / rayon / z-index : gérés par Tailwind v4 + l'échelle z documentée (contenu `z-40`,
popover/Modal `z-50`, Toast/CommandPalette `z-100`). Pas besoin de dupliquer en custom properties —
le garder cohérent via les classes Tailwind. **Règle maintenue** : zéro valeur oklch en dur dans les
composants, passer par le token + `color-mix` pour l'alpha.

---

## 3 — Composants : état et refactors ciblés

**Déjà conformes (tous états couverts, ne rien refaire)** : `Button` (variants brass/outline/ghost/
danger/jade, `type="button"` par défaut, `aria-busy`, loading spinner, disabled — `Button.tsx:23`),
`Field`/Input (label/erreur/hint/aria — `Field.tsx`), `Badge` (6 tons sémantiques), `Modal` (focus
trap complet), `Toast` (`role`, auto-dismiss, close).

Trois écarts à combler, avec code prêt :

### 3.1 — Primitive `Skeleton` partagée (CORRECTION : elle existe déjà)

Rectification post-audit : `components/ui/Skeleton.tsx` **existe déjà** (`Skeleton`,
`StatCardSkeleton`, `RowsSkeleton`) — l'exploration initiale l'avait manqué. Il n'y a donc RIEN à
créer ; l'intégration `DataTable` ci-dessous réutilise la primitive existante. Le reste de ce §3.1
est conservé pour trace mais ne s'applique pas.

### 3.2 — `DataTable` : états vide + chargement intégrés

```tsx
// Ajouts à la signature de DataTable
interface DataTableProps<T> {
  // …existant
  loading?: boolean          // rend N lignes Skeleton
  empty?: React.ReactNode    // rendu si rows.length === 0 (défaut : message muet)
  skeletonRows?: number      // défaut 5
}

// Dans le <tbody> :
{loading ? (
  Array.from({ length: skeletonRows ?? 5 }).map((_, i) => (
    <tr key={i}>{columns.map((c) => (
      <td key={c.key} className="px-3 py-2.5"><Skeleton className="h-4 w-full" /></td>
    ))}</tr>
  ))
) : rows.length === 0 ? (
  <tr><td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-faint">
    {empty ?? 'Aucune donnée.'}
  </td></tr>
) : (
  rows.map(/* …rendu existant */)
)}
```

Cela mutualise deux états aujourd'hui absents et supprime la divergence des 30 squelettes ad hoc.

### 3.3 — `Tabs` (segmented control) — nécessaire pour « Mon espace »

```tsx
// src/components/ui/Tabs.tsx
import { cn } from '@/lib/utils'

interface TabsProps {
  value: string
  onValueChange: (v: string) => void
  options: { value: string; label: string }[]
  ariaLabel: string
}
export function Tabs({ value, onValueChange, options, ariaLabel }: TabsProps) {
  return (
    <div role="tablist" aria-label={ariaLabel}
         className="inline-flex gap-1 rounded-full border border-hairline bg-surface p-1">
      {options.map((o) => {
        const actif = o.value === value
        return (
          <button key={o.value} role="tab" type="button" aria-selected={actif}
            onClick={() => onValueChange(o.value)}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none',              // anneau global :focus-visible
              actif ? 'bg-surface-2 text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}>
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
```

### 3.4 — Cibles tactiles

- Relever `button-variants.ts:24` : `sm: 'h-9'` (36 px) au lieu de `h-8`, ou introduire une taille
  `smTap: 'h-8 tap-target'` pour les barres denses où 44 px de rendu casserait la mise en page.
- Systématiser `.tap-target` sur **tout** bouton-icône `< h-11` (les cas `BaremePage:422`,
  `SuperAdminPage:602/611/881` l'oublient ; `DataTable`/`Modal`/`RapportsPage` le font déjà — le
  motif existe, il faut juste le généraliser).

---

## 4 — Recommandations graphiques

`GrapheEvolution` (SVG maison) est **exemplaire** — à garder : `role="img"` + table `sr-only`,
distinction forme + couleur, échelle bornée sur `max(attendu, collecté)`, animations gated
reduced-motion, aucun texte dans le SVG (évite la déformation `viewBox`).

| Donnée | Recommandé (NKONI) | À éviter |
|--------|--------------------|----------|
| Évolution cumulée collecté/objectif | Courbe cumulée « à date » (existant, variante `aire`) | Camembert |
| Attendu vs collecté par mois | Barres (existant, variante `barres`) | Empilé illisible |
| Répartition des statuts (à jour/partiel/non à jour) | Donut ≤ 5 parts (`StatutRepartition` existant) | Camembert 3D, > 5 parts |
| KPI unique (solde caisse, reste dû) | StatCard + éventuel sparkline | Graphe plein |
| Classement (top membres/branches) | Barres HORIZONTALES | Barres verticales > 8 items |

Règles déjà respectées : jamais de couleur seule (forme + label), infobulle doublée d'une table
accessible, palette dérivée des tokens. À maintenir sur tout nouveau graphe.

---

## 5 — Checklist de production (statut NKONI)

**Accessibilité**
- [x] Anneau `:focus-visible` global unique (`index.css:164`)
- [x] Erreurs annoncées `role="alert"` (`Field.tsx`)
- [x] Champs liés à un `<label>` + aria auto (`Field.tsx:86`)
- [x] Pas d'info par la couleur seule (graphes forme+couleur)
- [x] Contraste texte ≥ 4.5:1 — **mesuré** (sRGB, 4 surfaces) : `--faint` ≥ 4.65:1, `--muted-foreground` ≥ 5.61:1. Pire cas sur `--surface-3` ; sur `--surface-2` on est à 5.48 / 6.62
- [x] Navigation clavier (Modal focus trap, DataTable, CommandPalette)

**Tactile & mobile**
- [ ] Toutes cibles ≥ 44 px — **échec** : `size="sm"` (32) + boutons-icône sans `tap-target`
- [x] Pas de scroll horizontal parasite (bande graphe scrollable maîtrisée)
- [~] Bottom nav atteignable au pouce — **pas de bottom tab bar** (nav mobile = drawer uniquement)

**Layout & espacement**
- [x] Grille Tailwind cohérente ; échelle z documentée
- [~] Testé 320/375/768/1024/1440 — à confirmer sur « Mon espace » (colonne unique = vide desktop)

**Typographie**
- [x] 2 graisses (400/500…semibold ponctuel), montants tabulaires, plancher `--text-3xs`
- [~] Hiérarchie de section trop plate sur « Mon espace »

**Composants & états**
- [x] hover/focus/active/disabled sur les primitives
- [x] Loading présent (spinner `animate-spin` maintenu en reduced-motion)
- [ ] État vide + skeleton **mutualisés** dans `DataTable` — manquants
- [x] États d'erreur explicites (`ErrorState`, messages métier i18n)

**Dark mode**
- [x] Tokens partout, dark-native, aucune île claire (hors marque figée `NkoniMark`/`CarteMembre`, assumé)
- [x] Une seule couche de vérité (NKONI → shadcn dérivé)

**Animations**
- [x] Durées 150–300 ms, `transform`/`opacity`
- [x] `prefers-reduced-motion` neutralise tout (exception spinner assumée)

**Charts**
- [x] Types adaptés, légendes/table accessibles, pas de couleur seule

---

## Plan d'action (ordre de rentabilité)

1. **Tactile (🔴)** — relever `size="sm"` + généraliser `.tap-target` sur les boutons-icône < 44 px.
   Diff mécanique, impact direct sur le marché cible. *(quick win, transverse)*
2. **`Skeleton` + `DataTable` vide/loading (🟡)** — une primitive + deux props, supprime 30 squelettes ad hoc.
3. **« Mon espace » (🟡)** — `Tabs` segmenté + CTA « Payer le reste » + icônes teintées + layout colonne/rail + états vides compactés.
4. **Contraste (🟡)** — mesurer `--faint`/`--muted-foreground`, relever si nécessaire.
5. **Polish (🟢)** — dédup badge « Partiel », carte membre au rail, usage `ghost`.

Extensible au-delà de « Mon espace » : les points 1, 2 et 4 sont transverses à tout le front.

---

## Suivi (post-audit)

- **Point 1 — cibles tactiles** : FAIT (PR #35). `sm` 32→36, `icon` 40→44, boutons-icône bruts
  SuperAdmin à 44 px réels (les trois, y c. le « copier l'ID » du détail), X de Barème aligné à 36.
- **Point 2 — `DataTable` vide/loading** : FAIT (PR #36). Props `loading`/`skeletonRows`/`empty`,
  réutilisant la primitive `Skeleton` **existante** (cf. correction §3.1).
- **Point 3 — « Mon espace »** : FAIT. Primitive `Tabs` (PR #38) + pairing APG `aria-controls`
  (PR #39) ; onglets Aperçu/Contributions/Tontines/Reçus + CTA « Payer le reste » (PR #40) ; layout
  colonne + rail droit desktop (PR #41). `Tabs`/`tabId`/`panelId` extraits (`tabs-ids.ts`) pour le
  Fast Refresh. `aria-controls` émis SEULEMENT sur l'onglet actif (motif panneau unique réutilisé).
- **Point 4 — contraste** : MESURÉ, **conforme AA** (cf. tableau ci-dessus) — ligne close, zéro diff.
- **Point 5 — polish** : FAIT (PR #42). Dédup du badge « Partiel » (retiré de l'en-tête situation,
  porté par carte + progression + CTA) ; rail conditionnel (pas de colonne vide desktop). `ghost` :
  déjà conforme (usage en ligne de tableau, sanctionné par CLAUDE.md) → aucun changement.
- **Correction §3.1** : la primitive `Skeleton` n'était PAS manquante (erreur de l'exploration
  initiale). Le §3.1 est rectifié en conséquence.
- **Adoption `DataTable` `loading`/`empty`** : FAIT pour TresoreriePage (PR #43), qui avait le motif
  SIMPLE (vide en `<p>` nu). **NON étendue aux autres pages-listes** (Amendes, Cagnottes, Membres,
  Utilisateurs, Tontines…) : elles ont déjà un `EmptyState` PLEINE PAGE (icône + CTA + variantes
  avec/sans filtres) qui garde le `DataTable`, plus `RowsSkeleton` pour le chargement — motif page-level
  RICHE. Les convertir vers le `empty` en cellule serait un DOWNGRADE. Décision : ne pas sweeper ;
  les props `DataTable` sont réservées aux tableaux imbriqués à vide-simple.
