# 166 — Rapport React R2A : préparation checkout (panier, créneau, consentements)

> Couche React de **préparation** du checkout : panier local, sélection de créneau prestation,
> disponibilités, consentements légaux, résumé. **Aucun paiement / aucun appel Stripe / aucun
> create-checkout-session.** Branche `phase-0-security-baseline`. Suite de l'audit 165.

## Objectif

Permettre à l'utilisateur de composer son panier (prestation + créneau) et de préparer la commande
(consentements + payload), sans rien payer. Le paiement Stripe Checkout hébergé arrive en **R2B**.

## 1. API client réservation (`@bs/api-client/booking/`)

- `types.ts` : `AvailabilitySlot {start,end,practitionerId}`, `BookingAvailabilityResponse`,
  `SelectedServiceSlot`, `SelectedServiceOption`, `CartItemKind`, `LegalConsentState`, `CheckoutLine`,
  `CheckoutDraft`, `CheckoutPreparationPayload`.
- `availability.ts` : `getServiceAvailableDays({serviceId,year,month})` → `["YYYY-MM-DD"]` ;
  `getServiceAvailableSlots({serviceId,date,practitionerId?})` → `AvailabilitySlot[]` (mapping fidèle,
  `start/end` = `"YYYY-MM-DDTHH:mm"`).
- `legalConsents.ts` : `EMPTY_LEGAL_CONSENT`, `isLegalConsentComplete(state, req)` (CGV toujours
  requise + acks conditionnels).
- `checkoutPreparation.ts` : `buildCheckoutPreparationPayload({lines, legal, preparedAt})` — **pur**,
  **aucun réseau / aucun Stripe** ; mirroir partiel de `checkoutState` backend (`service` + `legal`),
  pour R2B.
- **Le backend reste source de vérité** : prix indicatifs en **euros**, jamais recalculés comme
  autorité côté front ; dispo/lock revalidés serveur.

## 2. Panier React local (`apps/vitrine/src/features/cart/`)

`CartProvider` / `useCart` : `addService`, `removeItem`, `updateItem`, `clearCart`, `items`,
`summary {count, indicativeTotal}`. Persistance `localStorage` (`bs_cart`, **versionnée** `CART_VERSION`
→ version/forme incompatible = reset propre). `lineId` unique (`crypto.randomUUID` + fallback).
`ServiceCartItem` porte `selectedSlot` + `selectedOptions` + `indicativePrice` (jamais autoritaire).

## 3. Sélection prestation / calendrier (`apps/vitrine/src/features/booking/`)

- Hooks TanStack Query : `useServiceAvailableDays`, `useServiceAvailableSlots`.
- `AvailabilityCalendar` (calendrier mensuel simple, nav mois, jours dispo cliquables),
  `SlotPicker` (créneaux du jour : loading / empty / erreur), `SelectedSlotSummary`,
  `ServiceBookingPanel` (orchestration sur la fiche prestation : « Choisir un créneau » → jour →
  créneau → « Ajouter au panier »). `dateUtils` (matrice mois, formats).
- **Aucune réservation / aucun lock front** : message explicite « ce créneau n'est pas réservé : il
  sera confirmé après paiement / validation ».

## 4. Consentements légaux (`apps/vitrine/src/features/legal/`)

`LegalConsentChecklist` (CGV, information rétractation, prestation datée), `legalConsentTypes`,
`buildLegalConsentPayload`. Validation **UX** (`isLegalConsentComplete`) ; le backend reste l'autorité
(re-dérive les waivers requis, codes `LEGAL_VALIDATION_REQUIRED` / `LEGAL_CONSENT_REQUIRED`).

## 5. Pages `/panier` et `/checkout`

- **`/panier`** : liste des items (prestation + créneau), retrait, total indicatif, CTA « Continuer »
  → `/checkout` ; vide → `EmptyState`. (Routes sorties de `RequireAuth` : panier local consultable
  sans connexion ; l'auth/paiement seront gérés en R2B/backend.)
- **`/checkout`** : récap + `LegalConsentChecklist`. Bouton **« Préparer le paiement » désactivé**
  tant que les consentements requis ne sont pas cochés. Au clic : `buildCheckoutPreparationPayload`
  → payload affiché en `<details>` debug. **Aucun appel Stripe** ; message « paiement activé en R2B ».

## 6. Thème / UI

Tous les nouveaux composants utilisent `@bs/ui` + CSS variables `--bs-*` (classes calendrier/créneau/
consent/debug ajoutées à `tokens.css`, couleurs via `color-mix`/vars). **Aucun hex dans les `.tsx`**
(vérifié). Responsive (grille calendrier, créneaux en flex-wrap).

## 7. Tests

### Frontend (`npm run react:test`) — 54 verts (+13 vs T1)
- `@bs/api-client/booking/booking.test.ts` (5) : mapping dispo (slots/jours), `isLegalConsentComplete`,
  `buildCheckoutPreparationPayload` (pur, sans réseau).
- `apps/vitrine/src/features/cart/cart.test.tsx` (4) : storage vide/roundtrip, version incompatible →
  reset, add/remove/persist/résumé.
- `apps/vitrine/src/pages/r2aFlow.test.tsx` (6) : panier vide, panier prestation+créneau+retrait,
  checkout bouton désactivé→payload (slot+consentements), **aucun appel réseau lors de la préparation**,
  sélection jour→créneau→ajout panier, jour sans créneau → empty.
- `react:lint` vert, `typecheck` vert, `react:build` (2 apps) OK.

### Backend (inchangé)
`npm test` (404) + `audit:business-scenarios` (36) + `audit:commissions` (20) verts. **Aucun fichier
backend modifié.**

## 8. Limites R2A

- **Aucun paiement** : pas de Stripe, pas de redirection hosted, pas de finalize-free, pas de carte
  cadeau payante.
- Panier centré **prestation** (service + créneau) ; produits/formations/cartes cadeaux pas ajoutés
  au panier en R2A.
- Panier **indicatif** : prix/dispo/lock = backend.
- Pas d'espace client, pas de manager/dev.

## 9. Prochaine mission — React R2B

Brancher le **paiement** : depuis `/checkout`, envoyer le payload préparé à
`create-checkout-session` (flag `CHECKOUT_HOSTED`) → `{mode:'hosted', url}` (redirection Stripe
Checkout) ou `{mode:'free'}` → finalize-free (0 €). Pages retour `/paiement/succes` & `/annule`
(`payment-result`). Auth client au paiement.
