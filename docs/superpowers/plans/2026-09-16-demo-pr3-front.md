# Espace de démonstration — PR 3 « Front de démonstration » Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ouvrir l'espace de démonstration depuis le navigateur sans compte : route `/demo`, mode démo côté client (aucun refresh réel, renouvellement du jeton démo, écritures refusées localement), bandeau, « Quitter la démo » qui ne déconnecte jamais l'administrateur réel, points d'entrée et relance WhatsApp désactivée.

**Architecture:** Le client HTTP (`lib/api/core.ts`) porte un état module `modeDemo` posé par `AuthContext` : en mode démo, `request` refuse localement toute écriture hors liste (`lib/demo.ts`, miroir gardé du serveur) et `rafraichirAccessToken` redemande `POST /demo/session` au lieu de `/auth/refresh`. `AuthContext` expose `modeDemo`, `demarrerDemo`, `quitterDemo` ; `logout` et `changerLangue` basculent sur des variantes locales en démo, et la sortie réhydrate la session réelle depuis le cookie. Page publique `DemoPage`, bandeau `BandeauDemo` dans la coquille, liens d'entrée sur l'accueil, la connexion et le guide de démarrage.

**Tech Stack:** Vite + React 19 + React Router, react-i18next, Vitest (`node` pour le client HTTP, `jsdom` par docblock pour les composants), oxlint.

**Spec:** `docs/superpowers/specs/2026-09-15-onboarding-demo-design.md` (§0 « Ce que la démo ne fait jamais », §2 en entier, §4.1 « PR 3 », §4.2, §4.3). Socle livré : PR 1 (#149) `POST /demo/session` (200 `{ accessToken, user }` sans cookie, 404 `commun.demoIndisponible`), garde lecture seule serveur (`backend/src/lib/demo.ts`, message `commun.demoLectureSeule`), login/refresh refusés pour la démo ; PR 2 (#150) générateur, régénération, `npm run demo:generer`. Doc : `docs/architecture-demo.md` §1-5.

## Global Constraints

- Français partout : noms métier, commentaires, messages, commits.
- Branche `feat/demo-front` (créée avec le commit de ce plan), jamais de commit sur `main`, merge `--no-ff` par PR (le PO fusionne).
- **Jamais de migration ni de test sur la base de dev `nkoni`** : la vérification visuelle (Task 6) tourne sur la base jetable `nkoni_it_demo` uniquement.
- **Invariant non négociable (revue PR 1/PR 2)** : quitter la démo — par le bandeau, par « Se déconnecter » de la coquille, ou par l'échec du renouvellement — **n'appelle jamais `POST /auth/logout`** (qui révoquerait la famille de refresh de l'administrateur réel connecté dans le même navigateur) et **ne purge jamais la file hors-ligne** de ce navigateur. Test dédié obligatoire (Task 2), intitulé contenant « n'appelle jamais /auth/logout ».
- Filet serveur « logout ne révoque pas si le Bearer porte `demo: true` » : **écarté**. `POST /auth/logout` ne lit que le cookie refresh (aucun Bearer envoyé par `authApi.logout`), qui est justement celui de l'administrateur réel : le serveur ne peut pas distinguer l'appel. Les deux filets retenus sont côté client et testés : `AuthContext.logout` bascule sur `quitterDemo` (Task 2), et `request` refuse localement `POST /auth/logout` en mode démo (Task 1).
- Le serveur reste l'autorité : le refus local ne remplace pas la garde de `authenticate`, il évite l'aller-retour et affiche le même message.
- Libellés : FR source de vérité (`locales/fr/demo.ts`), EN miroir typé (`locales/en/demo.ts`) ; le message de refus local reprend la formulation serveur.
- Pas de valeurs oklch en dur : jetons (`brass`, `hairline`, `terra`…). Popovers en portail (aucun ajouté ici). `Button` rend `type="button"` par défaut.
- Vérification avant présentation : frontend `npm run build` + `npm run lint` (0 finding) + `npm run test` ; aucun fichier backend modifié hors docs.
- Messages de commit terminés par `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Disque hôte presque plein (~1,4 Gio libres) : sur `ENOSPC`, réessayer une fois puis signaler, ne rien supprimer hors du dépôt.

## File Structure

| Fichier | Rôle |
|---|---|
| `frontend/src/lib/demo.ts` (nouveau) | règle pure « écriture autorisée en démo », miroir de `backend/src/lib/demo.ts` |
| `frontend/src/lib/demo-parity.test.ts` (nouveau) | garde inter-couches : liste d'exceptions front = serveur |
| `frontend/src/lib/api/core.ts` | état `modeDemo`, refus local, renouvellement démo, `ouvrirSessionDemo`, génération de session |
| `frontend/src/lib/api/membres.ts`, `documents.ts`, `moi.ts` | refus local sur les téléversements multipart (fetch bruts) |
| `frontend/src/lib/api-demo.test.ts` (nouveau) | tests `node` du client en mode démo |
| `frontend/src/lib/offline-sync.ts` (+ test) | pas de mise en file ni de rejeu en démo |
| `frontend/src/lib/offline-queue.ts` | `purgerCachesApi` extrait (caches GET seuls) |
| `frontend/src/contexts/auth-context.ts`, `AuthContext.tsx` | `modeDemo`, `demarrerDemo`, `quitterDemo`, variantes démo de `logout`/`changerLangue`, pas de minuteur |
| `frontend/src/contexts/AuthContext.test.tsx` (nouveau) | tests `jsdom` du contexte |
| `frontend/src/hooks/useSyncHorsLigne.ts` | aucun rejeu en démo |
| `frontend/src/locales/{fr,en}/demo.ts` (nouveaux) + `index.ts` | namespace `demo` |
| `frontend/src/pages/DemoPage.tsx` (+ test) + `App.tsx` | route publique `/demo` |
| `frontend/src/components/BandeauDemo.tsx` (+ test) + `AppShell.tsx` | bandeau au-dessus du bandeau de forfait |
| `frontend/src/components/ui/glassmorphism-trust-hero.tsx`, `components/landing/VideoDemo.tsx`, `pages/LoginPage.tsx`, `components/dashboard/GuideDemarrage.tsx` (+ test) | points d'entrée |
| `frontend/src/components/dashboard/AnalyseMembres.tsx` (+ test), `pages/MembreDetailPage.tsx` | relance WhatsApp désactivée en démo |
| `docs/architecture-demo.md`, `CLAUDE.md`, `docs/roadmap-v1-vers-GA.md` | documentation, mise en service étape 3 réécrite |

---

### Task 1: Client HTTP en mode démo

**Files:**
- Create: `frontend/src/lib/demo.ts`
- Create: `frontend/src/lib/demo-parity.test.ts`
- Create: `frontend/src/lib/api-demo.test.ts`
- Modify: `frontend/src/lib/api/core.ts`
- Modify: `frontend/src/lib/api/membres.ts` (`uploadPhoto`, `parserFichier`)
- Modify: `frontend/src/lib/api/documents.ts` (`upload`)
- Modify: `frontend/src/lib/api/moi.ts` (`televerserPhoto`, `televerserAvatar`)
- Modify: `frontend/src/lib/offline-sync.ts`, `frontend/src/lib/offline-sync.test.ts`

**Interfaces:**
- Consumes: `POST /demo/session` → `200 { accessToken: string, user: AuthUser }` (sans `membreId`), `404` quand la démo est éteinte ou absente.
- Produces (exportés par le barrel `@/lib/api`, puisque `api.ts` fait `export * from './api/core'`) :
  - `interface ModeDemo { messageRefus: () => string }`
  - `definirModeDemo(mode: ModeDemo | null): void` — pose/retire le mode et invalide tout refresh en vol
  - `estModeDemo(): boolean`
  - `refuserSiEcritureDemo(methode: string, chemin: string): void` — lève `ApiError(403, messageRefus())`
  - `interface SessionDemoResponse { accessToken: string; user: AuthUser }`
  - `ouvrirSessionDemo(): Promise<SessionDemoResponse>` — lève `ApiError(status)` si non-ok
- Produces (`@/lib/demo`) : `ECRITURES_AUTORISEES_EN_DEMO: readonly string[]`, `estRequeteAutoriseeEnDemo(methode: string, chemin: string): boolean`

- [ ] **Step 1: Écrire la règle pure et son garde de parité (test d'abord)**

`frontend/src/lib/demo-parity.test.ts` :

```ts
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ECRITURES_AUTORISEES_EN_DEMO, estRequeteAutoriseeEnDemo } from './demo'

/**
 * GARDE INTER-COUCHES (front ↔ back), même parti pris que `roles-parity.test.ts` : le front ne peut
 * pas importer le back, on lit la source serveur EN TEXTE. Si le serveur ajoute une exception de
 * lecture seule sans que le front la miroite, le client refuserait localement une requête que le
 * serveur accepte (et inversement, un front plus large enverrait des écritures refusées en 403).
 */
const ICI = dirname(fileURLToPath(import.meta.url))
const DEMO_SERVEUR = resolve(ICI, '../../../backend/src/lib/demo.ts')

function exceptionsServeur(): string[] {
  const source = readFileSync(DEMO_SERVEUR, 'utf8')
  const m = source.match(/ECRITURES_AUTORISEES_EN_DEMO[^=]*=\s*\[([^\]]*)\]/)
  if (!m) throw new Error('ECRITURES_AUTORISEES_EN_DEMO introuvable dans backend/src/lib/demo.ts')
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]).sort()
}

describe('démo — parité des exceptions de lecture seule', () => {
  it('la liste front est exactement celle du serveur', () => {
    const serveur = exceptionsServeur()
    expect(serveur.length).toBeGreaterThan(0) // jamais vacant
    expect([...ECRITURES_AUTORISEES_EN_DEMO].sort()).toEqual(serveur)
  })
})

