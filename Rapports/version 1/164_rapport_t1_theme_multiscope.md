# 164 — Rapport T1 : thème backend multi-scope vitrine / manager

> Le thème backend devient **multi-scope** (`vitrine` / `manager`). React Manager se branche sur le
> thème backend (fallback `defaultPanelTheme`). **Aucune régression** Vanilla / React Vitrine /
> endpoints / couleurs visibles. Branche `phase-0-security-baseline`. Suite de l'audit 163.

## Objectif

Faire évoluer le modèle de thème (un seul thème global) vers deux scopes distincts, sans casser
l'existant, et brancher React Manager sur un thème backend (avec fallback).

## 1. Modèle Theme multi-scope (`models/Theme.js`)

- Nouveau champ `scope: enum['vitrine','manager'] default 'vitrine'`. Les anciens documents (sans
  `scope`) sont traités comme `vitrine` (lecture + migration). `colors/derivedTokens/logoUrl/slogan`
  **conservés**.
- Champs optionnels **additifs** : `typography{fontFamily}`, `radius`, `shadow`, `spacing` (Mixed),
  `metadata` (Mixed) — vides par défaut ⇒ **aucun impact visuel** si non renseignés, et exposés dans
  le payload **uniquement s'ils sont présents** (rétro-compat).
- Index : `theme_scope_idx` (`{scope:1}`, requête) + **`theme_active_per_scope`** (`{scope:1}` unique
  **partiel** où `isActive:true`) → **au plus 1 thème actif par scope**.

## 2. Migration idempotente (`scripts/migrateThemesToScopes.js`)

- **dry-run par défaut**, `--apply` pour écrire. Fonction `migrateThemesToScopes({apply, logger})`
  exportée (testable) + wrapper CLI.
- legacy sans scope → `scope:'vitrine'` ; au plus 1 actif/scope (garde le plus récent, désactive les
  doublons **avant** d'assigner les scopes pour éviter tout conflit d'index) ; crée un thème
  **manager actif** par défaut (couleurs `defaultPanelTheme`) s'il n'en existe pas, nom anti-collision ;
  **ne désactive jamais** le vitrine actif. Idempotent (2e `--apply` = aucun changement).

## 3. Endpoints publics

- `GET /api/vitrine/theme` **conservé** (rétro-compat) → actif scope vitrine (inclut les docs legacy
  sans scope ; ultra-fallback sur n'importe quel actif). Payload inchangé + champ additif `scope`.
- **Nouveau** `GET /api/theme/:scope` (`vitrine|manager`, lecture **publique** — couleurs non
  secrètes) → `{ ok, scope, theme }`, `theme:null` si aucun actif (le client retombe sur son défaut).
  Scope invalide → 400. Monté sur `/api/theme` (`routers/themePublicRouter.js`).

## 4. CRUD gestion/dev (`/api/gestion/themes`, dev-only inchangé)

- `createTheme` accepte `scope` (défaut vitrine ; invalide → 400).
- `updateTheme` accepte `scope` (optionnel).
- `activateTheme` : ne désactive que le **même scope** (séquentiel, sans transaction → compatible
  standalone ; l'index unique partiel garantit l'unicité). Activer manager **n'affecte pas** vitrine
  et inversement.
- `listThemes?scope=` (filtre optionnel).
- **Compat Vanilla** : `themeManagerModule.js` (Vanilla) ne connaît pas `scope` → crée/édite en
  `vitrine` par défaut (documenté). `gestion.js` lit toujours `/api/vitrine/theme` (vitrine). Inchangé.

## 5. React

- **Vitrine** : inchangée — `VitrineThemeProvider` charge `/api/vitrine/theme` (fallback
  `defaultVitrineTheme`).
- **Manager** : `PanelThemeProvider` charge **`/api/theme/manager`** (`getThemeByScope('manager')`)
  → `mapBackendThemeToTokens` (centralisé `@bs/ui`) → `ThemeProvider scope="panel"`. **Fallback**
  `defaultPanelTheme` si `theme:null` ou erreur (jamais bloquant).
- `@bs/api-client` : `getThemeByScope(scope)`. `@bs/ui` : `mapBackendThemeToTokens` (entrée
  structurelle neutre, réutilisée par vitrine + manager).

## 6. Tests

### Backend (+10)
- `tests/p1/themeMultiScopeBackend.test.js` (6) : legacy→vitrine, createTheme scope (défaut/manager/
  invalide 400), 1 actif/scope + activer un scope n'affecte pas l'autre, `/api/vitrine/theme` &
  `/api/theme/manager` renvoient le bon scope, `theme:null` si aucun manager, CRUD refusé hors dev.
- `tests/p1/themeScopeMigration.test.js` (4) : dry-run sans écriture, `--apply` (legacy→vitrine +
  manager créé + vitrine actif conservé), idempotence, dédoublonnage actifs.

### Frontend (+3 → 41 verts)
- `apps/manager/src/features/theme/themeMultiScope.test.tsx` : fallback `defaultPanelTheme` si
  `theme:null` / si endpoint échoue ; applique la couleur backend manager.

### Suites complètes
`npm test` (404), `audit:business-scenarios` (36), `audit:commissions` (20) verts ;
`react:build`/`react:test` (41)/`react:lint`/`typecheck` verts.

## 7. Compat & non-régression

- **Vanilla** : endpoints et payload inchangés ; thème global existant → lu comme vitrine ;
  `themeManagerModule` continue de gérer vitrine.
- **React Vitrine** : `/api/vitrine/theme` inchangé.
- **React Manager** : passe du défaut local à un thème backend optionnel, fallback identique au défaut
  ⇒ **aucune couleur visible changée** tant qu'aucun thème manager n'est configuré.
- **Couleurs visibles** : inchangées sans configuration spécifique.

## 8. Limites

- Vanilla theme manager non scope-aware (édite vitrine) — Theme Studio Dev (plan 161) couvrira le
  scope manager côté UI.
- Migration manuelle (`node scripts/migrateThemesToScopes.js --apply`) non exécutée en prod par ce
  sprint (à lancer lors du déploiement).
- Pas de transaction sur l'activation (séquentiel) — sûr pour un usage admin mono-utilisateur.

## 9. Prochaine mission — React R2A

Panier + **checkout** + **paiement Stripe Checkout hébergé** (consommer `{mode:'hosted',url}` de
`create-checkout-session`, flag `CHECKOUT_HOSTED` ; finalize-free 0 €). Les écrans checkout héritent
du thème vitrine.
