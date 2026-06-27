# 105 — Rapport de correction commissions

> Implémentation. Branche `phase-0-security-baseline`. Aucune UI, aucun React, prix
> catalogue inchangés, Stripe Institut intact, pas de merge main.

## Règle métier finale (implémentée)
- Commission sur le **prix réellement payé**, **carte cadeau incluse**, **promotion incluse**
  (base = `finalPrice` formation, déjà snapshotée sur `Sale.commissionAmount`).
- Remboursement = **déduction sur la facture de commission du mois courant** (mois du
  règlement), avec **ligne négative référençant `refundId` + `saleId`**.
- Si déductions > commissions du mois : **facture 0 €** + **report du solde négatif**
  (`negativeCarryOverAmount`) appliqué le **mois suivant** (plus de perte par clamp).
- `CommissionTransaction` reste un **ledger d'audit** (hors chemin de facturation).

## Source unique de calcul
`services/commissionPaymentService.js` :
- `computeCommissionsForPeriod` expose `grossCommissionAmount` + `refundDeductionAmount`
  (+ `total` conservé pour compat).
- `buildMonthlyComputation(month, year)` = **calcul mensuel complet** :
  - `netAmountDue = max(0, gross − refundDeduction − carryOverIn)`
  - `negativeCarryOverAmount = max(0, refundDeduction + carryOverIn − gross)`
  - `carryOverAppliedAmount = carryOverIn` (report du mois précédent)
  - `calculationSnapshot` (trace).
- `getOrComputeCommissionPayment` et `refreshCommissionPayment` persistent ces champs ;
  un mois réellement **payé** (`settledReason:'paid'`) est verrouillé (non recalculé).
- `getCommissionPayments` (contrôleur) calcule les mois **séquentiellement** (le carry-over
  dépend du mois précédent).

## Carry-over négatif
Nouveaux champs `CommissionPayment` : `grossCommissionAmount`, `refundDeductionAmount`,
`carryOverAppliedAmount`, `negativeCarryOverAmount`, `netAmountDue`, `calculationSnapshot`.
Exemple validé (tests) : Juin +80 / −120 → facture 0 €, carry-over 40 ; Juillet +100 −40 →
facture 60 €.

## Paiement commission
`controllers/commissionPaymentController.js → createCommissionIntent` :
1. **Refresh obligatoire** (`refreshCommissionPayment`) avant tout PaymentIntent → montant
   à jour (montant figé corrigé).
2. `netAmountDue === 0` → **settled_zero** (status `succeeded`, `settledReason:'settled_zero'`),
   **aucun PaymentIntent**.
3. PaymentIntent créé avec le **montant serveur recalculé** + `metadata.type='commission'` +
   `metadata.commissionPaymentId`.

## Webhook Dev
`controllers/devWebhookController.js → handlePaymentIntentSucceeded` reconnaît un PI de
commission via `metadata.commissionPaymentId` et appelle `finalizeCommissionPaymentById`
(marque `succeeded`/`paid`, émet `commission.paid`, génère la facture Stripe Dev).
**Idempotent** : un mois déjà `paid` ne re-finalise pas (replay sans effet). Le **polling**
frontend (`check-status`) reste un **fallback** utilisant le **même finaliseur** partagé.

## Idempotence / verrou double-clic
- `finalizeCommissionPaymentById` partagé (webhook + polling), idempotent.
- Verrou atomique `paymentInProgress` (findOneAndUpdate conditionnel) : deux appels
  concurrents → **un seul PaymentIntent**.
- Idempotency key Stripe stable par mois+montant : `commission_payment_${year}_${month}_${cents}` ;
  si le montant change au refresh, l'ancien PI est annulé et recréé.
- `status:'succeeded' & settledReason:'paid'` → nouveau paiement refusé (409).

## IntegratedAPI accountPurpose
`models/IntegratedApi.js` : champ `accountPurpose` (enum `customer_payments` |
`platform_billing` | `messaging`, nullable). `seeders/seedIntegratedApisFromEnv.js` :
backfill idempotent — `stripe-institut → customer_payments`, `stripe-dev → platform_billing`,
`brevo → messaging`. Aucun modèle enfant créé.

## Tests
Ajoutés (`tests/p1/`) : `commissionMonthlySourceOfTruth`, `commissionCarryOver`,
`commissionPaymentRefresh`, `commissionPaymentIdempotence`,
`commissionDevWebhookFinalization`, `integratedApiAccountPurpose`. Harnais d'audit
`tests/audit/commissionScenarioMatrix.test.js` mis à jour (C11/C17 caractérisent le
comportement **corrigé**).

| Suite | Tests |
|---|---|
| `npm test` | **268** |
| `test:p0` | 44 |
| `test:p1` | 218 |
| `test:integration` | 6 |
| `audit:business-scenarios` | 36 |
| `audit:commissions` | 20 |

## Limites restantes
- Documents `CommissionPayment` **historiques `paid`** (anciens) : non rétro-corrigés
  (champs net/carry-over par défaut 0, pas de carry-over rétroactif). Le report démarre sur
  les mois recalculés.
- Couverture carte cadeau du pricing checkout : inchangée (hors périmètre commission).
- L'idempotency key inclut le montant (et non strictement `${year}_${month}`) pour rester
  compatible avec le refresh ; documenté.
- Commission **uniquement sur formations** (produits/prestations = 0) — comportement
  conservé (décision métier non remise en cause ici).
