import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreditCard, Check } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  organisationApi,
  messageErreur,
  type ConfigPaiement as Config,
  type PspProvider,
  type EnvironnementPsp,
} from '@/lib/api'
import { formatDateHeure } from '@/lib/utils'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Toggle } from '@/components/ui/Toggle'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'

/**
 * Config du paiement en ligne (§ paiement) — ADMIN/PRESIDENT. Chaque organisation branche SON compte
 * PSP : l'argent va directement à l'asso, NKONI n'est jamais custodian. Le secret (mot de passe / clé /
 * token) n'est JAMAIS renvoyé par le serveur ni préaffiché ; le modifier exige de le ressaisir
 * (PUT = remplacement). L'écran montre en revanche un RÉCAP lecture seule de ce qui est branché
 * (prestataire, environnement, identifiant public, date) + une confirmation persistante à l'enregistrement.
 */
const LIBELLE_PROVIDER: Record<PspProvider, string> = { FAPSHI: 'Fapshi', CAMPAY: 'CamPay' }

/**
 * Masque partiellement l'identifiant public affiché : il n'est pas LE secret (le mot de passe / la clé
 * l'est), mais c'est la moitié du couple d'auth — en révéler juste assez pour le RECONNAÎTRE, sans
 * l'exposer entier (captures d'écran, épaule). Longueur cachée fixe (ne fuite pas la vraie longueur).
 */
function masquerIdentifiant(id: string | null): string {
  if (!id) return '—'
  if (id.length <= 14) return id
  return `${id.slice(0, 6)}••••••${id.slice(-4)}`
}

