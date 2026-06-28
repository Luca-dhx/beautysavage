# 154 — Audit pré-Sprint U3 : paiements plateforme (Stripe Dev)

> État des flux plateforme (compte Dev) avant unification. Aucune modification.

## Flux commission actuel
`POST /api/commissions/payments/:id/create-intent` (`commissionPaymentController.createCommissionIntent`) :
refresh (`refreshCommissionPayment`) → `netAmountDue` → si 0 `settled_zero` ; sinon idempotence PI +
verrou anti double-clic + `createCommissionPaymentIntent` (`stripeDevPaymentService`, PI metadata.
commissionPaymentId) → `{ clientSecret, paymentIntentId, amountCents }`. **Finalisation** : webhook
Dev `payment_intent.succeeded` (`stripeDevWebhookHandlers.handlePaymentIntentSucceeded`) →
`metadata.commissionPaymentId` → `finalizeCommissionPaymentById`. Polling `check-status`.

## Flux launch fee actuel
`stripeDevContractBillingService.createLaunchIntent` : `paymentIntents.create` (metadata
contractId/type) + `ContractCheckoutIntent{stripePaymentIntentId, type:launch}` → `{ clientSecret,
paymentIntentId, amountCents }`. **Finalisation** : webhook Dev PI → `ContractCheckoutIntent` (type
launch, par stripePaymentIntentId) → `launchFee.paid`.

## Flux abonnement actuel
`createMonthlySetup` : customer + `setupIntents.create` + `ContractCheckoutIntent{stripeSetupIntentId,
type:monthly}` → `{ clientSecret, setupIntentId, customerId }`. **Finalisation** : webhook Dev
`setup_intent.succeeded` (`handleSetupIntentSucceeded`) → attache PM + crée Price + Subscription.

## Finalizers existants à réutiliser (zéro changement métier)
- `finalizeCommissionPaymentById` (commission).
- `handlePaymentIntentSucceeded` (Dev) → launch via `ContractCheckoutIntent`.
- `handleSetupIntentSucceeded` (Dev) → subscription.

## Risques
- 🔴 Ne PAS modifier les finalizers Dev ni le business commission/contrat.
- 🔴 Hosted : le PI/SetupIntent de la Session doit porter la MÊME liaison que le flux actuel
  (commission : `payment_intent_data.metadata.commissionPaymentId` ; launch : `ContractCheckoutIntent{stripePaymentIntentId}` ;
  subscription : `ContractCheckoutIntent{stripeSetupIntentId}`) → finalisation par les webhooks EXISTANTS.
- 🟡 `session.payment_intent` / `session.setup_intent` doivent être disponibles à la création (mode payment/setup → oui).
- 🟡 Payload : flag off = inchangé ; flag on = ajoute `mode:'hosted', url` (drop clientSecret en hosted).

## Plan U3
1. Kinds `commission/launch_fee/subscription` + `payment.provider:'stripe_dev'`.
2. Flag `PLATFORM_CHECKOUT_HOSTED` + helper.
3. `createPlatformUnifiedCheckoutRecord` (factory, kind explicite, pas de pricing catalogue).
4. `stripeDevHostedCheckoutService` (Session mode payment / setup, Dev).
5. Branches hosted : commission / launch / monthly (réutilisent les liaisons → webhooks existants).
6. Webhook Dev : route `checkout.session.completed` → réconciliation UnifiedCheckout (best-effort).
7. Tests (flag, commission, launch, subscription, webhook) ; flag off = inchangé.
