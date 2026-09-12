// Remplit une base de DÉMONSTRATION avec une association ENTIÈREMENT FICTIVE, pour la vidéo de la
// page d'accueil. Passe par l'API (et non par du SQL) : les invariants financiers (§5 — montantVerse,
// reçus numérotés) sont ceux que produit réellement l'application, donc ce qu'on filme est vrai.
//
// ⚠️ Ne JAMAIS pointer ce script sur la production, ni filmer des données réelles : une vidéo
// publique montrant noms et téléphones de vrais membres serait une fuite de données personnelles.
//
// Usage : API=http://localhost:3100 node scripts/demo-video/seed.mjs
const API = process.env.API ?? 'http://localhost:3100'
import { ADMIN, MEMBRE } from './comptes.mjs'

if (/railway|vercel|nkoni\.app/i.test(API)) throw new Error(`Refus : ${API} ressemble à la production`)

async function appel(methode, chemin, corps, jeton) {
  const res = await fetch(`${API}${chemin}`, {
    method: methode,
    headers: { ...(corps ? { 'content-type': 'application/json' } : {}), ...(jeton ? { authorization: `Bearer ${jeton}` } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  })
  const texte = await res.text()
  if (!res.ok) throw new Error(`${methode} ${chemin} → ${res.status} ${texte}`)
  return texte ? JSON.parse(texte) : null
}

// Noms fictifs. Montant annuel attendu : 60 000 FCFA.
const MEMBRES = [
  { prenom: 'Awa', nom: 'Ngono', sexe: 'F', adhesion: 2024, versements: { 2024: [60000], 2025: [30000, 30000], 2026: [45000] } },
  { prenom: 'Bernard', nom: 'Fotso', sexe: 'M', adhesion: 2024, versements: { 2024: [60000], 2025: [60000], 2026: [60000] } },
  { prenom: 'Clarisse', nom: 'Mbarga', sexe: 'F', adhesion: 2024, versements: { 2024: [60000], 2025: [60000], 2026: [45000] } },
  { prenom: 'Daniel', nom: 'Essomba', sexe: 'M', adhesion: 2024, versements: { 2024: [40000], 2025: [20000] } },
  { prenom: 'Estelle', nom: 'Kamga', sexe: 'F', adhesion: 2024, versements: { 2024: [60000], 2025: [60000], 2026: [60000] } },
  { prenom: 'Fabrice', nom: 'Nkoulou', sexe: 'M', adhesion: 2025, versements: { 2025: [60000], 2026: [30000] } },
  { prenom: 'Grâce', nom: 'Tchoumi', sexe: 'F', adhesion: 2024, versements: { 2024: [60000], 2025: [45000], 2026: [45000] } },
  { prenom: 'Hervé', nom: 'Djeukam', sexe: 'M', adhesion: 2024, versements: { 2024: [60000], 2025: [60000], 2026: [60000] } },
  { prenom: 'Inès', nom: 'Abena', sexe: 'F', adhesion: 2025, versements: { 2025: [30000] } },
  { prenom: 'Jules', nom: 'Manga', sexe: 'M', adhesion: 2024, versements: { 2024: [60000], 2025: [60000], 2026: [60000] } },
  { prenom: 'Karine', nom: 'Eyenga', sexe: 'F', adhesion: 2024, versements: { 2024: [60000], 2025: [60000], 2026: [60000] } },
  { prenom: 'Léon', nom: 'Bassong', sexe: 'M', adhesion: 2024, versements: { 2024: [20000] } },
]
const MODES = ['MOBILE_MONEY', 'ESPECES', 'MOBILE_MONEY', 'TIERS']

const { accessToken: jeton } = await appel('POST', '/organisations/inscription', {
  nomOrganisation: 'Association Les Bâtisseurs',
  devise: 'FCFA',
  langue: 'FR',
  ...ADMIN,
})
console.log('✓ organisation + compte administrateur')

for (const annee of [2024, 2025, 2026]) await appel('POST', '/baremes', { annee, montantAttendu: 60000 }, jeton)
console.log('✓ barèmes 2024-2026')

const ids = {}
for (const [i, m] of MEMBRES.entries()) {
  const cree = await appel('POST', '/membres', {
    nom: m.nom, prenom: m.prenom, sexe: m.sexe, anneeAdhesion: m.adhesion,
    telephone: `6${String(70000000 + i * 1234567).slice(0, 8)}`,
  }, jeton)
  ids[m.prenom] = cree.id
}
console.log(`✓ ${MEMBRES.length} membres`)

for (const annee of [2024, 2025, 2026]) await appel('POST', '/contributions/ouvrir-annee', { annee }, jeton)
console.log('✓ années ouvertes')

let nbVersements = 0, nbRecus = 0
for (const [i, m] of MEMBRES.entries()) {
  const contributions = await appel('GET', `/contributions?membreId=${ids[m.prenom]}`, null, jeton)
  const liste = Array.isArray(contributions) ? contributions : contributions.items
  for (const [annee, montants] of Object.entries(m.versements)) {
    const c = liste.find((x) => x.annee === Number(annee))
    if (!c) throw new Error(`contribution ${annee} introuvable pour ${m.prenom}`)
    for (const [k, montant] of montants.entries()) {
      // Dates RÉALISTES : les années passées s'étalent sur janvier-décembre, l'année en cours
      // s'arrête fin AOÛT (la vidéo est tournée en septembre — aucun versement daté du futur).
      const derniereAnnee = Number(annee) >= new Date().getFullYear()
      const mois = String(1 + ((i * (derniereAnnee ? 3 : 5) + k * 4) % (derniereAnnee ? 8 : 12))).padStart(2, '0')
      const jour = String(3 + ((i * 7 + k * 5) % 25)).padStart(2, '0')
      const { versement: v } = await appel('POST', '/versements', {
        contributionId: c.id, montant, dateVersement: `${annee}-${mois}-${jour}`, mode: MODES[(i + k) % MODES.length],
      }, jeton)
      nbVersements++
      if (Number(annee) >= 2025) { await appel('POST', `/versements/${v.id}/recu`, null, jeton); nbRecus++ }
    }
  }
}
console.log(`✓ ${nbVersements} versements, ${nbRecus} reçus`)

await appel('POST', '/utilisateurs', { ...MEMBRE, role: 'MEMBRE_SIMPLE', membreId: ids.Awa }, jeton)
console.log('✓ compte membre (Awa Ngono) pour la vue « Mon espace »')
