# 157 — Rapport Sprint React R0 : infrastructure frontend-react

> Mise en place de l'infrastructure React **parallèle** au Vanilla. Aucune vraie page métier,
> aucun changement backend métier. Branche `phase-0-security-baseline`. Suite de l'audit 156.

## Objectif

Créer le monorepo `frontend-react/` opérationnel (build/test/lint verts) : 2 apps + 4 packages,
routing placeholder, layouts, guards auth/rôles, proxy `/api`. Le Vanilla (`backend/public/`) reste
l'unique UI de production.

## Ce qui a été fait

### Structure créée (`backend/frontend-react/`)
```
package.json            # npm workspaces (packages/* + apps/*), scripts dev/build/test/lint/typecheck
tsconfig.base.json      # TS strict, paths @bs/*, include global.d.ts
vite.shared.ts          # alias @bs/* -> packages/*/src + proxy /api,/auth,/uploads
vitest.config.ts        # jsdom + Testing Library, include apps+packages
vitest.setup.ts         # import '@testing-library/jest-dom/vitest'
global.d.ts             # augmentation matchers Vitest
eslint.config.js        # ESLint 9 flat (js + ts + react-hooks)
.gitignore              # node_modules, dist, .env*
apps/
  vitrine/  { package.json, index.html, vite.config.ts (port 5173), tsconfig.json,
              src/{main.tsx, App.tsx, layouts/PublicLayout.tsx, pages/Placeholder.tsx, App.test.tsx} }
  manager/  { package.json, index.html, vite.config.ts (port 5174, APP_KIND=manager), tsconfig.json,
              src/{main.tsx, App.tsx, layouts/{ManagerLayout,DevLayout}.tsx, pages/Placeholder.tsx, App.test.tsx} }
packages/
  config/      src/{env.ts, errorCodes.ts, index.ts}
  api-client/  src/{types.ts, apiFetch.ts, endpoints.ts, index.ts, apiFetch.test.ts}
  auth/        src/{AuthProvider.tsx, guards.tsx, roles.ts, index.ts, guards.test.tsx}
  ui/          src/{components.tsx, tokens.css, index.ts}
```

### Stack (strict nécessaire)
- **Vite 5 + React 18 + TypeScript (strict)** par app.
- **React Router 6** (routing réel ; fin du `?slug=`/`?module=`).
- **TanStack Query 5** (provider en place ; pas de Redux).
- **Vitest 2 + Testing Library (jsdom)** pour les tests.
- **ESLint 9** (flat config) — installé et vert.
- **CSS = tokens CSS variables** (`@bs/ui/tokens.css`), cohérent avec le thème dynamique
  `/api/vitrine/theme`. **Pas de Tailwind**, pas de design final (décision documentée).
- Non installés (conformément au périmètre) : Playwright, Redux, Stripe React, grosse lib UI.

### Packages
- **`@bs/config`** : `API_BASE_URL` (vide = same-origin), `APP_KIND` (vitrine|manager), constantes
  `API_BASE`/`AUTH_BASE`, dictionnaire `ERROR_CODE_UX` (code → action UX). **Aucun secret.**
- **`@bs/api-client`** : `apiFetch`/`apiGet`/`apiPost` (`credentials:'include'`, JSON, erreurs
  normalisées en `ApiError{status,code,message,body}`), types `Role`/`AuthUser`/`MoneyAmount`/
  `DateIso`/`ApiResult`, endpoints minimaux `getSession()` (GET `/auth/me`, 401→null) et `logout()`.
- **`@bs/auth`** : `AuthProvider` (boot `/auth/me`, `loader` injectable pour les tests), `useAuth`,
  `RequireAuth`, `RequireRole`, `roleLabel` (relabel UI **admin→Manager**, **dev→Développeur** ;
  rôles backend `client/admin/dev` inchangés).
- **`@bs/ui`** : `Button`, `Card`, `LoadingState`, `ErrorState`, `AppShell` + `tokens.css`.

### Routes vitrine (placeholders, `PublicLayout`)
Publiques : `/`, `/prestations`, `/formations`, `/formation/:id`, `/produits`, `/cartes-cadeaux`,
`/connexion`, `/paiement/succes`, `/paiement/annule`. Sous `RequireAuth(loginPath="/connexion")` :
`/panier`, `/checkout`. Catch-all `*` → 404.

