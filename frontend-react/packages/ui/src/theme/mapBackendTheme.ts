// Mappe un thème backend (couleurs simples + tokens dérivés) vers une surcharge partielle de tokens.
// Entrée STRUCTURELLE (pas de dépendance à @bs/api-client) → réutilisable vitrine ET manager.
import type { PartialThemeTokens } from './themeTypes';
import { normalizeHex } from './themeCssVariables';

export interface BackendThemeInput {
  colors?: {
    primary?: string;
    secondary?: string;
    background?: string;
    surface?: string;
    text?: string;
  };
  derivedTokens?: {
    surfaceHeader?: string;
    accent?: string;
    accentStrong?: string;
  };
}

/** Couleurs hex normalisées ; primaryHover/accent dérivés en color-mix si absents. */
export function mapBackendThemeToTokens(input?: BackendThemeInput | null): PartialThemeTokens {
  if (!input) return {};
  const c = input.colors ?? {};
  const d = input.derivedTokens ?? {};
  const colors: NonNullable<PartialThemeTokens['colors']> = {};

  const primary = normalizeHex(c.primary);
  const secondary = normalizeHex(c.secondary);
  if (primary) {
    colors.primary = primary;
    colors.primaryHover = `color-mix(in oklab, ${primary} 82%, black 18%)`;
  }
  if (secondary) colors.secondary = secondary;
  const bg = normalizeHex(c.background);
  if (bg) colors.background = bg;
  const surface = normalizeHex(c.surface);
  if (surface) {
    colors.surface = surface;
    colors.surfaceElevated = surface;
  }
  const text = normalizeHex(c.text);
  if (text) colors.text = text;

  const accent = normalizeHex(d.accent);
  if (accent) colors.accent = accent;
  else if (primary && secondary) colors.accent = `color-mix(in oklab, ${primary} 70%, ${secondary} 30%)`;

  return Object.keys(colors).length ? { colors } : {};
}
