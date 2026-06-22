# Audit Phase 1B-3 - Booking / disponibilites

## Objectif de l'audit

Fermer le P0 "calendrier / rendez-vous / disponibilites" sur les prestations:

- empecher deux creations concurrentes ou successives sur un meme slot ou sur des slots qui se chevauchent;
- revalider cote serveur qu'un slot reste valable au moment de la creation effective;
- aligner les regles entre disponibilites vitrine, validation serveur et flow de report.

## Fichiers audites

- `models/ServiceBooking.js`
- `models/PractitionerSchedule.js`
- `models/ScheduleException.js`
- `controllers/serviceBookingController.js`
- `controllers/clientController.js`
- `controllers/availabilityController.js`
- `services/sessionCancellationFlowService.js`
- `public/js/modules/serviceDetailModule.js`
- `public/js/modules/checkoutModule.js`
- `tests/README.md`
- `tests/p0/booking.doubleSlot.characterization.test.js`

## Chemins qui creent ou modifient un ServiceBooking

### Creations

- `controllers/serviceBookingController.js` -> `createBooking`
  - creation directe via `POST /api/client/bookings`
  - etat initial: `status='pending_payment'`, `paymentStatus='pending'`
  - aucune verification serveur d'overlap / planning dans l'etat audite.
- `controllers/clientController.js` -> `processServiceCheckoutStatePurchase`
  - creation finale apres paiement Stripe a partir du `checkoutState.service.slotStart/slotEnd`
  - etat initial: `status='confirmed'`, `paymentStatus='paid'` ou `deposit_paid`
  - aucune revalidation serveur du slot dans l'etat audite.
- `services/sessionCancellationFlowService.js` -> `applyFlowServiceRescheduleDecision`
  - creation d'un nouveau booking lors d'un report prestation
  - seul chemin avec une logique overlap serveur existante avant correction
  - logique incomplete et dupliquee.

### Modifications

- `controllers/serviceBookingController.js` -> `cancelMyBooking`
  - passe le booking en `cancelled`
- `controllers/serviceBookingController.js` -> `cancelBookingByAdmin`
  - passe le booking en `cancelled`
- `controllers/serviceBookingController.js` -> `markNoShow`
  - passe le booking en `no_show`
- `controllers/serviceBookingController.js` -> `markCompleted`
  - passe le booking en `completed`
- `controllers/serviceBookingController.js` -> `confirmBookingPayment`
  - ajoute `waiverAcceptedAt` et `stripePaymentIntentId`
  - ne confirme pas le booking, ne revalide rien
- `services/sessionCancellationFlowService.js` -> `applyFlowServiceRefundDecision`
  - ne modifie pas `status`, mais peut passer `paymentStatus='refunded'`

## Statuts existants et statuts bloquants

### Champs `status`

`ServiceBooking.status` autorise:

- `pending_payment`
- `confirmed`
- `cancelled`
- `no_show`
- `completed`

### Champs `paymentStatus`

`ServiceBooking.paymentStatus` autorise:

- `pending`
- `deposit_paid`
- `paid`
- `refunded`
- `cancelled`

### Conclusion sur les statuts actifs

Les statuts qui bloquent un creneau doivent etre centralises et derives de `status`, pas de `paymentStatus`.

Retenu pour la correction:

- bloquants: `pending_payment`, `confirmed`
- non bloquants: `cancelled`, `no_show`, `completed`

Motif:

- `pending_payment` reserve deja un creneau dans le flow direct `/api/client/bookings`
- `confirmed` est evidemment bloquant
- `no_show` et `completed` ne doivent pas empecher une future revente du slot; ils ne concernent que l'historique
- `paymentStatus` ne suffit pas a exprimer l'occupation planning

## Regles actuelles de disponibilite observees avant correction

### Vitrine

`controllers/availabilityController.js` -> `computeSlotsForPractitioner`

- prend le planning hebdomadaire `PractitionerSchedule`
- supporte `modify` comme remplacement des slots du jour
- supporte `block` full day comme fermeture totale
- verifie les bookings existants
- verifie les formations de l'instructrice associee
- applique `service.duration`, `service.bufferTime` et `slotGranularity`

### Limites confirmees dans l'etat audite

