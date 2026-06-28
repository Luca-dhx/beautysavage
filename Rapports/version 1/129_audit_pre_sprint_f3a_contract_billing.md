# 129 — Audit pré-Sprint F3A : facturation contrat

> Cartographie de `controllers/contractController.js` (1098 l) avant extraction du domaine
> facturation contrat (frais de lancement, abonnement mensuel, sync, annulation). Caractérisation
> verrouillée AVANT toute extraction (`tests/p1/contractBillingCharacterization.test.js`, 11 verts).

## Fonctions & endpoints
| Fonction | Endpoint | Stripe Dev ? |
|---|---|---|
| `getStripeDevConfig` | GET /stripe-dev-config (public) | publishable key (getCredential) |
| `getContractStatus` | GET /status (public) | non |
| `getPendingInfo` | GET /pending-info | via computeResumeSlide→sync |
| `downloadContractFile` | POST /download-file | non |
| `createLaunchIntent` | POST /create-launch-intent | **paymentIntents.retrieve/create** |
| `createMonthlySetup` | POST /create-monthly-setup | **customers.create, setupIntents.retrieve/create** |
| `activateFreeContract` | POST /activate-free | délègue à activateContract |
| `createContract` | POST / | non (upload fichier) |
| `deleteContract` / `updateGracePeriod` / `updatePendingMessage` / `getContractHistory` | divers | non |
| `syncStripeStatuses(contract)` | — (job + interne) | **paymentIntents.retrieve, subscriptions.retrieve** |
| `checkPaymentStatus` | GET /check-payment-status | via sync |
| `verifyLaunchPayment` | POST /verify-launch-payment | **paymentIntents.retrieve** |
| `verifyMonthlySetup` | POST /verify-monthly-setup | **setupIntents.retrieve** |
| `activateContract` | POST /activate | via sync (+ computeLockedUntil) |
| `getCurrentContract` | GET /current | non |
| `cancelContract` | POST /cancel | **subscriptions.update** |
| `cancelImmediate` | POST /cancel-immediate (non-prod) | **subscriptions.cancel** |
| `uploadTempFile` / `deleteTempFile` / `getActiveContract` | divers | non |
| Helpers : `contractAmountTtcCents`, `resolveAbsolutePath`, `toResponseContract`, `ensureNoActiveOrPending`, `computeResumeSlide`, `respondError` | — | — |

## Dépendances
- `routers/contractRouter.js` importe les handlers HTTP (signature `(req,res)`).
- `automatisme/contractPaymentSyncJob.js` importe `syncStripeStatuses` (boucle de sync).
- `utils/stripeDevClient` (shim → `stripeDevConfigService`) ; `ContractCheckoutIntent` ;
  `invalidateContractCache` (contractGuard) ; `getCredential`.

## Liens Stripe Dev (raw)
`paymentIntents.retrieve/create` (launch), `customers.create` + `setupIntents.retrieve/create`
(monthly), `subscriptions.retrieve` (sync), `subscriptions.update` (cancel period-end),
`subscriptions.cancel` (immediate). Tous via `getStripeDevClient()` (compte `stripe-dev` /
platform_billing). Garde « client optionnel » : si `null` → 500 `Client Stripe Developer non
configuré.` (payload SANS champ `code` — à préserver exactement).

## Tests couvrants (caractérisation, 11)
config, createLaunch (+409 déjà payé), createMonthly, verifyLaunch, verifyMonthly,
checkPaymentStatus (steps), activate (+lockedUntil null), cancel (period-end vs immédiat), sync.

## Tests manquants / difficiles
- `createContract` (upload multipart) : non couvert (dépend de multer/fichier) — documenté.
- `handleSetupIntentSucceeded`/abonnement complet : couvert côté webhook (F2B), pas ici.

## Risques
- 🔴 Payload exact du **client absent** (500 sans `code`) ≠ `respondError` (qui ajoute `code`).
  → le service doit renvoyer ce payload tel quel.
- 🟡 `syncStripeStatuses` mute + save le doc Contract passé ; importée par le job → déplacer en
  service partagé, repointer le job.
- 🟡 `activateContract`/`checkPaymentStatus` n'ont PAS d'appel Stripe brut (passent par sync) →
  restent des handlers minces dans le contrôleur.

## Architecture cible
```
services/contract/contractStateService.js       contractAmountTtcCents, computeLockedUntil (purs)
services/contract/contractResponseMapper.js      toResponseContract + send(res,{status,json})
services/stripe/dev/stripeDevContractSyncService  syncStripeStatuses(contract)
services/stripe/dev/stripeDevContractBillingService  createLaunchIntent/createMonthlySetup/
                                                   verifyLaunchPayment/verifyMonthlySetup/
                                                   cancelContract/cancelImmediate → {status,json}
```
Le contrôleur délègue : handlers raw-Stripe → billing service (via response mapper) ; `syncStripeStatuses`
→ sync service ; `getStripeDevConfig` → `stripeDevConfigService.getStripeDevPublishableKey` ;
`toResponseContract` → response mapper ; `contractAmountTtcCents`/`computeLockedUntil` → state service.
`activateContract`/`checkPaymentStatus`/`computeResumeSlide` restent (sans Stripe brut).

## Plan d'extraction
1. `contractStateService` (purs) + `contractResponseMapper` (toResponseContract).
2. `stripeDevContractSyncService` (syncStripeStatuses) + repointer le job.
3. `stripeDevContractBillingService` (6 handlers → {status,json}) + repointer le contrôleur.
4. Vérifier : aucun `paymentIntents.*`/`subscriptions.*`/`setupIntents.*`/`getStripeDevClient` dans le contrôleur.
