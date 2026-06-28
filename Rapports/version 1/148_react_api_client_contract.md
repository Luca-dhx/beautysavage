# 148 — Contrat du client API React (`packages/api-client`)

> Spécification du client HTTP partagé consommant l'API existante (cf. rapport 139). Aucun
> changement backend requis (hors prérequis cookie).

## Principes
- `fetch` avec **`credentials: 'include'`** (cookie `beautysavage_session`).
- Base URL = **same-origin** (proxy `/api`) → `''` ; configurable via `VITE_API_BASE` si origine dédiée.
- Enveloppe attendue : succès `{ ok:true, ...data }` ou payload direct ; erreur `{ ok:false, error, code }`.
- **Typage** (TS) des payloads + parsing Zod aux frontières (optionnel) → sécurité runtime.

## Surface du client
```ts
// pseudo-API
apiGet<T>(path, params?): Promise<T>
apiPost<T>(path, body?): Promise<T>
apiPut / apiPatch / apiDelete
// erreurs : throw ApiError { status, code, message, body }
```
- **Intercepteur global** : sur réponse non-ok, construit `ApiError` à partir de `{code,error}`.
- **Hooks TanStack Query** : `useQuery`/`useMutation` enveloppant ces appels (cache, refetch, invalidations).

## Gestion des codes (→ `packages/config`, cf. rapport 135)
| Code | Statut | Action UX |
|---|---|---|
| `MAINTENANCE` / `CONTRACT_INACTIVE` / `SITE_SUSPENDED` | 503 | StatePage plein écran |
| `SUSPENDED_ADMIN_LOGOUT` | 403 | logout + message |
| `FORBIDDEN_GESTION_ROLE` | 403 | écran refus rôle |
| `LEGAL_CONSENT_REQUIRED` | 400 | erreurs inline checkout |
| `CHECKOUT_AMOUNT_MISMATCH` | 400 | refetch pricing + retry transparent |
| `AMOUNT_TOO_LOW` / `PAYMENT_REQUIRED` | 400/402 | rediriger paiement / chemin 0 € |
| `SESSION_FULL` / `ALREADY_PURCHASED` / `SLOT_*` | 409 | toast + CTA adapté |
| `OFFER_ACCESS_UNAVAILABLE` / `OFFER_BALANCE_UNSUPPORTED` | 409 | CTA masqué en amont |
| `401` (non authentifié) | 401 | redirect login |
| `{blocked, reason:no_contract|pending}` (login admin) | 200 | onboarding contrat |

## Auth
- `getSession()` → `GET /auth/me` → `{ role, mustChangePassword }`. Mis en cache (TanStack Query) + invalidé au login/logout.
- `login(email,pwd)` → `POST /auth/login` (gère `blocked/reason`). `logout()` → `POST /auth/logout`.

## Conventions de données
- **Montants** : Number € (2 décimales) ; format front Intl `fr-FR` ; **jamais recalculés** côté client (serveur fait foi).
- **Dates** : ISO 8601 en transport ; affichage `fr-FR`.
- **Statuts** typés : contrat `pending|active|cancelled` ; booking `confirmed|cancelled|no_show|completed` ; commission `pending|succeeded|failed`.
- **Pagination** (à harmoniser backend, cf. 141) : `?page=&limit=` → `{ items, total, page, limit }`. Le client expose `usePaginatedQuery`.

## Paiement (UnifiedCheckout, cf. 144)
- `createCheckout(kind, payload)` → cible : `{ mode:'hosted', url }` (redirection Stripe Checkout) ou `{ mode:'free', saleId }` (finalize-free). Aujourd'hui (transition) : `create-checkout-session` renvoie `clientSecret` (Elements) — le client API encapsule la différence pour préparer la bascule hosted.
- Résultat : retour `success_url` → `GET /api/stripe/payment-result` → `usePaymentResult`.

## Endpoints à éviter (legacy)
- `mock-pay`/`mock-pay-cart` (non-prod), `/api/mode` (toggle supprimé), routing `?slug=` (remplacé par React Router). Le client API ne les expose pas.

## Sécurité
- Aucun secret côté client ; clé Stripe publique via `/api/stripe/config`. Le client API n'écrit jamais le cookie (HttpOnly) ; pas de token en `localStorage`.
