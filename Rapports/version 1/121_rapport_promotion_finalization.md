# 121 — Finalisation des promotions (E1)

> `Promotion` est désormais la **source unique DÉFINITIVE**. Le runtime ne lit plus
> `Service.promotion` pour le pricing/billing.

## Changements runtime
- `promotionService.resolveEffectiveServiceUnitPrice` : **fallback legacy supprimé** — lit
  uniquement `Promotion(targetType:'service')`. Sans Promotion → prix plein.
- Tous les **chemins de pricing/billing prestation** lisent désormais `Promotion` :
  - `checkoutPricingService.priceService` (déjà D1) ;
  - `processServiceCheckoutStatePurchase` (déjà D1) ;
  - `serviceBookingController.createBooking` (legacy direct-booking) → migré E1 ;
  - `serviceController.buildPublicPayload` (affichage vitrine) → migré E1 (async,
    `getActivePromotion('service')` + `calculateFinalPrice`) ;
  - `computeEffectivePrice` (lecture legacy) **supprimé**.

## Migration des données
- Script `scripts/migrateServicePromotionsToPromotionModel.js` : **dry-run par défaut**,
  `--apply` pour migrer `Service.promotion` → `Promotion(targetType:'service')`. **Idempotent**
  (ne recrée pas si une Promotion(service) existe). Validé par
  `tests/p1/promotionMigrationService.test.js` (dry-run/apply/idempotence).
- ⚠️ **À exécuter UNE FOIS en production** (`--apply`) AVANT/AU déploiement, pour convertir les
  promotions de prestations existantes en `Promotion` (sinon elles cessent de s'appliquer).
  Non exécuté automatiquement ici (pas de connexion DB prod dans l'environnement de dev).

## grep `Service.promotion` — état final
Plus aucune **lecture de pricing** runtime. Références restantes :
- **Migration** : `scripts/migrateServicePromotionsToPromotionModel.js` (lit le legacy pour migrer).
- **Persistance config admin (DB-compat)** : `serviceController` (buildServicePayload renvoie
  le champ ; create/update/PATCH persistent `doc.promotion`). **Vestigial** : le champ est
  conservé pour compat DB mais **n'a plus d'effet runtime**. La configuration des promos de
  prestations devra passer par un éditeur `Promotion` (post-React).
- **Tests** : `promotionSingleApplication`, `promotionMigrationService` (vérifient que le
  legacy est ignoré et que `Promotion` fait foi).
- **Documentation** : rapports historiques.

## Conséquence produit (à noter)
L'éditeur admin actuel écrit encore `Service.promotion` (sans effet). Tant qu'un éditeur
`Promotion(service)` n'existe pas, créer une promo de prestation se fait via le modèle
`Promotion` (ou le script de migration). À traiter dans le chantier React (UI promotions unifiée).

## Statut Service.promotion
**Legacy / déprécié** : champ conservé pour compatibilité DB, **aucun chemin de pricing ne le
consulte**. Suppression du champ possible ultérieurement (migration de schéma dédiée).

## Tests
317 verts (p0=44, p1=267, integration=6). `promotionSingleApplication` + `promotionMigrationService`
mis à jour pour refléter la suppression du fallback legacy.
