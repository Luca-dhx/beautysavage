// tests/p0/stripe.webhook.idempotence.characterization.test.js
// CHARACTERIZATION (P0): the Stripe webhook (`payment_intent.succeeded`) is the
// single source of truth for sale creation, but its idempotency is not atomic
// (no unique DB constraint on stripePaymentIntentId — see report 06). A duplicate
// delivery could create two sales on the happy path.
//
// What this file DOES (fully working):
//   - provides a real Stripe signature utility (tests/setup/stripeWebhookTestUtils.js)
//   - verifies the webhook REJECTS an invalid signature (400)
//   - verifies that, with a VALID signature but no matching StripeCheckoutIntent,
//     no Sale is created (and a replay stays at the same count)
//
// What this file does NOT do yet (documented gap, see it.todo):
//   - drive the full happy path that actually creates a Sale, which requires
//     seeding a StripeCheckoutIntent + catalog refs matching the PaymentIntent.
//     Only then can the "two identical webhooks -> two sales" bug be asserted.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const { getAgent } = await import('../setup/testApp.js');
const { stopMemoryDb, clearDatabase } = await import('../setup/testDb.js');
const Sale = (await import('../../models/Sale.js')).default;
const {
  buildPaymentIntentSucceededEvent,
  postSignedWebhook
} = await import('../setup/stripeWebhookTestUtils.js');

describe('P0 characterization — Stripe webhook signature + idempotence', () => {
  let agent;

  beforeAll(async () => {
    agent = await getAgent();
  });

  afterAll(async () => {
    await stopMemoryDb();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  it('rejects a webhook with an invalid signature (400)', async () => {
    const event = buildPaymentIntentSucceededEvent({ id: 'evt_badsig', paymentIntentId: 'pi_badsig' });
    const res = await agent
      .post('/api/stripe/webhook')
      .set('stripe-signature', 't=123,v1=deadbeef') // wrong signature
      .set('content-type', 'application/json')
      .send(JSON.stringify(event));

    expect(res.status).toBe(400);
  });

  it('accepts a validly-signed event and (with no matching intent) creates no Sale; replay is stable', async () => {
    const event = buildPaymentIntentSucceededEvent({
      id: 'evt_replay_1',
      paymentIntentId: 'pi_replay_1',
      amount: 5000
    });

    const first = await postSignedWebhook(agent, event);
    // The signature is valid, so it is NOT a 400 (signature rejection).
    expect(first.status).not.toBe(400);

    const second = await postSignedWebhook(agent, event); // identical replay
    expect(second.status).not.toBe(400);

    // Without a seeded StripeCheckoutIntent for pi_replay_1, no sale is created.
    const count = await Sale.countDocuments({ stripePaymentIntentId: 'pi_replay_1' });
    expect(count).toBe(0);
  });

  // The TRUE idempotence assertion (two identical succeeded events must create at
  // most ONE Sale on the happy path) needs a seeded StripeCheckoutIntent + catalog
  // matching the PaymentIntent. Building that fixture is the next step and is
  // intentionally left as a documented TODO so this characterization stays honest.
  it.todo(
    'happy-path idempotence: two identical payment_intent.succeeded events must create at most ONE Sale ' +
      '(requires seeding StripeCheckoutIntent + catalog; see report 06)'
  );
});
