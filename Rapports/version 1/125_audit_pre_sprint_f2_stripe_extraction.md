# 125 — Audit pré-Sprint F2 : extraction du domaine Stripe

> Lecture seule. Cartographie de `controllers/stripeController.js` (1727 lignes) avant
> extraction vers `services/stripe/`. Aucune logique modifiée. Objectif : contrôleur =
> orchestrateur HTTP mince.

## Fonctions Stripe dans stripeController

### Config / client
- `getStripe` (41) — client Stripe institut via `getCredential('stripe-institut', secret_key)`.
- `getConfig` (1716) [HTTP] — publishable key.
- webhook_secret lu inline dans `handleWebhook`.

### Métadonnées / parsing (partagé checkout ↔ webhook)
- `normalizeCurrency`, `normalizeStripeId`, `stringifyMetadataValue`,
  `buildPaymentIntentCheckoutMetadata`, `parseSelectedOptionsMetadata`,
  `parseAppliedGiftCardsMetadata`, `buildWebhookFallbackPayload`, `roundToCents`.

### Frais Stripe (recovery — utilisé par app.js + webhook + 2 handlers HTTP)
- `STRIPE_FEE_PENDING_QUERY`, `buildStripeFeeSaleQuery`, `getBalanceTx`, `fetchStripeFeeData`,
  `persistStripeFeeData`, `recoverStripeFeesAndUpdateSale`, `countPendingStripeFeesSales`,
  `listPendingStripeFeesSales`, `registerPendingStripeFeeCreatedListener`,
  `notifyPendingStripeFeeCreated`.
- HTTP : `getTransactionFees` (1287), `getPendingFeesCount` (1330).

### Checkout (PaymentIntent)
- Validateurs : `isLegalStateValid`, `isValidObjectId`, `normalizeCheckoutItems`,
  `parseGiftCardCheckoutAmount`, `validateGiftCardCheckoutState`,
  `validateCheckoutStateAgainstCatalog`, `validateCartItemsAgainstCatalog`,
  `hasActiveFormationPurchase`.
- `createCheckoutSession` (721) [HTTP] — validation service/cart/single + legal A1 + offre A7 +
  anti-doublon + pricing serveur B2 + création PaymentIntent + persistance
  StripeCheckoutIntent + réservation carte cadeau.

### Webhook
- `isDuplicateStripePaymentSaleError` (1013), `isRetryablePurchaseProcessingError` (690).
- `handleWebhook` (1019) [HTTP] — secret + `constructEvent` + routing
  (`charge.refund.updated` / `payment_intent.payment_failed` / `payment_intent.succeeded`) +
  idempotence + fallback metadata + `processCheckoutStatePurchase` (retry) + recovery frais +
  `recordWebhookFailure`.
- `handleRefundUpdatedEvent` (1523) — succeeded/failed/pending, credit note, recredit carte
  cadeau, commission reversal, email/notif. Helpers : `normalizeStripeRefundStatus`,
  `normalizeGiftCardRefundStatus`, `buildCreditNoteIdempotencyKey`.

### Résultat paiement (HTTP)
- `getSessionStatus` (1353), `getPaymentResult` (1446) + helpers `buildPaymentFailureMessage`,
  `buildPurchasePayload`, `getRetryOrigin`.

## Dépendances externes (consommateurs)
| Module | Symboles |
|---|---|
| `routers/stripeRouter.js` | `createCheckoutSession`, `handleWebhook`, `getSessionStatus`, `getPaymentResult`, `getConfig`, `getTransactionFees`, `getPendingFeesCount` (HTTP, signature `(req,res)`) |
| `app.js` | `countPendingStripeFeesSales`, `listPendingStripeFeesSales`, `recoverStripeFeesAndUpdateSale`, `registerPendingStripeFeeCreatedListener` (job frais) |
| `tests/p1/stripeWebhookCredentialVault`, `stripeWebhookFailureObservability` | `handleWebhook(req,res)` **appelé directement** (mock req/res) |
| `tests/p1/stripeCredentialMigration` | `getConfig({}, res)` **appelé directement** |

**Contrainte forte** : `handleWebhook` et `getConfig` doivent rester exportés par le contrôleur
avec la signature `(req, res)` (appels directs en test). → contrôleur = délégateurs minces.

