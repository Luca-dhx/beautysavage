# 168 — Rapport React R2B : paiement Stripe Checkout hébergé + finalize-free

> Branchement du paiement React via le backend (Stripe Checkout **hébergé** + **finalize-free**).
> **Aucun Stripe.js côté React ; aucun appel Stripe direct ; le backend reste source de vérité.**
> Branche `phase-0-security-baseline`. Suite de R2A (165/166) et de l'audit 167.

## Objectif

Depuis `/checkout`, appeler `create-checkout-session` : `{mode:'hosted',url}` → redirection ;
`{mode:'free'}` → `finalize-free` → page succès. Pages retour `/paiement/succes` & `/annule`. Aucun
montant inventé, panier indicatif.

## 1. API client paiement (`@bs/api-client/checkout/`)

- `types.ts` : `ServiceCheckoutState` (mirroir backend), `CreateCheckoutSessionResponse`
  (`hosted | free | elements`), `FinalizeFreeResponse`, `PaymentResultResponse`.
- `checkout.ts` : `buildServiceCheckoutState(line, legal)` (mappe la ligne prestation + consentements,
  **sans montant**), `buildIdempotencyKey(seed)` (alphanumérique 8-128), `createCheckoutSession`
  (`POST /api/stripe/create-checkout-session`, body `{checkoutState}` **direct**), `finalizeFreeCheckout`
  (`POST /api/client/checkout/finalize-free`, `{checkoutState, idempotencyKey}`).
- `paymentResult.ts` : `getPaymentResult(paymentIntentId)` (`GET /api/stripe/payment-result`).
- `credentials:'include'` (via `apiFetch`), erreurs → `ApiError{status,code}` ; mapping UX via
  `@bs/config` (`resolveErrorUx`). **Aucune logique Stripe.**

## 2. Payload checkout réel

`buildServiceCheckoutState` → `{ item:{type:'service',id,name}, service:{serviceId,practitionerId,
slotStart,slotEnd,selectedOptions}, legal:{acceptedCgv,waiverAccepted}, origin:{slug:'checkout'} }`.
**Jamais de `totals`/`amountToPay`** (le serveur recalcule). Compatible avec le backend actuel
(format Vanilla). `waiverText` non envoyé (re-dérivé serveur).

## 3. Page Checkout (`/checkout`)

Bouton **« Payer / Confirmer »** désactivé si : panier vide / consentements incomplets / aucune
prestation avec créneau / soumission en cours. Au clic :
1. `buildServiceCheckoutState` ;
2. `createCheckoutSession` ;
3. `mode:'hosted'` → `window.location.assign(url)` (état « redirection ») ;
4. `mode:'free'` → `finalizeFreeCheckout` → `navigate('/paiement/succes?free=1&checkoutId=<saleId>')` ;
5. `mode:'elements'` (flag OFF) → message « paiement hébergé non activé » (React ne fait pas Elements) ;
6. `ApiError 401` → état « Connexion requise » + lien `/connexion` (**panier conservé**) ;
7. autre `ApiError` → `ErrorState` + message mappé (`resolveErrorUx`).
**Aucun import `@stripe/stripe-js` ; aucun appel Stripe.**

## 4. Pages retour paiement

- **`/paiement/succes`** : lit `free=1` (→ « Commande confirmée »), `payment_intent_id` (→
  `getPaymentResult` : `succeeded` / `pending` / `failed`), sinon fallback prudent. **Wording prudent** :
  « Paiement reçu, confirmation en cours » si `pending` (webhook) — ne prétend jamais une finalisation
  non confirmée. CTA accueil / prestations.
- **`/paiement/annule`** : message clair, **panier conservé** (jamais vidé), CTA reprendre/voir panier.

## 5. ⚠️ Limitation hosted (URLs de retour backend)

En mode hosted, le backend fixe `success_url`/`cancel_url` vers la page **Vanilla**
(`vitrine.html?slug=payment|checkout`). **Non modifiable sans changement backend (interdit).** Donc :
- Le **flow free** est 100 % React (testé de bout en bout).
- Le **flow hosted** redirige bien vers Stripe ; le **retour** atterrit sur le Vanilla (comportement
  existant). Les pages React `/paiement/succes` & `/annule` sont **implémentées et prêtes** (servies par
  le flow free et par le hosted dès que le `success_url` backend sera paramétré pour le domaine React —
  chantier R2C/R3).

## 6. Auth client

Pas de module login complet (hors périmètre). Le paiement requiert `requireAuth` côté backend → `401`
intercepté par React (`ApiError`) → état « Connexion requise » + lien `/connexion` ; **panier conservé**.
S'appuie sur l'`AuthProvider` existant. `/connexion` reste un placeholder.

## 7. Tests

### Frontend (`npm run react:test`) — 71 verts (+17 vs R2A)
- `@bs/api-client/checkout/checkout.test.ts` (10) : `buildServiceCheckoutState` (sans montant / null
  hors service), `buildIdempotencyKey`, `createCheckoutSession` (hosted/free/elements/ApiError 400),
  `finalizeFreeCheckout` (saleId / 401).
- `apps/vitrine/src/pages/r2bPayment.test.tsx` (10) : bouton désactivé→activé ; createCheckoutSession
  reçoit le bon checkoutState (sans `totals`) ; hosted → `window.location.assign(url)` ; free →
  `finalizeFreeCheckout` + navigation succès ; erreur backend → ErrorState ; 401 → connexion requise ;
  succès free ; succès hosted pending (wording prudent) ; annulation conserve le panier ; **aucune
  dépendance `stripe` dans les package.json front**.
- `react:lint` vert, `typecheck` vert, `react:build` (2 apps) OK, **aucun import Stripe**, **aucun hex
  dans les `.tsx`**.

### Backend (inchangé)
`npm test` (404) + audits (36 / 20) verts. **Aucun fichier backend modifié.**

## 8. Limites R2B

- Hosted : retour sur Vanilla (success_url backend) — pages React prêtes (cf. §5).
- Pas de Stripe.js / Elements côté React (volontaire).
- Checkout centré **prestation** (R2A) ; produits/formations/cartes cadeaux non payables via React.
- Pas de module login complet.

## 9. Prochaine mission recommandée — R2C

Paramétrer le `success_url`/`cancel_url` backend (ou un flag/route) pour pointer vers le domaine React
→ retour hosted dans `/paiement/succes` React (avec `session-status`/`payment-result`). Puis module
**login client** React (`/connexion`) et reprise du checkout après login. Ensuite R3 (manager).
