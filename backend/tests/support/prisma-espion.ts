/**
 * Enveloppe un client Prisma (étendu) en surchargeant quelques opérations de modèle, tout le reste
 * passant au client réel avec son `this`. Sert aux tests d'intégration exécutés en parallèle sur une
 * base PARTAGÉE : restreindre ce qu'une fonction globale « voit » à SES propres organisations, ou
 * provoquer une panne au milieu d'un traitement.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SurchargesPrisma = Record<string, Record<string, (original: (args: any) => Promise<any>, args: any) => Promise<any>>>

export function envelopperPrisma<T extends object>(client: T, surcharges: SurchargesPrisma): T {
  return new Proxy(client, {
    get(cible, prop, recepteur) {
      const valeur = Reflect.get(cible, prop, recepteur)
      const parModele = typeof prop === 'string' ? surcharges[prop] : undefined
      if (parModele && valeur && typeof valeur === 'object') {
        return new Proxy(valeur as object, {
          get(modele, operation, r) {
            const originale = Reflect.get(modele, operation, r)
            const surcharge = typeof operation === 'string' ? parModele[operation] : undefined
            if (surcharge && typeof originale === 'function') {
              return (args: any) => surcharge((a: any) => originale.call(modele, a), args)
            }
            return typeof originale === 'function' ? originale.bind(modele) : originale
          },
        })
      }
      return typeof valeur === 'function' ? valeur.bind(cible) : valeur
    },
  })
}
/* eslint-enable @typescript-eslint/no-explicit-any */
