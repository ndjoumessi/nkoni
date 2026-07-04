import { describe, it, expect } from 'vitest'
import {
  peutVoirDocument,
  peutVoirMembre,
  peutGererDocumentPourEntite,
  validerFichier,
  televerserDocument,
  supprimerDocument,
  listerDocumentsVisibles,
  getDocumentPourTelechargement,
  TypeFichierNonAutoriseError,
  FichierTropVolumineuxError,
  AccesDocumentRefuseError,
  DocumentIntrouvableError,
  EntiteParenteIntrouvableError,
  type ParentDocument,
  type DemandeurDocument,
  type EntiteDocument,
} from '../src/services/document.service'
import type { Role } from '../src/middlewares/permissions'
import { buildDocumentsMock, buildBlobMock, FICHIERS, MIME } from './support/documents-mocks'

const ROLES: Role[] = [
  'ADMIN',
  'PRESIDENT',
  'SECRETAIRE',
  'TRESORIERE',
  'COMMISSAIRE_COMPTES',
  'MEMBRE_SIMPLE',
  'GUIDE_RELIGIEUX',
]
const etranger = (role: Role): DemandeurDocument => ({ id: `u-${role}`, role })

/* ==========================================================================
 * peutVoirDocument — visibilité HÉRITÉE du parent (cœur sensible)
 * ========================================================================== */
describe('peutVoirDocument — visibilité héritée du parent', () => {
  it('parent null (orphelin / entité supprimée) → refus pour tous', () => {
    for (const role of ROLES) expect(peutVoirDocument(null, etranger(role))).toBe(false)
  })

  /* --- CONFLIT : réutilise strictement peutVoirConflit --------------------- */
  describe('document rattaché à un CONFLIT', () => {
    const confParent: ParentDocument = {
      entiteType: 'CONFLIT',
      conflit: { niveauConfidentialite: 'CONFIDENTIEL', auteurId: 'u-auteur', responsableSuiviId: 'u-resp' },
    }

    it('CONFIDENTIEL : visible par auteur / responsable / ADMIN', () => {
      expect(peutVoirDocument(confParent, { id: 'u-auteur', role: 'MEMBRE_SIMPLE' })).toBe(true)
      expect(peutVoirDocument(confParent, { id: 'u-resp', role: 'COMMISSAIRE_COMPTES' })).toBe(true)
      expect(peutVoirDocument(confParent, { id: 'u-admin', role: 'ADMIN' })).toBe(true)
    })
    it('CONFIDENTIEL : INVISIBLE pour PRESIDENT / SECRETAIRE non-parties', () => {
      expect(peutVoirDocument(confParent, etranger('PRESIDENT'))).toBe(false)
      expect(peutVoirDocument(confParent, etranger('SECRETAIRE'))).toBe(false)
    })
    it('CONFIDENTIEL : invisible pour tout autre rôle non-partie', () => {
      for (const role of ROLES.filter((r) => r !== 'ADMIN')) {
        expect(peutVoirDocument(confParent, etranger(role)), role).toBe(false)
      }
    })
    it('BUREAU : visible bureau, invisible autres ; PUBLIC : tous sauf GUIDE', () => {
      const bureau: ParentDocument = { entiteType: 'CONFLIT', conflit: { niveauConfidentialite: 'BUREAU', auteurId: 'u-x', responsableSuiviId: null } }
      const pub: ParentDocument = { entiteType: 'CONFLIT', conflit: { niveauConfidentialite: 'PUBLIC', auteurId: 'u-x', responsableSuiviId: null } }
      expect(peutVoirDocument(bureau, etranger('SECRETAIRE'))).toBe(true)
      expect(peutVoirDocument(bureau, etranger('MEMBRE_SIMPLE'))).toBe(false)
      expect(peutVoirDocument(pub, etranger('MEMBRE_SIMPLE'))).toBe(true)
      expect(peutVoirDocument(pub, etranger('GUIDE_RELIGIEUX'))).toBe(false) // conflit exclut GUIDE
    })
  })

  /* --- MEMBRE : MEMBRE_SIMPLE limité à sa propre fiche -------------------- */
  describe('document rattaché à un MEMBRE', () => {
    const parentDe = (compteUtilisateurId: string | null): ParentDocument => ({
      entiteType: 'MEMBRE',
      membre: { compteUtilisateurId },
    })

    it('ADMIN/PRESIDENT/SECRETAIRE/TRESORIERE/COMMISSAIRE voient la fiche de n’importe qui', () => {
      for (const role of ['ADMIN', 'PRESIDENT', 'SECRETAIRE', 'TRESORIERE', 'COMMISSAIRE_COMPTES'] as Role[]) {
        expect(peutVoirDocument(parentDe('u-autre'), etranger(role)), role).toBe(true)
      }
    })
    it('MEMBRE_SIMPLE : voit UNIQUEMENT le document de SA propre fiche', () => {
      expect(peutVoirDocument(parentDe('u-moi'), { id: 'u-moi', role: 'MEMBRE_SIMPLE' })).toBe(true)
      expect(peutVoirDocument(parentDe('u-autre'), { id: 'u-moi', role: 'MEMBRE_SIMPLE' })).toBe(false)
    })
    it('GUIDE_RELIGIEUX : aucune lecture Membre → invisible', () => {
      expect(peutVoirDocument(parentDe('u-autre'), etranger('GUIDE_RELIGIEUX'))).toBe(false)
    })
    it('peutVoirMembre direct : cohérent', () => {
      expect(peutVoirMembre({ compteUtilisateurId: 'x' }, { id: 'x', role: 'MEMBRE_SIMPLE' })).toBe(true)
      expect(peutVoirMembre({ compteUtilisateurId: 'x' }, { id: 'y', role: 'MEMBRE_SIMPLE' })).toBe(false)
    })
  })

  /* --- REUNION : lecture matrice (tous sauf GUIDE) ------------------------ */
  it('document rattaché à une RÉUNION : visible tous sauf GUIDE_RELIGIEUX', () => {
    const parent: ParentDocument = { entiteType: 'REUNION' }
    for (const role of ROLES) {
      expect(peutVoirDocument(parent, etranger(role)), role).toBe(role !== 'GUIDE_RELIGIEUX')
    }
  })

  /* --- COMMEMORATION : lecture matrice (tous les rôles) ------------------- */
  it('document rattaché à une COMMÉMORATION : visible par tous les rôles', () => {
    const parent: ParentDocument = { entiteType: 'COMMEMORATION' }
    for (const role of ROLES) expect(peutVoirDocument(parent, etranger(role)), role).toBe(true)
  })
})

