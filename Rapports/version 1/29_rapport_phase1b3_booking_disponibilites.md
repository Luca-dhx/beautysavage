# Rapport Phase 1B-3 - Booking / disponibilites

## 1. Objectif

Fermer le P0 prestations/calandrier sur trois axes:

- empecher le double-booking exact et le chevauchement partiel;
- revalider cote serveur qu'un slot est toujours reservable au moment de la creation effective;
- rendre coherentes les disponibilites vitrine, les validations serveur et le flow de report prestation.

## 2. Fichiers audites

- `models/ServiceBooking.js`
- `models/PractitionerSchedule.js`
- `models/ScheduleException.js`
- `controllers/serviceBookingController.js`
- `controllers/clientController.js`
- `controllers/availabilityController.js`
- `controllers/stripeController.js`
- `services/sessionCancellationFlowService.js`
- `public/js/modules/serviceDetailModule.js`
- `public/js/modules/checkoutModule.js`
- `tests/README.md`
- `tests/p0/booking.doubleSlot.characterization.test.js`

## 3. Fichiers modifies

- `constants/serviceBooking.js`
- `models/BookingSlotLock.js`
- `models/ServiceBooking.js`
- `services/serviceAvailabilityService.js`
- `controllers/serviceBookingController.js`
- `controllers/clientController.js`
- `controllers/availabilityController.js`
- `controllers/stripeController.js`
- `services/sessionCancellationFlowService.js`
- `tests/setup/seedTestData.js`
- `tests/p0/booking.doubleSlot.characterization.test.js`
- `tests/p0/booking.slotRevalidation.test.js`
- `tests/README.md`
- `Rapports/version 1/28_audit_phase1b3_booking_disponibilites.md`
- `Rapports/version 1/29_rapport_phase1b3_booking_disponibilites.md`

## 4. Strategie anti double-booking

- centralisation des statuts bloquants via `ACTIVE_SERVICE_BOOKING_STATUSES`
- centralisation de la validation dans `services/serviceAvailabilityService.js`
- creation protegee via `createServiceBookingWithProtection`
- verrou persistant `BookingSlotLock` minute par minute sur le temps reel occupe
- index unique `booking_slot_locks(practitionerId, slotStartAt)`
- garde complementaire `ServiceBooking` sur `(practitionerId, startAt)` en partial unique actif
- liberation des locks sur annulation client et annulation admin

Resultat:

- deux reservations concurrentes au meme `startAt` ne passent plus
- deux reservations concurrentes en chevauchement partiel ne passent plus
- le flow de report prestation passe par la meme protection

## 5. Strategie de revalidation serveur

- `assertServiceSlotBookable` revalide:
  - service actif et reservable
  - praticienne active et rattachee au service
  - validite de `startAt` / `endAt`
  - `startAt < endAt`
  - slot futur
  - `endAt == startAt + duration service`
  - respect du planning et de la granularite
  - exceptions `modify`, `block` full day, `block` partiel, `add`
  - indisponibilites liees au lunch break
  - indisponibilites liees aux sessions de formation
  - indisponibilites liees aux bookings actifs
- cette validation est appelee sur:
  - `POST /api/client/bookings`
  - `POST /api/stripe/create-checkout-session` en preflight
  - `processServiceCheckoutStatePurchase` apres paiement
  - `applyFlowServiceRescheduleDecision`

Comportement si paiement deja confirme mais booking impossible:

- le booking n'est pas cree
- une erreur serveur metier est renvoyee
- aucun remboursement automatique nouveau n'a ete ajoute dans cette phase

## 6. Regles de statuts actifs

Statuts bloquants retenus:

- `pending_payment`
- `confirmed`

Statuts non bloquants:

- `cancelled`
- `no_show`
- `completed`

Le champ `paymentStatus` n'est pas utilise comme source de verite planning.

## 7. Gestion des exceptions planning

