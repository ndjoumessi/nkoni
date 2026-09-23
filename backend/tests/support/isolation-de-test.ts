/* eslint-disable @typescript-eslint/no-explicit-any */
import { intercepterTenant } from '../../src/lib/tenant-extension'

/**
 * DÉPLACE LE SEAM DE TEST : fait passer un mock Prisma par la VRAIE extension d'isolation.
 *
 * Le problème que ça ferme (revue d'architecture, candidat 5) : `buildApp({ prisma: mock })`
 * injecte le mock SOUS les extensions de `lib/prisma.ts`. Injecter un mock retire donc
 * l'isolation multi-tenant du système testé — et un test de route qui affirme un 404 cross-org
 * affirme en réalité le comportement de son propre mock, pas celui de l'extension.
 *
 * Ce qui rend l'enveloppe possible sans réécrire quoi que ce soit : `intercepterTenant` est déjà
 * un CŒUR INTERCEPTABLE, une fonction pure `(base, { model, operation, args, query })`. Le seam
 * existait dans le code de production ; il n'était simplement branché nulle part côté test. Le
 * proxy ci-dessous se contente de l'appeler, avec le mock en guise de `query` ET de `base` (ce
 * dernier ne sert qu'à la pré-lecture d'appartenance des update/delete/upsert).
 *
 * **Ce n'est PAS un client Prisma en mémoire.** Le mock reste celui du test : c'est lui qui décide
 * ce que `findMany` rend. Ce que l'enveloppe ajoute, c'est que le `where` injecté, le post-filtre
 * de `findUnique`, le forçage d'`organisationId` sur les `create` et le fail-close hors contexte
 * sont ceux de la PRODUCTION.
 *
 * **Corollaire à connaître avant d'adopter** : les lignes du mock doivent porter `organisationId`,
 * et le test doit s'exécuter dans un contexte d'organisation — sinon l'extension fail-close, ce
 * qui est exactement son travail. Un mock qui ne les porte pas révèle, en échouant, qu'il ne
 * testait pas l'isolation.
 */

/** Un délégué de modèle : un objet dont les valeurs sont des fonctions (findMany, create…). */
function estDelegue(valeur: unknown): boolean {
  return (
    !!valeur &&
    typeof valeur === 'object' &&
    Object.values(valeur as object).some((v) => typeof v === 'function')
  )
}

/** 'membre' → 'Membre' (le nom de modèle qu'attend `SCOPED_MODELS`). */
function nomModele(accesseur: string): string {
  return accesseur.charAt(0).toUpperCase() + accesseur.slice(1)
}

export function avecIsolation<T extends object>(mock: T): T {
  const enveloppe = new Proxy(mock, {
    get(cible, prop, recepteur) {
      const valeur = Reflect.get(cible, prop, recepteur)

      // `$transaction` interactif : le `tx` remis au callback doit être enveloppé LUI AUSSI,
      // sinon toutes les écritures transactionnelles échappent à l'isolation — c'est-à-dire la
      // majorité des écritures métier de ce dépôt.
      if (prop === '$transaction' && typeof valeur === 'function') {
        return (arg: any, ...reste: any[]) =>
          typeof arg === 'function'
            ? valeur.call(cible, (tx: any) => arg(avecIsolation(tx)), ...reste)
            : valeur.call(cible, arg, ...reste)
      }

      if (typeof prop !== 'string' || prop.startsWith('$') || !estDelegue(valeur)) {
        return typeof valeur === 'function' ? valeur.bind(cible) : valeur
      }

      const model = nomModele(prop)
      return new Proxy(valeur as object, {
        get(delegue, operation, r) {
          const impl = Reflect.get(delegue, operation, r)
          if (typeof operation !== 'string' || typeof impl !== 'function') return impl
          return (args: any) =>
            intercepterTenant(enveloppe, {
              model,
              operation,
              args,
              query: async (a: any) => impl.call(delegue, a),
            })
        },
      })
    },
  })
  return enveloppe
}
