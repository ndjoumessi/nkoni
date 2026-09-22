import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { PagePublique } from '@/components/public/PagePublique'
import { useChromePublic } from '@/components/public/chrome-public'
import { ErrorState } from '@/components/ui/ErrorState'
import { RenduLegal } from '@/components/legal/RenduLegal'
import { chargerTexteLegal, langueTexteLegal, type TexteLegal } from '@/content/legal/registre'
import type { DocumentLegal } from '@/content/legal/types'
import { formatDate } from '@/lib/utils'

type Etat = { statut: 'chargement' } | { statut: 'pret'; document: DocumentLegal } | { statut: 'erreur' }

/**
 * Page d'un texte légal (`/cgu`, `/confidentialite`) — charge son document À LA DEMANDE dans la
 * langue de lecture et le recharge si la langue change (même schéma que `GuidePage`).
 *
 * La date de dernière mise à jour est formatée depuis l'ISO stocké dans le document, jamais
 * recopiée en toutes lettres dans chaque langue : sur un document opposable, la date engage, et
 * deux chaînes rédigées à la main finiraient par diverger.
 */
export function TexteLegalPage({ texte }: { texte: TexteLegal }) {
  const { t, i18n } = useTranslation()
  const chrome = useChromePublic()
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' })
  const traduction = langueTexteLegal(i18n.language) !== 'fr'

  useEffect(() => {
    let actif = true
    setEtat({ statut: 'chargement' })
    chargerTexteLegal(texte, i18n.language)
      .then((document) => {
        if (actif) setEtat({ statut: 'pret', document })
      })
      .catch(() => {
        if (actif) setEtat({ statut: 'erreur' })
      })
    return () => {
      actif = false
    }
  }, [texte, i18n.language])

  if (etat.statut === 'chargement') {
    return (
      <PagePublique titre={t('legal.chargementTitre')} {...chrome}>
        <div className="mt-10 flex items-center justify-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-brass" aria-hidden="true" />
          {t('legal.chargement')}
        </div>
      </PagePublique>
    )
  }

  if (etat.statut === 'erreur') {
    return (
      <PagePublique titre={t('legal.chargementTitre')} {...chrome}>
        <div className="mt-10">
          <ErrorState
            title={t('legal.erreurTitre')}
            description={t('legal.erreurDescription')}
            // L'échec le plus probable est un chunk périmé après un déploiement : rejouer le même
            // `import()` échouerait encore. Même reprise que `ErrorBoundary` (rechargement dur).
            onRetry={() => window.location.reload()}
            retryLabel={t('commun.erreurFatale.recharger')}
          />
        </div>
      </PagePublique>
    )
  }

  return (
    <PagePublique
      titre={etat.document.titre}
      sousTitre={t('legal.majLe', { date: formatDate(etat.document.majLe) })}
      {...chrome}
    >
      <RenduLegal document={etat.document} traduction={traduction} />
    </PagePublique>
  )
}

export default TexteLegalPage
