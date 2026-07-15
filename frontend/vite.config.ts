import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons.svg'],
      manifest: {
        name: 'NKONI',
        short_name: 'NKONI',
        description: 'Gestion des cotisations & transparence financière',
        lang: 'fr',
        theme_color: '#010A25',
        background_color: '#010A25',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        // Icônes PNG dérivées de la marque NKONI (favicon.svg) — meilleure installation Android/iOS
        // que le SVG seul. `maskable` = variante avec zone de sécurité (le masque OS ne rogne pas
        // la marque). `favicon.svg` reste le favicon d'onglet (référencé dans index.html).
        icons: [
          { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // `png` inclus → les icônes d'install sont précachées (install hors-ligne robuste).
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        // Les requêtes /api/* ne sont PAS des navigations SPA → ne pas les rediriger vers index.html.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            // Lecture HORS-LIGNE : GET /api/* (SAUF /api/auth/*) en NETWORK-FIRST → réseau quand
            // disponible (jamais de donnée authentifiée périmée en ligne), cache de secours hors
            // ligne. Jamais de POST/PATCH/DELETE ni /auth (cookie refresh + jetons) mis en cache.
            urlPattern: ({ url, request }) =>
              url.pathname.startsWith('/api/') &&
              !url.pathname.startsWith('/api/auth') &&
              request.method === 'GET',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'nkoni-api-get',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
