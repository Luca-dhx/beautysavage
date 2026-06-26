# 54 — Audit des domaines d'événements & notifications

> Repo `backend/`, branche `phase-0-security-baseline`, base `1178379`.
> Aucune valeur de secret ni email réel n'est affichée.
> Cartographie des « événements implicites » actuels (actions métier qui, demain,
> émettront un événement) et des notifications/emails liés.

## Tableau des domaines

| Domaine | Événement actuel implicite | Fichier(s) | Notification / email lié | À migrer plus tard ? |
|---|---|---|---|---|
| **sale** | Vente persistée (webhook Stripe) | `controllers/clientController.js`, `stripeController.js` | email `vente` (`sendSaleEmail`) + notif in-app | Oui — `sale.created` / `sale.email_sent` |
| **email** | Envoi Brevo + engagement | `services/mailService.js`, `controllers/brevoWebhookController.js` | — (c'est le canal) | **Fait** — `email.*` branchés sur SendLog |
| **service_booking** | Réservation confirmée / annulée / no-show / rappel | `controllers/serviceBookingController.js`, `automatisme/bookingRemindersJob.js`, `mailService` (booking_*) | emails booking_* + notif | Oui — `booking.confirmed/reminded/cancelled/no_show` |
| **refund** | Remboursement demandé / confirmé / échoué | `services/refundExecutionService.js`, `refundService.js`, `mailService` (refund_*) | emails refund_* | Oui — `refund.requested/confirmed/failed` |
| **gift_card** | Création / usage / recrédit | `services/giftCardService.js`, `refundGiftCardService.js` | email `gift_card_compensation` | Oui — `gift_card.created/used/recredited` |
| **commission** | Disponible / rappel envoyé | `automatisme/commissionReminderJob.js`, `controllers/commissionPaymentController.js` | emails commission_* | Oui — `commission.available/reminder_sent` |
| **formation_session** | Annulation / maj / reprogrammation | `services/sessionCancellationFlowService.js`, `mailService` (session_*) | emails session_* + notif | Oui (Phase ultérieure) |
| **job** | Démarrage/fin des schedulers | `automatisme/*.js` | logs console | Oui — `job.started/succeeded/failed` |
| **notification (in-app)** | Notif créée | `services/notificationService.js` (`triggerNotification`), `models/Notification.js` | distinct des emails | Oui — voir rapport 55 |

## Notifications in-app actuelles

`triggerNotification()` crée un document `Notification` (in-app). Appelée
notamment depuis `clientController` (vente). **Non corrélée** aux emails ni aux
SendLog. C'est un **second canal** à terme unifiable derrière le bus (rapport 55).

## État après Phase 3

- **Bus d'événements** créé (`services/eventBusService.js`) + **catalogue figé**
  (`constants/eventCatalog.js`) + **EventLog** persistant.
- **Seuls les événements `email.*`** sont **réellement émis** aujourd'hui (depuis
  `SendLog`). Les autres domaines (sale/booking/refund/…) sont **catalogués** mais
  **pas encore émis** : ils restent des « événements implicites » jusqu'à leur
  branchement (Phase ultérieure, sans automatisation).
- **Aucun déclencheur automatique** : le bus est en **broadcast d'audit** (V1).

## Cas de rattachement contextuel (SendLog → objet métier)

| Email | contextType | contextId rattaché ? |
|---|---|---|
| `vente` (`sendSaleEmail`) | `sale` | ✅ explicite (`sale.saleId`) |
| `booking_confirmed` | `service_booking` | ✅ explicite (`booking._id`) |
| Autres `booking_*` (cancelled/no_show/reminder/suspended) | `service_booking` | ⚠️ **contextType auto-dérivé** ; `contextId` non rattaché (V1) |
| `refund_*` | `refund_request` | ⚠️ auto-dérivé ; contextId non rattaché (dispatch via helper partagé) |
| `commission_*` | `commission_payment` | ⚠️ auto-dérivé ; contextId non rattaché |
| `gift_card_compensation` | `gift_card` | ⚠️ auto-dérivé ; contextId non rattaché |
| `session_*` / `formation_*` | `formation_session` | ⚠️ auto-dérivé ; contextId non rattaché |
| `password_reset`, `email_confirmation_code` | `user` | auto-dérivé |
| `site_*`, `maintenance_*` | `system` | auto-dérivé |

**Raison des non-rattachés** : ces emails passent par des **dispatchers
partagés** (`sendSingleTemplateMail`, `sendStatusMail`, `sendPremiumHtmlEmail`).
Le `contextType` est **auto-dérivé du tag** (donc présent partout) ; le `contextId`
nécessite de **propager l'identifiant métier** à travers ces helpers — fait
proprement en Phase ultérieure (sans toucher aux flux). Documenté ici comme dette
mineure assumée.
