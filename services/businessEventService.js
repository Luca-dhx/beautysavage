// services/businessEventService.js
// Centralises SAFE payload construction for business-domain events (Phase 4A).
//
// AUDIT ONLY: these helpers publish events to the EventBus (persisted in EventLog).
// They have NO business side effect, trigger NO email/notification, and NEVER throw
// back to the business flow — event logging is best-effort.
//
// A payload NEVER contains: full email, secret, token, gift-card password, banking
// data, or a full Stripe payload. Only minimal, non-sensitive identifiers/amounts.

import { emitEvent } from './eventBusService.js';

function idStr(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v._id != null ? String(v._id) : null;
  return String(v);
}
function numberOrNull(v) {
  return Number.isFinite(Number(v)) ? Number(v) : null;
}

// Internal: emit without ever throwing to the caller.
async function safeEmit(eventName, payload, { contextType = null, contextId = null, actorType = 'system', actorId = null } = {}) {
  try {
    return await emitEvent(eventName, payload, {
      source: 'businessEventService',
      actorType,
      actorId,
      contextType,
      contextId
    });
  } catch (err) {
    console.warn(`[businessEvent] emit failed for ${eventName}:`, err?.message || err);
    return null;
  }
}

export async function emitSaleEvent(eventName, sale, { extra = {}, ...ctx } = {}) {
  return safeEmit(eventName, {
    saleId: sale?.saleId || null,
    totalAmount: numberOrNull(sale?.totalAmount),
    itemCount: sale?.itemCount ?? (Array.isArray(sale?.items) ? sale.items.length : null),
    hasStripePayment: Boolean(sale?.stripePaymentIntentId),
    giftCardCount: Array.isArray(sale?.giftCardUsage) ? sale.giftCardUsage.length : 0,
    ...extra
  }, { contextType: 'sale', contextId: sale?.saleId || idStr(sale?._id), ...ctx });
}

export async function emitBookingEvent(eventName, booking, { extra = {}, ...ctx } = {}) {
  return safeEmit(eventName, {
    bookingId: idStr(booking?._id),
    serviceId: idStr(booking?.serviceId),
    status: booking?.status || null,
    startAt: booking?.startAt ? new Date(booking.startAt).toISOString() : null,
    ...extra
  }, { contextType: 'service_booking', contextId: idStr(booking?._id), ...ctx });
}

export async function emitRefundEvent(eventName, refundRequest, { extra = {}, ...ctx } = {}) {
  return safeEmit(eventName, {
    refundId: idStr(refundRequest?._id),
    saleId: refundRequest?.saleId ? String(refundRequest.saleId) : null,
    itemType: refundRequest?.itemType || null,
    status: refundRequest?.status || null,
    amount: numberOrNull(refundRequest?.amount),
    ...extra
  }, { contextType: 'refund_request', contextId: idStr(refundRequest?._id), ...ctx });
}

export async function emitGiftCardEvent(eventName, giftCard, { extra = {}, ...ctx } = {}) {
  return safeEmit(eventName, {
    giftCardId: idStr(giftCard?._id) || (giftCard?.giftCardId ? String(giftCard.giftCardId) : null),
    ...extra
  }, { contextType: 'gift_card', contextId: idStr(giftCard?._id), ...ctx });
}

export async function emitCommissionEvent(eventName, commissionPayment, { extra = {}, ...ctx } = {}) {
  return safeEmit(eventName, {
    commissionPaymentId: idStr(commissionPayment?._id),
    month: commissionPayment?.month ?? null,
    year: commissionPayment?.year ?? null,
    status: commissionPayment?.status || null,
    ...extra
  }, { contextType: 'commission_payment', contextId: idStr(commissionPayment?._id), ...ctx });
}

export async function emitFormationSessionEvent(eventName, session, { extra = {}, ...ctx } = {}) {
  return safeEmit(eventName, {
    sessionId: idStr(session?._id),
    formationId: idStr(session?.formationId),
    ...extra
  }, { contextType: 'formation_session', contextId: idStr(session?._id), ...ctx });
}
