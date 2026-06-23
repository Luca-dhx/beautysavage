# Audit Phase 1B-5 - Expiration et liberation auto des `pending_payment`

## 1. Objectif
Verifier le point de depart du flow `pending_payment` avant de remplacer le nettoyage destructif par une expiration applicative et une liberation de verrous.

## 2. Commit de depart
`93fec794b94e3130eccb0dee0d57741587683d8a` - `Audit P0 stabilization completion`

## 3. Fichiers lus
- `Rapports/version 1/29_rapport_phase1b3_booking_disponibilites.md`
- `Rapports/version 1/32_rapport_phase1b4_zero_payment.md`
- `Rapports/version 1/34_rapport_phase1b4b_front_zero_payment.md`
- `Rapports/version 1/35_audit_consolidation_p0.md`
- `architecture.md`
- `projectContext.json`
- `models/ServiceBooking.js`
- `models/BookingSlotLock.js`
- `services/serviceAvailabilityService.js`
- `controllers/stripeController.js`
- `controllers/clientController.js`
- `app.js`
- `tests/README.md`

## 4. Tests executes
- Pas encore executes a ce stade.

## 5. Resultat global
Le probleme P0 est toujours ouvert: les `pending_payment` qui vieillissent restent bloquants tant qu ils ne sont pas annules manuellement, et le job actuel supprime les documents au lieu de les expirer proprement.

## 6. Points d audit
- `ServiceBooking.status` ne contient pas `expired`; les statuts actifs restent `pending_payment` et `confirmed`.
- `BookingSlotLock` est la bonne source de verrous minute par minute et possede deja un nettoyage par `bookingId`.
- `releaseServiceBookingSlotLocks({ bookingId })` existe deja et doit etre reutilise pour eviter tout nouveau flow parallele.
- `controllers/serviceBookingController.js#createBooking` cree un booking `pending_payment` + locks. Le branch `free` met `paymentStatus = paid` et `saleId`, mais laisse le status a `pending_payment`.
- `controllers/serviceBookingController.js#confirmBookingPayment` ne passe pas le booking en `confirmed`; il stocke seulement `stripePaymentIntentId` et la waiver.
- `app.js` demarre encore `startExpiredBookingsCleanupJob()`, qui fait un `deleteMany()` sur les bookings vieux de 2h.

## 7. Anomalies detectees
- Le cleanup courant est destructif: il supprime les reservations au lieu de les faire passer dans un statut terminal.
- Sans filtre supplementaire, un cleanup base uniquement sur `status = pending_payment` casserait les cas deja payes mais pas encore reclasses, notamment les flows `free` ou tout flow qui conserve `paymentStatus != pending`.
- `projectContext.json` a deja un diff de documentation zero-payment en cours dans le worktree. Ce diff est un reste du commit precedent et doit etre traite comme tel dans ce chantier.

## 8. Warnings index Mongoose
- Aucun warning d index duplique n est lie a ce chantier a ce stade.

## 9. Coherence documentation
- `tests/README.md`, `architecture.md` et `projectContext.json` documentent encore l absence de cleanup applicatif pour `pending_payment`.
- La doc zero-payment est deja alignee avec `finalize-free`; le nouveau travail devra seulement retirer le risque ouvert sur `pending_payment`.

## 10. Risques restants non P0
- Aucun nouveau risque hors perimetre n a ete identifie a ce stade.

## 11. Recommandations P1
- Introduire un job dedie `pendingPaymentCleanupJob` qui:
  - cible uniquement les bookings encore en attente reelle;
  - libere d abord les verrous associes;
  - marque ensuite le booking comme termine de facon idempotente;
  - reste ignore en test.

## 12. Commandes executees
- `git status --short --branch`
- `git diff -- projectContext.json`
- `git rev-parse HEAD`
- `git branch --show-current`
- lectures cibl ees des fichiers list es ci-dessus

## 13. Decision
Prêt pour implementation du cleanup applicatif. Aucun correctif ne doit encore etre applique dans ce rapport.
