// tests/p0/giftcard.zeroPayment.characterization.test.js
// CHARACTERIZATION (P0): a purchase fully covered by a gift card (remainingToPay = 0)
// is at risk of never being finalized server-side. Per report 03/06, the frontend
// (purchaseFlowService.finalizePurchase) takes the Stripe branch whenever
// paymentProvider === 'stripe' and SKIPS the backend call; but Stripe cannot create
// a PaymentIntent for 0€ (min 0.50€), so no webhook fires and no sale/debit happens.
//
// This bug lives in the FRONTEND control flow + the absence of a dedicated backend
// "0€ finalize" endpoint. It is therefore NOT reproducible through a single backend
// HTTP request. Below we:
//   1. assert the precondition that makes the bug possible (a gift card can fully
//      cover an item) — GREEN;
//   2. document, via it.todo, the full end-to-end characterization that is out of
//      scope for a pure backend harness.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

const { getTestApp } = await import('../setup/testApp.js');
const { stopMemoryDb, clearDatabase } = await import('../setup/testDb.js');
const { seedTestData } = await import('../setup/seedTestData.js');
const GiftCard = (await import('../../models/GiftCard.js')).default;
const Product = (await import('../../models/Product.js')).default;

describe('P0 characterization — 0€ purchase fully covered by a gift card', () => {
  let fixtures;

  beforeAll(async () => {
    await getTestApp();
  });

  afterAll(async () => {
    await stopMemoryDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    fixtures = await seedTestData();
  });

  it('precondition: a seeded gift card balance can fully cover an item (=> remainingToPay would be 0)', async () => {
    const giftCard = await GiftCard.findById(fixtures.giftCard._id).lean();
    const product = await Product.findById(fixtures.product._id).lean();

    expect(giftCard.balance).toBeGreaterThanOrEqual(product.price);
    // remainingToPay = max(0, price - giftCardBalance) === 0 in this scenario.
    const remainingToPay = Math.max(0, product.price - giftCard.balance);
    expect(remainingToPay).toBe(0);
  });

  // Full E2E characterization requires either:
  //  - driving the FRONTEND purchaseFlowService (browser/Playwright), to show the
  //    Stripe branch skips the backend at 0€; or
  //  - a dedicated backend "finalize 0€ order" endpoint to assert sale creation +
  //    gift-card debit. Neither exists today; the only server path that finalizes a
  //    gift-card-covered order is /api/client/mock-pay (the mock path, see
  //    mockPay.exposure.test.js). Documented here as a known gap.
  it.todo(
    'E2E: a 100%-gift-card (0€) order should still create a Sale and debit the gift card ' +
      '(needs frontend E2E or a dedicated backend 0€-finalize endpoint — see report 06)'
  );
});
