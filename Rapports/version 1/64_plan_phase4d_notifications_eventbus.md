# 64 — Plan Phase 4D : migration notifications → EventBus

> **Plan uniquement.** AUCUNE migration exécutée. Repo `backend/`, branche
> `phase-0-security-baseline`, base `6b85186`. Audit-only respecté : aucun
> subscriber métier, aucune notification déclenchée par event.

## 1. Système de notification actuel (rappel)

`triggerNotification(eventType, variables)` (`services/notificationService.js`) :
config-driven (`NotificationConfig`), crée un doc `Notification` in-app
(`models/Notification.js`), **non bloquant** (`void`, erreurs silencieuses).
Appelé **en ligne** dans contrôleurs/services/jobs. 11 points d'appel.

## 2. Audit des notifications existantes

| Notification (eventType) | Fichier | Déclencheur métier | Event cible | Peut migrer ? | Risque | Priorité |
|---|---|---|---|---|---|---|
| `new_sale` | `clientController:568` | vente finalisée | `sale.finalized` | Oui | Moyen (flux paiement) | P2 |
| `formation_distancielle_purchased` | `clientController:586` | vente formation distancielle | `sale.finalized` (+filtre) | Oui | Moyen | P3 |
| `formation_presentielle_purchased` | `clientController:603` | vente formation présentielle | `sale.finalized` (+filtre) | Oui | Moyen | P3 |
| `formation_participation_cancelled` | `clientController:1990` | annulation participation | (à cataloguer) | Partiel | Moyen | P3 |
| `booking_created` | `clientController:2763`, `serviceBookingController:272` | réservation créée | `booking.created`/`confirmed` | Oui | Moyen | P2 |
| `formation_session_cancelled` | `formationSessionController:727` | session annulée | `formation.session_cancelled` (différé) | Oui (après branchement event) | Moyen | P3 |
| `booking_cancelled_client` | `serviceBookingController:375` | annulation client | `booking.cancelled` | Oui | Moyen | P2 |
| `no_show_recorded` | `serviceBookingController:690` | no-show | `booking.no_show_marked` | Oui | Faible | **P1** |
| `refund_requested` | `stripeController:1567` | refund demandé | `refund.requested` | Oui | Élevé (flux refund) | P3 |
| `new_client` | `authRouter:319` | inscription client | (à cataloguer `user.created`) | Oui | **Faible** | **P1** |
| `booking_rescheduled_client` | `sessionCancellationFlowService:1296` | reprogrammation | (à cataloguer) | Partiel | Moyen | P3 |

## 3. Ordre recommandé

1. **P1 — non critiques d'abord** : `new_client` (inscription, hors flux argent)
   et `no_show_recorded` (event `booking.no_show_marked` déjà émis). **Phase 4D
   doit commencer par 1 ou 2 de ces notifications seulement.**
2. **P2 — flux booking/sale** : `booking_created`, `booking_cancelled_client`,
   `new_sale` (events déjà émis ; vigilance idempotence sur retry webhook).
3. **P3 — flux refund / formation / sessions** : après stabilisation, et après
   avoir catalogué/émis les events manquants (`formation.session_*`,
   `user.created`).

## 4. Notifications à NE PAS toucher (pour l'instant)

`refund_requested` (flux remboursement, risque élevé), tout ce qui touche
paiement/refund tant que le pattern subscriber n'est pas éprouvé sur les P1.

## 5. Pattern subscriber recommandé

```
// (Phase 4D — NON implémenté ici)
subscribe('booking.no_show_marked', async (eventLog) => {
  // idempotence: ne créer la notif qu'une fois par (eventName, contextId)
  if (await alreadyNotified(eventLog)) return;
  await triggerNotification('no_show_recorded', deriveVars(eventLog));
  await markNotified(eventLog);
});
```
- Le subscriber **réutilise** `triggerNotification` (pas de réécriture).
- Enregistré **au boot** (hors test), dans un module dédié `subscribers/`.
- **N'envoie aucun email** (notif in-app seulement en 4D).

## 6. Idempotence

Clé = `(eventName, contextType, contextId)`. Stockage : un petit doc
`EventSubscriptionLog` ou un flag sur `EventLog` (`handledBy[]`). Garantit
qu'un même event rejoué (crash/retry) ne crée pas 2 notifications.

## 7. Rollback

- Le subscriber est **additif** : pendant la bascule, garder l'appel direct
  `triggerNotification` **et** le subscriber, protégés par l'idempotence (pas de
  doublon), puis retirer l'appel direct une fois validé.
- Désactivation instantanée : ne pas enregistrer le subscriber au boot (flag).

## 8. Tests à prévoir (Phase 4D)

- subscriber crée la notif sur l'event ; idempotent (rejouer l'event → 1 seule
  notif) ; un subscriber qui échoue ne casse pas le bus ; **aucun email** déclenché ;
  parité avec l'appel direct (mêmes variables).

## 9. Garde-fous (rappel)

Pas d'envoi automatique d'email par le bus en 4D (notif in-app uniquement) ; pas de
no-code ; pas d'UI ; idempotence obligatoire ; commencer par 1-2 notifications P1.
