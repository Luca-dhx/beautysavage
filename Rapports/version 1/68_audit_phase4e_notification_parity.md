# 68 — Audit Phase 4E : parité notifications

> Repo `backend/`, branche `phase-0-security-baseline`, base `064fda1`. Audit +
> enrichissement. Aucun secret/email affiché.

## new_sale

| Aspect | Appel direct (`clientController:568`) | Subscriber (active) |
|---|---|---|
| Type | `new_sale` | `new_sale` |
| Variables | `saleId`, `amount` (`totalAmount.toFixed(2)`), `link`, `linkLabel` | **idem** (`amount` re-fetché depuis la Sale, fallback payload) |
| Destinataire | défini par `NotificationConfig` (targetType/Role) | **identique** (même service `triggerNotification`) |
| Message/metadata | templates de `NotificationConfig` | **identiques** |
| Comportement | en ligne, `void`, non bloquant | best-effort, idempotent, in-app |

**Écart** : aucun (parité complète — l'EventLog porte déjà `saleId` + `totalAmount` ;
le re-fetch Sale ne fait que confirmer le montant).

## no_show_recorded

| Aspect | Appel direct (`serviceBookingController:690`) | Subscriber (active) |
|---|---|---|
| Type | `no_show_recorded` | `no_show_recorded` |
| Variables | `clientName` (firstName+lastName **|| email** || '—'), `serviceName`, `bookingDate`, `link`, `linkLabel` | `clientName` (firstName+lastName **|| '—'**, **sans email**), `serviceName`, `bookingDate`, `bookingId`, `link`, `linkLabel` — **re-fetch** ServiceBooking + populate client/service |
| Destinataire | `NotificationConfig` | identique |
| Comportement | en ligne | best-effort, idempotent, in-app |

**Écart** : (1) le subscriber **n'inclut pas l'email** en fallback du `clientName`
(choix **privacy** — `'—'` à la place) ; (2) ajoute `bookingId`. Format de date
fr-FR équivalent.

## Table de synthèse

| Notification | Direct | Subscriber | Écart | Risque | Correction |
|---|---|---|---|---|---|
| `new_sale` | saleId, amount | saleId, amount (re-fetch) | aucun | — | aucune |
| `no_show_recorded` | clientName(+email fallback), serviceName, bookingDate | clientName(sans email), serviceName, bookingDate, bookingId (re-fetch) | email fallback retiré (volontaire) | Faible | aucune (privacy assumée) |

## Enrichissement appliqué (Partie 2)
- `sale.finalized` : re-fetch `Sale` par `saleId` → `amount` autoritaire (fallback
  payload si absent). Jamais null.
- `booking.no_show_marked` : re-fetch `ServiceBooking.findById(contextId)` +
  `populate(clientId, serviceId)` → `clientName/serviceName/bookingDate`. **Objet
  introuvable → null → pas de notification, pas de claim, pas de throw.**
- Best-effort, jamais de throw, pas d'email, pas de payload sensible (email exclu).

## Conclusion
Parité **fonctionnelle atteinte** pour les 2 notifications. Seule différence
intentionnelle : `clientName` sans fallback email (privacy). Prêt pour une bascule
**shadow → active** contrôlée (plan : rapport 69).
