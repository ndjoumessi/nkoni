import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GARDE DE PARITÉ — toute classe d'erreur d'un service étend `ErreurMetier` (ADR-0001).
 *
 * Pourquoi un garde TEXTUEL et pas un type : rien dans TypeScript n'oblige une nouvelle classe à
 * hériter d'une base. Écrire `class XError extends Error` compile parfaitement — et le défaut ne
 * se voit qu'en production, sous la forme d'un 500 opaque là où l'utilisateur attendait un refus
 * lisible. C'est arrivé DEUX fois (cf. CLAUDE.md § reçus), avant que la table de mappage ne soit
 * portée par les classes.
 *
 * Le garde vaut par son EXCEPTION, pas par sa règle : la liste ci-dessous énumère les erreurs de
 * service qui, délibérément, ne sont PAS des refus HTTP. Y ajouter une entrée demande d'écrire
 * pourquoi — c'est le seul moment où quelqu'un se pose la question.
 */

const DOSSIER = join(__dirname, '..', 'src', 'services')

/**
 * Erreurs de service qui n'héritent PAS d'`ErreurMetier`, et la raison de chacune.
 *
 * Deux familles seulement :
 *   - celles qu'aucune route ne peut atteindre (tâches de nuit) : un statut HTTP ne voudrait
 *     rien dire pour elles ;
 *   - celles qui ne sont pas des REFUS mais des PANNES (5xx) : `ErreurMetier` est 4xx par
 *     construction, et son propre test l'affirme.
 */
const HORS_FRONTIERE_HTTP: Record<string, string> = {
  // Tâche de nuit — la régénération de la démo, jamais une requête.
  'demo-suppression.service.ts': 'OrganisationNonDemoError',
  // Tâche de nuit — la purge de rétention refuse si l'horloge dérive. Personne n'attend sa réponse.
  'retention.service.ts': 'RetentionRefuseeError',
  // 503 : `PSP_ENCRYPTION_KEY` absente est une PANNE de configuration, pas un refus métier.
  // ADR-0001 l'exclut par ses propres termes (« un 5xx n'est pas un refus mais une panne »).
  'parametre-paiement.service.ts': 'ChiffrementIndisponibleError',
}

/** Toutes les déclarations `class <X>Error extends <Base>` d'un fichier. */
function classesErreur(source: string): { nom: string; base: string }[] {
  return [...source.matchAll(/class\s+(\w*Error)\s+extends\s+(\w+)/g)].map((m) => ({
    nom: m[1]!,
    base: m[2]!,
  }))
}

describe('parité — les erreurs de service portent leur statut et leur clé', () => {
  const fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.service.ts'))

  it('inspecte réellement des classes (le garde n’est pas vacant)', () => {
    const total = fichiers.reduce(
      (n, f) => n + classesErreur(readFileSync(join(DOSSIER, f), 'utf8')).length,
      0,
    )
    // Sans ce contrôle, renommer le suffixe `Error` rendrait le garde vert en n'inspectant rien.
    expect(total).toBeGreaterThan(50)
  })

  it('aucune classe d’erreur de service n’étend `Error` hors de l’allowlist', () => {
    const fautives: string[] = []
    for (const f of fichiers) {
      const source = readFileSync(join(DOSSIER, f), 'utf8')
      for (const { nom, base } of classesErreur(source)) {
        if (base === 'ErreurMetier') continue
        // Une sous-classe d'une AUTRE erreur métier hérite du contrat par transitivité.
        if (classesErreur(source).some((c) => c.nom === base && c.base === 'ErreurMetier')) continue
        if (HORS_FRONTIERE_HTTP[f] === nom) continue
        fautives.push(`${f} → ${nom} extends ${base}`)
      }
    }
    expect(fautives).toEqual([])
  })

  it('l’allowlist ne garde pas d’entrée périmée', () => {
    // Une exception qui ne correspond plus à rien est une exception que personne ne relit.
    for (const [fichier, nom] of Object.entries(HORS_FRONTIERE_HTTP)) {
      const source = readFileSync(join(DOSSIER, fichier), 'utf8')
      expect(classesErreur(source).map((c) => c.nom)).toContain(nom)
    }
  })
})
