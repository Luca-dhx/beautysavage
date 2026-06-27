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

> **Phase 4A update (business events)** — business mutations now emit audit-only
> EventLog entries via `services/businessEventService.js` (sale/booking/refund/
> gift_card/commission). New green tests: `tests/p1/businessEvents.test.js`
> (emission + a failing EventBus never breaks the flow + no SendLog side effect) and
> `tests/p1/businessEventPayloadSafety.test.js` (no email/secret/token in payloads).
> Suite: **140 tests / 35 files** (p0 44, p1 90, integration 6). See
> `Rapports/version 1/60_rapport_phase4a_business_events.md`.

> **Phase 4B update** — more deferred business events wired (booking.reminded/
> no_show_marked/client_suspended, commission.paid, gift_card.created) and email
> SendLog `contextId` attached for refund/commission. New green tests:
> `tests/p1/deferredBusinessEvents.test.js` (incl. gift-card password never leaks)
> and `tests/p1/sendLogContextAttachment.test.js` (postToBrevo(payload, context) →
> SendLog/email.* contextType+contextId; explicit context wins over tag-derived).
> Suite: **151 tests / 37 files** (p0 44, p1 101, integration 6). See
> `Rapports/version 1/62_rapport_phase4b_deferred_events_contexts.md`.

> **Phase 4C update** — password_reset email now carries `contextType:user`/
> `contextId:user._id`; notifications audited (none migrated). New green tests:
> `tests/p1/emailRemainingContexts.test.js` (password_reset/email_confirmation/
> system/gift_card contexts; no email/code stored) and
> `tests/p1/notificationMigrationAudit.test.js` (emitting business events creates
> NO Notification and NO email — audit-only, no subscriber). Suite: **157 tests /
> 39 files** (p0 44, p1 107, integration 6). See
> `Rapports/version 1/65_rapport_phase4c_contexts_notifications_audit.md`.

> **Phase 4D update** — first EventBus→Notification subscriber (flag-gated,
> idempotent, in-app only). New green tests:
> `tests/p1/notificationEventSubscriber.test.js` (flag off → no notif; registered →
> new_sale / no_show_recorded; incomplete payload safe; no email) and
> `tests/p1/notificationEventIdempotence.test.js` (re-emit → single notif; handler
> failure never throws to emitter). Tests register subscribers explicitly
> (`registerNotificationSubscribers()`); the boot flag
> `ENABLE_EVENT_NOTIFICATION_SUBSCRIBERS` stays off in test. Suite: **166 tests /
> 41 files** (p0 44, p1 116, integration 6). See
> `Rapports/version 1/67_rapport_phase4d_notification_subscriber.md`.

> **Phase 4E update** — subscriber now has an off/shadow/active mode
> (`EVENT_NOTIFICATION_SUBSCRIBER_MODE`, default off) and re-fetches the business
> object for parity. New green tests: `tests/p1/notificationEventParity.test.js`
> (re-fetch builds the same variables as the direct call; client email excluded;
> object-not-found → no notif/no throw) and `tests/p1/notificationEventShadowMode.test.js`
> (off → nothing; shadow → delivery status "shadow", no notif; active → notif;
> shadow→active upgrade). The Phase 4D subscriber tests now set
> `EVENT_NOTIFICATION_SUBSCRIBER_MODE=active` and seed real ServiceBooking fixtures.
> Suite: **173 tests / 43 files** (p0 44, p1 123, integration 6). See
> `Rapports/version 1/70_rapport_phase4e_notification_parity_shadow.md`.

> **Phase 5A update (email template versioning)** — `EmailTemplate` gains
> version/status; the runtime serves the published version (legacy/no-status docs
> treated as published; content unchanged). New green tests:
> `tests/p1/emailTemplateVersioning.test.js` (migration v1 published + dry-run,
> single-published partial unique, draft/publish lifecycle, sanitization),
> `tests/p1/emailTemplateRuntimePublished.test.js` (loadTemplate → published /
> legacy fallback / default; draft & archived never served),
> `tests/p1/emailTemplateRollback.test.js` (rollback = new published copy, old
> archived). Tests call `EmailTemplate.syncIndexes()` and insert legacy docs via
> `collection.insertOne` to bypass schema defaults. Suite: **185 tests / 46 files**
> (p0 44, p1 135, integration 6). See
> `Rapports/version 1/72_rapport_phase5a_email_template_versioning.md`.

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
    legalConsentCheckout.test.js           # Sprint pré-React A1
    businessTimezone.test.js               # Sprint pré-React A2
    brevoWebhookProductionSecurity.test.js # Sprint pré-React A3
    adminRefundAudit.test.js               # Sprint pré-React A4
    commissionRefundConsistency.test.js    # Sprint pré-React A5
    stripeWebhookFailureObservability.test.js # Sprint pré-React A6
    depositDistanceLearningGuards.test.js  # Sprint pré-React A7
    ... (et autres suites p1)
