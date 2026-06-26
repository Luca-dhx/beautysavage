# 58 — Snapshot d'architecture (2026, commit 180054c)

> **But** : permettre à une IA / un développeur de comprendre Beauty Savage **sans
> relire 50 rapports**. Photographie autoritaire au commit `180054c`, branche
> `phase-0-security-baseline`. Documentation seule (aucun changement métier).

## 1. État global

- **Produit** : Beauty Savage — institut de formations beauté + prestations
  (vitrine publique + dashboard gestion). **Mono-tenant** (un institut).
- **Stack** : Node.js/Express + MongoDB (Mongoose) + Stripe + Brevo. Frontend
  **Vanilla JS ES6** (migration React **non démarrée**).
- **Backend** : ~51 modèles, ~40 contrôleurs, ~44 routers, ~26 services, 11 jobs
  (`automatisme/`). Boot : `app.js` (top-level `mongoose.connect`, migrations,
  validation clé coffre, seed coffre, schedulers — schedulers/listen désactivés en
  `NODE_ENV=test`).
- **Tests** : **130 verts** (p0 44 / p1 80 / integration 6), Vitest +
  `mongodb-memory-server`.
- **Statut** : P0 fermés, P1 fermés, Phase 2 (SendLog/Brevo) et Phase 3 (EventBus)
  terminées.

## 2. Composants clés

| Domaine | Fichiers | Rôle |
|---|---|---|
| Coffre secrets | `models/IntegratedApi.js`, `utils/credentialVault.js`, `services/integratedApiCredentialService.js`, `seeders/seedIntegratedApisFromEnv.js`, `scripts/rotateCredentialVaultKey.js` | Credentials tiers chiffrés AES-256-GCM, contrat `getCredential` fail-loud, rotation |
| Paiements | `controllers/stripeController.js`, `utils/stripeDevClient.js`, `controllers/devWebhookController.js`, `controllers/contractController.js`, `services/refundExecutionService.js`, `services/stripeInvoiceService.js`, `controllers/invoiceController.js`, `controllers/salesController.js` | Stripe Institut + Dev via coffre |
| Communication | `services/mailService.js`, `models/SendLog.js`, `services/sendLogService.js`, `controllers/brevoWebhookController.js`, `routers/brevoWebhookRouter.js` | Email Brevo + observabilité |
| Event system | `constants/eventCatalog.js`, `models/EventLog.js`, `services/eventBusService.js` | Bus d'événements (audit) |
| Diagnostic dev | `controllers/devDiagnosticController.js`, `routers/devDiagnosticRouter.js` | `/api/gestion/dev/send-logs`, `/events` |

## 3. Flux Stripe (paiement)

```
Client → checkout → Stripe (PaymentIntent)
  clé secrète = getCredential('stripe-institut', {role:'secret_key'})  (coffre, fallback .env)
Stripe → POST /api/stripe/webhook (raw body)
  webhook_secret = getCredential('stripe-institut', {role:'webhook_secret'})
  constructEvent(raw, sig, secret)  ── signature inchangée
  → persistSale (idempotence: index unique partiel stripePaymentIntentId)
  → runPostSaleSideEffects → void sendSaleEmail(sale)
Contrat (compte Dev) : /api/stripe/dev-webhook → handleDevWebhook
  client = getStripeDevClient() (lazy, coffre 'stripe-dev/secret_key')
```

## 4. Flux Brevo (email + engagement)

```
sendXEmail(...) → postToBrevo(payload, context?)
  ├─ createQueuedSendLog → SendLog{status:queued}  + emit email.queued
  ├─ api_key = getCredential('brevo', {role:'api_key'})
  ├─ fetch https://api.brevo.com/v3/smtp/email
  │     ok   → SendLog{sent, providerMessageId} + emit email.sent
  │     !ok  → SendLog{failed, errorCode}        + emit email.failed
  └─ (jamais l'email en clair ; recipientHash SHA-256)
Brevo → POST /api/webhooks/brevo  (delivered/opened/hard_bounce/soft_bounce)
  applyBrevoEvent(messageId) → SendLog{delivered|opened|bounced} + emit email.delivered/opened/bounced
  protection: secret partagé optionnel (x-brevo-secret / ?secret=)
```

