# 150 — Audit pré-Sprint U1 : fondations UnifiedCheckout

> État des flux checkout institut avant la création du moteur. Complète l'audit 143. Aucune
> modification.

## Flux checkout actuels par kind (institut)
| Kind | Entrée | Pricing | Validation | Finaliseur |
|---|---|---|---|---|
| formation | `create-checkout-session` (Elements) | `buildServerCheckoutPricing` (kind `single`) | legal A1, offre A7 | `processCheckoutStatePurchase` (branche formation) |
| product | idem | `single` | legal A1 | `processCheckoutStatePurchase` (branche produit) |
| gift_card | idem | `gift-card` | legal A1 | `processCheckoutStatePurchase` (branche gift-card) |
| cart | idem (`cart:true`) | `cart` | legal A1, offre A7, waivers | `processCartCheckoutStatePurchase` |
| service | idem (`service`) | `service` (+acompte) | legal A1, créneau (`assertServiceSlotBookable`) | `processServiceCheckoutStatePurchase` |
| 0 € (tous) | `finalize-free` | `buildServerCheckoutPricing` | legal A1, offre A7 | `processCheckoutStatePurchase` (requireZeroRemaining) |

## Données communes (à snapshotter)
- **pricing serveur** : `buildServerCheckoutPricing` → `{ kind, catalogAmount, soldAmount, giftCardPaymentAmount, amountToPay, isZeroPayment, currency, taxSnapshot, pricingSnapshot }`.
- **légal** : `buildLegalConsentSnapshot({checkoutState, acceptedAt, source})`.
- **fiscal** : `buildTaxSnapshot(amount)` (inclus dans pricing).
- **carte cadeau** : moyen de paiement (couverture serveur, capée).

## Différences par kind
- `single` (pricing) = produit **OU** formation → désambiguïsation nécessaire via `item.type`.
- `service` : acompte possible (`payBase`), créneau à valider, finaliseur dédié (booking + Sale).
- `cart` : multi-items, waivers par item, finaliseur dédié.
- `gift_card` : montant = `item.amount`, pas de catalogue.

## Finalizers existants à réutiliser (NE PAS dupliquer)
- `checkoutFacade.processCheckoutStatePurchase` (dispatch interne cart/service/single).
- `processServiceCheckoutStatePurchase`, `processCartCheckoutStatePurchase` (via le dispatch).
- `persistSale` / `runPostSaleSideEffects` (via les finaliseurs).
- `finalizeFreeCheckout` (0 €) — endpoint, réutilise le même dispatch.

## Risques U1
- 🔴 Modifier un finaliseur ou un endpoint → régression (interdit). → moteur **en parallèle**, délégation pure.
- 🟡 Stocker un secret (password carte cadeau) dans inputSnapshot → **sanitisation obligatoire**.
- 🟡 Index idempotencyKey : `default:null` casserait l'unicité partielle → **index partiel** (chaînes only), pas de default.
- 🟡 `pricing.kind === 'single'` ambigu → classifier sur `item.type`.

## Plan U1
1. `models/UnifiedCheckout.js` (snapshots safe + index).
2. `services/checkout/unified/` : types, repository (idempotence), pricing (wrapper), validation (services existants), factory (depuis checkoutState actuel), finalizer (délègue), responseMapper (safe).
3. Endpoint dev lecture seule `GET /api/gestion/dev/unified-checkouts` (requireStrictDev).
4. Tests (model/factory/kinds/idempotence/parité) ; **ne pas câbler aux endpoints live** (zéro changement).
5. Documentation (151 + docs React).
