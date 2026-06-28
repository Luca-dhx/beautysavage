# 171 — Audit pré-M1 : fondation des identités de communication

> Audit avant l'ajout d'une fondation **CommunicationIdentity** (expéditeurs support/commerciale +
> vérification sender Brevo), inspirée du document LYCARZ. Branche `phase-0-security-baseline`.

## 1. Système e-mail Beauty Savage actuel

- **Envoi** : `services/mail/mailBrevoGateway.js` → `postToBrevo(payload, ctx)` → `POST
  https://api.brevo.com/v3/smtp/email` (header `api-key`). Clé via `getCredential('brevo',
  {role:'api_key'})` (vault `IntegratedApi`, fallback env `BREVO_API_KEY`). Façade `services/mailService.js`
  ré-exporte les dispatchers métier (`sendSaleEmail`, `sendPasswordResetEmail`, …).
- **Expéditeur** : **hardcodé** via `buildSender()` (`mailDomainDispatchers.js:13-33`) =
  `{ email: MAIL_FROM, name: MAIL_FROM_NAME }` (env, statique, partagé par tous les e-mails). **Aucune
  notion d'identité d'expéditeur dynamique.**
- **SendLog** (`models/SendLog.js`) : `channel/provider/templateKey/recipientHash(SHA-256)/status
  (queued→sent→delivered/opened/bounced/failed)/providerMessageId/subject/contextType/contextId/
  errorCode/errorMessageSafe`. Service `sendLogService.js` (createQueued/markSent/markFailed/applyBrevoEvent).
  **Défensif (ne throw jamais).**
- **EventLog** (`models/EventLog.js`) : events `email.queued/sent/failed/delivered/opened/bounced`
  émis par sendLogService via le bus.
- **Webhook Brevo** : `/api/webhooks/brevo` (`controllers/brevoWebhookController.js`) — corrèle par
  `providerMessageId`, secret vault/env, **toujours 200**.
- **Credentials** : `models/IntegratedApi.js` (credentials chiffrés AES-256-GCM ; slug `brevo` existe,
  roles `api_key`/`webhook_secret`). `getCredential(slug,{role,runtime})`.
- **Garde-fous** : `requireStrictDev` (dev) / `requireAdminOrDev` (= `requireDev` = `['dev','admin']`)
  dans `middlewares/requireDev.js` ; `requireAuth` (`utils/session.js`) ; `requireMode('gestion')` ;
  **`requireGestionRole()` appliqué globalement sur `/api/gestion`** (pose `req.sessionUser`).
- **Tests mail** : mock de `integratedApiCredentialService.getCredential` + spy `globalThis.fetch`
  (cf. `tests/p1/mailServiceCharacterization.test.js`). Pas de vrai envoi.

## 2. Comparaison avec la logique LYCARZ

| Concept LYCARZ | Beauty Savage actuel | Écart |
|---|---|---|
| Identité support vérifiée (`EmailIdentity` kind support/platform) | **Absent** (sender = `MAIL_FROM` statique) | À créer |
| Vérification sender via Brevo Sender API (`/v3/senders`) | **Absent** | À créer (adapter) |
| Domaine DNS authenticated (`EmailDomain`) | **Absent** | À créer (champs + refresh best-effort) |
| Séparation template / expéditeur / destinataire | Templates en DB (mailTemplateRuntime) ; expéditeur statique ; destinataire = arg | Partiel : manque la résolution d'expéditeur par rôle |
| Résolution dynamique au moment de l'envoi | **Non** (statique) | À créer (resolver fromRole/toRole) — **non câblé en M1** |
| Gate `assertSupportEmailReady` | **Absent** | `assertIdentityReady` (M1, non câblé aux envois) |

## 3. Ce qui existe déjà (réutilisable)

- Vault `IntegratedApi`/`getCredential` (clé Brevo). SendLog/EventLog (audit). Webhook Brevo.
- Garde-fous rôle (`requireStrictDev`, `requireAdminOrDev`, `requireGestionRole`).
- Pattern de test (mock getCredential + fetch).

## 4. Ce qui manque (objet de M1)

- Modèle `CommunicationIdentity` (support/commerciale, scope, statut, domaine, dnsRecords, active).
- Service de gestion (create/list/setActive/request+confirm verification/refresh/getActive/assertReady).
- Adapter Brevo Sender API **mockable** (`/v3/senders`, validate, status, domain) — best-effort/stub.
- Resolver `fromRole/toRole` (support/commerciale/client) — **brique seule, pas de câblage envois**.
- Routes dev (support) + admin (commerciale), aucune route publique.

## 5. Risques

| Risque | Mitigation |
|---|---|
| Casser les envois existants | **On ne touche pas** `buildSender`/`postToBrevo`/mailService. M1 = brique additive. |
| Casser SendLog/EventLog/webhook | Aucune modification de ces fichiers. |
| Vrais e-mails en test | Adapter Brevo **mocké** (vi.mock module) ; verif test mocke getCredential+fetch. |
| Secret exposé | Aucun secret stocké dans `CommunicationIdentity` ; erreurs provider → `lastErrorMessageSafe`. |
| `client` configurable par erreur | `role` enum = `['support','commerciale']` (pas de `client`) ; service rejette `client`. |
| Double actif par role/scope | Index unique partiel `{role,scope}` où `active:true`. |
| Permission support↔admin | support = **dev only** ; commerciale = admin/dev ; contrôlé par routeur + `assertCanManage`. |
| Transactions indispo (memory-server) | `setActive` séquentiel (déactive puis active), comme le thème T1. |

## 6. Stratégie M1

1. `models/CommunicationIdentity.js` : roles support(platform)/commerciale(institute), statut,
   active, provider brevo, champs vérification + domaine, index unique partiel actif/role-scope.
2. `services/communicationBrevoSenderAdapter.js` : adapter Brevo Sender/Domain API (mockable ;
   `getCredential('brevo',{role:'api_key'})` + fetch ; jamais de secret renvoyé).
3. `services/communicationIdentityService.js` : create/list/setActive/request+confirmVerification/
   refresh/getActiveIdentity/assertIdentityReady. Validation role↔scope, rejet `client`,
   email lowercase, displayName requis, active⇔verified.
4. `services/communicationRoleResolver.js` : resolveSender/resolveRecipient/resolveMailEnvelope
   (brique seule, pas de migration des templates).
5. Routes : `/api/gestion/dev/communication-identities` (dev, support) +
   `/api/gestion/communication-identities` (admin/dev, commerciale). Payload safe.
6. Tests (5 fichiers) ; suite backend + audits + frontend verts ; docs + rapport 172.

### Hors périmètre M1 (rappel)
Pas de migration des envois/templates existants, pas d'UI React, pas de modification de mailService/
SendLog/webhook. Le câblage des envois sur le resolver = **M2 (Mail Event Dispatch Engine)**.
