/**
 * Modes de versement — SOURCE UNIQUE partagée par toutes les routes qui valident un mode d'argent
 * (versements §5, dons de cagnotte §4.9, paiement d'amende §4.10). Cette liste était recopiée à la
 * main dans TROIS routes (`MODE_ENUM` dans versements, `MODES` dans cagnottes/amendes) plus une
 * union `type ModeVersement` — elle divergeait en silence (cf. la note « listes de modes » de
 * CLAUDE.md). Une seule déclaration ici, importée partout.
 *
 * La parité avec l'enum Postgres `ModeVersement` du schéma est gardée EXÉCUTABLEMENT par
 * `tests/modes-versement-parity.test.ts` : ajouter une valeur à l'enum sans la reporter ici (ou
 * l'inverse) casse le build. Migration d'enum en deux temps (`ADD VALUE` puis usage), cf. Conventions.
 */
export const MODES_VERSEMENT = ['ESPECES', 'TIERS', 'MOBILE_MONEY', 'AUTRE'] as const

export type ModeVersement = (typeof MODES_VERSEMENT)[number]