## Architecture cible (`services/stripe/`)
```
stripeConfigService        getStripeClient / getStripePublishableKey / getStripeWebhookSecret (getCredential)
stripeMetadataService      build/parse metadata + buildWebhookFallbackPayload + normalizeStripeId/Currency
stripeFeeService           recovery frais (fetch/persist/recover/count/list + listener)         [app.js]
stripeCheckoutService      createCheckoutSessionFromRequest + validateurs catalogue/legal/pricing
stripeRefundEventService   handleRefundUpdatedEvent + normalizeRefundStatus + creditNoteKey
stripeWebhookEventHandlers payment_intent.succeeded / payment_failed (idempotence/fallback/retry/fees)
stripeWebhookService       handleWebhookFromRequest : secret + constructEvent + routing + failure log
stripeResponseMapper       send(res, {status, json|send}) → réponse HTTP identique
stripeInvoiceFacade        (E2) createStripeInvoiceForSale
stripeRefundFacade         (E2) triggerRefundExecution + éligibilités
```
DAG : `webhookService → {webhookEventHandlers → {checkoutFacade, feeService, metadata, config},
refundEventService → config}` ; `checkoutService → {config, metadata, pricing, legal, offer}` ;
`feeService → {config, metadata}` ; tous → config feuille. Pas de cycle.

## Ordre d'extraction
1. `stripeConfigService` (getStripe/keys).
2. `stripeMetadataService` (helpers partagés).
3. `stripeFeeService` (recovery) + repointer app.js.
4. `stripeCheckoutService` (createCheckoutSession + validateurs) → result objects.
5. `stripeRefundEventService` (handleRefundUpdatedEvent).
6. `stripeWebhookEventHandlers` (succeeded/failed).
7. `stripeWebhookService` (signature/routing/failure log).
8. `stripePaymentQueryService` (getSessionStatus/getPaymentResult) — optionnel mais réduit le contrôleur.
9. `stripeResponseMapper` + contrôleur délégateur mince. Nettoyer imports.

## Zones critiques (zéro changement de comportement)
- **Webhook 500 = Stripe retente** : préserver EXACTEMENT les statuts (500 sur config/processing,
  400 signature, 200 received/idempotent) et le `recordWebhookFailure` (stage/code) avant réponse.
- **Idempotence** : E11000 (`isDuplicateStripePaymentSaleError`) → 200 idempotent ; retry local
  (`isRetryablePurchaseProcessingError`, 3 tentatives, backoff) inchangé.
- **Réponses mixtes** `res.send(text)` (webhook) vs `res.json(obj)` → mapper discrimine `send`/`json`.
- **Pricing serveur** : `buildServerCheckoutPricing` + `assertClientPricingMatchesServer` (B2) et
  `checkoutState.serverPricing` persisté — montant SERVEUR jamais client.
- **Secret webhook depuis le coffre** (vault > .env) — `getStripeWebhookSecret`.
- **Refund** : credit note idempotent, recredit carte cadeau (`claimGiftCardRecredit` +
  `recreditGiftCardPortion`), commission reversal, rollback_needed.

## Tests couvrants existants
`stripe.webhook.idempotence.characterization` (p0), `stripeWebhookCredentialVault`,
`stripeWebhookFailureObservability`, `stripeCredentialMigration`, `stripeInvoicesOfficialSource`,
`serverCheckoutPricing`, `serverPricingGiftCardPromotion`, `checkoutAmountTampering`,
`credentialVault*`, `integratedApiCredentials`.

## Tests manquants (ajoutés en F2)
- `tests/p1/stripeControllerExtractionParity.test.js` : identité référentielle (contrôleur =
  délégateur, fonctions définies dans les services) + `GET /config` inchangé + createCheckoutSession
  pricing mismatch inchangé.
- `tests/p1/stripeWebhookExtractionParity.test.js` : signature invalide → 400, secret absent → 500,
  replay PI succeeded → idempotent, event non géré → 200, failure log safe (aucun secret).

## Plan
Extraction verbatim des corps de fonctions vers les services ; les handlers HTTP du contrôleur
deviennent `(req,res) => mapper.send(res, await service.xFromRequest(req))`. `handleWebhook`/
`getConfig` gardent la signature `(req,res)` (appels directs en test). app.js repointé vers
`stripeFeeService`. Tests de caractérisation pour verrouiller le contrat HTTP.
