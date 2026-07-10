/**
 * Normalisation des numéros de téléphone au format E.164 SANS le « + » (ce qu'attend l'API
 * WhatsApp Cloud, ex. `2376XXXXXXXX`).
 *
 * Défaut : Cameroun (indicatif `237`, mobile = 9 chiffres commençant par 6). L'indicatif est
 * un PARAMÈTRE (`prefixePays`) pour un futur multi-pays ; la règle d'abonné local reste, pour
 * l'instant, celle du Cameroun (à externaliser quand d'autres pays seront supportés).
 *
 * Renvoie `null` si le numéro ne peut pas être normalisé de façon fiable → l'appelant
 * n'envoie PAS (mieux vaut ne rien envoyer qu'envoyer à un mauvais numéro).
 */

const INDICATIF_CAMEROUN = '237'

/** Abonné mobile camerounais valide : 9 chiffres commençant par 6 (6XXXXXXXX). */
function estAbonneLocalValide(chiffres: string): boolean {
  return chiffres.length === 9 && chiffres.startsWith('6')
}

/**
 * Normalise un numéro brut vers E.164 sans « + ». Cas gérés :
 *  - déjà international (`237…`, éventuellement précédé de `+` ou `00`) → conservé si valide ;
 *  - local (`6XXXXXXXX`) → préfixé par l'indicatif → `2376XXXXXXXX` ;
 *  - espaces, tirets, points, parenthèses → nettoyés ;
 *  - tout le reste (trop court, mauvais format…) → `null` (pas d'envoi).
 */
export function normaliserTelephone(
  brut: string | null | undefined,
  prefixePays: string = INDICATIF_CAMEROUN,
): string | null {
  if (!brut) return null

  // Ne garder que les chiffres : supprime espaces, tirets, points, parenthèses ET le « + ».
  let chiffres = brut.replace(/\D/g, '')
  if (!chiffres) return null

  // Préfixe d'appel international « 00 » (équivalent du « + ») → on le retire.
  if (chiffres.startsWith('00')) chiffres = chiffres.slice(2)

  // Déjà international : commence par l'indicatif pays → on valide l'abonné qui suit.
  if (chiffres.startsWith(prefixePays)) {
    const abonne = chiffres.slice(prefixePays.length)
    return estAbonneLocalValide(abonne) ? chiffres : null
  }

  // Local : abonné mobile seul → on préfixe l'indicatif pays.
  if (estAbonneLocalValide(chiffres)) return prefixePays + chiffres

  return null
}
