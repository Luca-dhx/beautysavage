# 160 — Audit thème Vanilla → fondation thème React

> Audit du système de thème/couleurs existant (Vanilla + backend) avant la fondation de thème React
> (deux scopes : vitrine / panel). Branche `phase-0-security-baseline`.

## 1. Source actuelle des couleurs (backend)

- **Modèle** `models/Theme.js` : `name` (unique), `colors{ primary, secondary, background, surface,
  text }` (requis), `derivedTokens{ surfaceHeader, accent, accentStrong }` (nullable),
  `logoUrl`, `slogan`, `isActive`, timestamps.
- **Endpoint public** `GET /api/vitrine/theme` → `getActiveTheme` / `buildThemePayload` :
  `{ ok, theme:{ id, name, colors{primary,secondary,background,surface,text},
  derivedTokens{surfaceHeader,accent,accentStrong}, logoUrl, slogan, isActive, createdAt } }`.
- **CRUD admin/dev** `routers/themeRouter.js` monté sur `/api/gestion/themes` — **DEV ONLY**
  (`requireStrictDev`, admin exclu) : `GET /`, `POST /`, `PUT /:id`, `POST /:id/activate`.
- **Module d'édition** `public/js/modules/themeManagerModule.js` (panel dev) : édite
  `primary/secondary/background/surface/text` + `surfaceHeader/accent/accentStrong` (auto color-mix
  ou override manuel) + `name/slogan/logoUrl`.
- **Site identity** (`/api/vitrine/site-identity` → `{siteName, logoUrlResolved}`) = **séparé** du
  thème (logo/nom), pas des couleurs.

## 2. Comment Vanilla applique le thème

`public/js/vitrine.js` : `loadTheme()` → `fetch('/api/vitrine/theme')` → `applyTheme(theme)` qui fait
`document.documentElement.style.setProperty(...)`. Defaults JS `THEME_DEFAULTS = { primary:'#5f4ff7',
secondary:'#f24692', background:'#f5f4ef', surface:'#ffffff', text:'#0f172a' }`. Tokens dérivés
calculés en `color-mix(in oklab, ...)`.

**⚠️ Le panel gestion partage le MÊME thème** : `public/js/gestion.js` lit le même
`/api/vitrine/theme` (`ACTIVE_THEME_ENDPOINT = '/api/vitrine/theme'`) et `public/css/gestion.css`
ré-utilise les mêmes vars (`--bg: var(--color-background)`, `--brand: var(--color-primary)`, …). Il
n'existe **pas** de thème panel distinct aujourd'hui.

## 3. Variables CSS existantes

### Vanilla `public/css/app.css` (`:root`)
Theme-driven (réécrites par JS) : `--color-primary`, `--color-secondary`, `--color-background`,
`--color-surface`, `--color-text`, `--theme-surface-header`, `--theme-accent`, `--theme-accent-strong`.
Statiques : `--color-border`, `--color-muted`, `--color-danger`, `--color-success`, `--color-shadow`,
`--font-family`.

### React `@bs/ui/src/tokens.css` (R0) — préfixe **`--bs-`**
`--bs-color-primary/secondary/success/danger/text/muted/surface/background/border`, `--bs-radius`,
`--bs-space-1..4`, `--bs-font-sans`. **Valeurs hex en dur dans `:root`** (fallback) ; les composants
lisent déjà ces vars (pas de hex inline dans les .tsx), mais quelques règles CSS décoratives
(`.bs-hero`, `.bs-banner`, `.bs-media__placeholder`) contiennent des littéraux rgba/hex → à tokeniser.

## 4. Table de correspondance

| Variable / couleur | Source actuelle | Utilisée où | Vitrine/Panel | À migrer React ? | Remarque |
|---|---|---|---|---|---|
| `primary` `#5f4ff7` | Theme.colors / `/api/vitrine/theme` | vitrine + gestion | les deux (partagé) | **Oui** (vitrine charge backend) | panel React aura SON défaut distinct |
| `secondary` `#f24692` | Theme.colors | boutons, accents | les deux | Oui | |
| `background` `#f5f4ef` | Theme.colors | fond global | les deux | Oui | |
| `surface` `#ffffff` | Theme.colors | cartes/panneaux | les deux | Oui | |
| `text` `#0f172a` | Theme.colors | texte | les deux | Oui | |
| `surfaceHeader` (derived) | Theme.derivedTokens / color-mix | en-têtes | les deux | Oui (recalcul possible) | auto si non fourni |
| `accent` / `accentStrong` (derived) | Theme.derivedTokens / color-mix | accents | les deux | Oui | auto color-mix |
| `border` `rgba(15,15,15,.12)` | app.css `:root` (statique) | bordures | les deux | Oui (token) | non éditable backend |
| `muted` | app.css `:root` | texte secondaire | les deux | Oui (token `textMuted`) | |
| `danger` `#dc2626` / `success` `#1f7a3a` | app.css `:root` | états | les deux | Oui (tokens) | non éditables backend |
| `warning` | (absent) | — | — | **Nouveau token React** | défaut React |
| `surfaceElevated` / `primaryHover` | (absent) | — | — | **Nouveaux tokens React** | défauts React |
| `--font-family` Inter | app.css | global | les deux | Oui (`font`) | |
| logo / siteName | SiteIdentity (séparé) | header/footer | les deux | (hors thème couleurs) | déjà géré R1 |

## 5. Limites & risques

- **Pas de thème panel distinct** côté backend : la décision produit (panel ≠ vitrine) n'a **pas**
  d'endpoint dédié. → React : `defaultPanelTheme` local, endpoint futur `/api/gestion/dev/themes/:scope`
  (plan rapport 161). Ne **pas** créer cet endpoint maintenant.
- Préfixe divergent : Vanilla `--color-*` / React `--bs-color-*`. On garde `--bs-*` côté React
  (indépendance, pas de collision avec le Vanilla servi séparément).
- Hex en dur dans quelques règles CSS décoratives React → tokeniser (règle « pas de hex dans les
  composants »).
- Ne pas casser le Vanilla : on **ne touche pas** à `app.css` / `gestion.css` / `vitrine.js`.

## 6. À reprendre en React / à améliorer

- **Reprendre** : couleurs vitrine depuis `/api/vitrine/theme` (mapping → tokens React), tokens
  dérivés via color-mix (fallback), application par CSS variables sur `document.documentElement`.
- **Améliorer** : deux scopes explicites (`vitrine` / `panel`), modèle de tokens étendu
  (surfaceElevated, primaryHover, accent, textMuted, warning, radius, shadow, font, spacing),
  **aucune couleur en dur dans les composants** (lecture CSS vars seulement), fallback systématique
  (jamais bloquant), préparation d'un Theme Studio Dev (rapport 161).

## 7. Décision pour la fondation React (R-Theme)

- `@bs/ui/src/theme/` : `themeTypes`, `defaultVitrineTheme`, `defaultPanelTheme`,
  `themeCssVariables` (tokens → `--bs-*`), `ThemeProvider` (applique les vars sur le root + contexte),
  `useThemeTokens`.
- Vitrine : `ThemeProvider scope="vitrine"` + chargement `/api/vitrine/theme` (fallback défaut).
- Manager : `ThemeProvider scope="panel"` + `defaultPanelTheme` (endpoint dev futur).
- Composants `@bs/ui` : lecture exclusive des CSS vars `--bs-*` (fallbacks dans `:root`).