- aucun partage de logique avec `createBooking`
- aucun partage de logique avec `processServiceCheckoutStatePurchase`
- `block` partiel non soustrait des slots vitrine
- `add` ignore
- requete bookings trop permissive: `status != cancelled`
- requete bookings limitee a `startAt >= dayStart` et `endAt <= dayEnd`, donc mauvaise couverture des chevauchements frontiere
- revalidation inexistante au moment de la creation finale Stripe
- construction date/heure heterogene entre endpoints

## Logique overlap existante avant correction

### `createBooking`

- aucune logique overlap
- insertion directe dans `service_bookings`

### `processServiceCheckoutStatePurchase`

- aucune logique overlap
- creation directe depuis `checkoutState.service.slotStart/slotEnd`

### `applyFlowServiceRescheduleDecision`

- verifie un overlap service sur:
  - `practitionerId`
  - `status not in ['cancelled', 'no_show']`
  - `startAt < endDate && endAt > startDate`
- verifie ensuite un overlap avec les sessions de formation
- ne verifie pas:
  - planning hebdomadaire
  - exceptions `modify` / `block` partiel / `add`
  - coherences `duration` / `slotEnd`
  - grille de `slotGranularity`
- reste vulnerable a la concurrence car le check et l'insert ne sont pas proteges par un verrou persistant

## Endpoints concernes

### Creation / confirmation

- `POST /api/client/bookings`
- `POST /api/stripe/create-checkout-session`
- webhook Stripe -> `processCheckoutStatePurchase` -> `processServiceCheckoutStatePurchase`
- `POST /api/client/session-cancel-flows/:flowId/service-reschedule`

### Lecture disponibilites

- `GET /api/vitrine/availability/slots`
- `GET /api/vitrine/availability/days`

### Liberation d'un slot

- `POST /api/client/bookings/:bookingId/cancel`
- `POST /api/gestion/bookings/:bookingId/cancel`

## Indexes existants avant correction

### `ServiceBooking`

- unique `bookingId`
- index `{ clientId, startAt: -1 }`
- index `{ practitionerId, startAt: 1 }`
- index `{ serviceId: 1 }`

### `ScheduleException`

- unique `{ practitionerId, date }`
- implique un seul document d'exception par praticienne et par jour

### Manque confirme

- aucun garde base sur l'intervalle occupe
- un unique `{ practitionerId, startAt }` serait insuffisant contre les chevauchements partiels

## Risques confirmes

- double booking exact possible sur `/api/client/bookings`
- double booking partiel possible
- checkout Stripe base sur un `slotStart/slotEnd` forgeable ou stale
- absence de refus des slots passes
- absence de refus des slots hors planning
- absence de refus des blocks partiels
- incoherence potentielle entre creneaux affiches et creneaux acceptes serveur
- report prestation protege differemment des autres chemins

## Plan minimal de correction retenu

### 1. Centraliser les statuts actifs

- creer `ACTIVE_SERVICE_BOOKING_STATUSES`
- supprimer les listes dispersees ou implicites

### 2. Centraliser la validation serveur du slot

- creer `services/serviceAvailabilityService.js`
- y exposer:
  - `computeAvailableSlotsForPractitioner`
  - `assertServiceSlotBookable`
  - helpers temps / planning / exceptions

### 3. Aligner la vitrine sur la meme logique

- faire consommer `computeAvailableSlotsForPractitioner` par:
  - `GET /api/vitrine/availability/slots`
  - `GET /api/vitrine/availability/days`

### 4. Fermer la concurrence

- ajouter une collection dediee `BookingSlotLock`
- verrou minute par minute sur le temps reel occupe par la prestation
- index unique `{ practitionerId, slotStartAt }`
- liberation des locks sur annulation client/admin
- garde complementaire possible sur `ServiceBooking(practitionerId,startAt)` en partial unique actif

### 5. Recabler tous les chemins de creation

- `createBooking`
- `processServiceCheckoutStatePurchase`
- `applyFlowServiceRescheduleDecision`
- preflight Stripe `create-checkout-session`

### 6. Couvrir en tests P0

- meme slot concurrent
- chevauchement partiel
- slot passe
- slot hors planning
- slot bloque partiellement
- slot `modify` autorise
- revalidation serveur au moment de la creation finale

## Limites connues deja identifiees avant implementation

- les bookings `pending_payment` sans expiration metier resteront bloquants tant qu'aucun cleanup dedie n'existe
- le verrou minute par minute est robuste pour V1 mais a un cout documentaire en volume d'ecriture
- la gestion fine des buffers entre prestations heterogenes reste un sujet de modelisation a surveiller apres fermeture du P0
