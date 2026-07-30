import { describe, it, expect } from 'vitest'
import { cheminLocalBlob, construireCibles } from '../src/lib/blob-mirror'

/**
 * Garde du miroir Blob (dette GA D2) : la logique PURE d'énumération. Le téléchargement + l'upload
 * R2 se vérifient par un run réel du workflow (comme l'exercice de restauration) — mais la SÉLECTION
 * des fichiers et la dérivation du chemin d'archivage, elles, sont testables sans réseau.
 */
describe('miroir Blob — dérivation du chemin', () => {
  it('cheminLocalBlob = pathname de l’URL sans le / initial', () => {
    expect(cheminLocalBlob('https://abc.blob.vercel-storage.com/membres/photo-x9y8z7')).toBe('membres/photo-x9y8z7')
    expect(cheminLocalBlob('https://abc.blob.vercel-storage.com/documents/rib-AbC123')).toBe('documents/rib-AbC123')
  })
})

describe('miroir Blob — construction des cibles', () => {
  it('collecte les 3 sources, ignore les photos nulles, dédoublonne par URL', () => {
    const cibles = construireCibles({
      documents: [{ url: 'https://s.blob.vercel-storage.com/documents/a-1' }],
      photosMembre: [
        { photoBlobUrl: 'https://s.blob.vercel-storage.com/membres/photo-2' },
        { photoBlobUrl: null }, // membre sans photo → ignoré
      ],
      avatars: [
        { photoBlobUrl: 'https://s.blob.vercel-storage.com/avatars/av-3' },
        { photoBlobUrl: 'https://s.blob.vercel-storage.com/documents/a-1' }, // même URL qu'un document → dédup
      ],
    })
    // 3 fichiers distincts (le doublon d'URL est retiré, la photo nulle ignorée).
    expect(cibles).toHaveLength(3)
    expect(cibles.map((c) => c.source)).toEqual(['document', 'photoMembre', 'avatarUtilisateur'])
    expect(cibles.map((c) => c.cheminLocal)).toEqual(['documents/a-1', 'membres/photo-2', 'avatars/av-3'])
  })

  it('rend une liste vide quand rien n’est référencé (anti-vacant : pas de crash)', () => {
    expect(construireCibles({ documents: [], photosMembre: [], avatars: [] })).toEqual([])
  })
})
