import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarClock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { ApiError, platformApi, type ApercuProlongation, type PlatformOrganisation } from '@/lib/api'
import { PERIODES_PROLONGATION, type PeriodeProlongation } from '@/lib/forfait'
import { cn, formatDateApp } from '@/lib/utils'
import { BadgeEcheance } from './BadgeEcheance'

interface Props {
  org: PlatformOrganisation
  accessToken: string
  /** Reçoit la vue d'organisation renvoyée par le serveur après une prolongation réussie. */
  onProlonge: (organisation: ApercuProlongation['organisation']) => void
  /**
   * Un changement de forfait est en cours d'écriture ailleurs dans la fiche (sélecteur optimiste de
   * `SuperAdminPage`) : tant que c'est vrai, ne PAS lancer d'aperçu — il partirait sur un
   * `org.forfait` pas encore confirmé en base (ex. encore GRATUIT juste après un PATCH vers PRO
   * optimiste) et échouerait en 409 sans jamais se relancer tout seul. L'aperçu reprend dès que le
   * PATCH se termine (`enAttente` passe à `false`, dans les dépendances de l'effet).
   */
  enAttente?: boolean
}

/**
 * Prolongation de l'échéance du forfait, intégrée à la fiche d'organisation (spec 1.1 §4.2). La fiche
 * étant déjà une `Modal`, pas de seconde modale : deux pièges de focus ne s'empilent pas. La nouvelle
 * date affichée vient d'un APERÇU SERVEUR (même fonction que l'écriture) : jamais d'écart entre ce qui
 * est annoncé et ce qui est écrit — l'écriture renvoie d'ailleurs EXACTEMENT les chaînes ISO de
 * l'aperçu (`echeanceActuelle`/`nouvelleEcheance`), le serveur les revérifie en ms.
 */
export function ProlongationForfait({ org, accessToken, onProlonge, enAttente = false }: Props) {
  const { t } = useTranslation()
  const toast = useToast()
  const [mois, setMois] = useState<PeriodeProlongation>(1)
  const [apercu, setApercu] = useState<ApercuProlongation | null>(null)
  const [erreurApercu, setErreurApercu] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  // Relance l'aperçu après un échec d'écriture (dont 409 de concurrence) : la base a pu changer sans
  // que `org` (prop) ne le reflète encore ; incrémenté dans le seul `catch` de `prolonger`.
  const [revision, setRevision] = useState(0)
  const gratuit = org.forfait === 'GRATUIT'

  // Aperçu à chaque durée choisie, après prolongation (l'échéance a changé → nouvel aperçu), après un
  // échec d'écriture (`revision`), et à la fin d'un changement de forfait en attente (`enAttente`).
  useEffect(() => {
    if (gratuit || enAttente) return
    let actif = true
    setApercu(null)
    setErreurApercu(null)
    platformApi
      .prolongerForfait(org.id, mois, true, accessToken)
      .then((r) => {
        if (!actif) return
        setApercu(r)
        // La fiche peut porter une échéance périmée (autre onglet, écriture pas encore répercutée
        // ici) : l'aperçu vient de relire la base, on la remonte pour resynchroniser la fiche. La
        // passe suivante de cet effet (redéclenchée par `org.forfaitExpireLe`) sera alors égale —
        // pas de boucle.
        if (r.organisation.forfaitExpireLe !== org.forfaitExpireLe) {
          onProlonge(r.organisation)
        }
      })
      .catch((err: unknown) => {
        if (actif) setErreurApercu(err instanceof ApiError ? err.message : t('superAdmin.toast.reessayer'))
      })
    return () => {
      actif = false
    }
    // onProlonge volontairement hors dépendances : callback recréé à chaque rendu du parent, l'y
    // ajouter redéclencherait un aperçu à chaque rendu plutôt qu'aux seuls changements pertinents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org.id, org.forfaitExpireLe, mois, gratuit, enAttente, accessToken, t, revision])

  const prolonger = async () => {
    if (!apercu) return
    setEnCours(true)
    try {
      const r = await platformApi.prolongerForfait(org.id, mois, false, accessToken, {
        echeanceAttendue: apercu.echeanceActuelle,
        nouvelleEcheanceAttendue: apercu.nouvelleEcheance,
      })
      onProlonge(r.organisation)
      toast.success(t('superAdmin.prolongation.succes'), formatDateApp(r.nouvelleEcheance))
    } catch (err) {
      toast.error(
        t('superAdmin.prolongation.echec'),
        err instanceof ApiError ? err.message : t('superAdmin.toast.reessayer'),
      )
      // Échec (dont 409 de concurrence) : l'aperçu affiché n'est plus fiable, en relancer un.
      setRevision((r) => r + 1)
    } finally {
      setEnCours(false)
    }
  }

  return (
    <div className="rounded-xl border border-hairline p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-2xs font-medium uppercase tracking-[0.12em] text-faint">
          {t('superAdmin.prolongation.titre')}
        </span>
        <BadgeEcheance etat={org.etatForfait} joursRestants={org.joursRestants} expireLe={org.forfaitExpireLe} />
      </div>

      {gratuit ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('superAdmin.prolongation.gratuit')}</p>
      ) : (
        <div className="mt-3 space-y-3">
          <fieldset>
            <legend className="text-sm text-muted-foreground">{t('superAdmin.prolongation.duree')}</legend>
            <div className="mt-2 grid grid-cols-4 gap-2">
              {PERIODES_PROLONGATION.map((p) => (
                <label
                  key={p}
                  className={cn(
                    'flex h-11 cursor-pointer items-center justify-center rounded-lg border text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brass/60',
                    mois === p
                      ? 'border-brass/60 bg-brass/10 text-foreground'
                      : 'border-hairline text-muted-foreground hover:bg-surface-2',
                  )}
                >
                  <input
                    type="radio"
                    name={`prolongation-${org.id}`}
                    value={p}
                    checked={mois === p}
                    onChange={() => setMois(p)}
                    className="sr-only"
                  />
                  {t('superAdmin.prolongation.mois', { count: p })}
                </label>
              ))}
            </div>
          </fieldset>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            {enAttente
              ? t('superAdmin.prolongation.calcul')
              : (erreurApercu ??
                (apercu
                  ? t('superAdmin.prolongation.apercu', { date: formatDateApp(apercu.nouvelleEcheance) })
                  : t('superAdmin.prolongation.calcul')))}
          </p>
          <div className="flex justify-end">
            <Button icon={CalendarClock} loading={enCours} disabled={enAttente || apercu === null} onClick={prolonger}>
              {t('superAdmin.prolongation.bouton', { count: mois })}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
