// tests/p1/mailEventActivationBooking.test.js
// M3C — booking.confirmed N'EST PAS migré (misalignement event/email — voir rapport 179).
// La règle reste shadow ; le builder de parité est fourni pour le futur.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../services/integratedApiCredentialService.js', () => ({
  getCredential: vi.fn(async () => 'xkeysib-FAKE-M3C-KEY')
}));

const mongoose = (await import('mongoose')).default;
const { startMemoryDb, stopMemoryDb, clearDatabase } = await import('../setup/testDb.js');
const CommunicationIdentity = (await import('../../models/CommunicationIdentity.js')).default;
const MailEventDelivery = (await import('../../models/MailEventDelivery.js')).default;
const User = (await import('../../models/user.js')).default;
const Service = (await import('../../models/Service.js')).default;
const ServiceBooking = (await import('../../models/ServiceBooking.js')).default;
const { dispatchMailForEvent } = await import('../../services/mail/mailEventDispatchService.js');
const { getMailDispatchRule } = await import('../../constants/mailDispatchRules.js');
const { buildBookingConfirmedVariables } = await import('../../services/mail/mailEventVariableBuilder.js');

describe('M3C — booking.confirmed reste shadow (non migré)', () => {
  beforeAll(async () => {
    const uri = await startMemoryDb();
    await mongoose.connect(uri, { dbName: 'beautysavage-database' });
    await Promise.all([CommunicationIdentity.syncIndexes(), MailEventDelivery.syncIndexes()]);
  });
  afterAll(async () => { await stopMemoryDb(); });
  beforeEach(async () => { await clearDatabase(); await Promise.all([CommunicationIdentity.syncIndexes(), MailEventDelivery.syncIndexes()]); });
  afterEach(() => vi.restoreAllMocks());

  it('la règle booking.confirmed est en shadow (directSenderExists:true)', () => {
    const rule = getMailDispatchRule('booking.confirmed');
    expect(rule.directSenderExists).toBe(true);
    expect(rule.mode).toBe('shadow');
  });

  it('dispatchMailForEvent(booking.confirmed) → skipped_duplicate_direct_sender (aucun envoi)', async () => {
    await CommunicationIdentity.create({ role: 'commerciale', scope: 'institute', email: 'com@beauty.fr', displayName: 'C', status: 'verified', active: true });
    const res = await dispatchMailForEvent({ eventName: 'booking.confirmed', contextType: 'service_booking', contextId: 'BK-1' });
    expect(res.status).toBe('skipped_duplicate_direct_sender');
    const ledger = await MailEventDelivery.findOne({ eventName: 'booking.confirmed' }).lean();
    expect(ledger.status).toBe('skipped_duplicate_direct_sender');
  });

  it('buildBookingConfirmedVariables : parité (client + servicename + dates), pas d’e-mail dans variables', async () => {
    const user = new User({ email: 'bk-client@test.local', firstName: 'Lia', lastName: 'Noir', role: 'client' });
    await user.save({ validateBeforeSave: false });
    const service = new Service({ name: 'Épilation' });
    await service.save({ validateBeforeSave: false });
    const booking = new ServiceBooking({ clientId: user._id, serviceId: service._id, bookingId: 'BK-2', startAt: new Date('2026-07-02T14:00:00Z'), endAt: new Date('2026-07-02T15:00:00Z'), totalPrice: 30, status: 'confirmed' });
    await booking.save({ validateBeforeSave: false });

    const built = await buildBookingConfirmedVariables({ contextType: 'service_booking', contextId: String(booking._id), payloadSafe: { context: { related: {} } } });
    expect(built.client.email).toBe('bk-client@test.local');
    expect(built.templateKey).toBe('booking_confirmed');
    expect(built.variables.servicename).toBe('Épilation');
    expect(built.variables.bookingid).toBe('BK-2');
    // les variables (template) ne contiennent pas l'e-mail
    expect(JSON.stringify(built.variables)).not.toContain('bk-client@test.local');
  });
});
