import {
  ApiError,
  estModeDemo,
  messageErreur,
  versementsApi,
  membresApi,
  type VersementInput,
  type MembreInput,
} from './api'
import { enfiler, listerFile, retirerDeLaFile, marquerErreur, type TypeMutation, type MutationEnAttente } from './offline-queue'

/**
 * Rejeu de la file de mutations hors-ligne (§ PWA). Chaque mutation est renvoyée au backend AVEC
 * sa clé d'idempotence (pas de doublon). Distinction cruciale :
 *   - échec CLIENT (ApiError : 4xx/conflit/validation) → la mutation est MARQUÉE en erreur (elle ne
 *     passera jamais telle quelle) et signalée à l'utilisateur, sans perdre la saisie ;
 *   - échec RÉSEAU (rejet fetch : hors-ligne) → on ARRÊTE (toujours pas de réseau) et on réessaiera.
 */

/** Réponse serveur reçue (ApiError) = erreur client ; rejet fetch = erreur réseau. */
export function classifierEchec(e: unknown): 'reseau' | 'client' {
  return e instanceof ApiError ? 'client' : 'reseau'
}

/**
 * Écriture OPTIMISTE : tente l'appel réseau ; si hors-ligne (navigator.onLine faux OU rejet fetch),
 * ENFILE la mutation pour rejeu ultérieur et renvoie `{ enFile: true }`. Une erreur CLIENT (4xx)
 * remonte au formulaire (la saisie est invalide, pas la peine de l'enfiler).
 */
export async function soumettreOuEnfiler<T>(
  type: TypeMutation,
  payload: unknown,
  appel: () => Promise<T>,
): Promise<{ enFile: boolean; resultat?: T }> {
  // Démo : rien à mettre en file (lecture seule) — l'appel part au client, qui le refuse localement.
  if (estModeDemo()) return { enFile: false, resultat: await appel() }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enfiler(type, payload)
    return { enFile: true }
  }
  try {
    return { enFile: false, resultat: await appel() }
  } catch (e) {
    if (classifierEchec(e) === 'reseau') {
      await enfiler(type, payload)
      return { enFile: true }
    }
    throw e // erreur client → laissée au formulaire
  }
}

async function appliquer(m: MutationEnAttente, accessToken: string): Promise<void> {
  if (m.type === 'versement') {
    await versementsApi.create(m.payload as VersementInput, accessToken, m.cleIdempotence)
  } else {
    await membresApi.create(m.payload as MembreInput, accessToken, m.cleIdempotence)
  }
}

/** Rejoue les mutations en attente (dans l'ordre). Renvoie le nombre de réussites / d'échecs client. */
export async function synchroniser(accessToken: string): Promise<{ reussis: number; echecs: number }> {
  // Démo : ne jamais rejouer la file RÉELLE de ce navigateur avec un jeton démo.
  if (estModeDemo()) return { reussis: 0, echecs: 0 }
  const file = await listerFile()
  let reussis = 0
  let echecs = 0
  for (const m of file) {
    if (m.erreur) continue // déjà bloquée par un échec client → laissée pour correction manuelle
    // Revue I5 : la démo peut démarrer PENDANT la boucle (garde d'entrée déjà franchie). Les
    // mutations restantes seraient refusées localement (403 → classé « client ») et marquées en
    // erreur à tort : on s'arrête, elles seront rejouées après la sortie de démo.
    if (estModeDemo()) break
    try {
      await appliquer(m, accessToken)
      await retirerDeLaFile(m.id)
      reussis++
    } catch (e) {
      if (estModeDemo()) break // échec survenu sous la démo : jamais imputé à la mutation
      if (classifierEchec(e) === 'client') {
        await marquerErreur(m.id, e instanceof ApiError ? e.message : messageErreur(e))
        echecs++
      } else {
        break // réseau → on s'arrête, la synchro reprendra au prochain retour en ligne
      }
    }
  }
  return { reussis, echecs }
}
