// tests/p0/booking.doubleSlot.characterization.test.js
// CHARACTERIZATION (P0): there is no server-side guard preventing two bookings on
// the same practitioner + time slot. `POST /api/client/bookings` (createBooking)
// inserts a ServiceBooking with no overlap/uniqueness check (see report 05).
//
// We assert the DESIRED safe behaviour (only ONE booking should exist for the
// slot) and wrap it with `it.fails`, so the suite is GREEN while clearly
// documenting that the safety property does NOT hold yet. When the overlap guard
// is added (Phase 1), this test will start PASSING and `it.fails` will flip to RED
// — a signal to update the test to a normal assertion.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../../services/notificationService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, triggerNotification: async () => {} };
});

const { getAgent } = await import('../setup/testApp.js');
const { stopMemoryDb, clearDatabase } = await import('../setup/testDb.js');
const { seedTestData, TEST_PASSWORD } = await import('../setup/seedTestData.js');
const ServiceBooking = (await import('../../models/ServiceBooking.js')).default;

describe('P0 characterization — double booking of the same slot', () => {
  let agent;
  let fixtures;

  beforeAll(async () => {
    agent = await getAgent();
  });

  afterAll(async () => {
    await stopMemoryDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    fixtures = await seedTestData();
  });

  async function loginAs(email) {
    const res = await agent.post('/auth/login').send({ email, password: TEST_PASSWORD });
    expect(res.status).toBe(200);
    return res.headers['set-cookie'];
  }

  it.fails(
    'should NOT allow two bookings on the same practitioner+slot (overlap guard missing today)',
    async () => {
      const { service, practitioner, bookingSlotISO } = fixtures;
      const body = {
        serviceId: String(service._id),
        practitionerId: String(practitioner._id),
        startAt: bookingSlotISO
      };

      // Two different clients try to grab the exact same slot.
      const cookie1 = await loginAs('client1@test.local');
      const cookie2 = await loginAs('client2@test.local');
      const r1 = await agent.post('/api/client/bookings').set('Cookie', cookie1).send(body);
      const r2 = await agent.post('/api/client/bookings').set('Cookie', cookie2).send(body);

      // Sanity: both requests were accepted by the (unguarded) handler today.
      expect(r1.status).toBe(201);
      expect(r2.status).toBe(201);

      const count = await ServiceBooking.countDocuments({
        practitionerId: practitioner._id,
        startAt: new Date(bookingSlotISO)
      });

      // DESIRED: only one booking should exist for the slot.
      // CURRENT: two are created -> this assertion fails -> it.fails => suite green.
      expect(count).toBe(1);
    }
  );
});
