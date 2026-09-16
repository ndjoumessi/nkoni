import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

/**
 * Garde-fou d'ISOLATION au niveau SOURCE (audit archi, défense en profondeur).
 *
 * `orgContext.runUnscoped(fn)` DÉSACTIVE délibérément le scoping tenant de l'extension Prisma —
 * c'est le bypass prévu pour les flux SANS organisation (login/refresh, console plateforme
 * SUPER_ADMIN, résolution d'un lien PUBLIC signé, auto-inscription). Légitime, mais dangereux
 * s'il prolifère sans revue : un `runUnscoped` posé par erreur autour d'une requête métier
 * rouvrirait l'accès cross-tenant SANS que rien n'échoue (les commentaires ne sont pas un
 * garde-fou exécutable).
 *
 * Ce test ÉNUMÈRE tous les appels au niveau source et exige une PARITÉ STRICTE avec l'allowlist
 * ci-dessous : tout appel supplémentaire (nouveau fichier OU appel de plus dans un fichier connu)
 * fait ÉCHOUER le build tant qu'un relecteur ne l'a pas inscrit ici en le justifiant. Pendant du
 * test de parité `SCOPED_MODELS ↔ schéma` (tenant-scoped-models.test.ts), côté APPELANTS.
 */

const SRC = join(__dirname, '../src')

/**
 * Allowlist APPROUVÉE : fichier (chemin relatif à `src/`) → nombre d'appels `runUnscoped` attendus.
 * Chaque entrée est un bypass d'isolation REVU et justifié. Mettre à jour ce Set N'EST PAS anodin :
 * c'est acter qu'un nouvel accès hors-tenant est légitime.
 */
const APPROUVES: Record<string, number> = {
  // Authentification AVANT tout contexte org : login (email → user + org active), refresh
  // (jti → user), reset, réhydratation. Aucune org connue au moment de la lecture. 8 appels.
  'routes/auth.route.ts': 8,
  // Console PLATEFORME (SUPER_ADMIN transverse, §2.3) : liste / lecture / attribution de forfait
  // d'organisations — par nature hors d'un tenant unique. 3 appels.
  // + EXPORT et SUPPRESSION DÉFINITIVE d'une organisation (bloquant GA 0.3) : 2 appels de plus,
  // UN SEUL par handler, enveloppant tout le flux (lecture des 26 modèles scopés, transaction de
  // purge, collecte des ids d'utilisateurs). Bypass INDISPENSABLE — le SUPER_ADMIN n'a pas de
  // claim `organisationId`, l'extension d'isolation fail-close sinon dès la première lecture.
  // ⚠️ CONTREPARTIE : l'isolation ne protège plus rien à l'intérieur. C'est le service
  // `organisation-purge.service.ts` qui construit lui-même chaque `where.organisationId` (un
  // `deleteMany({})` y effacerait TOUTES les organisations), et un test unitaire dédié vérifie
  // que chaque suppression est scopée.
  // + JOURNAL D'AUDIT PLATEFORME (dette 0.3) : lecture de la vue « Historique » (GET
  // /platform/audit-log). Le journal est TRANSVERSE — aucun tenant n'en est propriétaire (il
  // référence l'org ciblée par un snapshot scalaire `organisationCibleId`, SANS relation, hors
  // `SCOPED_MODELS`) — donc l'accès hors-tenant est légitime. Les ÉCRITURES de trace (à chaque
  // action) N'ajoutent PAS d'appel : elles sont imbriquées dans les `runUnscoped` déjà comptés
  // ci-dessus. + PROLONGATION du forfait (spec 1.1 §3.1) : lecture de l'échéance, écriture
  // CONDITIONNELLE et trace dans un seul appel (même justification : pas de contexte org pour le
  // SUPER_ADMIN, `Organisation` lue par id). + GARDE DÉMO (spec 2026-09-15 §1.7) : lecture de
  // `estDemo` par id avant toute action console — même justification. 8 appels au total.
  'routes/platform.route.ts': 8,
  // Lien PUBLIC signé — carte de statut (§4.7) : résolution de l'org du membre AVANT `orgContext.run`.
  'routes/cartes.route.ts': 1,
  // Lien PUBLIC signé — reçu PDF public (§4.6) : résolution de l'org du reçu, idem.
  'routes/recus.route.ts': 1,
  // Auto-inscription (§3.1) : création de l'organisation + son admin fondateur, aucun contexte encore.
  'routes/organisations.route.ts': 1,
  // Webhook PSP PUBLIC (§ paiement) : résolution de l'org du Paiement à partir du transId AVANT
  // `orgContext.run` — le webhook n'est pas authentifié et ne porte aucun claim org. Bypass nécessaire,
  // borné à la seule résolution ; la confirmation ensuite tourne DANS le contexte org du Paiement.
  'routes/paiements.route.ts': 1,
  // Espace de démonstration PUBLIC (spec 2026-09-15 §1.2) : résolution de l'organisation démo et de
  // son compte ADMIN AVANT toute session — aucune org connue au moment de la lecture. Le jeton émis
  // porte `demo: true`, qui interdit toute écriture (`authenticate`).
  'routes/demo.route.ts': 1,
  // Espace de démonstration — suppression d'une ancienne démo (spec 2026-09-15 §3.2) : export puis
  // transaction de purge d'une organisation hors de tout tenant, UN seul appel enveloppant tout le flux.
  // Même contrepartie que la purge plateforme (l'isolation ne protège plus rien à l'intérieur) : chaque
  // `deleteMany` est scopé par `supprimerDonneesOrganisation`, et la nature de démo est relue dans la
  // transaction par une écriture conditionnelle.
  'services/demo-suppression.service.ts': 1,
  // Espace de démonstration — génération (spec 2026-09-15 §3.1) : création de l'organisation et de son
  // compte ADMIN par `inscrireOrganisation`, AVANT qu'aucun tenant n'existe (même justification que
  // l'auto-inscription). Tout le remplissage tourne ensuite sous `orgContext.run`.
  'services/demo-generateur.service.ts': 1,
}

/** Liste récursivement les fichiers `.ts` de `src/`, en EXCLUANT le client Prisma généré. */
function fichiersTs(dir: string): string[] {
  const out: string[] = []
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom)
    if (statSync(p).isDirectory()) {
      if (nom === 'generated') continue // client Prisma régénéré (gitignoré) — hors périmètre
      out.push(...fichiersTs(p))
    } else if (nom.endsWith('.ts')) {
      out.push(p)
    }
  }
  return out
}

describe('Isolation multi-tenant — allowlist des bypass `runUnscoped` (audit archi)', () => {
  it('tout appel `runUnscoped` au niveau source est explicitement approuvé (parité stricte)', () => {
    const observes: Record<string, number> = {}
    for (const f of fichiersTs(SRC)) {
      // On compte les APPELS `.runUnscoped(` (le point exclut la DÉFINITION `runUnscoped<T>(` de
      // org-context.ts) ; les simples mentions en prose (« accès en runUnscoped ») ne matchent pas.
      const n = (readFileSync(f, 'utf8').match(/\.runUnscoped\s*\(/g) ?? []).length
      if (n > 0) observes[relative(SRC, f).split(sep).join('/')] = n
    }
    expect(
      observes,
      'Un appel `runUnscoped` non approuvé a été détecté (ou un appel connu a changé de compte). ' +
        'C’est un BYPASS d’isolation tenant : vérifie qu’il est légitime, puis mets à jour APPROUVES.',
    ).toEqual(APPROUVES)
  })
})
