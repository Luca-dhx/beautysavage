# 124 — Sprint F1 : extraction du domaine Checkout

> `clientController` devient un orchestrateur HTTP mince. Le domaine Checkout vit dans
> `services/checkout/`. **Zéro changement fonctionnel / contrat API / statut HTTP / payload /
> pricing / remboursement / booking.** Suite **321 verte** + audits 36 + 20.

## clientController — avant / après
| | Lignes |
|---|---|
| Avant (HEAD 3bcca2b) | **3253** |
| Après | **1707** |
| Réduction | **−1546 (~47 %)** |

`clientController` ne contient plus AUCUNE définition de finaliseur ni de persistance de vente.
Il conserve les handlers HTTP (`mockPay` legacy, `saveCartSnapshot`, profil, favoris,
modules/sessions, annulation présentiel, reviews…) qui consomment le checkout via la facade.

## Services créés (`services/checkout/`)
| Module | Contenu | Rôle |
|---|---|---|
| `checkoutPersistenceService.js` | `persistSale`, `runPostSaleSideEffects`, `buildSaleId`, `buildCustomerProfile`, `buildSaleEntry`, `validateAndBuildSelectedOptions`, `buildFormationEntryFromSale`, `buildSaleCommissionSnapshot`, `applySaleCommissionSnapshot`, `normalizeSnapshotItem`, `persistCartSnapshot`, `clearCartSnapshotBestEffort`, `rollbackSingleSale`, `assertZeroRemainingForFreeOrder` | Base du DAG : persistance Sale + effets post-vente + builders. N'importe AUCUN finaliseur. |
| `checkoutBookingService.js` | `processServiceCheckoutStatePurchase` | Finaliseur réservation prestation (pricing promo, options, acompte D3, booking protégé). Importe persistence uniquement. |
| `checkoutFinalizationService.js` | `processCheckoutStatePurchase` (dispatcher), `processCartCheckoutStatePurchase`, `waitForExistingFreeSale` | Finaliseurs checkout-state. Importe persistence + bookingService. |
| `checkoutValidationService.js` | `validateFreeCheckoutPreconditions` | Préconditions 0 € (legal A1 + offre A7 + pricing serveur B2), erreurs normalisées. |
| `checkoutResponseMapper.js` | `mapCheckoutValidationError`, `mapCheckoutFinalizationError` | Mapping erreur → réponse HTTP (statuts/payloads identiques). |
| `checkoutFacade.js` | `finalizeFreeCheckout` (HTTP) + ré-exports | **Point d'entrée unique** des consommateurs. |
| `checkoutGiftCardService.js` (E2) | `planGiftCardUsage`, `finalizeGiftCardUsage` | Inchangé (extrait au sprint E2). |

Graphe **acyclique** : `facade → finalization → {persistence, bookingService}` ;
`bookingService → persistence` ; `validation`/`responseMapper` = feuilles.
La branche gift-card du dispatcher charge giftCardController par **import dynamique**
(`await import('../../controllers/giftCardController.js')`) → aucun cycle au chargement.

## Responsabilités déplacées
- Persistance de vente + snapshots fiscal/pricing/legal + index PI unique : `persistSale`.
- Effets post-vente (carte cadeau finalisée, e-mail, notifications, facture Stripe) : `runPostSaleSideEffects`.
- Finalisation formation/produit/carte-cadeau (single) + panier + prestation : dispatcher + cart + booking.
- Validation 0 € + idempotence `free_<key>` + mapping HTTP : validation/facade/responseMapper.

## Consommateurs repointés vers la facade
| Module | Avant (clientController) | Après (checkoutFacade) |
|---|---|---|
| `controllers/stripeController.js` | `processCheckoutStatePurchase` | idem via facade |
| `controllers/serviceBookingController.js` | `runPostSaleSideEffects` | idem via facade |
| `controllers/giftCardController.js` | `persistSale`, `runPostSaleSideEffects`, `applySaleCommissionSnapshot` | via facade (`serializePurchasePayload` reste de clientController) |
| `routers/clientRouter.js` | `finalizeFreeCheckout` | via facade |
| `clientController` (mockPay/saveCartSnapshot) | définitions locales | imports facade |
| 8 fichiers de test | `import … from controllers/clientController.js` | `… from services/checkout/checkoutFacade.js` |

