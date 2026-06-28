# 163 — Audit pré-T1 : thème backend multi-scope

> Audit avant l'évolution du thème backend vers un modèle **multi-scope** (`vitrine` / `manager`).
> Branche `phase-0-security-baseline`. Suite des rapports 160/161/162.

## 1. Modèle Theme actuel (`models/Theme.js`)

`{ name (unique), colors{primary,secondary,background,surface,text} (requis),
derivedTokens{surfaceHeader,accent,accentStrong} (nullable), logoUrl, slogan, isActive (def false),
createdAt, timestamps }`, collection `themes`. **Un seul `isActive` global** — pas de notion de scope.

## 2. Endpoints actuels

- **Public** : `GET /api/vitrine/theme` → `getActiveTheme` = `Theme.findOne({ isActive:true })` →
  `{ ok, theme: buildThemePayload(...) }` (id, name, colors, derivedTokens, logoUrl, slogan, isActive,
  createdAt).
- **Dev only** (`/api/gestion/themes`, `requireAuth + requireMode('gestion') + requireStrictDev`) :
  `GET /` (listThemes), `POST /` (createTheme), `PUT /:id` (updateTheme), `POST /:id/activate`
  (activateTheme — `updateMany({isActive:true},{false})` GLOBAL puis active, **dans une transaction**).

## 3. Usages Vanilla

- `public/js/vitrine.js` : `loadTheme()` → `/api/vitrine/theme` → `applyTheme` (CSS vars
  `--color-*`/`--theme-*`). Ne lit que `colors` + `derivedTokens`.
- `public/js/gestion.js` : même endpoint `/api/vitrine/theme` (panel gestion **partage** le thème).
- `public/js/modules/themeManagerModule.js` : édite name/colors/derivedTokens/slogan/logoUrl —
  **aucune notion de scope** (gère donc le thème "global" = vitrine).

## 4. Usages React

- **Vitrine** : `@bs/api-client` `getVitrineTheme()` (`/api/vitrine/theme`) → `VitrineThemeProvider`
  → `ThemeProvider scope="vitrine"` (fallback `defaultVitrineTheme`).
- **Manager** : `ThemeProvider scope="panel"` + `defaultPanelTheme` **local** — ne consomme aucun
  endpoint backend (cible T1).
- `@bs/ui/theme` : `ThemeTokens`, `themeToCssVars`, `mergeTheme`, `normalizeHex`, `ThemeProvider`.

## 5. Risques

| Risque | Mitigation |
|---|---|
| Casser `/api/vitrine/theme` | endpoint conservé, payload **additif** (ajout `scope`), requête vitrine inclut les docs legacy sans scope. |
| Documents legacy sans `scope` | traités comme `vitrine` (requête `$or scope vitrine/absent/null`) ; migration les fixe. |
| Transactions indispo en test | `mongodb-memory-server` est **standalone** (pas de replica set) → l'activation est rendue **séquentielle** (déactive le scope puis active), sans transaction. Comportement final identique (1 actif/scope). |
| Double actif même scope | **index unique partiel** `{scope:1}` où `isActive:true` (max 1 actif par scope). |
| Vanilla theme manager sans scope | continue à gérer le scope `vitrine` par défaut (documenté). |
| Couleurs visibles changées | aucune config manager ⇒ React manager garde `defaultPanelTheme` (fallback) ; vitrine inchangée. |
| Nom unique global | la migration crée le thème manager avec un nom libre (vérif anti-collision). |

## 6. Stratégie de migration multi-scope

1. **Modèle** : `+ scope: enum['vitrine','manager'] default 'vitrine' index` ; champs optionnels
   additifs `typography`, `radius`, `shadow`, `spacing`, `metadata` (sans casser l'existant) ;
   index unique partiel `{scope:1}`/`isActive:true`.
2. **Lecture** : `getActiveTheme` (vitrine) = actif scope vitrine **ou** legacy sans scope.
   Nouvel endpoint public `GET /api/theme/:scope` (vitrine|manager) — couleurs non secrètes.
3. **CRUD dev** : `createTheme`/`updateTheme` acceptent `scope` ; `activateTheme` ne désactive que
   le **même scope** (séquentiel). `listThemes?scope=`.
4. **Migration idempotente** `scripts/migrateThemesToScopes.js` : dry-run par défaut, `--apply` ;
   legacy → vitrine ; max 1 actif/scope ; crée un thème manager actif (depuis `defaultPanelTheme`)
   s'il n'en existe pas ; ne désactive jamais le vitrine actif.
5. **React** : Manager charge `/api/theme/manager` (fallback `defaultPanelTheme`) ; Vitrine inchangée
   (`/api/vitrine/theme`). Helper de mapping `mapBackendThemeToTokens` centralisé dans `@bs/ui`.
6. **Tests** backend (multi-scope + migration) + frontend (manager charge le thème) + docs.
