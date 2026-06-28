# 146 — Plan de setup React parallèle (R0)

> Comment exécuter le setup (sprint R0) sans toucher au Vanilla ni au backend (hors prérequis cookie).

## Monorepo `frontend-react/` (créé en structure)
```
frontend-react/
  package.json              # workspaces (npm/pnpm)
  apps/vitrine/             # Vite app
  apps/manager/             # Vite app
  packages/api-client/      # lib partagée
  packages/ui/              # design system
  packages/auth/            # session + guards
  packages/config/          # env + dictionnaire erreurs
  docs/                     # documentation (déjà créée)
```

## Stack à installer en R0
- **Vite + React + TypeScript** (template `react-ts`) par app.
- **React Router** (routing), **TanStack Query** (données serveur), **Zod** (validation frontières — optionnel).
- CSS : **décision R0** — recommandation **CSS Modules + tokens CSS variables** (cohérent avec le thème dynamique `/api/vitrine/theme`) ; Tailwind possible mais le thème dynamique runtime favorise les CSS vars.
- Lint/format : ESLint + Prettier (le backend n'a pas de lint — l'introduire ici).
- **Playwright** : plus tard (cf. rapport 140), pas en R0.

## Servir & proxy (dev + prod)
- **Dev** : `vite` dev server par app, proxy `/api`, `/auth`, `/uploads`, `/api/stripe/webhook` → backend (`http://localhost:PORT`). Pas de CORS (same-origin via proxy).
- **Prod** : build statique (`dist/`) par app, servi par Nginx/Caddy ; reverse proxy `/api`,`/auth` → backend Node. `beautysavage.fr` → vitrine/dist ; `manager.beautysavage.fr` → manager/dist.

## Prérequis backend (1 seul, cf. rapport 141)
- Cookie session `Domain=.beautysavage.fr` (partage vitrine ↔ manager). **À faire avant la bascule sous-domaines**, pas avant le dev local (localhost same-origin).
- CORS : inutile si proxy `/api` par app (recommandé). Requis seulement si API exposée sur `api.beautysavage.fr`.

## Environnement
- `.env` par app : `VITE_API_BASE` (vide en proxy same-origin), pas de secret. Clé Stripe publique via `/api/stripe/config`.
- `frontend-react` est **isolé** du build backend ; aucun couplage de dépendances.

## Cohabitation avec le Vanilla
- Le Vanilla (`backend/public`) continue d'être servi par Express. React est servi séparément
  (proxy/sous-domaine) ; aucune route backend modifiée.
- Niveaux de cohabitation : (1) dev local, (2) staging `app-v2`/sous-domaine, (3) prod par bascule de domaine.

## Rollback
- DNS/proxy : repointer le domaine sur le Vanilla. Feature flag `UI_V2_ENABLED`. Aucun déploiement backend requis.

## Definition of Done (R0)
- Monorepo buildable (`vite build` ok pour les 2 apps), router + `RequireAuth`/`RequireRole`,
  `api-client` (fetch credentials + intercepteur codes), `ui` (thème dynamique branché), `config`
  (dictionnaire erreurs), docs initialisées. Aucune régression Vanilla/backend.
