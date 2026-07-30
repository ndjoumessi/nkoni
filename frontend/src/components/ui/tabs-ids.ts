/**
 * Dérivations d'id PARTAGÉES entre les onglets (`Tabs`) et leurs panneaux — le parent DOIT poser sur
 * chaque panneau `id={panelId(idBase, value)}` et `aria-labelledby={tabId(idBase, value)}` pour
 * fermer la paire APG (`aria-controls` ↔ `aria-labelledby`). Une seule source de dérivation →
 * symétrie garantie entre les deux côtés.
 *
 * Module SÉPARÉ de `Tabs.tsx` pour la même raison que `button-variants.ts` l'est de `Button.tsx` :
 * un fichier qui exporte autre chose qu'un composant casse le Fast Refresh
 * (`react(only-export-components)`), et le projet exige `oxlint` à 0 finding.
 */
export const tabId = (base: string, value: string) => `${base}-tab-${value}`
export const panelId = (base: string, value: string) => `${base}-panel-${value}`