export function ConfigPaiement() {
  const { t } = useTranslation()
  const { accessToken } = useAuth()
  const toast = useToast()

  const [config, setConfig] = useState<Config | null>(null)
  const [provider, setProvider] = useState<PspProvider>('FAPSHI')
  const [apiUser, setApiUser] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [campayUsername, setCampayUsername] = useState('')
  const [campayPassword, setCampayPassword] = useState('')
  const [environnement, setEnvironnement] = useState<EnvironnementPsp>('SANDBOX')
  const [actif, setActif] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
  const [enregistre, setEnregistre] = useState(false) // confirmation PERSISTANTE (effacée dès qu'on remodifie)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!accessToken) return
    const controller = new AbortController()
    let vivant = true
    organisationApi
      .configPaiement(accessToken, controller.signal)
      .then((c) => {
        if (!vivant) return
        setConfig(c)
        if (c.provider) setProvider(c.provider)
        if (c.environnement) setEnvironnement(c.environnement)
        setActif(c.actif)
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (vivant) setErreur(messageErreur(e))
      })
    return () => {
      vivant = false
      controller.abort()
    }
  }, [accessToken])

  // Toute modification invalide la confirmation précédente et efface l'erreur (retour visuel honnête :
  // le bandeau « enregistré » ne doit pas survivre à un changement non sauvegardé).
  const marquerModifie = () => {
    if (enregistre) setEnregistre(false)
    if (erreur) setErreur(null)
  }

  const enregistrer = async () => {
    if (!accessToken) return
    setErreur(null)
    const identifiants: Record<string, string> =
      provider === 'FAPSHI'
        ? { apiUser: apiUser.trim(), apiKey: apiKey.trim(), environnement }
        : { username: campayUsername.trim(), password: campayPassword.trim(), environnement }
    setEnregistrement(true)
    try {
      const c = await organisationApi.enregistrerConfigPaiement({ provider, identifiants, actif }, accessToken)
      setConfig(c)
      // Ne pas conserver le secret dans l'état du formulaire après enregistrement.
      setApiKey('')
      setCampayPassword('')
      setEnregistre(true)
      toast.success(t('parametres.paiement.succes'))
    } catch (e) {
      const msg = messageErreur(e)
      setErreur(msg)
      toast.error(t('parametres.paiement.echec'), msg)
    } finally {
      setEnregistrement(false)
    }
  }

  const envLabel = (env: EnvironnementPsp) =>
    env === 'LIVE' ? t('parametres.paiement.live') : t('parametres.paiement.sandbox')

  return (
    <Card className="nk-reveal nk-d4 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <CreditCard className="h-4 w-4 text-brass" aria-hidden="true" />
        <Overline>{t('parametres.paiement.titre')}</Overline>
        {config?.configure && (
          <Badge tone={config.actif ? 'jade' : 'neutral'} size="sm">
            {config.actif ? t('parametres.paiement.actif') : t('parametres.paiement.inactif')}
          </Badge>
        )}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{t('parametres.paiement.description')}</p>

      {/* RÉCAP lecture seule de la config branchée — répond à « on ne voit pas ce qui est configuré ».
          Panneau informatif (distinct d'un champ désactivé) : le secret n'y figure jamais, seulement
          l'identifiant PUBLIC + les méta. */}
      {config?.configure && (
        <dl className="mt-4 space-y-2 rounded-xl border border-hairline bg-surface-2/40 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t('parametres.paiement.provider')}</dt>
            <dd className="font-medium text-foreground">
              {config.provider ? LIBELLE_PROVIDER[config.provider] : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t('parametres.paiement.environnement')}</dt>
            <dd>
              {config.environnement ? (
                <Badge tone={config.environnement === 'LIVE' ? 'jade' : 'neutral'} size="sm">
                  {envLabel(config.environnement)}
                </Badge>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t('parametres.paiement.identifiant')}</dt>
            <dd className="num font-medium text-foreground">{masquerIdentifiant(config.identifiantPublic)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">{t('parametres.paiement.secret')}</dt>
            <dd className="inline-flex items-center gap-1 font-medium text-jade">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              {t('parametres.paiement.secretDefini')}
            </dd>
          </div>
          {config.misAJourLe && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">{t('parametres.paiement.misAJour')}</dt>
              <dd className="text-foreground">{formatDateHeure(config.misAJourLe)}</dd>
            </div>
          )}
        </dl>
      )}

      <div className="mt-4 space-y-4">
        {config?.configure && (
          <p className="text-xs font-medium uppercase tracking-wide text-faint">{t('parametres.paiement.modifier')}</p>
        )}

        <Field label={t('parametres.paiement.provider')}>
          <Select
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value as PspProvider)
              marquerModifie()
            }}
          >
            <option value="FAPSHI">Fapshi</option>
            <option value="CAMPAY">CamPay</option>
          </Select>
        </Field>

        {provider === 'FAPSHI' ? (
          <>
            <Field label={t('parametres.paiement.apiUser')}>
              <Input
                value={apiUser}
                onChange={(e) => {
                  setApiUser(e.target.value)
                  marquerModifie()
                }}
                autoComplete="off"
                placeholder="FAK…"
              />
            </Field>
            <Field
              label={t('parametres.paiement.apiKey')}
              hint={config?.configure ? t('parametres.paiement.secretMasque') : undefined}
            >
              <PasswordInput
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  marquerModifie()
                }}
                autoComplete="off"
                placeholder="••••••••"
              />
            </Field>
            <Field label={t('parametres.paiement.environnement')}>
              <Select
                value={environnement}
                onChange={(e) => {
                  setEnvironnement(e.target.value as EnvironnementPsp)
                  marquerModifie()
                }}
              >
                <option value="SANDBOX">{t('parametres.paiement.sandbox')}</option>
                <option value="LIVE">{t('parametres.paiement.live')}</option>
              </Select>
            </Field>
          </>
        ) : (
          <>
            <Field label={t('parametres.paiement.campayUsername')}>
              <Input
                value={campayUsername}
                onChange={(e) => {
                  setCampayUsername(e.target.value)
                  marquerModifie()
                }}
                autoComplete="off"
                placeholder={t('parametres.paiement.campayUsernamePlaceholder')}
              />
            </Field>
            <Field
              label={t('parametres.paiement.campayPassword')}
              hint={config?.configure ? t('parametres.paiement.secretMasque') : undefined}
            >
              <PasswordInput
                value={campayPassword}
                onChange={(e) => {
                  setCampayPassword(e.target.value)
                  marquerModifie()
                }}
                autoComplete="off"
                placeholder="••••••••"
              />
            </Field>
            <Field label={t('parametres.paiement.environnement')}>
              <Select
                value={environnement}
                onChange={(e) => {
                  setEnvironnement(e.target.value as EnvironnementPsp)
                  marquerModifie()
                }}
              >
                <option value="SANDBOX">{t('parametres.paiement.sandbox')}</option>
                <option value="LIVE">{t('parametres.paiement.live')}</option>
              </Select>
            </Field>
          </>
        )}

        <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-2/40 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t('parametres.paiement.activer')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('parametres.paiement.activerAide')}</p>
          </div>
          <Toggle
            checked={actif}
            onChange={(v) => {
              setActif(v)
              marquerModifie()
            }}
            aria-label={t('parametres.paiement.activer')}
          />
        </div>

        {erreur && (
          <p role="alert" className="rounded-xl border border-terra/30 bg-terra/10 px-3.5 py-2.5 text-sm text-terra">
            {erreur}
          </p>
        )}

        {/* Confirmation PERSISTANTE (pas seulement le toast fugace) — reste jusqu'à la prochaine modif. */}
        {enregistre && !erreur && (
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-xl border border-jade/30 bg-jade/10 px-3.5 py-2.5 text-sm text-jade"
          >
            <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('parametres.paiement.enregistreOk')}
          </p>
        )}

        <div className="flex justify-end">
          <Button type="button" icon={CreditCard} loading={enregistrement} onClick={enregistrer}>
            {t('parametres.paiement.enregistrer')}
          </Button>
        </div>
      </div>
    </Card>
  )
}

export default ConfigPaiement
