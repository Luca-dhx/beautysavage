# 165 — Audit pré-R2A : préparation checkout React (panier, créneau, consentements)

> Audit avant la couche React de **préparation** du checkout (sans paiement). Branche
> `phase-0-security-baseline`. Suite de R1 (158/159) + Theme (160-164).

## 1. Parcours Vanilla actuel (réservation prestation)

`serviceDetailModule.js` : calendrier 2 étapes → « Continuer » →
`requestVitrineNavigation('checkout', { query:{ serviceSlug, slotStart, slotEnd, practitionerId } })`
(**aucune** réservation créée à ce stade). `checkoutModule.js` (mode service) : récap créneau +
options + CGV/waiver → build `checkoutState`. Navigation `payment` (payant) ou `finalizePurchase`
(gratuit). Le **lock du créneau** n'a lieu qu'au checkout backend (`assertServiceSlotBookable`) puis
à la finalisation (webhook). → En R2A, React **ne fait que collecter le choix** ; aucun lock.

## 2. Endpoints disponibles (publics, inchangés)

| Endpoint | Réponse | Notes |
|---|---|---|
| `GET /api/vitrine/services/:slug` | `{ok, service{...practitioners[]}}` | détail prestation (clé slug) |
| `GET /api/vitrine/availability/days?serviceId=&month=&year=` | `{ok, availableDays:["YYYY-MM-DD"]}` | jours dispo du mois |
| `GET /api/vitrine/availability/slots?serviceId=&date=&practitionerId?` | `{ok, slots:[{start,end,practitionerId}]}` | créneaux d'un jour |
| `GET /api/site-status` | `{ok, status, reason, eta}` | blocage achat (déjà branché R1) |

**Formats** : `slot.start`/`slot.end` = `"YYYY-MM-DDTHH:mm"` (sans secondes ni timezone) ;
`availableDays` = `["YYYY-MM-DD"]`. **Montants en euros** (Number, comme R1).

## 3. Payload checkout existant (à MIRROIR, sans envoyer)

`checkoutState.service` (Vanilla) :
```
service: { serviceId, slotStart, slotEnd, practitionerId|null, selectedOptions:[{optionId,name,price}] }
legal:   { acceptedCgv:true, waiverRequired, waiverAccepted, waiverType, waiverAcceptedAt|null }
```
Backend `createCheckoutSession` (mode service) **exige** : `service.serviceId`, `service.slotStart`,
`service.slotEnd` (sinon 400 `CHECKOUT_CONTEXT_INVALID`) et `legal.acceptedCgv` (sinon 400
`LEGAL_VALIDATION_REQUIRED`) ; waiver manquant → `LEGAL_CONSENT_REQUIRED`. Le créneau est revalidé
serveur (`assertServiceSlotBookable`). **Le serveur fait foi** sur prix/dispo/lock.

## 4. Consentements requis

- **CGV** (`legal.acceptedCgv` = true) — bloquant.
- **Droit de rétractation** : information + waiver si la prestation est datée et proche
  (calculé serveur selon `cancellationDays`) → `legal.waiverAccepted`/`waiverType`/`waiverAcceptedAt`.
- (Panier multi-items : `consumerWaivers[]` + `refundPolicySnapshots{}` par formation — hors R2A,
  on se concentre sur la prestation.)
En R2A : la checklist React est **UX** ; le backend reste l'autorité (re-dérive les waivers requis).

## 5. Disponibilité / calendrier

`days` (mois) → sélection d'un jour dispo → `slots` (jour) → sélection d'un créneau →
ajout panier avec `selectedSlot {slotStart, slotEnd, practitionerId}`. États loading/empty/erreur/
créneau indisponible gérés côté React. **Aucun lock front.**

## 6. Risques

| Risque | Mitigation |
|---|---|
| Laisser croire que le créneau est réservé | message explicite « confirmé après paiement/validation » ; pas de lock. |
| Recalcul de prix côté front | panier **indicatif** (euros) ; backend recalcule tout. |
| Déclencher Stripe | R2A **n'appelle jamais** `create-checkout-session` ni Stripe ; bouton « Préparer » affiche seulement le payload. |
| Hex en dur | composants via tokens `--bs-*` ; styles couleur en CSS classes `@bs/ui`/tokens.css. |
| localStorage corrompu / version | `CART_VERSION` ; version incompatible → reset propre. |
| Secret front | aucun ; endpoints publics. |

## 7. Plan R2A

1. `@bs/api-client/booking/` : `types.ts` (AvailabilitySlot, SelectedServiceSlot, LegalConsentState,
   CheckoutLine, CheckoutDraft, CheckoutPreparationPayload), `availability.ts`
   (getServiceAvailableDays/Slots), `checkoutPreparation.ts` (builder pur, **aucun réseau/Stripe**),
   `legalConsents.ts` (état + complétude).
2. `apps/vitrine/src/features/cart/` : `CartProvider`/`useCart`, localStorage versionné, add/remove/
   update/clear, résumé indicatif. Tests.
3. `apps/vitrine/src/features/booking/` : hooks dispo + `AvailabilityCalendar`, `SlotPicker`,
   `SelectedSlotSummary`, `ServiceBookingPanel` (sur la fiche prestation). États loading/empty/erreur.
4. `apps/vitrine/src/features/legal/` : `LegalConsentChecklist`, `legalConsentTypes`,
   `buildLegalConsentPayload`.
5. Pages réelles `/panier` et `/checkout` (préparation, **sans Stripe**, payload en debug `<details>`).
6. Thème : tout en `--bs-*`, responsive, aucun hex.
7. Tests frontend + build/lint/typecheck ; suite backend verte ; docs + rapport 166.

## Hors périmètre (rappel)
Aucun paiement Stripe, aucune redirection hosted, aucun finalize-free, aucune carte cadeau payante,
pas de panier produit/formation avancé, pas d'espace client, pas de manager/dev. **R2B** branchera
le paiement Stripe Checkout hébergé.
