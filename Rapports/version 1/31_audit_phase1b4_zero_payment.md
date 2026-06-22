# Rapport 31 — Audit ciblé : finalisation des achats 0 € (Phase 1B-4)

- **Date** : 2026-06-23
- **Branche** : `phase-0-security-baseline`
- **Commit de départ** : `b11845d Sync project documentation after V1 stabilization phases`
- **Objet** : auditer pourquoi un achat couvert à 100 % par carte cadeau (ou réellement gratuit, montant final = 0 €) n'est pas finalisé côté serveur, et définir la correction minimale.

---

## 1. Chemins de checkout existants

Tous les achats convergent vers **une seule** fonction de finalisation métier :
`processCheckoutStatePurchase(...)` (export de `controllers/clientController.js`, ligne 2762).

Elle route par type :
- `checkoutState.cart === true` → `processCartCheckoutStatePurchase(...)` (panier multi-articles).
- `item.type === 'service'` → `processServiceCheckoutStatePurchase(...)` (réservation prestation + `createServiceBookingWithProtection`).
- sinon, branches inline : `formation` / `gift-card` (achat d'une carte) / `product`.

Cette fonction est appelée à **deux** endroits aujourd'hui :
1. **Webhook Stripe** `payment_intent.succeeded` (`controllers/stripeController.js:handleWebhook`, appel ligne 1083) — passe `stripePaymentIntentId = paymentIntent.id`, `checkoutState` rechargé depuis `StripeCheckoutIntent`.
2. **`mockPay`** (`clientController.js:1325`), réservé au **non-production** (garde `requireNonProductionMockPayment`, Phase 1A) — chemin de test/dev uniquement.

Effets métier produits par `processCheckoutStatePurchase` (identiques quel que soit l'appelant) :
- création `Sale` via `persistSale(...)` (+ `saleItems`, `consumerWaiverSnapshot`) ;
- création `Purchase` (formation/produit) ou `ServiceBooking` (prestation) ;
- réservation de session présentielle (`reservedCount++`) ;
- débit carte cadeau **atomique** via `finalizeGiftCardUsage` → `deductGiftCardBalance` → `debitGiftCardBalanceAtomic` (Phase 1B-1) ;
- libération de la réservation carte cadeau (`releaseGiftCardReservationsForPaymentIntent`) ;
- commission (`recordCommissionTransactions` + snapshot) ;
- effets post-vente (`runPostSaleSideEffects`) : email de vente, notifications, facture Stripe.

## 2. Moment où Stripe devient obligatoire

Uniquement dans `createCheckoutSession` (`stripeController.js:703`) :
- ligne 834 : `amountToPay = totals.amountToPay || totals.remainingToPay` ;
- ligne 836 : **si `amountCents < 50` → 400 `AMOUNT_TOO_LOW`** (minimum Stripe 0,50 €).

Donc un panier à `remainingToPay === 0 €` **ne peut pas** créer de PaymentIntent. Côté frontend (`purchaseFlowService.finalizePurchase`, rapports 03/06), dès que `paymentProvider === 'stripe'` la branche Stripe est prise et **l'appel backend est sauté**. Résultat : ni `Sale`, ni débit, ni booking. C'est le P0 documenté (`giftcard.zeroPayment.characterization.test.js`, encore `it.todo`).

## 3. Moment où la `Sale` est créée

- Webhook : après `payment_intent.succeeded`, dans `processCheckoutStatePurchase` (via `persistSale`, ou `new Sale()` pour la prestation).
- `persistSale` pose `stripePaymentIntentId` **dès l'insert** (Phase 1B-1) → l'index UNIQUE partiel `uniq_stripe_payment_intent` garantit l'idempotence (E11000 sur webhook concurrent).
- **Pour un achat 0 € : jamais**, car aucun webhook ne se déclenche.

## 4. Moment où la carte cadeau est débitée

- Dans `runPostSaleSideEffects` → `finalizeGiftCardUsage` → `deductGiftCardBalance` → `debitGiftCardBalanceAtomic({ giftCardId, amount })`.
- Débit conditionnel `findOneAndUpdate({ _id, balance: { $gte: amount } }, pipeline)` : **solde jamais négatif**, perdant de course → `GIFT_CARD_BALANCE_INSUFFICIENT`.
- `planGiftCardUsage` plafonne l'usage : `useAmount = min(desired, available, remaining)` → un solde > montant ne débite que le montant dû (Cas B).
- **Pour un achat 0 € : jamais** (post-effets jamais atteints).

## 5. Moment où le booking est créé

- Prestation : `processServiceCheckoutStatePurchase` → `createServiceBookingWithProtection({ bookingData, service })` (verrous `BookingSlotLock` minute par minute, revalidation `assertServiceSlotBookable` — Phase 1B-3), puis `Sale` liée par `saleId`.
- **Pour une prestation 100 % carte cadeau : jamais** (pas de webhook).

## 6. Pourquoi le scénario 0 € ne fonctionne pas

**Cause racine** : il n'existe **aucun point d'entrée backend de finalisation hors-Stripe en production**.
- Le seul déclencheur de production est le webhook Stripe, qui exige un PaymentIntent ≥ 0,50 €.
- `mockPay` (qui finalise bien un achat carte cadeau) est **bloqué en production** depuis la Phase 1A.
- Le frontend, voyant `paymentProvider === 'stripe'`, n'appelle pas le backend à 0 €.

Ce n'est **pas** un défaut de la logique de finalisation (elle est complète et correcte) : c'est l'**absence d'un appelant** pour le cas 0 €.

## 7. Correction minimale recommandée

**Ne pas dupliquer la logique métier.** Réutiliser `processCheckoutStatePurchase` (= `finalizeCheckoutPurchase`) tel quel.

1. **Nouvel endpoint de production** `POST /api/client/checkout/finalize-free`
   (`requireAuth` + `requireSiteActiveForPurchases`) → nouveau handler `finalizeFreeCheckout` dans `clientController.js`.
2. Le handler appelle `processCheckoutStatePurchase({ ..., checkoutState, requireZeroRemaining: true, stripePaymentIntentId: freeRef, stripeSessionId: freeRef })`.
3. **Garde anti-bypass** : ajouter un paramètre `requireZeroRemaining` à `processCheckoutStatePurchase` / `processCart...` / `processService...`. Après `planGiftCardUsage`, si le **reste réel** (prix catalogue − couverture carte réelle) `> 0` → throw `402 PAYMENT_REQUIRED`. Impossible donc de finaliser gratuitement un achat partiellement payé.
4. **Idempotence** : réutiliser l'index UNIQUE partiel Phase 1B-1 en passant une référence synthétique déterministe `freeRef = "free_<idempotencyKey>"` dans `stripePaymentIntentId`. Double soumission → E11000 → réponse idempotente (une seule `Sale`, un seul débit).
5. **Hygiène job frais Stripe** : exclure les références `free_*` de `STRIPE_FEE_PENDING_QUERY` (une commande 0 € n'a pas de frais Stripe à récupérer).
6. **Débit carte cadeau** : aucun changement — `debitGiftCardBalanceAtomic` (Phase 1B-1) est déjà réutilisé via `finalizeGiftCardUsage`. Pas de réservation préalable nécessaire (finalisation synchrone), `planGiftCardUsage` lit le solde disponible réel.

Aucun second flow métier ; un seul nouvel **appelant** + une **garde** + une **clé d'idempotence**.
