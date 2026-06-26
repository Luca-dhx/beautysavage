# 59 — Audit des points d'émission métier (Phase 4A)

> Repo `backend/`, branche `phase-0-security-baseline`, base `106cab7`. Aucune
> valeur de secret/email affichée. Audit **uniquement** (le branchement réel est en
> rapport 60). Émission **audit-only** : aucun effet de bord, aucun subscriber
> métier, aucun email/notification déclenché par event.

## Table des points d'émission

| Domaine | Événement cible | Fichier | Fonction | Payload safe | Risque | Branché maintenant ? |
|---|---|---|---|---|---|---|
| sale | `sale.finalized` | `controllers/clientController.js` | `persistSale` (après `sale.save()`) | saleId, totalAmount, itemCount, hasStripePayment | Faible | ✅ Oui |
| sale | `sale.finalized` (service) | `clientController.js` | `processServiceCheckoutStatePurchase` | idem | Faible | ✅ Oui |
| sale | `sale.zero_payment_finalized` | `clientController.js` | `finalizeFreeCheckout` (après succès) | saleId, zeroPayment | Faible | ✅ Oui |
| booking | `booking.created` | `clientController.js` | `processServiceCheckoutStatePurchase` | bookingId, serviceId, status | Faible | ✅ Oui |
| booking | `booking.confirmed` | `clientController.js` | idem (booking créé confirmé) | idem | Faible | ✅ Oui |
| booking | `booking.cancelled` | `controllers/serviceBookingController.js` | `cancelMyBooking` (client) + cancel admin | bookingId, serviceId, cancelledBy | Faible | ✅ Oui (2 chemins) |
| refund | `refund.requested` | `services/refundRequestService.js` | `createRefundRequestOnce` (created) | refundId, saleId, itemType, status | Faible | ✅ Oui |
| refund | `refund.succeeded` | `services/refundExecutionService.js` | `sendRefundConfirmedEmailInternal` | refundId, saleId, status | Moyen | ✅ Oui (chemin carte cadeau ; Stripe via webhook = différé) |
| gift_card | `gift_card.recredited` | `services/refundGiftCardService.js` | `recreditGiftCardPortion` (fin) | saleId, amountEur, cardCount | Faible | ✅ Oui |
| commission | `commission.available` | `automatisme/commissionReminderJob.js` | `executeJob` | commissionPaymentId, month, year | Faible | ✅ Oui |
| commission | `commission.reminder_sent` | `automatisme/commissionReminderJob.js` | `executeJob` | commissionPaymentId, daysLeft | Faible | ✅ Oui |
| sale | `sale.created` | — | (alias) | — | — | ➖ Non (couvert par `sale.finalized`) |
| booking | `booking.reminded` | `automatisme/bookingRemindersJob.js` | — | bookingId | Faible | ⏳ Différé |
| booking | `booking.no_show(_marked)` | `serviceBookingController.js` | flux no-show | bookingId | Moyen | ⏳ Différé |
| booking | `booking.client_suspended` | flux suspension | — | userId | Moyen | ⏳ Différé |
| booking | `booking.pending_payment_expired` | — | — | — | — | ➖ N/A (bookings créés `confirmed`, pas d'état pending_payment) |
| refund | `refund.execution_started` | `refundExecutionService.js` | `triggerRefundExecution` | refundId | Moyen | ⏳ Différé |
| refund | `refund.failed` | `refundExecutionService.js` | — | refundId | **Élevé** | ⏳ Différé (pas d'état terminal `failed` : rollback vers `requested`) |
| refund | `refund.recovered` | `automatisme/refundRecoveryJob.js` | — | refundId | Moyen | ⏳ Différé |
| gift_card | `gift_card.created` | `services/giftCardService.js` | — | giftCardId | Faible | ⏳ Différé |
| gift_card | `gift_card.used` | `services/giftCardReservationService.js` | débit (settlement) | giftCardId | Moyen | ⏳ Différé (débit profond dans le settlement webhook) |
| commission | `commission.paid` | `controllers/commissionPaymentController.js` | paiement | commissionPaymentId | Moyen | ⏳ Différé |
| formation | `formation.session_cancelled/updated` | `services/sessionCancellationFlowService.js` | — | sessionId, formationId | Moyen | ⏳ Différé |

## Règles d'émission (appliquées)
- Placement **après** la mutation métier réussie (post-save), **best-effort**.
- `businessEventService` ne **throw jamais** vers le métier (try/catch interne +
  `emitEvent` défensif).
- Payload **minimal et sûr** : jamais email/secret/token/mot de passe carte
  cadeau/données bancaires/payload Stripe complet.
- **Aucun subscriber métier** enregistré → aucun effet de bord (broadcast d'audit).

## Justification des différés
- `refund.failed` : la logique actuelle **ne persiste pas** d'état `failed` (échec
  → rollback vers `requested` pour retry). Brancher proprement nécessite un point
  d'échec terminal — différé pour ne pas modifier la logique de remboursement.
- `gift_card.used`, `commission.paid`, `formation.*`, no-show/suspension : points
  d'insertion plus profonds / multiples ; branchés en Phase 4B après validation du
  socle, sans toucher aux montants ni aux flux.
