# 161 — Plan : Theme Studio Dev (configuration future des thèmes)

> Plan (NON implémenté ici) pour permettre au rôle **dev** de configurer les deux thèmes React
> (vitrine / panel) depuis le panel. La fondation React (rapport 162) lit déjà les CSS variables ;
> ce document décrit l'API et l'UI futures, sans rien créer côté backend maintenant.

## Objectif

Éditer, prévisualiser et activer les tokens de thème par **scope** (`vitrine`, `panel`), avec
versioning léger, validation des couleurs et preview live — réservé au rôle **dev**.

## État actuel (rappel rapport 160)

- Backend : `Theme` model + `/api/vitrine/theme` (public) + CRUD `/api/gestion/themes` **dev-only**
  (`requireStrictDev`). Ce modèle ne couvre que `primary/secondary/background/surface/text` +
  `derivedTokens` — **scope unique** (partagé vitrine + gestion côté Vanilla).
- React : modèle de tokens étendu (`ThemeTokens` : +surfaceElevated, primaryHover, accent, textMuted,
  warning, radius, shadow, font, spacing) avec **deux scopes**. La vitrine consomme `/api/vitrine/theme`
  (mapping partiel) ; le panel utilise `defaultPanelTheme` (aucun endpoint).

## Modèle de données cible

`ThemeConfig { scope: 'vitrine'|'panel', tokens: ThemeTokens }` (type déjà défini dans `@bs/ui`).
Backend (futur) — deux pistes :
1. **Étendre `Theme`** : ajouter `scope: 'vitrine'|'panel'` (+ index `{scope, isActive}`) et les
   nouveaux champs de tokens (surfaceElevated, primaryHover, accent, textMuted, warning, radius,
   shadow, font, spacing). Conserver la rétro-compat du payload `/api/vitrine/theme` existant.
2. **Nouveau modèle `ThemeConfig`** dédié React (laisse `Theme` Vanilla intact). Recommandé pour ne
   pas risquer le Vanilla : `models/ThemeConfig.js { scope, tokens, isActive, version, updatedBy, updatedAt }`.

## Endpoints futurs (dev only — `requireStrictDev`)

| Méthode | Route | Rôle | Effet |
|---|---|---|---|
| `GET` | `/api/gestion/dev/themes` | dev | liste des configs (les 2 scopes + historique) |
| `GET` | `/api/gestion/dev/themes/:scope` | dev | config active d'un scope |
| `PUT` | `/api/gestion/dev/themes/:scope` | dev | met à jour/active une config (crée une nouvelle version) |
| `GET` | `/api/vitrine/theme` | public | **inchangé** (vitrine) — alimenté par la config scope=vitrine |
| (option) `GET` | `/api/gestion/panel-theme` | dev/admin | expose la config scope=panel au panel React |

Permissions : **dev uniquement** en écriture (aligné sur `/api/gestion/themes` actuel). Lecture panel
= dev (et admin si on souhaite que le panel s'auto-thème). **Aucun secret** (couleurs/tokens publics).

## Validation des couleurs

- Hex `#abc`/`#aabbcc` (réutiliser `normalizeHex` de `@bs/ui`), `rgb()/rgba()`, ou `color-mix()`.
- Rejeter toute valeur non reconnue → 400 `INVALID_COLOR` (ne jamais écrire une valeur cassée).
- Contraste minimal (WCAG AA) en avertissement non bloquant (UI).

## Versioning / historique (optionnel)

- Chaque `PUT` crée une **version** (snapshot tokens + `updatedBy` + `updatedAt`) ; activation par
  version. Rollback = ré-activer une version antérieure. Garder N dernières versions par scope.

## UI Theme Studio (panel dev, futur — NON créée maintenant)

- Route `/dev/theme-studio` (sous `RequireRole(['dev'])`).
- Sélecteur de **scope** (vitrine / panel), formulaire par token (color pickers + champs radius/font/
  spacing), **preview live** (applique les CSS vars sur un conteneur de prévisualisation via
  `applyThemeVars(tokens, previewEl)` — déjà supporté par la fondation), bouton « Activer ».
- Réutilise `ThemeProvider`/`themeToCssVars`/`mergeTheme`/`normalizeHex` de `@bs/ui` → aucun code de
  rendu à réécrire.

## Étapes d'implémentation (futures)

1. Backend : modèle `ThemeConfig` (scope) + endpoints dev + validation. Brancher `/api/vitrine/theme`
   sur la config scope=vitrine (rétro-compat).
2. api-client : `getDevThemes()`, `getPanelTheme()`, `updateDevTheme(scope, tokens)`.
3. Manager : `PanelThemeProvider` (charge scope=panel, fallback `defaultPanelTheme`).
4. UI Theme Studio (preview live + activation).
5. Tests + docs.

## Hors périmètre (à ne pas faire maintenant)

Aucun endpoint, aucun modèle, aucune UI de configuration créés dans le sprint courant (fondation
seule). Le panel React reste sur `defaultPanelTheme` jusqu'à cette implémentation.