describe('estRequeteAutoriseeEnDemo', () => {
  it('lectures toujours autorisées', () => {
    expect(estRequeteAutoriseeEnDemo('GET', '/membres')).toBe(true)
    expect(estRequeteAutoriseeEnDemo('head', '/membres')).toBe(true)
  })
  it('exception exacte, requête ignorée ; jamais un préfixe', () => {
    expect(estRequeteAutoriseeEnDemo('POST', '/equilibrages/simuler')).toBe(true)
    expect(estRequeteAutoriseeEnDemo('post', '/equilibrages/simuler?x=1')).toBe(true)
    expect(estRequeteAutoriseeEnDemo('POST', '/equilibrages')).toBe(false)
  })
  it('toute autre écriture refusée', () => {
    expect(estRequeteAutoriseeEnDemo('POST', '/auth/logout')).toBe(false)
    expect(estRequeteAutoriseeEnDemo('PATCH', '/auth/me/langue')).toBe(false)
    expect(estRequeteAutoriseeEnDemo('DELETE', '/membres/m1/photo')).toBe(false)
  })
})
```

- [ ] **Step 2: Lancer, constater l'échec**

Run: `cd frontend && npx vitest run src/lib/demo-parity.test.ts`
Expected: FAIL — `Failed to resolve import "./demo"`.

- [ ] **Step 3: Écrire `frontend/src/lib/demo.ts`**

```ts
/**
 * Espace de démonstration (spec 2026-09-15 §2.4) — MIROIR de `backend/src/lib/demo.ts`.
 *
 * Le serveur reste l'autorité (garde dans `authenticate`) ; ce miroir permet au client HTTP de
 * refuser LOCALEMENT une écriture en mode démo, sans aller-retour. Parité figée par
 * `demo-parity.test.ts`. Le front compare un CHEMIN réel (requête retirée), le serveur un motif de
 * route : les exceptions actuelles n'ont aucun paramètre, un motif paramétré exigerait d'adapter ici.
 */

const METHODES_LECTURE = new Set(['GET', 'HEAD'])

export const ECRITURES_AUTORISEES_EN_DEMO: readonly string[] = ['POST /equilibrages/simuler']

export function estRequeteAutoriseeEnDemo(methode: string, chemin: string): boolean {
  const m = methode.toUpperCase()
  if (METHODES_LECTURE.has(m)) return true
  const sansRequete = chemin.split('?')[0]
  return ECRITURES_AUTORISEES_EN_DEMO.includes(`${m} ${sansRequete}`)
}
```

- [ ] **Step 4: Relancer, constater le vert, puis saboter le garde**

Run: `cd frontend && npx vitest run src/lib/demo-parity.test.ts` → PASS.
Sabotage dans la direction utile : ajouter `'POST /equilibrages/test'` au tableau de `backend/src/lib/demo.ts` (côté SERVEUR), vérifier par `grep -n "equilibrages/test" backend/src/lib/demo.ts` que la modification est en place, relancer → FAIL sur la parité. Annuler (`git checkout backend/src/lib/demo.ts`), relancer → PASS.

- [ ] **Step 5: Écrire les tests du client en mode démo**

`frontend/src/lib/api-demo.test.ts` :

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  ApiError,
  authApi,
  configurerAuthBridge,
  definirModeDemo,
  documentsApi,
  equilibragesApi,
  estModeDemo,
  membresApi,
  moiApi,
  ouvrirSessionDemo,
  rafraichirAccessToken,
  reunionsApi,
  versementsApi,
} from './api'

/**
 * Client HTTP en MODE DÉMO (spec 2026-09-15 §2.2 et §2.4) — `fetch` mocké, env `node`.
 * Invariants : aucune écriture ne part (sauf la simulation d'équilibrage), aucun /auth/refresh
 * (il restaurerait la session RÉELLE depuis le cookie), jamais de /auth/logout.
 */

type FetchInit = { method?: string; headers?: Record<string, string>; credentials?: string }
type FetchCall = { url: string; method: string; auth?: string; credentials?: string }
const calls: FetchCall[] = []

function monterFetch(handler: (call: FetchCall) => Response | Promise<Response>): void {
  calls.length = 0
  globalThis.fetch = vi.fn(async (input: unknown, init?: unknown) => {
    const i = (init ?? {}) as FetchInit
    const call: FetchCall = {
      url: String(input),
      method: i.method ?? 'GET',
      auth: i.headers?.Authorization,
      credentials: i.credentials,
    }
    calls.push(call)
    return handler(call)
  }) as unknown as typeof fetch
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
const trace = () => calls.map((c) => `${c.method} ${new URL(c.url).pathname}`)
const MESSAGE = 'Démo en lecture seule'
const activerDemo = () => definirModeDemo({ messageRefus: () => MESSAGE })

beforeEach(() => {
  configurerAuthBridge({})
  definirModeDemo(null)
})
afterEach(() => {
  definirModeDemo(null)
  vi.restoreAllMocks()
})

describe('mode démo — refus local des écritures', () => {
  it('une écriture est refusée localement (403, message traduit) sans appel réseau', async () => {
    monterFetch(() => json(201, {}))
    activerDemo()
    expect(estModeDemo()).toBe(true)
    const promesse = versementsApi.create({} as never, 'jeton-demo')
    await expect(promesse).rejects.toBeInstanceOf(ApiError)
    await expect(promesse).rejects.toMatchObject({ status: 403, message: MESSAGE })
    expect(calls).toHaveLength(0)
  })

  it('POST /equilibrages/simuler part (seule exception)', async () => {
    monterFetch(() => json(200, { membreId: 'm1' }))
    activerDemo()
    await equilibragesApi.simuler({ membreId: 'm1', anneeDebut: 2025, anneeFin: 2026 }, 'jeton-demo')
    expect(trace()).toEqual(['POST /equilibrages/simuler'])
  })

  it("authApi.logout est refusé localement : n'appelle jamais /auth/logout", async () => {
    monterFetch(() => new Response(null, { status: 204 }))
    activerDemo()
    await expect(authApi.logout()).rejects.toMatchObject({ status: 403 })
    expect(calls).toHaveLength(0)
  })

  it('les téléversements multipart (fetch bruts) sont refusés sans appel réseau', async () => {
    monterFetch(() => json(200, {}))
    activerDemo()
    const fichier = new File(['x'], 'a.png', { type: 'image/png' })
    const appels = [
      () => membresApi.uploadPhoto('m1', fichier, 'j'),
      () => membresApi.parserFichier(fichier, 'j'),
      () => documentsApi.upload({ entiteType: 'MEMBRE', entiteId: 'm1', nom: 'a', file: fichier } as never, 'j'),
      () => moiApi.televerserPhoto(fichier, 'j'),
      () => moiApi.televerserAvatar(fichier, 'j'),
    ]
    for (const appel of appels) {
      await expect(appel()).rejects.toMatchObject({ status: 403, message: MESSAGE })
    }
    expect(calls).toHaveLength(0)
  })

  it('hors mode démo : comportement inchangé, l’écriture part', async () => {
    monterFetch(() => json(201, { id: 'v1' }))
    await versementsApi.create({} as never, 'jeton-reel')
    expect(trace()).toEqual(['POST /versements'])
  })
})

describe('mode démo — expiration du jeton', () => {
  it('401 → nouvelle session démo (jamais /auth/refresh) puis rejeu avec le nouveau jeton', async () => {
    monterFetch((c) => {
      if (c.url.endsWith('/demo/session')) return json(200, { accessToken: 'demo-neuf', user: {} })
      if (c.auth === 'Bearer demo-neuf') return json(200, [{ id: 'r1' }])
      return json(401, { message: 'expiré' })
    })
    const onTokenRefreshed = vi.fn()
    const onSessionExpired = vi.fn()
    configurerAuthBridge({ onTokenRefreshed, onSessionExpired })
    activerDemo()

    expect(await reunionsApi.list('demo-expire')).toEqual([{ id: 'r1' }])
    expect(trace()).toEqual(['GET /reunions', 'POST /demo/session', 'GET /reunions'])
    expect(onTokenRefreshed).toHaveBeenCalledWith('demo-neuf')
    expect(onSessionExpired).not.toHaveBeenCalled()
  })

  it('renouvellement en échec (démo éteinte) → onSessionExpired, pas de boucle', async () => {
    monterFetch((c) =>
      c.url.endsWith('/demo/session') ? json(404, { message: 'indisponible' }) : json(401, { message: 'expiré' }),
    )
    const onSessionExpired = vi.fn()
    configurerAuthBridge({ onSessionExpired })
    activerDemo()

    await expect(reunionsApi.list('demo-expire')).rejects.toMatchObject({ status: 401 })
    expect(trace()).toEqual(['GET /reunions', 'POST /demo/session'])
    expect(onSessionExpired).toHaveBeenCalledTimes(1)
  })

  it('rafraichirAccessToken en mode démo ne touche jamais /auth/refresh', async () => {
    monterFetch((c) =>
      c.url.endsWith('/demo/session') ? json(200, { accessToken: 'demo-2', user: {} }) : json(200, { accessToken: 'reel' }),
    )
    activerDemo()
    expect(await rafraichirAccessToken()).toBe('demo-2')
    expect(trace()).toEqual(['POST /demo/session'])
  })

  it('un refresh RÉEL en vol au démarrage de la démo ne propage pas son jeton', async () => {
    let repondre: (r: Response) => void = () => undefined
    monterFetch((c) =>
      c.url.endsWith('/auth/refresh')
        ? new Promise<Response>((r) => {
            repondre = r
          })
        : json(200, {}),
    )
    const onTokenRefreshed = vi.fn()
    configurerAuthBridge({ onTokenRefreshed })

    const enVol = rafraichirAccessToken() // session réelle
    activerDemo() // la démo démarre pendant ce temps
    repondre(json(200, { accessToken: 'jeton-reel' }))

    expect(await enVol).toBeNull()
    expect(onTokenRefreshed).not.toHaveBeenCalled()
  })
})

describe('ouvrirSessionDemo', () => {
  it('POST /demo/session sans cookie (credentials omit) → jeton et utilisateur', async () => {
    monterFetch(() => json(200, { accessToken: 'demo-1', user: { id: 'u1', role: 'ADMIN' } }))
    const session = await ouvrirSessionDemo()
    expect(session.accessToken).toBe('demo-1')
    expect(trace()).toEqual(['POST /demo/session'])
    expect(calls[0].credentials).toBe('omit')
  })

  it('404 → ApiError 404 (démo indisponible)', async () => {
    monterFetch(() => json(404, { message: 'indisponible' }))
    await expect(ouvrirSessionDemo()).rejects.toMatchObject({ status: 404 })
  })
})
```

- [ ] **Step 6: Lancer, constater l'échec**

Run: `cd frontend && npx vitest run src/lib/api-demo.test.ts`
Expected: FAIL — `definirModeDemo is not a function` (ou export manquant).

- [ ] **Step 7: Implémenter dans `frontend/src/lib/api/core.ts`**

Ajouter en tête de fichier, après le docblock :

```ts
import { estRequeteAutoriseeEnDemo } from '../demo'
```

Ajouter après `RefreshResponse` :

```ts
/** Réponse de POST /demo/session : jeton porteur du claim `demo`, AUCUN cookie de refresh. */
export interface SessionDemoResponse {
  accessToken: string
  user: AuthUser
}
```

Insérer, juste AVANT le bloc « Rafraîchissement silencieux du token (refresh-on-401) » (donc après `messageErreur`) :

