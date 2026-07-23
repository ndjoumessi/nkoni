import { describe, it, expect } from 'vitest'
import {
  ORDRE_SUPPRESSION,
  assemblerExportOrganisation,
  collecterUrlsBlobs,
  purgerBlobs,
  supprimerDonneesOrganisation,
  OrganisationNonSuspendueError,
  type ExportOrganisation,
} from '../src/services/organisation-purge.service'

/* eslint-disable @typescript-eslint/no-explicit-any */

const ORG = 'org-a'

/**
 * Mock de transaction : enregistre l'ORDRE des suppressions et les `where` reçus.
 *
 * Portée de ce fichier : il vérifie que le service interroge le bon ensemble et dans le bon ordre.
 * Il ne prouve RIEN sur les clés étrangères — un mock n'en a pas. C'est le rôle de
 * `organisation-purge.integration.test.ts`, sur vraie Postgres. La leçon vient du défaut de
 * production du 2026-07-21 (garde de suppression de versement validée par un mock, refusée par
 * la base).
 */
function buildTx(opts: { actif?: boolean | null; absente?: boolean } = {}) {
  const appels: Array<{ modele: string; where: any }> = []
  const proxy = (modele: string) => ({
    deleteMany: async ({ where }: any) => {
      appels.push({ modele, where })
      return { count: 1 }
    },
    findMany: async () => [],
  })

  const tx: any = new Proxy(
    {
      organisation: {
        findUnique: async () =>
          opts.absente ? null : { id: ORG, actif: opts.actif ?? false },
        delete: async ({ where }: any) => {
          appels.push({ modele: 'Organisation', where })
          return { id: where.id }
        },
      },
      refreshToken: {
        deleteMany: async ({ where }: any) => {
          appels.push({ modele: 'RefreshToken', where })
          return { count: 2 }
        },
      },
    },
    {
      get(cible: any, prop: string) {
        if (prop in cible) return cible[prop]
        // Tout autre modèle → accesseur générique enregistrant l'appel.
        const modele = prop.charAt(0).toUpperCase() + prop.slice(1)
        return proxy(modele)
      },
    },
  )

  return { tx, appels }
}

describe('supprimerDonneesOrganisation — ordre et scoping', () => {
  it('supprime les modèles dans l’ordre EXACT de ORDRE_SUPPRESSION', async () => {
    const { tx, appels } = buildTx()
    await supprimerDonneesOrganisation(tx, ORG, ['u1'])
    expect(appels.map((a) => a.modele)).toEqual([...ORDRE_SUPPRESSION])
  })

  /**
   * LE test qui compte. La purge tourne sous `runUnscoped`, donc l'extension d'isolation est
   * NEUTRALISÉE : un `deleteMany({})` effacerait toutes les organisations sans lever d'erreur.
   * On vérifie donc que CHAQUE suppression est explicitement scopée.
   */
  it('chaque deleteMany porte un where scopé — jamais de suppression globale', async () => {
    const { tx, appels } = buildTx()
    await supprimerDonneesOrganisation(tx, ORG, ['u1'])

    for (const appel of appels) {
      if (appel.modele === 'Organisation') {
        expect(appel.where, 'Organisation ciblée par id').toEqual({ id: ORG })
      } else if (appel.modele === 'RefreshToken') {
        // Pas d'organisationId sur ce modèle : le scoping passe par la liste d'utilisateurs.
        expect(appel.where?.utilisateurId?.in, 'RefreshToken ciblé par utilisateur').toBeDefined()
      } else {
        expect(appel.where, `${appel.modele} doit être scopé`).toEqual({ organisationId: ORG })
      }
      // Aucun `where` vide, jamais.
      expect(appel.where).not.toEqual({})
    }
  })

  it('purge RefreshToken avec les ids d’utilisateurs FOURNIS (collectés avant leur suppression)', async () => {
    const { tx, appels } = buildTx()
    await supprimerDonneesOrganisation(tx, ORG, ['u1', 'u2'])
    const rt = appels.find((a) => a.modele === 'RefreshToken')
    expect(rt?.where.utilisateurId.in).toEqual(['u1', 'u2'])
  })

  it('supprime RefreshToken APRÈS Utilisateur mais avec des ids encore valides', async () => {
    const { tx, appels } = buildTx()
    await supprimerDonneesOrganisation(tx, ORG, ['u1'])
    const iUser = appels.findIndex((a) => a.modele === 'Utilisateur')
    const iToken = appels.findIndex((a) => a.modele === 'RefreshToken')
    expect(iToken).toBeGreaterThan(iUser)
  })

  it('renvoie les compteurs par modèle (preuve a posteriori que la purge a été complète)', async () => {
    const { tx } = buildTx()
    const compteurs = await supprimerDonneesOrganisation(tx, ORG, ['u1'])
    expect(compteurs['Membre']).toBe(1)
    expect(compteurs['RefreshToken']).toBe(2)
    expect(compteurs['Organisation']).toBe(1)
  })
})

