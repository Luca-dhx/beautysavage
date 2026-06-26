# 66 — Audit Phase 4D : subscribers Notification

> Repo `backend/`, branche `phase-0-security-baseline`, base `ebb69f0`. Audit
> uniquement. Aucun secret/email affiché.

## Précision sur le mapping (important)

Le brief Phase 4D écrit « `sale.finalized` → notification `new_client` ». Or
`new_client` est la notification d'**inscription** (`authRouter:319`), déclenchée
par la **création de compte**, **pas** par une vente — et **aucun event
`user.created`** n'est encore émis. La notification réellement déclenchée
aujourd'hui lors d'une **vente finalisée** est **`new_sale`** (`clientController:568`).

➡️ **Décision** : on branche le mapping **sémantiquement correct** —
`sale.finalized → new_sale` et `booking.no_show_marked → no_show_recorded`.
Utiliser `new_client` créerait des notifications **fausses** (annonçant un nouveau
client alors qu'il s'agit d'une vente) si le flag était activé. `new_client` est
documenté comme **différé** (nécessite un event `user.created`).

## Table d'audit

| Notification | Appel direct actuel | Event cible | Risque doublon | Idempotence possible | Décision |
|---|---|---|---|---|---|
| `new_sale` | `clientController:568` (`triggerNotification('new_sale', …)`) | `sale.finalized` | Oui (si flag ON **et** appel direct) → **mitigé** par `NotificationEventDelivery` | Oui — clé `eventName+contextType+contextId+notificationType` | ✅ **Branché** (subscriber, flag OFF par défaut) |
| `no_show_recorded` | `serviceBookingController:690` | `booking.no_show_marked` | Oui → **mitigé** idempotence | Oui | ✅ **Branché** |
| `new_client` | `authRouter:319` | `user.created` (**non catalogué/émis**) | — | — | ⏳ Différé (pas d'event source) |

## Mécanisme d'idempotence
`models/NotificationEventDelivery.js` — index unique
`(eventName, contextType, contextId, notificationType)`. Le subscriber **réclame**
la livraison (findOne + create ; E11000 = déjà livré) **avant** d'appeler
`triggerNotification`. Un même event ré-émis (crash/retry, ou flag ON + appel
direct sur un autre event source) ne crée la notif **qu'une fois** via ce ledger.

## Double émission temporaire (décision)
- **Appels directs conservés** (`new_sale`, `no_show_recorded`) — non supprimés.
- **Subscriber désactivé par défaut** (`ENABLE_EVENT_NOTIFICATION_SUBSCRIBERS=false`).
- Quand le subscriber sera validé (flag ON en staging), on supprimera l'appel
  direct correspondant ; pendant la transition, l'idempotence protège des doublons
  **inter-event** mais l'appel direct et le subscriber écrivent via des chemins
  différents (le ledger ne dédoublonne pas l'appel direct vs subscriber — c'est
  pourquoi on **ne les active pas simultanément** en prod).

## Garde-fous
In-app uniquement (aucun email) ; best-effort (jamais de throw au métier) ;
flag-gated ; pas d'UI ; pas de no-code.