```ts
/* -------------------------------------------------------------------------- */
/* Mode démonstration (spec 2026-09-15 §2.2 / §2.4)                            */
/* -------------------------------------------------------------------------- */

/** Posé par `AuthContext` : le message de refus est lu à chaque refus (langue courante). */
export interface ModeDemo {
  messageRefus: () => string
}

let modeDemo: ModeDemo | null = null
/**
 * Génération de session : incrémentée à chaque entrée/sortie de démo. Un refresh lancé sous une
 * génération précédente (ex. la session RÉELLE, au moment où la démo démarre) ne propage jamais son
 * jeton : il écraserait le jeton démo en mémoire, et le visiteur écrirait avec la vraie session.
 */
let generationSession = 0

export function definirModeDemo(mode: ModeDemo | null): void {
  modeDemo = mode
  generationSession++
  refreshEnCours = null
}

export function estModeDemo(): boolean {
  return modeDemo !== null
}

/**
 * Refus LOCAL d'une écriture en mode démo (le serveur refuse de toute façon, §1.4) : aucun
 * aller-retour, même message que le serveur. Couvre aussi `POST /auth/logout`, qui révoquerait la
 * famille de refresh d'un administrateur réel connecté dans ce navigateur.
 */
export function refuserSiEcritureDemo(methode: string, chemin: string): void {
  if (modeDemo && !estRequeteAutoriseeEnDemo(methode, chemin)) {
    throw new ApiError(403, modeDemo.messageRefus())
  }
}

/**
 * Ouvre une session démo. `credentials: 'omit'` : ni le cookie refresh d'un administrateur réel
 * n'est envoyé, ni aucun cookie ne peut être posé en retour. Appel brut (hors `request`) : il doit
 * rester possible EN mode démo, où `request` refuserait ce POST.
 */
async function fetchSessionDemo(): Promise<SessionDemoResponse> {
  const res = await fetch(`${API_URL}/demo/session`, { method: 'POST', credentials: 'omit' })
  if (!res.ok) throw new ApiError(res.status, `Erreur ${res.status}`)
  return (await res.json()) as SessionDemoResponse
}

export function ouvrirSessionDemo(): Promise<SessionDemoResponse> {
  return fetchSessionDemo()
}
```

