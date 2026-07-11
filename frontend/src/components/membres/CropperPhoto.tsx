import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type SyntheticEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'

/**
 * Recadreur de photo LÉGER (sans dépendance) : glisser pour déplacer, curseur pour zoomer, sortie
 * CARRÉE (JPEG). Le viewport carré EST le cadre de recadrage ; à la validation, la portion visible
 * est redessinée sur un canvas `OUT×OUT` → blob. Évite d'ajouter une lib de crop.
 */
const VP = 280 // viewport carré (px écran)
const OUT = 512 // taille de sortie (px)

export function CropperPhoto({
  fichier,
  onValider,
  onAnnuler,
  enCours = false,
}: {
  fichier: File
  onValider: (blob: Blob) => void
  onAnnuler: () => void
  enCours?: boolean
}) {
  const { t } = useTranslation()
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [src, setSrc] = useState<string | null>(null)
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(fichier)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [fichier])

  const base = nat ? Math.max(VP / nat.w, VP / nat.h) : 1
  const scale = base * zoom
  const imgW = nat ? nat.w * scale : VP
  const imgH = nat ? nat.h * scale : VP

  const clamp = (x: number, y: number, w: number, h: number) => ({
    x: Math.min(0, Math.max(VP - w, x)),
    y: Math.min(0, Math.max(VP - h, y)),
  })

  const onImgLoad = (e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const w = img.naturalWidth
    const h = img.naturalHeight
    setNat({ w, h })
    const b = Math.max(VP / w, VP / h)
    setPos({ x: (VP - w * b) / 2, y: (VP - h * b) / 2 }) // centré
    setZoom(1)
  }

  // Re-borne la position quand le zoom change (l'image doit toujours couvrir le viewport).
  useEffect(() => {
    if (!nat) return
    setPos((p) => clamp(p.x, p.y, imgW, imgH))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, nat])

  const onDown = (e: ReactPointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y }
  }
  const onMove = (e: ReactPointerEvent) => {
    if (!drag.current) return
    const nx = drag.current.ox + (e.clientX - drag.current.px)
    const ny = drag.current.oy + (e.clientY - drag.current.py)
    setPos(clamp(nx, ny, imgW, imgH))
  }
  const onUp = (e: ReactPointerEvent) => {
    drag.current = null
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
  }

  const valider = () => {
    const img = imgRef.current
    if (!img || !nat) return
    const canvas = document.createElement('canvas')
    canvas.width = OUT
    canvas.height = OUT
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // Portion de l'image (coords natives) sous le viewport → dessinée en OUT×OUT.
    const sx = -pos.x / scale
    const sy = -pos.y / scale
    const s = VP / scale
    ctx.drawImage(img, sx, sy, s, s, 0, 0, OUT, OUT)
    canvas.toBlob(
      (blob) => {
        if (blob) onValider(blob)
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">{t('membres.photo.recadrer.aide')}</p>
      <div
        className="relative mx-auto touch-none select-none overflow-hidden rounded-2xl border border-hairline bg-surface-2"
        style={{ width: VP, height: VP, cursor: 'grab' }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {src && (
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={onImgLoad}
            style={{ position: 'absolute', left: pos.x, top: pos.y, width: imgW, height: imgH, maxWidth: 'none' }}
          />
        )}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-faint">{t('membres.photo.recadrer.zoom')}</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          aria-label={t('membres.photo.recadrer.zoom')}
          className="flex-1 accent-brass"
        />
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onAnnuler}>
          {t('membres.photo.recadrer.annuler')}
        </Button>
        <Button type="button" icon={Check} loading={enCours} onClick={valider}>
          {t('membres.photo.recadrer.valider')}
        </Button>
      </div>
    </div>
  )
}

export default CropperPhoto
