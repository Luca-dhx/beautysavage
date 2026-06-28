# 127 — Audit pré-Sprint F2B : extraction Stripe Dev / plateforme

> Lecture seule. Cartographie du domaine Stripe **Dev / plateforme** (`platform_billing`)
> dispersé dans 3 contrôleurs + un utilitaire. Aucune logique modifiée. Objectif : créer
> `services/stripe/dev/` et amincir les contrôleurs, sans changer le comportement métier.

## Périmètre Stripe Dev (compte plateforme)
Compte distinct de l'Institut : l'institut **paie la plateforme** (commissions mensuelles,
frais de lancement contrat, abonnement maintenance). Client = `getStripeDevClient` (slug vault
`stripe-dev`, `accountPurpose: platform_billing`).

## Fonctions Stripe Dev actuelles
### `utils/stripeDevClient.js` (36 l)
- `getStripeDevClient()` — client Stripe Dev caché (vault `stripe-dev` / secret_key, fallback .env).
  **OPTIONNEL** : renvoie `null` si non configuré (tolérance historique `if (!client) ...`).

### `controllers/devWebhookController.js` (271 l) — webhook Dev
- `handleDevWebhook(req,res)` [HTTP, monté AVANT express.json, raw body] : secret (getCredential)
  + `constructEvent` + routing 6 events.
- Handlers : `handlePaymentIntentSucceeded` (commission via `finalizeCommissionPaymentById`,
  sinon launch fee contrat), `handleSetupIntentSucceeded` (abonnement mensuel : attach PM,
  create price+subscription), `handleInvoicePaymentSucceeded/Failed`, `handleSubscriptionUpdated/Deleted`.

### `controllers/commissionPaymentController.js` (581 l) — paiement commissions
- `generateCommissionInvoice(payment)` — **facture Stripe Dev officielle** : customer + invoice +
  invoiceItems (ventes/remboursements) + finalize + pay out-of-band + persiste `stripeInvoiceId/Url`.
- `finalizeCommissionPaymentById(id)` — SOURCE serveur de finalisation (webhook + polling),
  idempotent ; déclenche `generateCommissionInvoice`.
- `createCommissionIntent(req,res)` [HTTP] — refresh montant + idempotence PI + verrou anti
  double-clic + `paymentIntents.create` (idempotencyKey mensuel).
- `checkCommissionStatus(req,res)` [HTTP] — `paymentIntents.retrieve` + fallback finalisation.
- Autres handlers (settings, reminders, reset, simulated-date) sans Stripe.

### `controllers/contractController.js` (1098 l) — facturation contrat
- `getStripeDevConfig(req,res)` [HTTP public] — publishable key Dev.
- `createLaunchIntent`/`createMonthlySetup`/`verifyLaunchPayment`/`verifyMonthlySetup`/
  `syncStripeStatuses`/`cancelContract`/`cancelImmediate` — PaymentIntent/SetupIntent/Subscription/
  Customer Dev intriqués dans la **machine à états du contrat** (ContractCheckoutIntent, fichiers,
  grace period). Fortement couplé.

## Dépendances
- `utils/stripeDevClient` importé par : `devWebhookController`, `commissionPaymentController`,
  `contractController`, et **3 tests** (`commissionDevWebhookFinalization`,
  `commissionPaymentIdempotence`, `commissionPaymentRefresh`) qui le **mockent**.
- `handleDevWebhook` monté dans `app.js` (`/api/stripe/dev-webhook`, raw body avant express.json).
- `getStripeDevConfig` monté via `contractRouter` (`/api/contract/stripe-dev-config`).
- `finalizeCommissionPaymentById` importé par `devWebhookController`.

## accountPurpose
`models/IntegratedApi.js` : enum `['customer_payments','platform_billing','messaging']`, défaut `null`.
`seeders/seedIntegratedApisFromEnv.js` assigne DÉJÀ : `stripe-institut→customer_payments`,
`stripe-dev→platform_billing`, `brevo→messaging`, avec **backfill idempotent** des documents
existants sans valeur. → la garde accountPurpose est déjà respectée par le seed.

## Contrainte forte (tests)
Les 3 tests commission **mockent `utils/stripeDevClient.js`** (`getStripeDevClient → fake client`)
et `getCredential`. Ils appellent `handleDevWebhook(req,res)` / `createCommissionIntent(req,res)` /
`finalizeCommissionPaymentById(id)` directement. → tout chemin testé doit accéder au client Dev
via `getStripeDevClient` importé de `utils/stripeDevClient.js` (le **shim** restera l'accesseur
mockable), et `handleDevWebhook` doit garder la signature `(req,res)`.

## Architecture cible (`services/stripe/dev/`)
```
stripeDevConfigService     getStripeDevClient (impl) + publishable/webhook secret + accountPurpose
stripeDevInvoiceService    generateCommissionInvoice (facture Dev officielle)
stripeDevPaymentService    createCommissionPaymentIntent (PI commission + metadata + idempotency)
stripeDevWebhookHandlers   6 handlers d'événements Dev
stripeDevWebhookService    handleDevWebhookFromRequest (secret + constructEvent + routing)
stripeDevResponseMapper    send(res, {status, json})
```
`utils/stripeDevClient.js` → **shim** re-exportant `getStripeDevClient` depuis le config service
(accesseur mockable, importeurs/tests inchangés). Les services accédant au client l'importent du
shim (mocks intacts) ; le secret/publishable via le config service (→ `getCredential`, mockable).

## Ordre d'extraction
1. `stripeDevConfigService` (déplacer impl client + keys + accountPurpose). utils → shim.
2. `stripeDevInvoiceService` (generateCommissionInvoice verbatim).
3. `stripeDevPaymentService` (createCommissionPaymentIntent).
4. `stripeDevWebhookHandlers` + `stripeDevWebhookService` + `stripeDevResponseMapper`.
5. Amincir `devWebhookController` (délégateur). Repointer `commissionPaymentController`.

## Tests existants
`commissionDevWebhookFinalization`, `commissionPaymentIdempotence`, `commissionPaymentRefresh`,
`stripeCredentialMigration` (getStripeDevConfig), `integratedApi*` / `credentialVault*`.

## Tests manquants (ajoutés F2B)
- `stripeDevExtractionParity` : config/publishable inchangé, identité référentielle (shim ===
  service, controller délégateur), accountPurpose (`stripe-dev→platform_billing`,
  `institut→customer_payments`, `brevo→messaging`), aucun secret exposé.
- `stripeDevWebhookExtractionParity` : signature invalide → 400, secret/client absent → 500,
  event non géré → 200, résultat structuré du service.

## Zones critiques / dette
- **Facturation contrat** (`contractController`, 1098 l) : machine à états très intriquée avec
  Stripe Dev → extraction complète **reportée (F3)**. F2B unifie la source du client (shim → config)
  sans toucher l'orchestration contrat.
- **createCommissionIntent/checkCommissionStatus** : orchestration (refresh/verrou/idempotence)
  conservée dans le contrôleur ; seule la **création du PaymentIntent** est extraite.
