# 104 — Audit pré-correction commissions

> État AVANT la correction (HEAD `bc5d267`) + stratégie. Issu des rapports 99-103.

## État actuel précis
- **Source de calcul** : `computeCommissionsForPeriod` (ventes `Sale.commissionAmount` +
  remboursements réglés `RefundRequest`). Déjà la base de la facture.
- **Base** : `finalPrice` formation (carte cadeau incluse, promo incluse) — **conforme**.
- **Doublon** : `CommissionTransaction` (ledger) **non consommé** par la facturation.
- **Clamp** : `total = max(0, ventes − remboursements)` → déduction **perdue** si
  remboursements > ventes (pas de report).
- **Montant figé** : `refreshCommissionPayment` **sans appelant** → un `CommissionPayment`
  pending n'est jamais recalculé avant paiement.
- **Webhook Dev** : `handlePaymentIntentSucceeded` ne traite que les intents `launch` →
  **ne finalise pas** les commissions (finalisation par polling frontend uniquement).
- **Double-clic** : pas de verrou applicatif avant le 1er PaymentIntent.
- **IntegratedApi** : deux comptes Stripe (slugs `stripe-institut`/`stripe-dev`) sans champ
  sémantique d'usage.

## Fichiers à modifier
| Fichier | Changement |
|---|---|
| `models/CommissionPayment.js` | champs gross/refundDeduction/carryOverApplied/negativeCarryOver/netAmountDue/calculationSnapshot/paymentInProgress/settledReason |
| `services/commissionPaymentService.js` | gross/refund breakdown ; `buildMonthlyComputation` (carry-over) ; `getOrComputeCommissionPayment` refresh ; `refreshCommissionPayment` réécrit + utilisé |
| `controllers/commissionPaymentController.js` | refresh avant PI ; settled_zero ; verrou + idempotency key ; `finalizeCommissionPaymentById` ; getCommissionPayments séquentiel ; metadata `commissionPaymentId`+`type:commission` |
| `controllers/devWebhookController.js` | finalisation commission via metadata (idempotent) |
| `models/IntegratedApi.js` + `seeders/seedIntegratedApisFromEnv.js` | `accountPurpose` + backfill |

## Risques
- 🟡 Carry-over **ordre-dépendant** → `getCommissionPayments` doit être **séquentiel**.
- 🟡 Documents historiques `succeeded` sous l'ancien clamp : **non rétro-corrigés**
  (champs net par défaut 0, pas de carry-over rétroactif) — limite assumée/documentée.
- 🟡 Idempotency key Stripe + montant qui change au refresh → clé inclut le montant ;
  l'ancien PI au mauvais montant est annulé avant recréation.
- 🟢 Ne pas toucher Stripe Institut (aucune modif des flux client).

## Stratégie de correction
1. `computeCommissionsForPeriod` expose `grossCommissionAmount`/`refundDeductionAmount`.
2. `buildMonthlyComputation(month, year)` calcule net + carry-over (report du négatif).
3. `getOrComputeCommissionPayment` / `refreshCommissionPayment` persistent les champs ;
   `settled_zero` quand net = 0 ; verrouille un mois réellement payé.
4. `createCommissionIntent` : refresh → settled_zero → verrou atomique → PI montant serveur
   + idempotency key + metadata commission.
5. Webhook Dev : finalise via `finalizeCommissionPaymentById` (idempotent), polling = fallback.
6. `accountPurpose` (customer_payments/platform_billing/messaging) + backfill seeder.
7. Ledger `CommissionTransaction` **conservé** (audit) mais hors chemin de facturation.
