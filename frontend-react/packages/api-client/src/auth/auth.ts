// Authentification client léger (R2C). Le cookie de session (HttpOnly) est posé par le backend ;
// React n'écrit JAMAIS de token. getSession/logout vivent dans ../endpoints (réexportés via l'index).
import { apiPost } from '../apiFetch';
import type { Role } from '../types';

export interface LoginResponse {
  ok: boolean;
  role?: Role;
  currentMode?: string;
  mustChangePassword?: boolean;
  /** Cas admin (onboarding) — non utilisé côté client vitrine. */
  blocked?: boolean;
  reason?: string;
}

/** POST /auth/login — pose le cookie de session. Lève ApiError (401) si identifiants invalides. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  return apiPost<LoginResponse>('/auth/login', { email, password });
}
