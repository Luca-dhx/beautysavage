# 137 — Plan React parallèle (sans casser l'existant)

> Construire React **à côté** du Vanilla, sans toucher aux endpoints backend, avec bascule
> progressive et rollback instantané.

## Principe
- Le Vanilla (`backend/public/*`) **reste actif et servi** comme aujourd'hui.
- React vit dans un dossier dédié, **build statique**, servi sur un **chemin/sous-domaine distinct**.
- **Zéro changement d'endpoint** : React consomme l'API JSON existante (cf. 139).
- Bascule par **domaine progressif** ou **feature flag** ; rollback = repointer le domaine sur le Vanilla.

## Structure de dossiers
```
/ (repo)
  backend/                 # Express actuel (inchangé) — API + Vanilla public/
  frontend-react/
    apps/
      vitrine/             # app publique (beautysavage.fr)
      manager/             # app manager + /dev (manager.beautysavage.fr)
    packages/
      api-client/          # client HTTP typé (fetch credentials:'include'), mapping codes erreur
      ui/                  # design system partagé (tokens issus de /api/vitrine/theme)
      auth/                # hook session (/auth/me), guards rôle
```
> Monorepo léger (workspaces) ou 2 dossiers simples. Pas de couplage build avec `backend/`.

## Build
- **Vite + React + TypeScript** (recommandé — typage des payloads/erreurs = filet de sécurité pour une API riche). Sortie : `dist/` statique par app.
- Servir : reverse proxy (Nginx/Caddy) ou Express `static` sur un préfixe `/, ` chaque app derrière son domaine ; `/api`, `/auth`, `/uploads`, `/api/stripe/webhook` proxifiés vers le backend.

## Stratégie d'exposition progressive (3 niveaux de rollback)
1. **Cohabitation par chemin** (dev/staging) : `beautysavage.fr/app-v2/*` sert React, le reste reste Vanilla. Feature flag serveur (`UI_V2_ENABLED`) ou simple route Nginx.
2. **Bascule par domaine** : pointer `manager.beautysavage.fr` sur React Manager d'abord (audience interne, risque maîtrisé), Vanilla gestion reste accessible en fallback (`gestion.html`).
3. **Bascule apex** : `beautysavage.fr` → React Vitrine en dernier (audience publique), après parité validée.

## Stratégie API client (`packages/api-client`)
- `fetch` wrapper `credentials:'include'`, base URL = `''` (same-origin via proxy) ou `https://api.…` (si origine dédiée).
- **Intercepteur de codes** : map `{MAINTENANCE, CONTRACT_INACTIVE, SITE_SUSPENDED, BOOKING_SUSPENDED, LEGAL_CONSENT_REQUIRED, CHECKOUT_AMOUNT_MISMATCH, SESSION_FULL, ALREADY_PURCHASED, SLOT_*, PAYMENT_REQUIRED, OFFER_*}` → actions UX (écran d'état / toast / redirection) — cf. 135.
- Enveloppe standard attendue : `{ ok, error?, code? }` ou payload data (cf. 139).

## Stratégie auth
- Source de vérité = backend (cookie `beautysavage_session`). React appelle `GET /auth/me` au boot → `{ role, currentMode?, mustChangePassword }`.
- Guards React (`RequireAuth`, `RequireRole`) **purement UX** ; le backend renvoie 401/403 qui restent l'autorité.
- Login : `POST /auth/login` (gère `blocked/reason` pour onboarding contrat manager).

## Stratégie cookies
- **Élargir** le cookie à `Domain=.beautysavage.fr` (cf. 136/141) pour partage vitrine ↔ manager.
- Garder `HttpOnly` (pas d'accès JS), `SameSite=Lax`, `Secure` (prod). Pas de token en `localStorage`.

## Stratégie environnement
- `.env` front : `VITE_API_BASE` (vide si proxy same-origin), `VITE_STRIPE_*` non nécessaire (clé publique via `/api/stripe/config`).
- Aucune clé secrète côté front (toujours via API).

## Stratégie rollback
- **Niveau DNS/proxy** : repointer le domaine/route sur le Vanilla (`vitrine.html`/`gestion.html`) — instantané, aucun déploiement backend.
- **Feature flag** : `UI_V2_ENABLED=false` → proxy sert le Vanilla.
- Le backend ne change pas → **aucun risque de régression API** pendant toute la migration.

## Tests de parité
- Pour chaque écran migré : comparer payloads/réponses React vs Vanilla sur les mêmes endpoints (les 353 tests backend garantissent déjà l'API). Ajouter E2E (cf. 140) sur les parcours critiques avant chaque bascule de domaine.