```

## Sprint pré-React A1-A3 (rapports 85 / 86)

- **A1 — consentement légal serveur** (`p1/legalConsentCheckout.test.js`) : refus
  sans CGV / distanciel sans renonciation / prestation datée sans reconnaissance →
  code `LEGAL_CONSENT_REQUIRED` ; consentement complet → checkout continue ; free
  checkout 0€ applique les **mêmes** règles ; snapshot `Sale.legalConsentSnapshot`
  présent. Fixture adaptée : `p0/giftcard.zeroPayment.characterization.test.js`
  (Test 1) fournit la renonciation pour une prestation dans la fenêtre de rétractation.
- **A2 — timezone Europe/Paris** (`p1/businessTimezone.test.js`) :
  `BUSINESS_TIMEZONE === 'Europe/Paris'`, disponibilité câblée sur la constante,
  offsets DST, garde de démarrage. Forçage `process.env.TZ` désactivé en test.
- **A3 — webhook Brevo prod** (`p1/brevoWebhookProductionSecurity.test.js`) : prod
  sans secret → 503, mauvais secret → 401, bon secret → 200, dev/test sans secret →
  200 (toléré) ; le secret n'est jamais loggé.

## Sprint pré-React A4-A7 (rapports 87 / 88)

- **A4 — gouvernance admin** (`p1/adminRefundAudit.test.js`) : `refund.failed`/
  `refund.requested` émis avec la raison admin + persistance dans `meta.notes` ;
  `booking.cancelled` admin émis avec raison. Aucun remboursement silencieux.
- **A5 — commissions post-remboursement** (`p1/commissionRefundConsistency.test.js`) :
  déduction d'un remboursement 100 % carte cadeau (trou corrigé), déduction Stripe,
  events `commission.adjusted` / `commission.reversal_required` (vente déjà payée) /
  `commission.cancelled` (reversal).
- **A6 — pannes webhook Stripe** (`p1/stripeWebhookFailureObservability.test.js`) :
  signature invalide → failure safe (400), contexte introuvable → failure safe (500),
  replay idempotent → 200 sans failure, aucune donnée sensible stockée.
- **A7 — acompte / distanciel** (`p1/depositDistanceLearningGuards.test.js`) : offre
  acompte bloquée (`OFFER_BALANCE_UNSUPPORTED`), distanciel immédiat sans accès bloqué
  (`OFFER_ACCESS_UNAVAILABLE`), distanciel manuel marqué `accessDeliveryStatus='manual_pending'`.

## Sprint pré-React B1-B2 (rapports 97 / 98)

- **B1 — V1 sans TVA** (`p1/v1TaxMode.test.js`) : contrat fiscal central
  (`constants/tax.js`, franchise 293 B, taux 0), `buildTaxSnapshot` (HT=TTC, vatAmount 0),
  `Sale.taxSnapshot` porté par chaque vente, label fiscal sourcé d'une seule constante.
- **B2 — serveur source de vérité du montant** :
  - `p1/serverCheckoutPricing.test.js` — montant serveur (produit/formation/prestation/
    panier/carte cadeau, couverture carte cadeau partielle/100 %).
  - `p1/checkoutAmountTampering.test.js` — sous-paiement client → `CHECKOUT_AMOUNT_MISMATCH`,
    conforme → OK, carte cadeau sur-déclarée capée, carte inactive ignorée.
  - `p1/serverPricingGiftCardPromotion.test.js` — promo active/expirée, promo + carte cadeau,
    solde insuffisant.
- Commissions **non modifiées** (exclusion volontaire ; prochaine étape = discussion produit).

## Sprint F2 — Extraction Stripe (rapports 125-126)

- `stripeControllerExtractionParity.test.js` (+4) — le contrôleur `stripeController` (1727 → 135
  lignes) n'est qu'un délégateur : la logique vit dans `services/stripe/*`. Vérifie les 7 handlers,
  `GET /config` 200/500, createCheckoutSession 401, **aucun secret exposé**.
- `stripeWebhookExtractionParity.test.js` (+4) — routing webhook inchangé après extraction :
  signature invalide → 400, event non géré → 200 `{received:true}`, résultat structuré
  `{status, json}` du service, `payment_intent.payment_failed` sans id → 200.
- Domaine couvert inchangé (idempotence PI/refund, secret coffre, failure log safe, pricing
  serveur, amount tampering, invoices officielles) par les suites existantes, toutes vertes.

## Sprint F1 — Extraction Checkout (rapports 123-124)

- `checkoutExtractionParity.test.js` (+4) — prouve que l'extraction du domaine Checkout hors de
  `clientController` (3253 → 1707 lignes) est **purement structurelle** :
  (1) **identité référentielle** — `checkoutFacade.X === sousService.X` pour les 11 fonctions
  ré-exportées (une seule définition, aucune duplication) ;
  (2) **contrat HTTP `finalize-free` inchangé** — 401 sans auth, 400 `CHECKOUT_STATE_REQUIRED`,
  402 `PAYMENT_REQUIRED` (solde dû).
- Les 8 suites qui finalisaient via `processCheckoutStatePurchase` importent désormais ce
  finaliseur depuis `services/checkout/checkoutFacade.js` (au lieu de `controllers/clientController.js`) —
  aucun changement de comportement, mêmes assertions.
- Domaine couvert inchangé (Stripe checkout, 0 €, carte cadeau, acompte, consentement, slot,
  distanciel, promotion, webhook idempotent) par les suites existantes.

## Pré-React E1-E2 (rapports 120-122)

- **E1 — Promotion source unique DÉFINITIVE** : `promotionMigrationService.test.js` et
  `promotionSingleApplication.test.js` mis à jour — le fallback legacy `Service.promotion` a
  disparu du runtime. `resolveEffectiveServiceUnitPrice` sans Promotion(service) → **prix
  plein** (`source: null`) ; une Promotion(service) fait foi. Migration dry-run/`--apply`
  toujours validée (idempotence).
- **E2 — Refactor SEAM-FIRST (zéro changement de comportement)** : `planGiftCardUsage` /
  `finalizeGiftCardUsage` déplacés vers `services/checkout/checkoutGiftCardService.js` ; les
  11 sites d'appel dans `clientController` (couverts par les tests checkout/webhook/0 €)
  passent inchangés par import. Seams re-export `services/stripe/*Facade.js` et
  `services/mail/mailDispatcher.js` (consommés par clientController). Aucun test nouveau requis
  (extraction structurelle), suite **317 verte** inchangée.

## Pré-React D1-D4 (rapports 115-119)

- `promotionMigrationService.test.js` (D1) — Promotion source unique (priorité Promotion,
  fallback Service.promotion legacy, jamais les deux) ; migration dry-run/--apply.
- `giftCardUsageReceipt.test.js` (D2) — commande 100 % carte cadeau → reçu interne non fiscal
  (`gift_card_usage_receipt`) ; facture officielle = Stripe ; label 293 B.
- `depositPaymentFlow.test.js` (D3) — acompte autorisé si `pay_on_site` (sinon bloqué) ;
  solde tracé ; remboursement capé à l'acompte ; `markBalancePaidOnSite`.
- `businessHistoryCleanup.test.js` (D4) — dry-run ne supprime rien ; `--apply` cible les
  collections transactionnelles ; configuration (Service…) toujours intacte.

## Unification promotions + base commission (rapports 113-114)

- `promotionSingleApplication.test.js` — une seule promotion (pickSinglePromotion meilleure
  réduction) ; Promotion/Service.promotion disjointes (pas de cumul) ; promo expirée ignorée.
- `giftCardPaymentNotDiscount.test.js` — carte cadeau = moyen de paiement (ne réduit ni
  soldPrice ni commissionBase) ; capée au prix vendu ; stripe = sold − giftCard.
- `commissionBaseIncludesGiftCard.test.js` — base commission = soldPrice quel que soit le
  split carte cadeau/Stripe ; remboursement partiel → déduction proportionnelle sur la base.
- `invoiceGiftCardPaymentLine.test.js` — ligne facturée = prix vendu ; carte cadeau =
  règlement séparé ; facture officielle = Stripe.

## Pré-React C1-C3 (rapports 107-112)

- `giftCardRecreditRecovery.test.js` (C1) — reprise `rollback_needed` (réussie, idempotente
  sans double-crédit, balayage, échec persistant → compteur, refund succeeded intact).
- `stripeInvoicesOfficialSource.test.js` (C2) — facture officielle = Stripe ; PDF interne
  non fiscal ; 0 € sans facture officielle ; commission Stripe Dev ; label 293 B.
- `distanceLearningLifetimeAccessRefund.test.js` (C3) — distanciel sans renonciation refusé ;
  accès immédiat → granted/lifetime + snapshot légal ; remboursement après accès refusé.

## Correction commissions (rapports 104-106)

Six suites `p1` valident l'unification de la facturation des commissions :
- `commissionMonthlySourceOfTruth.test.js` — source unique (gross/refundDeduction/netAmountDue),
  carte cadeau + promo incluses, ligne négative refundId+saleId, ledger non facturant.
- `commissionCarryOver.test.js` — report négatif (facture 0 € + carry-over appliqué le mois suivant).
- `commissionPaymentRefresh.test.js` — refresh obligatoire avant PaymentIntent ; settled_zero.
- `commissionPaymentIdempotence.test.js` — double-clic concurrent → un seul PaymentIntent ; mois payé → 409.
- `commissionDevWebhookFinalization.test.js` — webhook Dev finalise (idempotent) ; polling fallback.
- `integratedApiAccountPurpose.test.js` — accountPurpose seedé + backfill.

Harnais `npm run audit:commissions` (20 probes) mis à jour : C11/C17 caractérisent désormais
le comportement **corrigé** (carry-over, refresh).

## Audit pré-React — matrice de scénarios métier (rapports 89-96)

Harnais **exploratoire et isolé** : `tests/audit/businessScenarioMatrix.test.js`
(**36 probes de caractérisation** vertes). Couvre créneaux/locks multi-praticiennes,
éligibilités remboursement, split carte cadeau, commission (A5), promotions, garde-fous
offres (A7), consentement (A1), observabilité webhook (A6), anti-doublon remboursement.

- Lancement dédié : `npm run audit:business-scenarios` (config `vitest.audit.config.js`).
- **Exclu** de `npm test` (via `exclude: ['tests/audit/**']` dans `vitest.config.js`) pour
  qu'un scénario révélant un FAIL/FRAGILE ne casse jamais le CI P0/P1/integration.
- Chaque probe fige le comportement OBSERVÉ ; les risques (PASS/FAIL/FRAGILE/INDÉTERMINÉ)
  sont classés analytiquement dans le rapport 90.

### Audit commissions (rapports 99-103)

`tests/audit/commissionScenarioMatrix.test.js` (**20 probes** vertes), lancé via
`npm run audit:commissions`. Couvre : base de calcul (prix payé, carte cadeau incluse, promo),
remboursements avant/après commission, cross-mois, ledger vs facturation (doublon),
montant figé (refresh non câblé), clamp à 0, idempotence/doublon, 0 €. Caractérisation :
vert = comportement observé ; les FRAGILE (C11 clamp, C14 doublon ledger, C17 montant figé)
sont documentés dans les rapports 99/102/103.

## Safety (no real secrets / no real DB)

- `tests/setup/testEnv.js` sets fake values for every sensitive env var **before**
  `app.js` runs `import 'dotenv/config'`. Since dotenv does not override existing
  vars, the real `.env` values can never enter a test run.
- `tests/setup/testApp.js` refuses to boot unless `MONGODB_URI` points to a local
  in-memory server (guards against connecting to a real cluster).
- The mail service is mocked or outbound HTTP is stubbed in tests that would
  otherwise send email.
- `app.js` skips background schedulers and `app.listen()` when `NODE_ENV==='test'`.
