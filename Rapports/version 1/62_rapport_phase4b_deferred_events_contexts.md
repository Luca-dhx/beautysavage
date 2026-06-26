# 62 — Rapport Phase 4B : events différés + contextId emails

> Repo `backend/`, branche `phase-0-security-baseline`, base `8c9b88e`.
> **Tests : 37 fichiers / 151 verts** (était 140, +11). Aucun secret/email affiché.
> **Audit-only** : aucun effet de bord, aucun subscriber métier, aucun email/notif
> déclenché par event, montants/flux inchangés.

## 1. Events nouvellement émis (5)

| Event | Point d'émission |
|---|---|
| `booking.reminded` | `automatisme/bookingRemindersJob.js` (après `remindersSent` push) |
| `booking.no_show_marked` | `serviceBookingController.markNoShow` (après `booking.save()`) |
| `booking.client_suspended` | `serviceBookingController.markNoShow` (après suspension client) |
| `commission.paid` | `commissionPaymentController` (×2 : `createCommissionIntent`, `checkCommissionStatus`) |
| `gift_card.created` | `services/giftCardService.createCompensationGiftCard` (jamais le mot de passe) |

> `refund.succeeded` couvre **aussi** désormais le chemin **Stripe webhook** :
> `handleRefundUpdatedEvent` appelle `sendRefundConfirmedEmailInternal` qui émet
> déjà l'événement (constaté en Phase 4B — aucun câblage ajouté).

**Total events métier émis (audit)** : 15 (10 de Phase 4A + 5 de Phase 4B), plus
les `email.*` (Phase 2/3).

## 2. Events encore différés

`gift_card.used` (débit partagé avec rollback ; point propre = settlement),
`refund.recovered` (couvert indirectement via `refund.succeeded`), `refund.failed`
(pas d'état terminal `failed`), `formation.session_cancelled/updated` (flux
par-achat, pas de point session-level unique). Raisons détaillées : rapport 61.

## 3. contextId emails ajoutés

- **Dispatchers** `sendStatusMail`, `sendSingleTemplateMail`, `sendPremiumHtmlEmail`
  acceptent un `context` optionnel → `postToBrevo(payload, context)`
  (rétro-compatible : sans `context`, le `contextType` reste auto-dérivé du tag).
- **refund** → `contextType: refund_request`, `contextId: refundId`
  (`sendRefundConfirmedEmail`, 2 chemins service/non-service).
- **commission** → `contextType: commission_payment`, `contextId: payment._id`
  (`commissionReminderJob` passe le contexte aux 2 senders).
- **system** (`site_*`/maintenance) → `contextType: system`, `contextId: null`
  (auto-dérivé ; pas d'objet métier).

**Différés** (dispatcher prêt, threading caller non fait) : emails **gift_card**
(compensation) et **session/formation**. Le `contextType` y est **déjà**
auto-dérivé ; seul le `contextId` manque → trivial à ajouter en Phase 4C.

## 4. Payload safety

- Events : `businessEventService` n'extrait que des identifiants/montants ;
  `gift_card.created` n'inclut **jamais** `password/passwordHash/passwordEncrypted`
  (test dédié). Défense en profondeur : redaction du bus.
- SendLog : `recipientHash` (SHA-256) — jamais l'email. Tests :
  `sendLogContextAttachment.test.js` vérifie contextType/contextId + absence
  d'email.

## 5. Garanties (inchangées)

- Émission **best-effort**, **post-mutation**, jamais de throw au métier.
- **Aucun subscriber métier** → `publishToSubscribers` ne fait rien → **zéro effet
  de bord**. Test : émettre ces events ne crée **aucun** SendLog.
- 151 tests verts (suites paiement/refund/booking/commission **inchangées**).

## 6. Limites V1

- Broadcast d'audit : les events ne déclenchent rien.
- Couverture : 15 events métier émis ; certains différés (rapport 61).
- contextId emails : refund + commission faits ; gift_card/session différés.
- Pas de TTL/rétention EventLog/SendLog.

## 7. Future migration notifications

Inchangé (rapport 55) : ajouter des **subscribers** (notification/email)
idempotents derrière le bus, **sans envoi automatique** tant que la discipline V1
tient. La timeline métier (15 events) est désormais assez riche pour préparer cette
bascule.

## 8. Future relation Template Studio

`email.*` (par `templateKey`, désormais avec `contextType/contextId` plus complet)
+ events métier alimenteront les analytics du futur **Studio Email Template**
(post-React) : délivrabilité/engagement par template **et** par objet métier
(refund, commission, sale, booking…).

## 9. Prochaine phase recommandée

**Phase 4C** : compléter les `contextId` emails restants (gift_card, session via
les dispatchers déjà prêts), brancher `formation.session_*` au niveau contrôleur
de session si un point propre existe, puis **migration progressive des
notifications** derrière le bus. Ensuite **versioning des templates email**
(draft→publish). Toujours backend, avant React.
