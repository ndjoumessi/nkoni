import { request } from './core'
import type { AuthUser, InscriptionInput, LangueResponse, LoginResponse, RefreshResponse } from './core'

export const authApi = {
  // `rememberMe` allonge la durée de la session (refresh 30 j au lieu de 7 j) côté back.
  // Le mot de passe n'est JAMAIS transmis pour être stocké : il ne sert qu'à cette requête.
  login: (email: string, password: string, rememberMe: boolean) =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      json: { email, password, rememberMe },
    }),
  // Auto-inscription publique : crée l'organisation + l'admin fondateur et connecte
  // directement (même forme de réponse qu'un login : accessToken + user + cookie refresh).
  inscription: (input: InscriptionInput) =>
    request<LoginResponse>('/organisations/inscription', { method: 'POST', json: input }),
  refresh: (signal?: AbortSignal) =>
    request<RefreshResponse>('/auth/refresh', { method: 'POST', signal }),
  me: (accessToken: string, signal?: AbortSignal) =>
    request<AuthUser>('/auth/me', { accessToken, signal }),
  // Préférence de langue perso (§4) : persiste côté serveur et réémet un access token portant
  // la nouvelle langue (le front remplace son token en mémoire).
  setLangue: (langue: 'FR' | 'EN', accessToken: string) =>
    request<LangueResponse>('/auth/me/langue', {
      method: 'PATCH',
      json: { langue },
      accessToken,
    }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  // Changement self-service : l'utilisateur connecté change SON propre mot de passe.
  // L'ancien est vérifié côté back (401 si incorrect).
  changerMotDePasse: (
    ancienMotDePasse: string,
    nouveauMotDePasse: string,
    accessToken: string,
  ) =>
    request<void>('/auth/changer-mot-de-passe', {
      method: 'POST',
      json: { ancienMotDePasse, nouveauMotDePasse },
      accessToken,
    }),
}
