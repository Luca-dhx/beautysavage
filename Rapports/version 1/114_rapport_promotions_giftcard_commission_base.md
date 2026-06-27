# 114 — Rapport unification promotions + base commission

> Branche `phase-0-security-baseline`. Aucun React/UI, prix catalogue inchangés, V1 sans TVA
> conservée, checkout/refund/booking/commission intacts, pas de merge main.

## Règle promotion finale
- **Une seule promotion par ligne** (pas de cumul). `Promotion` (produit/formation) et
  `Service.promotion` (prestation) ciblent des **types disjoints** → aucun cumul possible par
  construction. `constants/pricingConcepts.pickSinglePromotion` retient sinon la **meilleure
  réduction unique**.
- `soldPrice = catalogPrice − promotionDiscountAmount` (plancher 0). Le prix vendu est la base
  de **facture** et de **commission**.
- Promo expirée → ignorée (prix plein). `Service.promotion` = source **legacy** pour les
  prestations (migration future vers `Promotion(targetType:service)` — rapport 108).

## Règle carte cadeau
- **Moyen de paiement**, jamais une remise commerciale. Elle **ne réduit pas** `soldPrice` ni
  la base de commission. Capée au prix vendu et au solde réel.
- Représentée comme **ligne de règlement** : `pricingSnapshot.giftCardPaymentAmount` +
  `Sale.giftCardUsage` ; sur la facture **officielle Stripe**, ligne négative (règlement).
- `stripePaymentAmount = soldPrice − giftCardPaymentAmount`.

## Base de commission
```
commissionBaseAmount = soldPrice   (après promotion, AVANT moyens de paiement)
```
- Déjà le cas (`recordCommissionTransactions` sur `finalPrice`) ; désormais **explicite** via
  `Sale.pricingSnapshot.commissionBaseAmount`. `computeCommissionsForPeriod` somme
  `Sale.commissionAmount` (sur soldPrice) ; déduction remboursement proportionnelle à
  `refund.amount / soldPrice`.

## Concepts formalisés (`constants/pricingConcepts.js`)
`catalogPrice`, `promotionDiscountAmount`, `soldPrice`, `giftCardPaymentAmount`,
`stripePaymentAmount`, `commissionBaseAmount`, `refundableAmount` (= soldPrice).
`buildPricingSnapshot({catalogAmount, soldAmount, giftCardPaymentAmount})` →
snapshot immuable. Stocké sur `Sale.pricingSnapshot` (persistSale + vente prestation) et
exposé par `checkoutPricingService.buildServerCheckoutPricing`.

## Facturation
- Ligne facturée = **prix vendu** (sold). Promotion visible (réduction). Carte cadeau =
  règlement (négatif) sur la facture **officielle Stripe**. Total dû Stripe = sold − giftCard.
- 0 € Stripe → reçu interne non fiscal (C2). Règle « facture officielle = Stripe » inchangée.

## Exemples validés (tests)
| Cas | sold | giftCard | stripe | commissionBase |
|---|---|---|---|---|
| 100 € − promo 20 € | 80 | 0 | 80 | 80 |
| 80 € vendu, 20 € carte cadeau | 80 | 20 | 60 | **80** |
| 80 € vendu, 80 € carte cadeau | 80 | 80 | 0 | **80** |
| remboursement 40 € sur base 80 | — | — | — | déduction 4 (= 40/80 × 8) |

## Tests
`tests/p1/` : `promotionSingleApplication`, `giftCardPaymentNotDiscount`,
`commissionBaseIncludesGiftCard`, `invoiceGiftCardPaymentLine` (+15).

| Suite | Tests |
|---|---|
| `npm test` | **298** |
| `test:p0` | 44 |
| `test:p1` | 248 |
| `test:integration` | 6 |
| `audit:business-scenarios` | 36 |
| `audit:commissions` | 20 |

## Limites restantes
- **Dualité `Promotion` / `Service.promotion`** non migrée (pas de cumul possible, dette de
  maintenabilité) → migration future `Promotion(targetType:service)`.
- Facture **interne PDF** n'affiche pas la ligne carte cadeau (la facture **officielle
  Stripe** la montre) — divergence non fiscale documentée (C2/rapport 92).
- Snapshot pricing rétroactif : les ventes antérieures n'ont pas `pricingSnapshot`
  (additif, non rétro-rempli).

## Migration future Promotion unique
Étendre `Promotion` au `targetType='service'`, backfiller `Service.promotion` →
`Promotion`, router le pricing prestation via `getActivePromotion('service', …)`, retirer la
logique inline. Non bloquant React (pricing serveur = source de vérité, snapshot figé).

## Verdict React
**GO React.** Concepts pricing formalisés, base de commission explicite et indépendante du
moyen de paiement, promotion unique garantie, carte cadeau = moyen de paiement. Les dettes
restantes (unification promo, facture interne) sont **non bloquantes**.