`refreshEnCours` est déclaré plus bas avec `let` : le déplacer AU-DESSUS de ce bloc (juste après l'interface `ModeDemo`, avec son commentaire de déduplication) pour que la lecture suive l'ordre d'usage ; retirer la déclaration d'origine. Remplacer ensuite `rafraichirAccessToken` par :

```ts
export function rafraichirAccessToken(): Promise<string | null> {
  if (!refreshEnCours) {
    const generation = generationSession
    // En démo, « rafraîchir » = redemander un jeton démo : /auth/refresh restaurerait la session
    // RÉELLE depuis le cookie (§2.2).
    const obtenir = modeDemo ? fetchSessionDemo().then((s) => s.accessToken) : fetchRefresh()
    refreshEnCours = obtenir
      .then((token) => {
        if (generation !== generationSession) return null
        authBridge.onTokenRefreshed?.(token)
        return token
      })
      .catch(() => null)
      .finally(() => {
        if (generation === generationSession) refreshEnCours = null
      })
  }
  return refreshEnCours
}
```

Mettre à jour le docblock de `rafraichirAccessToken` : ajouter une phrase « En mode démo, renouvelle le jeton démo (POST /demo/session) ; un résultat obtenu sous une génération de session précédente est ignoré (null). »

Dans `request`, juste après la déstructuration des options (avant la construction des en-têtes) :

```ts
  refuserSiEcritureDemo(method, path)
```

- [ ] **Step 8: Refus local sur les fetch bruts d'écriture**

Ajouter l'import `refuserSiEcritureDemo` depuis `'./core'` dans les trois modules (à côté de `API_URL`, `leverSiErreur`, `rid` déjà importés), puis en PREMIÈRE ligne du corps de chaque fonction :

- `membres.ts` `uploadPhoto` : `refuserSiEcritureDemo('POST', \`/membres/${rid(id)}/photo\`)`
- `membres.ts` `parserFichier` : `refuserSiEcritureDemo('POST', '/membres/import/fichier')`
- `documents.ts` `upload` : `refuserSiEcritureDemo('POST', '/documents')`
- `moi.ts` `televerserPhoto` : `refuserSiEcritureDemo('POST', '/moi/photo')`
- `moi.ts` `televerserAvatar` : `refuserSiEcritureDemo('POST', '/moi/avatar')`

Vérifier qu'il ne reste aucun fetch brut d'écriture non couvert :

Run: `cd frontend && grep -rn "method: 'POST'\|method: 'PUT'\|method: 'PATCH'\|method: 'DELETE'" src/lib/api --include='*.ts' -B4 | grep "fetch("`
Expected: exactement les 5 fonctions ci-dessus (toutes les autres écritures passent par `request`).

- [ ] **Step 9: Relancer, constater le vert, puis saboter**

Run: `cd frontend && npx vitest run src/lib/api-demo.test.ts src/lib/api.test.ts` → PASS (les tests existants du refresh-on-401 restent verts).
Sabotages (chacun vérifié par `grep` avant de relancer, puis annulé) :
1. Retirer la ligne `refuserSiEcritureDemo(method, path)` de `request` → les tests « écriture refusée » et « logout » passent au rouge.
2. Remplacer `modeDemo ? fetchSessionDemo()…` par `fetchRefresh()` → les tests d'expiration passent au rouge.
3. Retirer `if (generation !== generationSession) return null` → « refresh RÉEL en vol » passe au rouge.

- [ ] **Step 10: File hors-ligne désactivée en démo (test d'abord)**

Ajouter en tête de `frontend/src/lib/offline-sync.test.ts` (sous les imports existants, en complétant `vitest` avec `vi`, `beforeEach`, `afterEach`) :

```ts
import { definirModeDemo } from './api'
import { soumettreOuEnfiler, synchroniser } from './offline-sync'
import { enfiler, listerFile } from './offline-queue'

vi.mock('./offline-queue', () => ({
  enfiler: vi.fn(async () => undefined),
  listerFile: vi.fn(async () => []),
  retirerDeLaFile: vi.fn(async () => undefined),
  marquerErreur: vi.fn(async () => undefined),
}))
```

et à la fin du fichier :

```ts
/** Démo (spec 2026-09-15 §2.2) : aucune écriture à mettre en file, et surtout aucun rejeu de la file
 *  RÉELLE de ce navigateur avec un jeton démo (chaque mutation serait marquée en erreur). */
describe('file hors-ligne en mode démo', () => {
  beforeEach(() => {
    vi.mocked(enfiler).mockClear()
    vi.mocked(listerFile).mockClear()
    definirModeDemo({ messageRefus: () => 'lecture seule' })
  })
  afterEach(() => {
    definirModeDemo(null)
    vi.unstubAllGlobals()
  })

  it('hors ligne : rien n’est enfilé, l’appel est tenté (et refusé localement)', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const appel = vi.fn(async () => {
      throw new ApiError(403, 'lecture seule')
    })
    await expect(soumettreOuEnfiler('versement', {}, appel)).rejects.toMatchObject({ status: 403 })
    expect(appel).toHaveBeenCalledTimes(1)
    expect(enfiler).not.toHaveBeenCalled()
  })

  it('synchroniser ne lit même pas la file', async () => {
    expect(await synchroniser('jeton-demo')).toEqual({ reussis: 0, echecs: 0 })
    expect(listerFile).not.toHaveBeenCalled()
  })
})
```

Run: `cd frontend && npx vitest run src/lib/offline-sync.test.ts` → FAIL (enfiler appelé, listerFile appelé).

- [ ] **Step 11: Implémenter dans `frontend/src/lib/offline-sync.ts`**

Compléter l'import depuis `'./api'` avec `estModeDemo`. Dans `soumettreOuEnfiler`, en première ligne :

```ts
  // Démo : rien à mettre en file (lecture seule) — l'appel part au client, qui le refuse localement.
  if (estModeDemo()) return { enFile: false, resultat: await appel() }
```

Dans `synchroniser`, en première ligne :

```ts
  // Démo : ne jamais rejouer la file RÉELLE de ce navigateur avec un jeton démo.
  if (estModeDemo()) return { reussis: 0, echecs: 0 }
```

Run: `cd frontend && npx vitest run src/lib/offline-sync.test.ts` → PASS.

- [ ] **Step 12: Build, lint, tests, commit**

Run: `cd frontend && npm run build && npm run lint && npm run test`
Expected: build OK, `Found 0 warnings and 0 errors`, tous les tests verts.

```bash
git add frontend/src/lib/demo.ts frontend/src/lib/demo-parity.test.ts frontend/src/lib/api-demo.test.ts frontend/src/lib/api/core.ts frontend/src/lib/api/membres.ts frontend/src/lib/api/documents.ts frontend/src/lib/api/moi.ts frontend/src/lib/offline-sync.ts frontend/src/lib/offline-sync.test.ts
git commit -m "feat(demo): client HTTP en mode démo (refus local, jeton démo renouvelé, file hors-ligne coupée)

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Contexte d'authentification — entrer et quitter la démo

**Files:**
- Modify: `frontend/src/contexts/auth-context.ts`
- Modify: `frontend/src/contexts/AuthContext.tsx`
- Modify: `frontend/src/lib/offline-queue.ts` (extraire `purgerCachesApi`)
- Modify: `frontend/src/hooks/useSyncHorsLigne.ts`
- Create: `frontend/src/locales/fr/demo.ts`, `frontend/src/locales/en/demo.ts`
- Modify: `frontend/src/locales/fr/index.ts`, `frontend/src/locales/en/index.ts`
- Test: `frontend/src/contexts/AuthContext.test.tsx`

**Interfaces:**
- Consumes (Task 1) : `definirModeDemo(mode: ModeDemo | null)`, `ouvrirSessionDemo(): Promise<SessionDemoResponse>`, `rafraichirAccessToken()`, `configurerAuthBridge`.
- Produces (sur `AuthContextValue`) :
  - `modeDemo: boolean`
  - `demarrerDemo: () => Promise<AuthUser>` — lève l'`ApiError` de `ouvrirSessionDemo` (404 = indisponible)
  - `quitterDemo: () => Promise<AuthUser | null>` — renvoie l'utilisateur RÉEL restauré, ou `null`
- Produces (`@/lib/offline-queue`) : `purgerCachesApi(): Promise<void>`
- Produces (i18n, namespace `demo`) : clés listées au Step 1, consommées par les Tasks 3 et 4.

- [ ] **Step 1: Catalogue `demo` FR/EN**

`frontend/src/locales/fr/demo.ts` :

```ts
/** Espace de démonstration (spec 2026-09-15 §2) — FR source de vérité. */
export default {
  demo: {
    // Même formulation que le serveur (`commun.demoLectureSeule`) : refus local et refus serveur
    // doivent dire la même chose.
    lectureSeule: 'Espace de démonstration en lecture seule : créez votre espace pour enregistrer vos données.',
    entree: {
      voirExemple: "Voir un espace d'exemple",
      voirEspaceRempli: 'Voir à quoi ressemble un espace rempli',
    },
    page: {
      ouverture: "Ouverture de l'espace d'exemple…",
      indisponibleTitre: "Espace d'exemple indisponible",
      indisponible: "L'espace de démonstration est momentanément indisponible. Réessayez plus tard.",
      erreurTitre: "Impossible d'ouvrir l'espace d'exemple",
      erreur: 'Vérifiez votre connexion, puis réessayez.',
    },
    bandeau: {
      titre: 'Espace de démonstration',
      texte: 'données fictives, lecture seule.',
      quitter: 'Quitter la démo',
      retourEnCours: 'Sortie…',
    },
    whatsappDesactive: 'Relance WhatsApp désactivée dans la démo',
  },
}
```

`frontend/src/locales/en/demo.ts` :

```ts
/** EN mirror of the demo space namespace (spec 2026-09-15 §2). */
export default {
  demo: {
    lectureSeule: 'Read-only demo space: create your own space to save your data.',
    entree: {
      voirExemple: 'See a sample space',
      voirEspaceRempli: 'See what a filled-in space looks like',
    },
    page: {
      ouverture: 'Opening the sample space…',
      indisponibleTitre: 'Sample space unavailable',
      indisponible: 'The demo space is temporarily unavailable. Please try again later.',
      erreurTitre: 'Could not open the sample space',
      erreur: 'Check your connection, then try again.',
    },
    bandeau: {
      titre: 'Demo space',
      texte: 'fictitious data, read-only.',
      quitter: 'Leave the demo',
      retourEnCours: 'Leaving…',
    },
    whatsappDesactive: 'WhatsApp reminder disabled in the demo',
  },
}
```

Dans `frontend/src/locales/fr/index.ts` : `import demo from './demo'` (après `import statut from './statut'`) et `...demo,` à la fin de l'objet `fr` (après `...statut,`). Même chose dans `frontend/src/locales/en/index.ts` (objet `en`, typé `Catalogue` → parité vérifiée au build).

- [ ] **Step 2: Extraire `purgerCachesApi` dans `frontend/src/lib/offline-queue.ts`**

Remplacer `purgerDonneesLocales` par :

```ts
/**
 * Supprime les caches Workbox de l'app (réponses GET authentifiées `/api/*`), SANS toucher la file
 * hors-ligne. Utilisée à l'entrée et à la sortie de la démo : la clé de cache est l'URL (pas le
 * jeton), une réponse fictive servirait sinon de repli hors ligne à l'administrateur réel.
 */
export async function purgerCachesApi(): Promise<void> {
  try {
    if ('caches' in globalThis) {
      const noms = await caches.keys()
      await Promise.all(noms.filter((n) => n.includes('nkoni')).map((n) => caches.delete(n)))
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Purge les données locales à la DÉCONNEXION (poste partagé) : vide la file offline (IndexedDB)
 * et supprime les caches Workbox de l'app. Best-effort : n'échoue jamais la déconnexion.
 */
export async function purgerDonneesLocales(): Promise<void> {
  try {
    await avecStore('readwrite', (s) => s.clear())
  } catch {
    /* best-effort */
  }
  await purgerCachesApi()
}
```

- [ ] **Step 3: Étendre le type du contexte (`frontend/src/contexts/auth-context.ts`)**

Ajouter dans `AuthContextValue`, après `changerLangue` :

```ts
  /** Session de l'espace de démonstration en cours (spec 2026-09-15 §2.2), non persistée. */
  modeDemo: boolean
  /** Ouvre la démo (POST /demo/session) ; lève l'ApiError reçue (404 = démo indisponible). */
  demarrerDemo: () => Promise<AuthUser>
  /**
   * Quitte la démo SANS jamais appeler /auth/logout, puis réhydrate la session réelle depuis le
   * cookie : renvoie l'utilisateur réel retrouvé, ou null (visiteur sans compte).
   */
  quitterDemo: () => Promise<AuthUser | null>
```

- [ ] **Step 4: Écrire les tests du contexte**

`frontend/src/contexts/AuthContext.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { AuthProvider } from './AuthContext'
import { useAuth } from './auth-context'

/**
 * AuthContext en mode démo (spec 2026-09-15 §2.2). Invariant NON NÉGOCIABLE : quitter la démo, par
 * quelque chemin que ce soit, n'appelle jamais /auth/logout et ne purge jamais la file hors-ligne —
 * l'administrateur réel qui a ouvert la démo dans ce navigateur doit retrouver sa session intacte.
 */

const api = vi.hoisted(() => ({
  refresh: vi.fn(),
  me: vi.fn(),
  logout: vi.fn(),
  setLangue: vi.fn(),
  login: vi.fn(),
  inscription: vi.fn(),
  ouvrirSessionDemo: vi.fn(),
  definirModeDemo: vi.fn(),
  rafraichirAccessToken: vi.fn(),
  bridge: {} as { onTokenRefreshed?: (t: string) => void; onSessionExpired?: () => void },
}))
vi.mock('@/lib/api', () => ({
  authApi: {
    refresh: api.refresh,
    me: api.me,
    logout: api.logout,
    setLangue: api.setLangue,
    login: api.login,
    inscription: api.inscription,
  },
  ouvrirSessionDemo: api.ouvrirSessionDemo,
  definirModeDemo: api.definirModeDemo,
  rafraichirAccessToken: api.rafraichirAccessToken,
  configurerAuthBridge: (b: typeof api.bridge) => Object.assign(api.bridge, b),
}))
const appliquerLangue = vi.fn()
vi.mock('@/lib/i18n', () => ({ default: { t: (cle: string) => cle }, appliquerLangue: (l: string) => appliquerLangue(l) }))
vi.mock('@/lib/format', () => ({ appliquerDevise: vi.fn() }))
const purgerDonneesLocales = vi.fn(async () => undefined)
const purgerCachesApi = vi.fn(async () => undefined)
vi.mock('@/lib/offline-queue', () => ({
  purgerDonneesLocales: () => purgerDonneesLocales(),
  purgerCachesApi: () => purgerCachesApi(),
}))

const ADMIN_REEL = { id: 'u-reel', email: 'admin@asso.cm', role: 'ADMIN', langue: 'FR' as const }
const ADMIN_DEMO = { id: 'u-demo', email: 'admin@demo.nkoni.invalid', role: 'ADMIN', membreId: 'm-president' }

let ctx: ReturnType<typeof useAuth>
function Sonde() {
  ctx = useAuth()
  return (
    <p data-testid="etat">
      {`${ctx.loading ? 'chargement' : 'pret'}|${ctx.modeDemo ? 'demo' : 'reel'}|${ctx.user?.id ?? 'aucun'}|${ctx.accessToken ?? 'sans-jeton'}`}
    </p>
  )
}
const etat = () => screen.getByTestId('etat').textContent

async function monter() {
  render(
    <AuthProvider>
      <Sonde />
    </AuthProvider>,
  )
  await waitFor(() => expect(etat()).toMatch(/^pret\|/))
}

/** Session réelle présente dans le cookie (administrateur connecté dans ce navigateur). */
function sessionReelle() {
  api.refresh.mockResolvedValue({ accessToken: 'jeton-reel' })
  api.me.mockImplementation(async (jeton: string) => (jeton === 'jeton-demo' ? ADMIN_DEMO : ADMIN_REEL))
}
function sansSessionReelle() {
  api.refresh.mockRejectedValue(Object.assign(new Error('401'), { status: 401 }))
  api.me.mockImplementation(async () => ADMIN_DEMO)
}

beforeEach(() => {
  for (const f of [api.refresh, api.me, api.logout, api.setLangue, api.ouvrirSessionDemo, api.definirModeDemo, api.rafraichirAccessToken]) f.mockReset()
  api.bridge.onTokenRefreshed = undefined
  api.bridge.onSessionExpired = undefined
  appliquerLangue.mockReset()
  purgerDonneesLocales.mockClear()
  purgerCachesApi.mockClear()
  api.ouvrirSessionDemo.mockResolvedValue({ accessToken: 'jeton-demo', user: { id: 'u-demo', role: 'ADMIN' } })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AuthContext — entrer dans la démo', () => {
  it('pose le mode démo AVANT de lire le profil, puis bascule jeton et utilisateur', async () => {
    sessionReelle()
    await monter()
    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')

    await act(async () => {
      await ctx.demarrerDemo()
    })

    expect(etat()).toBe('pret|demo|u-demo|jeton-demo')
    expect(api.definirModeDemo).toHaveBeenCalledWith(expect.objectContaining({ messageRefus: expect.any(Function) }))
    const ordreMode = api.definirModeDemo.mock.invocationCallOrder[0]
    const ordreMe = api.me.mock.invocationCallOrder.at(-1) ?? 0
    expect(ordreMode).toBeLessThan(ordreMe)
    expect(purgerCachesApi).toHaveBeenCalled()
  })

  it('démo indisponible (404) : état réel intact, mode démo retiré, erreur remontée', async () => {
    sessionReelle()
    await monter()
    api.ouvrirSessionDemo.mockRejectedValue(Object.assign(new Error('404'), { status: 404 }))

    await act(async () => {
      await expect(ctx.demarrerDemo()).rejects.toMatchObject({ status: 404 })
    })

    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')
    expect(api.definirModeDemo).not.toHaveBeenCalledWith(expect.objectContaining({ messageRefus: expect.any(Function) }))
  })
})

describe("AuthContext — quitter la démo n'appelle jamais /auth/logout", () => {
  it("Quitter la démo n'appelle jamais /auth/logout : l'administrateur réel retrouve sa session", async () => {
    sessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })

    let reel: unknown
    await act(async () => {
      reel = await ctx.quitterDemo()
    })

    expect(api.logout).not.toHaveBeenCalled()
    expect(purgerDonneesLocales).not.toHaveBeenCalled()
    expect(api.definirModeDemo).toHaveBeenLastCalledWith(null)
    expect(reel).toEqual(ADMIN_REEL)
    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')
  })

  it("« Se déconnecter » en démo n'appelle jamais /auth/logout : il quitte la démo", async () => {
    sessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })

    await act(async () => {
      await ctx.logout()
    })

    expect(api.logout).not.toHaveBeenCalled()
    expect(purgerDonneesLocales).not.toHaveBeenCalled()
    expect(etat()).toBe('pret|reel|u-reel|jeton-reel')
  })

  it("échec du renouvellement démo : sortie de la démo, jamais /auth/logout", async () => {
    sessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })

    await act(async () => {
      api.bridge.onSessionExpired?.()
    })

    await waitFor(() => expect(etat()).toBe('pret|reel|u-reel|jeton-reel'))
    expect(api.logout).not.toHaveBeenCalled()
    expect(purgerDonneesLocales).not.toHaveBeenCalled()
  })

  it('visiteur sans compte : quitter renvoie null et laisse la session vide', async () => {
    sansSessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })

    let reel: unknown = 'non-appele'
    await act(async () => {
      reel = await ctx.quitterDemo()
    })

    expect(reel).toBeNull()
    expect(etat()).toBe('pret|reel|aucun|sans-jeton')
    expect(api.logout).not.toHaveBeenCalled()
  })

  it('hors démo, logout garde son comportement (appel serveur + purge locale)', async () => {
    sessionReelle()
    api.logout.mockResolvedValue(undefined)
    await monter()
    await act(async () => {
      await ctx.logout()
    })
    expect(api.logout).toHaveBeenCalledTimes(1)
    expect(purgerDonneesLocales).toHaveBeenCalledTimes(1)
  })
})

