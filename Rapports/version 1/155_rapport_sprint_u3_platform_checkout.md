# 155 — Sprint U3 : UnifiedCheckout pour les paiements plateforme (Stripe Dev)

> Extension du moteur UnifiedCheckout aux paiements **plateforme** (compte Stripe Dev) :
> commission mensuelle, frais de lancement, abonnement — derrière `PLATFORM_CHECKOUT_HOSTED`.
> **Zéro changement métier / payload existant / statut HTTP. Anciens flows Dev conservés en
> fallback. Stripe Institut non touché.** Suite **394 verte** + audits 36 + 20.

## Kinds ajoutés
`commission`, `launch_fee`, `subscription` (en plus des kinds institut U1/U2). `payment.provider`
= **`stripe_dev`** pour ces kinds. Les kinds institut restent inchangés.

## Feature flag — `PLATFORM_CHECKOUT_HOSTED`
`.env.example` : `PLATFORM_CHECKOUT_HOSTED=false`. Helper `unifiedCheckoutConfig.isPlatformCheckoutHostedEnabled()`.
- **false** → anciens flows Stripe Dev **inchangés** (PaymentIntent / SetupIntent, `clientSecret`).
- **true** → Stripe Checkout **hébergé** (mode payment pour commission/launch, mode setup pour abonnement).

## Commission mensuelle
- false → `createCommissionIntent` inchangé.
- true → après refresh : `netAmountDue=0` → `settled_zero` (inchangé) ; sinon crée un `UnifiedCheckout`
  (kind=commission, idempotencyKey mensuel) + `createDevPaymentCheckoutSession` (line_items=amountToPay,
  `payment_intent_data.metadata.commissionPaymentId` → le **webhook Dev `payment_intent.succeeded`
  EXISTANT finalise** via `finalizeCommissionPaymentById`). `CommissionPayment.stripePaymentIntentId`
  = `session.payment_intent` (polling check-status conservé). Réponse : `{ ok:true, mode:'hosted', url, checkoutId, amountCents }`.

## Frais de lancement contrat
- false → `createLaunchIntent` inchangé.
- true → `UnifiedCheckout` (kind=launch_fee) + Session Dev (mode payment) + `ContractCheckoutIntent{stripePaymentIntentId: session.payment_intent, type:launch}` → le **webhook Dev PI existant** marque `launchFee.paid`. Réponse `{ ok:true, mode:'hosted', url, checkoutId, amountCents }`.

## Abonnement / setup mensuel
- Flow actuel = **SetupIntent + Subscription** (collecte d'un moyen de paiement puis création de la
  Subscription dans `handleSetupIntentSucceeded`).
- true → Stripe Checkout **`mode:'setup'`** (collecte le moyen de paiement sur le customer) +
  `UnifiedCheckout` (kind=subscription) + `ContractCheckoutIntent{stripeSetupIntentId: session.setup_intent,
  type:monthly}` → le **webhook Dev `setup_intent.succeeded` EXISTANT** crée la Subscription (aucune
  refonte de l'abonnement). Réponse `{ ok:true, mode:'hosted', url, checkoutId, customerId }`.

## Webhook Dev
`stripeDevWebhookService` route `checkout.session.completed` → `handleDevCheckoutSessionCompleted`
(réconciliation UnifiedCheckout : `finalized` + lien PI, best-effort). La **finalisation métier**
reste assurée par les handlers EXISTANTS (`payment_intent.succeeded` pour commission/launch ;
`setup_intent.succeeded` pour l'abonnement). Idempotent au replay (finalizeCommissionPaymentById
idempotent ; ContractCheckoutIntent.processed).

## Comportement flag false / true (résumé)
- **false** : aucun UnifiedCheckout créé, payloads/statuts identiques (commission `clientSecret`,
  launch `clientSecret`, monthly `clientSecret`). Prod inchangée.
- **true** : UnifiedCheckout créé + `{ mode:'hosted', url }` ; finalisation via webhooks Dev existants.

## Fichiers créés / modifiés
- **Créé** : `services/stripe/dev/stripeDevHostedCheckoutService.js` ; 5 tests `tests/p1/platform*`.
- **Modifié** : `unifiedCheckoutTypes` (+3 kinds), `unifiedCheckoutConfig` (+flag), `unifiedCheckoutFactory`
  (`createPlatformUnifiedCheckoutRecord`), `commissionPaymentController` (branche commission),
  `stripeDevContractBillingService` (branches launch + monthly), `stripeDevWebhookHandlers`
  (`handleDevCheckoutSessionCompleted`), `stripeDevWebhookService` (route), `.env.example`.

## Tests (+9)
`platformCheckoutFeatureFlag` (commission off/on), `platformCommissionHostedCheckout` (Session + UC +
settled_zero), `platformLaunchFeeHostedCheckout` (Session + UC + ContractCheckoutIntent),
`platformSubscriptionHostedCheckout` (mode setup + UC + ContractCheckoutIntent monthly),
`platformCheckoutWebhookFinalization` (session.completed réconcilie, commission PI finalise, replay
idempotent, metadata inconnue → 200). **394 verts** (p0=44, p1=344, integration=6), audit 36 + 20.

## Limites U3
- Pas de bascule UI (le front Vanilla admin-login/manager consomme encore Elements ; consommer la
  redirection `url` = chantier React Manager R3). Flag **false par défaut** → prod inchangée.
- `payment_intent.succeeded`/`setup_intent.succeeded` ET `checkout.session.completed` coexistent
  (les premiers finalisent, le second réconcilie) — idempotents.
- Stripe Institut (U2) inchangé ; flags indépendants (`CHECKOUT_HOSTED` vs `PLATFORM_CHECKOUT_HOSTED`).

## Impact React Manager
Le Manager (R3) consommera `create-intent` / `create-launch-intent` / `create-monthly-setup` :
flag on → `{ mode:'hosted', url }` → redirection Stripe Checkout (Dev) ; retour via success_url.
L'onboarding contrat (frais de lancement + abonnement) et le paiement des commissions passeront par
des pages Stripe hébergées (UX cohérente avec la vitrine).

## Prochaine mission — React R0
**Setup du monorepo React** (`frontend-react`) : Vite+React+TS, React Router, TanStack Query,
`packages/{api-client,ui,auth,config}`, guards rôle, dictionnaire codes erreur. Puis R1 vitrine →
R2 checkout (consommer la redirection hosted) → R3 manager (onboarding contrat + commissions hosted).
