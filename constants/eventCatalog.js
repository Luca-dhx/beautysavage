// constants/eventCatalog.js
// Frozen catalog of backend domain events (Phase 3 — observability/audit only).
// V1: events are PUBLISHED + LOGGED. No automatic triggers, no no-code automation.
//
// Each entry: { name, domain, version, description, payload: [minimal expected keys] }.
// `payload` lists the SAFE keys an emitter is expected to provide (never email/secret).

export const EVENT_CATALOG = Object.freeze({
  // --- sale ---
  'sale.created': { domain: 'sale', version: 1, description: 'A sale was persisted', payload: ['saleId'] },
  'sale.email_sent': { domain: 'sale', version: 1, description: 'The sale confirmation email was sent', payload: ['saleId', 'sendLogId'] },

  // --- booking (service) ---
  'booking.confirmed': { domain: 'booking', version: 1, description: 'A service booking was confirmed', payload: ['bookingId'] },
  'booking.reminded': { domain: 'booking', version: 1, description: 'A booking reminder was sent', payload: ['bookingId'] },
  'booking.cancelled': { domain: 'booking', version: 1, description: 'A booking was cancelled', payload: ['bookingId'] },
  'booking.no_show': { domain: 'booking', version: 1, description: 'A booking was marked no-show', payload: ['bookingId'] },

  // --- refund ---
  'refund.requested': { domain: 'refund', version: 1, description: 'A refund was requested', payload: ['refundId'] },
  'refund.confirmed': { domain: 'refund', version: 1, description: 'A refund was confirmed', payload: ['refundId'] },
  'refund.failed': { domain: 'refund', version: 1, description: 'A refund failed', payload: ['refundId'] },

  // --- gift_card ---
  'gift_card.created': { domain: 'gift_card', version: 1, description: 'A gift card was created', payload: ['giftCardId'] },
  'gift_card.used': { domain: 'gift_card', version: 1, description: 'A gift card was used', payload: ['giftCardId'] },
  'gift_card.recredited': { domain: 'gift_card', version: 1, description: 'A gift card was re-credited', payload: ['giftCardId'] },

  // --- commission ---
  'commission.available': { domain: 'commission', version: 1, description: 'A commission became payable', payload: ['commissionPaymentId'] },
  'commission.reminder_sent': { domain: 'commission', version: 1, description: 'A commission reminder was sent', payload: ['commissionPaymentId'] },

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