### Routes manager / dev (placeholders, guards)
- `/login` public.
- Sous `RequireRole(['admin','dev'], loginPath="/login")` + `ManagerLayout` : `/` (dashboard),
  `/onboarding/contrat`, `/planning`, `/reservations`, `/prestations`, `/formations`, `/produits`,
  `/cartes-cadeaux`, `/ventes`, `/remboursements`, `/commissions`, `/parametres`.
- Sous `RequireRole(['dev'], deniedPath="/")` + `DevLayout` : `/dev`, `/dev/contrats`,
  `/dev/commissions`, `/dev/integrated-api`, `/dev/email-templates`, `/dev/send-logs`,
  `/dev/event-logs`, `/dev/webhook-failures`. Un admin sur `/dev` est renvoyé au dashboard.

### Guards auth / rôles
`RequireAuth` (loading→`LoadingState`, anonyme→redirect login, sinon `<Outlet/>`). `RequireRole`
(idem + rôle hors `allow`→`deniedPath` ou écran « Accès réservé. »). **L'autorité reste le backend**
(401/403) ; les guards React sont UX. Relabel UI seulement.

### Proxy `/api` (+ `/auth`)
⚠️ L'auth est montée sur `/auth` dans `app.js` (hors `/api`). Le proxy Vite couvre donc **`/api`,
`/auth`, `/uploads`** → `VITE_PROXY_TARGET` (défaut `http://localhost:3000`). Same-origin, pas de
CORS ; cookie `beautysavage_session` (HttpOnly) transmis via `credentials:'include'`.

### Scripts npm racine (ajoutés, non destructifs)
`react:dev:vitrine`, `react:dev:manager`, `react:build`, `react:test`, `react:lint` — délèguent à
`frontend-react/` via `npm --prefix frontend-react`. Les scripts backend existants sont inchangés.

## Tests

### Frontend (`npm run react:test`) — 12 verts
- `packages/api-client/src/apiFetch.test.ts` (3) : succès JSON ; `ApiError{status,code}` sur non-ok ;
  body non-JSON.
- `packages/auth/src/guards.test.tsx` (4) : `RequireAuth` bloque l'anonyme / laisse passer ;
  `RequireRole` refuse un rôle insuffisant / accepte un rôle autorisé.
- `apps/vitrine/src/App.test.tsx` (1) : rendu de l'accueil.
- `apps/manager/src/App.test.tsx` (4) : anonyme→/login, admin→dashboard, dev→/dev, admin bloqué /dev.

### Frontend build / lint / typecheck
- `npm run react:build` : 2 apps buildées (`dist/`).
- `npm run lint` : ESLint vert (lint **disponible** — pas de blocage, contrairement au fallback prévu).
- `npm run typecheck` (`tsc --noEmit`) : vert.

### Backend (inchangé) — voir §Validation
`npm test`, `test:p0`, `test:p1`, `test:integration`, `audit:business-scenarios`,
`audit:commissions` — tous restent verts (aucun fichier backend métier modifié ; seuls des scripts
`react:*` ont été ajoutés au `package.json` racine).

## Décisions

- **CSS** : tokens CSS variables (pas Tailwind) — cohérence avec le thème dynamique runtime.
- **Packages sans build intermédiaire** : alias `@bs/*` → `packages/*/src` (source TS importée
  directement par Vite/Vitest) → simplicité R0, pas de pipeline de build des libs.
- **`loader` injectable dans `AuthProvider`** : permet de tester les guards sans appel réseau ni
  mock global de `fetch`.

## Limites R0

- **Placeholders uniquement** : aucune vraie page métier, aucun checkout React, aucun dashboard réel.
  Seul `/auth/me` peut être appelé (boot de l'`AuthProvider`).
- Le Vanilla reste l'UI de production ; aucune bascule de domaine, aucun fichier Vanilla supprimé.
- `node_modules/` et `dist/` ne sont pas versionnés (`frontend-react/.gitignore`).

## Prochaine mission — React R1

Première **vraie page vitrine** (catalogue : prestations/formations/produits) consommant l'API
existante via `@bs/api-client` (hooks TanStack Query, mapping codes erreur). Puis R2 (checkout
hébergé — consommer `{ mode:'hosted', url }`) et R3 (manager : onboarding contrat + commissions
hébergées).
