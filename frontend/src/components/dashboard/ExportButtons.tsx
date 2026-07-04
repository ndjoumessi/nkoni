import { useState } from 'react'
import { FileSpreadsheet, FileText, Loader2 } from 'lucide-react'
import { downloadExportContributions, ApiError } from '@/lib/api'
import { useAuth } from '@/contexts/auth-context'

/**
 * Boutons d'export des contributions (§5.9), PDF et Excel. Affiché uniquement pour les
 * rôles autorisés (vues COMPLET/FINANCIER). Le téléchargement est un fetch authentifié
 * (token en mémoire) → Blob → enregistrement forcé (cf. downloadExportContributions).
 */
export function ExportButtons({ annee }: { annee?: number }) {
  const { accessToken } = useAuth()
  const [enCours, setEnCours] = useState<'xlsx' | 'pdf' | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  const exporter = async (format: 'xlsx' | 'pdf') => {
    if (!accessToken) return
    setErreur(null)
    setEnCours(format)
    try {
      await downloadExportContributions({ format, annee }, accessToken)
    } catch (e) {
      setErreur(e instanceof ApiError ? e.message : 'Échec de l’export.')
    } finally {
      setEnCours(null)
    }
  }

  const btn =
    'inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-60'

  return (
    <section className="rounded-2xl border border-white/12 bg-white/[0.06] p-5 backdrop-blur-xl">
      <h2 className="text-xs uppercase tracking-wider text-white/40">Exporter les contributions</h2>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          className={btn}
          disabled={enCours !== null}
          onClick={() => exporter('xlsx')}
        >
          {enCours === 'xlsx' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
          )}
          Excel
        </button>
        <button
          type="button"
          className={btn}
          disabled={enCours !== null}
          onClick={() => exporter('pdf')}
        >
          {enCours === 'pdf' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <FileText className="h-4 w-4" aria-hidden="true" />
          )}
          PDF
        </button>
      </div>
      {erreur && <p className="mt-3 text-sm text-rose-300">{erreur}</p>}
    </section>
  )
}

export default ExportButtons
