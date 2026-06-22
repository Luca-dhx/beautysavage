# Rapport 32 — Phase 1B-4 : finalisation des achats 0 € (100 % carte cadeau / gratuité)

- **Date** : 2026-06-23
- **Branche** : `phase-0-security-baseline`
- **Commit de départ** : `b11845d Sync project documentation after V1 stabilization phases`

---

## 1. Objectif

Fermer le dernier P0 d'audit : un achat dont le reste à payer est **0 €** (couvert à 100 % par carte cadeau, ou article réellement gratuit) doit produire **exactement les mêmes effets métier** qu'un paiement Stripe réussi (vente, débit carte, booking si applicable, emails, facture), **sans passer par Stripe**. Transformer le test `giftcard.zeroPayment.characterization.test.js` (encore `it.todo`) en vrai test, et rendre le harnais P0 100 % vert (0 todo, 0 expected-fail).

## 2. Audit (résumé — détail dans le rapport 31)

- **Un seul finaliseur métier** existe déjà : `processCheckoutStatePurchase(...)` (`clientController.js`), appelé par le webhook Stripe et par `mockPay` (dev-only).
- **Stripe devient obligatoire** uniquement dans `createCheckoutSession` (`amountCents < 50` → 400 `AMOUNT_TOO_LOW`). Un panier à 0 € ne peut donc pas créer de PaymentIntent → aucun webhook → aucune finalisation.
- **Le débit carte cadeau est déjà atomique** (`deductGiftCardBalance` → `debitGiftCardBalanceAtomic`, Phase 1B-1).
- La logique de finalisation est complète et correcte ; il manquait seulement un **appelant de production** pour le cas 0 €.

## 3. Cause racine

Aucun **point d'entrée backend de finalisation hors-Stripe en production** :
- seul déclencheur prod = webhook Stripe (exige ≥ 0,50 €) ;
- `mockPay` bloqué en production depuis la Phase 1A ;
- le frontend, voyant `paymentProvider === 'stripe'`, ne rappelle pas le backend à 0 €.

## 4. Stratégie retenue

**Réutiliser** `processCheckoutStatePurchase` (= `finalizeCheckoutPurchase`) tel quel — pas de second flow, pas de duplication.

1. **Nouvel endpoint de production** `POST /api/client/checkout/finalize-free` (`requireAuth` + `requireSiteActiveForPurchases`) → `finalizeFreeCheckout`.
2. **Garde anti-contournement** : paramètre `requireZeroRemaining` propagé jusqu'aux branches de finalisation. Après `planGiftCardUsage` (qui recalcule prix catalogue + couverture carte **réelle** côté serveur), `assertZeroRemainingForFreeOrder` lève **402 `PAYMENT_REQUIRED`** si un montant reste dû. Pour la prestation, la vérification a lieu **avant** la création du `ServiceBooking` (pas d'orphelin).
3. **Idempotence** : réutilise l'index UNIQUE partiel Phase 1B-1. Référence synthétique déterministe `free_<idempotencyKey>` stockée dans `Sale.stripePaymentIntentId`. Double soumission → E11000 → réponse idempotente (`waitForExistingFreeSale` résout la vente gagnante sous concurrence, le perdant pouvant échouer plus tôt sur `purchase_unique_product`).
4. **Hygiène job frais Stripe** : `STRIPE_FEE_PENDING_QUERY` exclut les références `free_*`.
5. **Débit carte cadeau** : inchangé (réutilise `debitGiftCardBalanceAtomic`), plafonné au montant dû, solde jamais négatif, pas de réservation orpheline.

### Comportement officiel
- **Cas A** (panier = carte, reste 0 €) : pas de Stripe, vente, débit, booking si prestation, effets post-vente.
- **Cas B** (carte > montant) : débit plafonné au montant dû, solde restant conservé, vente créée.
- **Cas C** (article gratuit, prix 0) : vente créée, finalisée, pas de Stripe.
- **Reste dû > 0** : refus `402 PAYMENT_REQUIRED`.

## 5. Fichiers modifiés

