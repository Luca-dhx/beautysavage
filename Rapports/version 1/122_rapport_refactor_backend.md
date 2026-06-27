# 122 — Refactor backend E2 (extraction des cœurs critiques)

> Début du grand refactor pré-React. **Aucune logique métier modifiée. Aucun changement
> fonctionnel ni de contrat API. Tous les tests verts** (317 + 36 audit business + 20 audit
> commissions). Stratégie **SEAM-FIRST** : 1 extraction réelle sûre + 3 seams.

## Architecture — avant
```
controllers/clientController.js   ~3460  HTTP + achat + carte cadeau + refund + listes
services/mailService.js           ~3845  tous les emails + render + Brevo + SendLog
controllers/stripeController.js   ~1727  checkout session + webhook + frais + credit notes
controllers/serviceBookingController.js ~888
```
Couplages : `stripeController.handleWebhook` → `clientController.processCheckoutStatePurchase` ;
`serviceBookingController` → `clientController.runPostSaleSideEffects`.

## Architecture — cible (rapport 120)
```
services/
  checkout/  checkoutGiftCardService ✅ | checkoutValidationService · checkoutPricingService(déjà)
             checkoutFinalizationService · checkoutPersistenceService            (à venir)
  stripe/    stripeInvoiceFacade ✅ · stripeRefundFacade ✅
             stripeCheckoutService · stripeWebhookService                        (à venir)
  mail/      mailDispatcher ✅
             mailTemplateRuntime · mailContextResolver · mailBrevoGateway · mailTrackingService (à venir)
controllers/  orchestrateurs HTTP minces
```

## Réalisé dans cette mission

### 1. Extraction RÉELLE — `services/checkout/checkoutGiftCardService.js`
Déplacement **verbatim** (zéro changement de comportement) hors de `clientController` :
- exports : `planGiftCardUsage`, `finalizeGiftCardUsage` ;
- helpers privés (utilisés UNIQUEMENT par ces 2 fonctions, donc déplacés avec elles) :
  `normalizeGiftCardCode`, `sanitizeGiftCardAmount`, `deductGiftCardBalance`,
  `verifyGiftCardPasswordHash`, + `roundToCents`, `isValidObjectId` (ex-`validateObjectId`).
- `clientController` importe désormais `{ planGiftCardUsage, finalizeGiftCardUsage }` depuis le
  service. Imports devenus orphelins **supprimés** de clientController : `argon2`,
  `GiftCardTransaction`, et les 4 helpers `giftCardReservationService`
  (`computeAvailableGiftCardBalance`, `releaseGiftCardReservationsForPaymentIntent`,
  `debitGiftCardBalanceAtomic`, `recreditGiftCardBalanceAtomic`) — désormais consommés par le
  nouveau service. **Aucune duplication** : une seule définition de chaque fonction.
- 11 sites d'appel dans clientController (8 `planGiftCardUsage`, 3 `finalizeGiftCardUsage`)
  inchangés, résolus par l'import.

### 2. Seams Stripe (re-export, zéro risque)
- `services/stripe/stripeInvoiceFacade.js` → `createStripeInvoiceForSale`.
- `services/stripe/stripeRefundFacade.js` → `triggerRefundExecution` + `getPresentielRefundEligibility`,
  `getDistancielRefundEligibility`, `getServiceRefundEligibility`.
- `clientController` repointé vers ces façades (`stripeInvoiceFacade`, `stripeRefundFacade`).

### 3. Seam Mail (re-export, zéro risque)
- `services/mail/mailDispatcher.js` → 30 fonctions `send*` de `mailService`.
- `clientController` repointé pour `sendSaleEmail`, `sendClientSessionCancellationEmail`,
  `sendInstituteClientCancelledNoticeEmail`.

> Les seams **ne déplacent aucune logique** : ils matérialisent la frontière de modules cible
> pour permettre des extractions internes ultérieures sans casser les appelants.

## Pourquoi SEAM-FIRST pour le reste
Les finaliseurs (`processCheckoutStatePurchase` / `…Cart…` / `…Service…`, `persistSale`,
`runPostSaleSideEffects`), le webhook Stripe et le split interne de `mailService` sont
fortement intriqués (commission, refund, side-effects, appels circulaires webhook→finaliseur).
Les déplacer sans **tests de caractérisation dédiés** = risque de régression. Ils restent en
place, derrière des seams, et sont ordonnancés ci-dessous.

## Dette restante (itérations suivantes, ordonnées)
1. `checkoutFinalizationService` — déplacer les finaliseurs depuis clientController (tests de
   caractérisation d'abord). Le seam consommateur côté stripeWebhook réduira le couplage circulaire.
2. `stripeCheckoutService` / `stripeWebhookService` — extraire `createCheckoutSession` /
   `handleWebhook` / `handleRefundUpdatedEvent` de stripeController.
3. `checkoutValidationService` + `checkoutPersistenceService` — isoler validation et persistSale.
4. Split interne `mailService` : `mailTemplateRuntime` (loadTemplate/saveTemplate/render),
   `mailBrevoGateway` (postToBrevo), `mailTrackingService` (SendLog), `mailContextResolver`.
   `mailDispatcher` deviendra l'orchestrateur fin par-dessus ces modules.

## Validation
- `npm test` → **317 passed** (p0=44, p1=267, integration=6).
- `npm run audit:business-scenarios` → **36 passed**.
- `npm run audit:commissions` → **20 passed**.
- Re-exports vérifiés (tous résolvent vers des fonctions). Aucun secret en diff.
