import { getCachedSystemConfiguration } from './systemConfigurationService.js';
import { stripTrailingSlash } from './systemUrlValidation.js';

// S1 — DomainResolver : SOURCE UNIQUE de résolution des URLs publiques.
// TOUTE URL générée par le métier (mails, factures, QR, cartes cadeaux, notifications,
// portail client, checkout, planning…) passe par ce résolveur.
//
// Interdiction côté métier : `process.env.APP_BASE_URL` / `NGROK_DOMAIN` en direct.
// Ce module est la SEULE couche infra autorisée à les lire (en fallback de la config DB).
//
// Lecture SYNCHRONE : s'appuie sur le cache mémoire de systemConfigurationService
// (chargé au boot). Si le cache est vide (tests, boot avant DB), bascule sur l'env →
// comportement strictement identique à l'ancien getAppBaseUrl() (PARTIE 10).

const DEFAULT_BASE_URL = 'http://localhost:4000';

/** Base publique de fallback issue de l'environnement (jamais de config métier ici). */
function envFallbackBaseUrl() {
  // 1) Surcharge env historique (honorée par le resolver uniquement, plus dans le .env).
  const appBase = stripTrailingSlash(process.env.APP_BASE_URL || '');
  if (appBase) return appBase;
  // 2) Tunnel de dev.
  const ngrok = String(process.env.NGROK_DOMAIN || '').trim();
  if (ngrok) return `https://${stripTrailingSlash(ngrok).replace(/^https?:\/\//i, '')}`;
  // 3) Défaut local.
  return DEFAULT_BASE_URL;
}

/** Base de la VITRINE (site public client). */
export function resolveVitrineBaseUrl() {
  const cfg = getCachedSystemConfiguration();
  const fromDb = cfg?.domains?.vitrineUrl ? stripTrailingSlash(cfg.domains.vitrineUrl) : '';
  return fromDb || envFallbackBaseUrl();
}

/** Base du PANEL (manager admin/dev). En mono-domaine (pas de config), = base publique. */
export function resolvePanelBaseUrl() {
  const cfg = getCachedSystemConfiguration();
  const fromDb = cfg?.domains?.panelUrl ? stripTrailingSlash(cfg.domains.panelUrl) : '';
  return fromDb || resolveVitrineBaseUrl();
}

/**
 * Base publique « par défaut » (= vitrine). C'est l'équivalent direct de l'ancien
 * getAppBaseUrl() : l'hôte qui sert le backend et les pages publiques.
 */
export function resolvePublicBaseUrl() {
  return resolveVitrineBaseUrl();
}

function joinPath(base, path) {
  const cleanBase = stripTrailingSlash(base);
  if (!path) return cleanBase;
  const p = String(path).trim();
  if (!p) return cleanBase;
  return `${cleanBase}/${p.replace(/^\/+/, '')}`;
}

/** URL absolue sur la vitrine (ex. resolveVitrineUrl('vitrine.html?page=x')). */
export function resolveVitrineUrl(path = '') {
  return joinPath(resolveVitrineBaseUrl(), path);
}

/** URL absolue sur le panel (ex. resolvePanelUrl('gestion.html?module=x')). */
export function resolvePanelUrl(path = '') {
  return joinPath(resolvePanelBaseUrl(), path);
}

/** URL absolue sur la base publique (alias vitrine). */
export function resolvePublicUrl(path = '') {
  return joinPath(resolvePublicBaseUrl(), path);
}

export default {
  resolveVitrineBaseUrl,
  resolvePanelBaseUrl,
  resolvePublicBaseUrl,
  resolveVitrineUrl,
  resolvePanelUrl,
  resolvePublicUrl
};
