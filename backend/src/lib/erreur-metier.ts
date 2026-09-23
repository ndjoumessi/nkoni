import type { Langue } from './i18n'
import type { CleMessage } from '../locales/fr'

/**
 * Base des refus MÉTIER — ceux qui doivent atteindre l'utilisateur avec un statut 4xx et un message
 * traduit, par opposition aux pannes, qui sont des 5xx et ne disent rien au client.
 *
 * **Pourquoi le statut et la clé vivent ICI et pas dans la route** (ADR-0001) : ils y étaient
 * recopiés dans 26 modules route sur 38 — 96 `instanceof`, 11 copies du même helper — si bien que
 * lire UNE erreur demandait trois fichiers, et qu'un refus non mappé retombait en 500 opaque
 * (défaut vécu deux fois en production). Le choix repose sur une mesure, pas sur un goût : les 61
 * classes mappées ont chacune un statut unique, donc le mappage est une fonction de la CLASSE et
 * jamais du couple (classe, route).
 *
 * L'interface que l'appelant doit apprendre se réduit alors à un mot : `throw`. C'est le
 * gestionnaire d'erreur global (`app.ts`) qui rend la réponse ; un handler n'a plus rien à savoir
 * de HTTP.
 *
 * **Une erreur de service n'est pas forcément une erreur HTTP** : les refus de la tâche de nuit
 * (rétention, suppression de démo) n'atteignent jamais une route et n'héritent donc pas d'ici —
 * les forcer dans un moule HTTP leur donnerait un statut qui ne veut rien dire.
 */
export abstract class ErreurMetier extends Error {
  /** Statut HTTP du refus. Toujours 4xx : un 5xx n'est pas un refus mais une panne. */
  readonly statut: number
  /** Clé du message rendu à l'utilisateur. Typée : une clé inexistante ne compile pas. */
  readonly cleMessage: CleMessage

  /**
   * @param messageDev message technique, pour les logs et le débogage. **Jamais renvoyé au
   * client** — c'est `cleMessage` qui sert à ça, traduit dans la langue du lecteur.
   */
  constructor(statut: number, cleMessage: CleMessage, messageDev: string) {
    super(messageDev)
    // `new.target` : le nom de la sous-classe réellement construite, sans avoir à le recopier.
    this.name = new.target.name
    this.statut = statut
    this.cleMessage = cleMessage
  }

  /**
   * Paramètres d'interpolation du message, si le message en attend.
   *
   * Reçoit la LANGUE, et ce n'est pas de la précaution : certains paramètres se formatent avec elle
   * (`formatTailleOctets` rend « 500 Mo » ou « 500 MB »). Les figer au constructeur produirait un
   * message à moitié traduit. Les sous-classes qui n'interpolent rien ne redéfinissent rien.
   */
  parametres(_langue: Langue): Record<string, string | number> | undefined {
    return undefined
  }
}
