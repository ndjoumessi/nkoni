import { useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthContext } from '@/contexts/auth-context'
import { LangueToggle } from '@/components/ui/LangueToggle'
import { cheminApresConnexion } from '@/lib/roles'

/**
 * Chrome des pages PUBLIQUES de texte long (`/aide/*`, pages légales), qui dépend de QUI lit :
 *
 * - **Connecté** (y compris en démonstration) : le retour mène à SON application
 *   (`cheminApresConnexion`), pas à l'accueil public — arrivé par le menu « Aide », il y retournait
 *   sinon par la page marketing. Pas de sélecteur de langue : la page suit déjà la langue de son
 *   compte, et `LangueToggle` ne persiste qu'en local — basculer ici désaccorderait l'interface de la
 *   préférence serveur, rétablie au prochain chargement.
 * - **Visiteur** (lien partagé, « je n'arrive pas à me connecter ») : retour à l'accueil, et
 *   sélecteur de langue visible — c'est son seul moyen de changer de langue avant toute connexion.
 *
 * Lecture du contexte par `useContext` et non `useAuth()` : ces pages sont publiques, un contexte
 * absent vaut « visiteur » au lieu de lever. Partagé par l'aide ET les pages légales : un visiteur
 * arrivé sur les CGU depuis le pied de page doit pouvoir les lire dans sa langue.
 */
export function useChromePublic(): { retourVers: string; retourLibelle: string; actions?: ReactNode } {
  const { t } = useTranslation()
  const auth = useContext(AuthContext)
  if (auth?.user) {
    return { retourVers: cheminApresConnexion(auth.user.role), retourLibelle: t('aideDoc.retourApplication') }
  }
  return { retourVers: '/', retourLibelle: t('aideDoc.retour'), actions: <LangueToggle /> }
}
