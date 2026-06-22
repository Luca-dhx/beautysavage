// tests/p0/mockPay.exposure.test.js
// CHARACTERIZATION (P0): the `POST /api/client/mock-pay` endpoint is still wired
// and reachable by any authenticated client, with NO NODE_ENV/production guard.
// In production this handler creates a real Sale + Purchase + commission and can
// debit real gift cards WITHOUT any payment (see Rapports/version 1 report 06).
//
// This test documents the CURRENT (dangerous) reality: the route exists and an
// authenticated client is not blocked by any environment guard. When the route is
// later neutralized (Phase 0/1) — e.g. returns 404/403 in production or is removed
// — update or invert this test accordingly.
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

// Mock mail/notification layers so any side-effect paths don't hit the network.
vi.mock('../../services/notificationService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, triggerNotification: async () => {} };
});

const { getAgent } = await import('../setup/testApp.js');
const { stopMemoryDb, clearDatabase } = await import('../setup/testDb.js');
const { seedTestData, TEST_PASSWORD } = await import('../setup/seedTestData.js');

describe('P0 characterization — mock-pay endpoint exposure', () => {
  let agent;
  let cookie;

  beforeAll(async () => {
    agent = await getAgent();
  });

  afterAll(async () => {
    await stopMemoryDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    await seedTestData();
    const login = await agent
      .post('/auth/login')
      .send({ email: 'client1@test.local', password: TEST_PASSWORD });
    cookie = login.headers['set-cookie'];
    expect(cookie).toBeDefined();
  });

  it('the mock-pay route is still registered and reachable (not a 404 route, not auth-blocked)', async () => {
    const res = await agent.post('/api/client/mock-pay').set('Cookie', cookie).send({});

    // Express returns an HTML "Cannot POST ..." body for unregistered routes.
    // A real handler response (JSON) proves the endpoint is still live.
    expect(res.text || '').not.toMatch(/Cannot POST/i);
    // The authenticated client passed the auth gate — no env guard rejected it.
    expect(res.status).not.toBe(401);

    // NOTE: with an empty body the handler will fail validation (e.g. 400/404 JSON),
    // which is expected. The point is only that the dangerous route is exposed.
  });

  it('mock-pay does NOT require any production/test guard to be reached', async () => {
    // Sending a minimal product-ish body still reaches the handler (no 404 route).
    const res = await agent
      .post('/api/client/mock-pay')
      .set('Cookie', cookie)
      .send({ type: 'product', id: '000000000000000000000000' });

    expect(res.text || '').not.toMatch(/Cannot POST/i);
    expect(res.status).not.toBe(401);
  });
});
