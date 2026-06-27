# 123 — Audit pré-Sprint F1 : extraction du Checkout

> Lecture seule. Cartographie du domaine Checkout dans `clientController.js` (3253 lignes)
> avant extraction. Aucune logique modifiée. Objectif : sortir le checkout vers
> `services/checkout/`, transformer `clientController` en orchestrateur HTTP mince.

## Fonctions checkout dans clientController

### Builders / helpers purs (pas d'effet de bord)
| Fn | Lignes | Dépend de |
|---|---|---|
| `buildSaleId` | 209 | crypto, Date.now |
| `buildCustomerProfile` | 147 | — |
| `buildSaleEntry` | 222 | calculateFinalPrice, mongoose, validateObjectId |
| `validateAndBuildSelectedOptions` | 238 | validateObjectId |
| `buildFormationEntryFromSale` | 290 | — |
| `buildSaleCommissionSnapshot` | 301 | roundToCents |
| `applySaleCommissionSnapshot` | 322 | buildSaleCommissionSnapshot, saleDoc.save |
| `normalizeSnapshotItem` | 335 | — |
| `persistCartSnapshot` | 556 | normalizeSnapshotItem, CartSnapshot |
| `clearCartSnapshotBestEffort` | 2100 | CartSnapshot |
| `rollbackSingleSale` | 2086 | FormationSession, Purchase, Sale |
| `assertZeroRemainingForFreeOrder` | 2114 | roundToCents (anti-bypass 0 €) |

### Cœur persistance + effets post-vente
| Fn | Lignes | Rôle |
|---|---|---|
| `persistSale` | 436 | crée la Sale (items normalisés, taxSnapshot, pricingSnapshot, PI unique au INSERT), emitSaleEvent, déclenche runPostSale (sauf skip) |
| `runPostSaleSideEffects` | 351 | finalizeGiftCardUsage, sendSaleEmail, notifications, facture Stripe |

### Finaliseurs (orchestration achat)
| Fn | Lignes | Rôle |
|---|---|---|
| `processCheckoutStatePurchase` | 2663 | **dispatcher** : cart → processCart, service → processService, sinon formation/gift-card/product inline. Exporté, appelé par stripeController (webhook) + finalizeFreeCheckout |
| `processCartCheckoutStatePurchase` | 2124 | panier multi-items (formation présentielle/distancielle + produit), réservations session, gift plan, commission, rollback |
| `processServiceCheckoutStatePurchase` | 2461 | réservation prestation (pricing promo, options, acompte, gift plan capé acompte, createServiceBookingWithProtection, Sale, events) |
| `waitForExistingFreeSale` | 3134 | poll idempotence 0 € |
| `finalizeFreeCheckout` (HTTP) | 3143 | endpoint `POST /api/client/checkout/finalize-free` : legal + offer + pricing serveur + idempotence `free_<key>` + délègue à processCheckoutStatePurchase |

### Handlers HTTP legacy conservés dans clientController (consomment le checkout)
- `mockPay` (1161) — paiement simulé legacy ; utilise buildCustomerProfile, validateAndBuildSelectedOptions, buildSaleEntry, persistSale, applySaleCommissionSnapshot, runPostSaleSideEffects, rollbackSingleSale, planGiftCardUsage/finalizeGiftCardUsage.
- `saveCartSnapshot` (1448) — utilise persistCartSnapshot.

## Dépendances externes (qui importe le checkout depuis clientController)
| Module | Symboles |
|---|---|
| `controllers/stripeController.js` | `processCheckoutStatePurchase` (webhook → finalisation) |
| `controllers/serviceBookingController.js` | `runPostSaleSideEffects` |
| `controllers/giftCardController.js` | `persistSale`, `runPostSaleSideEffects`, `applySaleCommissionSnapshot` (+ `serializePurchasePayload`, **non-checkout, reste**) |
| `routers/clientRouter.js` | `finalizeFreeCheckout` (route) |

`serializePurchasePayload` n'est PAS du checkout (sérialiseur de Purchase) → reste dans
clientController, giftCardController continue de l'importer de là.

