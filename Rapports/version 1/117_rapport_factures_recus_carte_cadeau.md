# 117 — Rapport factures / reçus / carte cadeau (D2)

> Branche `phase-0-security-baseline`. V1 sans TVA conservée.

## Règle facture / reçu
- **Facture officielle (fiscale) = Stripe** : vente client (compte Institut) et commission
  (compte Dev). Champ `Invoice.documentKind='stripe_official'`, `official:true`,
  `resolveOfficialInvoiceRef` → `{official:true, source:'stripe', id, url}`.
- **Document interne = NON fiscal** :
  - `internal_snapshot` : PDF interne opérationnel (snapshot/fallback admin).
  - `gift_card_usage_receipt` : commande réglée **100 % en carte cadeau** → reçu
    d'utilisation, **jamais une facture fiscale**.
- **0 € Stripe / carte cadeau 100 %** : pas de facture Stripe officielle →
  `resolveOfficialInvoiceRef` → `{official:false, source:'none'}`.
- **Carte cadeau achetée** : si payée par carte bancaire, la facture **Stripe** de cet achat
  reste la preuve fiscale officielle (inchangé).

## Carte cadeau = moyen de paiement (pas une remise)
- `invoiceService.buildGiftCardReceiptInfo(sale)` → `{ soldAmount, giftCardPaymentAmount,
  balanceDue, fullyCoveredByGiftCard }`.
- PDF interne : ligne **« Carte cadeau (règlement) : -X € »** + **« Reste à payer »** ; mention
  « Reçu d'utilisation de carte cadeau — document interne, non fiscal » si 100 % couvert.
- Le **prix vendu** (ligne facturée) reste inchangé par la carte cadeau (cohérent avec le
  snapshot pricing : `soldAmount` ≠ réduit par la carte cadeau, cf. rapport 114).

## Changements
- `models/Invoice.js` : `documentKind` += `gift_card_usage_receipt`.
- `services/invoiceService.js` : `buildGiftCardReceiptInfo` (export) ; `createInvoiceForSale`
  pose `documentKind` (gift_card_usage_receipt si 100 % carte cadeau) + ligne carte cadeau au PDF.

## Tests
`tests/p1/giftCardUsageReceipt.test.js` : 100 % carte cadeau → reçu non fiscal ; partiel →
snapshot interne ; carte cadeau achetée Stripe → officielle ; label 293 B conservé.

## Limites juridiques à valider
- La mention « non fiscal » du reçu interne et la primauté de la facture Stripe doivent être
  confirmées par un conseil comptable (régime franchise 293 B).
- Numérotation séquentielle légale des factures : portée par Stripe (officiel) ; le PDF
  interne n'est pas un document fiscal.
