# 144 — Roadmap du moteur UnifiedCheckout

> Plan d'implémentation (future mission) d'un moteur de checkout unique pour TOUS les paiements.
> Documentation uniquement ici. Principe directeur : **un seul pipeline, des "kinds" pluggables,
> Stripe Checkout hébergé pour montant > 0, finalize-free pour 0 €, finalizers existants réutilisés.**

## Flux cible
```
createUnifiedCheckout(kind, payload)
  → résolution du "kind" (service|formation|product|gift_card|cart|deposit|commission|launch_fee|subscription)
  → pricing serveur (montant à charger = source unique)
  → consentements légaux (selon kind)
  → moyens de paiement (carte cadeau réservée → reste dû)
  → si reste > 0 : Stripe Checkout Session hébergée (compte Institut ou Dev selon kind)
     sinon (0 €)  : finalize-free (finalisation immédiate)
  → webhook Stripe (checkout.session.completed / payment_intent.succeeded / setup_intent.succeeded)
  → finalize(checkoutId) → finalizer métier du kind
```

## Architecture proposée (`services/checkout/unified/`)
| Module | Rôle |
|---|---|
| `unifiedCheckoutService.js` | `createCheckout({kind, context})` → `{ checkoutId, mode:'hosted'|'free', url?|saleId }`. Orchestre pricing → legal → moyens de paiement → routing hosted/free. |
| `checkoutKindRegistry.js` | Registre des "kinds" : chaque kind déclare `{ account:'institut'|'dev', resolvePricing, requiredConsents, buildStripeSession, finalize }`. |
| `checkoutAccountRouter.js` | Sélection du compte Stripe (`stripeConfigService` vs `stripe/dev/stripeDevConfigService`) selon `kind.account`. |
| `UnifiedCheckout` (modèle) | Persistance : `kind`, `account`, `actorId`, `pricingSnapshot`, `consents`, `giftCardPlan`, `stripeSessionId`, `status:created|pending|completed|failed`, `finalizerRef`. Remplace progressivement `StripeCheckoutIntent`/`ContractCheckoutIntent`. |
| `unifiedCheckoutWebhook.js` | Point d'entrée webhook commun → `finalize(checkoutId)` → délègue au finalizer du kind. |

## Kinds & mapping vers finalizers EXISTANTS (réutilisation, zéro réécriture métier)
| Kind | Compte | Pricing | Consents | Finalizer existant |
|---|---|---|---|---|
| `formation` / `product` / `gift_card` / `service` / `cart` | Institut | `buildServerCheckoutPricing` | A1 (CGV/waiver) + A7 | `checkoutFacade.processCheckoutStatePurchase` / `processServiceCheckoutStatePurchase` |
| `deposit` (prestation acompte) | Institut | pricing + acompte | A1 + A7 | `processServiceCheckoutStatePurchase` (deposit) |
| `commission` | Dev | `commissionPaymentService` (refresh montant) | — | `commissionPaymentController.finalizeCommissionPaymentById` |
| `launch_fee` | Dev | `contractAmountTtcCents(launchFee)` | acceptation contrat | `stripeDevWebhookHandlers.handlePaymentIntentSucceeded` (launch) |
| `subscription` | Dev | `monthlyFee` TTC | acceptation contrat | `handleSetupIntentSucceeded` (SetupIntent + Subscription) |

> Note : `subscription` reste SetupIntent+Subscription (récurrent) — le moteur unifié l'expose comme un kind à part (mode `setup` plutôt que `hosted` one-shot).

## Migration Stripe Elements → Checkout hébergé
- **Aujourd'hui** : `paymentIntents.create` + `client_secret` rendu via Elements (vitrine + admin-login).
- **Cible** : `stripe.checkout.sessions.create({ mode:'payment', line_items, success_url, cancel_url, metadata:{checkoutId}, payment_intent_data:{metadata} })` → renvoie `url` (redirection). Pour l'abonnement : `mode:'subscription'`.
- **Finalisation** : écouter `checkout.session.completed` (+ garder `payment_intent.succeeded` pour compat) → résoudre `checkoutId` (metadata) → `finalize`.
- **Carte cadeau** : réserver AVANT la session (montant `line_items` = serveur après cartes cadeaux) ; libérer la réservation sur `checkout.session.expired`/cancel.
- **0 €** : pas de session → `finalize-free` direct (inchangé).
- **Avantages** : SCA/3DS géré par Stripe, moins de surface PCI front, UI hébergée cohérente, mobile-friendly, moins de code Elements à porter en React.

## Étapes d'implémentation (ordre, chacune testée — caractérisation d'abord)
1. **Modèle `UnifiedCheckout` + registry** (sans brancher les flux) — seams.
2. **Kind `formation/product/gift_card/cart`** via Checkout hébergé Institut, finalizer = `processCheckoutStatePurchase`. Tests de parité avec le flux Elements actuel (mêmes Sale/effets).
3. **Kind `service`/`deposit`** (Institut) → `processServiceCheckoutStatePurchase`.
4. **Webhook unifié** Institut (`checkout.session.completed` + fallback `payment_intent.succeeded`).
5. **Kinds Dev** : `commission`, `launch_fee` (hosted), `subscription` (setup) → finalizers Dev existants. Webhook Dev unifié.
6. **Bascule UI** : create-checkout-session renvoie une `url` (redirection) au lieu d'un `clientSecret` ; React consomme la redirection. Garder l'ancien endpoint en parallèle (feature flag `CHECKOUT_HOSTED`) pour rollback.
7. **Dépréciation** : `StripeCheckoutIntent`/`ContractCheckoutIntent` migrés vers `UnifiedCheckout` (compat DB, finalizers inchangés).

## Garde-fous (zéro régression)
- Réutiliser les **finalizers existants** (couverts par 353 tests) ; ne PAS réécrire la logique métier.
- Idempotence : conserver l'index unique `Sale.stripePaymentIntentId` + ajouter `UnifiedCheckout.stripeSessionId` unique.
- Feature flag par kind → bascule progressive + rollback (Elements reste dispo tant que `CHECKOUT_HOSTED` off).
- Tests de caractérisation AVANT chaque kind (parité Sale/booking/commission/contrat).

## Compatibilité React
- React consomme `createUnifiedCheckout` → reçoit `{ mode:'hosted', url }` (redirection Stripe) ou `{ mode:'free', saleId }`. Un **seul** appel front pour tous les paiements > 0. Le résultat revient via `success_url` → `/api/stripe/payment-result` (inchangé).