## 5. Flux EventBus / SendLog → events

```
emitEvent(name, payload, options)
  ├─ persiste TOUJOURS EventLog (best-effort, ne throw jamais ; payloadSafe redacté)
  └─ publishToSubscribers (in-process ; un échec subscriber ne casse rien)
SendLog transitions → email.queued/sent/failed/delivered/opened/bounced
  payload sûr: {sendLogId, provider, templateKey, contextType, contextId, status}
contextType auto-dérivé du tag ; contextId explicite pour sale + booking_confirmed
V1: BROADCAST D'AUDIT — aucun déclencheur automatique ; seuls email.* émis réellement.
Diagnostic dev: GET /api/gestion/dev/events (requireStrictDev)
```

## 6. Dépendances externes

| Service | Usage | Credentials (coffre) | Webhook |
|---|---|---|---|
| **Stripe Institut** | paiements formations/produits | `stripe-institut/{secret_key,publishable_key,webhook_secret}` | `/api/stripe/webhook` (HMAC) |
| **Stripe Dev** | contrat (lancement + mensualités) | `stripe-dev/{...}` | `/api/stripe/dev-webhook` (HMAC) |
| **Brevo** | emails transactionnels + engagement | `brevo/api_key` (+ `webhook_secret` optionnel) | `/api/webhooks/brevo` (secret partagé optionnel, pas de HMAC) |
| **MongoDB** | base (héberge aussi le coffre) | `MONGODB_URI` (.env, bootstrap) | — |

Secrets internes (non-coffre, en `.env`) : `SESSION_SECRET`, `PWD_PEPPER`,
`GIFT_CARD_PASSWORD_SECRET`, `EMAIL_VERIFICATION_SECRET` (durcis par
`requireSecret`). Clé du coffre : `CREDENTIAL_VAULT_KEY` (64 hex, boot bloquant prod).

## 7. Invariants de sécurité

- Secrets tiers chiffrés au repos ; jamais en clair en sortie (4 derniers chars).
- `getCredential` fail-loud ; fallback `.env` seulement si
  `ALLOW_ENV_CREDENTIAL_FALLBACK=true`.
- Webhooks Stripe : signature vérifiée (raw body) ; secret du coffre.
- SendLog/EventLog : jamais d'email complet (hash) ni de secret (redaction).
- Rôles : `client`/`admin`/`dev` ; `requireGestionRole` (admin/dev),
  `requireStrictDev` (dev). Endpoints diagnostic = dev only.

## 8. Roadmap restante

1. Émettre les events métier non-email (`sale.created`, `booking.*`, `refund.*`) — audit.
2. Rattacher les `contextId` restants (refund/commission/gift_card/session).
3. Migrer les notifications in-app derrière le bus (idempotent, sans envoi auto).
4. Versioning des templates email (draft→publish) — backend.
5. **Migration React** → UI IntegratedApi + Studio Email Template.

## 9. Risques restants

- 🔴 Révocation manuelle de l'ancienne clé Stripe live orpheline (rapport 52).
- 🔴 `CREDENTIAL_VAULT_KEY` = clé racine (perte → secrets inaccessibles ; mitigé :
  boot bloquant prod + rotation outillée).
- 🟠 Webhook Brevo non signé en HMAC (secret partagé optionnel + IP allowlist à activer en prod).
- 🟠 Fallback `.env` à garder `false` en prod.
- 🟢 Bus in-process (perte possible au crash) ; `contextId` partiel ; pas de TTL EventLog/SendLog.

## 10. Pour reprendre vite
Lire : cette page (58) + `architecture.md` § « Etat du projet au commit 180054c »
+ `projectContext.json` (`projectStateSnapshot`). Détails par chantier :
rapports 46-56.