/* ==========================================================================
 * validerFichier — types autorisés (magic bytes) + taille
 * ========================================================================== */
describe('validerFichier — contraintes fichiers', () => {
  it('accepte PDF / JPEG / PNG / DOCX (magic bytes cohérents)', () => {
    expect(() => validerFichier(FICHIERS.pdf, MIME.pdf)).not.toThrow()
    expect(() => validerFichier(FICHIERS.jpeg, MIME.jpeg)).not.toThrow()
    expect(() => validerFichier(FICHIERS.png, MIME.png)).not.toThrow()
    expect(() => validerFichier(FICHIERS.docx, MIME.docx)).not.toThrow()
  })
  it('rejette un mime-type non autorisé (text/plain) → TypeFichierNonAutorise', () => {
    expect(() => validerFichier(FICHIERS.texte, MIME.texte)).toThrow(TypeFichierNonAutoriseError)
  })
  it('rejette un fichier dont les magic bytes ne correspondent PAS au mime déclaré', () => {
    // Un .txt déclaré comme PDF : bloqué (validation serveur, pas l’extension).
    expect(() => validerFichier(FICHIERS.texte, MIME.pdf)).toThrow(TypeFichierNonAutoriseError)
  })
  it('rejette un fichier > 10 Mo → FichierTropVolumineux', () => {
    const gros = Buffer.concat([FICHIERS.pdf, Buffer.alloc(10 * 1024 * 1024 + 1)])
    expect(() => validerFichier(gros, MIME.pdf)).toThrow(FichierTropVolumineuxError)
  })
})

/* ==========================================================================
 * peutGererDocumentPourEntite — upload/suppression
 * ========================================================================== */