describe('AuthContext — autres comportements en démo', () => {
  it('changer de langue : application locale, aucun PATCH /auth/me/langue', async () => {
    sessionReelle()
    await monter()
    await act(async () => {
      await ctx.demarrerDemo()
    })
    appliquerLangue.mockReset()

    await act(async () => {
      await ctx.changerLangue('EN')
    })

    expect(api.setLangue).not.toHaveBeenCalled()
    expect(appliquerLangue).toHaveBeenCalledWith('EN')
  })

  it('aucun refresh proactif programmé pendant la démo', async () => {
    sansSessionReelle()
    await monter()
    const exp = Math.floor(Date.now() / 1000) + 61 // échéance à ~1 s du déclenchement proactif
    const jeton = `x.${btoa(JSON.stringify({ exp }))}.y`
    api.ouvrirSessionDemo.mockResolvedValue({ accessToken: jeton, user: {} })
    vi.useFakeTimers({ shouldAdvanceTime: true })

    await act(async () => {
      await ctx.demarrerDemo()
    })
    await act(async () => {
      vi.advanceTimersByTime(5_000)
    })

    expect(api.rafraichirAccessToken).not.toHaveBeenCalled()
  })

  it('une réhydratation réelle qui aboutit APRÈS le début de la démo ne l’écrase pas', async () => {
    let repondre: (v: { accessToken: string }) => void = () => undefined
    api.refresh.mockImplementation(
      () =>
        new Promise((r) => {
          repondre = r
        }),
    )
    api.me.mockImplementation(async (jeton: string) => (jeton === 'jeton-demo' ? ADMIN_DEMO : ADMIN_REEL))
    render(
      <AuthProvider>
        <Sonde />
      </AuthProvider>,
    )

    await act(async () => {
      await ctx.demarrerDemo()
    })
    await act(async () => {
      repondre({ accessToken: 'jeton-reel' })
    })

    await waitFor(() => expect(etat()).toBe('pret|demo|u-demo|jeton-demo'))
  })
})
```

- [ ] **Step 5: Lancer, constater l'échec**

Run: `cd frontend && npx vitest run src/contexts/AuthContext.test.tsx`
Expected: FAIL — `ctx.demarrerDemo is not a function`.

- [ ] **Step 6: Implémenter `frontend/src/contexts/AuthContext.tsx`**

Remplacer le fichier par :

```tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  authApi,
  configurerAuthBridge,
  definirModeDemo,
  ouvrirSessionDemo,
  rafraichirAccessToken,
} from '@/lib/api'
import type { AuthUser, InscriptionInput } from '@/lib/api'
import i18n, { appliquerLangue } from '@/lib/i18n'
import { appliquerDevise } from '@/lib/format'
import { purgerCachesApi, purgerDonneesLocales } from '@/lib/offline-queue'
import { AuthContext, type AuthContextValue } from './auth-context'

