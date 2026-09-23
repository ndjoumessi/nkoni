import { useContext, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AuthContext } from '@/contexts/auth-context'
import { LangueToggle } from '@/components/ui/LangueToggle'
import { cheminApresConnexion } from '@/lib/roles'

/**
 * Chrome des pages PUBLIQUES (`/aide/*`, pages légales, `/statut`), qui dépend de QUI lit :
 *
 * - **Connecté** (y compris en démonstration) : le retour mène à SON application
 *   (`cheminApresConnexion`), pas à l'accueil public — arrivé par le menu « Aide », il y retournait
 *   sinon par la page marketing. Pas de sélecteur de langue : la page suit déjà la langue de son
 *   compte, et `LangueToggle` ne persiste qu'en local — basculer ici désaccorderait l'interface de la
 *   préférence serveur, rétablie au prochain chargement.
 * - **Visiteur** (lien partagé, « je n'arrive pas à me connecter ») : retour à l'accueil, et
 *   sélecteur de langue visible — c'est son seul moyen de changer de langue avant toute connexion.
 * - **Session PAS ENCORE TRANCHÉE** (`loading`) : retour à l'accueil, mais **aucun sélecteur**.
 *   `AuthProvider` démarre à `user = null, loading = true` et ne peuple `user` qu'au retour du
 *   rafraîchissement silencieux : sans ce troisième cas, un utilisateur DÉJÀ connecté recevait le
 *   chrome du visiteur pendant tout l'aller-retour. Le sélecteur y est le vrai danger — cliqué
 *   dans cette fenêtre, il écrit en `localStorage` une langue qui contredit la préférence serveur,
 *   exactement ce que la règle ci-dessus interdit. Le lien de retour, lui, reste offert : c'est
 *   l'échappatoire de la page, et `/` n'est faux pour personne au point de la retirer.
 *
 * Lecture du contexte par `useContext` et non `useAuth()` : ces pages sont publiques, un contexte
 * absent vaut « visiteur » au lieu de lever. Partagé par l'aide, les pages légales ET la page de
 * statut : un visiteur arrivé sur les CGU depuis le pied de page doit pouvoir les lire dans sa
 * langue, et celui qui vient vérifier si le service est en cause n'a pas d'autre page où basculer.
 * Seul le COMPORTEMENT de l'en-tête est partagé — `/statut` garde sa coquille (mesure plus étroite,
 * sur-titre), n'étant pas une page de texte long.
 */
export function useChromePublic(): { retourVers: string; retourLibelle: string; actions?: ReactNode } {
  const { t } = useTranslation()
  const auth = useContext(AuthContext)
  if (auth?.user) {
    return { retourVers: cheminApresConnexion(auth.user.role), retourLibelle: t('aideDoc.retourApplication') }
  }
  // Hors provider (`auth` absent), il n'y a aucune session à attendre : c'est un visiteur.
  if (auth?.loading) {
    return { retourVers: '/', retourLibelle: t('aideDoc.retour') }
  }
  return { retourVers: '/', retourLibelle: t('aideDoc.retour'), actions: <LangueToggle /> }
}
