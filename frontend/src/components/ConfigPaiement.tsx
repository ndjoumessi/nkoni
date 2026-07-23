import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CreditCard } from 'lucide-react'
import { useAuth } from '@/contexts/auth-context'
import {
  organisationApi,
  messageErreur,
  type ConfigPaiement as Config,
  type PspProvider,
  type EnvironnementPsp,
} from '@/lib/api'
import { Card, Overline } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select } from '@/components/ui/Field'
import { PasswordInput } from '@/components/ui/PasswordInput'
import { Toggle } from '@/components/ui/Toggle'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'

/**
 * Config du paiement en ligne (§ paiement) — ADMIN/PRESIDENT. Chaque organisation branche SON compte
 * PSP : l'argent va directement à l'asso, NKONI n'est jamais custodian. Le secret (clé API) n'est
 * JAMAIS renvoyé par le serveur ni préaffiché ; le modifier exige de le ressaisir (PUT = remplacement).
 */
export function ConfigPaiement() {
  const { t } = useTranslation()
  const { accessToken } = useAuth()
  const toast = useToast()

  const [config, setConfig] = useState<Config | null>(null)
  const [provider, setProvider] = useState<PspProvider>('FAPSHI')
  const [apiUser, setApiUser] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [token, setToken] = useState('')
  const [environnement, setEnvironnement] = useState<EnvironnementPsp>('SANDBOX')
  const [actif, setActif] = useState(false)
  const [enregistrement, setEnregistrement] = useState(false)
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

  const enregistrer = async () => {
    if (!accessToken) return
    setErreur(null)
    const identifiants: Record<string, string> =
      provider === 'FAPSHI'
        ? { apiUser: apiUser.trim(), apiKey: apiKey.trim(), environnement }
        : { token: token.trim() }
    setEnregistrement(true)
    try {
      const c = await organisationApi.enregistrerConfigPaiement({ provider, identifiants, actif }, accessToken)
      setConfig(c)
      // Ne pas conserver le secret dans l'état du formulaire après enregistrement.
      setApiKey('')
      setToken('')
      toast.success(t('parametres.paiement.succes'))
    } catch (e) {
      const msg = messageErreur(e)
      setErreur(msg)
      toast.error(t('parametres.paiement.echec'), msg)
    } finally {
      setEnregistrement(false)
    }
  }

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

      <div className="mt-4 space-y-4">
        <Field label={t('parametres.paiement.provider')}>
          <Select value={provider} onChange={(e) => setProvider(e.target.value as PspProvider)}>
            <option value="FAPSHI">Fapshi</option>
            <option value="CAMPAY">CamPay</option>
          </Select>
        </Field>

        {provider === 'FAPSHI' ? (
          <>
            <Field label={t('parametres.paiement.apiUser')}>
              <Input value={apiUser} onChange={(e) => setApiUser(e.target.value)} autoComplete="off" placeholder="FAK…" />
            </Field>
            <Field
              label={t('parametres.paiement.apiKey')}
              hint={config?.configure ? t('parametres.paiement.secretMasque') : undefined}
            >
              <PasswordInput value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" placeholder="••••••••" />
            </Field>
            <Field label={t('parametres.paiement.environnement')}>
              <Select value={environnement} onChange={(e) => setEnvironnement(e.target.value as EnvironnementPsp)}>
                <option value="SANDBOX">{t('parametres.paiement.sandbox')}</option>
                <option value="LIVE">{t('parametres.paiement.live')}</option>
              </Select>
            </Field>
          </>
        ) : (
          <Field
            label={t('parametres.paiement.token')}
            hint={config?.configure ? t('parametres.paiement.secretMasque') : undefined}
          >
            <PasswordInput value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" placeholder="••••••••" />
          </Field>
        )}

        <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-2/40 p-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{t('parametres.paiement.activer')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('parametres.paiement.activerAide')}</p>
          </div>
          <Toggle checked={actif} onChange={setActif} aria-label={t('parametres.paiement.activer')} />
        </div>

        {erreur && (
          <p role="alert" className="rounded-xl border border-terra/30 bg-terra/10 px-3.5 py-2.5 text-sm text-terra">
            {erreur}
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
