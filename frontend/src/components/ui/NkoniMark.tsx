import { useId } from 'react'
import { cn } from '@/lib/utils'

/**
 * Logo NKONI — « Cercle d'union » : les membres (points menthe) réunis autour de la cagnotte
 * commune (pièce centrale émeraude → or), un membre en or au sommet = le chef de l'organisation.
 * Marque réutilisée partout (sidebar, topbar, login, inscription, console plateforme).
 * Dimensionnée par `className` (ex. `h-9 w-9`) ; couleurs figées (identité, app dark-only).
 */
export function NkoniMark({ className }: { className?: string }) {
  const gid = useId()
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn('block shrink-0', className)}
      role="img"
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f9e73" />
          <stop offset="1" stopColor="#e0bd6f" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="#0f1512" />
      <rect x="2" y="2" width="60" height="60" rx="16" stroke="#5fe0ad" strokeOpacity="0.16" />
      <circle cx="32" cy="32" r="18" stroke="#5fe0ad" strokeOpacity="0.35" strokeWidth="2" />
      <circle cx="47.6" cy="23" r="3.6" fill="#5fe0ad" />
      <circle cx="47.6" cy="41" r="3.6" fill="#5fe0ad" />
      <circle cx="32" cy="50" r="3.6" fill="#5fe0ad" />
      <circle cx="16.4" cy="41" r="3.6" fill="#5fe0ad" />
      <circle cx="16.4" cy="23" r="3.6" fill="#5fe0ad" />
      <circle cx="32" cy="14" r="3.9" fill="#e0bd6f" />
      <circle cx="32" cy="32" r="8" fill={`url(#${gid})`} />
    </svg>
  )
}

export default NkoniMark
