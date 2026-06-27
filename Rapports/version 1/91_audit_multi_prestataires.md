# 91 — Audit multi-prestataires

> Lecture seule. Question centrale : le modèle actuel supporte-t-il réellement plusieurs
> prestataires, et est-ce bloquant pour V1 (React) ou seulement V2 ?

## Verdict synthétique
**Le BACKEND est déjà multi-prestataires.** Le point faible est l'**UI/UX** (implicitement
mono-praticienne par habitude) et quelques zones d'affectation. **Non bloquant V1** : la
réécriture React peut exposer le multi-prestataires sans migration de données lourde.

## Réponses aux questions

### Le modèle supporte-t-il plusieurs prestataires ?
**Oui, structurellement.**
- `PractitionerProfile` (1 par praticienne) avec `userId`, `serviceIds[]`, `isActive`,
  `slotGranularity`.
- `PractitionerSchedule` indexé `practitionerId` → planning hebdo par praticienne.
- `ScheduleException` par `practitionerId`.

### `ServiceBooking` a-t-il `practitionerId` partout ?
**Oui.** `ServiceBooking.practitionerId` requis. Index `{practitionerId, startAt:-1}` et
index unique partiel `{practitionerId, startAt}` sur statuts actifs (anti-doublon **par
praticienne**). `checkoutState.service.practitionerId` propagé du checkout au booking.

### La disponibilité gère-t-elle plusieurs plannings ?
**Oui.** `computeAvailableSlotsForPractitioner({ practitioner, schedule, ... })` est
paramétré par praticienne ; `assertServiceSlotBookable` vérifie que la praticienne offre
le service (`serviceIds`), est active, et croise SES bookings + SES occupations formation
(`listFormationOccupancies({ practitionerUserId })`). **Vérifié** : probe S06 (2 praticiennes
réservent le même créneau indépendamment) PASS ; S07 (praticienne inactive) refusé.

### Les locks sont-ils par praticienne ?
**Oui.** `BookingSlotLock` porte `practitionerId` + `slotStartAt` ; les documents de lock
sont générés par minute pour la praticienne concernée. Aucune collision inter-praticienne.

### L'UI est-elle mono-praticienne ?
**Largement oui (dette UX, pas backend).** Le planning admin et le parcours vitrine ont été
conçus autour d'une praticienne principale (cf. mémoire projet : « PractitionerProfile lié à
admin »). Le choix de praticienne existe en donnée (`practitionerId` au checkout) mais n'est
pas un parcours UI de premier plan. C'est précisément ce que React doit recâbler.

### Zones d'affectation à clarifier
- 🟡 **Affectation service→praticienne** : `serviceIds[]` sur le profil ; pas de notion de
  « praticienne par défaut » ni de répartition automatique si plusieurs praticiennes offrent
  le même service à la même heure (le client choisit, sinon la 1re fournie).
- 🟡 **Formation/instructeur** : `listFormationOccupancies({ practitionerUserId })` lie une
  session formation à `instructorId` côté `FormationSession` → une praticienne instructrice
  bloque son planning prestations. Cohérent mais couplage à documenter.
- 🟡 **Notifications** : `booking_created` cible `userId: practitionerObjectId` — déjà
  multi-destinataire potentiel.

## Migrations nécessaires
- **Données** : aucune migration lourde. Tous les documents portent déjà `practitionerId`.
- **Backend** : optionnel — règle d'affectation/round-robin si plusieurs praticiennes
  offrent le même créneau (V2) ; endpoint listant les praticiennes par service (peut exister
  via `practitionerController`).
- **UI React** : exposer le choix de praticienne, le planning par praticienne, et la vue
  agrégée multi-praticiennes. C'est le gros du travail, mais c'est le projet React lui-même.

## Bloquant V1 ou V2 ?
- **Non bloquant V1.** Le backend est prêt ; React peut livrer un parcours mono- ou
  multi-praticienne sans changer le modèle.
- **V2** : règles d'affectation automatique, équité de charge, agendas partagés.

## Score multi-prestataires : **78/100**
Backend solide (90), UI/parcours à construire (60), règles d'affectation avancées absentes (V2).
