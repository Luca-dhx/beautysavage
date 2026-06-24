# Audit P1-3 - reprise refunds bloques + idempotence credit notes / invoices

## 1. Objectif
Verifier si les refunds bloques peuvent etre repris sans consommer le flow institut, et si les ecritures Stripe de credit note / invoice sont rejouables sans duplication.

## 2. Commit de depart
`7762014`

## 3. Fichiers lus
- `Rapports/version 1/07_audit_remboursements_annulations_retractation.md`
- `Rapports/version 1/27_rapport_phase1b2_remboursements.md`
- `Rapports/version 1/35_audit_consolidation_p0.md`
- `architecture.md`
- `projectContext.json`
- `models/RefundRequest.js`
- `services/refundExecutionService.js`
- `services/refundRequestService.js`
- `services/refundGiftCardService.js`
- `services/sessionCancellationFlowService.js`
- `controllers/stripeController.js`
- `controllers/salesController.js`
- `services/stripeInvoiceService.js`
- `models/Invoice.js`
- `models/Sale.js`
- `tests/README.md`

## 4. Constats d audit
- `services/sessionCancellationFlowService.js` consommait le flow institut meme si `triggerRefundExecution` echouait. Le flow passait en `refund` avec `usedAt` pose, donc aucune reprise locale possible.
- `services/refundExecutionService.js` ne passait pas de cle Stripe idempotente au refund `stripe.refunds.create`, donc un retry reseau pouvait reecrire cote Stripe.
- `controllers/stripeController.js` creait les credit notes sans cle idempotente explicite, donc un webhook rejoue pouvait dupliquer l appel Stripe avant que `creditNoteId` soit persiste.
- `services/stripeInvoiceService.js` executait la creation customer / invoice / invoice items / finalize / pay sans cle idempotente deterministe.
- Les protections deja presentes etaient correctes sur le plan metier:
  - `RefundRequest` contient deja `creditNoteId`, `creditNotePdfUrl`, `giftCardRecredited`, `giftCardRecreditInProgress`.
  - le split refund et la compensation carte cadeau sont deja centralises.

## 5. Resultat de l audit
Conclusion: fermeture incomplete avant correction.

## 6. Decision
Pas pret pour une validation finale sans remediation.
