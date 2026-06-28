# 172 — Rapport M1 : fondation backend des identités de communication

> Fondation **CommunicationIdentity** (expéditeurs support / commerciale + vérification sender Brevo
> + domaine DNS + resolver fromRole/toRole). **Brique additive** : aucun envoi/template existant migré,
> aucune UI React. Branche `phase-0-security-baseline`. Suite de l'audit 171.

## Objectif

Poser les identités de communication (support/commerciale/client) inspirées de LYCARZ, sans casser
mailService / SendLog / webhook Brevo, sans envoyer de vrais e-mails, sans UI.

## 1. Modèle `models/CommunicationIdentity.js`

`{ role:'support'|'commerciale', scope:'platform'|'institute', email(lowercase), displayName(requis),
status:'unverified'|'verification_pending'|'verified'|'disabled', active, provider:'brevo',
providerSenderId, providerVerificationStatus, providerVerificationRequestedAt, providerVerifiedAt,
domain, domainAuthenticated, domainStatus, dnsRecords[], verification{requestedAt,verifiedAt,
lastErrorCode,lastErrorMessageSafe}, metadata, createdBy, updatedBy, timestamps }`.
- **`client` n'est PAS dans l'enum** (jamais une identité configurable — résolu depuis le contexte).
- Appariement imposé `ROLE_SCOPE = { support:'platform', commerciale:'institute' }` (validateur schéma).
- Index **unique partiel** `{role,scope}` où `active:true` (1 actif/role-scope) + index lookup
  `{email,role,scope}`. **Aucun secret stocké.**

## 2. Service `services/communicationIdentityService.js`

`createCommunicationIdentity`, `listCommunicationIdentities`, `setActiveCommunicationIdentity`,
`requestSenderVerification`, `confirmSenderVerification`, `refreshIdentityVerificationStatus`,
`getActiveIdentity`, `assertIdentityReady`. Règles : support→platform, commerciale→institute,
**`client` rejeté** (`client_not_configurable`), email lowercase, displayName requis,
`active` seulement si `verified` (sinon `identity_not_verified`), `setActive` séquentiel (désactive
le même scope avant — compatible standalone sans transaction). `assertIdentityReady(role,scope,{mode})` :
`strict` (défaut, throw `identity_not_ready`) ou `warn` (`{ready:false}`). `domainAuthenticated:false`
**n'empêche pas** d'être prêt (verified suffit) ; le flag est exposé. Erreurs typées
`CommunicationIdentityError {code,status}`.

## 3. Adapter Brevo `services/communicationBrevoSenderAdapter.js` (mockable)

`requestSenderVerification({email,name})` (`POST /v3/senders` → Brevo envoie son OTP),
`confirmSenderVerification({senderId,otp})` (`PUT /v3/senders/:id/validate`),
`getSenderStatus({email})` (`GET /v3/senders`, source de vérité `active`),
`getDomainStatus({domain})` (`GET /v3/senders/domains/:domain`, best-effort → `{authenticated,status,
dnsRecords[]}`). Clé via `getCredential('brevo',{role:'api_key'})` ; **jamais d'OTP maison** (Brevo le
fait) ; **jamais de secret renvoyé** ; erreurs normalisées (`BrevoSenderAdapterError`,
`provider_not_connected`/`provider_error`). Non bloquant si Brevo absent.

## 4. Domaine DNS

`domain` dérivé de l'email ; `domainAuthenticated`/`domainStatus`/`dnsRecords[]` peuplés par
`refreshIdentityVerificationStatus` via l'adapter (best-effort). M1 **ne bloque aucun envoi** existant
sur le domaine ; les champs préparent l'UI future.

## 5. Resolver `services/communicationRoleResolver.js` (brique seule)

`resolveSender(role,ctx)` (support/commerciale → identité active), `resolveRecipient(role,ctx)`
(support/commerciale → identité active ; **client → `context.client.email`**),
`resolveMailEnvelope({fromRole,toRole,context})` → `{ from:{email,name,role}, to:[{email,name?,role}] }`.
Erreur contrôlée si identité absente (`identity_not_ready`) ; **jamais de fallback hardcodé**.
**NON câblé aux envois existants** (M2).

## 6. Endpoints (aucun endpoint public)

Montés sous `/api/gestion` (déjà `requireGestionRole()`).
- **Dev** (`requireStrictDev`) — `/api/gestion/dev/communication-identities` :
  `GET /`, `POST /support`, `POST /:id/request-verification|confirm-verification|set-active|refresh`.
- **Admin/Dev** (`requireAdminOrDev`) — `/api/gestion/communication-identities` :
  `GET /`, `POST /commerciale`, `POST /:id/request-verification|confirm-verification|set-active|refresh`.
- **support = dev only** ; **commerciale = admin/dev** ; **client jamais configurable** (aucune route).
  Le controller bloque la gestion d'une identité `support` par un non-dev (`forbidden_support_identity`,
  403). Payload **safe** (`toSafe`, aucun secret).

## 7. Rôles support / commerciale / client

- **support** → adresse plateforme/dev → support → institut.
- **commerciale** → adresse institut/admin → institut → client.
- **client** → résolu depuis le contexte métier (`context.client.email`), **jamais stocké/configuré**.

## 8. Tests (+31 backend → 442)

- `communicationIdentityModel.test.js` (6) : enums, scope cohérent, client refusé, displayName,
  email lowercase, 1 actif/role-scope.
- `communicationIdentityService.test.js` (9) : create support/commerciale, client refusé, scope
  incohérent, displayName, setActive interdit si non vérifié / ok si vérifié, getActive/assertReady.
- `communicationRoleResolver.test.js` (7) : sender support/commerciale, fromRole invalide, recipient
  client depuis contexte, client absent, identité absente, envelope.
- `communicationIdentityRoutes.test.js` (7) : dev crée support, admin crée commerciale, admin ne gère
  pas support (403), dev request-verification (mock Brevo), liste, non-connecté refusé, payload safe.
- `communicationIdentityBrevoVerification.test.js` (2) : request→confirm→refresh (verified +
  domainAuthenticated), échec provider → `lastErrorMessageSafe` sans secret.
- **Adapter Brevo mocké** (vi.mock) ou getCredential+fetch mockés → **aucun vrai e-mail**.

### Suites complètes
`npm test` (442) + audits (36 / 20) verts. Frontend inchangé (78 tests + build + lint verts).

## 9. Compat / non-régression

- **mailService / SendLog / EventLog / webhook Brevo** : **non modifiés** (M1 = brique additive).
- `buildSender()` (`MAIL_FROM`) et `postToBrevo` inchangés → les envois actuels continuent à
  l'identique. Le resolver n'est pas branché (M2).
- Aucun secret exposé ; erreurs provider → message sûr.

## 10. Limites M1

- Resolver **non câblé** aux dispatchers existants (les templates utilisent toujours `MAIL_FROM`).
- Pas d'UI React (configuration via endpoints uniquement).
- Domaine DNS = best-effort (dépend de Brevo Domain API).
- `assertIdentityReady` disponible mais non encore utilisé par les envois.

## 11. Prochaine mission — M2 (Mail Event Dispatch Engine)

Câbler les envois sur le resolver fromRole/toRole + `assertIdentityReady` (gate d'expéditeur),
remplacer progressivement `buildSender()` par l'identité active résolue, dispatch événementiel
(mapping event → template → fromRole/toRole). Puis UI React (Manager/Dev) de gestion des identités.
