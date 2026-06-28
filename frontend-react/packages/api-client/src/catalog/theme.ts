// Thème vitrine public. GET /api/vitrine/theme. Fallback géré par l'appelant (jamais bloquant).
import { apiFetch } from '../apiFetch';
import { asRaw, optStr } from './raw';
import type { PublicVitrineTheme } from './types';

function mapVitrineTheme(input: unknown): PublicVitrineTheme {
  const t = asRaw(input);
  const colors = asRaw(t.colors);
  const derived = asRaw(t.derivedTokens);
  return {
    colors: {
      primary: optStr(colors.primary),
      secondary: optStr(colors.secondary),
      background: optStr(colors.background),
      surface: optStr(colors.surface),
      text: optStr(colors.text),
    },
    derivedTokens: {
      surfaceHeader: optStr(derived.surfaceHeader),
      accent: optStr(derived.accent),
      accentStrong: optStr(derived.accentStrong),
    },
    slogan: optStr(t.slogan),
    logoUrl: optStr(t.logoUrl),
  };
}

export async function getVitrineTheme(signal?: AbortSignal): Promise<PublicVitrineTheme> {
  const res = await apiFetch<{ ok: boolean; theme?: unknown }>('/api/vitrine/theme', { signal });
  return mapVitrineTheme(res.theme);
}

export type ThemeScopeName = 'vitrine' | 'manager';

/**
 * Thème actif d'un scope — `GET /api/theme/:scope` (lecture publique, multi-scope T1).
 * Renvoie null si aucun thème actif pour ce scope (l'appelant retombe sur son défaut).
 */
export async function getThemeByScope(
  scope: ThemeScopeName,
  signal?: AbortSignal,
): Promise<PublicVitrineTheme | null> {
  const res = await apiFetch<{ ok: boolean; scope?: string; theme?: unknown }>(
    `/api/theme/${encodeURIComponent(scope)}`,
    { signal },
  );
  return res.theme ? mapVitrineTheme(res.theme) : null;
}
