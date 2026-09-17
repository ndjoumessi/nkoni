import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'
import { PagePublique } from '@/components/public/PagePublique'
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

  const titreGuide = t(cleI18n(`aideDoc.guides.${guide}.titre`))

  if (etat.statut === 'chargement') {
    return (
      <PagePublique titre={titreGuide} retourLibelle={t('aideDoc.retour')}>
        <div className="mt-10 flex items-center justify-center gap-2.5 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-brass" aria-hidden="true" />
          {t('aideDoc.chargement')}
        </div>
      </PagePublique>
    )
  }

  if (etat.statut === 'erreur') {
    return (
      <PagePublique titre={titreGuide} retourLibelle={t('aideDoc.retour')}>
        <div className="mt-10">
          <ErrorState title={t('aideDoc.erreurTitre')} description={t('aideDoc.erreurDescription')} />
        </div>
      </PagePublique>
    )
  }

  return (
    <PagePublique titre={etat.document.titre} retourLibelle={t('aideDoc.retour')}>
      <RenduDoc document={etat.document} libelleSommaire={t('aideDoc.sommaire')} />
    </PagePublique>
  )
}

export default GuidePage