describe('peutGererDocumentPourEntite', () => {
  const TYPES: EntiteDocument[] = ['MEMBRE', 'REUNION', 'CONFLIT', 'COMMEMORATION']
  it('bureau (ADMIN/PRESIDENT/SECRETAIRE) : autorisé pour tous les types', () => {
    for (const t of TYPES)
      for (const role of ['ADMIN', 'PRESIDENT', 'SECRETAIRE'] as Role[])
        expect(peutGererDocumentPourEntite(t, role), `${t}/${role}`).toBe(true)
  })
  it('TRESORIERE / COMMISSAIRE / MEMBRE_SIMPLE : refusés (aucune modif sur ces entités)', () => {
    for (const t of TYPES)
      for (const role of ['TRESORIERE', 'COMMISSAIRE_COMPTES', 'MEMBRE_SIMPLE'] as Role[])
        expect(peutGererDocumentPourEntite(t, role), `${t}/${role}`).toBe(false)
  })
  it('GUIDE_RELIGIEUX : autorisé UNIQUEMENT sur COMMEMORATION (son domaine), refusé ailleurs', () => {
    expect(peutGererDocumentPourEntite('COMMEMORATION', 'GUIDE_RELIGIEUX')).toBe(true)
    for (const t of ['MEMBRE', 'REUNION', 'CONFLIT'] as EntiteDocument[])
      expect(peutGererDocumentPourEntite(t, 'GUIDE_RELIGIEUX'), t).toBe(false)
  })
})

/* ==========================================================================
 * televerserDocument — upload + validation + blob + nettoyage
 * ========================================================================== */
