// constants/eventCatalog.js
// Frozen catalog of backend domain events (Phase 3/4A — observability/audit only).
// V1: events are PUBLISHED + LOGGED. No automatic triggers, no no-code automation,
// no side effects (no email/notification triggered by an event).
//
// Each entry: { name, domain, version, description, payload: [minimal SAFE keys] }.
// `payload` lists the SAFE keys an emitter is expected to provide. A payload must
// NEVER contain: full email, secret, token, gift-card password, banking data, or a
// full Stripe payload.

export const EVENT_CATALOG = Object.freeze({
  // --- sale ---
  'sale.created': { domain: 'sale', version: 1, description: 'A sale was persisted', payload: ['saleId'] },
  'sale.finalized': { domain: 'sale', version: 1, description: 'A sale was finalized (persisted via the central finalizer)', payload: ['saleId', 'totalAmount', 'itemCount', 'hasStripePayment'] },
  'sale.zero_payment_finalized': { domain: 'sale', version: 1, description: 'A 0€ checkout was finalized without Stripe', payload: ['saleId', 'zeroPayment'] },
  'sale.email_sent': { domain: 'sale', version: 1, description: 'The sale confirmation email was sent', payload: ['saleId', 'sendLogId'] },

  // --- booking (service) ---
  'booking.created': { domain: 'booking', version: 1, description: 'A service booking was created', payload: ['bookingId', 'serviceId', 'status'] },
  'booking.confirmed': { domain: 'booking', version: 1, description: 'A service booking was confirmed', payload: ['bookingId', 'serviceId', 'status'] },
  'booking.reminded': { domain: 'booking', version: 1, description: 'A booking reminder was sent', payload: ['bookingId'] },
  'booking.cancelled': { domain: 'booking', version: 1, description: 'A booking was cancelled', payload: ['bookingId', 'serviceId'] },
  'booking.no_show': { domain: 'booking', version: 1, description: 'A booking was marked no-show', payload: ['bookingId'] },
  'booking.no_show_marked': { domain: 'booking', version: 1, description: 'A booking was explicitly marked no-show by staff', payload: ['bookingId'] },
  'booking.client_suspended': { domain: 'booking', version: 1, description: 'A client was suspended after repeated no-shows', payload: ['userId'] },
  'booking.pending_payment_expired': { domain: 'booking', version: 1, description: 'A pending-payment booking expired (legacy/unused — bookings are created confirmed)', payload: ['bookingId'] },

  // --- refund ---
  'refund.requested': { domain: 'refund', version: 1, description: 'A refund was requested', payload: ['refundId', 'saleId', 'itemType', 'status'] },
  'refund.execution_started': { domain: 'refund', version: 1, description: 'A refund execution started', payload: ['refundId'] },
  'refund.succeeded': { domain: 'refund', version: 1, description: 'A refund succeeded (confirmed)', payload: ['refundId', 'saleId', 'status'] },
  'refund.confirmed': { domain: 'refund', version: 1, description: 'A refund was confirmed (alias of succeeded)', payload: ['refundId'] },
  'refund.failed': { domain: 'refund', version: 1, description: 'A refund failed', payload: ['refundId'] },
  'refund.recovered': { domain: 'refund', version: 1, description: 'A blocked refund was recovered by the recovery job', payload: ['refundId'] },

  // --- gift_card ---
  'gift_card.created': { domain: 'gift_card', version: 1, description: 'A gift card was created', payload: ['giftCardId'] },
  'gift_card.used': { domain: 'gift_card', version: 1, description: 'A gift card was used (debited)', payload: ['giftCardId'] },
  'gift_card.recredited': { domain: 'gift_card', version: 1, description: 'A gift card portion was re-credited (refund)', payload: ['saleId', 'amountEur', 'cardCount'] },

  // --- commission ---
  'commission.available': { domain: 'commission', version: 1, description: 'A commission became payable', payload: ['commissionPaymentId', 'month', 'year'] },
  'commission.reminder_sent': { domain: 'commission', version: 1, description: 'A commission reminder was sent', payload: ['commissionPaymentId', 'daysLeft'] },
  'commission.paid': { domain: 'commission', version: 1, description: 'A commission was paid', payload: ['commissionPaymentId'] },

  // --- formation (sessions) ---
  'formation.session_cancelled': { domain: 'formation', version: 1, description: 'A formation session was cancelled', payload: ['sessionId', 'formationId'] },
  'formation.session_updated': { domain: 'formation', version: 1, description: 'A formation session was updated/rescheduled', payload: ['sessionId', 'formationId'] },

  // --- email (driven by SendLog) ---
  'email.queued': { domain: 'email', version: 1, description: 'An email was queued', payload: ['sendLogId', 'provider', 'templateKey', 'status'] },
  'email.sent': { domain: 'email', version: 1, description: 'An email was accepted by the provider', payload: ['sendLogId', 'provider', 'templateKey', 'status'] },
  'email.failed': { domain: 'email', version: 1, description: 'An email failed to send', payload: ['sendLogId', 'provider', 'templateKey', 'status', 'errorCode'] },
  'email.delivered': { domain: 'email', version: 1, description: 'An email was delivered (provider webhook)', payload: ['sendLogId', 'provider', 'templateKey', 'status'] },
  'email.opened': { domain: 'email', version: 1, description: 'An email was opened (provider webhook)', payload: ['sendLogId', 'provider', 'templateKey', 'status'] },
  'email.bounced': { domain: 'email', version: 1, description: 'An email bounced (provider webhook)', payload: ['sendLogId', 'provider', 'templateKey', 'status'] },

  // --- job (schedulers) ---
  'job.started': { domain: 'job', version: 1, description: 'A scheduled job started', payload: ['jobName'] },
  'job.succeeded': { domain: 'job', version: 1, description: 'A scheduled job succeeded', payload: ['jobName'] },
  'job.failed': { domain: 'job', version: 1, description: 'A scheduled job failed', payload: ['jobName', 'errorCode'] }
});

export function getEventDefinition(name) {
  return EVENT_CATALOG[name] || null;
}

export function isKnownEvent(name) {
  return Object.prototype.hasOwnProperty.call(EVENT_CATALOG, name);
}

export default EVENT_CATALOG;
