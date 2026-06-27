# 110 — Audit gros contrôleurs (maintenabilité)

> Audit only. Tailles mesurées (HEAD courant).

| Fichier | Lignes | Exports | Verdict |
|---|---|---|---|
| `controllers/clientController.js` | ~3445 | 22 | 🔴 monolithe |
| `services/mailService.js` | ~3845 | — | 🔴 monolithe |
| `controllers/stripeController.js` | ~1727 | 11 | 🟡 volumineux |
| `controllers/salesController.js` | ~725 | — | 🟡 moyen |
| `controllers/commissionPaymentController.js` | ~581 | — | 🟢 acceptable |

## clientController.js (~3445 l)
- **Responsabilités** (trop nombreuses) : profil, favoris, panier snapshot, mockPay (legacy),
  `persistSale`, `runPostSaleSideEffects`, `planGiftCardUsage`/`finalizeGiftCardUsage`,
  `buildSaleEntry`, options formation, **finaliseurs d'achat** (`processCheckoutStatePurchase`,
  `processCartCheckoutStatePurchase`, `processServiceCheckoutStatePurchase`),
  `finalizeFreeCheckout`, annulation présentiel + création de RefundRequest, changement de
  session, listes my-formations/products/services, reviews.
- **Fonctions clés** : `persistSale`, `processCheckoutStatePurchase` (+ cart/service),
  `planGiftCardUsage`, `finalizeGiftCardUsage`, `cancelFormationParticipation`,
  `createPresentielRefundRequest`.
- **Dépendances** : Sale/Purchase/Formation/Product/GiftCard/RefundRequest, promotionService,
  giftCardService(s), legalConsentService, offerReadinessService, checkoutPricingService,
  commissionService, invoiceService, mailService, businessEventService.
- **Risques** : surface de régression énorme ; le webhook Stripe **dépend** de ce contrôleur
  (`processCheckoutStatePurchase`) ; mélange contrôleur HTTP + logique métier de finalisation.
- **Zones intouchables (sans tests d'abord)** : finaliseurs d'achat (cœur paiement),
  `persistSale`, gift-card settlement.

## stripeController.js (~1727 l)
- **Responsabilités** : `createCheckoutSession` (validation légale/offre/pricing + PI),
  webhook (`handleWebhook` : succeeded/refund.updated/payment_failed), récupération frais
  Stripe, `getPaymentResult`/`getSessionStatus`, credit notes, `handleRefundUpdatedEvent`.
- **Risques** : webhook critique (idempotence, E11000) ; fonctions de frais + refund mêlées.
- **Zones intouchables** : `handleWebhook`, idempotence, `handleRefundUpdatedEvent`.

## mailService.js (~3845 l)
- **Responsabilités** : templates + envoi de **tous** les emails (vente, remboursement,
  booking, commission, contrat, reset…), rendu HTML, intégration Brevo.
- **Risque** : taille extrême ; mais surface fonctionnelle homogène (emails). Découpage par
  domaine (templates vs transport vs rendu) souhaitable.

## salesController.js (~725 l)
- Admin : liste ventes/remboursements, `updateRefundStatus` (A4), tracking token, gift-card
  password. Taille raisonnable.

## commissionPaymentController.js (~581 l)
- Bien cadré après la correction commissions. Acceptable.

## Synthèse
Le risque maintenabilité est concentré sur **clientController** et **mailService**.
`stripeController` est volumineux mais cohérent. Le plan de découpage **progressif** (sans
casser, tests d'abord) est détaillé au rapport 111.
