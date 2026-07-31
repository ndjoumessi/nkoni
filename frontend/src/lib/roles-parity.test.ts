import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GARDE DE PARITÉ INTER-COUCHES (front ↔ back) — le PREMIER du dépôt.
 *
 * `frontend/src/lib/roles.ts` porte des constantes qui MIROITENT des gardes serveur `requireRoles`
 * de `backend/src/routes/organisations.route.ts`. Elles valent toutes ['ADMIN','PRESIDENT']
 * aujourd'hui, mais ce sont des gardes INDÉPENDANTES : le front ne peut pas importer le back, donc
 * rien n'empêche mécaniquement un miroir front de dériver de sa contrepartie serveur (c'est le
 * couplage relevé en revue de la PR #89). Ce test lit les DEUX sources EN TEXTE (jamais d'import,
 * même parti pris que `backend/tests/roles-lists-parity.test.ts`) et échoue si un miroir diverge.
 *
 * FRAGILITÉ ASSUMÉE (identique au garde backend) : extraction par regex, volontairement étroite. Si
 * une route change de forme d'appel (garde composée, helper indirect) ou déménage de fichier, le
 * test la manque ou casse — préférable à un faux positif silencieux sur une garde de permission. Le
 * MAPPING route → constante est déclaré ICI : c'est l'objet VÉRIFIÉ, pas une donnée dérivée (sinon
 * on testerait une tautologie). Ajouter un miroir de garde = l'inscrire dans MAPPING.
 *
 * Env `node` (défaut des *.test.ts) : lecture fichier, aucun rendu.
 */

const ICI = dirname(fileURLToPath(import.meta.url))
const ROLES_TS = resolve(ICI, 'roles.ts')
// frontend/src/lib → ../../../ = racine du dépôt, puis backend/… (couple le test à l'arborescence
// backend : c'est le prix d'un garde inter-couches, il n'y a pas de version sans ce couplage).
const ROUTE_TS = resolve(ICI, '../../../backend/src/routes/organisations.route.ts')

// Route serveur (méthode + chemin) ↔ constante front censée la miroiter.
const MAPPING = [
  { methode: 'get', chemin: '/organisations/moi/export', constante: 'EXPORT_DONNEES' },
  { methode: 'patch', chemin: '/organisations/moi/chef', constante: 'DESIGNATION_CHEF' },
  { methode: 'get', chemin: '/organisations/moi/paiement', constante: 'CONFIG_PAIEMENT' },
] as const

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Extrait les rôles ('ADMIN', 'PRESIDENT', …) d'un fragment `[ … ]`, triés (comparaison stable). */
const rolesDe = (fragment: string): string[] =>
  [...fragment.matchAll(/['"]([A-Z_]+)['"]/g)].map((m) => m[1]).sort()

/** Rôles du `requireRoles([...])` de la route `methode chemin` dans le source serveur. */
function rolesServeur(source: string, methode: string, chemin: string): string[] {
  // app.<methode>[<generics>](  '<chemin>'  … requireRoles([ … ]) — non-greedy jusqu'au 1er
  // requireRoles suivant le chemin (unique à ce bloc ; pour /paiement, GET précède PUT → 1re occ.).
  const re = new RegExp(
    `app\\.${methode}\\b[^(]*\\(\\s*['"]${echapper(chemin)}['"][\\s\\S]*?requireRoles\\(\\[([^\\]]*)\\]\\)`,
  )
  const m = source.match(re)
  if (!m) throw new Error(`Route serveur introuvable : ${methode.toUpperCase()} ${chemin}`)
  return rolesDe(m[1])
}

/** Rôles de la constante `const <nom> = [...]` dans le source front. */
function rolesFront(source: string, constante: string): string[] {
  const m = source.match(new RegExp(`const ${constante}\\s*=\\s*\\[([^\\]]*)\\]`))
  if (!m) throw new Error(`Constante front introuvable : ${constante}`)
  return rolesDe(m[1])
}

describe('parité inter-couches : roles.ts ↔ gardes requireRoles serveur', () => {
  const sourceRoute = readFileSync(ROUTE_TS, 'utf8')
  const sourceRoles = readFileSync(ROLES_TS, 'utf8')

  it('le MAPPING n’est pas vide (anti-vacant)', () => {
    expect(MAPPING.length).toBeGreaterThan(0)
  })

  it.each(MAPPING)('$constante miroite la garde de $methode $chemin', ({ methode, chemin, constante }) => {
    const serveur = rolesServeur(sourceRoute, methode, chemin)
    const front = rolesFront(sourceRoles, constante)
    expect(serveur.length).toBeGreaterThan(0) // extraction serveur non vacante
    expect(front).toEqual(serveur)
  })
})
