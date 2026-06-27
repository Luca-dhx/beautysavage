# 111 — Roadmap refactor maintenabilité 10/10

> Plan progressif, **sans casser**, tests d'abord. Aucune extraction appliquée ici.

## Principe directeur
**Caractériser avant d'extraire.** Chaque extraction est précédée de tests de
caractérisation (la suite actuelle — 283 tests — couvre déjà checkout/refund/commission).
On extrait des **services purs** depuis les contrôleurs, en gardant les signatures HTTP
intactes (le contrôleur délègue). Aucune extraction ne doit changer un comportement testé.

## Services à extraire de `clientController.js`
| Ordre | Service cible | Contenu extrait | Tests préalables |
|---|---|---|---|
| 1 | `services/checkoutFinalizationService.js` | `processCheckoutStatePurchase` + cart + service + `persistSale` | p0 giftcard.zeroPayment, stripe.webhook.idempotence, p1 legalConsent/serverPricing/commission* (existants) |
| 2 | `services/giftCardSettlementService.js` | `planGiftCardUsage`, `finalizeGiftCardUsage` | p0 giftcard.concurrentDebit, zeroPayment |
| 3 | `services/saleBuilderService.js` | `buildSaleEntry`, options formation, `buildFormationEntryFromSale` | serverCheckoutPricing, commission base |
| 4 | `services/formationCancellationService.js` | `cancelFormationParticipation`, `createPresentielRefundRequest` | refund.* (poser un test présentiel cancel d'abord) |
| 5 | (laisser) profil/favoris/listes : déplacer en `accountController` léger | endpoints simples | health/auth |

Cible : `clientController` < 800 lignes (orchestration HTTP only).

## `stripeController.js`
| Ordre | Service cible | Contenu | Tests |
|---|---|---|---|
| 1 | `services/stripeWebhookService.js` | `handleWebhook` dispatch + `handleRefundUpdatedEvent` | stripe.webhook.idempotence, stripeWebhookFailureObservability, refund.* |
| 2 | `services/stripeFeeRecoveryService.js` | `fetchStripeFeeData`/`recoverStripeFeesAndUpdateSale` | invoice.recovery |
| 3 | garder `createCheckoutSession` mince (délègue pricing/legal/offer — déjà fait) | — | serverCheckoutPricing |

Cible : `stripeController` < 700 lignes.

## `mailService.js`
| Ordre | Service cible | Contenu | Tests |
|---|---|---|---|
| 1 | `services/mail/templates/*` | un module par template (vente, refund, booking, commission, contrat) | sendLog.* (envoi mocké) |
| 2 | `services/mail/mailTransport.js` | intégration Brevo + `SendLog` | sendLog, brevoWebhook |
| 3 | `services/mail/mailRenderer.js` | rendu HTML commun | — |

Cible : aucun fichier mail > 600 lignes.

## Ordre global recommandé
1. **Avant React (si temps)** : extraction `checkoutFinalizationService` (1) +
   `stripeWebhookService` (1) — ce sont les cœurs critiques, les figer en service testé
   stabilise le contrat d'API que React consommera.
2. **Pendant React** : gift-card settlement, sale builder, mail split.
3. **Après React / continu** : profil/listes, renderer mail.

## Critères de succès (10/10)
- Aucun contrôleur > 800 lignes ; aucun service > 600 lignes.
- Une responsabilité par module ; contrôleurs = orchestration HTTP only.
- 0 régression (suite verte avant/après chaque extraction).
- Dépendances explicites (pas de contrôleur important un autre contrôleur — supprimer
  `serviceBookingController → clientController.runPostSaleSideEffects` et
  `devWebhookController → commissionPaymentController.finalizeCommissionPaymentById` en les
  déplaçant vers des services partagés).

## Ce qui doit attendre React
- Le découpage profil/listes/reviews (faible risque, faible valeur avant React).
- Le split fin de `mailService` (cosmétique tant que les envois sont testés).
- Toute extraction non couverte par un test de caractérisation existant → poser le test d'abord.

## Bloquant React ?
**Non.** La maintenabilité est une dette de qualité, pas un bloqueur fonctionnel. Le contrat
d'API est stable et testé (283 tests). Recommandation : extraire les **2 cœurs critiques**
(finalisation checkout + webhook Stripe) en services avant d'ouvrir massivement React, le
reste en continu.
