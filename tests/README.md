# BeautySavage — Backend test harness (Phase 0.2)

A characterization-first test harness put in place **before** any P0/P1 business
fix, so that financial / booking / refund / security flows can be corrected with a
safety net. **No business logic was changed** to create this harness (only a
minimal, documented startup adaptation in `app.js`).

## How to run

```bash
npm test                 # run everything once (vitest run)
npm run test:watch       # watch mode
npm run test:integration # only tests/integration (health + auth)
npm run test:p0          # only tests/p0 (P0 characterizations)
```

Requirements: Node 22+. The first run downloads a `mongodb-memory-server` binary
(cached afterwards). Tests never touch the real `.env`, real database, Brevo or
Stripe — see "Safety" below.

## What passes vs. what is intentionally red

### ✅ Green (these MUST pass — they verify the app + harness)
- `tests/integration/health.test.js` — the app boots in `NODE_ENV=test` against an
  in-memory MongoDB, is connected to a local (not prod) cluster, and serves a
  public endpoint without leaking secret keys.
- `tests/integration/auth.test.js` — signup creates an unverified client + issues a
  code (mail mocked), login is refused while unverified, verify-email activates the
  account and opens a session, and a verified client can login + reach `/auth/me`.
- `tests/p0/mockPay.exposure.test.js` — documents that `POST /api/client/mock-pay`
  is still live and reachable by any authenticated client (green characterization).
- The "current reality" assertions inside the refund test, and the precondition in
  the gift-card test.

### 🟠 Expected-fail (`it.fails`) — these CHARACTERIZE known P0 bugs
These use vitest's `it.fails`: the body asserts the **desired safe behaviour**,
which does **not** hold today, so the suite stays GREEN while documenting the bug.
**When the bug is fixed, the assertion will pass and `it.fails` will turn RED** —
that is your signal to convert it into a normal assertion.
- `tests/p0/booking.doubleSlot.characterization.test.js` — two clients can both book
  the same practitioner+slot (no overlap guard). Desired: only 1 booking.
- `tests/p0/refund.doubleRequest.characterization.test.js` — two `RefundRequest`
  docs can exist for the same sale+item (no anti-duplicate). Desired: the 2nd is
  rejected.

### 📝 Todo (`it.todo`) — documented gaps, not yet automatable here
- `tests/p0/giftcard.zeroPayment.characterization.test.js` — the 0€ (100% gift card)
  finalization bug lives in the **frontend** flow + missing backend 0€ endpoint;
  not reproducible via a single backend HTTP call. Needs frontend E2E or a new
  backend endpoint.
- `tests/p0/stripe.webhook.idempotence.characterization.test.js` — the real
  signature util + invalid-signature rejection + "no intent => no sale" are tested;
  the full "two identical webhooks => one sale" idempotence assertion needs a seeded
  `StripeCheckoutIntent` + catalog (next step).

## How to use these tests to guide the fixes

1. Pick a P0 (e.g. double-booking). Find its `it.fails` test.
2. Implement the fix (e.g. overlap check + partial unique index).
3. Re-run `npm run test:p0`. The `it.fails` test now **fails** (because the desired
   behaviour holds): remove `.fails` to turn it into a permanent regression test.
4. Repeat. The harness keeps you from breaking the green flows while you fix.

For the `it.todo` items, build the missing fixture/endpoint, then implement the
assertion described in the todo string.

## Structure

```
tests/
  setup/
    testEnv.js                 # fake/safe env vars (runs before any import)
    testDb.js                  # in-memory MongoDB lifecycle + clearDatabase()
    testApp.js                 # boots app.js against the in-memory DB (guarded)
    seedTestData.js            # deterministic fixtures
    stripeWebhookTestUtils.js  # real Stripe webhook signature generator
  integration/
    health.test.js
    auth.test.js
  p0/
    mockPay.exposure.test.js
    booking.doubleSlot.characterization.test.js
    refund.doubleRequest.characterization.test.js
    giftcard.zeroPayment.characterization.test.js
    stripe.webhook.idempotence.characterization.test.js
```

## Safety (no real secrets / no real DB)

- `tests/setup/testEnv.js` sets fake values for every sensitive env var **before**
  `app.js` runs `import 'dotenv/config'`. Since dotenv does not override existing
  vars, the real `.env` values can never enter a test run.
- `tests/setup/testApp.js` refuses to boot unless `MONGODB_URI` points to a local
  in-memory server (guards against connecting to a real cluster).
- The mail service is mocked in tests that would otherwise send email.
- `app.js` skips background schedulers and `app.listen()` when `NODE_ENV==='test'`.