/** Expiration (epoch secondes) encodée dans un access token JWT, ou null si indéchiffrable. */
function expirationAccessToken(token: string): number | null {
  const partie = token.split('.')[1]
  if (!partie) return null
  try {
    const b64 = partie.replace(/-/g, '+').replace(/_/g, '/')
    const pad = b64 + '==='.slice((b64.length + 3) % 4)
    const payload = JSON.parse(atob(pad)) as { exp?: number }
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

/** Session RÉELLE lue depuis le cookie refresh (montage, retour de démo), ou null s'il n'y en a pas. */
async function lireSessionReelle(signal?: AbortSignal): Promise<{ token: string; me: AuthUser } | null> {
  try {
    const { accessToken: token } = await authApi.refresh(signal)
    const me = await authApi.me(token, signal)
    return { token, me }
  } catch {
    return null
  }
}

/**
 * Fournit l'état d'authentification à toute l'app.
 *
 * L'access token est gardé UNIQUEMENT en mémoire React (pas de localStorage, même
 * pour l'access token) → surface d'attaque XSS réduite. La persistance de session
 * entre reloads repose sur le cookie httpOnly du refresh token : au montage, on tente
 * un /auth/refresh silencieux pour récupérer un access token et réhydrater le user.
 *
 * MODE DÉMO (spec 2026-09-15 §2.2) : jeton de l'espace de démonstration en mémoire, jamais persisté
 * (un rechargement y met fin). Le cookie refresh d'un administrateur réel connecté dans ce navigateur
 * n'est ni lu ni révoqué pendant la démo : sortir de la démo n'appelle JAMAIS /auth/logout, puis
 * réhydrate la session réelle.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [modeDemo, setModeDemo] = useState(false)
  // Lu par les callbacks du pont HTTP et par la réhydratation asynchrone (hors cycle de rendu).
  const modeDemoRef = useRef(false)

  const appliquerSession = useCallback((token: string, u: AuthUser) => {
    setAccessToken(token)
    setUser(u)
    // §4 : la préférence serveur prime sur le localStorage dès la réhydratation.
    if (u.langue) appliquerLangue(u.langue)
    // §5/F6 : devise de l'org → formatage des montants dès la réhydratation.
    if (u.devise) appliquerDevise(u.devise)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    void (async () => {
      const session = await lireSessionReelle(controller.signal)
      // Une démo ouverte PENDANT la réhydratation garde la main : la session réelle reviendra à la
      // sortie de la démo, elle n'écrase pas le jeton démo maintenant.
      if (active && session && !modeDemoRef.current) appliquerSession(session.token, session.me)
      if (active) setLoading(false)
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [appliquerSession])

  const quitterDemo = useCallback(async (): Promise<AuthUser | null> => {
    // JAMAIS authApi.logout() ni purgerDonneesLocales() ici : le cookie et la file hors-ligne
    // appartiennent à l'administrateur réel éventuel (invariant de revue, test dédié).
    modeDemoRef.current = false
    definirModeDemo(null)
    setModeDemo(false)
    setAccessToken(null)
    setUser(null)
    setLoading(true)
    appliquerDevise('FCFA')
    void purgerCachesApi()
    const session = await lireSessionReelle()
    if (session) appliquerSession(session.token, session.me)
    setLoading(false)
    return session?.me ?? null
  }, [appliquerSession])

  const demarrerDemo = useCallback(async (): Promise<AuthUser> => {
    const { accessToken: token } = await ouvrirSessionDemo()
    // Mode posé AVANT toute requête authentifiée : un 401 renouvelle alors le jeton démo, jamais la
    // session réelle (refresh-on-401 et minuteur proactif la restaureraient depuis le cookie).
    modeDemoRef.current = true
    definirModeDemo({ messageRefus: () => i18n.t('demo.lectureSeule') })
    try {
      // /auth/me (GET, autorisé) porte `membreId` (le président fictif), absent de /demo/session.
      const me = await authApi.me(token)
      setModeDemo(true)
      setAccessToken(token)
      setUser(me)
      // Langue : celle du visiteur est conservée (l'interface le suit, le contenu fictif est en français).
      if (me.devise) appliquerDevise(me.devise)
      void purgerCachesApi()
      return me
    } catch (e) {
      modeDemoRef.current = false
      definirModeDemo(null)
      throw e
    }
  }, [])

  // Pont client HTTP → AuthContext. Le client (`lib/api`) rafraîchit le token sur 401 et propage
  // le nouveau ici (setState) ; si le refresh échoue, il déclenche une déconnexion propre — on vide
  // la session et ProtectedRoute redirige alors vers /login (pas de boucle de retry). En démo, un
  // renouvellement impossible fait SORTIR de la démo (retour à la session réelle éventuelle).
  useEffect(() => {
    configurerAuthBridge({
      onTokenRefreshed: (token) => setAccessToken(token),
      onSessionExpired: () => {
        if (modeDemoRef.current) {
          void quitterDemo()
          return
        }
        setAccessToken(null)
        setUser(null)
        appliquerDevise('FCFA')
      },
    })
  }, [quitterDemo])

  // Refresh PROACTIF : programmé ~60 s avant l'expiration de l'access token (TTL 15 min côté back)
  // → la session est renouvelée AVANT qu'une requête ne tombe en 401. Réarmé à chaque nouveau token
  // (le succès met à jour `accessToken`, ce qui relance cet effet avec la nouvelle échéance). Un
  // échec proactif ne force pas la déconnexion : le refresh-on-401 réactif prendra le relais.
  // Coupé en démo (§2.2) : le jeton démo est renouvelé à la demande, sur 401.
  useEffect(() => {
    if (!accessToken || modeDemo) return
    const exp = expirationAccessToken(accessToken)
    if (!exp) return
    const delaiMs = exp * 1000 - Date.now() - 60_000
    const id = window.setTimeout(() => {
      void rafraichirAccessToken()
    }, Math.max(0, delaiMs))
    return () => window.clearTimeout(id)
  }, [accessToken, modeDemo])

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      const { accessToken: token, user: connectedUser } = await authApi.login(
        email,
        password,
        rememberMe,
      )
      setAccessToken(token)
      setUser(connectedUser)
      if (connectedUser.langue) appliquerLangue(connectedUser.langue)
      if (connectedUser.devise) appliquerDevise(connectedUser.devise)
      // Retourné pour que l'appelant redirige selon le rôle (SUPER_ADMIN → console plateforme).
      return connectedUser
    },
    [],
  )

  const inscription = useCallback(async (input: InscriptionInput) => {
    // L'inscription connecte directement : même réhydratation que login (token + user).
    const { accessToken: token, user: connectedUser } = await authApi.inscription(input)
    setAccessToken(token)
    setUser(connectedUser)
    if (connectedUser.langue) appliquerLangue(connectedUser.langue)
    if (connectedUser.devise) appliquerDevise(connectedUser.devise)
  }, [])

  const changerLangue = useCallback(
    async (langue: 'FR' | 'EN') => {
      if (!accessToken || modeDemoRef.current) {
        // Non connecté (sélecteur public) ou démo (compte partagé, lecture seule) : application
        // locale, sans persistance serveur.
        appliquerLangue(langue)
        return
      }
      const { accessToken: token, langue: enregistree } = await authApi.setLangue(langue, accessToken)
      // Le PATCH réémet un token portant la nouvelle langue → on remplace le token en mémoire.
      setAccessToken(token)
      setUser((prev) => (prev ? { ...prev, langue: enregistree } : prev))
      appliquerLangue(enregistree)
    },
    [accessToken],
  )

  const logout = useCallback(async () => {
    if (modeDemoRef.current) {
      // « Se déconnecter » pendant la démo = quitter la démo. /auth/logout révoquerait la famille de
      // refresh de l'administrateur réel connecté dans ce navigateur.
      await quitterDemo()
      return
    }
    try {
      await authApi.logout()
    } catch {
      // On efface l'état local même si l'appel réseau échoue.
    }
    setAccessToken(null)
    setUser(null)
    // Repli sur la devise par défaut : le prochain login réappliquera celle de son org.
    appliquerDevise('FCFA')
    // Poste partagé : purge la file offline + les caches SW GET du tenant qui se déconnecte.
    void purgerDonneesLocales()
  }, [quitterDemo])

  const value: AuthContextValue = {
    user,
    accessToken,
    loading,
    isAuthenticated: user !== null,
    login,
    inscription,
    logout,
    changerLangue,
    modeDemo,
    demarrerDemo,
    quitterDemo,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
```

Si `i18n.t('demo.lectureSeule')` ne compile pas (typage des clés sur l'instance), garder l'appel tel quel mais vérifier que le catalogue du Step 1 est bien importé dans `fr/index.ts` : la clé existe alors et le type l'accepte.

- [ ] **Step 7: Relancer, constater le vert, puis saboter**

Run: `cd frontend && npx vitest run src/contexts/AuthContext.test.tsx` → PASS.
Sabotages (vérifiés par `grep`, puis annulés) :
1. Dans `logout`, supprimer le bloc `if (modeDemoRef.current) { … }` → « Se déconnecter en démo n'appelle jamais /auth/logout » passe au rouge.
2. Dans `quitterDemo`, ajouter `await authApi.logout().catch(() => undefined)` en première ligne → « Quitter la démo n'appelle jamais /auth/logout » passe au rouge.
3. Remplacer `if (!accessToken || modeDemo) return` par `if (!accessToken) return` → « aucun refresh proactif » passe au rouge.

- [ ] **Step 8: Aucun rejeu hors-ligne depuis la coquille (`frontend/src/hooks/useSyncHorsLigne.ts`)**

```ts
  const { accessToken, modeDemo } = useAuth()
```

et dans `lancer` :

```ts
    // Démo : jamais de rejeu de la file RÉELLE de ce navigateur avec le jeton démo (§2.2).
    if (!accessToken || modeDemo || !navigator.onLine) return
```

avec `modeDemo` ajouté aux dépendances du `useCallback` : `[accessToken, modeDemo, rafraichir]`. (Le filet `synchroniser` de la Task 1 couvre le même risque dans la bibliothèque ; ce garde évite en plus d'afficher « synchronisation en cours ».)

- [ ] **Step 9: Build, lint, tests, commit**

Run: `cd frontend && npm run build && npm run lint && npm run test`
Expected: build OK (dont parité EN typée), 0 finding, tous les tests verts.

```bash
git add frontend/src/contexts frontend/src/lib/offline-queue.ts frontend/src/hooks/useSyncHorsLigne.ts frontend/src/locales
git commit -m "feat(demo): entrer et quitter la démo sans jamais appeler /auth/logout

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Route `/demo` et bandeau de démonstration

**Files:**
- Create: `frontend/src/pages/DemoPage.tsx`
- Create: `frontend/src/pages/DemoPage.test.tsx`
- Create: `frontend/src/components/BandeauDemo.tsx`
- Create: `frontend/src/components/BandeauDemo.test.tsx`
- Modify: `frontend/src/App.tsx` (route publique)
- Modify: `frontend/src/components/AppShell.tsx` (montage du bandeau)

**Interfaces:**
- Consumes (Task 2) : `useAuth()` → `{ loading, modeDemo, demarrerDemo, quitterDemo }` ; clés `demo.page.*`, `demo.bandeau.*`, `commun.actions.creerMonEspace`, `commun.actions.retourAccueil`.
- Consumes : `cheminApresConnexion(role)` (`@/lib/roles`), `ApiError` (`@/lib/api`), `ErrorState` (`@/components/ui/ErrorState`, props `title`, `description`, `onRetry`, `retryLabel`), `Button` / `ButtonLink` (`@/components/ui/Button`, props `variant`, `size`, `icon`).
- Produces : `export default function DemoPage()` (et export nommé `DemoPage`), `export function BandeauDemo()`.

- [ ] **Step 1: Tests de la page `/demo`**

`frontend/src/pages/DemoPage.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ApiError } from '@/lib/api'
import { DemoPage } from './DemoPage'

const demarrerDemo = vi.fn()
let loading = false
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ loading, demarrerDemo }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const rendre = () =>
  render(
    <MemoryRouter initialEntries={['/demo']}>
      <Routes>
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/dashboard" element={<p>tableau de bord</p>} />
        <Route path="/" element={<p>accueil</p>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  demarrerDemo.mockReset()
  loading = false
})
afterEach(cleanup)

describe('DemoPage', () => {
  it('ouvre la démo puis mène au tableau de bord', async () => {
    demarrerDemo.mockResolvedValue({ id: 'u-demo', role: 'ADMIN' })
    rendre()
    expect(await screen.findByText('tableau de bord')).toBeTruthy()
    expect(demarrerDemo).toHaveBeenCalledTimes(1)
  })

  it('attend la fin de la réhydratation avant d’ouvrir la démo', () => {
    loading = true
    rendre()
    expect(demarrerDemo).not.toHaveBeenCalled()
    expect(screen.getByText('demo.page.ouverture')).toBeTruthy()
  })

  it('démo éteinte (404) : message « indisponible » et retour à l’accueil', async () => {
    demarrerDemo.mockRejectedValue(new ApiError(404, 'indisponible'))
    rendre()
    expect(await screen.findByText('demo.page.indisponibleTitre')).toBeTruthy()
    expect(screen.getByRole('link', { name: /commun.actions.retourAccueil/ }).getAttribute('href')).toBe('/')
  })

  it('erreur réseau : message d’erreur avec « Réessayer »', async () => {
    demarrerDemo.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    demarrerDemo.mockResolvedValueOnce({ id: 'u-demo', role: 'ADMIN' })
    rendre()
    expect(await screen.findByText('demo.page.erreurTitre')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /commun\.actions\.reessayer/ }))
    await waitFor(() => expect(screen.getByText('tableau de bord')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Lancer, constater l'échec**

Run: `cd frontend && npx vitest run src/pages/DemoPage.test.tsx`
Expected: FAIL — `Failed to resolve import "./DemoPage"`.

- [ ] **Step 3: Écrire `frontend/src/pages/DemoPage.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { ApiError } from '@/lib/api'
import { cheminApresConnexion } from '@/lib/roles'
import { ErrorState } from '@/components/ui/ErrorState'
import { ButtonLink } from '@/components/ui/Button'

type Echec = 'indisponible' | 'erreur'

/**
 * `/demo` (public, spec 2026-09-15 §2.1) — unique porte d'entrée de l'espace de démonstration côté
 * front : ouvre la session démo puis mène au tableau de bord. Les liens d'entrée restent visibles
 * même démo éteinte ; c'est cette page qui explique l'indisponibilité (aucun appel sur la landing).
 */
export function DemoPage() {
  const { t } = useTranslation()
  const { loading, demarrerDemo } = useAuth()
  const navigate = useNavigate()
  const [echec, setEchec] = useState<Echec | null>(null)
  // StrictMode rejoue les effets en dev : une seule ouverture par tentative.
  const lance = useRef(false)

  const ouvrir = useCallback(() => {
    setEchec(null)
    demarrerDemo()
      .then((u) => navigate(cheminApresConnexion(u.role), { replace: true }))
      .catch((e: unknown) => setEchec(e instanceof ApiError && e.status === 404 ? 'indisponible' : 'erreur'))
  }, [demarrerDemo, navigate])

  useEffect(() => {
    // Attendre la réhydratation de la session réelle : elle ne doit pas se terminer APRÈS la démo.
    if (loading || lance.current) return
    lance.current = true
    ouvrir()
  }, [loading, ouvrir])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-10">
      <div className="w-full max-w-md">
        {echec === null ? (
          <p role="status" className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-brass" aria-hidden="true" />
            {t('demo.page.ouverture')}
          </p>
        ) : (
          <>
            <ErrorState
              title={t(echec === 'indisponible' ? 'demo.page.indisponibleTitre' : 'demo.page.erreurTitre')}
              description={t(echec === 'indisponible' ? 'demo.page.indisponible' : 'demo.page.erreur')}
              onRetry={echec === 'erreur' ? ouvrir : undefined}
              retryLabel={t('commun.actions.reessayer')}
            />
            <div className="mt-6 text-center">
              <ButtonLink to="/" variant="outline" icon={ArrowLeft}>
                {t('commun.actions.retourAccueil')}
              </ButtonLink>
            </div>
          </>
        )}
      </div>
    </main>
  )
}

export default DemoPage
```

Dans `frontend/src/App.tsx` : `import DemoPage from '@/pages/DemoPage'` avec les imports statiques des pages publiques (après `StatutPage`), et `<Route path="/demo" element={<DemoPage />} />` après la route `/statut`.

- [ ] **Step 4: Relancer → PASS**

Run: `cd frontend && npx vitest run src/pages/DemoPage.test.tsx` → PASS.

- [ ] **Step 5: Tests du bandeau**

`frontend/src/components/BandeauDemo.test.tsx` :

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { BandeauDemo } from './BandeauDemo'

let modeDemo = true
const quitterDemo = vi.fn()
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ modeDemo, quitterDemo }) }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (cle: string) => cle, i18n: { language: 'fr' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

const rendre = () =>
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/dashboard" element={<BandeauDemo />} />
        <Route path="/" element={<p>accueil</p>} />
        <Route path="/inscription" element={<p>inscription</p>} />
        <Route path="/mon-espace" element={<p>mon espace</p>} />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  modeDemo = true
  quitterDemo.mockReset()
})
afterEach(cleanup)

describe('BandeauDemo', () => {
  it('hors démo : rien', () => {
    modeDemo = false
    rendre()
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('en démo : message non fermable, rôle status', () => {
    rendre()
    const bandeau = screen.getByRole('status')
    expect(bandeau.textContent).toContain('demo.bandeau.titre')
    expect(screen.queryByRole('button', { name: /fermer/i })).toBeNull()
  })

  it('« Quitter » sans session réelle → accueil', async () => {
    quitterDemo.mockResolvedValue(null)
    rendre()
    fireEvent.click(screen.getByRole('button', { name: /demo.bandeau.quitter/ }))
    expect(await screen.findByText('accueil')).toBeTruthy()
    expect(quitterDemo).toHaveBeenCalledTimes(1)
  })

  it('« Quitter » avec session réelle → accueil de son rôle', async () => {
    quitterDemo.mockResolvedValue({ id: 'u', role: 'MEMBRE_SIMPLE' })
    rendre()
    fireEvent.click(screen.getByRole('button', { name: /demo.bandeau.quitter/ }))
    expect(await screen.findByText('mon espace')).toBeTruthy()
  })

  it('« Créer mon espace » quitte d’abord la démo puis ouvre l’inscription', async () => {
    quitterDemo.mockResolvedValue(null)
    rendre()
    fireEvent.click(screen.getByRole('button', { name: /commun.actions.creerMonEspace/ }))
    expect(await screen.findByText('inscription')).toBeTruthy()
    expect(quitterDemo).toHaveBeenCalledTimes(1)
  })
})
```

Run: `cd frontend && npx vitest run src/components/BandeauDemo.test.tsx` → FAIL (module absent).

- [ ] **Step 6: Écrire `frontend/src/components/BandeauDemo.tsx`**

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Eye, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { cheminApresConnexion } from '@/lib/roles'
import { Button } from '@/components/ui/Button'

/**
 * Bandeau de l'espace de démonstration (spec 2026-09-15 §2.3), en tête de `#contenu-principal`,
 * AU-DESSUS du bandeau de forfait. Non fermable : tant que la démo dure, le visiteur doit savoir que
 * les données sont fictives et que rien ne s'enregistre. `role="status"` (information, pas alerte).
 * Sortir passe par `quitterDemo`, qui n'appelle jamais /auth/logout.
 */
export function BandeauDemo() {
  const { t } = useTranslation()
  const { modeDemo, quitterDemo } = useAuth()
  const navigate = useNavigate()
  const [enCours, setEnCours] = useState(false)

  if (!modeDemo) return null

  const quitter = async (destination?: string) => {
    setEnCours(true)
    const reel = await quitterDemo()
    navigate(destination ?? (reel ? cheminApresConnexion(reel.role) : '/'), { replace: true })
  }

  return (
    <div
      role="status"
      className="mb-6 flex flex-col gap-3 rounded-2xl border border-brass/30 bg-brass/[0.07] p-4 sm:flex-row sm:items-center"
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Eye className="mt-0.5 h-5 w-5 shrink-0 text-brass" aria-hidden="true" />
        <p className="text-sm text-foreground">
          <span className="font-medium">{t('demo.bandeau.titre')}</span>
          {' — '}
          {t('demo.bandeau.texte')}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 sm:shrink-0">
        <Button size="sm" disabled={enCours} onClick={() => void quitter('/inscription')}>
          {t('commun.actions.creerMonEspace')}
        </Button>
        <Button size="sm" variant="outline" icon={LogOut} disabled={enCours} onClick={() => void quitter()}>
          {enCours ? t('demo.bandeau.retourEnCours') : t('demo.bandeau.quitter')}
        </Button>
      </div>
    </div>
  )
}
```

Dans `frontend/src/components/AppShell.tsx` : `import { BandeauDemo } from '@/components/BandeauDemo'` à côté de l'import de `BandeauForfait`, et `<BandeauDemo />` juste AVANT `<BandeauForfait />` dans `#contenu-principal`.

- [ ] **Step 7: Relancer → PASS, puis build, lint, tests, commit**

Run: `cd frontend && npx vitest run src/components/BandeauDemo.test.tsx src/pages/DemoPage.test.tsx && npm run build && npm run lint && npm run test`
Expected: tout vert, 0 finding.

```bash
git add frontend/src/pages/DemoPage.tsx frontend/src/pages/DemoPage.test.tsx frontend/src/components/BandeauDemo.tsx frontend/src/components/BandeauDemo.test.tsx frontend/src/App.tsx frontend/src/components/AppShell.tsx
git commit -m "feat(demo): route /demo et bandeau de démonstration

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Points d'entrée et relance WhatsApp désactivée

**Files:**
- Modify: `frontend/src/components/ui/glassmorphism-trust-hero.tsx` (héros de l'accueil)
- Modify: `frontend/src/components/landing/VideoDemo.tsx` (près de la vidéo)
- Modify: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/components/dashboard/GuideDemarrage.tsx`, `GuideDemarrage.test.tsx`
- Modify: `frontend/src/components/dashboard/AnalyseMembres.tsx`, `AnalyseMembres.test.tsx`
- Modify: `frontend/src/pages/MembreDetailPage.tsx`

**Interfaces:**
- Consumes (Task 2) : `useAuth().modeDemo` ; clés `demo.entree.voirExemple`, `demo.entree.voirEspaceRempli`, `demo.whatsappDesactive`.
- Consumes (Task 3) : route `/demo`.

- [ ] **Step 1: Tests (guide et relance WhatsApp)**

Dans `frontend/src/components/dashboard/GuideDemarrage.test.tsx`, ajouter à la fin :

```tsx
describe('GuideDemarrage — espace d’exemple', () => {
  it('propose de voir un espace rempli (lien vers /demo)', () => {
    rendre(false)
    const lien = screen.getByRole('link', { name: /demo.entree.voirEspaceRempli/ })
    expect(lien.getAttribute('href')).toBe('/demo')
  })
})
```

Dans `frontend/src/components/dashboard/AnalyseMembres.test.tsx`, remplacer le mock de `useAuth` par :

```tsx
let modeDemo = false
vi.mock('@/contexts/auth-context', () => ({ useAuth: () => ({ accessToken: 'jeton', modeDemo }) }))
```

ajouter `modeDemo = false` dans le `beforeEach` existant (`beforeEach(() => { listStatutsPage.mockReset(); modeDemo = false })`), puis à la fin :

```tsx
describe('AnalyseMembres — relance WhatsApp en démo', () => {
  const joignable = { ...membre, telephone: '677123456' }

  it('hors démo : lien wa.me présent (contrôle du test)', async () => {
    listStatutsPage.mockResolvedValue({ items: [joignable], total: 1, tronque: false })
    render(<MemoryRouter><AnalyseMembres /></MemoryRouter>)
    const lien = await screen.findByRole('link', { name: 'dashboard.analyse.relancerWhatsApp' })
    expect(lien.getAttribute('href')).toContain('wa.me')
  })

  it('en démo : aucun lien wa.me, bouton désactivé', async () => {
    modeDemo = true
    listStatutsPage.mockResolvedValue({ items: [joignable], total: 1, tronque: false })
    const { container } = render(<MemoryRouter><AnalyseMembres /></MemoryRouter>)
    const bouton = await screen.findByRole('button', { name: 'demo.whatsappDesactive' })
    expect((bouton as HTMLButtonElement).disabled).toBe(true)
    expect(container.querySelector('a[href*="wa.me"]')).toBeNull()
  })
})
```

Run: `cd frontend && npx vitest run src/components/dashboard/GuideDemarrage.test.tsx src/components/dashboard/AnalyseMembres.test.tsx`
Expected: FAIL sur les nouveaux cas (lien et bouton absents). Si « hors démo : lien wa.me présent » échoue aussi, le numéro fixture n'est pas accepté par `telephoneWaMe` : lire `frontend/src/lib/utils.ts::telephoneWaMe` et prendre un numéro qu'il valide, avant d'implémenter.

- [ ] **Step 2: Relance WhatsApp désactivée — `AnalyseMembres.tsx`**

`const { accessToken, modeDemo } = useAuth()`, puis remplacer le bloc `{lienWa && ( <a …> )}` par :

```tsx
                    {lienWa &&
                      (modeDemo ? (
                        // Démo (§2.4) : un lien wa.me n'est pas une requête API, la garde lecture
                        // seule ne le voit pas, et un numéro fictif peut appartenir à quelqu'un.
                        <button
                          type="button"
                          disabled
                          className="shrink-0 cursor-not-allowed rounded-lg p-2 text-faint opacity-60"
                          aria-label={t('demo.whatsappDesactive')}
                          title={t('demo.whatsappDesactive')}
                        >
                          <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <a
                          href={lienWa}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 rounded-lg p-2 text-jade transition-colors hover:bg-jade/10"
                          aria-label={t('dashboard.analyse.relancerWhatsApp')}
                          title={t('dashboard.analyse.relancerWhatsApp')}
                        >
                          <MessageCircle className="h-4 w-4" aria-hidden="true" />
                        </a>
                      ))}
```

- [ ] **Step 3: Relance WhatsApp désactivée — `MembreDetailPage.tsx`**

`const { user, accessToken, modeDemo } = useAuth()`. Sur le `<button role="menuitem">` de relance WhatsApp : ajouter `disabled={modeDemo}` et `title={modeDemo ? t('demo.whatsappDesactive') : undefined}` ; dans son `onClick`, première ligne `if (modeDemo) return` ; compléter sa `className` par ` disabled:cursor-not-allowed disabled:opacity-50`.

- [ ] **Step 4: Points d'entrée**

`GuideDemarrage.tsx` — importer `Link` depuis `react-router-dom` et `Eye` dans l'import `lucide-react`, puis juste après le paragraphe `dashboard.guide.progression` :

```tsx
      <Link
        to="/demo"
        className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brass underline-offset-4 hover:underline"
      >
        <Eye className="h-4 w-4" aria-hidden="true" />
        {t('demo.entree.voirEspaceRempli')}
      </Link>
```

`glassmorphism-trust-hero.tsx` — dans le conteneur des boutons du héros (`nk-reveal nk-d4 …`), ajouter `sm:flex-wrap` à sa `className` et insérer entre le CTA d'inscription et le bouton « Découvrir » (`Eye` est déjà importé) :

```tsx
            <ButtonLink to="/demo" variant="outline" size="lg" icon={Eye}>
              {t('demo.entree.voirExemple')}
            </ButtonLink>
```

`VideoDemo.tsx` — importer `ButtonLink` (à côté de `Button`) et `Eye` (import `lucide-react`), puis juste après la `</ul>` des points :

```tsx
          <div className="mt-8 flex justify-center lg:justify-start">
            <ButtonLink to="/demo" variant="outline" icon={Eye}>
              {t('demo.entree.voirExemple')}
            </ButtonLink>
          </div>
```

`LoginPage.tsx` — importer `Eye` dans l'import `lucide-react` ; transformer le bloc « retour à l'accueil » (`<div className="nk-reveal nk-d3 mt-6 text-center">`) en :

```tsx
            <div className="nk-reveal nk-d3 mt-6 flex flex-col items-center gap-3">
              <Link
                to="/demo"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brass transition-colors hover:text-amber"
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                {t('demo.entree.voirExemple')}
              </Link>
              <Link
                to="/"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                {t('commun.actions.retourAccueil')}
              </Link>
            </div>
```

- [ ] **Step 5: Relancer, saboter, build, lint, tests, commit**

Run: `cd frontend && npx vitest run src/components/dashboard/GuideDemarrage.test.tsx src/components/dashboard/AnalyseMembres.test.tsx` → PASS.
Sabotage : remplacer `modeDemo ? (` par `false ? (` dans `AnalyseMembres.tsx` (vérifier par `grep -n "false ? (" src/components/dashboard/AnalyseMembres.tsx`) → « en démo : aucun lien wa.me » au rouge ; annuler.

Run: `cd frontend && npm run build && npm run lint && npm run test` → tout vert, 0 finding.

```bash
git add frontend/src/components/ui/glassmorphism-trust-hero.tsx frontend/src/components/landing/VideoDemo.tsx frontend/src/pages/LoginPage.tsx frontend/src/components/dashboard frontend/src/pages/MembreDetailPage.tsx
git commit -m "feat(demo): points d'entrée vers /demo et relance WhatsApp désactivée en démo

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Documentation

**Files:**
- Modify: `docs/architecture-demo.md`
- Modify: `CLAUDE.md` (bloc « Espace de démonstration »)
- Modify: `docs/roadmap-v1-vers-GA.md` (ligne 1.2)

- [ ] **Step 1: `docs/architecture-demo.md`**

En tête, remplacer « front de démonstration (à venir, PR 3) » par « front de démonstration (§6, PR 3) ». Ajouter avant « ## Mise en service (PO) » :

```markdown
## 6. Front de démonstration (PR 3)

- **Entrée** : route publique `/demo` (`pages/DemoPage.tsx`), atteinte depuis le héros et la vidéo de
  l'accueil, la page de connexion et le guide de démarrage. Les liens restent visibles démo éteinte :
  la page explique l'indisponibilité (404), aucun appel n'est fait sur la landing pour les masquer. La
  page attend la fin de la réhydratation de la session réelle avant d'ouvrir la démo.
- **Mode démo du client HTTP** (`lib/api/core.ts`, posé par `AuthContext`) : écritures refusées
  LOCALEMENT (403, même message que le serveur) selon `lib/demo.ts`, miroir de `backend/src/lib/demo.ts`
  gardé par `demo-parity.test.ts` ; téléversements multipart (fetch bruts) couverts un par un ;
  « rafraîchir » = redemander `POST /demo/session` (`credentials: 'omit'`), jamais `/auth/refresh` qui
  restaurerait la session réelle. **Génération de session** : un refresh lancé avant l'entrée (ou la
  sortie) de démo ne propage jamais son jeton.
