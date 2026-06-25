# 53 — Rapport : SendLog & observabilité email Brevo

> Phase 2 de la roadmap. Repo `backend/`, branche `phase-0-security-baseline`,
> base `e3c83a6`. **Tests : 30 fichiers / 117 verts** (était 99, +18).
> Aucune valeur de secret ni email réel n'est affichée.

## 1. Périmètre livré

1. **WEBHOOK_API_KEY** — audit final + suppression (rapport 52).
2. **SendLog** — modèle d'observabilité des envois (`models/SendLog.js`).
3. **Instrumentation Brevo** — `mailService.postToBrevo` crée un SendLog `queued`
   puis `sent`/`failed`.
4. **Webhook Brevo** — `controllers/brevoWebhookController.js` +
   `routers/brevoWebhookRouter.js` (delivered/opened/hard_bounce/soft_bounce).
5. **Endpoint diagnostic** — `GET /api/gestion/dev/send-logs` (requireStrictDev).

## 2. Modèle SendLog

`models/SendLog.js` — un document par envoi sortant.

| Champ | Rôle |
|---|---|
| `channel` / `provider` | `email` / `brevo` |
| `templateKey` | type d'email (dérivé des tags Brevo) |
| `recipientHash` | **SHA-256 de l'email** (jamais l'email en clair) |
| `status` | `queued → sent → delivered → opened` (ou `bounced`/`failed`) |
| `providerMessageId` | id Brevo (corrélation webhook) |
| `subject` | sujet (diagnostic ; ni email ni secret) |
| `contextType` / `contextId` | rattachement métier optionnel (V1 : null) |
| `metadata` | tags, etc. |
| `queuedAt`/`sentAt`/`deliveredAt`/`openedAt`/`bouncedAt` | horodatages |
| `errorCode` / `errorMessageSafe` | erreur **sûre** (jamais le payload brut provider) |

**Confidentialité** : jamais l'email complet (hash uniquement), jamais de secret.
**Index** : `providerMessageId`, `{status, createdAt}`, `createdAt`,
`{contextType, contextId}`.

## 3. Instrumentation (mailService)

`postToBrevo` (désormais exporté pour test) :
1. `createQueuedSendLog(payload)` → statut `queued` (recipient hashé, templateKey
   des tags).
2. Clé Brevo indisponible → `failed` (`provider_not_configured`), retourne `false`.
3. Appel Brevo en échec réseau → `failed` (`network_error`).
4. Brevo refuse (HTTP non-ok) → `failed` (`http_<status>`), **corps brut non
   stocké**.
5. Succès → lecture du `messageId` Brevo → `sent` + `providerMessageId`.

**Comportement métier conservé** : retour `true`/`false` identique ; toutes les
opérations SendLog sont **défensives** (try/catch) — un échec de log ne casse
jamais l'envoi (pattern fire-and-forget). Ajout d'un `try/catch` autour de `fetch`
(durcissement : plus d'exception non gérée sur erreur réseau).

## 4. Webhook Brevo

`POST /api/webhooks/brevo` (public, hors `contractGuard` — ajout de `/api/webhooks/`
à l'allowlist, comme les webhooks Stripe).
- Événements supportés : `delivered`, `opened` (+`unique_opened`),
  `hard_bounce`, `soft_bounce`. Corrélation par `providerMessageId`
  (`message-id` / `messageId` / `message_id`).
- Met à jour le SendLog (statut + horodatage). Batch (array) supporté.
- **Sécurité** : Brevo ne signe pas en HMAC. Protection = **secret partagé
  optionnel** (`x-brevo-secret` ou `?secret=`), résolu via le coffre
  (`brevo/webhook_secret`) **ou** `BREVO_WEBHOOK_SECRET`. Si configuré → comparaison
  **timing-safe**, sinon 401. Si **non** configuré → accepte + warning unique
  (**limite V1 documentée** : ajouter le secret + une allowlist IP en prod).
- **Jamais** d'email loggé (seulement `event` + `matched`).
- Réponse toujours 200 (sauf secret invalide → 401) pour éviter les retries.

## 5. Endpoint diagnostic

`GET /api/gestion/dev/send-logs` — `routers/devDiagnosticRouter.js` +
`controllers/devDiagnosticController.js`.
- Garde : périmètre `/api/gestion` (admin/dev) **puis** `requireStrictDev` (dev
  seul). Client → 403, admin → 403, dev → 200 (testé).
- Retour : N derniers SendLog (défaut 50, max 200), filtre `?status=`. Champs
  sûrs uniquement — **jamais** email/token/secret (recipient = hash).

## 6. Tests (18)

- `tests/p1/sendLog.test.js` — hash, queued/sent/failed, applyBrevoEvent, postToBrevo (succès/refus/réseau).
- `tests/p1/brevoWebhook.test.js` — delivered/opened/bounce, batch, id inconnu, secret partagé, pas d'email loggé.
- `tests/p1/sendLogEndpoint.test.js` — dev 200 (sans email/secret), admin 403, client 403.

## 7. Limites V1 (assumées)

- Pas de réconciliation stricte d'ordre des événements (delivered/opened) : le
  statut suit le dernier événement reçu.
- Pas de retry d'envoi (le SendLog `failed` trace, ne re-tente pas).
- `contextType`/`contextId` non remplis (V1) : `postToBrevo` n'a pas le contexte
  métier ; extensible plus tard sans refonte (paramètre déjà prévu).
- Webhook non authentifié si `BREVO_WEBHOOK_SECRET` absent (documenté).
- Pas d'UI (hors périmètre, post-React).

## 8. Risques

| Risque | Statut |
|---|---|
| Email perdu invisible (D-C1/D-I4) | **Fermé** — SendLog trace queued/sent/failed |
| Pas de delivery/bounce tracking (D-C4) | **Fermé** — webhook Brevo → SendLog |
| Email/secret loggé | **Fermé** — hash + champs sûrs + tests anti-fuite |
| `WEBHOOK_API_KEY` live | **Code nettoyé** ; 🔴 **révocation Stripe = action manuelle** |
| Webhook non signé (Brevo) | 🟠 secret partagé optionnel + IP allowlist à activer en prod |
| `contextType/Id` non remplis | 🟢 V1, extensible |

## 9. Prochaine phase recommandée

**Bus d'événements** (roadmap Phase suivante) : émettre `email.sent/delivered/
opened/bounced` depuis SendLog vers une timeline métier, puis **versioning des
templates** (draft→publish). Brancher `contextType/contextId` (rattacher chaque
SendLog à la Sale/Booking d'origine) lors de cette étape.
