import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { downloadExportContributions, ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'
import { useToast } from '@/components/ui/Toast'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

/**
 * Boutons d'export des contributions (§5.9), PDF et Excel. Le téléchargement est un fetch
 * authentifié (token en mémoire) → Blob → enregistrement forcé. Feedback via toasts.
 */
export function ExportButtons({ annee }: { annee?: number }) {
  const { t } = useTranslation()
  const { accessToken } = useAuth()
  const toast = useToast()
  const [enCours, setEnCours] = useState<'xlsx' | 'pdf' | null>(null)

  const exporter = async (format: 'xlsx' | 'pdf') => {
    if (!accessToken) return
    setEnCours(format)
    try {
      await downloadExportContributions({ format, annee }, accessToken)
      toast.success(t('dashboard.export.pretTitre'), t('dashboard.export.pretDetail', { format: format.toUpperCase() }))
    } catch (e) {
      toast.error(t('dashboard.export.echec'), e instanceof ApiError ? e.message : t('dashboard.export.reessayez'))
    } finally {
      setEnCours(null)
    }
  }

  return (
    <Card className="p-5">
      <Overline>{t('dashboard.export.titre')}</Overline>
      <div className="mt-4 flex flex-wrap gap-3">
        <Button
          variant="outline"
          icon={FileSpreadsheet}
          loading={enCours === 'xlsx'}
          disabled={enCours !== null}
          onClick={() => exporter('xlsx')}
        >
          {t('dashboard.export.excel')}
        </Button>
        <Button
          variant="outline"
          icon={FileText}
          loading={enCours === 'pdf'}
          disabled={enCours !== null}
          onClick={() => exporter('pdf')}
        >
          {t('dashboard.export.pdf')}
        </Button>
      </div>
    </Card>
  )
}

export default ExportButtons
