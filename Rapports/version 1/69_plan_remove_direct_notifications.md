# 69 — Plan de suppression des appels directs de notification

> **Plan uniquement.** AUCUN appel direct supprimé dans cette mission. Repo
> `backend/`, branche `phase-0-security-baseline`, base `064fda1`.

## Contexte

Deux notifications ont un subscriber EventBus équivalent (parité validée,
rapport 68) : `new_sale` (← `sale.finalized`) et `no_show_recorded`
(← `booking.no_show_marked`). Les **appels directs** `triggerNotification`
restent en place :
- `clientController:568` → `new_sale`
- `serviceBookingController:690` → `no_show_recorded`

Tant que `EVENT_NOTIFICATION_SUBSCRIBER_MODE=active` **et** que l'appel direct
existe, on aurait un **doublon** (le ledger d'idempotence ne couvre pas le chemin
direct, qui n'écrit pas de `NotificationEventDelivery`).

## Conditions pour activer `shadow`

1. Subscriber déployé (fait), tests verts (fait).
2. `EVENT_NOTIFICATION_SUBSCRIBER_MODE=shadow` en **staging** puis **prod**.
3. En shadow : aucune notification créée par le subscriber ; on observe les
   `NotificationEventDelivery(status=shadow)` produits.

## Durée recommandée du shadow

**≥ 2 semaines** en prod (couvrir un cycle métier complet : ventes, no-shows,
relances), ou ≥ N occurrences de chaque event (ex. ≥ 50 ventes, ≥ 10 no-shows).

## Critères de parité (go/no-go)

- Pour chaque event observé en shadow, **1 et 1 seul** `NotificationEventDelivery`
  est créé (pas de trou, pas de doublon).
- Les variables que le subscriber **aurait** produites (loggables en shadow si
  besoin) correspondent à celles de l'appel direct (cf. rapport 68 ; seul écart
  attendu : `clientName` sans email).
- Aucun throw, aucune erreur dans les logs subscriber.
- Aucun `SendLog`/email généré par le subscriber.

## Ordre de suppression (bascule par notification)

> **Une notification à la fois**, jamais les deux simultanément.

1. Basculer `mode=active`.
2. **Immédiatement** dans le même déploiement, **supprimer l'appel direct** de la
   notification migrée :
   - étape A : `no_show_recorded` (volume faible, risque faible) — retirer
     `serviceBookingController:690`.
   - étape B (après validation A) : `new_sale` — retirer `clientController:568`.
3. Vérifier qu'il **n'existe plus** qu'un seul chemin (subscriber) pour cette
   notification.

> Le passage `mode=active` + suppression de l'appel direct **doivent être
> atomiques** (même release) pour éviter la fenêtre de doublon.

## Rollback

- **Avant suppression de l'appel direct** : repasser `mode=off` (ou `shadow`).
- **Après suppression** : ré-introduire l'appel direct (revert du commit) **et**
  repasser `mode=off`. Garder le commit de suppression petit et isolé pour un
  revert simple.

## Risques de doublons

| Situation | Doublon ? | Mitigation |
|---|---|---|
| `mode=active` + appel direct présent | **Oui** | bascule atomique (active + suppression direct dans la même release) |
| `mode=shadow` + appel direct | Non (shadow ne crée pas de notif) | — |
| `mode=off` | Non | défaut |
| shadow→active (même contextId) | Non | upgrade de la delivery (testé) |

## Tests à refaire au moment de la bascule

- Re-jouer `notificationEventParity` / `notificationEventShadowMode` /
  `notificationEventSubscriber` / `notificationEventIdempotence`.
- Ajouter un test « appel direct supprimé » : sur l'event, **une seule**
  notification est créée (via subscriber), pas deux.
- Suite p0/p1/integration verte.

## Décision pour cette mission
**Aucune suppression.** Subscriber livré avec mode `off` par défaut ; appels
directs conservés ; parité validée ; bascule planifiée ci-dessus.
