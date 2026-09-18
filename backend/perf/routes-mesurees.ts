import { ANNEE_FIN } from './jeu-de-charge'

/**
 * Routes mesurées par les tests de charge (roadmap 2.4) — les écrans LOURDS : agrégats, statuts
 * calculés sur toute l'organisation, exports. Source UNIQUE du harnais (`charge.ts`) et du garde N+1
 * exécuté en CI (`tests/n-plus-un.integration.test.ts`) : une route ajoutée ici est couverte par les deux.
 * `simple` : appelée avec le compte MEMBRE_SIMPLE (surface `/moi/*`), sinon avec le compte ADMIN.
 */
export interface RouteMesuree {
  nom: string
  url: string
  simple?: true
}

export function routesMesurees(membreId: string): RouteMesuree[] {
  const annee = ANNEE_FIN
  return [
    { nom: 'Tableau de bord', url: '/dashboard' },
    { nom: 'Analyse du tableau de bord (agrégée)', url: '/membres/statuts/analyse' },
    { nom: 'Statuts (ancienne analyse, PWA en cache)', url: '/membres/statuts' },
    { nom: 'Liste des membres (page 1)', url: '/membres/statuts/page?page=1&pageSize=25' },
    { nom: 'Liste des membres (recherche + tri)', url: '/membres/statuts/page?page=2&pageSize=25&recherche=a&tri=cotisation' },
    { nom: 'Options de membres (sélecteurs)', url: '/membres/options' },
    { nom: 'Fiche membre', url: `/membres/${membreId}` },
    { nom: 'Statut d’un membre', url: `/membres/${membreId}/statut` },
    { nom: 'Contributions d’un membre', url: `/contributions?membreId=${membreId}` },
    { nom: 'Trésorerie', url: '/tresorerie' },
    { nom: 'Réconciliation', url: '/tresorerie/reconciliation' },
    { nom: 'Rapport financier (10 ans)', url: `/rapports/financier?anneeDebut=${annee - 9}&anneeFin=${annee}` },
    { nom: 'Export Excel des contributions', url: '/exports/contributions?format=xlsx' },
    { nom: 'Export PDF des contributions (année)', url: `/exports/contributions?format=pdf&annee=${annee}` },
    { nom: 'Export PDF du recouvrement', url: '/rapports/recouvrement/export?format=pdf' },
    { nom: 'Planche de cartes de membre (PDF)', url: '/membres/cartes' },
    { nom: 'Mon espace — situation', url: '/moi/situation', simple: true },
    { nom: 'Mon espace — contributions', url: '/moi/contributions', simple: true },
  ]
}
