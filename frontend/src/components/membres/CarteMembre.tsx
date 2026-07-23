import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import type { CarteApercu } from '@/lib/api'
import { Button } from '@/components/ui/Button'
import { NkoniMark } from '@/components/ui/NkoniMark'
import { StatutCotisationBadge } from '@/components/membres/StatutBadges'

/**
 * Carte de membre — rendu VISUEL dans l'app (« voir sa carte »). Reprend l'identité « Menthe &
 * Encre » du PDF : bandeau dégradé émeraude→or (comme le logo), avatar (photo ou initiales), QR
 * de vérification (image rendue côté serveur, même URL signée que le PDF). Le bouton télécharge la
 * version PDF officielle. Purement présentationnel : la photo (object URL) et le handler de
 * téléchargement sont fournis par le parent.
 */
export function CarteMembre({
  apercu,
  photoUrl,
  onTelecharger,
  telechargement,
}: {
  apercu: CarteApercu
  photoUrl: string | null
  onTelecharger: () => void
  telechargement: boolean
}) {
  const { t } = useTranslation()
  const initiales = `${apercu.prenom[0] ?? ''}${apercu.nom[0] ?? ''}`.toUpperCase()

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-2/50 shadow-lg">
        {/* Bandeau organisation (dégradé émeraude→or, identique au logo). Texte encre foncée pour
            un contraste AA sur l'aplat clair. */}
        <div
          className="flex items-center gap-2.5 px-5 py-3"
          style={{ background: 'linear-gradient(100deg, #2f9e73, #e0bd6f)' }}
        >
          <NkoniMark className="h-6 w-6" />
          <span className="min-w-0 flex-1 truncate text-sm font-semibold tracking-wide text-[#04210f]">
            {apercu.orgNom}
          </span>
          {apercu.estChef && (
            <span className="shrink-0 rounded-full bg-[#04210f]/15 px-2.5 py-0.5 text-xs font-semibold text-[#04210f]">
              ★ {apercu.chefSurnom ?? t('monEspace.carte.chef')}
            </span>
          )}
        </div>

        {/* Corps : avatar · identité · QR (repli sous l'identité si l'espace manque). */}
        <div className="flex flex-wrap items-start gap-4 p-5">
          <div className="h-20 w-16 shrink-0 overflow-hidden rounded-xl border border-hairline bg-brass/15">
            {photoUrl ? (
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xl font-bold text-brass">
                {initiales}
              </div>
            )}
          </div>

          <div className="min-w-[8rem] flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber">
              {t('monEspace.carte.membreLabel')}
            </p>
            <p className="mt-1 truncate text-lg font-bold text-foreground">{apercu.nom.toUpperCase()}</p>
            <p className="truncate text-sm text-muted-foreground">{apercu.prenom}</p>
            <p className="mt-2 text-xs text-faint">
              {apercu.branche ? `${t('monEspace.carte.branche')} : ${apercu.branche} · ` : ''}
              {t('monEspace.carte.depuis')} <span className="num">{apercu.anneeAdhesion}</span>
            </p>
            <div className="mt-2">
              <StatutCotisationBadge statut={apercu.statutCotisation} size="sm" />
            </div>
          </div>

          <div className="shrink-0 text-center">
            {/* Pastille blanche : scannabilité garantie même sur fond teinté. */}
            <div className="inline-block rounded-lg bg-white p-1.5">
              <img src={apercu.qrDataUrl} alt="" className="h-20 w-20" />
            </div>
            <p className="mx-auto mt-1 w-24 text-[0.6rem] leading-tight text-faint">
              {t('monEspace.carte.scanner')}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={Download}
          loading={telechargement}
          onClick={onTelecharger}
        >
          {t('monEspace.carte.telecharger')}
        </Button>
      </div>
    </div>
  )
}

export default CarteMembre