- **Ne jamais déconnecter l'administrateur réel** : `quitterDemo` (bandeau, « Se déconnecter » de la
  coquille, échec du renouvellement) n'appelle jamais `/auth/logout` — qui révoquerait la famille de
  refresh du cookie — ni `purgerDonneesLocales` (file hors-ligne réelle) ; il réhydrate la session
  depuis le cookie. Filet serveur écarté : `/auth/logout` ne lit que ce cookie, il ne peut pas savoir
  que l'appel vient d'un onglet en démo ; le second filet est le refus local de `POST /auth/logout`.
  Tests : `AuthContext.test.tsx`, `api-demo.test.ts`.
- **Non persistée** : un rechargement met fin à la démo. Langue changée localement ; file hors-ligne
  ni alimentée ni rejouée ; minuteur de refresh proactif coupé ; caches GET du service worker purgés
  à l'entrée et à la sortie (clé = URL, une réponse fictive servirait sinon de repli hors ligne).
- **Bandeau** `components/BandeauDemo.tsx` au-dessus du bandeau de forfait, non fermable,
  `role="status"` ; « Créer mon espace » quitte la démo puis ouvre `/inscription`.
- **Relance WhatsApp désactivée** (dashboard, fiche membre) : un lien `wa.me` n'est pas une requête
  API, la garde ne le voit pas, et un numéro fictif peut appartenir à quelqu'un.
