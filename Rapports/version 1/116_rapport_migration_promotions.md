# 116 — Rapport migration promotions (D1)

> Branche `phase-0-security-baseline`. `Promotion` devient la source officielle **unique**.

## Changements
- `models/Promotion.js` + `promotionService.VALID_TARGETS` : ajout de `service` aux cibles.
- `promotionService.resolveEffectiveServiceUnitPrice(service, now)` : **source unique** du prix
  prestation après promotion — `Promotion(targetType:'service')` **prioritaire**, fallback
  `Service.promotion` (legacy) **uniquement si aucune Promotion** ; **jamais les deux**.
- Câblage : `checkoutPricingService.priceService` et `clientController.processServiceCheckoutStatePurchase`
  utilisent désormais `resolveEffectiveServiceUnitPrice` (fin de la logique inline dupliquée).
- Script `scripts/migrateServicePromotionsToPromotionModel.js` : **dry-run par défaut**,
  `--apply` pour migrer. Pour chaque `Service.promotion` active → crée une
  `Promotion(targetType:service, targetId, discountType, discountValue, startAt, endAt)`.
  **Idempotent** (ne recrée pas si une Promotion(service) existe). Ne supprime pas
  `Service.promotion` (conservé en fallback legacy).

## Règle finale
- **Une seule promotion** par prestation. Promotion officielle prioritaire ; legacy en
  fallback transitoire. Promo expirée ignorée. Pas de cumul.

## Statut Service.promotion
**Legacy / déprécié** : conservé comme fallback tant que la migration n'est pas appliquée et
qu'aucune Promotion(service) n'existe. À retirer après migration `--apply` en production +
vérification (étape ultérieure, non bloquante React).

## Tests
`tests/p1/promotionMigrationService.test.js` : legacy seul, dry-run/apply, Promotion migrée
prioritaire, Promotion+legacy → une seule, promo expirée ignorée.

## Limites / suite
- Migration non exécutée automatiquement (script volontaire). À lancer en prod : dry-run puis
  `--apply`, puis retrait du sous-document `Service.promotion`.
- Produits/formations : déjà sur `Promotion` (inchangé).
