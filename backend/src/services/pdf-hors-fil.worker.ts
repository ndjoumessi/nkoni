/**
 * Worker de rendu PDF (cf. `pdf-hors-fil.service.ts`) : reçoit UNE tâche, renvoie les octets, se
 * termine. Aucun accès à la base ni au contexte d'organisation — les données arrivent déjà lues.
 */
import { parentPort } from 'node:worker_threads'
import { executerTachePdf, type TachePdf } from './pdf-hors-fil.service'

parentPort?.once('message', (tache: TachePdf) => {
  executerTachePdf(tache).then(
    (pdf) => {
      // Copie dans un tampon PROPRE avant transfert : un petit `Buffer` peut partager le pool
      // interne de Node, qu'il ne faut pas détacher.
      const octets = new Uint8Array(pdf)
      parentPort?.postMessage({ ok: true, pdf: octets }, [octets.buffer])
    },
    (err: unknown) => {
      parentPort?.postMessage({ ok: false, erreur: err instanceof Error ? err.message : String(err) })
    },
  )
})
