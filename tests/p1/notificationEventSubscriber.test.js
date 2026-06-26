// tests/p1/notificationEventSubscriber.test.js
// Phase 4D EventBus -> Notification subscriber: flag/registration behaviour,
// notification creation, payload-incomplete safety, no email side effect.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { startMemoryDb, stopMemoryDb, clearDatabase } from '../setup/testDb.js';
import Notification from '../../models/Notification.js';
import NotificationConfig from '../../models/NotificationConfig.js';
import SendLog from '../../models/SendLog.js';
import NotificationEventDelivery from '../../models/NotificationEventDelivery.js';
import { clearSubscribers } from '../../services/eventBusService.js';
import { emitSaleEvent, emitBookingEvent } from '../../services/businessEventService.js';
import { registerNotificationSubscribers } from '../../subscribers/notificationEventSubscriber.js';

async function seedConfig() {
  await NotificationConfig.create({
    events: [
      { eventType: 'new_sale', label: 'Vente', isActive: true, category: 'ventes', targetType: 'all', titleTemplate: 'Vente {{saleId}}', messageTemplate: 'Montant {{amount}}' },
      { eventType: 'no_show_recorded', label: 'No-show', isActive: true, category: 'prestations', targetType: 'all', titleTemplate: 'No-show', messageTemplate: 'Booking {{bookingId}}' }
    ]
  });
}

describe('notification event subscriber', () => {
  beforeAll(async () => {
    const uri = await startMemoryDb();
    await mongoose.connect(uri, { dbName: 'beautysavage-database' });
    await NotificationEventDelivery.syncIndexes();
  });
  afterAll(async () => { await stopMemoryDb(); });
  beforeEach(async () => { await clearDatabase(); clearSubscribers(); await seedConfig(); });
  afterEach(() => { vi.restoreAllMocks(); clearSubscribers(); });

  it('NOT registered (flag off) → emitting sale.finalized creates NO notification', async () => {
    await emitSaleEvent('sale.finalized', { saleId: 'S-1', totalAmount: 120 });
    expect(await Notification.countDocuments({})).toBe(0);
  });

  it('registered → sale.finalized creates a new_sale notification', async () => {
    registerNotificationSubscribers();
    await emitSaleEvent('sale.finalized', { saleId: 'S-1', totalAmount: 120, itemCount: 1 });
    const notif = await Notification.findOne({ eventType: 'new_sale' }).lean();
    expect(notif).toBeTruthy();
    expect(notif.title).toContain('S-1');
    expect(notif.variables.amount).toBe('120.00');
  });

  it('registered → booking.no_show_marked creates a no_show_recorded notification', async () => {
    registerNotificationSubscribers();
    const bookingId = new mongoose.Types.ObjectId();
    await emitBookingEvent('booking.no_show_marked', { _id: bookingId, serviceId: new mongoose.Types.ObjectId(), status: 'no_show' });
    const notif = await Notification.findOne({ eventType: 'no_show_recorded' }).lean();
    expect(notif).toBeTruthy();
    expect(notif.variables.bookingId).toBe(String(bookingId));
  });

  it('incomplete payload → no notification, no throw', async () => {
    registerNotificationSubscribers();
    await expect(emitSaleEvent('sale.finalized', {})).resolves.toBeTruthy(); // no saleId/contextId
    expect(await Notification.countDocuments({})).toBe(0);
    expect(await NotificationEventDelivery.countDocuments({})).toBe(0);
  });

  it('subscriber creates NO SendLog / email', async () => {
    registerNotificationSubscribers();
    await emitSaleEvent('sale.finalized', { saleId: 'S-2', totalAmount: 50 });
    expect(await SendLog.countDocuments({})).toBe(0);
  });
});
