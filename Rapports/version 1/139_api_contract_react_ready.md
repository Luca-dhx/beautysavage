# 139 — Contrat API React-ready

> Inventaire des endpoints, conventions et écarts à corriger. L'API est globalement
> React-ready (JSON, codes stables, logique en services testés — 353 tests).

## Conventions actuelles
- **Auth** : cookie `beautysavage_session` (HttpOnly, signé, SameSite=Lax, Secure prod). `credentials:'include'` requis.
- **Enveloppe** : succès `{ ok:true, ...data }` ; erreur `{ ok:false, error:'msg', code?:'CODE' }`. Quelques endpoints renvoient directement la donnée (ex. `/api/stripe/config` → `{ publishableKey }`).
- **Montants** : euros (Number, 2 décimales) ; Stripe en cents au niveau création PI uniquement.
- **Dates** : ISO 8601 (Date Mongo sérialisée).
- **Statuts** : contrat `pending|active|cancelled` ; sale/refund statuts ; booking `confirmed|cancelled|no_show|completed` ; commission `pending|succeeded|failed`.

## Endpoints STABLES (consommer tels quels)
- Public vitrine : `/api/vitrine/{theme,site-identity,home-settings,highlights,shop,services,formations/:id,products/:id,gift-cards,availability/*,pages/:slug,editable-content}`.
- Auth : `/auth/{login,logout,me}`, `/auth/password-reset/*`.
- Client : `/api/client/{me/products,me/formations,me/presentiel,me/booking-status,formations/:id*,modules/:id,bookings*,sales,profile,favorites,checkout/finalize-free}`.
- Stripe : `/api/stripe/{config,create-checkout-session,session-status,payment-result,webhook}`.
- Manager : `/api/gestion/{services,formations,sessions,planning,bookings,gift-cards,promotions,sales*,site-identity,themes,pages-gestion}`, `/api/commissions/*`.
- Contrat : `/api/contract/{status,pending-info,active,current,create-launch-intent,create-monthly-setup,verify-*,activate,cancel,history}`.
- Site status : `GET /api/site-status`.

## Endpoints LEGACY / à éviter en React
- `POST /api/client/mock-pay` & `mock-pay-cart` (paiement simulé, **non-prod**) → ne pas câbler en React (utiliser Stripe / finalize-free).
- `/api/mode` + `modeGuard` + `User.currentMode` → **vestigial** (toggle supprimé, décision #4). Ne pas consommer ; neutraliser (cf. 141).
- Routing par `?slug=`/`?module=` → remplacé par React Router (le backend `/api/vitrine/pages/:slug` reste utile pour le CMS de pages éditoriales).

## Endpoints à CRÉER / compléter (mineurs, cf. 141)
- **Pagination** sur les listes potentiellement longues : `/api/gestion/sales`, `/api/gestion/dev/send-logs` (SendLog), EventLog, WebhookFailureLog, `/api/gestion/clients`, `/api/commissions/payments`. (Actuellement renvoi complet/limit fixe.)
- **Endpoint santé/bootstrap front** (optionnel) : un `/api/vitrine/bootstrap` agrégeant theme+site-identity+ui-config+site-status pour réduire les allers-retours au boot (nice-to-have, non bloquant).
- Aucun endpoint métier manquant identifié pour les parcours décrits.

## Codes d'erreur (contrat front)
`MAINTENANCE`(503), `CONTRACT_INACTIVE`(503), `SITE_SUSPENDED`(503), `SUSPENDED_ADMIN_LOGOUT`(403),
`BOOKING_SUSPENDED`(403), `OFFER_ACCESS_UNAVAILABLE`(409), `OFFER_BALANCE_UNSUPPORTED`(409),
`LEGAL_CONSENT_REQUIRED`(400), `CHECKOUT_AMOUNT_MISMATCH`(400), `AMOUNT_TOO_LOW`(400),
`PAYMENT_REQUIRED`(402), `SESSION_FULL`(409), `ALREADY_PURCHASED`(409),
`SLOT_PAST|SLOT_OUTSIDE_SCHEDULE|SLOT_UNAVAILABLE`(409), `FORBIDDEN_GESTION_ROLE`(403),
`{blocked, reason:no_contract|pending}` (login admin).
→ React maintient un **dictionnaire code→message/UX** (cf. 135) ; ne pas se fier au champ `error` texte.

## Auth / pagination / format — règles React
- Toujours `credentials:'include'` ; gérer 401 → redirect login, 403 → écran refus/rôle.
- Pagination cible : `?page=&limit=` → `{ items, total, page, limit }` (à harmoniser, cf. 141).
- Montants : formater côté front (Intl) ; ne jamais recalculer un total à charger (serveur fait foi, B2).
- Dates : parser ISO ; afficher en `fr-FR`.

## Corrections backend mineures avant React (détail → 141)
1. Cookie `Domain=.beautysavage.fr` (partage sous-domaines).
2. CORS allowlist + `credentials` **si** API sur origine dédiée (`api.`). Sinon proxy `/api` (rien à faire).
3. Harmoniser l'enveloppe d'erreur sur les rares endpoints renvoyant un format ad hoc.
4. Pagination standard sur les listes d'admin/dev volumineuses.
5. Neutraliser `mode`/`currentMode` (cosmétique, non bloquant).
