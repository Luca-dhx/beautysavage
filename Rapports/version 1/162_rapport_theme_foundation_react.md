# 162 — Rapport : fondation de thème React (vitrine + panel)

> Système de thème React **deux scopes** (vitrine / panel), couleurs centralisées en tokens (jamais
> en dur dans les composants). **Zéro changement backend**, Vanilla intact, **pas de R2 checkout**.
> Branche `phase-0-security-baseline`. Suite des audits 160 (Vanilla) / 161 (plan Theme Studio Dev).

## Objectif

Avant R2 : unifier le thème React. La vitrine doit utiliser le **thème vitrine** (piloté backend),
le panel Manager/Dev un **thème panel distinct**, sans hardcoder de couleur dans les composants, et
préparer une configuration future depuis le panel Dev.

## 1. Audit (rapport 160 — synthèse)

- Backend : `models/Theme.js` (`colors{primary,secondary,background,surface,text}` + `derivedTokens`),
  public `GET /api/vitrine/theme`, CRUD `/api/gestion/themes` **dev-only**. Le **Vanilla partage un
  seul thème** vitrine + gestion (CSS vars `--color-*`/`--theme-*`).
- React (R0/R1) : `@bs/ui/tokens.css` avec préfixe `--bs-*`, hex en dur dans `:root` + quelques
  décoratifs. Aucun système de scope.

## 2. Modèle cible (`@bs/ui/src/theme/`)

- `themeTypes.ts` : `ThemeScope = 'vitrine'|'panel'`, `ThemeColors` (background, surface,
  surfaceElevated, text, textMuted, primary, primaryHover, secondary, accent, border, success,
  warning, danger), `ThemeSpacing` (x1..x4), `ThemeTokens` (colors + radius + shadow + font +
  spacing), `PartialThemeTokens`, `ThemeConfig`.
- `defaultVitrineTheme.ts` : violet/rose (aligné `THEME_DEFAULTS` Vanilla).
- `defaultPanelTheme.ts` : bleu/ardoise (**distinct**, sobre, dense).
- `themeCssVariables.ts` : `themeToCssVars` (tokens → `--bs-*`), `applyThemeVars(tokens, el?)`,
  `mergeTheme(base, override)`, `normalizeHex`.
- `ThemeProvider.tsx` : `ThemeProvider scope theme? target?` — fusionne le défaut du scope avec la
  surcharge et applique les CSS vars sur `<html>` (ou `target`). Contexte `{scope, tokens}`.
- `useThemeTokens.ts` : hook (fallback vitrine hors provider, jamais d'erreur).

### Mapping CSS variables (canonique)
`--bs-color-{background,surface,surface-elevated,text,muted,primary,primary-hover,secondary,accent,
border,success,warning,danger}`, `--bs-radius`, `--bs-shadow`, `--bs-font-sans`, `--bs-space-1..4`.
`tokens.css :root` fournit les **fallbacks** ; le `ThemeProvider` les **réécrit** à l'exécution.

## 3. Récupération backend (`@bs/api-client/catalog/theme.ts`)

`getVitrineTheme()` → `GET /api/vitrine/theme` → `PublicVitrineTheme` (forme **neutre**, pas de
dépendance à `@bs/ui` : préserve le layering). Tolérant (tout optionnel). **Pas d'endpoint panel**
créé (cf. plan 161). Fallback géré par l'appelant.

## 4. Application du thème

- **Vitrine** (`apps/vitrine/src/main.tsx`) : `VitrineThemeProvider` (TanStack Query `getVitrineTheme`,
  `retry:false`) → `mapVitrineThemeToTokens` (normalise les hex, dérive `primaryHover`/`accent` en
  `color-mix`) → `ThemeProvider scope="vitrine"`. **Fallback** `defaultVitrineTheme` si l'API échoue
  (non bloquant).
- **Manager** (`apps/manager/src/main.tsx`) : `ThemeProvider scope="panel"` + `defaultPanelTheme`.
- **`@bs/ui`** : tous les composants (Button, Card, AppShell, CatalogueCard, PriceLabel, MediaImage,
  banner, hero…) lisent les CSS vars `--bs-*`. Décoratifs auparavant en dur (`.bs-hero`, `.bs-banner`,
  `.bs-media__placeholder`) **tokenisés** via `color-mix`. **Aucun hex dans les `.tsx`** (vérifié).

## 5. Configuration future Dev (plan, NON implémenté — rapport 161)

`ThemeConfig{scope, tokens}` ; endpoints futurs `GET /api/gestion/dev/themes`,
`GET/PUT /api/gestion/dev/themes/:scope` (**dev only**) ; validation couleurs, versioning/historique
optionnel, preview live (réutilise `applyThemeVars(tokens, previewEl)`). UI `/dev/theme-studio`.
**Rien de tout cela n'est créé dans ce sprint** (fondation seule).

## 6. Tests (38 verts ; +12 vs R1)

- `packages/ui/src/theme/theme.test.tsx` (7) : `themeToCssVars` (toutes vars), `mergeTheme`,
  `normalizeHex`, `ThemeProvider` applique scope vitrine/panel + surcharge.
- `apps/vitrine/src/features/theme/theme.test.tsx` (4) : adapter ({}/hex invalides), fallback défaut
  si API KO, couleur backend appliquée.
- `apps/manager/src/theme.test.tsx` (1) : dashboard rendu + `defaultPanelTheme` (distinct vitrine).
- `npm run react:test` 38 verts · `react:lint` vert · `typecheck` vert · `react:build` (2 apps) OK.

## 7. Backend (inchangé)

`npm test` (394) + `audit:business-scenarios` (36) + `audit:commissions` (20) restent verts. Aucun
fichier backend modifié.

## 8. Limites

- Panel : pas d'endpoint backend → `defaultPanelTheme` fait foi (Theme Studio Dev = futur).
- Vitrine : mapping partiel du `Theme` existant (5 couleurs + accent dérivé) ; les tokens étendus
  (warning, surfaceElevated, radius, shadow, spacing) viennent du défaut React.
- Theme Studio Dev non implémenté (plan 161 uniquement).

## 9. Règle d'équipe

**Tout sprint React qui touche l'UI lit les tokens (`--bs-*`) ; jamais de couleur hex en dur dans un
composant.** Les nouveaux tokens passent par `ThemeTokens` + `themeToCssVars`.

## 10. Prochaine mission — React R2A

Panier + **checkout** + **paiement Stripe Checkout hébergé** : consommer `{ mode:'hosted', url }` de
`create-checkout-session` (flag `CHECKOUT_HOSTED`) → redirection ; `{ mode:'free' }` → finalize-free
(0 €). Les pages checkout hériteront automatiquement du thème vitrine.
