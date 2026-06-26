# 61 — Audit Phase 4B : events différés + contextId emails

> Repo `backend/`, branche `phase-0-security-baseline`, base `8c9b88e`. Audit
> uniquement. Aucun secret/email affiché. Émission **audit-only** (aucun effet de
> bord, aucun subscriber, aucun email/notif déclenché par event).

## Classement des events différés

| Event | Source | Risque | À brancher maintenant ? | Raison |
|---|---|---|---|---|
| `booking.reminded` | `automatisme/bookingRemindersJob.js` (après `remindersSent` push) | Faible | ✅ Oui | Booking en scope, point unique propre |
| `booking.no_show_marked` | `serviceBookingController.markNoShow` (après `booking.save()`) | Faible | ✅ Oui | Point unique propre |
| `booking.client_suspended` | `serviceBookingController.markNoShow` (après suspension) | Faible | ✅ Oui | clientId disponible |
| `commission.paid` | `commissionPaymentController` (×2, après `payment.save()` succeeded) | Faible | ✅ Oui | payment en scope |
| `gift_card.created` | `services/giftCardService.createCompensationGiftCard` (après `giftCard.save()`) | Faible | ✅ Oui | giftCard en scope ; **jamais** le mot de passe dans le payload |
| `refund.succeeded` (Stripe webhook) | `stripeController.handleRefundUpdatedEvent` → `sendRefundConfirmedEmailInternal` | Faible | ✅ **Déjà couvert** | Le webhook appelle `sendRefundConfirmedEmailInternal` qui émet déjà `refund.succeeded` (Phase 4A). Aucun nouveau câblage. |
| `gift_card.used` | débit (settlement) | Moyen | ⏳ Différé | `debitGiftCardBalanceAtomic` est **partagé** avec le rollback de recrédit → sémantique « used » ambiguë. Point propre = settlement (profond). |
| `refund.recovered` | `automatisme/refundRecoveryJob.js` | Moyen | ⏳ Différé | La recovery **relance** `triggerRefundExecution` → émet déjà `refund.succeeded`. Un `refund.recovered` distinct nécessiterait les internes du service de recovery. |
| `refund.failed` | `refundExecutionService` | Élevé | ⏳ Différé | **Pas d'état terminal `failed`** : un échec rollback vers `requested` (retry). Ne pas inventer un état. |
| `formation.session_cancelled/updated` | `services/sessionCancellationFlowService.js` | Moyen | ⏳ Différé | Flux créés **par achat affecté** (un flow par client), pas un point session-level unique. Le point propre serait le contrôleur de session (non audité ici). |

## contextId emails — état

| Domaine email | contextType | contextId | Statut |
|---|---|---|---|
| refund (`refund_*`) | `refund_request` (auto-dérivé) | `refundId` | ✅ **Attaché** (`sendRefundConfirmedEmail` reçoit déjà `refundId`) |
| commission (`commission_*`) | `commission_payment` (auto-dérivé) | `payment._id` | ✅ **Attaché** (job passe le contexte) |
| gift_card (`gift_card_*`) | `gift_card` (auto-dérivé) | giftCardId | ⏳ Différé (dispatcher prêt ; threading caller non fait) |
| session/formation (`session_*`) | `formation_session` (auto-dérivé) | sessionId | ⏳ Différé (dispatchers partagés, multi-senders) |
| system (`site_*`/`maintenance`) | `system` (auto-dérivé) | null | ✅ Acceptable (pas d'objet métier) |

> **Rappel** : le `contextType` est **déjà auto-dérivé** (Phase 3) pour **tous**
> les emails. Phase 4B ajoute le `contextId` pour refund + commission. Les 3
> dispatchers (`sendStatusMail`, `sendSingleTemplateMail`, `sendPremiumHtmlEmail`)
> acceptent désormais un paramètre `context` optionnel → `postToBrevo(payload,
> context)`, ce qui rend l'extension gift_card/session triviale en Phase 4C.

## Règles appliquées
Émission **post-mutation**, **best-effort** (ne throw jamais), payload **safe**
(jamais email/secret/token/mot de passe carte cadeau/données bancaires/payload
Stripe). Aucun état métier inventé. Différés documentés.
