# 152 — Audit pré-Sprint U2 : Stripe Checkout hébergé

> État avant câblage UnifiedCheckout + hosted Checkout. Aucune modification.

## Flow Elements actuel
`POST /api/stripe/create-checkout-session` (`stripeCheckoutService.createCheckoutSessionFromRequest`) :
auth → validation (legal A1 / offre A7 / anti-doublon) → pricing serveur (B2, `amountToPay`) →
`AMOUNT_TOO_LOW` si < 0,50 € → persiste `StripeCheckoutIntent` → `paymentIntents.create` →
réserve cartes cadeaux par PI → `StripeCheckoutIntent.stripeSessionId = PI` → renvoie
`{ clientSecret, returnUrl }`. **Finalisation** : webhook `payment_intent.succeeded`
(`handlePaymentIntentSucceededEvent`) → retrouve `StripeCheckoutIntent` (metadata.intentId / PI) →
`processCheckoutStatePurchase` → Sale + récupération frais.

## Flow Hosted Checkout cible
Idem jusqu'au pricing, puis (flag on) : `stripe.checkout.sessions.create({ mode:'payment',
line_items:[{unit_amount: amountToPay}], payment_intent_data:{metadata:{intentId}},
metadata:{unifiedCheckoutId,...}, success_url, cancel_url })` → redirection `url`. Le PuI hébergé
porte `metadata.intentId` → **le webhook PI existant finalise à l'identique**. `checkout.session.completed`
réconcilie l'UnifiedCheckout.

## Impacts
- **UnifiedCheckout** : créé à la session-creation (payment_pending) ; réconcilié/finalisé au webhook.
- **Webhook** : ajout `checkout.session.completed` (idempotent, pré-check Sale) ; PI succeeded inchangé.
- **Invoice** : inchangé (facture Stripe officielle pour montant>0 ; reçu non fiscal pour 100 % carte cadeau).
- **Carte cadeau** : réservée par `session.payment_intent` (le hosted Session expose le PI à la création) →
  **identique au flux Elements** ; JAMAIS un discount Stripe (`unit_amount = amountToPay` = sold − carte cadeau).
- **0 €** : pas de Session ; `finalize-free` inchangé (+ UC shadow gated).

## Risques
- 🔴 `session.payment_intent` doit être disponible à la création (mode payment → oui). Sinon réservation impossible → guard.
- 🔴 Double finalisation (PI succeeded + session.completed) → idempotence obligatoire (index PI unique + pré-check Sale ; le 409 « déjà acheté » ne doit PAS être traité comme erreur → pré-check Sale d'abord).
- 🟡 Pricing/finalisation : ne PAS modifier (réutiliser pricing + `processCheckoutStatePurchase`).
- 🟡 Flag par défaut false → prod/Elements intacts ; le front consomme encore Elements (bascule UI = R2).

## Plan U2
1. Flag `CHECKOUT_HOSTED` + helper `unifiedCheckoutConfig`.
2. Branche hosted dans `createCheckoutSession` (`createHostedCheckoutResult`) : 0 € → free ; >0 → Session + UC.
3. `createUnifiedCheckoutRecord` (factory) sans re-pricing/validation.
4. Webhook : route + `handleCheckoutSessionCompletedEvent` (pré-check Sale, finalizeUnifiedCheckout).
5. finalize-free : UC shadow gated, payload inchangé.
6. Tests (flag, session, gift card, webhook, live wiring) ; flag off = byte-identique.
