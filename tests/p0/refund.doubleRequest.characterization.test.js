// tests/p0/refund.doubleRequest.characterization.test.js
// CHARACTERIZATION (P0): there is no anti-duplicate protection for RefundRequest.
// The model has only NON-unique indexes on { saleId, itemId, reason } (see model
// models/RefundRequest.js and report 07), so two refund requests can be created
// for the same sale/item — enabling double refunds (double Stripe refund + double
// gift-card recredit).
//
// We assert the DESIRED behaviour (the second identical request is rejected by a
// unique constraint) and wrap it with `it.fails`: the suite stays GREEN while
// documenting the missing guard. When a partial unique index is added (Phase 1),
// the second create will reject, the assertion will pass, and `it.fails` flips RED.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

const { getTestApp } = await import('../setup/testApp.js');
const { stopMemoryDb, clearDatabase } = await import('../setup/testDb.js');
const { seedTestData } = await import('../setup/seedTestData.js');
const RefundRequest = (await import('../../models/RefundRequest.js')).default;

describe('P0 characterization — duplicate RefundRequest for the same sale', () => {
  let fixtures;

  beforeAll(async () => {
    await getTestApp(); // boot app => mongoose connected
  });

  afterAll(async () => {
    await stopMemoryDb();
  });

  beforeEach(async () => {
    await clearDatabase();
    fixtures = await seedTestData();
  });

  it.fails(
    'should reject a second active RefundRequest for the same sale+item (no anti-duplicate today)',
    async () => {
      const itemId = new mongoose.Types.ObjectId();
      const base = {
        saleId: 'SALE-DUP-1',
        userId: fixtures.client1._id,
        itemId,
        itemType: 'service',
        amount: 80,
        reason: 'client_cancel_service'
      };

      await RefundRequest.create({ ...base, refundId: 'RF-DUP-1' });

      // DESIRED: a unique constraint should make the second identical request fail.
      // CURRENT: it succeeds (no unique index) -> this assertion fails -> it.fails => green.
      await expect(RefundRequest.create({ ...base, refundId: 'RF-DUP-2' })).rejects.toThrow();
    }
  );

  it('documents the current reality: two RefundRequests for the same sale DO co-exist', async () => {
    const itemId = new mongoose.Types.ObjectId();
    const base = {
      saleId: 'SALE-DUP-2',
      userId: fixtures.client1._id,
      itemId,
      itemType: 'service',
      amount: 80,
      reason: 'client_cancel_service'
    };
    await RefundRequest.create({ ...base, refundId: 'RF-DUP-3' });
    await RefundRequest.create({ ...base, refundId: 'RF-DUP-4' });

    const count = await RefundRequest.countDocuments({ saleId: 'SALE-DUP-2', itemId });
    // GREEN characterization of the current (buggy) behaviour.
    expect(count).toBe(2);
  });
});