## Couplage critique (contrainte d'acyclicité)
`persistSale` → `runPostSaleSideEffects` (chemin par défaut, skip=false utilisé par
giftCardController). Les 3 finaliseurs → `persistSale` + `runPostSaleSideEffects`. Donc
`persistSale` + `runPostSaleSideEffects` doivent vivre dans un module **qui n'importe pas les
finaliseurs**, sinon cycle. → placés dans `checkoutPersistenceService`.

## Architecture cible (DAG, sans cycle)
```
checkoutPersistenceService   (persistSale, runPostSaleSideEffects, builders, rollback, cart, assertZero)
        ▲              ▲
checkoutBookingService   checkoutFinalizationService
   (processService)         (dispatcher + processCart + waitForExistingFreeSale)
                                 │ importe bookingService (processService)
checkoutValidationService  (validateFreeCheckoutPreconditions — legal+offer+pricing)   [leaf]
checkoutResponseMapper     (erreur → {status, body})                                   [leaf]
checkoutFacade             (point d'entrée : finalizeFreeCheckout + ré-exports)
```
- finalization → {persistence, bookingService} ; bookingService → persistence ; pas de cycle.
- clientController, stripeController, giftCardController, serviceBookingController, clientRouter
  importent depuis `checkoutFacade`.

## Ordre d'extraction
1. `checkoutPersistenceService` (helpers + persistSale + runPostSale) — verbatim.
2. `checkoutBookingService` (processServiceCheckoutStatePurchase) — verbatim.
3. `checkoutFinalizationService` (processCart + dispatcher + waitForExistingFreeSale) — verbatim.
4. `checkoutValidationService` + `checkoutResponseMapper` (extraits de finalizeFreeCheckout, sémantique identique).
5. `checkoutFacade` (finalizeFreeCheckout HTTP + ré-exports).
6. Repointer clientController (mockPay/saveCartSnapshot), stripeController, giftCardController, serviceBookingController, clientRouter.

## Risques
- 🔴 Détail dynamique : la branche gift-card de processCheckoutStatePurchase fait
  `await import('./giftCardController.js')` → chemin à corriger en `../../controllers/giftCardController.js`.
- 🟡 `validateObjectId`/`roundToCents` : helpers triviaux dupliqués localement par convention
  (déjà le cas dans ~10 services). Les copies checkout utilisent `mongoose.Types.ObjectId.isValid`.
- 🟡 `finalizeFreeCheckout` : mapping HTTP par étape (legal 400/LEGAL_CONSENT_REQUIRED ;
  offer 409/OFFER_NOT_AVAILABLE ; générique 500). Préservé en normalisant les erreurs dans
  le validation service (status/code par défaut) + mapper.
- 🟢 Le reste = déplacement verbatim, aucune restructuration de flux.

## Tests couvrants existants
- `tests/p0` : `giftcard.zeroPayment.characterization`, `purchaseFlowService.zeroPayment.wiring`,
  `stripe.webhook.idempotence.characterization`, `booking.*` (doubleSlot, slotRevalidation, pendingPaymentCleanup).
- `tests/p1` : `serverCheckoutPricing`, `serverPricingGiftCardPromotion`, `checkoutAmountTampering`,
  `legalConsentCheckout`, `depositPaymentFlow`, `depositDistanceLearningGuards`,
  `giftCardPaymentNotDiscount`, `commissionBaseIncludesGiftCard`, `invoiceGiftCardPaymentLine`,
  `giftCardUsageReceipt`, `promotionSingleApplication`, `stripeWebhook*`.

## Tests manquants (ajoutés en F1)
- `tests/p1/checkoutExtractionParity.test.js` : prouve que les entrées publiques du checkout
  (finalize-free 0 €, idempotence, consentement manquant, montant restant dû → 402) renvoient
  exactement les mêmes formes/statuts après extraction, et que la facade ré-exporte les mêmes
  fonctions (identité référentielle) que celles consommées par stripe/giftCard/serviceBooking.
