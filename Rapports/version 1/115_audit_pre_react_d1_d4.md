# 115 — Audit pré-React D1-D4

> État AVANT (HEAD `2ca5e92`) + stratégie. Lecture seule.

## D1 — Service.promotion vs Promotion
- `Promotion` : enum `targetType ∈ {product, formation}` (model + `promotionService.VALID_TARGETS`).
  **`service` non supporté.**
- `Service.promotion` (sous-doc inline) : seul mécanisme promo pour les prestations, évalué
  dans `processServiceCheckoutStatePurchase` ET `checkoutPricingService.priceService`.
- **Stratégie** : ajouter `service` aux cibles `Promotion` ; pricing prestation lit
  `Promotion(targetType:service)` **en priorité**, fallback `Service.promotion` si aucune ;
  **jamais les deux** ; script de migration `Service.promotion → Promotion`.

## D2 — Documents internes / carte cadeau 100 %
- `Invoice.documentKind ∈ {internal_snapshot, stripe_official}` + `official` (C2). PDF interne
  = snapshot non fiscal ; facture Stripe = officielle ; `resolveOfficialInvoiceRef`.
- 🟡 Le PDF interne **n'affiche pas** la ligne carte cadeau (divergence non fiscale).
- **Stratégie** : ajouter `documentKind='gift_card_usage_receipt'` ; pour une commande
  100 % carte cadeau → reçu interne **non fiscal** marqué, affichant prix vendu + carte
  cadeau utilisée + reste à payer 0 ; pas de facture Stripe officielle si Stripe n'encaisse
  rien. La carte cadeau **achetée** garde sa facture Stripe officielle (preuve d'achat).

## D3 — Acomptes
- `Service.paymentType='deposit'` + `depositType`/`depositValue`. **Bloqué** par A7
  (`assertServiceOfferBookable` → `OFFER_BALANCE_UNSUPPORTED`) car aucun circuit de solde.
- `ServiceBooking` : `depositAmount`, `paymentType`, `paymentStatus ∈ {pending, deposit_paid,
  paid, refunded, cancelled}`. `Sale.totalAmount` = depositAmount pour un acompte (donc
  remboursement déjà capé à l'acompte encaissé).
- **Stratégie (option recommandée #1)** : autoriser l'acompte **uniquement** si
  `Service.balanceSettlementMode='pay_on_site'` (le solde est tracé et réglé sur place, pas
  de Stripe en V1). Stocker `balanceDueAmount`/`totalSoldAmount`/`balanceSettlementMode` sur
  `ServiceBooking` ; endpoint admin `balance-paid` pour solder sur place. Facture Stripe
  officielle = acompte encaissé ; reçu interne = total + acompte + solde. **Refus** si
  deposit sans `pay_on_site` (aucun circuit). Commission : les prestations ne génèrent pas
  de commission → aucun abus possible sur le solde non encaissé (documenté).

## D4 — Données historiques à nettoyer
- Collections transactionnelles : `Sale`, `RefundRequest`, `CommissionPayment`,
  `CommissionTransaction`, `Invoice`, `EventLog`, `SendLog`, `BookingSlotLock`, `ServiceBooking`,
  `GiftCardTransaction`, `Purchase`, `StripeCheckoutIntent`.
- Collections de **configuration** à NE JAMAIS toucher : `User`, `Service`, `Formation`,
  `Product`, `GiftCard`, `EmailTemplate`, `IntegratedApi`, `Contract`, `CommissionConfig`,
  `CommissionSettings`, `PractitionerProfile`, `PractitionerSchedule`, `ScheduleException`,
  `SiteIdentity`.
- **Stratégie** : `scripts/cleanupBusinessHistory.js` — **dry-run par défaut**, `--apply`
  obligatoire, options `--include-bookings` / `--include-event-logs` / `--include-send-logs`.
  Jamais au boot. Fonction exportée pour tests.

## Risques
- 🟡 Déblocage acompte : ne lever le blocage que pour `pay_on_site` (circuit tracé).
- 🟡 Migration promo : ne jamais cumuler Promotion + Service.promotion (priorité Promotion).
- 🟢 Cleanup : dry-run par défaut + whitelist stricte des collections supprimables.
- 🟢 V1 sans TVA, prix catalogue, checkout/refund/booking inchangés.
