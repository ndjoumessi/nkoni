/**
 * Espace de démonstration (spec 2026-09-15 §3.1) — description PURE et DÉTERMINISTE de la démo.
 *
 * Aucune base, aucune horloge implicite : tout dérive de `anneeCourante` et `now`. Le déterminisme vient
 * des indices (pas d'aléa) — deux générations produisent la même démo, seules les dates suivent
 * « aujourd'hui ». Toutes les personnes sont FICTIVES (noms et prénoms combinés, téléphones dans la
 * plage 600 non attribuée au Cameroun).
 */

import { MODES_VERSEMENT, type ModeVersement } from '../lib/modes-versement'

export const NOM_ORGANISATION_DEMO = 'Association Exemple NKONI'
export const BRANCHES_DEMO = ['Branche Centre', 'Branche Littoral', 'Branche Diaspora'] as const
export const NOMBRE_MEMBRES_DEMO = 45

export type ProfilCotisation = 'A_JOUR' | 'PARTIEL' | 'EN_RETARD'

export interface MembreDemo {
  cle: string
  nom: string
  prenom: string
  sexe: 'M' | 'F'
  brancheIndex: number
  statut: 'ACTIF' | 'INACTIF' | 'DECEDE'
  anneeAdhesion: number
  anneeFinContribution: number | null
  profil: ProfilCotisation
  telephone: string
}

const NOMS = ['Abena', 'Bilong', 'Djomo', 'Ekambi', 'Fotso', 'Kamga', 'Mbarga', 'Ndongo', 'Nkeng', 'Talla', 'Tchatchoua', 'Wandji', 'Yimga', 'Zambo', 'Essomba']
const PRENOMS_F = ['Mireille', 'Brigitte', 'Carine', 'Danielle', 'Estelle', 'Flore', 'Gisèle', 'Hortense', 'Irène', 'Joséphine', 'Laure', 'Aïcha', 'Nadège', 'Odile', 'Pauline']
const PRENOMS_M = ['Armand', 'Bertrand', 'Cédric', 'Didier', 'Emmanuel', 'Fabrice', 'Gaston', 'Hervé', 'Isidore', 'Jules', 'Landry', 'Marcel', 'Noël', 'Olivier', 'Patrice']

/** Indices (0-44) des membres non actifs : fin de contribution l'an dernier. */
const INACTIFS = new Set([40, 41])
const DECEDE = 42

export function construireMembresDemo(anneeCourante: number): MembreDemo[] {
  let rangActif = 0
  return Array.from({ length: NOMBRE_MEMBRES_DEMO }, (_, i) => {
    const sexe: 'M' | 'F' = i % 2 === 0 ? 'F' : 'M'
    const prenoms = sexe === 'F' ? PRENOMS_F : PRENOMS_M
    // Décalage de 5 par tranche de 15 : (nom, prénom) ne se répète jamais sur 45 membres.
    const prenom = prenoms[(i + 5 * Math.floor(i / 15)) % 15]!
    const nom = NOMS[i % 15]!
    const statut: MembreDemo['statut'] = INACTIFS.has(i) ? 'INACTIF' : i === DECEDE ? 'DECEDE' : 'ACTIF'
    const base = { cle: `m${String(i + 1).padStart(2, '0')}`, nom, prenom, sexe, brancheIndex: i % 3, telephone: `6000000${String(i + 1).padStart(2, '0')}` }
    if (statut !== 'ACTIF') {
      return { ...base, statut, anneeAdhesion: anneeCourante - 2, anneeFinContribution: anneeCourante - 1, profil: 'A_JOUR' as const }
    }
    const k = rangActif++
    // 42 actifs : 25 à jour, 11 partiels, 6 en retard (~60 / 25 / 15 %).
    const profil: ProfilCotisation = k < 25 ? 'A_JOUR' : k < 36 ? 'PARTIEL' : 'EN_RETARD'
    const anneeAdhesion =
      profil === 'EN_RETARD' || (k > 0 && k % 6 === 5) ? anneeCourante - 1 : k > 0 && k % 10 === 9 ? anneeCourante : anneeCourante - 2
    return { ...base, statut, anneeAdhesion, anneeFinContribution: null, profil }
  })
}