describe('supprimerDonneesOrganisation — préconditions', () => {
  it('REFUSE une organisation encore active (relecture DANS la transaction)', async () => {
    const { tx, appels } = buildTx({ actif: true })
    await expect(supprimerDonneesOrganisation(tx, ORG, [])).rejects.toBeInstanceOf(
      OrganisationNonSuspendueError,
    )
    // Rien n'a été supprimé : la garde intervient AVANT toute écriture.
    expect(appels).toHaveLength(0)
  })

  it('ne supprime rien si l’organisation n’existe pas', async () => {
    const { tx, appels } = buildTx({ absente: true })
    const compteurs = await supprimerDonneesOrganisation(tx, ORG, [])
    expect(compteurs).toEqual({})
    expect(appels).toHaveLength(0)
  })
})

describe('collecterUrlsBlobs — fonction pure sur l’export', () => {
  const exp = (fichiers: any[]): ExportOrganisation => ({
    version: 1,
    genereLe: '2026-07-21T00:00:00.000Z',
    organisation: { id: ORG },
    donnees: {},
    compteurs: {},
    fichiers,
  })

  it('extrait les URLs du manifeste', () => {
    const urls = collecterUrlsBlobs(
      exp([
        { modele: 'Membre', id: 'm1', champ: 'photoBlobUrl', url: 'https://b/photo' },
        { modele: 'Document', id: 'd1', champ: 'url', url: 'https://b/doc' },
      ]),
    )
    expect(urls).toEqual(['https://b/photo', 'https://b/doc'])
  })

  it('dédoublonne (un même blob peut être référencé deux fois)', () => {
    const urls = collecterUrlsBlobs(
      exp([
        { modele: 'Recu', id: 'r1', champ: 'urlPdf', url: 'https://b/x' },
        { modele: 'Recu', id: 'r2', champ: 'urlPdf', url: 'https://b/x' },
      ]),
    )
    expect(urls).toEqual(['https://b/x'])
  })

  it('renvoie une liste vide sur un export sans pièce jointe', () => {
    expect(collecterUrlsBlobs(exp([]))).toEqual([])
  })
})

describe('assemblerExportOrganisation', () => {
  it('lit chaque modèle scopé avec un where scopé, et construit le manifeste', async () => {
    const lus: string[] = []
    const prisma: any = new Proxy(
      {
        organisation: { findUnique: async () => ({ id: ORG, nom: 'Wamba' }) },
      },
      {
        get(cible: any, prop: string) {
          if (prop in cible) return cible[prop]
          return {
            findMany: async ({ where, omit }: any) => {
              lus.push(prop)
              expect(where).toEqual({ organisationId: ORG })
              if (prop === 'membre') {
                return [{ id: 'm1', photoBlobUrl: 'https://b/p', photoMime: 'image/png' }]
              }
              if (prop === 'document') return [{ id: 'd1', url: 'https://b/d', mimeType: 'application/pdf' }]
              if (prop === 'recu') return [{ id: 'r1', urlPdf: null }] // reçu sans PDF généré
              if (prop === 'utilisateur') {
                // Ni l'export self-service (ADMIN/PRESIDENT) ni l'export plateforme (SUPER_ADMIN)
                // ne doivent jamais recevoir le hash de mot de passe.
                expect(omit).toEqual({ passwordHash: true })
                return [{ id: 'u1', email: 'x@y.z' }]
              }
              if (prop === 'parametrePaiement') {
                // Même règle pour les identifiants PSP : un export quitte le périmètre de l'app, et
                // la clé de chiffrement est UNIQUE pour toute la plateforme — un ciphertext archivé
                // deviendrait exploitable si elle fuitait un jour.
                expect(omit).toEqual({ identifiantsChiffres: true })
                return [{ id: 'pp1', provider: 'FAPSHI', actif: true }]
              }
              // Tout autre modèle est exporté INTÉGRALEMENT : la liste des champs secrets est
              // volontairement courte et explicite (cf. CHAMPS_EXCLUS_EXPORT).
              expect(omit).toBeUndefined()
              return []
            },
          }
        },
      },
    )

    const res = await assemblerExportOrganisation(prisma, ORG, new Date('2026-07-21T10:00:00Z'))

    expect(res.version).toBe(1)
    expect(res.genereLe).toBe('2026-07-21T10:00:00.000Z')
    expect(res.organisation).toMatchObject({ nom: 'Wamba' })
    // Ni Organisation ni RefreshToken ne sont des modèles scopés à exporter en masse.
    expect(lus).not.toContain('organisation')
    expect(lus).not.toContain('refreshToken')
    expect(res.compteurs['Membre']).toBe(1)
    // Le reçu sans `urlPdf` ne produit PAS d'entrée de manifeste.
    expect(res.fichiers.map((f) => f.url)).toEqual(['https://b/p', 'https://b/d'])
  })
})

describe('purgerBlobs — best-effort, après commit', () => {
  it('un échec n’interrompt pas les suivants et remonte dans `echecs`', async () => {
    const blob = {
      del: async (url: string) => {
        if (url === 'https://b/2') throw new Error('blob indisponible')
      },
    }
    const res = await purgerBlobs(blob, ['https://b/1', 'https://b/2', 'https://b/3'])
    expect(res.supprimes).toBe(2)
    expect(res.echecs).toEqual(['https://b/2'])
  })

  it('ne lève jamais, même si tout échoue', async () => {
    const blob = { del: async () => { throw new Error('store hors service') } }
    await expect(purgerBlobs(blob, ['https://b/1'])).resolves.toMatchObject({ supprimes: 0 })
  })
})
