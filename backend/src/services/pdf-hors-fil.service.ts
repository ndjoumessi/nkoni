/**
 * Rendu PDF HORS DU FIL PRINCIPAL (roadmap 2.4, `docs/performance-charge.md` §2.3).
 *
 * PDFKit est SYNCHRONE : pendant le rendu d'un document, la boucle d'événements ne sert personne. Or
 * un seul processus Node sert TOUTES les organisations — mesuré : l'export PDF d'une organisation de
 * 3 000 membres figeait le serveur ~0,7 s pour tous les tenants. Les trois documents dont la taille
 * croît avec l'organisation (contributions, recouvrement, cartes de membre) sont donc rendus dans un
 * `worker_thread` ; les autres PDF (reçu, relevé, compte rendu, rapports agrégés) tiennent en une ou
 * deux pages et restent sur le fil principal.
 *
 * **Seuil** (mesuré sur le module compilé, `docs/performance-charge.md` §2.3) : démarrer un worker coûte
 * ~200 ms (il recharge PDFKit, exceljs…). Un tableau de moins de `SEUIL_LIGNES_HORS_FIL` lignes se rend
 * en moins de ~110 ms sur le fil — plus vite que le worker ne démarre —, il y reste donc. Une PLANCHE
 * de cartes (> 1 carte) part toujours : ~7,5 ms par carte (QR + dessin), soit 2,3 s de serveur figé
 * pour 300 membres.
 *
 * Contrat :
 * - Les générateurs sont PURS (données en entrée, octets en sortie) : le worker ne touche ni Prisma,
 *   ni le contexte d'organisation, ni le réseau. Les données sont lues AVANT, par la route, sous
 *   l'isolation tenant habituelle ; seul le dessin part dans le worker.
 * - Au plus `MAX_WORKERS` rendus simultanés (chaque worker coûte quelques dizaines de Mo) ; les
 *   suivants attendent leur tour.
 * - Si le worker échoue (démarrage impossible, plantage, délai dépassé), le rendu est REJOUÉ sur le
 *   fil principal : l'utilisateur obtient son document, au prix du gel qu'on cherchait à éviter. Le
 *   repli est journalisé en `error` — un repli systématique signalerait un chemin de worker cassé
 *   (le test sur `dist/`, exécuté en CI après le build, est là pour l'attraper avant).
 */
import { Worker } from 'node:worker_threads'
import { extname, join } from 'node:path'
import { genererPdf } from './export.service'
import { genererRecouvrementPdf } from './export-recouvrement.service'
import { genererCartesPdf } from './carte.service'

export type TachePdf =
  | { type: 'contributions'; args: Parameters<typeof genererPdf> }
  | { type: 'recouvrement'; args: Parameters<typeof genererRecouvrementPdf> }
  | { type: 'cartes'; args: Parameters<typeof genererCartesPdf> }

export const MAX_WORKERS = 2
/** En deçà, un tableau (contributions, recouvrement) se rend plus vite sur le fil qu'un worker ne démarre. */
export const SEUIL_LIGNES_HORS_FIL = 1000

/** La tâche justifie-t-elle un worker ? (cf. docblock, seuils mesurés) */
export function doitSortirDuFil(tache: TachePdf): boolean {
  switch (tache.type) {
    case 'contributions':
      return tache.args[0].lignes.length >= SEUIL_LIGNES_HORS_FIL
    case 'recouvrement':
      return tache.args[0].lignes.length >= SEUIL_LIGNES_HORS_FIL
    case 'cartes':
      return tache.args[0].length > 1
    default: {
      const _exhaustif: never = tache
      return _exhaustif
    }
  }
}
const DELAI_MS = 120_000

/**
 * Exécute une tâche SUR LE FIL COURANT — appelé par le worker, et en repli. Le clonage structuré qui
 * transporte la tâche jusqu'au worker transforme les `Buffer` en `Uint8Array` : les photos des cartes
 * sont reconverties, PDFKit ne reconnaissant une image que sous forme de `Buffer`. Sans cela, l'échec
 * serait SILENCIEUX : `carte.service` avale l'erreur d'image et dessine les initiales à la place.
 */
export async function executerTachePdf(tache: TachePdf): Promise<Buffer> {
  switch (tache.type) {
    case 'contributions':
      return genererPdf(...tache.args)
    case 'recouvrement':
      return genererRecouvrementPdf(...tache.args)
    case 'cartes': {
      const [cartes, ...reste] = tache.args
      const rehydratees = cartes.map((c) => (c.photo ? { ...c, photo: Buffer.from(c.photo) } : c))
      return genererCartesPdf(rehydratees, ...reste)
    }
    default: {
      const _exhaustif: never = tache
      throw new Error(`Tâche PDF inconnue : ${JSON.stringify(_exhaustif)}`)
    }
  }
}

/** Code d'amorçage du worker : le module compilé en production, le TypeScript via `tsx` ailleurs. */
function amorcage(): string {
  const module = join(__dirname, `pdf-hors-fil.worker${extname(__filename)}`)
  const chargeur = extname(__filename) === '.ts' ? "require('tsx/cjs');" : ''
  return `${chargeur} require(${JSON.stringify(module)})`
}

function rendreDansWorker(tache: TachePdf): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(amorcage(), { eval: true })
    const minuteur = setTimeout(() => {
      void worker.terminate()
      reject(new Error(`rendu PDF hors fil : délai de ${DELAI_MS} ms dépassé`))
    }, DELAI_MS)
    const finir = () => {
      clearTimeout(minuteur)
      void worker.terminate()
    }
    worker.once('message', (m: { ok: true; pdf: Uint8Array } | { ok: false; erreur: string }) => {
      finir()
      if (m.ok) resolve(Buffer.from(m.pdf.buffer, m.pdf.byteOffset, m.pdf.byteLength))
      else reject(new Error(m.erreur))
    })
    worker.once('error', (err) => {
      finir()
      reject(err)
    })
    worker.once('exit', (code) => {
      clearTimeout(minuteur)
      if (code !== 0) reject(new Error(`worker PDF terminé avec le code ${code}`))
    })
    worker.postMessage(tache)
  })
}

/** Sémaphore minimal : au plus `MAX_WORKERS` rendus simultanés. */
let enCours = 0
const enAttente: (() => void)[] = []
async function avecPlace<T>(fn: () => Promise<T>): Promise<T> {
  if (enCours >= MAX_WORKERS) await new Promise<void>((r) => enAttente.push(r))
  enCours++
  try {
    return await fn()
  } finally {
    enCours--
    enAttente.shift()?.()
  }
}

/** Journal du repli, injectable pour les tests (défaut : `console.error`, lu dans les logs Railway). */
export type JournalRepli = (message: string, err: unknown) => void

/**
 * Rend un PDF dans un worker si sa taille le justifie (`doitSortirDuFil`), sur le fil sinon ; rejoue
 * sur le fil principal si le worker échoue (cf. docblock).
 */
export async function genererPdfHorsFil(
  tache: TachePdf,
  journal: JournalRepli = (message, err) => console.error(message, err),
): Promise<Buffer> {
  if (!doitSortirDuFil(tache)) return executerTachePdf(tache)
  try {
    return await avecPlace(() => rendreDansWorker(tache))
  } catch (err) {
    journal(`[pdf-hors-fil] échec du worker (${tache.type}), rendu sur le fil principal`, err)
    return executerTachePdf(tache)
  }
}
