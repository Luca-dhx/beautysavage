# 93 — Audit réductions / promotions

> Lecture seule.

## Constat central
Le seul mécanisme de réduction est **`Promotion`** : une remise **par cible**
(`product` ou `formation`), **par pourcentage ou montant fixe**, **bornée dans le temps**.
**Il n'existe AUCUN système de coupon / code promo / réduction panier / réduction
saisie par le client.** Les scénarios « coupon » du brief sont donc **sans objet** (à
documenter comme non implémentés, pas comme des bugs).

## Modèle `Promotion`
Champs : `targetType` (product|formation, requis), `targetId` (requis), `discountType`
(percentage|fixed, requis), `discountValue` (requis), `startAt` (requis), `endAt`
(nullable = illimité), `createdBy` (requis).
- `getActivePromotion(targetType, targetId, date)` : 1 promo active par cible à une date
  (la plus récente). **Vérifié** : promo expirée ignorée (S73), promo active retournée (S74).
- `calculateFinalPrice(base, promo)` : applique %/fixe, **plancher à 0** (jamais négatif),
  `discountAmount = base - final`. **Vérifié** S70 (20 %→80), S71 (fixe 30→70), S72 (fixe 150→0).

## Couverture par type d'offre
| Cible | Promo supportée | Note |
|---|---|---|
| Produit | ✅ | `getActivePromotion('product', …)` |
| Formation | ✅ | présentiel + distanciel |
| Prestation/service | ⚠️ via `Service.promotion` (sous-doc dédié, logique séparée dans `processServiceCheckoutStatePurchase`) — **chemin différent** de `Promotion` | fragile (2 mécanismes promo) |
| Carte cadeau | ❌ | non concernée |
| Panier (global) | ❌ | pas de remise panier |

🟡 **Fragilité** : deux mécanismes de promotion coexistent — `Promotion` (produit/formation)
et `Service.promotion` (prestation, sous-document avec `isActive/startDate/endDate/type/value`
évalué inline dans `processServiceCheckoutStatePurchase`). Logique dupliquée → risque de
divergence (formats de dates, types). À unifier (cf. rapport 94).

## Cumuls
| Cumul | Comportement |
|---|---|
| Promo + Stripe | ✅ prix réduit payé par carte |
| Promo + carte cadeau | ✅ carte cadeau couvre le prix déjà réduit (`planGiftCardUsage` sur le `finalPrice`) |
| 100 % carte cadeau sur prix promo | ✅ finalize-free si reste 0 € |
| Coupon + … | ❌ inexistant |
| Cumul de 2 promos sur une même cible | ❌ `getActivePromotion` retourne 1 seule (la plus récente) |

## Impacts transverses
| Impact | État | Verdict |
|---|---|---|
| TVA | franchise 293B → aucun impact TVA (pas de taux) | conforme (293B) |
| Commission | `Sale.commissionAmount` calculé au **catalogue** (prix plein), pas sur le prix réduit | **indéterminé** — décision métier : la commission suit-elle le prix vendu (réduit) ou le catalogue ? (cf. 76,107) |
| Facture | `finalPrice` réduit snapshoté → facture montre le net ; pas de ligne « remise » | conforme probable |
| Remboursement | basé sur `finalPrice`/`amount` réel payé | conforme probable |

🟡 **Point d'attention commission** : si la commission doit suivre le **prix réellement
vendu** (réduit), le calcul actuel au catalogue **surévalue** la commission due par
l'institut sur les ventes promues. À trancher (non documenté).

## Snapshot / immutabilité
- ✅ `saleItem.finalPrice`/`basePrice`/`promotionApplied`/`promotionId` snapshotés sur la
  vente → la promo passée est figée même si la `Promotion` change/expire après l'achat.
- ✅ `getActivePromotionsForTargets` (panier) batché.

## Scénarios coupons (brief) — statut
| Scénario | Statut |
|---|---|
| coupon + Stripe / + carte cadeau / 100 % coupon / coupon expiré / coupon dépassant panier | **INDETERMINÉ — fonctionnalité coupon non implémentée** |

## Classement
| Élément | Verdict |
|---|---|
| Promo produit/formation | conforme probable |
| Promo prestation (`Service.promotion`) | fragile (mécanisme parallèle) |
| Plancher prix ≥ 0 | conforme |
| Snapshot promo sur vente | conforme |
| Commission sur prix promu | indéterminé (décision métier) |
| Coupons / codes promo | inexistant |
| Remise panier | inexistant |

## Recommandations (sans implémentation)
- **Avant React** : trancher la règle **commission vs prix réduit** (impacte le contrat
  d'API commission) et **unifier** `Promotion` et `Service.promotion`.
- **Pendant/V2** : système de coupons si besoin métier (nouveau modèle).

## Score promotions : **70/100**
Mécanisme simple et correct (snapshot, plancher), mais dualité promo prestation/autres,
ambiguïté commission, et absence de coupons/remise panier.