describe('televerserDocument', () => {
  const bureau: DemandeurDocument = { id: 'u-sec', role: 'SECRETAIRE' }
  const params = (over: any = {}) => ({
    nom: 'acte.pdf',
    entiteType: 'COMMEMORATION' as EntiteDocument,
    entiteId: 'cm-1',
    fichier: { buffer: FICHIERS.pdf, mimetype: MIME.pdf },
    ...over,
  })

  it('happy path : blob poussé + enregistrement DB, URL NON exposée', async () => {
    const prisma = buildDocumentsMock()
    const blob = buildBlobMock()
    const doc = await televerserDocument(prisma as any, blob.client, params(), bureau)
    expect(blob.puts).toHaveLength(1)
    expect(doc).toMatchObject({ nom: 'acte.pdf', entiteType: 'COMMEMORATION' })
    expect((doc as any).url).toBeUndefined() // jamais l’URL brute
  })

  it('rejette un type non autorisé AVANT tout upload', async () => {
    const prisma = buildDocumentsMock()
    const blob = buildBlobMock()
    await expect(
      televerserDocument(prisma as any, blob.client, params({ fichier: { buffer: FICHIERS.texte, mimetype: MIME.texte } }), bureau),
    ).rejects.toBeInstanceOf(TypeFichierNonAutoriseError)
    expect(blob.puts).toHaveLength(0)
  })

  it('rejette un fichier trop volumineux AVANT tout upload', async () => {
    const prisma = buildDocumentsMock()
    const blob = buildBlobMock()
    const gros = Buffer.concat([FICHIERS.pdf, Buffer.alloc(10 * 1024 * 1024 + 1)])
    await expect(
      televerserDocument(prisma as any, blob.client, params({ fichier: { buffer: gros, mimetype: MIME.pdf } }), bureau),
    ).rejects.toBeInstanceOf(FichierTropVolumineuxError)
    expect(blob.puts).toHaveLength(0)
  })

  it('entité parente inexistante → EntiteParenteIntrouvable, pas d’upload', async () => {
    const prisma = buildDocumentsMock()
    const blob = buildBlobMock()
    await expect(
      televerserDocument(prisma as any, blob.client, params({ entiteId: 'inconnu' }), bureau),
    ).rejects.toBeInstanceOf(EntiteParenteIntrouvableError)
    expect(blob.puts).toHaveLength(0)
  })

  it('non-gestionnaire (MEMBRE_SIMPLE) → refus, pas d’upload', async () => {
    const prisma = buildDocumentsMock()
    const blob = buildBlobMock()
    await expect(
      televerserDocument(prisma as any, blob.client, params(), { id: 'u-membre', role: 'MEMBRE_SIMPLE' }),
    ).rejects.toBeInstanceOf(AccesDocumentRefuseError)
    expect(blob.puts).toHaveLength(0)
  })

  it('SÉCURITÉ : un SECRETAIRE non-partie ne peut PAS déposer sur un CONFLIT CONFIDENTIEL (refus, pas d’upload)', async () => {
    const prisma = buildDocumentsMock()
    const blob = buildBlobMock()
    await expect(
      televerserDocument(
        prisma as any,
        blob.client,
        params({ entiteType: 'CONFLIT', entiteId: 'cf-conf', fichier: { buffer: FICHIERS.pdf, mimetype: MIME.pdf } }),
        { id: 'u-sec', role: 'SECRETAIRE' },
      ),
    ).rejects.toBeInstanceOf(AccesDocumentRefuseError)
    expect(blob.puts).toHaveLength(0)
  })

  it('l’auteur d’un CONFLIT CONFIDENTIEL PEUT y déposer un document', async () => {
    const prisma = buildDocumentsMock()
    const blob = buildBlobMock()
    const doc = await televerserDocument(
      prisma as any,
      blob.client,
      params({ entiteType: 'CONFLIT', entiteId: 'cf-conf' }),
      { id: 'u-pres', role: 'PRESIDENT' }, // u-pres = auteur du conflit
    )
    expect(doc).toMatchObject({ entiteType: 'CONFLIT' })
    expect(blob.puts).toHaveLength(1)
  })

  it('GUIDE_RELIGIEUX PEUT déposer un document sur une COMMEMORATION (son domaine)', async () => {
    const prisma = buildDocumentsMock()
    const blob = buildBlobMock()
    const doc = await televerserDocument(prisma as any, blob.client, params(), { id: 'u-guide', role: 'GUIDE_RELIGIEUX' })
    expect(doc).toMatchObject({ entiteType: 'COMMEMORATION' })
    expect(blob.puts).toHaveLength(1)
  })

  it('échec DB après upload → nettoyage du blob orphelin (blob.del appelé)', async () => {
    const prisma = buildDocumentsMock({ failCreate: true })
    const blob = buildBlobMock()
    await expect(televerserDocument(prisma as any, blob.client, params(), bureau)).rejects.toThrow()
    expect(blob.puts).toHaveLength(1)
    expect(blob.dels).toHaveLength(1) // le blob poussé a été supprimé
    expect(blob.dels[0]).toBe(blob.puts[0].url)
  })
})

/* ==========================================================================
 * supprimerDocument — retire du Blob ET de la DB
 * ========================================================================== */
