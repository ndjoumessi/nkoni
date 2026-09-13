import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { prefersReducedMotion } from '@/lib/utils'

// Générés par `scripts/demo-video/` (base FICTIVE, jamais de données réelles), une vidéo PAR LANGUE :
// interface et légendes incrustées sont filmées dans la langue. Hors précache PWA : `globPatterns` ne
// couvre pas le mp4, l'application installée ne s'alourdit pas de 1,4 Mo par langue.
const VIDEOS = {
  fr: { source: '/demo/nkoni-demo.mp4', apercu: '/demo/nkoni-demo-apercu.jpg' },
  en: { source: '/demo/nkoni-demo-en.mp4', apercu: '/demo/nkoni-demo-en-apercu.jpg' },
} as const
const ID_TRANSCRIPTION = 'video-demo-transcription'

/**
 * Démonstration vidéo de la page d'accueil : boucle muette dans un cadre de téléphone.
 *
 * Trois règles tenues ici :
 * - Rien n'est téléchargé tant que la vidéo n'est pas à l'écran (`preload="none"` + aperçu) : sur
 *   données mobiles, la page d'accueil ne paie pas une vidéo que le visiteur ne regarde pas.
 * - Lecture AUTOMATIQUE seulement si la vidéo est visible ET que le visiteur n'a pas demandé la
 *   réduction des animations ; hors écran, elle se met en pause.
 * - Un contenu animé de plus de 5 s doit pouvoir être arrêté (WCAG 2.2.2) : bouton Pause/Lecture.
 *   Une pause VOLONTAIRE n'est jamais annulée par un retour à l'écran.
 */
export function VideoDemo() {
  const { t, i18n } = useTranslation()
  // Changer de langue remplace la source : la vidéo repart au début, dans la nouvelle langue.
  const { source, apercu } = VIDEOS[i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'fr']
  const video = useRef<HTMLVideoElement>(null)
  const [enLecture, setEnLecture] = useState(false)
  const pauseVolontaire = useRef(prefersReducedMotion())

  useEffect(() => {
    const el = video.current
    if (!el) return
    // React ne reflète pas `muted` en attribut : iOS exige la PROPRIÉTÉ pour autoriser `play()`.
    el.muted = true
    if (typeof IntersectionObserver === 'undefined') return
    const observateur = new IntersectionObserver(
      ([entree]) => {
        if (entree?.isIntersecting) {
          if (!pauseVolontaire.current) el.play().catch(() => undefined)
        } else {
          el.pause()
        }
      },
      { threshold: 0.4 },
    )
    observateur.observe(el)
    return () => observateur.disconnect()
  }, [])

  const basculer = () => {
    const el = video.current
    if (!el) return
    if (el.paused) {
      pauseVolontaire.current = false
      el.play().catch(() => undefined)
    } else {
      pauseVolontaire.current = true
      el.pause()
    }
  }

  const points = [
    t('landing.demo.points.tableauDeBord'),
    t('landing.demo.points.versement'),
    t('landing.demo.points.membre'),
  ]

  return (
    <section id="demo" className="mx-auto max-w-6xl scroll-mt-8 px-6 pt-24">
      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
        <div className="text-center lg:text-left">
          <p className="text-2xs font-medium uppercase tracking-[0.16em] text-brass/80">
            {t('landing.demo.overline')}
          </p>
          <h2 className="mt-3 text-balance font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            {t('landing.demo.titre')}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground lg:mx-0">
            {t('landing.demo.description')}
          </p>
          <ul className="mx-auto mt-8 max-w-md space-y-3 text-left lg:mx-0">
            {points.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-foreground">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brass/15 text-brass">
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                {point}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="relative isolate w-full max-w-[18rem] sm:max-w-[19rem]">
            <div
              aria-hidden="true"
              className="absolute -inset-8 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--brass)_22%,transparent),transparent)]"
            />
            <div className="rounded-[2.4rem] border border-hairline-strong bg-surface p-2 shadow-2xl">
              <video
                ref={video}
                className="block aspect-[720/1558] w-full rounded-[1.9rem] bg-canvas object-cover"
                src={source}
                poster={apercu}
                muted
                loop
                playsInline
                preload="none"
                aria-label={t('landing.demo.videoLabel')}
                aria-describedby={ID_TRANSCRIPTION}
                onPlay={() => setEnLecture(true)}
                onPause={() => setEnLecture(false)}
              />
            </div>
          </div>
          <Button variant="outline" size="sm" icon={enLecture ? Pause : Play} onClick={basculer}>
            {enLecture ? t('landing.demo.pause') : t('landing.demo.lecture')}
          </Button>
          <p id={ID_TRANSCRIPTION} className="sr-only">
            {t('landing.demo.transcription')}
          </p>
        </div>
      </div>
    </section>
  )
}
