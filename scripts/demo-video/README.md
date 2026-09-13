# Vidéo de démonstration de la page d'accueil

Produit une vidéo PAR LANGUE — `frontend/public/demo/nkoni-demo.mp4` (français) et `nkoni-demo-en.mp4`
(anglais), chacune avec son image d'aperçu — affichée selon la langue du visiteur par
`frontend/src/components/landing/VideoDemo.tsx`. **À régénérer quand l'interface filmée change**
(tableau de bord, fiche membre, saisie de versement, reçu, « Mon espace ») : sinon la page d'accueil
montre un produit qui n'existe plus.

> ⚠️ **Base FICTIVE uniquement** (`nkoni_demo`, locale). Ne jamais filmer de données réelles : une vidéo
> publique montrant noms et téléphones de vrais membres serait une fuite de données personnelles.
> `seed.mjs` refuse une URL d'API qui ressemble à la production.

## Prérequis

- PostgreSQL 18 local, `ffmpeg` (`brew install ffmpeg`), `python3`
- `npm install` dans ce dossier — `playwright-core` seul, **aucun navigateur téléchargé** si le
  Chromium de la même version est déjà en cache (`~/Library/Caches/ms-playwright/chromium-1234`) ;
  sinon `npx playwright-core install chromium`

## Procédure

```bash
# 1. Base de démo vierge, schéma à jour
./scripts/demo-video/reset-db.sh

# 2. Backend de démo sur :3100 (branché sur nkoni_demo) et frontend sur :5310
#    — configurations `demo-backend` / `demo-frontend`, ou à la main :
#    PORT=3100 DATABASE_URL=postgresql://$USER@localhost:5432/nkoni_demo JWT_ACCESS_SECRET=… \
#      JWT_REFRESH_SECRET=… CORS_ORIGIN=http://localhost:5310 npx --prefix backend tsx backend/src/app.ts
#    VITE_API_URL=http://localhost:3100 npm run dev --prefix frontend -- --port 5310 --strictPort

# 3. Association fictive (12 membres, 31 versements, 21 reçus, 1 compte membre)
API=http://localhost:3100 node scripts/demo-video/seed.mjs

# 4. Tournage (images horodatées) — le scénario MODIFIE la base : repartir de l'étape 1 pour refilmer,
#    donc AVANT CHAQUE LANGUE. `LANGUE` pose aussi la préférence de langue des comptes par l'API.
OUT=/tmp/nkoni-demo-fr LANGUE=fr node scripts/demo-video/record.mjs

# 5. Montage → frontend/public/demo/ (nkoni-demo.mp4 ; nkoni-demo-en.mp4 avec LANGUE=en)
IN=/tmp/nkoni-demo-fr LANGUE=fr ./scripts/demo-video/build-video.sh
```

Les deux langues d'affilée (serveurs de démo lancés) :

```bash
for L in fr en; do
  ./scripts/demo-video/reset-db.sh && API=http://localhost:3100 node scripts/demo-video/seed.mjs \
    && OUT=/tmp/nkoni-demo-$L LANGUE=$L node scripts/demo-video/record.mjs \
    && IN=/tmp/nkoni-demo-$L LANGUE=$L ./scripts/demo-video/build-video.sh
done
```

Les libellés d'interface visés par le scénario et les légendes vivent dans `TEXTES` (`record.mjs`) :
un libellé renommé dans un catalogue fait échouer le tournage sur une attente — le corriger là.

## Pièges connus (et pourquoi le code est ainsi)

- **Pas de `recordVideo` Playwright** : il enregistre en pixels CSS et complète le cadre avec du gris
  (texte flou en Retina). La capture passe par `Page.captureScreenshot` avec `clip.scale = 2`, dont les
  coordonnées sont **document** : il faut y ajouter la position de défilement.
- **GPU** : sans `--use-angle=metal`, Chrome sans fenêtre dessine en logiciel (SwiftShader) — 16 img/s
  au lieu de ~29.
- **Préchauffage** hors caméra : les pages sont chargées à la demande ; sans lui, ~1 s d'écran noir.
- **Images vides** retirées au montage (`ecarter-images-vides.py`) : une capture peut tomber entre deux
  pages. Le script échoue si le nombre de mesures ne correspond pas au nombre d'images (filtre jamais
  vacant).
- **Cookie de rafraîchissement** non renvoyé d'un port à l'autre en local : on ne recharge jamais la page
  pendant le tournage, on navigue dans l'application.