export function baremesDemo(anneeCourante: number): { annee: number; montantAttendu: number }[] {
  return [
    { annee: anneeCourante - 2, montantAttendu: 20_000 },
    { annee: anneeCourante - 1, montantAttendu: 24_000 },
    { annee: anneeCourante, montantAttendu: 24_000 },
  ]
}

export interface VersementDemo {
  cleMembre: string
  annee: number
  montant: number
  date: Date
  mode: ModeVersement
}

// Source unique des modes (`lib/modes-versement.ts`) — ne pas recopier la liste ici (garde
// `tests/modes-versement-source-unique.test.ts`).
const MODES: ModeVersement[] = [...MODES_VERSEMENT]

/**
 * Versements qui donnent à chaque membre le statut de son profil : à jour = tout payé (deux tranches par
 * année échue, une pour l'année courante) ; partiel = années échues payées, moitié de l'année courante ;
 * en retard = rien. Jamais daté dans le futur ; le versement de l'année courante reste dans l'année
 * même au tout premier jour de janvier.
 */
export function planifierVersementsDemo(membres: MembreDemo[], anneeCourante: number, now: Date): VersementDemo[] {
  const attendu = new Map(baremesDemo(anneeCourante).map((b) => [b.annee, b.montantAttendu]))
  const dateCourante = new Date(
    Math.max(Date.UTC(anneeCourante, 0, 1, 0), Math.min(now.getTime() - 3_600_000, Date.UTC(anneeCourante, 1, 15, 9))),
  )
  const plan: VersementDemo[] = []
  membres.forEach((m, i) => {
    if (m.profil === 'EN_RETARD') return
    const fin = m.anneeFinContribution ?? anneeCourante
    for (let annee = m.anneeAdhesion; annee <= fin; annee++) {
      const montant = attendu.get(annee)
      if (montant === undefined) continue
      const mode = MODES[(i + annee) % MODES.length]!
      if (annee < anneeCourante) {
        plan.push({ cleMembre: m.cle, annee, montant: montant / 2, date: new Date(Date.UTC(annee, 2, 15, 9)), mode })
        plan.push({ cleMembre: m.cle, annee, montant: montant / 2, date: new Date(Date.UTC(annee, 8, 10, 9)), mode })
      } else {
        plan.push({ cleMembre: m.cle, annee, montant: m.profil === 'PARTIEL' ? montant / 2 : montant, date: dateCourante, mode })
      }
    }
  })
  return plan.sort((a, b) => a.date.getTime() - b.date.getTime() || a.cleMembre.localeCompare(b.cleMembre))
}

export interface DepenseDemo {
  description: string
  montant: number
  categorie: 'AIDE_MEMBRE' | 'FUNERAILLES' | 'EVENEMENT' | 'FONCTIONNEMENT' | 'AUTRE'
  cible: 'BROUILLON' | 'EN_ATTENTE' | 'APPROUVEE' | 'REJETEE' | 'PAYEE'
  joursAvant: number
  motifRejet?: string
}

export const DEPENSES_DEMO: readonly DepenseDemo[] = [
  { description: "Location de la salle de l'assemblée générale", montant: 45_000, categorie: 'EVENEMENT', cible: 'PAYEE', joursAvant: 200 },
  { description: 'Aide à une famille pour une hospitalisation', montant: 60_000, categorie: 'AIDE_MEMBRE', cible: 'PAYEE', joursAvant: 150 },
  { description: 'Couronne et transport pour des obsèques', montant: 35_000, categorie: 'FUNERAILLES', cible: 'PAYEE', joursAvant: 120 },
  { description: 'Transport des délégués à la réunion de branche', montant: 18_000, categorie: 'AUTRE', cible: 'PAYEE', joursAvant: 75 },
  { description: 'Frais de tenue du compte bancaire', montant: 8_000, categorie: 'FONCTIONNEMENT', cible: 'APPROUVEE', joursAvant: 40 },
  { description: "Repas de fin d'année", montant: 150_000, categorie: 'EVENEMENT', cible: 'REJETEE', joursAvant: 30, motifRejet: 'Budget non prévu cette année' },
  { description: 'Impression des cartes de membre', montant: 22_000, categorie: 'FONCTIONNEMENT', cible: 'EN_ATTENTE', joursAvant: 12 },
  { description: "Achat d'un registre des procès-verbaux", montant: 6_500, categorie: 'AUTRE', cible: 'BROUILLON', joursAvant: 3 },
]
