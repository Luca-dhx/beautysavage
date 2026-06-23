# Rapport 33 — Audit frontend achat 0 € (Phase 1B-4B)

- **Date** : 2026-06-23
- **Branche** : `phase-0-security-baseline`
- **Commit de départ audité** : `223a605 Support zero-payment checkout finalization`
- **Objet** : auditer le câblage frontend actuel autour des checkouts `remainingToPay === 0` avant recâblage vers `POST /api/client/checkout/finalize-free`.

---

## 1. Création de `checkoutState`

### Achat simple (`formation` / `product`)
- Source : `public/js/modules/checkoutModule.js`
- Construction : `buildCheckoutState(...)` dans `public/js/modules/purchaseFlowService.js`
- Forme :
  - `item = { type, id, name, itemSubType, sessionId, coverImage, selectedOptions }`
  - `items = [item]`
  - `appliedGiftCards` normalisées (`giftCardId`, `code`, `password`, `amount`)
  - `totals`
  - `legal`
  - `paymentProvider: 'stripe'`
  - `paymentIntentId: null`
  - `origin`
- Point important : même quand le reste à payer est `0`, le `checkoutState` est encore marqué `paymentProvider: 'stripe'`.

### Panier
- Source : `public/js/modules/checkoutModule.js`
- Construction : `buildCartCheckoutState(...)` dans `purchaseFlowService.js`
- Forme :
  - `cart: true`
  - `items[]`
  - `consumerWaivers[]`
  - `refundPolicySnapshots`
  - `appliedGiftCards`
  - `totals`
  - `legal.acceptedCgv`
  - `paymentProvider: 'stripe'`
  - `origin: { slug: 'cart', query: {} }`
- Point important : pas de `item.id` racine ; le flow 0 € panier dépend donc d’un code frontend capable de gérer `cart === true`.

### Prestation (`service`)
- Source : `public/js/modules/checkoutModule.js`
- Construction inline dans `runServiceCheckout(...)`
- Forme :
  - `itemType: 'service'`
  - `item: { type: 'service', id, name }`
  - `service = { serviceId, slotStart, slotEnd, practitionerId, selectedOptions }`
  - `paymentType`
  - `depositAmount`
  - `appliedGiftCards`
  - `totals = { subtotal, giftCardUsed, depositAmount, amountToPay, remainingOnSite, totalAmount }`
  - `legal`
  - `paymentProvider: 'stripe'`
- Point important : ce flow n’utilise pas `totals.remainingToPay` mais `totals.amountToPay` pour le montant dû immédiatement.

## 2. Calcul de `totals.remainingToPay`

### Achat simple
- Fonction : `computeTotals(...)` dans `checkoutModule.js`
- Calcul :
  - `baseAfterPromo = pricing.finalBeforeGift`
  - `optionsTotal = somme(selectedOptions.price)`
  - `subtotal = baseAfterPromo + optionsTotal`
  - `giftCardUsed = min(subtotal, somme(appliedGiftCards.amountUsed))`
  - `remainingToPay = subtotal - giftCardUsed`

### Panier
- Le panier recalcule `state.totals = computeCartTotals(...)` avant soumission.
- La décision Stripe / gratuit repose ensuite sur `state.totals.remainingToPay`.

### Prestation
- Pas de `remainingToPay` pilotant le checkout.
- Le montant dû “maintenant” est `totals.amountToPay`.
- Un service avec acompte peut donc avoir `totalAmount > 0` mais `amountToPay === 0`.

## 3. Déclenchement de la navigation vers paiement / Stripe

### Achat simple
- Si `state.totals.remainingToPay > 0` :
  - création d’un `checkoutToken` via `createCheckoutStateToken(checkoutState)`
  - navigation vers `slug=payment&checkoutToken=...`

### Panier
- Même logique :
  - `remainingToPay > 0` -> token -> `slug=payment`

### Prestation
- Si `state.totals.amountToPay > 0` :
  - token
  - navigation vers `slug=payment`

### Conséquence auditée
- Le module Stripe (`paymentSimulationModule.js`) n’est appelé que via la page `payment`.
- Avant recâblage, les cas gratuits n’allaient pas systématiquement sur cet écran et utilisaient un flow frontend séparé.

## 4. Fonctionnement de `purchaseFlowService.finalizePurchase` (état audité)

### Garde légale
- Refuse si `acceptedCgv` manque.
- Sauvegarde un résultat d’échec en `sessionStorage`.
- Navigue vers `origin`.

### `outcome === 'failed'`
- Aucun appel backend.
- Sauvegarde résultat d’échec.
- Navigue vers `origin`.

### `paymentProvider === 'stripe'`
- Branche prise pour tous les `checkoutState` construits par le checkout courant.
- Considère que Stripe / webhook a déjà créé la vente.
- Ne fait **aucun appel backend**.
- Sauvegarde succès puis navigue vers `origin`.

### Branche legacy hors Stripe
- Fallback vers `submitMockPurchase(...)`.
- Cette branche n’était atteinte que si un appelant injectait un `paymentProvider` différent de `'stripe'`.

## 5. Branches utilisant encore `submitMockPurchase`

- `submitMockPurchase` existait uniquement dans `purchaseFlowService.js`.
- Les recherches frontend montrent :
  - aucun `checkoutState` standard n’utilisait `paymentProvider` autre que `'stripe'`;
  - `checkoutModule.js` appelait `finalizePurchase(...)` dans les branches gratuites, mais comme `paymentProvider === 'stripe'`, cela **ne passait déjà plus** par `submitMockPurchase`.
- Conclusion :
  - le vieux chemin `mock-pay` n’était plus un flow actif de production ;
  - le vrai bug venait du fait que les branches gratuites `stripe` étaient considérées “déjà finalisées”, donc **aucune finalisation backend n’avait lieu**.

## 6. Bugs frontend constatés pendant l’audit

1. **Achat simple 0 €**
- `finalizePurchase(...)` voyait `paymentProvider === 'stripe'` et skipait tout appel backend.
- Résultat : succès frontend local, mais aucune `Sale` côté serveur.

2. **Panier 0 €**
- Même problème de skip Stripe.
- En plus, `finalizePurchase(...)` attendait historiquement `state.item.id`, alors que le panier utilise `cart === true`.

3. **Prestation 0 €**
- Branche gratuite spécifique dans `checkoutModule.js`, distincte de la page `payment`.
- Pas d’écran de succès identique au retour Stripe.

4. **Idempotence frontend absente**
- Les branches gratuites n’envoyaient aucune clé d’idempotence stable vers le nouvel endpoint backend `finalize-free`.

## 7. Conclusion d’audit

- Le backend `POST /api/client/checkout/finalize-free` était prêt et sécurisé.
- Le frontend restait câblé comme si tout `paymentProvider: 'stripe'` impliquait une vente déjà finalisée.
- Le recâblage requis côté frontend était donc :
  - router les checkouts 0 € vers un écran de résultat dédié ;
  - ne jamais charger Stripe sur ce chemin ;
  - appeler `POST /api/client/checkout/finalize-free` avec `checkoutState + idempotencyKey`;
  - réutiliser le même écran de succès/échec que le retour Stripe ;
  - supprimer toute dépendance résiduelle au vieux flow `mock-pay`.
