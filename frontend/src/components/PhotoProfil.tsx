import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Trash2, UserCircle } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import { moiApi, ApiError } from '@/lib/api'
import { useToast } from '@/components/ui/Toast'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/**
 * Photo de profil — SELF-SERVICE (§4.11). Le membre gère SA photo via /moi/photo (résolue depuis
 * son compte, pas un id d'URL). Affichée seulement si le compte a une fiche membre liée (un compte
 * purement administratif n'a pas de photo) : on le détecte via /moi/situation, qui fournit aussi
 * les initiales de repli. Contrôles alignés sur les garde-fous serveur : JPEG/PNG, ≤ 5 Mo.
 */

const TAILLE_MAX = 5 * 1024 * 1024
const TYPES = ['image/jpeg', 'image/png']

export function PhotoProfil() {
  const { t } = useTranslation()
  const { accessToken } = useAuth()
  const toast = useToast()
  const [aFiche, setAFiche] = useState(false)
  const [initiales, setInitiales] = useState('')
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const urlRef = useRef<string | null>(null)

  // Remplace l'aperçu en révoquant l'object URL précédent (pas de fuite mémoire).
  const poserPhoto = (blob: Blob | null) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = blob ? URL.createObjectURL(blob) : null
    setPhotoUrl(urlRef.current)
  }

  useEffect(() => {
    if (!accessToken) return
    let actif = true
    void (async () => {
      try {
        const s = await moiApi.situation(accessToken)
        if (!actif) return
        setAFiche(true)
        setInitiales(`${s.membre.prenom[0] ?? ''}${s.membre.nom[0] ?? ''}`.toUpperCase())
      } catch {
        if (actif) setAFiche(false)
        return
      }
      try {
        const blob = await moiApi.photo(accessToken)
        if (actif) poserPhoto(blob)
      } catch {
        /* aucune photo → initiales */
      }
    })()
    return () => {
      actif = false
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [accessToken])

  const surFichier = async (e: ChangeEvent<HTMLInputElement>) => {
    const fichier = e.target.files?.[0]
    e.target.value = '' // autorise la re-sélection du même fichier
    if (!fichier || !accessToken) return
    if (!TYPES.includes(fichier.type)) {
      toast.error(t('profil.photo.typeInvalide'))
      return
    }
    if (fichier.size > TAILLE_MAX) {
      toast.error(t('profil.photo.tropVolumineux'))
      return
    }
    setEnCours(true)
    try {
      await moiApi.televerserPhoto(fichier, accessToken)
      poserPhoto(await moiApi.photo(accessToken))
      toast.success(t('profil.photo.succes'))
    } catch (err) {
      toast.error(t('profil.photo.erreur'), err instanceof ApiError ? err.message : '')
    } finally {
      setEnCours(false)
    }
  }

  const retirer = async () => {
    if (!accessToken) return
    setEnCours(true)
    try {
      await moiApi.supprimerPhoto(accessToken)
      poserPhoto(null)
      toast.success(t('profil.photo.succesRetrait'))
    } catch (err) {
      toast.error(t('profil.photo.erreur'), err instanceof ApiError ? err.message : '')
    } finally {
      setEnCours(false)
    }
  }

  if (!aFiche) return null

  return (
    <Card className="nk-reveal nk-d1 mt-6 p-6">
      <div className="flex items-center gap-2">
        <UserCircle className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>{t('profil.photo.titre')}</Overline>
      </div>
      <div className="mt-4 flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-hairline bg-brass/15">
          {photoUrl ? (
            <img src={photoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl font-bold text-brass">
              {initiales}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" icon={Camera} loading={enCours} onClick={() => inputRef.current?.click()}>
              {photoUrl ? t('profil.photo.changer') : t('profil.photo.ajouter')}
            </Button>
            {photoUrl && (
              <Button type="button" variant="ghost" size="sm" icon={Trash2} disabled={enCours} onClick={retirer}>
                {t('profil.photo.retirer')}
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-faint">{t('profil.photo.contrainte')}</p>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={surFichier}
      />
    </Card>
  )
}

export default PhotoProfil
