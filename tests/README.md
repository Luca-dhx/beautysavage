# BeautySavage - Backend test harness (Phase 0.2)

A characterization-first test harness put in place **before** any P0/P1 business
fix, so that financial / booking / refund / security flows can be corrected with a
safety net. The harness itself changed no business logic (only a minimal,
documented startup adaptation in `app.js`).

> **Phase 1A update** - the simple security P0s are now **fixed** (mock-pay
> production guard, removed hardcoded secret fallbacks, gift-card password no
> longer leaked by the public tracking endpoint, tracking-token debug log
> removed). New green tests under `tests/p0/security.*` lock these in. The fixtures
> (`seedTestData`) now also create an **active contract** so API routes pass
> `contractGuard()` (otherwise it returns 503 `CONTRACT_INACTIVE` and tests never
> reach the handlers). See `Rapports/version 1/23_rapport_phase1a_securite_p0.md`.
>
> **Phase 1B-1 update** - two financial P0s are now **fixed**: (1) Stripe webhook
> idempotence is atomic (unique partial index on `Sale.stripePaymentIntentId`, set
> at insert in `persistSale`, + `E11000` handled as idempotent), and (2) gift-card
> debit is atomic (`debitGiftCardBalanceAtomic` - conditional `findOneAndUpdate`,
> never negative). New green tests: `stripe.webhook.idempotence` and
> `giftcard.concurrentDebit.test.js`. See
> `Rapports/version 1/25_rapport_phase1b1_stripe_giftcard.md`.
>
> **Phase 1B-2 update** - the refund P0 trio is now **fixed**: (1) duplicate
> `RefundRequest` creation is blocked per active `saleId + itemId + itemType`
> (unique partial index + `createRefundRequestOnce` refetch on duplicate), (2)
> gift-card recredit is idempotent under duplicate `charge.refund.updated`
> delivery (`giftCardRecreditInProgress` claim + single credit transaction), and
> (3) refund execution is capped to the paid sale total. New green tests:
> `refund.doubleRequest.characterization.test.js`,
> `refund.recreditIdempotent.test.js`, `refund.overRefund.test.js`. See
> `Rapports/version 1/27_rapport_phase1b2_remboursements.md`.
>
> **Phase 1B-4 update** - the last P0 is now **fixed**: a 0 EUR order (100% gift
> card or a genuinely free item) is finalized server-side via
> `POST /api/client/checkout/finalize-free`, which reuses the SAME finalizer as the
> Stripe webhook (`processCheckoutStatePurchase`) — no parallel flow. It creates the
> Sale + booking, debits the gift card atomically, is idempotent on double submit
> (synthetic `free_<key>` ref on the Phase 1B-1 unique index), and refuses to
> finalize a partially-paid order for free (`requireZeroRemaining` → 402). The
> `giftcard.zeroPayment.characterization.test.js` todo is now a full green test. See
> `Rapports/version 1/32_rapport_phase1b4_zero_payment.md`. **The P0 harness now has
> zero todo and zero expected-fail.**

## How to run

```bash
npm test                 # run everything once (vitest run)
npm run test:watch       # watch mode
npm run test:integration # only tests/integration (health + auth)
npm run test:p0          # only tests/p0 (P0 characterizations)
```

Requirements: Node 22+. The first run downloads a `mongodb-memory-server` binary
(cached afterwards). Tests never touch the real `.env`, real database, Brevo or
Stripe - see "Safety" below.

## What passes vs. what is intentionally red

### Green (these MUST pass)
- `tests/integration/health.test.js` - the app boots in `NODE_ENV=test` against an
  in-memory MongoDB, is connected to a local (not prod) cluster, and serves a
  public endpoint without leaking secret keys.
- `tests/integration/auth.test.js` - signup creates an unverified client + issues a
  code (mail mocked), login is refused while unverified, verify-email activates the
  account and opens a session, and a verified client can login + reach `/auth/me`.
- `tests/p0/mockPay.exposure.test.js` - documents that `POST /api/client/mock-pay`
  is blocked in production.
- `tests/p0/stripe.webhook.idempotence.characterization.test.js` - one sale per
  Stripe PaymentIntent, including replay/concurrent delivery.
- `tests/p0/giftcard.concurrentDebit.test.js` - gift-card debit stays atomic.
- `tests/p0/refund.doubleRequest.characterization.test.js` - duplicate refund
  creation is rejected/refetched, with one active refund and one financial trigger.
- `tests/p0/refund.recreditIdempotent.test.js` - duplicate refund webhook delivery
  recredits the gift card exactly once.
- `tests/p0/refund.overRefund.test.js` - refund execution is capped to the paid
  sale total for mixed and gift-card-only refunds.
- `tests/p0/booking.doubleSlot.characterization.test.js` - service booking rejects
  exact double-booking, partial overlap, past slots, off-schedule slots and blocked
  slots, while still allowing a slot reopened by a `modify` exception.
- `tests/p0/booking.slotRevalidation.test.js` - final Stripe-side service booking
  creation is revalidated server-side and refuses a slot that became unavailable.
- `tests/p0/giftcard.zeroPayment.characterization.test.js` - a 0 EUR order (100% gift
  card or a free item) is finalized via `POST /api/client/checkout/finalize-free`:
  Sale + ServiceBooking created, gift card debited (capped to the due amount),
  double-submit is idempotent (one sale, one debit), and a still-due balance is
  refused (402 `PAYMENT_REQUIRED`).

### Expected-fail (`it.fails`)

Currently none in the P0 harness.

### Todo (`it.todo`) - documented gap not yet automated

Currently none — every P0 scenario is now an executable assertion.

## How to use these tests to guide the fixes

1. Add or update a characterization/regression test for the P0.
2. Implement the fix behind the failing assertion.
3. Re-run `npm run test:p0` until the regression is permanently green.
4. Repeat. The harness keeps you from breaking the already-green flows while you fix.

For the `it.todo` items, build the missing fixture/endpoint, then implement the
assertion described in the todo string.

## Structure

```text
tests/
  setup/
    testEnv.js
    testDb.js
    testApp.js
    seedTestData.js
    stripeWebhookTestUtils.js
  integration/
    health.test.js
    auth.test.js
  p0/
    mockPay.exposure.test.js
    security.secrets.test.js
    security.tracking-token.test.js
    security.logging.test.js
    stripe.webhook.idempotence.characterization.test.js
    giftcard.concurrentDebit.test.js
    refund.doubleRequest.characterization.test.js
    refund.recreditIdempotent.test.js
    refund.overRefund.test.js
    booking.doubleSlot.characterization.test.js
    booking.slotRevalidation.test.js
    giftcard.zeroPayment.characterization.test.js
```

## Safety (no real secrets / no real DB)

- `tests/setup/testEnv.js` sets fake values for every sensitive env var **before**
  `app.js` runs `import 'dotenv/config'`. Since dotenv does not override existing
  vars, the real `.env` values can never enter a test run.
- `tests/setup/testApp.js` refuses to boot unless `MONGODB_URI` points to a local
  in-memory server (guards against connecting to a real cluster).
- The mail service is mocked or outbound HTTP is stubbed in tests that would
  otherwise send email.
- `app.js` skips background schedulers and `app.listen()` when `NODE_ENV==='test'`.
