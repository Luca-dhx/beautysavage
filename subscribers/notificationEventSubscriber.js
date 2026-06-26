// subscribers/notificationEventSubscriber.js
// Phase 4D — FIRST EventBus -> Notification subscriber. Flag-gated, idempotent,
// best-effort, in-app notifications ONLY (never sends an email).
//
// Coverage:
//   sale.finalized          -> notification "new_sale"
//   booking.no_show_marked  -> notification "no_show_recorded"
//
// (Note: the mission text mentioned "new_client" for sale.finalized, but new_client
//  is the SIGNUP notification with no corresponding event; the notification fired on
//  sale finalization today is "new_sale" — used here for parity. See report 66.)
//
// GUARANTEES:
//   - never throws to the emitter (the event bus also isolates subscriber errors);
//   - idempotent via NotificationEventDelivery (re-emit -> single notification);
//   - reuses the existing triggerNotification service (no rewrite);
//   - no email, no other side effect.

import { subscribe } from '../services/eventBusService.js';
import { triggerNotification } from '../services/notificationService.js';
import NotificationEventDelivery from '../models/NotificationEventDelivery.js';

// Idempotent claim. Returns true if THIS call should create the notification.
async function claimDelivery(key, eventLogId) {
  const existing = await NotificationEventDelivery.findOne(key).lean();
  if (existing) return false;
  try {
    await NotificationEventDelivery.create({ ...key, eventLogId: eventLogId || null, status: 'created' });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false; // concurrent claim won the unique index
    throw err;
  }
}

export async function handleSaleFinalizedNotification(eventLog) {
  try {
    if (!eventLog || eventLog.eventName !== 'sale.finalized') return;
    const contextId = eventLog.contextId || eventLog.payloadSafe?.saleId || null;
    if (!contextId) return; // incomplete payload -> no notification, no throw

    const claimed = await claimDelivery(
      { eventName: 'sale.finalized', contextType: 'sale', contextId: String(contextId), notificationType: 'new_sale' },
      eventLog._id
    );
    if (!claimed) return; // idempotent: already delivered

    const amount = eventLog.payloadSafe?.totalAmount;
    await triggerNotification('new_sale', {
      saleId: String(contextId),
      amount: typeof amount === 'number' ? amount.toFixed(2) : '—',
      link: '/gestion.html?page=ventes',
      linkLabel: 'Voir les ventes'
    });
  } catch (err) {
    console.error('[notifSubscriber] sale.finalized handler error:', err?.message || err);
  }
}

export async function handleBookingNoShowNotification(eventLog) {
  try {
    if (!eventLog || eventLog.eventName !== 'booking.no_show_marked') return;
    const contextId = eventLog.contextId || eventLog.payloadSafe?.bookingId || null;
    if (!contextId) return;

    const claimed = await claimDelivery(
      { eventName: 'booking.no_show_marked', contextType: 'service_booking', contextId: String(contextId), notificationType: 'no_show_recorded' },
      eventLog._id
    );
    if (!claimed) return;

    await triggerNotification('no_show_recorded', {
      bookingId: String(contextId),
      link: '/gestion.html?page=planning',
      linkLabel: 'Voir le planning'
    });
  } catch (err) {
    console.error('[notifSubscriber] no_show handler error:', err?.message || err);
  }
}

// Register subscribers. The event bus stores handlers in a Set keyed by the same
// function reference, so calling this more than once does NOT double-register.
export function registerNotificationSubscribers() {
  subscribe('sale.finalized', handleSaleFinalizedNotification);
  subscribe('booking.no_show_marked', handleBookingNoShowNotification);
}

export default registerNotificationSubscribers;
