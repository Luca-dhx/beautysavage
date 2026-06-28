# 132 — Sprint F3B : split interne de mailService

> `mailService.js` (~3845 lignes, dernier monolithe backend du rapport 120) est scindé en
> modules focalisés sous `services/mail/`. **Zéro changement fonctionnel / template / contenu
> email / payload Brevo / SendLog / API.** Suite **353 verte** + audits 36 + 20.

## mailService.js — avant / après
| | Lignes |
|---|---|
| Avant (HEAD fe38188) | **3845** |
| Après (façade) | **49** |

`mailService.js` devient une **façade de compatibilité** : elle re-exporte l'API publique
historique (`loadTemplate`, `saveTemplate`, `postToBrevo`, 34 dispatchers `send*`/`simulate*`,
`mailTemplateDefaults`, `mailFunctions`). Les importateurs (controllers/routers/jobs) et les
tests qui mockent `mailService` restent valides sans modification.

## Modules créés (`services/mail/`)
| Module | Lignes | Rôle |
|---|---|---|
| `mailRenderer.js` | ~740 | Thème/couleurs, builders premium HTML, `createMailTemplateDefinition`, sanitization (`sanitizeFullHtml`, `stripHtml`), `replaceTemplateVariables`, `formatAmount`, `normalize*`, `VARIABLE_KEYS`, `getActiveMailThemeVars`/`withMailThemeVars`. |
| `mailTemplateRuntime.js` | ~994 | `TEMPLATE_FUNCTIONS` (définitions par défaut) + `AVAILABLE_FUNCTIONS`, `findActiveTemplateDoc`, `ensureTemplate`, fallbacks, `loadTemplate`, `saveTemplate` (interaction `EmailTemplate` versionné, published-only). |
| `mailBrevoGateway.js` | ~67 | `postToBrevo` : credentials Brevo (`getCredential`), `fetch` Brevo, gestion erreurs, SendLog via `mailTrackingService`. |
| `mailDomainDispatchers.js` | ~2155 | Les 34 dispatchers métier (`sendSaleEmail`, `sendRefund*`, `sendBooking*`, `sendCommission*`, `sendPasswordResetEmail`, …) + helpers (`sendStatusMail`, `sendSingleTemplateMail`, `buildCommonMailVars`, `buildSender`, `pickRandomSale`, …). Aucune logique Brevo/template/SendLog brute. |
| `mailTrackingService.js` | ~13 | Ré-export `createQueuedSendLog`/`markSendLogSent`/`markSendLogFailed` (impl `sendLogService`). |
| `mailContextResolver.js` | ~9 | Ré-export `hashRecipient` ; documente que contextType/contextId est dérivé dans `sendLogService`. |
| `mailDispatcher.js` (E2) | inchangé | Seam de dispatch (re-exporte depuis `mailService`). |

DAG **acyclique** : `mailRenderer` (← Theme) ← `mailTemplateRuntime` (← EmailTemplate,
sanitizeEditorialHtml) ← `mailDomainDispatchers` (← Sale, User/PractitionerProfile dynamiques,
getAppBaseUrl, crypto) ; `mailBrevoGateway` (← getCredential, mailTrackingService) ;
`mailService` façade ← {runtime, gateway, dispatchers}. Chargement de tous les modules vérifié.

## Comportement inchangé — preuves
- **Slicing verbatim** : les blocs (dont `TEMPLATE_FUNCTIONS`, ~756 lignes de contenu email)
  sont déplacés à l'octet près ; seuls imports/exports et chemins des **imports dynamiques**
  (`User`, `PractitionerProfile` : `../models/` → `../../models/`) ont été adaptés.
- **Caractérisation** (`mailServiceCharacterization`, +4, verte avant/après) : `postToBrevo`
  (endpoint + header `api-key` + SendLog sent/failed, aucun email/clé en clair), `loadTemplate`
  fallback défaut, `sendPasswordResetEmail` bout-en-bout (rendu → payload Brevo, aucune clé exposée).
- Suites existantes inchangées et vertes : `emailTemplateRuntimePublished`, `sendLog`,
  `sendLogContextAttachment`/`Events`/`Endpoint`, `brevoWebhook*`, `emailRemainingContexts`,
  `emailTemplateRollback`, `notificationEvent*`, etc.

## Isolation (Partie 5)
- `fetch('https://api.brevo.com…')` + header `api-key` : **uniquement** `mailBrevoGateway`.
- `EmailTemplate` : **uniquement** `mailTemplateRuntime`.
- SendLog (`createQueuedSendLog`/`markSendLogSent`/`markSendLogFailed`) : via `mailTrackingService`
  (→ `sendLogService`) ; aucun accès SendLog direct dans les dispatchers.
- `mailDomainDispatchers` ne contient aucune logique Brevo/template/SendLog brute.
- Pas de dépendance circulaire ; pas de `process.env` ajouté (seul `buildSender` lit
  `MAIL_FROM`/`MAIL_FROM_NAME`, déplacé verbatim dans les dispatchers).

## Tests exécutés
- `npm test` → **353 passed** (p0=44, p1=303, integration=6) — dont `mailServiceCharacterization` (+4).
- `npm run audit:business-scenarios` → **36 passed**.
- `npm run audit:commissions` → **20 passed**.

## Dette restante
- `mailDomainDispatchers.js` (~2155 l) reste volumineux : il pourrait être sous-découpé par
  domaine (`mailSaleDispatchers`/`mailBookingDispatchers`/`mailRefundDispatchers`/…). Faible
  priorité (cohésion thématique, aucun couplage Brevo/template résiduel).
- `mailContextResolver`/`mailTrackingService` sont des seams fins (la logique vit dans
  `sendLogService`) — consolidation possible si `sendLogService` était renommé sous `services/mail/`.

## Verdict pré-React
**GO React.** Tous les monolithes backend identifiés au rapport 120 sont résorbés :
`clientController` (checkout → `services/checkout/`), `stripeController` (Stripe Institut →
`services/stripe/`), Stripe Dev + facturation contrat (`services/stripe/dev/` + `services/contract/`),
et `mailService` (→ `services/mail/`). Les contrôleurs sont des orchestrateurs HTTP minces, les
domaines sont isolés derrière des frontières testées (caractérisation + parité), API/payloads
inchangés. Le backend est prêt pour le chantier React (front découplé de l'implémentation interne).