```

Remplacer l'étape 3 de « Mise en service (PO) » par :

```markdown
3. Contrôle : ouvrir `https://nkoni.vercel.app/demo` — le tableau de bord de « Association Exemple
   NKONI » s'affiche avec le bandeau « Espace de démonstration » ; tenter une écriture (ex. « + Versement »
   puis enregistrer) affiche le refus « lecture seule » ; « Quitter la démo » ramène à l'accueil (ou à
   votre espace si vous étiez connecté, sans avoir à vous reconnecter). La console super-admin montre
   l'organisation avec le badge « Démo ».
```

- [ ] **Step 2: `CLAUDE.md`**

Dans le bloc « Espace de démonstration (chantier 1.2) », ajouter un 4ᵉ tiret après celui sur la suppression :

```markdown
- **Front : quitter la démo n'appelle JAMAIS `/auth/logout`** (il révoquerait la session de l'administrateur réel du même navigateur) ni ne purge la file hors-ligne ; en démo, le client HTTP refuse localement les écritures (`lib/demo.ts`, parité serveur gardée) et renouvelle le jeton par `POST /demo/session`, jamais par `/auth/refresh`.
```

- [ ] **Step 3: Roadmap**

Dans la ligne 1.2 de `docs/roadmap-v1-vers-GA.md`, remplacer « ; reste le front (PR 3). » par « ; **PR 3 front livrée** (route `/demo`, bandeau, lecture seule côté client, sortie sans déconnexion de l'administrateur réel) ; mise en service par le PO (`DEMO_ACTIVEE` + `npm run demo:generer`). ».

- [ ] **Step 4: Commit**

```bash
git add docs/architecture-demo.md CLAUDE.md docs/roadmap-v1-vers-GA.md
git commit -m "docs(demo): front de démonstration et contrôle de mise en service

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Vérification visuelle en navigateur (contrôleur)

Exécutée par la session qui orchestre (outils navigateur), pas par un sous-agent d'implémentation. Aucun commit.

**Files:** aucun fichier suivi. `.claude/launch.json` est ignoré par git : on peut y ajouter deux configurations locales.

- [ ] **Step 1: Base jetable et démo générée**

```bash
cd backend
export DATABASE_URL="postgresql://$(id -un)@localhost:5432/nkoni_it_demo?sslmode=disable"
/opt/homebrew/opt/postgresql@18/bin/createdb nkoni_it_demo 2>/dev/null || true
npx prisma migrate deploy && npx prisma generate
JWT_ACCESS_SECRET=verif-demo-access-local JWT_REFRESH_SECRET=verif-demo-refresh-local npm run demo:generer
```

Expected: `✔ Démo générée : <uuid>`. Jamais la base `nkoni`.

- [ ] **Step 2: Serveurs de vérification**

Ajouter à `.claude/launch.json` :

```json
    {
      "name": "demo-front-backend",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["--prefix", "backend", "tsx", "backend/src/app.ts"],
      "port": 3200,
      "env": {
        "PORT": "3200",
        "DATABASE_URL": "postgresql://nelson@localhost:5432/nkoni_it_demo?sslmode=disable",
        "JWT_ACCESS_SECRET": "verif-demo-access-local",
        "JWT_REFRESH_SECRET": "verif-demo-refresh-local",
        "CORS_ORIGIN": "http://localhost:5320",
        "DEMO_ACTIVEE": "true",
        "NODE_ENV": "development"
      }
    },
    {
      "name": "demo-front-frontend",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev", "--prefix", "frontend", "--", "--port", "5320", "--strictPort"],
      "port": 5320,
      "env": { "VITE_API_URL": "http://localhost:3200" }
    }
```

Démarrer les deux par `preview_start` (`demo-front-backend`, puis `demo-front-frontend`).

- [ ] **Step 3: Parcours visiteur (bureau puis 360 px)**

1. `/` : bouton « Voir un espace d'exemple » dans le héros et sous la vidéo, sans débordement à 360 px.
2. Clic → `/demo` → `/dashboard` : bandeau en tête, tableau de bord rempli, aucune erreur console.
3. Fiche d'un membre en retard : relance WhatsApp désactivée ; dashboard « À relancer » : icône désactivée.
4. Tenter une écriture (nouveau versement → enregistrer) : message « lecture seule », `read_network_requests` ne montre AUCUN `POST /versements`.
5. Changer la langue (EN) : interface en anglais, aucune requête `PATCH /auth/me/langue`.
6. « Quitter la démo » → accueil ; aucun `POST /auth/logout` dans les requêtes.
7. `/login` : lien « Voir un espace d'exemple ».
8. Capture d'écran bureau et 360 px (`resize_window` preset `mobile`, puis `desktop`).

- [ ] **Step 4: Démo éteinte**

Arrêter `demo-front-backend`, retirer `DEMO_ACTIVEE` de sa configuration, redémarrer, ouvrir `/demo` : message « indisponible » et retour à l'accueil. (Le parcours « administrateur réel retrouve sa session » repose sur le cookie same-origin de la prod ; en local le front et le back sont sur deux origines, il est couvert par `AuthContext.test.tsx` et se contrôle en production, étape 3 de la mise en service.)

- [ ] **Step 5: Nettoyage**

`preview_stop` des deux serveurs, retirer les deux configurations ajoutées à `.claude/launch.json`. Conserver `nkoni_it_demo` (base jetable réutilisée par les tests d'intégration).
