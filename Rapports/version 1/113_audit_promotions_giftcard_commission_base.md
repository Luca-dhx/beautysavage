# 113 — Audit promotions / carte cadeau / base commission

> Audit préalable. Lecture seule.

## Systèmes de promotion existants
- **`Promotion`** (modèle) : cible `product`|`formation`, `discountType` %/fixe, date-bornée.
  `getActivePromotion` retourne **UNE** promo (la plus récente) ; `calculateFinalPrice`
  applique %/fixe, **plancher 0**, renvoie `{finalPrice, discountAmount}`.
- **`Service.promotion`** (sous-document) : prestations uniquement, évalué inline
  (`effectiveServicePrice`).
- 🟢 **Cibles DISJOINTES** : `Promotion` ne s'applique JAMAIS aux services (`targetType`
  service absent de `VALID_TARGETS`), et `Service.promotion` ne s'applique qu'aux services.
  → **aucun cumul possible par construction**. La dualité est une dette de maintenabilité,
  pas un risque de double-discount (cf. rapport 108).

## Où le prix vendu est calculé
- **Pricing serveur (source de vérité B2)** : `checkoutPricingService.buildServerCheckoutPricing`
  → `subtotal` = somme des `finalPrice` (post-promo) = **soldPrice**.
- **Finalisation** : `clientController` (`buildSaleEntry` → `finalPrice`), `Sale.totalAmount`
  = somme des `finalPrice`. Le prix vendu est donc **soldPrice** partout.

## Où la carte cadeau est appliquée
- `planGiftCardUsage` / `computeServerGiftCardCoverage` : **moyen de paiement** capé au solde
  réel ; `Sale.giftCardUsage[].amountUsed`. Elle **ne modifie pas** `finalPrice`/`totalAmount`.
- Facture Stripe : ligne **négative** (règlement), pas une remise (`stripeInvoiceService`).

## Où la commission est calculée
- `recordCommissionTransactions` : base = `entry.price` = `finalPrice` = **soldPrice**
  → `Sale.commissionAmount`. **Indépendante du moyen de paiement** (carte cadeau incluse).
- `computeCommissionsForPeriod` : somme `Sale.commissionAmount` − déductions remboursement
  proportionnelles à `r.amount / totalAmount` (totalAmount = soldPrice).

## Failles potentielles
- 🟢 La base de commission est **déjà** soldPrice (incl. carte cadeau) — conforme à la
  décision. Mais **non explicite** (aucun champ `commissionBaseAmount` ; pas de
  `pricingSnapshot`).
- 🟡 Dualité promotions (Promotion vs Service.promotion) — pas de cumul mais double
  maintenance.
- 🟡 Facture interne (PDF) n'affiche pas la carte cadeau (divergence interne/Stripe, cf. 92) ;
  la facture officielle (Stripe) la montre déjà.

## Stratégie de correction
1. **Formaliser** les concepts (`constants/pricingConcepts.js`) :
   `soldPrice = catalog − promo` ; `giftCard` = moyen de paiement ;
   `commissionBaseAmount = soldPrice` ; `stripePayment = sold − giftCard`.
2. **Snapshot pricing** sur `Sale.pricingSnapshot` (catalog/promo/sold/giftCard/stripe/
   commissionBase) — additif, non destructif.
3. **Promotion unique** : `pickSinglePromotion` (meilleure réduction, jamais de cumul) ;
   documenter que `Service.promotion` est la source legacy pour les prestations.
4. **Commission** : conserver `computeCommissionsForPeriod` (déjà sur soldPrice) ; rendre la
   base explicite via le snapshot + tests prouvant l'indépendance au moyen de paiement.
5. **Facture** : la facture officielle Stripe montre déjà la carte cadeau en règlement ;
   pas de régression.
