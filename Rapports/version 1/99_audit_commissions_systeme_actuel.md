# 99 — Audit du système de commissions actuel

> Lecture seule. Branche `phase-0-security-baseline`, HEAD `6870ffe`. Aucune correction.

## Réponses directes

### Comment les commissions sont-elles calculées aujourd'hui ?
Deux mécanismes **parallèles** coexistent :
1. **Ledger** `CommissionTransaction` — alimenté à la vente par
   `services/commissionService.recordCommissionTransactions({ saleId, formationEntries })`
   (une ligne `sourceType:'sale'` par formation). Au remboursement,
   `refundService.ensureRefundCommissionProvision` ajoute une ligne négative
   `refund_adjustment` ; `ensureRefundCommissionReversal` une ligne `refund_reversal`.
2. **Facturation** `services/commissionPaymentService.computeCommissionsForPeriod` —
   **autoritatif pour le paiement** : recalcule depuis `Sale.commissionAmount`
   (snapshot) et `RefundRequest`, **sans lire le ledger**.

➡️ **Le ledger `CommissionTransaction` n'est PAS consommé par la facturation.** C'est un
doublon (cf. dernière section).

### Sur quelle base ?
- Base = **`finalPrice` de la formation** (prix catalogue **après promotion**), via
  `buildFormationEntryFromSale` → `entry.price` → `calculateCommissionAmount({type,value,price})`.
- Le type/valeur viennent de `getActiveCommissionConfig()` (`CommissionConfig`,
  `type` percentage|fixed, `value`).
- 🟢 **La carte cadeau est incluse** : `finalPrice` est le prix plein (la carte cadeau est
  un moyen de paiement, pas une remise) → conforme à la règle métier décidée.
- 🟢 **Les promotions sont incluses** : `finalPrice` est post-promo.
- 🔴 **Seules les FORMATIONS génèrent une commission.** `buildFormationEntryFromSale`
  renvoie `null` pour produit/prestation/carte cadeau, et `processServiceCheckoutStatePurchase`
  n'appelle pas `recordCommissionTransactions`. → produits et prestations = **0 commission**
  (probablement intentionnel — le contrat porte sur les formations — mais à confirmer).

### À quelle fréquence ?
- **Mensuelle.** `CommissionPayment` a un index unique `{month, year}` → **un document par
  mois**. `getMonthsFromContractStart(activatedAt, now)` égrène les mois depuis l'activation
  du contrat. La période d'un mois = `[1er du mois, 1er du mois suivant[`.

### Qui déclenche le paiement ?
- **L'institut (rôle `admin`) OU le `dev`** depuis l'espace gestion (page commissions).
  Route `POST /api/commissions/payments/:id/create-intent` (`requireAdminOrDev`).
- Le paiement transite par le **compte Stripe Developer** (`stripeDevClient`, slug
  `stripe-dev`) : l'institut **paie la plateforme**.

### Quelles ventes sont incluses ?
- `computeCommissionsForPeriod` : `Sale` avec `commissionAmount > 0` et
  `createdAt ∈ [periodStart, periodEnd[`. (Donc uniquement les formations, qui sont les
  seules à porter `commissionAmount`.)

### Quels remboursements sont pris en compte ?
- Depuis A5 : tout remboursement **réglé** (Stripe `succeeded` **OU** carte cadeau
  recréditée **OU** statut `succeeded`), daté par
  `stripeRefundConfirmedAt || refundedAt || processedAt ∈ période`.
- Déduction **proportionnelle** : `min(1, refund.amount / sale.totalAmount) * sale.commissionAmount`.
- 🟢 Bucketé par **date de règlement** → un remboursement d'une vente d'un mois antérieur
  est déduit du **mois courant** (du règlement) → conforme à la règle métier.

### Quelles commissions sont déjà payées ?
- `CommissionPayment.status` ∈ `pending|succeeded|failed`. `succeeded` = mois réglé
  (PaymentIntent Stripe Dev confirmé). `paidAt` horodaté. Facture Stripe Dev générée
  (`generateCommissionInvoice`) avec `stripeInvoiceId`/`stripeInvoicePdfUrl`.

### Quels ajustements existent ?
- **Au niveau facturation** : la ligne `refunds[]` du `CommissionPayment` du mois de
  règlement (négatif). `generateCommissionInvoice` crée un `invoiceItem` négatif
  **référençant l'ID du remboursement** (`REF-xxx → SALE-xxx`) → conforme à la règle.
- **Au niveau ledger** : `refund_adjustment` (négatif) + `refund_reversal` (positif si
  remboursement échoué). 🔴 **Non utilisés par la facturation.**
- 🔴 **Clamp `max(0, totalSales − totalRefunds)`** : si les remboursements d'un mois
  dépassent les ventes, le surplus négatif est **perdu** (pas de report sur le mois suivant).

### Doublons entre CommissionPayment et CommissionTransaction
🔴 **Oui, doublon structurel** :
- `CommissionTransaction` (ledger) : alimenté à la vente + provisions/reversals de
  remboursement. **Lu par le dashboard commissions** (stats) mais **PAS** par le calcul de
  facture.
- `CommissionPayment.computeCommissionsForPeriod` : recalcule indépendamment depuis
  `Sale.commissionAmount` + `RefundRequest`. **C'est lui qui détermine le montant payé.**
- Les deux peuvent **diverger** (ex. ledger `refund_adjustment` créé mais
  `computeCommissionsForPeriod` bucket le remboursement dans un autre mois ; ou
  `refreshCommissionPayment` jamais appelé → snapshot `amount` figé).
- `refreshCommissionPayment` **n'a aucun appelant** (code mort) → le montant d'un
  `CommissionPayment` pending **n'est jamais recalculé** après sa création initiale.

## Failles / fragilités détectées
1. 🔴 **Double mécanisme non réconcilié** (ledger vs compute). Source de confusion et
   d'écart potentiel.
2. 🔴 **`refreshCommissionPayment` mort** → montant pending **figé** (un remboursement
   tardif sur le mois courant n'est pas répercuté avant paiement → mauvais montant).
3. 🟡 **Clamp à 0** → perte de déduction si remboursements > ventes du mois.
4. 🟡 **Finalisation par polling** : le statut `succeeded` n'est posé que par
   `check-status` (frontend), pas par le webhook Dev (cf. rapport 100/101).
5. 🟡 **Commission uniquement sur formations** (à confirmer comme voulu).
6. 🟢 Base de calcul (finalPrice, carte cadeau incluse, promo incluse) = **conforme** à la
   règle métier décidée.
7. 🟢 Référence de l'ID remboursement dans la facture commission = **conforme**.
