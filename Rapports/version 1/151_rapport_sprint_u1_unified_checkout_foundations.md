# 151 — Sprint U1 : fondations UnifiedCheckout (achats institut)

> Création du moteur **UnifiedCheckout** EN PARALLÈLE des flux existants. **Aucun finaliseur
> métier modifié, aucun endpoint public changé, aucun payload modifié, Stripe Elements/finalize-free
> intacts, commissions/contrat non touchés.** Suite **374 verte** + audits 36 + 20.

## Périmètre U1 (kinds institut uniquement)
`service` · `formation` · `product` · `gift_card` · `cart`. **Hors périmètre** : commissions, frais
de lancement, abonnement contrat, Stripe Checkout hébergé, React, UI, câblage live des endpoints.

## Modèle créé — `models/UnifiedCheckout.js`
Champs : `checkoutId` (unique), `kind`, `status` (draft|pricing_ready|payment_pending|free_ready|
finalized|cancelled|failed|expired), `userId`/`clientId`, `source`/`origin`, snapshots
(`inputSnapshot` sanitisé, `pricingSnapshot`, `taxSnapshot`, `legalConsentSnapshot`), `payment`
(mode stripe|free|mixed|gift_card_only, amountToPay, giftCardPaymentAmount, stripePaymentIntentId,
stripeCheckoutSessionId, provider, status), `finalization` (saleId, bookingId, purchaseIds,
accessDeliveryStatus, finalizedAt), `idempotencyKey`, `expiresAt`, `metadata`, timestamps.
Index : `checkoutId` unique ; `idempotencyKey` unique **partiel** (n'indexe que les chaînes →
plusieurs checkouts sans clé coexistent) ; `{status, expiresAt}`. **Aucun secret stocké** (mots de
passe carte cadeau retirés à la sanitisation).

## Services créés — `services/checkout/unified/`
| Module | Rôle |
|---|---|
| `unifiedCheckoutTypes.js` | kinds/statuts/modes/codes + `classifyUnifiedKind` (désambiguïse `single`→product/formation via item.type) + `resolvePaymentMode`. |
| `unifiedCheckoutRepository.js` | create/find/update + `findOrCreateByIdempotencyKey` (idempotence, gère la course E11000) + `listRecentCheckouts`. |
| `unifiedCheckoutPricingService.js` | **wrapper** de `buildServerCheckoutPricing` (aucune logique parallèle). |
| `unifiedCheckoutValidationService.js` | legal (A1) + offre (A7) + créneau prestation, via services existants ; construit le legalConsentSnapshot. |
| `unifiedCheckoutFactory.js` | crée un UnifiedCheckout depuis le checkoutState ACTUEL (format inchangé) : pricing → kind → validation → snapshots → persistance (idempotent). Sanitise les inputs (pas de password). |
| `unifiedCheckoutFinalizer.js` | **délègue** à `checkoutFacade.processCheckoutStatePurchase` (qui dispatche cart/service/formation/product/gift-card) ; met à jour le snapshot de finalisation. Aucune finalisation dupliquée. |
| `unifiedCheckoutResponseMapper.js` | vue safe (aucun champ sensible). |

## Endpoint dev/debug (lecture seule)
`GET /api/gestion/dev/unified-checkouts` (`requireStrictDev`) → vue safe des UnifiedCheckout
(aucun secret, identifiants techniques masqués). Ajouté à `devDiagnosticRouter`.

## Kinds branchés
`classifyUnifiedKind(checkoutState, pricing.kind)` :
- `service` (item.type service ou checkoutState.service) ; `cart` (cart:true) ; `gift_card`
  (item.type gift-card) ; sinon `single` désambiguïsé : item.type `product` → **product**, sinon **formation**.
- Le pricing serveur renvoyant `single` pour produit ET formation, la désambiguïsation se fait sur
  le type d'item (point d'attention documenté).

## Compatibilité avec les flux existants (zéro régression)
- `createCheckoutSession` (Stripe Elements), `finalize-free`, panier, prestation, produit, formation,
  carte cadeau : **inchangés** (non câblés au moteur en U1).
- Le finaliseur unifié **réutilise** `processCheckoutStatePurchase` → produit la même Sale (prouvé
  par `unifiedCheckoutParity`).
- Pricing/legal/offre : **délégués** aux services existants (pas de logique dupliquée).

## Tests (5 fichiers, +21)
- `unifiedCheckoutModel` (6) : requis/enums/défauts, `checkoutId` unique, `idempotencyKey` unique
  partiel, aucun password stocké.
- `unifiedCheckoutFactory` (4) : snapshots pricing/tax/legal présents, sanitisation (pas de password).
- `unifiedCheckoutInstituteKinds` (5) : product/formation/gift_card/cart/service → bon kind + pricingSnapshot.
- `unifiedCheckoutIdempotence` (3) : même key → même checkout (concurrence incluse).
- `unifiedCheckoutParity` (3) : finalize-free 401/400 inchangé, create-checkout-session 401 inchangé,
  config publishableKey, finaliseur unifié → même Sale.
- **Validation** : `npm test` 374 verts (p0=44, p1=324, integration=6), audit business 36, audit commissions 20. 0 todo, 0 expected-fail.

## Limites U1
- Le moteur **n'est pas câblé** aux endpoints publics (création en parallèle non imposée — décision
  de sécurité pour zéro changement de payload). Les UnifiedCheckout ne sont créés que par appel
  explicite du factory (tests + futur câblage U2).
- Pas de Stripe Checkout hébergé (Elements conservé). Pas de kinds plateforme (commission/contrat).
- Validation `service` (créneau) testée hors de ce sprint (tests booking existants) ; le kind
  service est créable avec `validate:false` pour le pricing.

## Prochaine mission — U2
**Brancher le moteur sur le checkout client réel + introduire Stripe Checkout hébergé** :
`create-checkout-session` crée un UnifiedCheckout → Stripe Checkout Session (redirection `url`)
au lieu d'Elements (`clientSecret`), webhook `checkout.session.completed` → `finalizeUnifiedCheckout`,
feature flag `CHECKOUT_HOSTED` + tests de parité. Puis kinds plateforme (commission/contrat) en U3.
