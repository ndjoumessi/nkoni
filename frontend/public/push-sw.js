/* global self, clients */
// Handler Web Push — IMPORTÉ en tête du service worker généré par Workbox (cf. vite.config.ts,
// workbox.importScripts). Fichier PLAIN JS (pas de build) : il tourne dans le contexte du SW.
//
// Le backend envoie un payload JSON { titre, message, url } (cf. push.service.ts). On affiche une
// notification système et, au clic, on ouvre (ou focalise) l'URL applicative.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // payload non-JSON : on affiche un rappel générique plutôt que rien.
    data = {}
  }
  const titre = data.titre || 'NKONI'
  const options = {
    body: data.message || '',
    // `icon` = grande vignette (couleur) affichée dans la notif → le logo plein convient.
    icon: '/pwa-192x192.png',
    // `badge` = petite icône de la barre d'état : Android n'en garde QUE la forme (alpha) et la
    // recolore. Une tuile PLEINE et opaque (pwa-192) y devient un carré noir. Il faut une silhouette
    // MONOCHROME BLANCHE sur fond TRANSPARENT — cf. public/pwa-badge.svg (source) → pwa-badge.png.
    badge: '/pwa-badge.png',
    data: { url: data.url || '/' },
  }
  event.waitUntil(self.registration.showNotification(titre, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const cible = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
      // Onglet déjà ouvert sur l'app → on le focalise et on y navigue plutôt que d'en ouvrir un autre.
      for (const client of liste) {
        if ('focus' in client) {
          client.navigate(cible)
          return client.focus()
        }
      }
      return clients.openWindow(cible)
    }),
  )
})
