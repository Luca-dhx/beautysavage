# 120 — Audit contrôleurs / refactor backend

> Audit avant extraction. Lecture seule. Aucune logique métier ne sera modifiée.

## Tailles (HEAD courant)
| Fichier | Lignes | Verdict |
|---|---|---|
| `controllers/clientController.js` | ~3467 | 🔴 monolithe |
| `services/mailService.js` | ~3845 | 🔴 monolithe |
| `controllers/stripeController.js` | ~1727 | 🟡 volumineux |
| `controllers/serviceBookingController.js` | ~888 | 🟡 moyen |

## clientController.js — responsabilités mélangées
- **Profil/favoris/listes** (HTTP simple) ; **panier snapshot** ; **mockPay** (legacy).
- **Cœur achat** : `persistSale`, `runPostSaleSideEffects`, finaliseurs
  `processCheckoutStatePurchase` / `processCartCheckoutStatePurchase` /
  `processServiceCheckoutStatePurchase`, `finalizeFreeCheckout`.
- **Carte cadeau** : `planGiftCardUsage`, `finalizeGiftCardUsage` (+ helpers
  `normalizeGiftCardCode`, `sanitizeGiftCardAmount`, `deductGiftCardBalance`,
  `verifyGiftCardPasswordHash`).
- **Pricing/legal/offre** : déjà extraits (checkoutPricingService, legalConsentService,
  offerReadinessService, pricingConcepts).
- **Annulation/refund présentiel** ; **options formation** ; **commission snapshot**.
- Fonctions >150 lignes : `processCheckoutStatePurchase`, `processCartCheckoutStatePurchase`,
  `processServiceCheckoutStatePurchase`, `mockPay`, `cancelFormationParticipation`.
- Mélange validation + calcul + DB + orchestration + HTTP dans les handlers d'achat.

## stripeController.js
- `createCheckoutSession` (validation légale/offre/pricing + PI), `handleWebhook`
  (dispatch succeeded/refund.updated/payment_failed), `handleRefundUpdatedEvent`,
  récupération frais Stripe, `getPaymentResult`/`getSessionStatus`, credit notes.
- Appel circulaire : webhook → `processCheckoutStatePurchase` (clientController).

## mailService.js
- Tous les emails (vente/refund/booking/commission/contrat/reset) + rendu + Brevo + SendLog.

## serviceBookingController.js
- Détail/no-show/complete/cancel/balance-paid + flow d'annulation tokenisé. Acceptable.

## Appels circulaires / couplages
- `serviceBookingController` → `clientController.runPostSaleSideEffects`.
- `devWebhookController` → `commissionPaymentController.finalizeCommissionPaymentById`.
- `stripeController.handleWebhook` → `clientController.processCheckoutStatePurchase`.

## Architecture cible
```
services/
  checkout/   checkoutGiftCardService, checkoutValidationService,
              checkoutFinalizationService, checkoutPersistenceService, checkoutPricingService
  stripe/     stripeWebhookService, stripeCheckoutService, stripeInvoiceFacade, stripeRefundFacade
  mail/       mailDispatcher, mailTemplateRuntime, mailContextResolver, mailBrevoGateway, mailTrackingService
controllers/  orchestrateurs HTTP minces (request → service → response)
```

## Ordre d'extraction (du moins au plus risqué)
1. **checkoutGiftCardService** — `planGiftCardUsage`/`finalizeGiftCardUsage` + helpers
   (isolés, helpers utilisés uniquement par ces 2 fonctions → **extraction sûre, faite ici**).
2. **Facades Stripe** (`stripeInvoiceFacade`, `stripeRefundFacade`) — seams re-export, zéro risque.
3. **Facade Mail** (`mailDispatcher`) — seam re-export, zéro risque.
4. **checkoutFinalizationService** — déplacer `processCheckoutStatePurchase` & co. (gros,
   intriqué avec persistSale/commission/refund) → **étape ultérieure, tests de
   caractérisation d'abord**.
5. **stripeWebhookService** — déplacer `handleWebhook`/`handleRefundUpdatedEvent` → ultérieur.
6. **Split mailService** interne (templates/transport/render) → ultérieur.

## Stratégie (cette mission = SEAM-FIRST)
- Phase « commencer » : extraction RÉELLE des unités sûres (gift-card) + création des
  **seams** (modules de service re-exportant les fonctions publiques) pour matérialiser
  l'architecture cible **sans déplacer** le code intriqué (zéro risque, tests verts).
- Les déplacements internes lourds (finalisation checkout, webhook, split mail) sont
  **ordonnés et documentés** (rapport 122) pour des itérations suivantes, chacune précédée
  de tests de caractérisation.

## Risques
- 🔴 Déplacer les finaliseurs/webhook sans tests dédiés = régression. → reporté, seams d'abord.
- 🟢 Gift-card : helpers isolés → extraction sûre.
- 🟢 Facades re-export : aucune duplication, aucun changement de comportement.