- `controllers/clientController.js` — `finalizeFreeCheckout` (export), `assertZeroRemainingForFreeOrder`, `waitForExistingFreeSale`, paramètre `requireZeroRemaining` dans `processCheckoutStatePurchase` / `processCartCheckoutStatePurchase` / `processServiceCheckoutStatePurchase` + branches formation/gift-card/product.
- `routers/clientRouter.js` — route `POST /api/client/checkout/finalize-free`.
- `controllers/stripeController.js` — `STRIPE_FEE_PENDING_QUERY` exclut `free_*`.
- `tests/p0/giftcard.zeroPayment.characterization.test.js` — `it.todo` → vrai test (5 scénarios + précondition).
- `tests/README.md`, `architecture.md`, `projectContext.json` — documentation.
- `Rapports/version 1/31_audit_phase1b4_zero_payment.md`, `32_rapport_phase1b4_zero_payment.md`.

**Aucune logique métier dupliquée. Aucun second flow. Validations serveur non contournées.**

## 6. Tests ajoutés

`tests/p0/giftcard.zeroPayment.characterization.test.js` :
- précondition (solde carte couvre l'article) — verte ;
- **Test 1** : prestation 100 % carte cadeau → `Sale` + `ServiceBooking` + débit (solde 100 → 20) ;
- **Test 2** : carte (100 €) > produit (40 €) → débit plafonné 40, solde 60 ;
- **Test 3** : produit gratuit (0 €) → vente créée, aucun Stripe (`stripePaymentIntentId` `free_*`, aucun `StripeCheckoutIntent`) ;
- **Test 4** : double soumission concurrente (même `idempotencyKey`) → une seule `Sale`, un seul débit, une seule `GiftCardTransaction` ;
- **Anti-contournement** : reste dû (10 € sur 40 €) → `402 PAYMENT_REQUIRED`, aucune vente, carte intacte.

## 7. Résultats

```
npm test                 → 14 fichiers, 42 passed, 0 todo, 0 expected-fail
npm run test:p0          → 12 fichiers, 36 passed, 0 todo
npm run test:integration → 2 fichiers, 6 passed
```

Scan secrets `git grep --cached` : aucun secret (seule correspondance = la chaîne de commande documentée dans le rapport 30, pas un secret).

## 8. Risques fermés

- **P0 achat 0 € / 100 % carte cadeau** : fermé. Finalisation serveur complète (vente + débit + booking + effets), idempotente, non contournable.
- Le harnais P0 n'a plus **aucun `todo`** ni **aucun expected-fail** : tous les scénarios critiques V1 sont verts.

## 9. Risques restants (inchangés, hors périmètre 1B-4)

- Expiration / libération automatique des bookings `pending_payment`.
- Remboursement automatique si paiement encaissé mais slot devenu indisponible (booking rejeté 409, pas d'auto-refund).
- Reprise complète des refunds bloqués.
- Credit notes / factures d'avoir Stripe totalement idempotentes.
- `requireStrictDev` / gestion fine des rôles.
- Rate-limit login / reset password.
- XSS / SVG / responsive / migration React.

## 10. Impacts production

- Nouvel endpoint **public (authentifié)** `POST /api/client/checkout/finalize-free` actif en production (≠ `mock-pay` qui reste dev-only).
- Les ventes 0 € portent une référence `free_*` dans `stripePaymentIntentId` et sont exclues du job de récupération des frais Stripe (correct : aucun frais).
- **Front à câbler** : `purchaseFlowService.finalizePurchase` doit appeler ce nouvel endpoint lorsque `remainingToPay === 0` au lieu de prendre la branche Stripe (le backend est désormais prêt et sûr ; la garde `requireZeroRemaining` empêche tout abus).
- Aucune migration de données. Aucun changement de schéma. Aucune modification des flux Stripe/refund/booking existants.

## 11. Commandes exécutées

```bash
npx vitest run tests/p0/giftcard.zeroPayment.characterization.test.js   # red puis green (TDD)
npm test
npm run test:p0
npm run test:integration
git grep --cached -n "sk_live_|xkeysib-|whsec_|mongodb+srv://.*:.*@"
git status / git diff
```

## 12. Recommandation pour la suite

1. **Câbler le frontend** (`purchaseFlowService.finalizePurchase`) sur `POST /api/client/checkout/finalize-free` quand `remainingToPay === 0`, en envoyant un `idempotencyKey` stable (ex. le `checkoutToken`).
2. **Phase 1B-5** : expiration/libération automatique des `pending_payment` (verrous booking) + remboursement automatique si slot devenu indisponible après encaissement.
3. Ensuite : durcissement rôles (`requireStrictDev`), rate-limit login/reset, puis chantiers UX/XSS/React.
