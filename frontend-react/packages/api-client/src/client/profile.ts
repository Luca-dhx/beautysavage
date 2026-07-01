// RX4 — Profil client. Backend limité à prénom/nom (PUT /api/client/profile). Pas de GET profil : le
// prénom édité est renvoyé par la mise à jour et mémorisé côté hub (cf. audit §0.1). Mot de passe = flux
// reset (POST /auth/password-reset/request).
import { apiPut, apiPost } from '../apiFetch';
import type { ClientProfile } from './types';

/** PUT /api/client/profile — met à jour prénom/nom. Renvoie le profil normalisé. */
export async function updateMyProfile(input: { firstName?: string; lastName?: string }): Promise<ClientProfile> {
  const res = await apiPut<{ ok: boolean; user: ClientProfile }>('/api/client/profile', input);
  return {
    firstName: res.user?.firstName ?? '',
    lastName: res.user?.lastName ?? '',
    email: res.user?.email ?? '',
  };
}

/** POST /auth/password-reset/request — envoie l'e-mail de réinitialisation du mot de passe. */
export async function requestPasswordReset(email: string): Promise<void> {
  await apiPost('/auth/password-reset/request', { email });
}
