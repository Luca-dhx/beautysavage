# 174 — Rapport M2 : Mail Event Dispatch Engine (fromRole / toRole)

> Moteur d'envoi e-mail **événementiel par rôles** : event → règle → fromRole/toRole → resolver M1 →
> template → gateway → SendLog, avec ledger idempotent. **Brique additive** : envois directs
> existants **conservés** (moteur en shadow), aucune UI, SendLog/EventLog inchangés. Branche
> `phase-0-security-baseline`. Suite de M1 (171/172) et de l'audit 173.

## Objectif

Injecter l'expéditeur/destinataire **au moment de l'envoi** (le template ne porte jamais d'adresse),
sans casser les envois existants ni créer de doublon.

## 1. Feature flag

`MAIL_ROLE_RESOLVER_ENABLED=false` (`.env.example`) — `isMailRoleResolverEnabled()` lu à l'exécution.
**false → subscriber no-op** (envois existants strictement inchangés). **true → dispatch M2** (en
shadow tant qu'un envoi direct existe).

## 2. Règles `constants/mailDispatchRules.js`

`{ eventName, templateKey, fromRole, toRole, contextType, enabled, directSenderExists }`. Règles
initiales (templateKey **existants**, cf. 173) :

| event | templateKey | fromRole | toRole | directSenderExists |
|---|---|---|---|---|
| `sale.finalized` | `vente` | commerciale | client | true (shadow) |
| `booking.confirmed` | `booking_confirmed` | commerciale | client | true (shadow) |
| `refund.succeeded` | `refund_confirmed` | commerciale | client | true (shadow) |
| `commission.available` | `commission_available` | support | commerciale | true (shadow) |
| `commission.reminder_sent` | `commission_reminder` | support | commerciale | true (shadow) |

`directSenderExists:true` ⇒ un envoi **direct** existe déjà (mailDomainDispatchers) → le moteur reste
en **shadow** (`skipped_duplicate_direct_sender`) pour ne JAMAIS doubler, jusqu'à la migration M3.

## 3. Ledger idempotent `models/MailEventDelivery.js`

Statuts M2 (séparés de SendLog) : `shadow`, `skipped_duplicate_direct_sender`, `skipped_rule_disabled`,
`skipped_template_missing`, `identity_missing`, `client_missing`, `sent`, `failed`. **Index unique**
`{eventName, contextType, contextId, templateKey}` → **pas de double e-mail au replay** d'un event.

## 4. Service `services/mail/mailEventDispatchService.js`

- `resolveMailRule(eventName)` → règle ou null.
- `dispatchTemplateByRoles({templateKey, fromRole, toRole, context, variables})` — **envoi RÉEL** :
  `loadTemplate` → (absent → `skipped_template_missing`) → `resolveMailEnvelope` (M1 ; identité absente
  → `identity_missing`, client absent → `client_missing`) → render (`withMailThemeVars` +
  `replaceTemplateVariables`) → `postToBrevo` (crée le **SendLog** : `templateKey`, `metadata.tags`
  = `[transactional, <key>, from:<role>, to:<role>, role-engine]`, `recipientHash`, contextType/Id) →
  `sent`/`failed`. **Ne throw jamais.**
- `dispatchMailForEvent(eventLog,{context})` : règle ? sinon `skipped_no_rule`. **Idempotence** (ledger).
  `!enabled` → `skipped_rule_disabled`. `directSenderExists` → `skipped_duplicate_direct_sender`
  (shadow, **aucun e-mail**). Sinon → `dispatchTemplateByRoles` + enregistrement ledger.
- **Jamais de fallback hardcodé** ; **jamais de secret** ; SendLog hashe le destinataire.

## 5. Subscriber `subscribers/mailEventSubscriber.js`

`subscribe(eventName, handleMailEvent)` pour chaque règle. `handleMailEvent` : flag off → **no-op** ;
flag on → `dispatchMailForEvent`. **Best-effort** (try/catch, n'interrompt jamais l'émetteur).
Enregistré dans `app.js` (`registerMailEventSubscribers()`) après les autres subscribers.

## 6. SendLog / EventLog (compatibilité)

- **SendLog inchangé** (enum strict queued/sent/delivered/opened/bounced/failed) : le moteur passe par
  `postToBrevo` qui crée/transitionne le SendLog **à l'identique**. Les rôles transitent par
  `metadata.tags` (`from:`/`to:`), `templateKey` = clé. Aucun champ ajouté à SendLog.
- **EventLog** : émissions `email.queued/sent/failed` inchangées (par `sendLogService`). M2 n'émet pas
  de nouvel event.
- Statuts M2 (shadow/skipped_*) → **ledger `MailEventDelivery`** dédié (pas SendLog).

## 7. Tests (+25 backend → 467)

- `mailDispatchRules.test.js` (5) : lookup, liste, flag runtime, **aucune adresse dans les règles**.
- `mailEventDispatchService.test.js` (9) : dispatchTemplateByRoles sent (commerciale→client, SendLog
  templateKey+tags rôles, e-mail non fuité), template absent, identity_missing, client_missing,
  support→commerciale ; dispatchMailForEvent no rule / shadow + ledger / idempotent.
- `mailEventSubscriber.test.js` (4) : flag off no-op, flag on dispatch (ledger shadow), event hors
  règles no-op, jamais de throw.
- `mailEventDeliveryIdempotence.test.js` (4) : replay → 1 entrée, contextes distincts → 2, index
  unique E11000, dispatch concurrent → 1 entrée.
- `mailRoleResolverIntegration.test.js` (3) : commerciale→client (sender=commerciale, to=client),
  support→commerciale, aucun fallback (identity_missing, aucun envoi). **Brevo mocké (getCredential +
  fetch) → aucun vrai e-mail.**

### Suites complètes
`npm test` (467) + audits (36 / 20) verts. Frontend inchangé (78 + build + lint).

## 8. Non-régression / compat

- `mailService` / `mailDomainDispatchers` / `postToBrevo` / `sendLogService` / `SendLog` / webhook
  Brevo : **non modifiés**. Flag false par défaut → subscriber no-op → **prod inchangée**.
- Même flag true : toutes les règles initiales sont en shadow → **aucun doublon d'e-mail**.

## 9. Limites M2

- Le chemin événementiel reste en **shadow** (les events portent un `payloadSafe` sans e-mail client ;
  et un envoi direct existe). La vraie capacité d'envoi est prouvée par `dispatchTemplateByRoles`
  (testée) pour de futurs appelants disposant du contexte client.
- Aucun envoi direct retiré (pas de migration). Pas d'UI. Pas de métadonnées de rôle sur `EmailTemplate`
  (règles = source de vérité).

## 10. Prochaine mission — M3 (Notification Target Engine)

Enrichir le contexte d'event (ou appeler `dispatchTemplateByRoles` depuis les flux disposant du
client) pour **migrer** progressivement un envoi direct → moteur (retirer `directSenderExists`,
bascule contrôlée par event), ciblage des destinataires/canaux, puis UI React Manager/Dev (identités
+ règles + journal `MailEventDelivery`).
