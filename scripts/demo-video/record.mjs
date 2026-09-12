// Tournage de la vidéo de démonstration (page d'accueil) — parcours SCRIPTÉ sur une base FICTIVE.
//
// Prérequis : `reset-db.sh` + `seed.mjs` exécutés, backend de démo sur :3100, frontend sur :5310.
// Produit, par prise (trésorière, puis membre), une suite d'images JPEG horodatées + un fichier
// `images.ffconcat` que `build-video.sh` assemble en vidéo.
//
// Pourquoi pas `recordVideo` de Playwright : il enregistre en pixels CSS (390×844) et COMPLÈTE le
// cadre demandé avec du gris au lieu d'agrandir — texte flou sur un écran Retina, pour une interface
// faite de montants. `Page.startScreencast` (CDP) a le même plafond en mode sans fenêtre. On capture
// donc en rafale par `Page.captureScreenshot` avec `clip.scale = 2` (780×1688, ~27 img/s mesurés).
// ⚠️ `clip` est en coordonnées DOCUMENT : sans l'ajout de la position de défilement, une page
// défilée donne une image vide (zone non peinte). La capture ne démarre qu'une fois l'écran chargé :
// ni saisie d'identifiants ni squelette de chargement à l'image.
//
// Usage : OUT=/chemin/sortie node scripts/demo-video/record.mjs
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { ADMIN, MEMBRE } from './comptes.mjs'

