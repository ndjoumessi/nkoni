import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Download, FileText, Image as ImageIcon, Paperclip, Trash2, Upload, X } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  documentsApi,
  ApiError,
  messageErreur,
  type DocumentMeta,
  type EntiteDocument,
} from '@/lib/api'
import { formatDateFR, focusPremierChampInvalide } from '@/lib/utils'
import { useToast } from '@/components/ui/Toast'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input } from '@/components/ui/Field'

const TAILLE_MAX = 10 * 1024 * 1024 // 10 Mo
const MIMES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
}
const ACCEPT = '.pdf,.jpg,.jpeg,.png,.docx,' + Object.keys(MIMES).join(',')

function formatTaille(octets: number): string {
  if (octets < 1024) return `${octets} o`
  if (octets < 1024 * 1024) return `${(octets / 1024).toFixed(0)} Ko`
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`
}

function IconeFichier({ mime }: { mime: string }) {
  const Icon = mime.startsWith('image/') ? ImageIcon : FileText
  return <Icon className="h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
}

/**
 * Section « Documents » réutilisable, rattachée à une entité (Membre/Réunion/Conflit/
 * Commémoration). La liste est filtrée CÔTÉ SERVEUR selon la visibilité héritée du parent ;
 * le téléchargement passe par le proxy authentifié (l'URL blob n'est jamais exposée).
 */
export function DocumentsSection({
  entiteType,
  entiteId,
  canManage,
}: {
  entiteType: EntiteDocument
  entiteId: string
  canManage: boolean
}) {
  const { accessToken } = useAuth()
  const toast = useToast()

  const [docs, setDocs] = useState<DocumentMeta[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const uploadFormRef = useRef<HTMLFormElement>(null)
  const [selection, setSelection] = useState<File | null>(null)
  const [nom, setNom] = useState('')
  const [description, setDescription] = useState('')
  const [errNom, setErrNom] = useState<string | undefined>(undefined)
  const [uploading, setUploading] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [downloadId, setDownloadId] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken || !entiteId) return
    const controller = new AbortController()
    let active = true
    setError(null)
    void (async () => {
      try {
        const data = await documentsApi.listByEntite(entiteType, entiteId, accessToken, controller.signal)
        if (active) setDocs(data)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (active) setError(messageErreur(e))
      }
    })()
    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, entiteType, entiteId])

  const choisir = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de re-sélectionner le même fichier
    if (!file) return
    // Pré-validation client (le serveur reste l'autorité).
    if (!MIMES[file.type]) {
      toast.error('Type non autorisé', 'PDF, JPEG, PNG ou DOCX uniquement.')
      return
    }
    if (file.size > TAILLE_MAX) {
      toast.error('Fichier trop volumineux', '10 Mo maximum.')
      return
    }
    setSelection(file)
    setNom(file.name)
  }

  const annuler = () => {
    setSelection(null)
    setNom('')
    setDescription('')
    setErrNom(undefined)
  }

  const televerser = async (e: FormEvent) => {
    e.preventDefault()
    if (!accessToken || !selection) return
    // Validation inline du nom + focus (§8).
    const eNom = nom.trim().length === 0 ? 'Le nom est requis.' : undefined
    setErrNom(eNom)
    if (eNom) {
      requestAnimationFrame(() => focusPremierChampInvalide(uploadFormRef.current))
      return
    }
    setUploading(true)
    try {
      const cree = await documentsApi.upload(
        {
          entiteType,
          entiteId,
          nom: nom.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          file: selection,
        },
        accessToken,
      )
      setDocs((prev) => [cree, ...(prev ?? [])])
      toast.success('Document ajouté', cree.nom)
      annuler()
    } catch (err) {
      toast.error('Téléversement impossible', err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setUploading(false)
    }
  }

  const telecharger = async (doc: DocumentMeta) => {
    if (!accessToken) return
    setDownloadId(doc.id)
    try {
      const blob = await documentsApi.telecharger(doc.id, accessToken)
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener')
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      toast.error('Téléchargement impossible', err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setDownloadId(null)
    }
  }

  const supprimer = async (doc: DocumentMeta) => {
    if (!accessToken) return
    setPendingId(doc.id)
    try {
      await documentsApi.remove(doc.id, accessToken)
      setDocs((prev) => (prev ?? []).filter((d) => d.id !== doc.id))
      toast.success('Document supprimé', doc.nom)
    } catch (err) {
      toast.error('Suppression impossible', err instanceof ApiError ? err.message : messageErreur(err))
    } finally {
      setPendingId(null)
    }
  }

  return (
    <Card className="nk-reveal nk-d3 mt-6 p-6">
      <div className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>Documents</Overline>
      </div>

      {error && <p className="mt-4 text-sm text-terra">{error}</p>}

      {!error && docs && docs.length === 0 && (
        <p className="mt-4 text-sm text-faint">Aucun document rattaché.</p>
      )}

      {!error && docs && docs.length > 0 && (
        <ul className="mt-4 space-y-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-3 rounded-xl border border-hairline bg-surface-2/40 p-3.5"
            >
              <IconeFichier mime={d.typeFichier} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-foreground">{d.nom}</p>
                <p className="mt-0.5 truncate text-xs text-faint">
                  {MIMES[d.typeFichier] ?? d.typeFichier} · {formatTaille(d.tailleOctets)} ·{' '}
                  {formatDateFR(d.dateTeleversement)}
                  {d.televersePar ? ` · ${d.televersePar.email}` : ''}
                </p>
                {d.description && (
                  <p className="mt-1 truncate text-sm text-muted-foreground">{d.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => telecharger(d)}
                disabled={downloadId === d.id}
                aria-label="Télécharger"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:text-brass disabled:opacity-40"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
              </button>
              {canManage && (
                <button
                  type="button"
                  onClick={() => supprimer(d)}
                  disabled={pendingId === d.id}
                  aria-label="Supprimer le document"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-faint transition-colors hover:text-terra disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Zone d'upload (gestionnaires seulement) */}
      {canManage && (
        <div className="mt-5 border-t border-hairline pt-5">
          {!selection ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept={ACCEPT}
                onChange={choisir}
                className="hidden"
              />
              <Button type="button" variant="ghost" icon={Upload} onClick={() => fileRef.current?.click()}>
                Ajouter un document
              </Button>
              <p className="mt-2 text-xs text-faint">PDF, JPEG, PNG ou DOCX · 10 Mo maximum.</p>
            </>
          ) : (
            <form ref={uploadFormRef} onSubmit={televerser} noValidate className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <IconeFichier mime={selection.type} />
                <span className="truncate">
                  {selection.name} · {formatTaille(selection.size)}
                </span>
                <button
                  type="button"
                  onClick={annuler}
                  aria-label="Retirer le fichier"
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-faint hover:text-foreground"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <Field label="Nom" required error={errNom}>
                <Input
                  value={nom}
                  onChange={(e) => {
                    setNom(e.target.value)
                    setErrNom(undefined)
                  }}
                  maxLength={300}
                />
              </Field>
              <Field label="Description" hint="Optionnel.">
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brève description…"
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={annuler}>
                  Annuler
                </Button>
                <Button type="submit" icon={Upload} loading={uploading}>
                  Téléverser
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </Card>
  )
}

export default DocumentsSection