- `modify` remplace les slots du jour
- `block` full day ferme completement le jour
- `block` partiel est soustrait aux intervalles disponibles
- `add` est maintenant supporte dans le moteur de disponibilite serveur
- `lunchBreak` est traite comme indisponibilite

Effet de coherence:

- la vitrine (`/api/vitrine/availability/slots` et `/days`) consomme la meme logique que la validation serveur
- le report prestation reutilise la meme validation que la creation standard

## 8. Tests ajoutes / modifies

- `tests/p0/booking.doubleSlot.characterization.test.js`
  - conversion en regression verte
  - double-booking exact concurrent
  - chevauchement partiel concurrent
  - slot passe
  - slot hors planning
  - slot bloque partiellement
  - slot autorise via `modify`
  - liberation apres annulation client
- `tests/p0/booking.slotRevalidation.test.js`
  - revalidation serveur du slot lors de la creation finale post-paiement
- `tests/setup/seedTestData.js`
  - slot de test force sur un jour ouvrable pour garder les tests deterministes
- `tests/README.md`
  - mise a jour de l'etat du harness

## 9. Resultats exacts des tests

### `npm run test:p0`

- resultat: `Test Files 12 passed (12)`
- resultat: `Tests 31 passed | 1 todo (32)`

### `npm run test:integration`

- resultat: `Test Files 2 passed (2)`
- resultat: `Tests 6 passed (6)`

### `npm test`

- resultat: `Test Files 14 passed (14)`
- resultat: `Tests 37 passed | 1 todo (38)`

Todo restant attendu:

- `tests/p0/giftcard.zeroPayment.characterization.test.js`

## 10. Risques fermes

- double-booking exact sur `/api/client/bookings`
- chevauchement partiel sur `/api/client/bookings`
- acceptation de slots passes
- acceptation de slots hors planning
- acceptation de slots bloques partiellement
- absence de revalidation serveur au checkout Stripe
- divergence entre disponibilites vitrine et validation serveur
- flow de report prestation moins protege que le flow standard

## 11. Limites connues

- le verrou minute par minute ecrit plus de documents qu'un simple `slotKey`; c'est un choix V1 de robustesse
- les bookings `pending_payment` n'ont toujours pas de mecanisme d'expiration automatique dans cette phase
- si un paiement Stripe reussit puis que le slot devient indisponible juste avant la creation finale, le booking est refuse mais aucun remboursement automatique nouveau n'est declenche ici

## 12. Risques volontairement non traites

- bug 0 EUR carte cadeau
- logique de remboursements hors impact direct
- refonte UX / React / roles
- nettoyage global des warnings d'indexes du projet

## 13. Impacts production

- ajout d'une nouvelle collection `booking_slot_locks`
- ajout d'un index unique partiel actif sur `service_bookings`
- durcissement des validations serveur sur les endpoints booking et checkout Stripe
- refus explicite des slots invalides/stales avant la creation effective

## 14. Points de vigilance donnees legacy

- si la base contient deja des doublons actifs exacts sur `(practitionerId, startAt)`, la creation de l'index partial unique devra etre verifiee avant prod
- les anciens bookings deja presents avant deploiement n'auront pas de locks backfilles; ils restent toutefois pris en compte par les checks d'overlap applicatifs
- si la base contient deja des chevauchements actifs historiques, la phase ne les corrige pas automatiquement

## 15. Commandes executees

```bash
npm test -- --run tests/p0/booking.doubleSlot.characterization.test.js tests/p0/booking.slotRevalidation.test.js
npm run test:p0
npm run test:integration
npm test
```

## 16. Recommandation Phase 1B-4

Priorite recommandee:

- ajouter une expiration metier des `pending_payment` service avec liberation automatique des locks
- documenter / automatiser la gestion post-paiement si webhook Stripe aboutit sur un slot devenu indisponible
- prevoir un script de diagnostic/backfill pour detecter les overlaps legacy avant generalisation prod
