import { useEffect, useState } from 'react'
import { membresApi } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Avatar d'un membre : PHOTO (Blob privé récupéré via le proxy authentifié → objectURL) si elle
 * existe, sinon les INITIALES sur fond menthe. `refreshKey` force un re-fetch après upload/suppression.
 * L'objectURL est révoqué au démontage / changement pour éviter les fuites mémoire.
 */
export function AvatarMembre({
  membreId,
  nom,
  prenom,
  accessToken,
  refreshKey = 0,
  size = 88,
  className,
}: {
  membreId: string
  nom: string
  prenom: string
  accessToken: string | null
  refreshKey?: number
  size?: number
  className?: string
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    let actif = true
    let objectUrl: string | null = null
    setUrl(null)
    membresApi
      .chargerPhoto(membreId, accessToken)
      .then((blob) => {
        if (!actif) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch(() => {
        if (actif) setUrl(null) // 404 = aucune photo → initiales
      })
    return () => {
      actif = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [membreId, accessToken, refreshKey])

  const initiales = `${prenom[0] ?? ''}${nom[0] ?? ''}`.toUpperCase()

  return (
    <div
      className={cn('overflow-hidden rounded-2xl border border-hairline bg-brass/10', className)}
      style={{ width: size, height: size }}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center font-display font-semibold text-brass" style={{ fontSize: size * 0.34 }}>
          {initiales}
        </div>
      )}
    </div>
  )
}

export default AvatarMembre
