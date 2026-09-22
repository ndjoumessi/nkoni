import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { PagePublique } from '@/components/public/PagePublique'
import { useChromePublic } from '@/components/public/chrome-public'
import { formatDate } from '@/lib/utils'

/**
 * Coquille des MENTIONS LÉGALES — seule page légale restée en JSX français (les CGU et la politique
 * de confidentialité sont désormais de la donnée traduite, cf. `content/legal/`).
 *
 * C'est délibéré : les mentions légales répondent à une obligation du droit français (LCEN,
 * art. 6-III) et n'ont pas de portée pour un lecteur anglophone ; les traduire ajouterait un texte
 * à faire relire sans bénéfice. La page le DIT quand l'interface est en anglais, au lieu de laisser
 * le lecteur buter sur du français sans explication.
 *
 * Le chrome (lien de retour, date de mise à jour, sélecteur de langue pour un visiteur) est lui
 * traduit : il vient de `PagePublique` + `useChromePublic`, partagés avec l'aide.
 */
export function PageLegale({
  titre,
  /** Date ISO (`AAAA-MM-JJ`) : formatée dans la langue de lecture, jamais rédigée à la main. */
  majLe,
  children,
}: {
  titre: string
  majLe: string
  children: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const chrome = useChromePublic()
  const enAnglais = i18n.language.toLowerCase().startsWith('en')

  return (
    <PagePublique titre={titre} sousTitre={t('legal.majLe', { date: formatDate(majLe) })} {...chrome}>
      <div className="mt-8 space-y-9">
        {enAnglais && (
          <p
            role="note"
            className="flex gap-2.5 rounded-xl border border-hairline bg-surface-2/50 p-4 text-sm text-muted-foreground"
          >
            <Languages className="mt-0.5 h-4 w-4 shrink-0 text-brass" aria-hidden="true" />
            <span>{t('legal.mentionsFrancaisUniquement')}</span>
          </p>
        )}
        {children}
      </div>
    </PagePublique>
  )
}

/** Section légale = titre + corps. */
export function SectionLegale({ titre, children }: { titre: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">{titre}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}

/** Marque un texte À COMPLÉTER (placeholder) — visuellement distinct pour ne pas publier par erreur. */
export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <mark className="rounded bg-amber/20 px-1 py-0.5 font-medium text-amber">[{children}]</mark>
  )
}

export default PageLegale
