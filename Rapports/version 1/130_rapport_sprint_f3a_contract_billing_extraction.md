# 130 — Sprint F3A : extraction facturation contrat

> Le domaine facturation contrat (frais de lancement, abonnement mensuel, sync, annulation)
> est extrait de `contractController` vers `services/stripe/dev/*` + `services/contract/*`.
> **Zéro changement fonctionnel / contrat API / statut HTTP / payload / commission / Stripe
> Institut.** Suite **349 verte** + audits 36 + 20.

## contractController — avant / après
| | Lignes |
|---|---|
| Avant (HEAD 5d5dd54) | **1098** |
| Après | **687** |
| Réduction | **−411 (~37 %)** |

Le contrôleur ne contient PLUS aucun appel Stripe Dev brut (`paymentIntents.*`,
`setupIntents.*`, `subscriptions.*`, `customers.create`, `getStripeDevClient`). Les 6 handlers
de facturation sont des délégateurs ; il conserve l'orchestration non-Stripe (création/upload
contrat, statut, activation, grace period…).

## Services créés
| Module | Contenu | Rôle |
|---|---|---|
| `services/contract/contractStateService.js` | `contractAmountTtcCents`, `computeLockedUntil` | Calculs purs (montant TTC, date de blocage). |
| `services/contract/contractResponseMapper.js` | `toResponseContract`, `send(res,{status,json})` | Payload public + mapping HTTP. |
| `services/stripe/dev/stripeDevContractSyncService.js` | `syncStripeStatuses(contract)` | Sync statuts Stripe Dev (PI launch + subscription). |
| `services/stripe/dev/stripeDevContractBillingService.js` | `createLaunchIntent`, `createMonthlySetup`, `verifyLaunchPayment`, `verifyMonthlySetup`, `cancelContract`, `cancelImmediate` → `{status,json}` | Facturation Stripe Dev contrat (PI launch, SetupIntent mensuel, vérifs, annulation). |

## Endpoints couverts (délégateurs)
`POST /create-launch-intent`, `POST /create-monthly-setup`, `POST /verify-launch-payment`,
`POST /verify-monthly-setup`, `POST /cancel`, `POST /cancel-immediate`. `GET /stripe-dev-config`
utilise `stripeDevConfigService.getStripeDevPublishableKey`. `syncStripeStatuses` (job + interne)
vient du service de sync. `activateContract` utilise `computeLockedUntil`.

## Responsabilités déplacées
- Calculs montant TTC / date de blocage → `contractStateService`.
- Payload public `toResponseContract` → `contractResponseMapper`.
- Sync statuts Stripe Dev → `stripeDevContractSyncService` (importé par le contrôleur ET le job
  `contractPaymentSyncJob`, repointé).
- Facturation Stripe Dev (launch/monthly/verify/cancel) → `stripeDevContractBillingService`.

## Comportement inchangé — preuves
- **Caractérisation d'abord** (`tests/p1/contractBillingCharacterization.test.js`, 11 probes
  écrites AVANT extraction, vertes AVANT et APRÈS) : config, createLaunch (+409 déjà payé),
  createMonthly, verifyLaunch, verifyMonthly, checkPaymentStatus (steps), activate (+lockedUntil
  null en anytime), cancel (period-end vs immédiat), sync.
- **Déplacement verbatim** ; `res.status().json()` → `{ status, json }` mappé à l'identique. La
  garde « client absent » → 500 « Client Stripe Developer non configuré. » (SANS champ `code`)
  préservée exactement ; les catch reproduisent `respondError` (`{ ok, code, error }`).
- Le client Dev provient du shim `utils/stripeDevClient` → les mocks de test existants
  interceptent les services sans modification.

## accountPurpose
Inchangé depuis F2B : le compte `stripe-dev` (platform_billing) reste résolu par
`stripeDevConfigService` ; aucune dépendance Stripe Institut touchée.

## Imports / dépendances (Partie 5)
- `git grep "paymentIntents.create|paymentIntents.retrieve|stripeDev|STRIPE_DEV"
  controllers/contractController.js` → **aucune occurrence**.
- Imports orphelins retirés du contrôleur : `mongoose`, `getStripeDevClient`, `getCredential`.
- Pas de dépendance circulaire (chargement vérifié) : `contractController →
  {billingService, syncService, stateService, responseMapper, configService}` ; billing/sync →
  shim + models. `contractPaymentSyncJob → syncService`.
- `npm run lint` : aucun script lint (absence documentée).

## Tests exécutés
- `npm test` → **349 passed** (p0=44, p1=299, integration=6) — dont caractérisation contrat (+11).
- `npm run audit:business-scenarios` → **36 passed**.
- `npm run audit:commissions` → **20 passed**.

## Dette restante
- `createContract` (upload multipart) + `deleteContract`/`getContractHistory`/upload temp :
  orchestration non-Stripe conservée dans le contrôleur (hors périmètre).
- `stripeDevContractBillingService` regroupe encore l'orchestration billing + transitions
  (cancel mute le statut) ; une séparation billing/état plus fine reste possible (faible valeur).
- Split interne de `mailService` (rapport 122) toujours en attente.

## Recommandation Sprint F3B
**Split de `mailService`** (~3845 l) derrière le seam `mailDispatcher` (E2) :
`mailTemplateRuntime` (loadTemplate/saveTemplate/render), `mailBrevoGateway` (postToBrevo),
`mailTrackingService` (SendLog), `mailContextResolver`. Précéder de tests de caractérisation
(rendu template + envoi Brevo mockés). C'est le dernier monolithe backend identifié (rapport 120).
