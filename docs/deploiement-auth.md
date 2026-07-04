# Déploiement & auth — proxy same-origin (à ne pas casser)

En prod, front (`nkoni.vercel.app`, Vercel) et back
(`nkoni-backend-production.up.railway.app`, Railway) sont sur deux domaines racines
distincts (`vercel.app` ≠ `railway.app`). Un cookie posé par Railway est alors un
**cookie tiers** pour le front : le navigateur refuse de le stocker/renvoyer
(Safari/ITP toujours ; Chrome selon le blocage des cookies tiers), **même avec
`SameSite=None; Secure` et un CORS correct**. Ce n'est donc ni un bug de code ni de
CORS.

Symptôme observé : `POST /auth/refresh` part sans le cookie refresh → `401` →
**déconnexion à chaque rechargement de page**.

## Correctif en place (juillet 2026)

Un **proxy same-origin** : le navigateur ne voit qu'un seul domaine
(`nkoni.vercel.app`), donc le cookie refresh devient **first-party**.

- **`frontend/vercel.json`** : rewrite `/api/:path*` →
  `https://nkoni-backend-production.up.railway.app/:path*`, placé **AVANT** le
  catch-all SPA `/(.*) → /index.html`.
- **Vercel** env prod `VITE_API_URL=/api` — le front n'appelle **jamais** Railway en
  direct, tout passe par `/api/*`.
- **Railway** env `REFRESH_COOKIE_PATH=/api/auth` — le `Path` du cookie doit refléter
  le chemin **public** vu par le navigateur derrière le proxy (défaut code = `/auth`
  pour le dev en appel direct).
- **Cookie refresh** : `httpOnly; Secure(prod); SameSite=Lax; Path=/api/auth`. `Lax`
  est possible justement parce qu'on est same-origin (protection CSRF gratuite).

## Pièges pour les évolutions futures

Toute modification de `VITE_API_URL`, des rewrites Vercel, du `REFRESH_COOKIE_PATH`,
ou un passage à un back sur un autre domaine racine peut **réintroduire** le bug de
cookie tiers.

Vérification rapide : DevTools → Application → Cookies, `nkoni_refresh` doit apparaître
sous **`nkoni.vercel.app`** (first-party), **pas** sous le domaine railway ; la session
doit survivre à un rechargement sur Chrome **et** Safari.

> Note outillage : l'API Vercel `/v6/deployments` renvoie les messages de commit avec
> des retours-ligne **non échappés** → `JSON.parse` plante ; parser par regex.
