// Configuration Vite partagée entre les apps vitrine et manager.
// - Alias `@bs/*` vers le code source TS des packages (pas d'étape de build intermédiaire en R0).
// - Proxy dev : same-origin via `/api`, `/auth`, `/uploads` → backend Express local (pas de CORS).
import { fileURLToPath, URL } from 'node:url';

// Alias vers le DOSSIER src du package (pas index.ts) : Vite résout `index.ts`
// pour l'import nu (`@bs/ui`) et les sous-chemins (`@bs/ui/tokens.css`).
const pkgSrc = (name: string): string =>
  fileURLToPath(new URL(`./packages/${name}/src`, import.meta.url));

export const bsAliases: Record<string, string> = {
  '@bs/config': pkgSrc('config'),
  '@bs/api-client': pkgSrc('api-client'),
  '@bs/auth': pkgSrc('auth'),
  '@bs/ui': pkgSrc('ui'),
};

// Cible du backend Express pour le proxy de dev. Override via VITE_PROXY_TARGET.
export function makeApiProxy(
  target: string = process.env.VITE_PROXY_TARGET || 'http://localhost:3000',
): Record<string, { target: string; changeOrigin: boolean; secure: boolean }> {
  const opts = { target, changeOrigin: true, secure: false };
  // /api = endpoints métier ; /auth = session (login/logout/me) ; /uploads = médias.
  return {
    '/api': opts,
    '/auth': opts,
    '/uploads': opts,
  };
}
