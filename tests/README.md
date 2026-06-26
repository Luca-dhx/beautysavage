# BeautySavage - Backend test harness (Phase 0.2)

A characterization-first test harness put in place **before** any P0/P1 business
fix, so that financial / booking / refund / security flows can be corrected with a
safety net. The harness itself changed no business logic (only a minimal,
documented startup adaptation in `app.js`).

> **Phase 1 update (credential vault)** — third-party secrets (Stripe Institut/Dev
> `secret_key`, Brevo `api_key`) are now sourced from the `IntegratedApi` vault via
> `getCredential()` (AES-256-GCM, `utils/credentialVault.js`). Tests inject a fake
> 64-hex `CREDENTIAL_VAULT_KEY` and set `ALLOW_ENV_CREDENTIAL_FALLBACK=true`
> (`tests/setup/testEnv.js`) so vault-miss reads fall back to the fake provider env
> vars — existing Stripe/Brevo tests are unaffected. New green tests:
> `tests/p1/credentialVault.test.js`, `tests/p1/integratedApiCredentials.test.js`,
> `tests/p1/integratedApiSeed.test.js`. See `Rapports/version 1/49_rapport_phase1_coffre_integrated_api.md`.

> **Phase 1B update** — Stripe `publishable_key` and `webhook_secret` (Institut +
> Dev) now come from the vault too. New green tests:
> `tests/p1/stripeCredentialMigration.test.js` (publishable from vault, fallback
> gating), `tests/p1/stripeWebhookCredentialVault.test.js` (webhook secret from
> vault via a mocked `stripe`, invalid signature → 400, missing → 500),
> `tests/p1/credentialVaultRotation.test.js` (key rotation dry-run/apply). The
> webhook test mocks `stripe` so `constructEvent` records which secret it received.
> See `Rapports/version 1/51_rapport_phase1b_stripe_credentials_rotation.md`.

> **Phase 2 update (SendLog & Brevo observability)** — outbound email now writes a
> `SendLog` (queued→sent→delivered→opened / bounced / failed); a Brevo webhook
> updates it by `providerMessageId`; a dev-only `GET /api/gestion/dev/send-logs`
> exposes the logs. New green tests: `tests/p1/sendLog.test.js` (mocks `fetch` to
> drive `postToBrevo`), `tests/p1/brevoWebhook.test.js` (controller-level
> delivered/opened/bounce + shared-secret), `tests/p1/sendLogEndpoint.test.js`
> (requireStrictDev via the seeded dev/admin/client users). No email/secret is ever
> stored or logged (recipient is a SHA-256 hash). Note: an unused live Stripe key
> was removed from `testEnv.js` (see report 52). See
> `Rapports/version 1/53_rapport_sendlog_brevo_observability.md`.

> **Phase 3 update (event bus)** — a backend event bus persists `EventLog` rows and
> notifies in-process subscribers; SendLog transitions emit `email.*` events; a
> dev-only `GET /api/gestion/dev/events` exposes them. New green tests:
> `tests/p1/eventBus.test.js` (persist + redaction + subscriber isolation),
> `tests/p1/sendLogEvents.test.js` (SendLog→events + context), `tests/p1/
> eventLogEndpoint.test.js` (requireStrictDev). Payloads are redacted (no
> email/secret). See `Rapports/version 1/56_rapport_phase3_event_bus.md`.

> **Consolidation @180054c** — suite verte : **130 tests / 33 fichiers** (p0 = 44,
> p1 = 80, integration = 6). Snapshot complet du projet :
> `Rapports/version 1/57_audit_documentation_consistency.md` (cohérence doc/code) et
> `Rapports/version 1/58_architecture_snapshot_2026.md` (photographie d'architecture).

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
>
> **Phase 1B-4B update** - the frontend is now wired to consume that backend fix:
> any checkout whose due-now amount is `0 EUR` goes through
> `checkoutToken + freeCheckout=1` to the payment result screen, which calls
> `POST /api/client/checkout/finalize-free` with `idempotencyKey = checkoutToken`
> and never loads Stripe. A focused frontend regression test,
> `purchaseFlowService.zeroPayment.wiring.test.js`, locks the request shape and the
> clear `402 PAYMENT_REQUIRED` error path. See
> `Rapports/version 1/34_rapport_phase1b4b_front_zero_payment.md`.
>
> **Phase 1B-5 update** - the new booking cleanup job expires stale `pending_payment`
> bookings after 30 minutes, releases their slot locks, and keeps paid/confirmed
> bookings untouched. The regression test
> `booking.pendingPaymentCleanup.test.js` covers the expiration, idempotence, and
> success-before-expiration cases. See
> `Rapports/version 1/37_rapport_phase1b5_pending_payment.md`.
>
> **Phase P1-1 update** - the role split is now real: `requireStrictDev` is dev-only,
> admin/dev routes stay inclusive where expected, and admins cannot create or
> promote `dev` accounts through user management. Dedicated rate limits now cover
> `POST /auth/login` and the password-reset routes. The new focused tests live in
> `tests/p1/`. See `Rapports/version 1/39_rapport_p1_roles_rate_limit.md`.
>
> **Phase P1-3 update** - blocked refunds are now retryable instead of getting
> consumed on a failed trigger, and Stripe refund credit notes / invoices use
> stable idempotency keys so replayed executions stay safe. New focused tests:
> `refund.recovery.test.js`, `refund.creditNoteIdempotence.test.js`,
> `invoice.recovery.test.js`. See
> `Rapports/version 1/43_rapport_p1_refund_recovery_credit_notes.md`.

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
`npm run test:p1` runs only the new P1 security harness.

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
- `tests/p0/booking.pendingPaymentCleanup.test.js` - stale `pending_payment`
  bookings expire after 30 minutes, release their locks, and remain idempotent on
  repeated cleanup runs while leaving paid/confirmed bookings untouched.
- `tests/p0/giftcard.zeroPayment.characterization.test.js` - a 0 EUR order (100% gift
  card or a free item) is finalized via `POST /api/client/checkout/finalize-free`:
  Sale + ServiceBooking created, gift card debited (capped to the due amount),
  double-submit is idempotent (one sale, one debit), and a still-due balance is
  refused (402 `PAYMENT_REQUIRED`).
- `tests/p0/purchaseFlowService.zeroPayment.wiring.test.js` - frontend wiring:
  zero-payment checkout posts to `/api/client/checkout/finalize-free`, sends a
  stable `idempotencyKey`, and surfaces `402 PAYMENT_REQUIRED` clearly.

### P1 (these MUST pass before the next security phase)
- `tests/p1/security.roles.test.js` - `requireStrictDev` is dev-only, admin/dev
  access remains available where expected, and admins cannot create/promote `dev`
  via user management.
- `tests/p1/auth.rateLimit.test.js` - dedicated rate limits for login and
  password-reset routes.
- `tests/p1/refund.recovery.test.js` - blocked refund requests remain retryable
  and can be recovered by the dedicated replay job.
- `tests/p1/refund.creditNoteIdempotence.test.js` - replaying a refund webhook
  does not create a second Stripe credit note.
- `tests/p1/invoice.recovery.test.js` - Stripe invoice creation is replay-safe
  and returns the persisted invoice on retry.

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
    booking.pendingPaymentCleanup.test.js
    giftcard.zeroPayment.characterization.test.js
  p1/
    security.roles.test.js
    auth.rateLimit.test.js
    refund.recovery.test.js
    refund.creditNoteIdempotence.test.js
    invoice.recovery.test.js
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