## Comportement inchangé — preuves
- **Déplacement verbatim** : corps de fonctions copiés à l'identique (seuls adaptés : helper
  local `isValidObjectId` au lieu du `validateObjectId` du controller, et le chemin du dynamic
  import giftCardController).
- **Identité référentielle** (test `checkoutExtractionParity`) : `facade.X === sousService.X`
  pour 11 fonctions → **une seule définition**, aucune duplication de logique.
- **Contrat HTTP finalize-free** (même test) : 401 sans auth, 400 `CHECKOUT_STATE_REQUIRED`,
  402 `PAYMENT_REQUIRED` (solde dû) — identiques.
- Tous les flux métier (Stripe checkout, 0 €, carte cadeau partielle/100 %, acompte
  prestation, consentement manquant, montant trafiqué, slot indisponible, distanciel sans
  accès, promotion, webhook idempotent) restent couverts par les suites existantes, toutes vertes.

## Imports / dépendances (Partie 5)
- `clientController` : imports orphelins supprimés (`Service`, `ServiceBooking`,
  `PractitionerProfile`, `GiftCard`, `crypto`, `calculateFinalPrice`, `getActivePromotionsForTargets`,
  `resolveEffectiveServiceUnitPrice`, `emitSaleEvent`, `emitBookingEvent`, `buildTaxSnapshot`,
  `buildPricingSnapshot`, `createStripeInvoiceForSale`, `sendSaleEmail`, `deriveLegalRequirements`,
  `validateCheckoutLegalConsents`, `assertCheckoutFormationsPurchasable`,
  `resolveAccessDeliveryStatusForFormation`, `buildServerCheckoutPricing`,
  `createServiceBookingWithProtection`). Aucune référence pendante (vérifié par grep).
- Pas de dépendance circulaire (chargement de tous les modules vérifié).
- `roundToCents` / `isValidObjectId` : copies locales triviales par **convention du dépôt**
  (déjà ~10 services) — ce ne sont pas des duplications de logique métier.
- `npm run lint` : **aucun script lint** défini dans package.json (absence documentée).

## Tests exécutés
- `npm test` → **321 passed** (p0=44, p1=271, integration=6) — dont `checkoutExtractionParity` (+4).
- `npm run audit:business-scenarios` → **36 passed**.
- `npm run audit:commissions` → **20 passed**.

## Dette restante
- `stripeController.createCheckoutSession` + `handleWebhook`/`handleRefundUpdatedEvent` :
  hors clientController (toujours dans stripeController). À extraire en **F2** vers
  `services/stripe/stripeCheckoutService` + `stripeWebhookService` (le seam dispatcher est déjà
  prêt côté facade).
- `mockPay` (legacy paiement simulé) : pourrait être supprimé/retiré des routes après
  confirmation qu'il n'est plus utilisé en prod.
- `checkoutValidationService` ne couvre que le 0 € ; la validation du chemin Stripe
  (`createCheckoutSession`) reste dans stripeController → à mutualiser en F2.
- Split interne de `mailService` (mailTemplateRuntime/Brevo/tracking) — déjà ordonnancé (rapport 122).

## Recommandation Sprint F2
Extraire le domaine **Stripe** de `stripeController` :
1. `stripeCheckoutService.createCheckoutSession` (validation légale/offre/pricing partagée avec
   `checkoutValidationService`).
2. `stripeWebhookService.handleWebhook` / `handleRefundUpdatedEvent` (délègue déjà à
   `checkoutFacade.processCheckoutStatePurchase`).
3. Mutualiser la validation checkout (Stripe + 0 €) dans `checkoutValidationService`.
Précéder chaque déplacement de tests de caractérisation (webhook idempotence déjà couvert).
