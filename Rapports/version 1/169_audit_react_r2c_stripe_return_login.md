# 169 — Audit pré-R2C : retour Stripe React + login client léger

> Audit avant la fermeture de la boucle paiement React (URLs de retour React + session-status +
> login client). Branche `phase-0-security-baseline`. Suite de R2B (167/168) et U2 (153).

## 1. URLs success/cancel actuelles (hosted)

`services/stripe/stripeCheckoutService.js:760-761` (mode hosted, flag `CHECKOUT_HOSTED=true`) :
```
success_url: `https://${NGROK_DOMAIN}/vitrine.html?slug=payment&checkout_session_id={CHECKOUT_SESSION_ID}`
cancel_url:  `https://${NGROK_DOMAIN}/vitrine.html?slug=checkout`
```
→ **codées en dur vers le Vanilla.** Stripe substitue `{CHECKOUT_SESSION_ID}` par l'id `cs_…` de la
Checkout Session (PAS le PaymentIntent). `NGROK_DOMAIN` requis (500 sinon).

## 2. Endpoint résultat paiement

- `GET /api/stripe/payment-result?payment_intent_id=pi_…` (`requireAuth`) → `{ok, status:'succeeded'|
  'pending'|'failed', purchase?, errorMessage?, origin?}` (vérifie Stripe + propriété DB).
- `GET /api/stripe/session-status?payment_intent_id=…|session_id=…` (`requireAuth`) →
  `{ok, status:'complete'|'open', payment_status, origin, item}`. **⚠️ Limite actuelle** : il fait
  `stripe.paymentIntents.retrieve(id)` — donc un id `cs_…` (Checkout Session) **échoue** (ce n'est pas
  un `pi_…`). La Session Stripe doit d'abord être récupérée pour obtenir son `payment_intent`.

## 3. Paramètres nécessaires côté React

Le retour hosted ne peut transporter que `{CHECKOUT_SESSION_ID}` (= `cs_…`). Donc la page React
`/paiement/succes` recevra `session_id=cs_…` et devra appeler **session-status** — qui doit savoir
résoudre un `cs_…` (→ enhancement §Plan). Le PI id n'est pas disponible dans l'URL de retour Stripe.

## 4. Login backend existant

`POST /auth/login` (rate-limited) : `{email, password}` →
- succès client : `200 {ok:true, role, currentMode, mustChangePassword}` + cookie de session posé
  (HttpOnly, signé — `createSessionCookie`).
- mauvais identifiants : `401 {ok:false, error}`. Compte désactivé : `403`. Email non vérifié :
  `403 EMAIL_NOT_VERIFIED`. (Cas admin : `{blocked, reason}` — hors scope client.)
- `GET /auth/me` (`requireAuth`) → `{ok, user:{id,email,role,...}}`. `POST /auth/logout` → `{ok}`.

## 5. Cookies

Session = **cookie HttpOnly signé** (`beautysavage_session`), posé par le backend. React ne lit/écrit
**jamais** le token (HttpOnly) ; il envoie `credentials:'include'`. **Aucun token en localStorage.**

## 6. Reprise panier

Le panier React est **local** (`localStorage` `bs_cart`, `CartProvider`), indépendant de la session.
Un login/redirect ne le perd pas. `useAuth().refresh()` (AuthProvider) re-fetch `/auth/me` après login.

## 7. Risques

| Risque | Mitigation |
|---|---|
| Casser le Vanilla | URLs React **derrière env** `CHECKOUT_RETURN_BASE_URL` ; absente → URLs Vanilla **inchangées**. |
| Open redirect | la base vient de l'**env** (jamais du client) + validée http(s) absolue ; `redirect` du login validé interne (`/…`, pas `//`/`http`). |
| session-status échoue sur `cs_` | enhancement additif : si id `cs_…` → `checkout.sessions.retrieve` → `payment_intent` ; chemin `pi_` inchangé. |
| Vider le panier trop tôt | ne vider que si `succeeded`/`free confirmé` ; jamais si `pending`/`unknown`. |
| Secret front | aucun ; cookie HttpOnly ; pas de Stripe.js. |
| Changer pricing/finalizers/consentements | **interdit** : on ne touche qu'aux URLs de retour + lecture session-status. |

## 8. Plan R2C

1. **Backend** : `CHECKOUT_RETURN_BASE_URL` (`.env.example`). `buildHostedReturnUrls(ngrokDomain,
   checkoutId)` → si base http(s) présente : `success=${base}/paiement/succes?session_id={CHECKOUT_SESSION_ID}&checkoutId=…`,
   `cancel=${base}/paiement/annule` ; sinon Vanilla (inchangé). Enhancer `getSessionStatusFromRequest`
   pour résoudre les ids `cs_…`. Tests `hostedCheckoutReactReturnUrls` + `checkoutSessionStatus`.
2. **api-client** : `getCheckoutSessionStatus(sessionId)` (+ mapping succeeded/pending/failed/unknown),
   `auth/login(email,password)` (+ getSession/logout existants).
3. **PaymentSuccessPage** : gère `free=1`, `session_id=cs_…` (session-status), `payment_intent_id=pi_…`
   (payment-result), absence → support. Vide le panier **uniquement** si confirmé.
4. **LoginPage** (`/connexion`) : form email/password → `login` → `refresh()` → redirect interne
   validé (`?redirect=` ou `/checkout` si panier) ; erreurs inline.
5. **CheckoutPage** : 401 → lien `/connexion?redirect=/checkout` (panier conservé).
6. Tests frontend + backend, build/lint, docs + rapport 170, `.env.example`.

### Hors périmètre (rappel)
Inscription, reset password, OAuth, espace client complet, manager/dev, checkout produits/formations.
