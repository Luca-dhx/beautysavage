# frontend-react — Beauty Savage (React parallèle)

App React construite **en parallèle** du frontend Vanilla (`backend/public`), sans le remplacer.
Vanilla reste actif jusqu'à bascule (rollback DNS/proxy/feature-flag). **Aucun changement
d'endpoint backend.**

## Structure
```
apps/
  vitrine/      # SPA publique + client (beautysavage.fr)
  manager/      # SPA manager + /dev (manager.beautysavage.fr)
packages/
  api-client/   # client HTTP typé + hooks TanStack Query + mapping codes erreur
  ui/           # design system (thème dynamique via /api/vitrine/theme)
  auth/         # session (/auth/me), guards RequireAuth / RequireRole
  config/       # env, dictionnaire codes erreur → UX
docs/           # documentation OBLIGATOIRE (Folder*, Vitrine*, Manager*)
```

## Stack (recommandée — à exécuter en sprint R0)
Vite + React + TypeScript + React Router + TanStack Query (+ Zod). CSS : CSS Modules vs Tailwind à
trancher en R0. Playwright (E2E) plus tard.

## Statut
**Plan & documentation uniquement** (rapports 143-149). Le setup exécutable (package.json, vite,
dépendances) sera réalisé au sprint **R0** (cf. `docs/` + rapport 146).

## Règle de documentation
Chaque sprint met à jour la doc du scope touché (`docs/Vitrine*` ou `docs/Manager*`) **et**
`docs/FolderArchitecture.md` + `docs/FolderProjectContext.md` si l'architecture globale change.

## Liens
- [docs/FolderArchitecture](./docs/FolderArchitecture.md) · [docs/FolderProjectContext](./docs/FolderProjectContext.md)
- [docs/VitrineArchitecture](./docs/VitrineArchitecture.md) · [docs/VitrineProjectContext](./docs/VitrineProjectContext.md)
- [docs/ManagerArchitecture](./docs/ManagerArchitecture.md) · [docs/ManagerProjectContext](./docs/ManagerProjectContext.md)
- Rapports backend : `backend/Rapports/version 1/143..149`