const FRONT = process.env.FRONT ?? 'http://localhost:5310'
const OUT = process.env.OUT ?? new URL('./out', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const LARGEUR = 390
const HAUTEUR = 844

// Injecté dans chaque page : un indicateur de toucher (Playwright n'affiche aucun curseur, les
// actions sembleraient se produire toutes seules) et une bande de légende en bas d'écran.
const HABILLAGE = () => {
  const style = document.createElement('style')
  style.textContent = `
    .demo-touche { position: fixed; z-index: 2147483647; width: 44px; height: 44px; margin: -22px 0 0 -22px;
      border-radius: 50%; background: oklch(0.82 0.13 165 / 0.35); border: 2px solid oklch(0.86 0.14 165 / 0.9);
      pointer-events: none; animation: demo-touche 650ms ease-out forwards; }
    @keyframes demo-touche { from { transform: scale(0.4); opacity: 1 } to { transform: scale(1.5); opacity: 0 } }
    .demo-legende { position: fixed; z-index: 2147483646; left: 16px; right: 16px; bottom: 22px; padding: 12px 16px;
      border-radius: 16px; background: oklch(0.18 0.02 250 / 0.97); border: 1px solid oklch(0.82 0.13 165 / 0.45);
      color: #f4f7f5; font: 600 15px/1.35 Geist, system-ui, sans-serif; text-align: center;
      box-shadow: 0 10px 30px oklch(0 0 0 / 0.45);
      transition: opacity 260ms ease, transform 260ms ease; opacity: 0; transform: translateY(8px); pointer-events: none; }
    .demo-legende.visible { opacity: 1; transform: none; }`
  const monter = () => {
    document.head.appendChild(style)
    const legende = document.createElement('div')
    legende.className = 'demo-legende'
    legende.setAttribute('aria-hidden', 'true')
    document.body.appendChild(legende)
    window.__legende = (texte) => {
      legende.classList.remove('visible')
      setTimeout(() => { if (texte) { legende.textContent = texte; legende.classList.add('visible') } }, texte ? 180 : 0)
    }
    addEventListener('pointerdown', (e) => {
      const rond = document.createElement('div')
      rond.className = 'demo-touche'
      rond.style.left = `${e.clientX}px`
      rond.style.top = `${e.clientY}px`
      document.body.appendChild(rond)
      setTimeout(() => rond.remove(), 700)
    }, true)
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', monter)
  else monter()
}

// GPU : sans ces options, Chrome sans fenêtre dessine en LOGICIEL (SwiftShader) — mesuré 15,9 img/s
// contre 21,4 avec Metal sur Apple M1. Sur une machine sans GPU compatible, Chrome retombe sur le
// rendu logiciel : la vidéo reste correcte, simplement moins fluide.
const browser = await chromium.launch({
  args: ['--enable-gpu', '--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
})

async function prise(nom, compte, pret, scenes, echauffement) {
  const context = await browser.newContext({
    viewport: { width: LARGEUR, height: HAUTEUR },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'fr-FR',
    timezoneId: 'Africa/Douala',
    colorScheme: 'dark',
    reducedMotion: 'no-preference',
  })
  await context.addInitScript(HABILLAGE)
  const page = await context.newPage()
  const pause = (ms) => page.waitForTimeout(ms)
  const legende = (texte) => page.evaluate((t) => window.__legende?.(t), texte)
  const toucher = async (locator) => {
    await locator.scrollIntoViewIfNeeded()
    await pause(250)
    await locator.tap()
  }
  const defiler = (y) => page.evaluate((top) => window.scrollTo({ top, behavior: 'smooth' }), y)

  await page.goto(`${FRONT}/login`)
  await page.fill('input[type=email]', compte.email)
  await page.fill('input[type=password]', compte.password)
  await page.click('button[type=submit]')
  await pret(page)
  // Préchauffage HORS caméra : les pages sont chargées à la demande (lazy) ; sans ce passage, la
  // première visite de « Membres » filmait ~1 s d'écran noir pendant le téléchargement du module.
  if (echauffement) {
    await echauffement(page)
    await pret(page)
  }

  // Rafale de captures, en parallèle des actions du scénario.
  const dossier = join(OUT, nom)
  rmSync(dossier, { recursive: true, force: true })
  mkdirSync(dossier, { recursive: true })
  const cdp = await context.newCDPSession(page)
  const images = []
  let actif = true
  const rafale = (async () => {
    while (actif) {
      const { cssVisualViewport: vv } = await cdp.send('Page.getLayoutMetrics')
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'jpeg', quality: 90, optimizeForSpeed: true,
        clip: { x: vv.pageX, y: vv.pageY, width: LARGEUR, height: HAUTEUR, scale: 2 },
      })
      // Écriture DIFFÉRÉE : un writeFileSync par image dans la boucle faisait tomber la cadence
      // de 27 à 16 img/s (défilements saccadés). ~600 images JPEG tiennent en mémoire.
      images.push({ fichier: `${String(images.length).padStart(5, '0')}.jpg`, data, t: Date.now() })
    }
  })()

  await scenes({ page, pause, legende, toucher, defiler })
  actif = false
  await rafale
  await context.close()
  for (const img of images) writeFileSync(join(dossier, img.fichier), Buffer.from(img.data, 'base64'))

  // Durée RÉELLE de chaque image (cadence variable) → la vidéo garde le rythme du scénario.
  const lignes = ['ffconcat version 1.0']
  images.forEach((img, i) => {
    const suivante = images[i + 1]?.t ?? img.t + 40
    lignes.push(`file '${img.fichier}'`, `duration ${((suivante - img.t) / 1000).toFixed(3)}`)
  })
  lignes.push(`file '${images.at(-1).fichier}'`)
  writeFileSync(join(dossier, 'images.ffconcat'), lignes.join('\n') + '\n')
  const duree = (images.at(-1).t - images[0].t) / 1000
  console.log(`✓ ${nom} : ${images.length} images, ${duree.toFixed(1)} s, ${(images.length / duree).toFixed(1)} img/s`)
}

// ── Prise 1 : la trésorière ────────────────────────────────────────────────────────────────
const tableauDeBordPret = async (page) => {
  await page.waitForURL('**/dashboard')
  await page.getByText('Recouvré', { exact: false }).first().waitFor()
}
await prise('tresoriere', ADMIN, tableauDeBordPret, async ({ page, pause, legende, toucher, defiler }) => {
  await pause(600)
  await legende('Le recouvrement de l’association, en un coup d’œil')
  await pause(3600)

  const relance = page.getByRole('link', { name: 'Relancer par WhatsApp' }).first()
  const y = await relance.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 260)
  await defiler(y)
  await legende('Les retards repérés, relancés en un geste')
  await pause(3400)

  await legende('')
  await defiler(0)
  await pause(900)
  await toucher(page.getByRole('button', { name: 'Ouvrir le menu' }))
  await pause(700)
  await toucher(page.locator('a[href="/membres"]:visible', { hasText: 'Membres' }).first())
  await page.locator('a:visible', { hasText: 'Ngono' }).first().waitFor()
  await legende('Chaque membre, son statut')
  await pause(2000)
  await toucher(page.locator('a:visible', { hasText: 'Ngono' }).first())
  await page.getByRole('link', { name: 'Saisir un versement' }).waitFor()
  await pause(1500)

  await legende('La trésorière enregistre un versement…')
  await toucher(page.getByRole('link', { name: 'Saisir un versement' }))
  await page.getByRole('button', { name: 'Enregistrer le versement' }).waitFor()
  await pause(900)
  const montant = page.locator('input:visible').first()
  await toucher(montant)
  await montant.pressSequentially('15000', { delay: 110 })
  await pause(500)
  const mode = page.locator('select:visible').nth(1)
  await toucher(mode)
  await mode.selectOption('MOBILE_MONEY')
  await pause(700)
  await toucher(page.getByRole('button', { name: 'Enregistrer le versement' }))
  await pause(2600)

  await legende('…et le reçu est émis')
  await toucher(page.getByRole('button', { name: 'Générer le reçu' }))
  await pause(3000)
  await legende('')
  await pause(300)
}, async (page) => {
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  await page.locator('a[href="/membres"]:visible', { hasText: 'Membres' }).first().click()
  await page.locator('a:visible', { hasText: 'Ngono' }).first().click()
  await page.getByRole('link', { name: 'Saisir un versement' }).click()
  await page.getByRole('button', { name: 'Enregistrer le versement' }).waitFor()
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click()
  await page.locator('a[href="/dashboard"]:visible').first().click()
  await page.evaluate(() => window.scrollTo(0, 0))
})

// ── Prise 2 : le membre ────────────────────────────────────────────────────────────────────
const monEspacePret = async (page) => {
  await page.waitForURL('**/mon-espace')
  await page.getByText('Ma situation', { exact: false }).first().waitFor()
}
await prise('membre', MEMBRE, monEspacePret, async ({ page, pause, legende, defiler }) => {
  await pause(600)
  await legende('Le membre voit aussitôt qu’il est à jour')
  await pause(2800)
  const progression = page.getByText('Vous êtes à jour de vos cotisations', { exact: false }).first()
  const y1 = await progression.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 420)
  await defiler(y1)
  await pause(2200)
  const carte = page.getByText('Ma carte de membre', { exact: false }).first()
  const y2 = await carte.evaluate((el) => el.getBoundingClientRect().top + window.scrollY - 90)
  await defiler(y2)
  await legende('NKONI — la transparence, pour chaque membre')
  await pause(3600)
})

await browser.close()
