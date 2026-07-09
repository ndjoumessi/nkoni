/**
 * Trésorerie / dépenses (§5) — logique métier i18n-AGNOSTIQUE (erreurs typées, aucun texte).
 *
 *  - Workflow d'approbation : BROUILLON → EN_ATTENTE → APPROUVEE | REJETEE → PAYEE.
 *  - SOLDE DE CAISSE = Σ Versements (entrées) − Σ Dépenses APPROUVÉES/PAYÉES (sorties) ;
 *    + ventilation par catégorie et bornage par période. Toutes les lectures sont SCOPÉES par
 *    l'extension d'isolation (le service reçoit le client déjà scopé).
 */

export type StatutDepense = 'BROUILLON' | 'EN_ATTENTE' | 'APPROUVEE' | 'REJETEE' | 'PAYEE'

/** Transitions autorisées du workflow (source de vérité unique). */
const TRANSITIONS: Record<StatutDepense, StatutDepense[]> = {
  BROUILLON: ['EN_ATTENTE'],
  EN_ATTENTE: ['APPROUVEE', 'REJETEE'],
  APPROUVEE: ['PAYEE'],
  REJETEE: [],
  PAYEE: [],
}

/** Statuts pendant lesquels la dépense reste MODIFIABLE (avant décision d'approbation). */
const EDITABLES: readonly StatutDepense[] = ['BROUILLON', 'EN_ATTENTE']
/** Statuts comptant comme une SORTIE de caisse (engagement validé). */
export const STATUTS_SORTIE: readonly StatutDepense[] = ['APPROUVEE', 'PAYEE']

export class DepenseIntrouvableError extends Error {
  constructor() {
    super('Dépense introuvable.')
    this.name = 'DepenseIntrouvableError'
  }
}
export class TransitionDepenseInvalideError extends Error {
  constructor(
    public actuel: StatutDepense,
    public cible: StatutDepense,
  ) {
    super(`Transition invalide : ${actuel} → ${cible}.`)
    this.name = 'TransitionDepenseInvalideError'
  }
}
export class DepenseNonEditableError extends Error {
  constructor(public statut: StatutDepense) {
    super(`Dépense non modifiable au statut ${statut}.`)
    this.name = 'DepenseNonEditableError'
  }
}

/** Vérifie qu'une transition de statut est autorisée (sinon lève une erreur typée). */
export function validerTransition(actuel: StatutDepense, cible: StatutDepense): void {
  if (!TRANSITIONS[actuel]?.includes(cible)) {
    throw new TransitionDepenseInvalideError(actuel, cible)
  }
}

/** Vrai si la dépense est encore modifiable (édition des champs). */
export function estEditable(statut: StatutDepense): boolean {
  return EDITABLES.includes(statut)
}

/* -------------------------------------------------------------------------- */
/* Solde de caisse + ventilation                                              */
/* -------------------------------------------------------------------------- */

export interface FiltreTresorerie {
  dateDebut?: Date
  dateFin?: Date
}

export interface SoldeTresorerie {
  entrees: number
  sorties: number
  solde: number
  parCategorie: { categorie: string; total: number }[]
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface TresoreriePrisma {
  versement: { aggregate(args: any): Promise<any> }
  depense: { groupBy(args: any): Promise<any> }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Calcule le solde de caisse : entrées (Σ versements) − sorties (Σ dépenses APPROUVÉES/PAYÉES),
 * avec ventilation des sorties par catégorie. Bornage optionnel par période (sur la DATE
 * du versement / de la dépense).
 */
export async function calculerTresorerie(
  prisma: TresoreriePrisma,
  filtre: FiltreTresorerie = {},
): Promise<SoldeTresorerie> {
  const borneVersement = bornerDate('dateVersement', filtre)
  const borneDepense = bornerDate('date', filtre)

  const [aggEntrees, groupesSorties] = await Promise.all([
    prisma.versement.aggregate({ _sum: { montant: true }, where: borneVersement }),
    prisma.depense.groupBy({
      by: ['categorie'],
      _sum: { montant: true },
      where: { statut: { in: STATUTS_SORTIE }, ...borneDepense },
    }),
  ])

  const entrees = aggEntrees?._sum?.montant ?? 0
  const parCategorie = (groupesSorties as { categorie: string; _sum: { montant: number | null } }[])
    .map((g) => ({ categorie: g.categorie, total: g._sum?.montant ?? 0 }))
    .sort((a, b) => b.total - a.total)
  const sorties = parCategorie.reduce((s, c) => s + c.total, 0)

  return { entrees, sorties, solde: entrees - sorties, parCategorie }
}

/** Construit le filtre de date `{ [champ]: { gte?, lte? } }` ou `{}` si aucune borne. */
function bornerDate(champ: string, filtre: FiltreTresorerie): Record<string, unknown> {
  const borne: Record<string, Date> = {}
  if (filtre.dateDebut) borne['gte'] = filtre.dateDebut
  if (filtre.dateFin) borne['lte'] = filtre.dateFin
  return Object.keys(borne).length > 0 ? { [champ]: borne } : {}
}
