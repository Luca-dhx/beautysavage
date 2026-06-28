# 128 — Sprint F2B : extraction Stripe Dev / plateforme

> Le domaine Stripe **Dev / plateforme** (`platform_billing`) est extrait vers
> `services/stripe/dev/`. **Zéro changement fonctionnel / contrat API / statut HTTP / payload /
> commission / contrat / paiement client institut.** Suite **338 verte** + audits 36 + 20.

## Contrôleurs — avant / après
| Fichier | Avant | Après | Note |
|---|---|---|---|
| `controllers/devWebhookController.js` | 271 | **13** | Délégateur mince (webhook entièrement extrait) |
| `controllers/commissionPaymentController.js` | 581 | **463** | Facture + création PI commission extraites |
| `controllers/contractController.js` | 1098 | 1098 | Inchangé (client via shim → config) — billing reporté F3 |
| `utils/stripeDevClient.js` | 36 | **7** | Shim → config service |

## Services créés (`services/stripe/dev/`)
| Module | Contenu | Rôle |
|---|---|---|
| `stripeDevConfigService.js` | `getStripeDevClient` (impl), `getStripeDevPublishableKey`, `getStripeDevWebhookSecret`, `getStripeDevAccountPurpose` | Client + credentials compte Dev. Source unique. |
| `stripeDevInvoiceService.js` | `generateCommissionInvoice` | Facture Stripe Dev officielle des commissions (verbatim). |
| `stripeDevPaymentService.js` | `createCommissionPaymentIntent` | Création PaymentIntent commission (metadata + idempotencyKey identiques). |
| `stripeDevWebhookHandlers.js` | 6 handlers (`payment_intent.succeeded`, `setup_intent.succeeded`, `invoice.payment_succeeded/failed`, `customer.subscription.updated/deleted`) | Verbatim. |
| `stripeDevWebhookService.js` | `handleDevWebhookFromRequest` | Secret + `constructEvent` + routing. |
| `stripeDevResponseMapper.js` | `send(res, { status, json })` | Mapping réponse HTTP identique. |

## Responsabilités déplacées
- Client Dev + credentials (secret/publishable/webhook) + accountPurpose → `stripeDevConfigService`.
- Webhook Dev (signature/routing + 6 handlers contrat/abonnement/commission) → `stripeDevWebhookService` + `stripeDevWebhookHandlers`.
- Facture commission officielle → `stripeDevInvoiceService`.
- Création PaymentIntent commission → `stripeDevPaymentService`.
- `utils/stripeDevClient.js` → shim re-exportant `getStripeDevClient` du config service.

## Comportement inchangé — preuves
- **Déplacement verbatim** des corps ; le webhook renvoie un résultat `{ status, json }` mappé à
  l'identique (200 received, 400 signature, 500 config/client/erreur).
- **Compatibilité tests** : `utils/stripeDevClient` reste l'accesseur mockable (shim) ; les
  services accédant au client l'importent du shim → les mocks existants
  (`commissionDevWebhookFinalization`, `commissionPaymentIdempotence`, `commissionPaymentRefresh`)
  interceptent sans modification.
- **Tests de caractérisation** (`stripeDevExtractionParity` +5, `stripeDevWebhookExtractionParity`
  +4) : identité référentielle (shim === config), délégateur, publishable key inchangée,
  accountPurpose, signature→400, client absent→500, event non géré→200, aucun secret exposé.

## accountPurpose (Partie 5)
- `models/IntegratedApi` : enum `customer_payments | platform_billing | messaging` (défaut null).
- `seeders/seedIntegratedApisFromEnv` assigne DÉJÀ : `stripe-institut→customer_payments`,
  `stripe-dev→platform_billing`, `brevo→messaging`, avec **backfill idempotent** des documents
  legacy sans valeur. → garde respectée sans changement de flux.
- `getStripeDevAccountPurpose()` (lecture seule) ajouté pour validation/observabilité ; renvoie
  `null` en legacy non backfillé **sans bloquer** aucun flux (le client reste résolu par slug
  `stripe-dev`, fallback .env autorisé en migration via `integratedApiCredentialService`).
- Tests : `stripe-dev→platform_billing`, `institut→customer_payments`, `brevo→messaging`, legacy→null.

## Imports / dépendances (Partie 6)
- Lectures `STRIPE_DEV_*` en `.env` : uniquement dans `integratedApiCredentialService` (map de
  fallback contrôlée) + seed + tests/doc. Aucune dans les contrôleurs.
- `utils/stripeDevClient` = shim (pas supprimé, pour préserver les mocks de test).
- Pas de dépendance circulaire (chargement de tous les modules vérifié) :
  `devWebhookController → webhookService → {webhookHandlers → commissionPaymentController →
  {invoiceService, paymentService}, config}` ; aucun retour vers le webhook.
- `npm run lint` : aucun script lint (absence documentée, déjà noté F1/F2).

## Tests exécutés
- `npm test` → **338 passed** (p0=44, p1=288, integration=6) — dont parity Dev (+9).
- `npm run audit:business-scenarios` → **36 passed**.
- `npm run audit:commissions` → **20 passed**.

## Dette restante
- **Facturation contrat** (`contractController`, 1098 l) : machine à états contrat (launch fee,
  setup mensuel, subscriptions, sync, cancel) toujours intriquée avec le client Dev (importé via
  le shim). Extraction complète vers `stripeDevContractBillingService` **reportée (F3)** — haut
  risque sans tests de caractérisation contrat dédiés.
- `createCommissionIntent`/`checkCommissionStatus` : orchestration (refresh/verrou/idempotence)
  conservée ; `paymentIntents.retrieve/cancel` restent des appels directs via le shim.
- Split interne de `mailService` (rapport 122) toujours en attente.

## Recommandation Sprint F3
1. **Tests de caractérisation contrat** (launch/monthly/cancel/sync) PUIS extraction de
   `stripeDevContractBillingService` (PaymentIntent launch, SetupIntent mensuel, subscription/
   customer ops) hors de `contractController`.
2. **Split de `mailService`** (mailTemplateRuntime / mailContextResolver / mailBrevoGateway /
   mailTrackingService) derrière `mailDispatcher` (seam E2).
