# 55 — Plan de migration : notifications → événements

> **Plan uniquement** (aucune migration exécutée en Phase 3). Repo `backend/`,
> branche `phase-0-security-baseline`, base `1178379`.
>
> Objectif futur : unifier les deux canaux actuels (emails Brevo + notifications
> in-app `Notification`) derrière le **bus d'événements**, sans automatisation
> no-code et sans toucher aux flux métier.

## Principe cible

Une action métier **émet un événement** (`sale.created`, `booking.confirmed`…).
Des **subscribers** (in-process) réagissent :
- un subscriber « notification » crée le `Notification` in-app ;
- un subscriber « email » déclenche l'envoi via `mailService` (qui logge déjà via
  SendLog → `email.*`).

Aujourd'hui ces effets sont **appelés en ligne** dans les contrôleurs/jobs ; la
migration consiste à les **déplacer derrière le bus**, un domaine à la fois.

## Tableau de migration

| Notification actuelle | Event cible | Email cible | Priorité | Risque | Notes |
|---|---|---|---|---|---|
| Vente (notif in-app + email vente) | `sale.created` → `sale.email_sent` | `vente` | **Haute** | Moyen | Flux paiement : subscriber **ne doit jamais** bloquer le webhook Stripe |
| Réservation confirmée | `booking.confirmed` | `booking_confirmed` | Haute | Moyen | Idempotence : éviter double envoi sur retry webhook |
| Rappel de réservation | `booking.reminded` | `booking_reminder` | Moyenne | Faible | Déjà piloté par `bookingRemindersJob` |
| Annulation / no-show | `booking.cancelled` / `booking.no_show` | `booking_cancelled*` / `booking_no_show` | Moyenne | Moyen | Conserver la logique de remboursement intacte |
| Remboursement demandé/confirmé | `refund.requested` / `refund.confirmed` | `refund_*` | Moyenne | **Élevé** | Ne pas toucher au calcul/exécution du remboursement |
| Commission dispo/rappel | `commission.available` / `commission.reminder_sent` | `commission_*` | Basse | Faible | Déjà piloté par `commissionReminderJob` |
| Carte cadeau compensation | `gift_card.created/used/recredited` | `gift_card_compensation` | Basse | Moyen | Recrédit déjà idempotent — ne pas dupliquer |
| Sessions/formations | `formation_session.*` (à cataloguer) | `session_*` | Basse | Moyen | Domaine non encore catalogué |

## Ordre de migration recommandé

1. **Brancher l'émission** des événements métier non-email (sans subscriber actif)
   pour peupler la timeline (audit) : `sale.created`, `booking.*`. *(Zéro effet de
   bord : pur audit.)*
2. **Subscriber notification** : migrer `triggerNotification` (vente d'abord)
   derrière `sale.created`. Garder l'appel direct en parallèle jusqu'à validation,
   puis retirer.
3. **Rattacher `contextId`** des emails restants (refund/commission/gift_card/
   session) en propageant l'id métier dans les dispatchers partagés.
4. **Subscriber email** (optionnel, plus tard) : ne PAS rendre l'envoi automatique
   tant que la discipline « pas d'envoi auto non gouverné » n'est pas levée
   explicitement. En attendant, l'email reste déclenché par le code métier.

## Garde-fous (règles fermes)

- Un subscriber qui échoue **ne casse jamais** l'action métier (déjà garanti par
  `eventBusService`).
- **Aucun envoi automatique** d'email/notification déclenché par le bus en V1
  (audit/observabilité seulement).
- Idempotence : tout subscriber à effet de bord (notif/email) doit être idempotent
  (clé = `contextType+contextId+eventName`).
- Pas de no-code, pas d'UI, pas de configuration par l'utilisateur.

## Risques résiduels

- Double notification pendant la phase « parallèle » (appel direct + subscriber) →
  mitiger par bascule progressive + idempotence.
- Couplage caché si trop de subscribers : garder le bus **mince** et documenté.
