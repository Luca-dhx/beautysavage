# 173 — Audit pré-M2 : moteur d'envoi e-mail événementiel (fromRole/toRole)

> Audit avant le **Mail Event Dispatch Engine** (event → templateKey → fromRole/toRole → resolver →
> mailService → SendLog). Branche `phase-0-security-baseline`. Suite de M1 (171/172).

## 1. Envois e-mail actuels

- Dispatchers `services/mail/mailDomainDispatchers.js` (`sendSaleEmail`, `sendBookingConfirmedEmail`,
  `sendRefundConfirmedEmail`, `sendCommissionAvailableEmail`, `sendCommissionReminderEmail`, …).
- Flux d'un dispatcher : `loadTemplate(key)` → `withMailThemeVars` + `replaceTemplateVariables`
  (`mailRenderer.js`) → `postToBrevo(payload, {contextType, contextId})`.
- `postToBrevo` (`mailBrevoGateway.js`) crée lui-même le **SendLog** (`createQueuedSendLog`) puis
  `markSendLogSent/Failed`. Clé via `getCredential('brevo',{role:'api_key'})`.
- **Expéditeur** : `buildSender()` = `MAIL_FROM`/`MAIL_FROM_NAME` (statique).
- **⚠️ Les e-mails sont envoyés DIRECTEMENT** par les flux métier (ex. `void sendSaleEmail(sale)` dans
  `checkout/checkoutPersistenceService.js`). **L'EventBus est purement AUDIT** (EventLog) ; aucun
  e-mail n'est déclenché par un subscriber aujourd'hui.

## 2. Templates actuels (clé = `EmailTemplate.functionName`)

`getPublishedTemplate(functionName)` (`emailTemplateVersioningService.js`) /
`loadTemplate(functionName)` (`mailTemplateRuntime.js`, défauts intégrés). Clés existantes utiles :
`vente`, `booking_confirmed`, `refund_confirmed` (+ `refund_confirmed_service`), `commission_available`,
`commission_reminder`. Le template **ne contient PAS d'adresse** — c'est l'objet de M2 (injection
from/to à l'envoi).

## 3. Où from/to sont résolus aujourd'hui

- `from` : statique (`MAIL_FROM`). `to` : passé en argument par le flux métier (email réel en main).
- **M1** : `communicationRoleResolver.resolveSender/resolveRecipient/resolveMailEnvelope` (support/
  commerciale → identité active ; client → `context.client.email`). **Non câblé** aux envois.

## 4. Events disponibles (`constants/eventCatalog.js`)

`sale.finalized` (saleId,totalAmount,itemCount,hasStripePayment), `booking.confirmed`
(bookingId,serviceId,status), `refund.succeeded` (refundId,saleId,status), `commission.available`
(commissionPaymentId,month,year), `commission.reminder_sent` (commissionPaymentId,daysLeft).
Bus : `subscribe(eventName, handler)` + `emitEvent(name, payload, options)` (async, best-effort,
**payload REDACTÉ → aucun e-mail dans `payloadSafe`**). Enregistrement : `registerNotificationSubscribers()`
appelé dans `app.js:505`.

## 5. Rôles support / commerciale / client (M1)

support = plateforme/dev ; commerciale = institut/admin ; client = `context.client.email` (jamais
configuré). **⚠️ Conséquence clé** : `payloadSafe` d'un event ne contient pas l'e-mail client → le
chemin événementiel ne peut PAS résoudre un destinataire `client` à partir du seul event.

## 6. Contraintes / risques

| Risque | Mitigation |
|---|---|
| **Double e-mail** (direct + moteur) | Tous les events cibles ont **déjà un envoi direct** → le moteur reste en **shadow/skip** (`skipped_duplicate_direct_sender`) tant que la migration n'a pas retiré l'envoi direct. |
| Enum SendLog **strict** (queued/sent/delivered/opened/bounced/failed) | Ne PAS l'étendre. Les statuts M2 (shadow/skipped_*) vont sur un **nouveau ledger `MailEventDelivery`** (enum maîtrisée). SendLog reste compatible. |
| Pas d'e-mail client dans l'event | Le chemin event = shadow ; la vraie capacité d'envoi est exposée par `dispatchTemplateByRoles({context})` (testée) pour de futurs appelants disposant du client. |
| Casser les envois existants | M2 **n'ajoute que** des fichiers neufs ; mailService/postToBrevo/SendLog/dispatchers **non modifiés**. |
| Replay d'event → double | Ledger `MailEventDelivery` **idempotent** (index unique `{eventName,contextType,contextId,templateKey}`). |
| Flag | `MAIL_ROLE_RESOLVER_ENABLED=false` par défaut → subscriber no-op. |
| Secret | Aucun (clé via vault ; jamais loggée ; SendLog hashe le destinataire). |

## 7. Stratégie M2

1. Flag `MAIL_ROLE_RESOLVER_ENABLED=false` (`.env.example`) + `isMailRoleResolverEnabled()`.
2. `constants/mailDispatchRules.js` : `{eventName, templateKey, fromRole, toRole, contextType,
   enabled, directSenderExists}`. Règles initiales sûres (sale/booking/refund → commerciale→client ;
   commission.available/reminder_sent → support→commerciale), toutes `directSenderExists:true` (shadow).
3. `models/MailEventDelivery.js` : ledger idempotent (statuts shadow/skipped_*/sent/failed).
4. `services/mail/mailEventDispatchService.js` : `resolveMailRule`, `dispatchTemplateByRoles`
   (vrai envoi : resolver → loadTemplate → render → postToBrevo → SendLog), `dispatchMailForEvent`
   (rule + flag + idempotence + shadow/skip). Jamais de throw métier ; jamais de fallback hardcodé.
5. `subscribers/mailEventSubscriber.js` : écoute les events des règles ; flag off → no-op ;
   best-effort. Enregistré dans `app.js` (après les autres subscribers).
6. Tests (5 fichiers) ; suites backend + audits + frontend vertes ; docs + rapport 174.

### Hors périmètre M2 (rappel)
Pas de migration des envois directs (gardés ; moteur en shadow), pas d'UI React, pas de modif de
contenu template, SendLog/EventLog inchangés. Le retrait des envois directs + ciblage notif = **M3**.
