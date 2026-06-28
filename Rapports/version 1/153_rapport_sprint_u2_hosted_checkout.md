# 153 — Sprint U2 : UnifiedCheckout câblé + Stripe Checkout hébergé

> Câblage du moteur **UnifiedCheckout** sur le checkout client réel + introduction de **Stripe
> Checkout hébergé** derrière le feature flag `CHECKOUT_HOSTED`. **Elements reste le fallback
> (flag off). Aucun changement de prix / finalisation métier / remboursement / booking.** Suite
> **385 verte** + audits 36 + 20.

## Feature flag — `CHECKOUT_HOSTED`
`.env.example` : `CHECKOUT_HOSTED=false` (défaut). Helper `services/checkout/unified/unifiedCheckoutConfig.js`
`isCheckoutHostedEnabled()` (lu à l'exécution → rollback immédiat).
- **false** → Stripe Elements actuel **inchangé** (PaymentIntent + `clientSecret`).
- **true** → Stripe Checkout **hébergé** (redirection `url`).
- **0 €** → toujours `finalize-free` (jamais Stripe), quel que soit le flag.

## Comportement `CHECKOUT_HOSTED=false` (fallback)
`createCheckoutSession` : validation + pricing serveur (inchangés) → `paymentIntents.create` →
`{ ok:true, clientSecret, returnUrl }`. **Byte-identique à avant.** Aucun UnifiedCheckout créé.

## Comportement `CHECKOUT_HOSTED=true`
`createCheckoutSession` : validation + pricing serveur (inchangés), puis `createHostedCheckoutResult` :
- **amountToPay = 0** → crée un UnifiedCheckout (`free_ready`) → `{ ok:true, mode:'free', checkoutId, requiresPayment:false }` (aucune Session Stripe ; le client appelle `finalize-free`).
- **amountToPay > 0** (< 0,50 € → `AMOUNT_TOO_LOW`) →
  1. persiste `StripeCheckoutIntent` (checkoutState complet) ;
  2. crée un `UnifiedCheckout` (`payment_pending`, idempotencyKey = StripeCheckoutIntent._id) ;
  3. `stripe.checkout.sessions.create({ mode:'payment', line_items:[{ unit_amount: amountCents }], payment_intent_data:{ metadata:{ intentId } }, metadata:{ unifiedCheckoutId, checkoutId, kind, idempotencyKey }, success_url, cancel_url })` ;
  4. réserve les cartes cadeaux par `session.payment_intent` (PI) — **identique au flux Elements** ;
  5. `StripeCheckoutIntent.stripeSessionId = PI` (le webhook PI le retrouve) ;
  6. lie le PI/Session à l'UnifiedCheckout ;
  7. retourne `{ ok:true, mode:'hosted', checkoutId, url }`.

**Carte cadeau JAMAIS un discount Stripe** : `line_items.unit_amount = amountToPay` (catalogue −
promo − carte cadeau, calculé serveur). Stripe n'encaisse que le reste dû. La carte cadeau reste
dans le `pricingSnapshot` (moyen de paiement).

## Flow 0 €
Inchangé : `finalize-free` (idempotence `free_<key>`, reçu interne non fiscal pour 100 % carte
cadeau). En flag on, un `UnifiedCheckout` **shadow** (`finalized`) est enregistré best-effort
(try/catch, **payload public inchangé**).

## Flow carte cadeau
- **100 %** : amountToPay = 0 → `mode:'free'` → `finalize-free` → reçu interne non fiscal (D2), aucun Stripe.
- **partielle** : amountToPay = reste → Session Stripe hébergée pour le reste (réservation par PI), facture officielle = Stripe.

## Webhook hébergé
`stripeWebhookService` route `checkout.session.completed` → `handleCheckoutSessionCompletedEvent` :
- retrouve l'`UnifiedCheckout` par `metadata.unifiedCheckoutId` ;
- **idempotence** : si une Sale existe déjà pour le PI (replay, ou webhook `payment_intent.succeeded`
  déjà passé) → réconcilie l'UC + `received:true` (aucune double vente) ;
- sinon → `finalizeUnifiedCheckout` (charge le checkoutState du `StripeCheckoutIntent`, **délègue à
  `processCheckoutStatePurchase`** — finaliseur EXISTANT, aucune logique dupliquée) → marque l'UC `finalized`.
- Le webhook **`payment_intent.succeeded` existant reste inchangé** et finalise aussi (le PI hébergé
  porte `metadata.intentId`) ; les deux chemins sont idempotents (index PI unique + pré-check Sale).

## Facture Stripe / reçus non fiscaux
Inchangés (D2) : facture officielle = Stripe (compte Institut) pour montant > 0 ; reçu interne
**non fiscal** (`gift_card_usage_receipt`) pour 100 % carte cadeau ; pas de facture pour 0 € Stripe.

## Fichiers créés / modifiés
- **Créé** : `services/checkout/unified/unifiedCheckoutConfig.js` ; 5 tests `tests/p1/hostedCheckout*` + `unifiedCheckoutLiveWiring`.
- **Modifié** : `services/stripe/stripeCheckoutService.js` (branche hosted + `createHostedCheckoutResult`),
  `services/stripe/stripeWebhookService.js` (route session.completed), `services/stripe/stripeWebhookEventHandlers.js`
  (`handleCheckoutSessionCompletedEvent` + pré-check idempotent), `services/checkout/unified/unifiedCheckoutFactory.js`
  (`createUnifiedCheckoutRecord` sans re-pricing/validation), `services/checkout/checkoutFacade.js` (shadow UC 0 € gated),
  `.env.example` (`CHECKOUT_HOSTED=false`).

## Tests (+11)
`hostedCheckoutFeatureFlag` (flag off clientSecret / on url, aucun secret), `hostedCheckoutSessionCreation`
(line_items=amountToPay, metadata checkoutId, UC payment_pending), `hostedCheckoutGiftCardZero` (100 % → free,
partielle → Session 30 €), `hostedCheckoutWebhookFinalization` (finalise + replay idempotent + metadata inconnue),
`unifiedCheckoutLiveWiring` (flag off aucun UC / on UC créé, finalize-free intact).
**Validation** : `npm test` 385 verts (p0=44, p1=335, integration=6), audit business 36, audit commissions 20. 0 todo, 0 expected-fail.

## Limites U2
- **Pas de bascule UI** : `create-checkout-session` peut renvoyer `url` (hosted) au lieu de `clientSecret`,
  mais le front Vanilla consomme encore Elements. La consommation de `url` (redirection) côté front =
  chantier React/UI (hors périmètre U2). Le flag reste **false en défaut** → prod inchangée.
- Kinds plateforme (commission/frais de lancement/abonnement) non unifiés (U3).
- `payment_intent.succeeded` ET `checkout.session.completed` finalisent tous deux (idempotents) :
  une optimisation future pourrait n'en garder qu'un.

## Prochaine mission — U3
**Unifier les kinds plateforme** (compte Dev) : commission mensuelle, frais de lancement, abonnement
contrat → kinds UnifiedCheckout (`commission`, `launch_fee`, `subscription`) via Stripe Checkout/Setup
hébergé, finalizers Dev existants réutilisés, feature flag dédié + parité. Puis bascule UI React (R2).
