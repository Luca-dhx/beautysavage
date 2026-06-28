# 167 — Audit pré-R2B : flow de paiement React (hosted + finalize-free)

> Audit avant le branchement du paiement React. Branche `phase-0-security-baseline`. Suite de R2A
> (165/166) et U2 (153). **Aucun Stripe.js côté React ; le backend reste source de vérité.**

## 1. Endpoints utilisés (existants, inchangés)

| Endpoint | Auth | Requête | Réponse |
|---|---|---|---|
| `POST /api/stripe/create-checkout-session` | `requireAuth()` | `{ checkoutState }` **direct** (pas de token) | flag ON : `{ok,mode:'hosted',url,checkoutId}` ou `{ok,mode:'free',checkoutId,requiresPayment:false}` ; flag OFF : `{ok,clientSecret,returnUrl}` |
| `POST /api/client/checkout/finalize-free` | `requireAuth()` + site actif | `{ checkoutState, idempotencyKey? }` | `{ok:true, saleId, idempotent?}` |
| `GET /api/stripe/payment-result?payment_intent_id=pi_…` | `requireAuth()` | query | `{ok:true, status:'succeeded'|'pending'|'failed', purchase?, errorMessage?, origin?}` |
| `GET /api/stripe/session-status?payment_intent_id=…` | `requireAuth()` | query | `{ok:true, status:'complete'|'open', payment_status, origin, item}` |

⚠️ **Pas d'endpoint de token** : `create-checkout-session` lit `req.body.checkoutState` **directement**.

## 2. Payload React → backend (`checkoutState`, mode prestation R2A)

```
checkoutState = {
  item:    { type:'service', id: serviceId, name },
  service: { serviceId, practitionerId, slotStart, slotEnd },   // practitionerId requis (|null)
  legal:   { acceptedCgv:true, waiverAccepted, waiverText? },
  origin:  { slug:'checkout' }
  // totals? OPTIONNEL — NE JAMAIS forcer amountToPay (le serveur recalcule ; mismatch → 400)
}
```
Le panier React (R2A) fournit `serviceId`/`slotStart`/`slotEnd`/`practitionerId` + consentements. **Aucun
montant autoritaire** envoyé (pas de `totals.amountToPay`). Le backend revalide CGV + créneau + prix.

## 3. Flows

- **Hosted** (`mode:'hosted'`) : React `window.location.assign(url)` → page Stripe Checkout hébergée.
- **Free** (`mode:'free'`) : React appelle `finalize-free` (`{checkoutState, idempotencyKey}`) →
  `{saleId}` → navigation `/paiement/succes?free=1&checkoutId=…`. **Entièrement React.**
- **Erreur** : `create-checkout-session` non-2xx → `ApiError{status,code}` → `ErrorState` + mapping UX
  (`@bs/config` : `LEGAL_VALIDATION_REQUIRED`, `CHECKOUT_CONTEXT_INVALID`, `SESSION_FULL`,
  `ALREADY_PURCHASED`, `CHECKOUT_AMOUNT_MISMATCH`, `AMOUNT_TOO_LOW`, …).
- **Annulation** : retour sur la page d'annulation → message + CTA retour panier/checkout ; **panier
  conservé**.
- **401** (non connecté) : `requireAuth` → 401 → React affiche « connexion requise » + lien
  `/connexion` ; **panier conservé**.

## 4. ⚠️ URLs de retour hosted = backend (Vanilla)

En mode hosted, le backend fixe `success_url = https://{ngrok}/vitrine.html?slug=payment&checkout_session_id=…`
et `cancel_url = …?slug=checkout` (pages **Vanilla**). **On ne peut pas les changer sans modifier le
backend (interdit).** Conséquence R2B :
- Le **flow free** est 100 % React (testable de bout en bout).
- Le **flow hosted** redirige bien vers Stripe, mais le retour atterrit sur le **Vanilla** (comportement
  existant). Les pages React `/paiement/succes` & `/paiement/annule` sont **implémentées et prêtes**
  (utilisées par le flow free ; et par le hosted dès que le `success_url` backend sera paramétrable
  pour le domaine React — chantier R2C/R3). Elles gèrent `?free=1`, `?payment_intent_id=…`
  (→ `payment-result`) et un fallback prudent.

## 5. Règles / risques

| Risque | Mitigation |
|---|---|
| Appeler Stripe depuis React | **Interdit** : aucun `@stripe/stripe-js`, aucun appel Stripe direct. Tout via backend. |
| Inventer un montant | aucun `totals.amountToPay` envoyé ; serveur recalcule. |
| Prétendre une finalisation alors que webhook pending | wording prudent : « Paiement reçu, confirmation en cours » si `status:'pending'`. |
| Flag OFF (Elements) | React ne fait pas Elements → si `clientSecret` renvoyé, message « paiement hébergé non activé » (pas d'Elements). |
| Secret front | aucun ; clé publique via `/api/stripe/config` (non requise pour hosted). |
| Double soumission free | `idempotencyKey` (alphanumérique 8-128) stable par tentative. |

## 6. Plan R2B

1. `@bs/api-client/checkout/` : `types.ts` (CreateCheckoutSessionResponse union, FinalizeFreeResponse,
   PaymentResultResponse), `checkout.ts` (`createCheckoutSession`, `finalizeFreeCheckout`,
   `buildServiceCheckoutState`), `paymentResult.ts` (`getPaymentResult`).
2. `/checkout` : bouton « Payer / Confirmer » (désactivé si panier vide / consentements incomplets /
   slot manquant) → build checkoutState → `createCheckoutSession` → hosted (`assign(url)`) / free
   (`finalize-free` → `/paiement/succes`). États : préparation, redirection, erreur, 401, free finalisé.
3. Pages `/paiement/succes` (lit query, `payment-result` si `payment_intent_id`, free si `free=1`,
   wording prudent) & `/paiement/annule` (panier conservé).
4. Auth : 401 → message connexion requise + lien (AuthProvider existant) ; panier conservé.
5. Tests frontend (mock `@bs/api-client`, **aucun import Stripe**), build/lint ; suite backend verte ;
   docs + rapport 168.

## Hors périmètre (rappel)
Aucun Stripe.js, aucune modification backend, pas de produits/formations/cartes cadeaux au panier,
pas de gros module login. **R2C/R3** : success_url React, espace client, manager.
