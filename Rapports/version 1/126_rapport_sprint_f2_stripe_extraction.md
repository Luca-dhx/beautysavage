# 126 — Sprint F2 : extraction du domaine Stripe

> `stripeController` devient un orchestrateur HTTP mince. Le domaine Stripe vit dans
> `services/stripe/`. **Zéro changement fonctionnel / contrat API / statut HTTP / payload /
> pricing / commission / refund / invoice / booking.** Suite **329 verte** + audits 36 + 20.

## stripeController — avant / après
| | Lignes |
|---|---|
| Avant (HEAD 32bb933) | **1727** |
| Après | **135** |
| Réduction | **−1592 (~92 %)** |

Le contrôleur ne contient plus AUCUNE logique métier : 7 handlers HTTP délégateurs
(`createCheckoutSession`, `handleWebhook`, `getSessionStatus`, `getPaymentResult`, `getConfig`,
`getTransactionFees`, `getPendingFeesCount`) qui font requête → service → `stripeResponseMapper`.
`handleWebhook` et `getConfig` conservent la signature `(req, res)` (appelés directement en test).

## Services créés (`services/stripe/`)
| Module | Contenu | Rôle |
|---|---|---|
| `stripeConfigService.js` | `getStripeClient`, `getStripePublishableKey`, `getStripeWebhookSecret` | Client + credentials (coffre IntegratedApi). Feuille du DAG. |
| `stripeMetadataService.js` | build/parse metadata PI, `buildWebhookFallbackPayload`, `normalizeStripeId/Currency`, `roundToCents` | Helpers partagés checkout ↔ webhook. |
| `stripeFeeService.js` | recovery frais (`fetch/persist/recover/count/list` + listener) | Frais Stripe (BalanceTransaction). Consommé par app.js (job). |
| `stripeCheckoutService.js` | `createCheckoutSessionFromRequest` + validateurs catalogue/legal/pricing | Création PaymentIntent (montant SERVEUR B2), StripeCheckoutIntent, réservation carte cadeau. |
| `stripeRefundEventService.js` | `handleRefundUpdatedEvent` (+ normalizers, creditNote key) | `charge.refund.updated` : credit note, recredit carte cadeau, commission reversal. |
| `stripeWebhookEventHandlers.js` | `handlePaymentIntentSucceededEvent`, `handlePaymentFailedEvent` | Finalisation vente (idempotence/fallback/retry/fees), libération réservation. |
| `stripeWebhookService.js` | `handleWebhookFromRequest` | Secret + `constructEvent` + routing + failure log. |
| `stripePaymentQueryService.js` | `getSessionStatusFromRequest`, `getPaymentResultFromRequest` (+ helpers) | Lectures statut/résultat (vérif Stripe + propriété DB). |
| `stripeResponseMapper.js` | `send(res, { status, json\|send })` | Mapping résultat → réponse HTTP (statuts/payloads identiques). |
| `stripeInvoiceFacade.js`, `stripeRefundFacade.js` (E2) | re-exports | Inchangés. |

DAG **acyclique** : `webhookService → {webhookEventHandlers, refundEventService}` ;
`webhookEventHandlers → {checkoutFacade, feeService, metadata, webhookFailure}` ;
`checkoutService → {config, metadata, pricing, legal, offer, giftCardReservation}` ;
`feeService → {config, metadata}` ; tous → `config` (feuille). Chargement de tous les modules
+ contrôleur + router vérifié — aucun cycle.

## Responsabilités déplacées
- Config/credentials Stripe (institut) → `stripeConfigService`.
- Création PaymentIntent + validations (service/cart/single, legal A1, offre A7, anti-doublon,
  pricing serveur B2 faisant foi) → `stripeCheckoutService`.
- Signature/`constructEvent`/routing/failure log → `stripeWebhookService`.
- `payment_intent.succeeded` (idempotence E11000, fallback metadata, retry borné, recovery frais)
  + `payment_intent.payment_failed` → `stripeWebhookEventHandlers`.
- `charge.refund.updated` → `stripeRefundEventService`.
- Récupération des frais Stripe → `stripeFeeService` (app.js repointé).
- Lectures statut/résultat → `stripePaymentQueryService`.

## Comportement inchangé — preuves
- **Déplacement verbatim** des corps ; les `res.status().json()/.send()` deviennent des
  résultats `{ status, json|send }` mappés à l'identique par `stripeResponseMapper` (json vs
  send préservés — le webhook répond en texte, les API en JSON).
- **Statuts critiques préservés** : webhook 500 (config/processing → Stripe retente),
  400 (signature), 200 (received/idempotent) ; checkout 401/400/403/409/500 ; config 200/500.
- **Tests de caractérisation** (`stripeControllerExtractionParity`,
  `stripeWebhookExtractionParity`, +8) : délégateurs minces, logique dans les services,
  `GET /config` 200/500, createCheckoutSession 401, signature invalide → 400, event non géré → 200,
  aucun secret exposé.
- Suites existantes inchangées et vertes : `stripe.webhook.idempotence.characterization`,
  `stripeWebhookCredentialVault`, `stripeWebhookFailureObservability`, `stripeCredentialMigration`,
  `stripeInvoicesOfficialSource`, `serverCheckoutPricing`, `serverPricingGiftCardPromotion`,
  `checkoutAmountTampering`.

## Imports / dépendances (Partie 5)
- `stripeController` : imports réduits à 6 (mapper + services). Aucun import inutile, aucune
  référence pendante.
- `app.js` repointé : fonctions frais importées de `services/stripe/stripeFeeService.js`.
- Pas de dépendance circulaire. `process.env` Stripe centralisé (NGROK_DOMAIN dans checkout
  service ; credentials via `getCredential` dans config service). Helpers triviaux
  (`roundToCents`/`isValidObjectId`) locaux par convention du dépôt.
- `npm run lint` : **aucun script lint** dans package.json (absence documentée — déjà noté F1).

## Gate (Partie 7)
`git grep -n "constructEvent|payment_intent.succeeded|charge.refund.updated|handleRefundUpdatedEvent|createCheckoutSession" controllers/stripeController.js`
→ uniquement le délégateur `createCheckoutSession` (import + handler 2 lignes). Aucune occurrence
de `constructEvent`, des littéraux d'événements, ni de `handleRefundUpdatedEvent`.

## Tests exécutés
- `npm test` → **329 passed** (p0=44, p1=279, integration=6) — dont parity (+8).
- `npm run audit:business-scenarios` → **36 passed**.
- `npm run audit:commissions` → **20 passed**.

## Dette restante
- **Stripe Dev** (`devWebhookController` ~271 lignes, `utils/stripeDevClient`,
  `commissionPaymentController`) NON touché ce sprint (F2B) : pourrait réutiliser
  `stripeConfigService` (compte dev distinct) + un `stripeDevWebhookService`.
- `stripeWebhookEventHandlers` dépend du `checkoutFacade` (sain) ; un futur `saleFinalizationPort`
  pourrait découpler totalement webhook ↔ checkout.
- Split interne de `mailService` (rapport 122) toujours en attente.

## Recommandation Sprint F3
1. **F2B Stripe Dev** : extraire le domaine du compte plateforme (`devWebhookController` +
   facturation contrat/commission) vers `services/stripe/dev/*`, en réutilisant le pattern
   config/webhook/responseMapper de F2.
2. Puis **split de `mailService`** (mailTemplateRuntime / mailContextResolver / mailBrevoGateway /
   mailTrackingService) derrière `mailDispatcher` (seam déjà en place depuis E2).
Précéder chaque déplacement de tests de caractérisation.
