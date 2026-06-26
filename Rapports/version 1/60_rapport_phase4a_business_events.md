# 60 — Rapport Phase 4A : émission des événements métier (audit)

> Repo `backend/`, branche `phase-0-security-baseline`, base `106cab7`.
> **Tests : 35 fichiers / 140 verts** (était 130, +10). Aucun secret/email affiché.
> **Audit uniquement** : aucun effet de bord métier, aucun subscriber actif, aucun
> email/notification déclenché par event, aucun montant/flux modifié.

## 1. Livré

| Élément | Fichier |
|---|---|
| Catalogue étendu | `constants/eventCatalog.js` (~40 events, domaines sale/booking/refund/gift_card/commission/formation/email/job) |
| Helper d'émission métier | `services/businessEventService.js` |
| Branchements (audit) | `clientController.js`, `serviceBookingController.js`, `refundRequestService.js`, `refundExecutionService.js`, `refundGiftCardService.js`, `commissionReminderJob.js` |
| Tests | `tests/p1/businessEvents.test.js`, `tests/p1/businessEventPayloadSafety.test.js` |
| Rapports | 59 (audit), 60 (ce rapport) |

## 2. Events réellement émis (10)

`sale.finalized`, `sale.zero_payment_finalized`, `booking.created`,
`booking.confirmed`, `booking.cancelled` (client + admin), `refund.requested`,
`refund.succeeded` (chemin carte cadeau), `gift_card.recredited`,
`commission.available`, `commission.reminder_sent`.

> Rappel : les `email.*` sont déjà émis depuis la Phase 3 (SendLog). Au total
> EventLog reçoit maintenant des événements **sale / booking / refund / gift_card /
> commission / email**.

## 3. Events catalogués mais NON branchés (différés)

`sale.created` (alias de finalized), `booking.reminded`, `booking.no_show(_marked)`,
`booking.client_suspended`, `booking.pending_payment_expired` (N/A — pas d'état
pending), `refund.execution_started`, `refund.confirmed` (alias), `refund.failed`
(pas d'état terminal `failed`), `refund.recovered`, `gift_card.created`,
`gift_card.used`, `commission.paid`, `formation.session_cancelled/updated`,
`job.*`. Détails et raisons : rapport 59.

## 4. Payload safety

`businessEventService` ne construit que des **identifiants/montants non
sensibles**. En défense en profondeur, `eventBusService` **redacte** tout payload
(clés `email/secret/token/password/recipient/...` → `[redacted]`, emails en valeur
→ `[redacted-email]`, profondeur/taille bornées). Tests dédiés
(`businessEventPayloadSafety.test.js`) : email client, IP, secret-like, et
`extra` contenant email/token/password → **aucune fuite**.

## 5. Garanties (audit-only)

- Émission **post-mutation**, **best-effort** : `businessEventService` ne throw
  jamais ; `emitEvent` persiste l'EventLog en best-effort sans throw.
- **Aucun subscriber métier** enregistré → `publishToSubscribers` ne fait rien →
  **zéro effet de bord**. Test : émettre des events métier ne crée **aucun**
  SendLog (pas d'email).
- **Aucun changement de résultat métier** : 140 tests verts, dont les suites
  paiement/refund/booking existantes inchangées.

## 6. contextType / contextId (Partie 5)

- **contextType** : déjà **auto-dérivé** (Phase 3) pour tous les emails
  (refund_*→`refund_request`, commission_*→`commission_payment`,
  gift_card_*→`gift_card`, session/formation→`formation_session`). Les **events
  métier** portent un contextType explicite (sale, service_booking,
  refund_request, commission_payment, gift_card).
- **contextId** : rattaché pour les events métier branchés (saleId, bookingId,
  refundId, commissionPaymentId). Côté **emails**, le `contextId` reste **différé**
  pour refund/commission/gift_card/session (envois via dispatchers partagés
  `sendSingleTemplateMail`/`sendPremiumHtmlEmail`) afin de ne pas refactorer
  massivement `mailService.js`. **Documenté comme différé** (Phase 4B : propager
  l'id via les dispatchers).

## 7. Limites V1

- **Broadcast d'audit** : les events ne déclenchent rien (pas d'email, pas de
  notif, pas de transition).
- Couverture partielle (10 events émis ; le reste catalogué/différé — rapport 59).
- `refund.succeeded` couvre le chemin carte cadeau synchrone ; les remboursements
  **Stripe** confirmés via webhook n'émettent pas encore (différé).
- Pas de rétention/TTL EventLog (purge à prévoir si volume).

## 8. Future migration notifications

Les notifications in-app (`triggerNotification`) restent **appelées en ligne**
(inchangé). Le plan (rapport 55) : ajouter des **subscribers** (notification/email)
derrière le bus, idempotents, **sans envoi automatique** tant que la discipline V1
tient. Les events métier émis ici **préparent** cette bascule (la timeline existe).

## 9. Future relation Template Studio

`email.*` (par `templateKey`) + events métier (par `contextType/contextId`)
fourniront au futur **Studio Email Template** (post-React) : analytics de
délivrabilité/engagement **par template** et **par domaine métier**, et le lien
« un envoi ↔ son objet métier ».

## 10. Prochaine phase recommandée

**Phase 4B** : brancher les events différés sûrs (`booking.reminded`,
`gift_card.used`, `commission.paid`, `formation.session_*`), rattacher les
`contextId` d'emails via les dispatchers, puis **migration progressive des
notifications** derrière le bus (idempotent, sans envoi auto). Puis versioning des
templates email. Toujours backend, avant React.
