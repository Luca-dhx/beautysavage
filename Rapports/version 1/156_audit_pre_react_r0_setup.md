# 156 — Audit pré-setup React R0

> Audit réalisé avant la création de l'infrastructure React parallèle (sprint R0).
> Objectif : poser le monorepo `frontend-react/` sans toucher au Vanilla ni au backend métier.
> Suite des rapports 145–149 (plans React) et 151/153/155 (UnifiedCheckout U1/U2/U3).

## 1. Structure actuelle

- **Racine git = `backend/`** (le dépôt est mono-package backend ; `git rev-parse` HEAD = `78822bb`).
- Backend Node.js/Express ESM (`"type":"module"`), MongoDB/Mongoose, Stripe (2 comptes : Institut + Dev).
- Frontend **Vanilla** servi par Express depuis `backend/public/` (HTML + `js/modules/*` + `css/*`).
- Monorepo React **déjà ébauché** dans `backend/frontend-react/` : uniquement des `README.md`
  placeholder + le dossier `docs/` (6 fichiers de documentation rédigés en amont). Aucun
  `package.json`, aucune config, aucun code applicatif.

```
backend/
  app.js                 # Express, monte /auth, /api/*, sert public/ (Vanilla)
  package.json           # scripts backend (test, audit) — PAS de lint
  public/                # Vanilla (INCHANGÉ)
  frontend-react/        # cible R0
    docs/                # 6 docs (Folder/Vitrine/Manager × Architecture/ProjectContext)
    apps/{vitrine,manager}/README.md
    packages/{api-client,ui,auth,config}/README.md
```

## 2. Emplacement exact du frontend React

`backend/frontend-react/` — **à l'intérieur** du dépôt git (racine = `backend/`). Le monorepo React
est donc versionné dans le même dépôt mais **isolé du build backend** (aucune dépendance partagée,
aucun import croisé). Node v22.19.0 / npm 10.9.3 disponibles → npm workspaces utilisables.

## 3. Contraintes repo

- `Rapports/` est **gitignoré** → les rapports sont ajoutés avec `git add -f`.
- Ne pas merger dans `main` ; branche de travail = `phase-0-security-baseline`.
- `node_modules/` doit rester ignoré (ajouter `frontend-react/**/node_modules` et `dist` au gitignore
  si nécessaire).
- Aucun fichier Vanilla ne doit être supprimé/déplacé.

## 4. Contraintes scripts npm

- Le `package.json` racine (backend) n'a **pas de lint** et n'a aucune dépendance React.
- Les scripts backend existants (`start`, `test`, `test:p0/p1/integration`, `audit:*`) ne doivent
  pas être cassés. On **ajoute** seulement des scripts `react:*` qui délèguent à `frontend-react/`
  via `npm --prefix frontend-react`.
- `frontend-react/` portera ses **propres** `package.json` + workspaces (npm workspaces), isolés.

## 5. Proxy `/api` (et `/auth`)

⚠️ **Découverte clé** : l'authentification n'est PAS sous `/api`. Dans `app.js:391` :
`app.use('/auth', authRouter)`. Les endpoints réels :
- `GET  /auth/me`     → `{ ok:true, user:{ id, email, role, currentMode, mustChangePassword, emailVerified, isActive } }` (401 si non connecté ; 403 `MAINTENANCE` ; suspension admin).
- `POST /auth/login`  → succès `{ ok:true, ... }` ; cas onboarding `{ blocked, reason:'no_contract'|'pending' }`.
- `POST /auth/logout` → `{ ok:true }`.
- Le métier est sous `/api/*` (`/api/vitrine`, `/api/client`, `/api/gestion`, `/api/contract`, `/api/commissions`, `/api/stripe`).

→ **Le proxy Vite dev doit couvrir `/api` ET `/auth`** (et `/uploads` pour les médias). Same-origin
via proxy → pas de CORS. Cookie `beautysavage_session` (HttpOnly) transmis grâce à
`credentials:'include'` côté client.

## 6. Stratégie build

- **Dev** : `vite` dev server par app (`react:dev:vitrine`, `react:dev:manager`), proxy `/api`+`/auth`
  → backend local (`http://localhost:3000` par défaut, override `VITE_PROXY_TARGET`).
- **Build** : `vite build` par app → `dist/` (artefacts statiques, gitignorés). Pas de couplage au
  build backend.
- **Prod** (hors R0) : `dist/` servi par reverse proxy ; bascule par domaine (apex vitrine /
  `manager.` manager). Non touché en R0.
- npm workspaces : `frontend-react/package.json` déclare `apps/*` + `packages/*` ; les packages sont
  consommés par alias TS (`@bs/*`) résolus par Vite (pas de build intermédiaire des packages — code
  source TS importé directement, simplicité R0).

## 7. Risques

| Risque | Mitigation |
|---|---|
| Proxy oublie `/auth` → 404 login | proxy couvre `/api`, `/auth`, `/uploads` (documenté §5). |
| `node_modules`/`dist` commités | `.gitignore` étendu avant `git add .`. |
| Casser scripts backend | scripts `react:*` ajoutés, aucun script existant modifié. |
| Secret exposé front | aucune clé : `config` ne lit que `VITE_*` non-secrets ; clé Stripe publique via `/api/stripe/config` (R2, pas R0). |
| Confusion rôles | relabel **UI seulement** : `admin`→Manager, `dev`→Développeur ; rôles backend inchangés. |
| Dérive de périmètre (vraie page) | placeholders uniquement ; aucun appel métier hors `/auth/me` (boot auth). |

## 8. Plan R0 (exécution)

1. **Root monorepo** : `frontend-react/package.json` (npm workspaces, scripts build/test/lint all),
   `tsconfig.base.json` (strict, paths `@bs/*`), `README.md`, `.gitignore`.
2. **packages/config** : `API_BASE_URL`, `APP_KIND`, dictionnaire codes erreur → UX (aucun secret).
3. **packages/api-client** : `apiFetch` (credentials:'include', JSON, `ApiError`), types
   (`ApiError`, `ApiResult`, `AuthUser`, `Role`, `MoneyAmount`, `DateIso`), `getSession`/`logout`.
4. **packages/auth** : `AuthProvider`, `useAuth`, `RequireAuth`, `RequireRole` (client/admin/dev,
   relabel UI), boot via `/auth/me`.
5. **packages/ui** : tokens CSS, `Button`, `Card`, `LoadingState`, `ErrorState`, `AppShell`.
6. **apps/vitrine** : Vite+React+TS, React Router (routes placeholder), `PublicLayout`, proxy.
7. **apps/manager** : idem + guards (manager = admin/dev, `/dev/*` = dev), `/login` public.
8. **Tests** Vitest (apps renders, RequireAuth, RequireRole, apiFetch erreur).
9. **Scripts root** `react:dev:*`, `react:build`, `react:test`, `react:lint`.
10. **Validation** : `react:build` + `react:test` (+ lint), puis suite backend complète verte.
11. **Docs** : 6 docs React + `architecture.md` + `projectContext.json` + `tests/README.md` +
    rapport 157.
12. **Secret scan** + commit + push (`phase-0-security-baseline`, jamais `main`).

### Hors périmètre R0 (rappel)
Aucune vraie page métier, aucun checkout React, aucun dashboard réel, aucune migration Vanilla,
aucun changement backend. Les pages sont des placeholders ; seul `/auth/me` peut être appelé (boot).
