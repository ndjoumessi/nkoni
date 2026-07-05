# Page de maintenance — activation / désactivation

Page statique autonome : `frontend/public/maintenance.html` (design system « Laiton & Jade »,
aucune dépendance externe → s'affiche même quand le backend est coupé). Servie en permanence à
l'URL `/maintenance.html` ; **inerte** tant qu'on ne l'active pas.

L'activation se fait par **un seul bloc `redirect` dans `frontend/vercel.json`** — c'est de la
config de déploiement, on ne touche PAS au code applicatif (`src/`) ni au proxy `/api/*`.

> **Pourquoi un `redirect` et pas un `rewrite` ?** Sur Vercel, les `redirects` sont évalués AVANT
> le système de fichiers → ils couvrent de façon fiable **toutes** les routes, y compris la racine
> `/` (qui, avec un simple rewrite SPA, resterait servie par `index.html`, donc l'app).

Le motif `/((?!api/|maintenance\.html|favicon).*)` redirige tout SAUF :
- `/api/*` → le proxy vers le backend Railway reste intact (le cookie refresh en dépend) ;
- `/maintenance.html` → évite une boucle de redirection ;
- `/favicon*` → l'icône de la page.

---

## ACTIVER la maintenance

Remplacer **tout** le contenu de `frontend/vercel.json` par ceci (le bloc de maintenance est ajouté
en 2ᵉ position des `redirects`, après la canonicalisation d'hôte) :

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "nkoni-frontend.vercel.app" }],
      "destination": "https://nkoni.vercel.app/$1",
      "permanent": true
    },
    {
      "source": "/((?!api/|maintenance\\.html|favicon).*)",
      "destination": "/maintenance.html",
      "permanent": false
    }
  ],
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://nkoni-backend-production.up.railway.app/:path*"
    },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Puis :

```bash
cd frontend
git add vercel.json
git commit -m "ops: activer la page de maintenance"
git push        # Vercel redéploie ; maintenance active dès la fin du déploiement
```

Vérifier (après déploiement) que toute URL affiche la page et que le proxy API reste routé :

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://nkoni.vercel.app/            # 307 → /maintenance.html
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://nkoni.vercel.app/dashboard   # 307 → /maintenance.html
curl -s -o /dev/null -w "%{http_code}\n" https://nkoni.vercel.app/maintenance.html            # 200 (la page)
curl -s -o /dev/null -w "%{http_code}\n" https://nkoni.vercel.app/api/health                  # routé vers le backend (pas 307)
```

---

## DÉSACTIVER la maintenance

Rétablir le `frontend/vercel.json` d'origine (sans le bloc de maintenance) :

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "redirects": [
    {
      "source": "/(.*)",
      "has": [{ "type": "host", "value": "nkoni-frontend.vercel.app" }],
      "destination": "https://nkoni.vercel.app/$1",
      "permanent": true
    }
  ],
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "https://nkoni-backend-production.up.railway.app/:path*"
    },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

Puis :

```bash
cd frontend
git add vercel.json
git commit -m "ops: désactiver la page de maintenance"
git push        # Vercel redéploie ; l'app repasse en ligne
```

> Astuce Git : la bascule = un simple aller-retour sur `vercel.json`. Pour désactiver, on peut aussi
> `git revert` le commit d'activation.

---

## Tester AVANT la vraie bascule (recommandé)

Pousser le commit d'activation sur une **branche** dédiée → Vercel crée un déploiement **Preview**
avec sa propre URL. Vérifier la page sur cette URL Preview avant de l'appliquer en production.

```bash
git checkout -b ops/maintenance-preview
# (appliquer le vercel.json "ACTIVER", commit)
git push -u origin ops/maintenance-preview
# → ouvrir l'URL Preview fournie par Vercel et contrôler l'affichage + les redirections
```

## Aperçu local rapide de la page (sans Vercel)

```bash
cd frontend
python3 -m http.server 4999 --directory public
# puis ouvrir http://localhost:4999/maintenance.html
```
