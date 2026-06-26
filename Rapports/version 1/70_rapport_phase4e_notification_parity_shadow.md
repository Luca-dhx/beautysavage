# 70 — Rapport Phase 4E : parité + mode shadow

> Repo `backend/`, branche `phase-0-security-baseline`, base `064fda1`.
> **Tests : 43 fichiers / 173 verts** (était 166, +7 : p0 44 · p1 123 · integration 6).
> Aucun secret/email affiché. **Aucun appel direct supprimé. Mode `off` par défaut.**

## 1. Livré

| Élément | Fichier |
|---|---|
| Subscriber enrichi + mode | `subscribers/notificationEventSubscriber.js` |
| Statut `shadow` ajouté au ledger | `models/NotificationEventDelivery.js` |
| Flag mode + boot | `.env.example`, `app.js` |
| Tests | `tests/p1/{notificationEventParity,notificationEventShadowMode}.test.js` (+ 4D adaptés) |
| Rapports | 68 (parité), 69 (plan suppression), 70 (ce rapport) |

## 2. Mode off / shadow / active

`EVENT_NOTIFICATION_SUBSCRIBER_MODE` (défaut **`off`**) :
- **off** : handlers no-op (aucun claim, aucune notification). Au boot, subscribers
  **non enregistrés**.
- **shadow** : le handler **résout les variables** (re-fetch) et écrit
  `NotificationEventDelivery(status=shadow)`, mais **ne crée AUCUNE Notification**.
- **active** : crée la Notification (`status=created`). Une exécution `active` qui
  trouve une delivery `shadow` la **met à niveau** (shadow→active fonctionne).

Alias legacy : `ENABLE_EVENT_NOTIFICATION_SUBSCRIBERS=true` ⇒ `active`.

## 3. Parité (rapport 68)

- **new_sale** : parité **complète** (`saleId`, `amount` re-fetché, `link`).
- **no_show_recorded** : parité **fonctionnelle** via re-fetch ServiceBooking
  (`clientName`, `serviceName`, `bookingDate`, `bookingId`). Seul écart **volontaire** :
  `clientName` **sans** fallback email (privacy).

## 4. Enrichissement (re-fetch)

- `sale.finalized` → re-fetch `Sale` (montant autoritaire ; fallback payload).
- `booking.no_show_marked` → re-fetch `ServiceBooking` + populate client/service.
  **Objet introuvable → pas de notification, pas de claim, pas de throw.**
  Best-effort, jamais d'email, jamais de payload sensible (email exclu).

## 5. Idempotence (rappel + transition)

Index unique `(eventName, contextType, contextId, notificationType)`. shadow→active
= **upgrade** de la delivery (testé : 2 emits shadow puis active → 1 notif). active
ré-émis → idempotent (1 notif).

## 6. Suppression future des appels directs (rapport 69)

Appels directs **conservés** (`clientController:568`, `serviceBookingController:690`).
Bascule recommandée : shadow ≥ 2 semaines → `active` **+** suppression de l'appel
direct **dans la même release** (atomique, une notification à la fois,
`no_show_recorded` d'abord). Rollback = `mode=off` (+ revert si déjà supprimé).
**Aucune suppression effectuée ici.**

## 7. Tests (7 nouveaux/adaptés)

mode off → 0 notif / 0 delivery ; shadow → 0 notif / delivery `shadow` / 0 SendLog ;
active → notif + delivery `created` ; shadow→active → upgrade + 1 notif ; new_sale
& no_show variables attendues (re-fetch) ; objet introuvable → pas de throw ;
double event → idempotent ; aucun email/SendLog.

## 8. Limites V1

- 2 notifications couvertes (démonstration).
- En prod, ne pas activer `active` **et** conserver l'appel direct (doublon) — cf.
  rapport 69.
- Bus in-process : perte possible au crash.
- Pas de TTL sur `NotificationEventDelivery`.
- `clientName` sans email (écart volontaire vs direct).

## 9. Risques restants

- 🟠 Doublon si `active` + appel direct simultanés → mitigé par bascule atomique
  (rapport 69) et défaut `off`.
- 🟢 Variables minimales pour d'autres futures notifications (à enrichir au cas par cas).
- 🟢 Bus in-process.

## 10. Prochaine phase recommandée

**Phase 4F** : exécuter la bascule du plan 69 (shadow en staging → `active` +
suppression de l'appel direct `no_show_recorded`, puis `new_sale`), avec un test
« un seul chemin ». Puis migrer 1-2 notifications **P2** (`booking_created`,
`booking_cancelled_client`). Ensuite **versioning des templates email**
(draft→publish). Toujours backend, avant React.
