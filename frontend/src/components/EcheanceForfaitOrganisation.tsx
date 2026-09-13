import { useTranslation } from 'react-i18next'
import { Mail } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button-variants'
import { BadgeEcheance } from '@/components/plateforme/BadgeEcheance'
import type { OrganisationCourante } from '@/lib/api'
import type { EtatForfait } from '@/lib/forfait'
import { CONTACT_EMAIL } from '@/lib/contact'
import { cleI18n } from '@/lib/i18n'
import { formatDateApp } from '@/lib/utils'

/**
 * Échéance du forfait de l'organisation courante (spec 1.1 §4.3) — affichage seul, valeurs calculées
 * par le serveur. Rien sans échéance. Hors période « actif », explication + contact de renouvellement
 * (vente assistée : pas de paiement dans l'application).
 *
 * Front déployé AVANT le backend (B2) : une ancienne API ne renvoie pas encore ces champs
 * (`undefined`, pas `null`) — `== null` couvre les deux, alors qu'un `=== null` strict aurait laissé
 * passer un affichage incohérent (état indéfini traité comme un état connu).
 */
export function EcheanceForfaitOrganisation({ org }: { org: OrganisationCourante }) {
  const { t } = useTranslation()
  const etat = org.etatForfait as EtatForfait | null | undefined
  if (etat == null || etat === 'SANS_ECHEANCE' || org.forfaitExpireLe == null) return null

  const forfait = t(cleI18n(`commun.forfaits.${org.forfait}`))
  const date = formatDateApp(org.forfaitExpireLe)
  const sujet = t('parametres.forfait.sujetRenouvellement', { nom: org.nom })
  // Échéance PASSÉE (grâce ou expiré) : « valable jusqu'au <date passée> » serait faux.
  const echu = etat === 'GRACE' || etat === 'EXPIRE'

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-hairline p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-foreground">
          {t(echu ? 'parametres.forfait.echuLe' : 'parametres.forfait.valableJusquau', { forfait, date })}
        </p>
        <BadgeEcheance etat={etat} joursRestants={org.joursRestants} expireLe={org.forfaitExpireLe} masquerDate />
      </div>
      {etat !== 'ACTIF' && (
        <>
          <p className="text-sm text-muted-foreground">
            {t(cleI18n(`parametres.forfait.explication.${etat}`), {
              forfait,
              date,
              fin: formatDateApp(org.finGraceLe),
            })}
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(sujet)}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Mail className="h-4 w-4" aria-hidden="true" />
            {t('parametres.forfait.renouveler')}
          </a>
        </>
      )}
    </div>
  )
}
