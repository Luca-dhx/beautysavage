# 56 — Rapport Phase 3 : Bus d'événements backend

> Repo `backend/`, branche `phase-0-security-baseline`, base `1178379`.
> **Tests : 33 fichiers / 130 verts** (était 117, +13). Aucun secret/email affiché.
> Socle event-bus **backend uniquement** : pas d'UI, pas de React, pas
> d'automatisation no-code, pas de déclencheur automatique (broadcast d'audit V1).

## 1. Livré

| Élément | Fichier |
|---|---|
| Catalogue d'événements figé | `constants/eventCatalog.js` |
| EventLog persistant | `models/EventLog.js` |
| Service event bus | `services/eventBusService.js` |
| SendLog → events `email.*` | `services/sendLogService.js` |
| Rattachement contexte (sale, booking_confirmed) | `services/mailService.js` |
| Endpoint diagnostic | `controllers/devDiagnosticController.js` + `routers/devDiagnosticRouter.js` |
| Tests | `tests/p1/{eventBus,sendLogEvents,eventLogEndpoint}.test.js` |
| Rapports | 54 (audit), 55 (plan notifications), 56 (ce rapport) |

## 2. Catalogue d'événements

`constants/eventCatalog.js` — chaque event : `{ name, domain, version,
description, payload[] }`. Domaines : `sale`, `booking`, `refund`, `gift_card`,
`commission`, `email`, `job`. ~24 événements. Version 1.

## 3. EventLog

`{ eventName, domain, version, actorType, actorId, source, contextType,
contextId, payloadSafe, traceId, emittedAt, createdAt }`. Index : `eventName+
createdAt`, `contextType+contextId`, `createdAt`, `domain+createdAt`.
**payloadSafe** : jamais d'email/secret/token (redaction au niveau du bus).

## 4. EventBus

`services/eventBusService.js` :
- `emitEvent(name, payload, options)` — **persiste toujours** un EventLog
  (best-effort, **ne throw jamais**) puis notifie les subscribers. Redaction du
  payload (clés sensibles → `[redacted]`, emails → `[redacted-email]`, profondeur/
  taille bornées). Event inconnu → warning + log avec `domain:'unknown'`.
- `subscribe(name, handler)` — in-process ; `'*'` reçoit tout. Retourne un
  unsubscribe.
- `publishToSubscribers(eventLog)` — un subscriber qui échoue est **catché** : il
  ne casse **jamais** l'action métier.
- Pas de retry, pas de cross-process (V1).

## 5. SendLog → events

Transitions SendLog émettent : `email.queued` (création), `email.sent`,
`email.failed` (errorCode), `email.delivered` / `email.opened` / `email.bounced`
(webhook Brevo). Payload **sûr** : `sendLogId, provider, templateKey, contextType,
contextId, status` (+ `errorCode`). **Jamais** l'email du destinataire.

## 6. Rattachement contextType / contextId

- **contextType auto-dérivé** du tag/templateKey pour **tous** les emails
  (`vente→sale`, `booking_*→service_booking`, `refund_*→refund_request`,
  `commission_*→commission_payment`, `gift_card_*→gift_card`,
  `session_*/formation_*→formation_session`, `password_reset/email_confirmation→
  user`, `site_*/maintenance→system`).
- **contextId explicite** pour : `sale` (`sale.saleId`) et `booking_confirmed`
  (`booking._id`) via le 2e paramètre `context` de `postToBrevo`.
- **Non rattachés (contextId)** : refund/commission/gift_card/session (dispatchers
  partagés) — documenté (rapport 54) ; à propager en Phase ultérieure sans toucher
  aux flux.

## 7. Endpoint diagnostic

`GET /api/gestion/dev/events` (`requireGestionRole` puis `requireStrictDev`).
Filtres `?eventName=&domain=&contextType=&limit=`. Champs sûrs uniquement (jamais
email/token/secret). Dev → 200, admin → 403, client → 403 (testé). (L'endpoint
`/send-logs` de la Phase 2 reste disponible.)

## 8. Limites V1 (assumées)

- **Broadcast d'audit** : seuls les `email.*` sont réellement émis ; les autres
  domaines sont catalogués mais pas encore branchés. **Aucun déclencheur
  automatique** (pas d'envoi/notif déclenché par le bus).
- Bus **in-process** : perte possible d'un event au crash entre publish et
  subscriber (acceptable pour l'audit ; idempotence requise pour de futurs
  subscribers à effet de bord).
- EventLog **sans TTL/rétention** (V1) : prévoir une purge si volume.
- `contextId` partiel (cf. §6).
- Pas de versioning d'enveloppe au-delà du champ `version` par event.

## 9. Lien futur

- **Migration notifications** : cf. rapport 55 (subscribers notification/email
  derrière le bus, progressif, idempotent, sans envoi auto).
- **Studio Email Template (post-React)** : le couple `templateKey` (SendLog/events)
  + `contextType` fournit la base d'analytics par template et par domaine ; le
  futur Studio s'appuiera sur EventLog (`email.sent/opened/bounced` par
  `templateKey`) pour les stats de délivrabilité/engagement.

## 10. Prochaine phase recommandée

**Brancher l'émission des événements métier non-email** (`sale.created`,
`booking.*`, `refund.*`) en pur audit (zéro effet de bord), puis **rattacher les
`contextId` restants**, puis **versioning des templates email** (draft→publish) —
toujours backend, avant la migration React.
