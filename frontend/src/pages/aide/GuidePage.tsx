import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { PagePublique } from '@/components/public/PagePublique'
import { useChromePublic } from '@/components/public/chrome-public'
import { ErrorState } from '@/components/ui/ErrorState'
import { RenduDoc } from '@/components/aide/RenduDoc'
import { chargerDocument, type Guide } from '@/content/aide/registre'
import { cleI18n } from '@/lib/i18n'
import type { Document } from '@/content/aide/types'

type Etat =
  | { statut: 'chargement' }
  | { statut: 'pret'; document: Document }
  | { statut: 'erreur' }

/**
 * Page d'un guide d'aide (`/aide/membre|bureau|faq`) — charge son document À LA DEMANDE (le
 * contenu ne fait pas partie du paquet initial, cf. `registre.ts`) et le recharge si la langue
 * change en cours de lecture (`i18n.language` en dépendance).
 */
export function GuidePage({ guide }: { guide: Guide }) {
  const { t, i18n } = useTranslation()
  const chrome = useChromePublic()
  const { hash } = useLocation()
  const [etat, setEtat] = useState<Etat>({ statut: 'chargement' })

  useEffect(() => {
    let actif = true
    setEtat({ statut: 'chargement' })
    chargerDocument(guide, i18n.language)
      .then((document) => {
        if (actif) setEtat({ statut: 'pret', document })
      })
      .catch(() => {
        if (actif) setEtat({ statut: 'erreur' })
      })
    return () => {
      actif = false
    }
  }, [guide, i18n.language])

  // Défilement vers l'ancre (§A4) : le contenu arrive APRÈS `PagePublique.scrollTo(0, 0)`
  // (chargement dynamique), donc rien ne relit le hash sans cet effet — et il doit s'exécuter
  // APRÈS le rendu des sections (dépendance sur `etat`, pas sur le seul montage), sinon l'élément
  // ciblé n'existe pas encore dans le DOM. Un hash sans section correspondante ne fait rien.
  useEffect(() => {
    if (etat.statut !== 'pret' || !hash) return
    const cible = document.getElementById(hash.slice(1))
    cible?.scrollIntoView()
  }, [etat, hash])

  const titreGuide = t(cleI18n(`aideDoc.guides.${guide}.titre`))

  if (etat.statut === 'chargement') {
    return (
      <PagePublique titre={titreGuide} {...chrome}>
        <div className="mt-10 flex items-center justify-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-brass" aria-hidden="true" />
          {t('aideDoc.chargement')}
        </div>
      </PagePublique>
    )
  }

  if (etat.statut === 'erreur') {
    return (
      <PagePublique titre={titreGuide} {...chrome}>
        <div className="mt-10">
          <ErrorState
            title={t('aideDoc.erreurTitre')}
            description={t('aideDoc.erreurDescription')}
            // L'échec le plus probable est un chunk périmé après un déploiement : relancer le même
            // `import()` échouerait à nouveau. Même reprise que `ErrorBoundary` (rechargement dur),
            // et son libellé i18n plutôt qu'une clé neuve.
            onRetry={() => window.location.reload()}
            retryLabel={t('commun.erreurFatale.recharger')}
          />
        </div>
      </PagePublique>
    )
  }

  return (
    <PagePublique titre={etat.document.titre} {...chrome}>
      <RenduDoc document={etat.document} libelleSommaire={t('aideDoc.sommaire')} />
    </PagePublique>
  )
}

export default GuidePage
