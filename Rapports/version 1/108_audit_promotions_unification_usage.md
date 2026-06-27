# 108 — Audit promotions : usage & unification

> Audit only (pas de correction). Lecture seule.

## Les deux mécanismes
### `Promotion` (modèle dédié)
- `models/Promotion.js` : `targetType` (`product`|`formation`), `targetId`, `discountType`
  (`percentage`|`fixed`), `discountValue`, `startAt`, `endAt` (nullable), `createdBy`.
- `services/promotionService.js` : `getActivePromotion(targetType, targetId, date)`,
  `getActivePromotionsForTargets(...)`, `calculateFinalPrice(base, promo)` (plancher 0).
- **Utilisé par** : checkout produits/formations (`buildSaleEntry`, webhook processors),
  `checkoutPricingService` (pricing serveur B2).

### `Service.promotion` (sous-document)
- Sous-document inline sur `Service` : `isActive`, `startDate`, `endDate`, `type`
  (`percentage`|`fixed`), `value`.
- **Utilisé par** : `processServiceCheckoutStatePurchase` (calcul `effectiveServicePrice`
  inline) et `checkoutPricingService.priceService` (logique répliquée).

## Qui utilise quoi
| Cible | Mécanisme | Évaluation |
|---|---|---|
| Produit | `Promotion` | `getActivePromotion('product', …)` |
| Formation (présentiel/distanciel) | `Promotion` | `getActivePromotion('formation', …)` |
| Prestation (service) | `Service.promotion` | logique inline (2 endroits) |
| Panier | `Promotion` (par item) | `getActivePromotionsForTargets` |
| Carte cadeau | aucune | — |

## Cas d'usage réels
- Remise saisonnière sur une formation/produit (% ou montant fixe, bornée dans le temps).
- Remise sur une prestation via le sous-document `Service.promotion`.
- **Pas de coupon / code promo / remise panier globale** (inexistants — cf. rapport 93).

## Cumul possible
- 1 seule `Promotion` active par cible à une date (`getActivePromotion` retourne la plus
  récente). **Pas de cumul** de deux promotions sur la même cible.
- Promotion + carte cadeau : OK (la carte cadeau couvre le prix déjà réduit).
- Promotion + Stripe : OK.

## Impacts
| Impact | Détail |
|---|---|
| Prix payé | `finalPrice` post-promo, **snapshoté** sur `saleItem` (immuable). |
| Carte cadeau | couverture appliquée sur le prix réduit (`planGiftCardUsage`). |
| Facture Stripe | montant net (prix réduit) ; pas de ligne « remise » distincte. |
| Commission | base = `finalPrice` (réduit) → commission sur le prix vendu. ✅ cohérent. |
| Remboursement | basé sur `amount`/`finalPrice` réel. |

## Risques
- 🟡 **Dualité `Promotion` vs `Service.promotion`** : logique de calcul **répliquée**
  (formats de dates `startAt/endAt` vs `startDate/endDate`, `discountValue` vs `value`) →
  risque de divergence et double maintenance (déjà signalé rapports 93/94).
- 🟡 Pricing prestation calculé inline à 2 endroits (processor + `checkoutPricingService`).
- 🟢 Snapshot du prix réduit sur la vente : robuste (promo passée figée).

## Recommandation
- **Système cible unique** : étendre `Promotion` au `targetType='service'` et **déprécier**
  `Service.promotion` (migration des sous-documents vers des documents `Promotion`).
- **Migration recommandée** : (1) backfill `Service.promotion` → `Promotion(targetType:service)` ;
  (2) router le pricing prestation via `getActivePromotion('service', …)` ; (3) retirer la
  logique inline. Non destructif si fait par étapes avec snapshot conservé.
- **Bloquant React ?** **Non.** Le pricing serveur (B2) est déjà la source de vérité et
  snapshote le prix. L'unification est une dette de **maintenabilité**, à faire pendant React
  (ou juste avant d'exposer un écran d'admin promotions unifié). Pas de risque financier
  immédiat.