describe('supprimerDocument', () => {
  it('suppression autorisée : blob.del appelé PUIS enregistrement retiré', async () => {
    const prisma = buildDocumentsMock()
    const id = prisma.__seedDoc({ entiteType: 'COMMEMORATION', entiteId: 'cm-1', url: 'https://blob.test/x' })
    const blob = buildBlobMock()
    await supprimerDocument(prisma as any, blob.client, id, { id: 'u-sec', role: 'SECRETAIRE' })
    expect(blob.dels).toEqual(['https://blob.test/x']) // fichier retiré du Blob
    expect(await prisma.document.findUnique({ where: { id } })).toBeNull() // retiré de la DB
  })

  it('non autorisé → refus, blob NON touché', async () => {
    const prisma = buildDocumentsMock()
    const id = prisma.__seedDoc({ entiteType: 'COMMEMORATION', entiteId: 'cm-1' })
    const blob = buildBlobMock()
    await expect(
      supprimerDocument(prisma as any, blob.client, id, { id: 'u-membre', role: 'MEMBRE_SIMPLE' }),
    ).rejects.toBeInstanceOf(AccesDocumentRefuseError)
    expect(blob.dels).toHaveLength(0)
  })

  it('document inexistant → 404 (DocumentIntrouvable)', async () => {
    const prisma = buildDocumentsMock()
    const blob = buildBlobMock()
    await expect(
      supprimerDocument(prisma as any, blob.client, 'inconnu', { id: 'u-admin', role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(DocumentIntrouvableError)
  })

  it('ADMIN peut supprimer un document orphelin (entité parente disparue)', async () => {
    const prisma = buildDocumentsMock()
    const id = prisma.__seedDoc({ entiteType: 'REUNION', entiteId: 'reunion-supprimee', url: 'https://blob.test/orph' })
    const blob = buildBlobMock()
    await supprimerDocument(prisma as any, blob.client, id, { id: 'u-admin', role: 'ADMIN' })
    expect(blob.dels).toEqual(['https://blob.test/orph'])
  })
})

/* ==========================================================================
 * listerDocumentsVisibles — filtrage par visibilité héritée
 * ========================================================================== */
describe('listerDocumentsVisibles', () => {
  function seed() {
    const prisma = buildDocumentsMock()
    const dConf = prisma.__seedDoc({ entiteType: 'CONFLIT', entiteId: 'cf-conf' })
    const dCommemo = prisma.__seedDoc({ entiteType: 'COMMEMORATION', entiteId: 'cm-1' })
    const dMembreAutre = prisma.__seedDoc({ entiteType: 'MEMBRE', entiteId: 'm-other' })
    return { prisma, dConf, dCommemo, dMembreAutre }
  }
  const ids = (l: any[]) => l.map((d) => d.id).sort()

  it('MEMBRE_SIMPLE (u-membre, non partie du conflit, pas fiche m-other) → voit seulement la commémoration', async () => {
    const { prisma, dCommemo } = seed()
    const list = await listerDocumentsVisibles(prisma as any, { id: 'u-membre', role: 'MEMBRE_SIMPLE' })
    expect(ids(list)).toEqual([dCommemo])
  })

  it('SECRETAIRE non-partie → voit commémoration + fiche membre, PAS le doc du conflit confidentiel', async () => {
    const { prisma, dCommemo, dMembreAutre } = seed()
    const list = await listerDocumentsVisibles(prisma as any, { id: 'u-sec', role: 'SECRETAIRE' })
    expect(ids(list)).toEqual([dCommemo, dMembreAutre].sort())
  })

  it('l’auteur du conflit (u-pres) voit AUSSI le document du conflit confidentiel', async () => {
    const { prisma, dConf, dCommemo, dMembreAutre } = seed()
    const list = await listerDocumentsVisibles(prisma as any, { id: 'u-pres', role: 'PRESIDENT' })
    expect(ids(list)).toEqual([dConf, dCommemo, dMembreAutre].sort())
  })

  it('filtrage par entité (entiteType+entiteId) respecte aussi la visibilité', async () => {
    const { prisma } = seed()
    const list = await listerDocumentsVisibles(prisma as any, { id: 'u-sec', role: 'SECRETAIRE' }, { entiteType: 'CONFLIT', entiteId: 'cf-conf' })
    expect(list).toHaveLength(0) // SECRETAIRE non-partie ne voit pas ce conflit → aucun doc
  })
})

/* ==========================================================================
 * getDocumentPourTelechargement — proxy authentifié (404 si non autorisé)
 * ========================================================================== */
describe('getDocumentPourTelechargement', () => {
  it('autorisé → renvoie l’URL interne pour le proxy', async () => {
    const prisma = buildDocumentsMock()
    const id = prisma.__seedDoc({ entiteType: 'COMMEMORATION', entiteId: 'cm-1', url: 'https://blob.test/f' })
    const res = await getDocumentPourTelechargement(prisma as any, id, { id: 'u-membre', role: 'MEMBRE_SIMPLE' })
    expect(res.url).toBe('https://blob.test/f')
  })

  it('non autorisé (doc d’un conflit confidentiel) → 404, ne divulgue pas l’existence', async () => {
    const prisma = buildDocumentsMock()
    const id = prisma.__seedDoc({ entiteType: 'CONFLIT', entiteId: 'cf-conf' })
    await expect(
      getDocumentPourTelechargement(prisma as any, id, { id: 'u-sec', role: 'SECRETAIRE' }),
    ).rejects.toBeInstanceOf(DocumentIntrouvableError)
  })
})
