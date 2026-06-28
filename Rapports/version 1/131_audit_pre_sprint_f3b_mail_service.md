# 131 — Audit pré-Sprint F3B : mailService

> Cartographie de `services/mailService.js` (3845 l, double-interligne ⇒ ~1900 l de logique)
> avant split. Caractérisation verrouillée avant extraction (`mailServiceCharacterization`, 4 ;
> + couverture existante template/SendLog/Brevo).

## Responsabilités (zones)
| Zone | Lignes (approx) | Contenu |
|---|---|---|
| **Rendu / thème** | 16-261, 1103-1472 | `MAIL_THEME`, builders premium HTML (`buildPremiumMailTemplate`, callouts/buttons/rows), `createMailTemplateDefinition`, couleurs (hex/rgb/mix), `getActiveMailThemeVars`/`withMailThemeVars`, `sanitizeFullHtml`, `stripHtml`, `replaceTemplateVariables`, `formatAmount`, `normalizeFunctionName`/`normalizeMode`, `VARIABLE_KEYS`, `ALLOWED_MODES`. |
| **Définitions templates** | 262-1018 | `TEMPLATE_FUNCTIONS` (contenu par défaut de tous les emails) + `AVAILABLE_FUNCTIONS`. |
| **Runtime templates** | 1479-1686 | `findActiveTemplateDoc`, `ensureTemplate`, fallbacks, `loadTemplate`, `saveTemplate` (EmailTemplate versionné, published-only). |
| **Sender / liens** | 1690-1731 | `buildSender` (MAIL_FROM), `buildPasswordResetLink`, `buildInvoiceDownloadUrl`. |
| **Passerelle Brevo** | 1733-1787 | `postToBrevo` : `getCredential('brevo')`, `fetch` Brevo, SendLog (queued/sent/failed via `sendLogService`). |
| **Dispatchers métier** | 1788-3841 | 34 `send*`/`simulate*` + helpers (`sendStatusMail`, `sendSingleTemplateMail`, `buildCommonMailVars`, `normalizeRecipientEmails`, `collectAdminAndDevEmails`, `pickRandomSale`, `sendPremiumHtmlEmail`, …). |
| **Exports agrégés** | 3842-3844 | `mailTemplateDefaults` = TEMPLATE_FUNCTIONS, `mailFunctions` = AVAILABLE_FUNCTIONS. |

## Dépendances
- Externes : `EmailTemplate`, `Theme`, `Sale` (statiques) ; `User`, `PractitionerProfile`
  (**imports dynamiques** `../models/…`) ; `sanitizeEditorialHtml`, `getAppBaseUrl`, `getCredential`,
  `sendLogService` (`createQueuedSendLog`/`markSendLogSent`/`markSendLogFailed`), `crypto`.
- **SendLog déjà externalisé** dans `sendLogService` (tracking + hashRecipient + contextType).

## Zones Brevo / SendLog / context
- Brevo : un seul `fetch` + header `api-key` dans `postToBrevo`.
- SendLog : entièrement délégué à `sendLogService` (pas de modèle SendLog manipulé directement).
- Context : `contextType`/`contextId` dérivé dans `sendLogService.createQueuedSendLog`.

## Risques
- 🔴 `TEMPLATE_FUNCTIONS` (~756 l de contenu) doit rester **byte-identique** → slicing verbatim.
- 🔴 Beaucoup de modules importent des `send*` **directement depuis `mailService`** + des tests
  **mockent `mailService`** → `mailService` doit rester la **façade** exportant l'API publique.
- 🟡 Imports dynamiques `User`/`PractitionerProfile` (`../models/`) → corriger en `../../models/`
  quand les dispatchers passent sous `services/mail/`.
- 🟡 Interleaving rendu↔définitions : `replaceTemplateVariables` utilise `VARIABLE_KEYS`,
  `TEMPLATE_FUNCTIONS` utilise les builders premium → grouper rendu ensemble, définitions avec le runtime.

## Plan d'extraction (DAG acyclique)
```
mailRenderer (← Theme)                         [rendu/thème/sanitize/replaceVars]
   ↑
mailTemplateRuntime (← EmailTemplate, sanitizeEditorialHtml)   [TEMPLATE_FUNCTIONS + load/save]
   ↑
mailDomainDispatchers (← Sale, User/Practitioner dyn., getAppBaseUrl, crypto)  [send*]
mailBrevoGateway (← getCredential, mailTrackingService)        [postToBrevo]
mailTrackingService → sendLogService ; mailContextResolver → sendLogService
mailService.js = façade (re-exporte l'API publique : loadTemplate/saveTemplate/postToBrevo/
  send*/simulate + mailTemplateDefaults/mailFunctions)
```
Slicing verbatim (linker déterministe) : extraire les blocs, résoudre imports siblings/externes,
exporter les symboles, corriger les imports dynamiques, et réduire `mailService` à la façade.

## Tests couvrants existants
`emailTemplateRuntimePublished` (loadTemplate published/draft/fallback), `sendLog` (postToBrevo
queued/sent/failed + hashRecipient), `brevoWebhook*`, `emailRemainingContexts`,
`emailTemplateRollback`, `sendLogContextAttachment`/`Events`/`Endpoint`, `notificationEvent*`.

## Tests manquants (ajoutés F3B)
`mailServiceCharacterization` : `postToBrevo` (endpoint + api-key + SendLog + aucune fuite),
`loadTemplate` fallback défaut, `sendPasswordResetEmail` bout-en-bout (rendu→payload Brevo).
