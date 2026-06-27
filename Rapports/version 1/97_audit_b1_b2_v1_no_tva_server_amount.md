# 97 — Audit ciblé B1-B2 : V1 sans TVA + serveur source de vérité du montant

> Lecture seule (état AVANT corrections). Branche `phase-0-security-baseline`, HEAD `39291e6`.
> Périmètre : B1 (V1 sans TVA, franchise 293 B) et B2 (serveur = unique source du montant).
> **Commissions explicitement HORS périmètre** (cf. §6).

## 1. Où le montant est calculé aujourd'hui
| Chemin | Calcul du montant |
|---|---|
| **Création paiement Stripe** (`stripeController.createCheckoutSession`) | 🔴 **`amountToPay` lu depuis `checkoutState.totals` (CLIENT)** : `Number(checkoutState.totals?.amountToPay \|\| checkoutState.totals?.remainingToPay \|\| 0)`. Le PaymentIntent est créé avec ce montant client. |
| **Finalisation vente** (webhook → `processCheckoutStatePurchase` / cart / service) | 🟢 prix recalculés au **catalogue** : `buildSaleEntry` + `getActivePromotion` + `validateAndBuildSelectedOptions` ; carte cadeau capée par `planGiftCardUsage` (solde réel) → `remainingAmount`. La **vente** et la **commission** sont donc déjà server-truth. |
| **Free checkout 0 €** (`finalizeFreeCheckout`) | 🟢 `assertZeroRemainingForFreeOrder` recalcule la couverture serveur et refuse tout solde dû (402 PAYMENT_REQUIRED). |
| **Service deposit** | `processServiceCheckoutStatePurchase` calcule `depositAmount` serveur (mais A7 bloque la vente deposit en amont). |

**Constat clé (B2)** : le seul endroit où le client peut influencer un montant **encaissé**
est le **montant du PaymentIntent** (`createCheckoutSession`). Un client malveillant pouvait
poser `amountToPay` plus bas → **sous-paiement** (la vente serait quand même créée au
catalogue par le webhook, mais l'institut encaisserait moins que dû). C'est le gap B2.

## 2. Où le client peut influencer le montant
- 🔴 `checkoutState.totals.amountToPay` / `remainingToPay` → montant Stripe (corrigé en B2).
- 🟢 `appliedGiftCards[].amount` : déjà capé serveur (`planGiftCardUsage` + `reserveGiftCardAmountsForPaymentIntent` rejette `GIFT_CARD_RESERVED_BALANCE_INSUFFICIENT`).
- 🟢 prix article / promo : ignorés (le serveur relit le catalogue).
- 🟢 0 € : `assertZeroRemainingForFreeOrder` empêche le bypass.

## 3. Promotions / réductions / cartes cadeaux
- **Promotions** : `Promotion` (product/formation, `getActivePromotion`, date-bornée) + `Service.promotion` (sous-doc inline). Appliquées serveur au catalogue. Snapshot `finalPrice` sur la vente.
- **Cartes cadeaux** : moyen de paiement (`giftCardUsage`), capé au solde (`planGiftCardUsage` → `computeAvailableGiftCardBalance`). Réservation par PI au checkout.
- **Coupons / codes promo / remise panier** : **inexistants** (cf. rapport 93).

## 4. État actuel TVA / factures
- 🔴 **Aucune TVA** stockée ni calculée. Mention « TVA non applicable, article 293B du CGI »
  **codée en dur** dans `invoiceService.js` (`LEGAL_MENTION`) et `stripeInvoiceService.js`
  (fallback `vatMention`). HT = TTC implicite.
- Facture interne PDF (`createInvoiceForSale`) : total = `sale.totalAmount` catalogue.
- Facture Stripe : `paid_out_of_band`, ratio acompte, ligne carte cadeau négative.
- 🟡 Aucun **snapshot fiscal** sur `Sale` (taxMode/vatRate/label/HT/TVA/TTC).

## 5. Correction minimale recommandée
- **B1** : constante centrale `constants/tax.js` (TAX_MODE=`vat_exempt_franchise_base`,
  VAT_RATE=0, VAT_LEGAL_LABEL) + `buildTaxSnapshot()` ; champ `Sale.taxSnapshot` renseigné à
  la persistance ; `invoiceService`/`stripeInvoiceService` sourcent le label central.
- **B2** : service `checkoutPricingService.buildServerCheckoutPricing` (recalcul catalogue +
  promos + cartes cadeaux capées) + `assertClientPricingMatchesServer`
  (`CHECKOUT_AMOUNT_MISMATCH`). `createCheckoutSession` crée le PaymentIntent avec le
  **montant serveur** ; free checkout déjà server-truth (guard 402 conservé).

## 6. Éléments volontairement EXCLUS — commissions
Les commissions **ne sont pas modifiées** dans cette mission. Constats à traiter ensuite
(rapports 76, 90, 94, 95) :
- double mécanisme (ledger `CommissionTransaction` vs `computeCommissionsForPeriod`) ;
- claw-back commission déjà payée manuelle ;
- règle commission sur prix promu (catalogue vs vendu) indéterminée.
**Prochaine étape recommandée : discussion produit/architecture sur l'unification du système
de commissions** (avant de figer le contrat d'API commission pour React).

## 7. Risques
- 🟡 `createCheckoutSession` n'est pas couvert par les tests automatisés (Stripe réseau) :
  la correction B2 y est vérifiée indirectement (pricing service testé en isolation).
- 🟡 Couverture carte cadeau au pricing : calculée sur le **solde** (sans tenir compte de
  réservations concurrentes d'autres PI) → estimation conservatrice ; le débit réel reste
  finalisé serveur (`finalizeGiftCardUsage`).
- 🟡 Si le front calcule une couverture carte cadeau différemment du serveur →
  `CHECKOUT_AMOUNT_MISMATCH` (tolérance 0,01 €). Le front doit s'aligner sur le catalogue.
