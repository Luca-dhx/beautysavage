import { normalizeHex, type PartialThemeTokens } from '@bs/ui';
import type { PublicVitrineTheme } from '@bs/api-client';

// Adapte le thème vitrine backend (couleurs simples) vers une surcharge partielle de tokens React.
// Les couleurs sont normalisées (hex valide) ; tout le reste retombe sur defaultVitrineTheme.
export function mapVitrineThemeToTokens(theme?: PublicVitrineTheme | null): PartialThemeTokens {
  if (!theme) return {};
  const c = theme.colors ?? {};
  const d = theme.derivedTokens ?? {};
  const colors: PartialThemeTokens['colors'] = {};

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

  // Tokens dérivés : accent backend si fourni, sinon color-mix (comme le Vanilla).
  const accent = normalizeHex(d.accent);
  if (accent) colors.accent = accent;
  else if (primary && secondary) colors.accent = `color-mix(in oklab, ${primary} 70%, ${secondary} 30%)`;

  return Object.keys(colors).length ? { colors } : {};
}
