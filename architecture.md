(# Architecture Beauty Savage

## 1. Vue d'ensemble du projet
### Objectif global de l'application
- `app.js` orchestre un backend Node.js/Express/Mongo qui alimente deux surfaces : une vitrine publique orientÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©e lecture et un espace de gestion pilotÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© par un CMS modulaire.
- Le backend expose des API factuelles, les controllers concentrent la logique mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©tier et MongoDB reste la source unique de vÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©ritÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â© pour les pages, les thÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨mes, les utilisateurs et les formations.

### Distinction claire vitrine / gestion
- La vitrine (`public/vitrine.html` + `public/js/vitrine.js`) est un point d'entrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©e lecture seule : elle charge un menu issu de `VitrineMenuItem`, rÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©sout un slug vers `moduleFile` dans `pages` et affiche un ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©cran de statut (`OK`, `FORBIDDEN`, `PAGE_DISABLED`).
- L'espace de gestion (`public/gestion.html` + `public/js/gestion.js`) repose sur les mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Âªmes pages mais filtrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©es sur `type = gestion`. Seuls les modules dÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©finis par ce type sont accessibles et toutes les actions ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©crivent dans Mongo via `/api/gestion/*`.
- La philosophie : backend = logique mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©tier, validation et contrÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â´le d'accÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¨s ; frontend = rendu UI, modules dynamiques et feedbacks utilisateurs sans logique mÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©tier cachÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â©e.

## 2. Stack technique
### Backend
- `controllers/stripeController.js` : 7 fonctions :
  - `createCheckoutSession` (POST /api/stripe/create-checkout-session, requireAuth) : gere deux modes Ã¢â‚¬â€ achat direct (checkoutState.item) et panier multi-articles (checkoutState.cart === true). Achat direct : valide le checkoutState + legal + references catalogues (user/item/session/options), bloque les doubles achats actifs. Panier : valide `legal.acceptedCgv`, valide que toutes les `consumerWaivers` ont `accepted: true`, valide chaque article via `validateCartItemsAgainstCatalog`. Dans les deux cas : bloque les doubles achats actifs, cree un `StripeCheckoutIntent` en MongoDB, cree un `PaymentIntent` Stripe (montant = `totals.remainingToPay`), retourne `{ clientSecret, returnUrl }`.
  - `handleWebhook` (POST /api/stripe/webhook, raw body) : ecoute `payment_intent.succeeded`, verifie la signature, idempotence via `stripePaymentIntentId` (fallback `stripeSessionId`) sur Sale, appelle `processCheckoutStatePurchase` depuis `StripeCheckoutIntent` ou fallback metadata PaymentIntent si l intent Mongo manque, applique jusqu a 3 tentatives locales rapides en cas d erreur transitoire, log l erreur complete + stack, puis tente 3 recuperations des frais Stripe (3s d intervalle) avant de laisser la vente en attente.
  - `getSessionStatus` (GET /api/stripe/session-status?payment_intent_id=pi_xxx, requireAuth) : retrouve le PaymentIntent Stripe, retourne `{ status ('complete'|'open'), payment_status, origin, item }`.
  - `getPaymentResult` (GET /api/stripe/payment-result?payment_intent_id=pi_xxx, requireAuth) : verifie le resultat via Stripe + Mongo + session utilisateur, retourne `pending | succeeded | failed` avec recap achat securise.
  - `getTransactionFees` (GET /api/stripe/transaction-fees?paymentIntentId=pi_xxx, requireAuth + role admin/dev) : recupere `fee/net/currency` via `PaymentIntent -> Charge -> BalanceTransaction`, met a jour `Sale.stripeFee/stripeNet` si disponibles, et retourne `updated: true|false`.
  - `getPendingFeesCount` (GET /api/stripe/pending-fees-count, requireAuth + role admin/dev) : retourne `{ count }` des ventes Stripe en attente (`stripePaymentIntentId` present et `stripeFee = null`).
  - `getConfig` (GET /api/stripe/config, public) : retourne `{ publishableKey }` uniquement.
- `routers/stripeRouter.js` : monte les 7 routes, le webhook utilise `express.raw({ type: 'application/json' })`, les routes protegees ont leur propre parseur JSON local.
- `app.js` : `cookie-parser` est monte avant `stripeRouter`, `stripeRouter` est monte AVANT `express.json()` (raw body pour le webhook). CSP : `scriptSrc` + `frameSrc` + `https://js.stripe.com`, `connectSrc` + `https://api.stripe.com`. Ajout d un scheduler de recuperation frais Stripe (toutes les 10 min) avec arret auto si aucune vente en attente et relance automatique via callback webhook lors d une nouvelle vente en attente.
- `models/StripeCheckoutIntent.js` : collection temporaire (TTL 1h) pour stocker le checkoutState complet. `stripeSessionId` = PaymentIntent ID.
- `models/Sale.js` : champs `stripePaymentIntentId` (cible) + `stripeSessionId` (compat) pour idempotence webhook et verification du resultat. Ajout de `stripeFee` et `stripeNet` (centimes Stripe), `commissionRate` (pourcentage prestataire) et `commissionAmount` (montant commission prestataire, en euros) stockes sur la vente.
- `controllers/clientController.js` : `processCheckoutStatePurchase` exporte Ã¢â‚¬â€ detecte `checkoutState.cart === true` et delegue a `processCartCheckoutStatePurchase` pour le panier multi-articles ; sinon traite l achat direct (formation/produit/carte cadeau). `processCartCheckoutStatePurchase` : itere sur `checkoutState.items[]`, cree un Purchase par article, reserve les sessions presentiel, construit les saleItems avec `consumerWaiverSnapshot` par article depuis `checkoutState.refundPolicySnapshots[formationId]`, cree une seule Sale, declenche `runPostSaleSideEffects` une seule fois. Rollback complet (purchases + sessions) si erreur avant `postSaleSideEffectsApplied`. Ajout de `GET /api/client/purchase-status?formationId=...&sessionId=...` (requireAuth) pour exposer le statut d achat actif cote vitrine.

### Frontend
- `public/js/modules/paymentSimulationModule.js` : formulaire Stripe via Payment Element standard. Refonte UI 2026-03-20.
  - Layout : header sÃƒÂ©curisÃƒÂ© (`bi-lock-fill` + "PropulsÃƒÂ© par Stripe"), rÃƒÂ©capitulatif commande collapsible `<details>` (items + options + sessions + dÃƒÂ©duction carte cadeau + total monospace), zone Stripe (loader Ã¢â€ â€™ Payment Element), bouton "Payer" fond noir `#000` texte blanc radius 6px avec icÃƒÂ´ne `bi-lock-fill`, mention sÃƒÂ©curitÃƒÂ© discrÃƒÂ¨te sous le bouton.
  - Mode normal (checkoutToken dans URL) : cree le PaymentIntent, charge `https://js.stripe.com/v3/` dynamiquement, `stripe.elements({ clientSecret })`, `elements.create('payment')`, bouton "Payer" -> `stripe.confirmPayment({ elements, confirmParams: { return_url } })`. Ãƒâ€°tat chargement : spinner blanc inline + texte "Traitement...".
  - Si `POST /api/stripe/create-checkout-session` retourne `409 ALREADY_PURCHASED`, affiche un etat bloque avec CTA vers `myformations`.
  - Mode retour (payment_intent dans URL) : rÃƒÂ©sultat affichÃƒÂ© INLINE sur la mÃƒÂªme page (pas de navigation). SuccÃƒÂ¨s : `bi-check-circle-fill` vert + animation `psm-pop-in`, bouton "AccÃƒÂ©der ÃƒÂ  mes formations". Ãƒâ€°chec : `bi-x-circle-fill` rouge + animation `psm-shake`, bouton "RÃƒÂ©essayer".
  - `formatPrice` utilise le format franÃƒÂ§ais (virgule + Ã¢â€šÂ¬).
  - Animations CSS : `@keyframes psm-pop-in` (scale 0.5Ã¢â€ â€™1.1Ã¢â€ â€™1 avec cubic-bezier ÃƒÂ©lastique), `@keyframes psm-shake` (translateX Ã‚Â±8px/5px).
- `public/js/modules/itemDetailModule.js` : verifie `GET /api/client/purchase-status` pour les formations et remplace le bouton d achat par un badge non cliquable `Deja inscrit` quand une session/formation est deja achetee activement.
- `public/js/modules/checkoutModule.js` : re-verifie `GET /api/client/purchase-status` au chargement et a chaque changement de session; bloque le CTA checkout et affiche un message explicite si l utilisateur est deja inscrit.
- `public/js/modules/paymentResultModule.js` : module premium de resultat Stripe (frontend passif, sans action sur PaymentIntent).
  - Lit `payment_intent`, appelle `GET /api/stripe/payment-result`, poll toutes les 2s (max 10) tant que `pending`.
  - Succes : check SVG anime, confettis thematises, recap achat, CTA vers `Mes formations`/`Mes cartes cadeaux` et accueil.
  - Echec : affiche uniquement si `redirect_status=failed` est explicitement present dans l URL de retour Stripe.
- Timeout/polling en attente : message neutre de confirmation differ?e + CTA `Mes formations` + support, sans conclure a un echec.
- `public/js/modules/purchaseFlowService.js` : `finalizePurchase` detecte `paymentProvider === 'stripe'` et skip `submitMockPurchase` (webhook a deja cree la vente). `buildCartCheckoutState(cartItems, appliedGiftCards, totals, consumerWaivers, refundPolicySnapshots)` Ã¢â‚¬â€ construit le checkoutState panier avec `cart: true`, items normalises, waivers groupes, snapshots de politique de remboursement par formation, et appliedGiftCards normalises.
- `public/js/modules/acquisitionNotificationService.js` : badges acquisition non consultes stockes en `sessionStorage` (`beautysavage_notifications`, shape `{ formations, cartesCadeaux }`), incrementes apres achat Stripe reussi, remis a zero a l'ouverture des pages cibles.
- `public/js/vitrine.js` : si `payment_intent` est present dans les query params, le module charge est force vers `paymentResultModule` via le pattern dynamique `moduleFile`.

### Panier multi-articles Ã¢â‚¬â€ Stripe flow (2026-03-20)
- `cartModule.js` : bouton "Acheter la selection" navigue directement vers `slug=checkout&cart=true` via `requestVitrineNavigation`. Aucune logique waiver, gift card ou checkoutState dans le module panier.
- `checkoutModule.js` mode panier (`cart=true` dans query) : charge les articles selectionnes via `getItems()` (cartService), recupere les details en parallele, calcule les waivers par formation (`buildCartItemWaiver`), affiche le recapitulatif multi-articles + CGV + waivers + cartes cadeaux (meme UI que l achat direct, classes CSS `checkoutp-*`). A "Payer" : `buildCartCheckoutState(..., { acceptedCgv: true })` Ã¢â€ â€™ `createCheckoutStateToken` Ã¢â€ â€™ navigation vers page `payment`.
- `buildCartCheckoutState` (purchaseFlowService.js) : 6e parametre optionnel `legal = {}`. Retourne `legal: { acceptedCgv: Boolean(legal?.acceptedCgv) }` dans le checkoutState. Waivers groupes par type : max 2 checkboxes (legal + institut). Calcul par formation : `distanciel` Ã¢â€ â€™ legal, `presentiel < 14j` Ã¢â€ â€™ legal (ou both si refundDays > 14), `14j <= days < refundDays` Ã¢â€ â€™ institut.
- `POST /api/stripe/create-checkout-session` detecte `cart === true` : validation CGV + waivers accepts + catalogue ; meme creation PaymentIntent/StripeCheckoutIntent qu achat direct.
- Webhook `payment_intent.succeeded` inchange Ã¢â‚¬â€ `processCheckoutStatePurchase` detecte `checkoutState.cart === true` et delegue a `processCartCheckoutStatePurchase`.
- `consumerWaiverSnapshot` par saleItem (`{ refundDays, retractationDays: 14, waiverType, waiverAcceptedAt }`) stocke le snapshot immuable au moment de l achat.
- `runPostSaleSideEffects` appele une seule fois apres tous les achats du panier (facture, email, commission).
- `models/Sale.js` : `saleItemSchema` enrichi de `consumerWaiverSnapshot`.

### Webhook event
- Event ecoute : `payment_intent.succeeded` (pas `checkout.session.completed`)
- Event ecoute aussi : `payment_intent.payment_failed` (liberation reservation carte cadeau)
- `stripePaymentIntentId` stocke sur Sale = PaymentIntent ID (`pi_xxx`) avec fallback compat `stripeSessionId`

### Frais Stripe et persistance
- Webhook `payment_intent.succeeded` : apres creation de la `Sale`, tentative de recuperation du `BalanceTransaction` jusqu a 3 fois (3s d intervalle). En cas de succes : stockage `stripeFee`/`stripeNet`; sinon la vente reste en attente (`stripeFee = null`).
- `GET /api/stripe/transaction-fees` : recupere les donnees Stripe a la demande et persiste `stripeFee`/`stripeNet` en base quand disponibles (`updated: true|false`).
- `GET /api/stripe/pending-fees-count` : expose le nombre de ventes Stripe en attente de frais.
- Job auto serveur (`app.js`) : toutes les 10 min, traite les ventes en attente, log les resultats, s arrete quand il n y a plus rien et redemarre automatiquement lorsqu une nouvelle vente Stripe reste sans frais.

### Commission prestataire stockee sur Sale
- La commission prestataire n est pas recalculee au stockage: la valeur deja calculee par `recordCommissionTransactions` est reutilisee.
- `commissionAmount` est la somme des transactions commission de type vente pour la vente courante.
- `commissionRate` reprend le pourcentage de configuration quand le type de commission est `percentage` (sinon `null`).

## Systeme de paiement des commissions (2026-03-19)

### Modeles
- `models/CommissionPayment.js` : document par mois/annee (index unique `{ month, year }`). Champs : `month` (0-11), `year`, `periodStart`, `periodEnd`, `amount` (euros), `status` (pending/succeeded/failed), `stripePaymentIntentId`, `paidAt`, `stripeInvoiceId`, `stripeInvoicePdfUrl`, `sales[]`, `refunds[]`.
- `models/CommissionSettings.js` : singleton settings. Champs : `latePaymentDays` (defaut 15), `reminders[]` ({ daysBeforeDue }), `simulatedDate` (Date|null, dev only).
- `models/Contract.js` : champ `commissions { type: 'fixed'|'percentage', value }` ajoute Ã¢â‚¬â€ auto-rempli a la creation depuis `getActiveCommissionConfig()`.

### Service
- `services/commissionPaymentService.js` :
  - `computeCommissionsForPeriod(periodStart, periodEnd)` : trouve les ventes avec `commissionAmount > 0` dans la periode, les remboursements `stripeRefundStatus=succeeded` et `stripeRefundConfirmedAt` dans la periode, calcule le total net.
  - `getOrComputeCommissionPayment(month, year)` : retourne le document existant ou le cree en `pending`.
  - `refreshCommissionPayment(paymentId)` : recalcule un document pending.
  - `getMonthsFromContractStart(activatedAt, now?)` : liste des `{ month, year }` depuis `activatedAt` jusqu au mois de `now` inclus (defaut : new Date()). Utilise un cursor Date pour eviter les off-by-one. Jamais de mois futurs sans simulation.
  - `getCommissionSettings()` : retourne (ou cree) le singleton settings.

### Controller et routes
- `controllers/commissionPaymentController.js` : 6 fonctions exportees.
- `routers/commissionPaymentRouter.js` : monte sur `/api/commissions`.
  - `GET  /api/commissions/payments` : liste + mois manquants generes a la volee (admin + dev)
  - `POST /api/commissions/payments/:id/create-intent` : cree PaymentIntent Stripe Developer (admin + dev)
  - `GET  /api/commissions/payments/:id/check-status` : verifie statut Stripe, met a jour si succeeded, genere facture (admin + dev)
  - `POST /api/commissions/payments/:id/reset` : remet un paiement a pending pour tests (dev only, bloque en production)
  - `GET  /api/commissions/settings` : retourne latePaymentDays (dev only)
  - `PATCH /api/commissions/settings` : met a jour latePaymentDays (dev only)
  - `POST /api/commissions/settings/simulated-date` : stocke la date simulee en base (dev only, bloque en production). Declenche executeJob() immediatement. { date: 'YYYY-MM-DD' } ou { date: null } pour reinitialiser.

### Simulation de date globale
- `utils/simulatedDate.js` : `getNow()` Ã¢â‚¬â€ retourne `CommissionSettings.simulatedDate` si defini, sinon `new Date()`.
- Tous les calculs d etat et le job de rappel utilisent `getNow()` Ã¢â‚¬â€ la simulation est donc globale et affecte le backend (pas seulement le frontend).
- `commissionReminderJob.js` : `executeJob()` est maintenant exportee Ã¢â‚¬â€ peut etre declenchee a la demande apres changement de date simulee.
- Reinitialisation automatique au redemarrage si souhaite (optionnel, non implemente).

### Facture Stripe Invoice
- Generee sur compte Developer via `stripeDevClient` apres paiement confirme.
- Customer : `monthlyFee.stripeCustomerId` du contrat actif (ou cree a la volee).
- Line items enrichis : `Vente #<saleId> Ã‚Â· <formationType> Ã‚Â· <date> Ã‚Â· Commission <rate>` et `Remboursement #<refundId> Ã¢â€ â€™ Vente #<saleId> Ã‚Â· <date> Ã‚Â· Commission <rate>`.
- Finalisee et marquee payee hors-bande (`paid_out_of_band: true`).
- URL PDF stockee dans `CommissionPayment.stripeInvoicePdfUrl`.

### Frontend
- `public/js/modules/commissionPaymentModule.js` : 2 onglets (Reglement / Reglages).
  - Onglet Reglement : cards comptable (mois uppercase, periode, montant monospace, HR dividers), 5 etats (unavailable/available/warning/late/paid), countdown HH:MM:SS, bouton Payer, menu kebab (facture PDF + action dev reset).
  - Onglet Reglages : stepper latePaymentDays (dev only).
  - Modal Payment Element : loader spinner `.cpm-modal-loader` pendant traitement (Payment Element masque, spinner visible), animation hauteur fluide via `resizeModal()`.
  - Polling 30s des paiements pending. Arret quand tous succeeded ou non disponibles.
  - Simulateur de date (dev uniquement) : stocke la date en base via `POST /api/commissions/settings/simulated-date`, recharge les cards apres confirmation. La date simulee est partagee Ã¢â‚¬â€ tous les admins et le dev voient le meme etat.
- `public/css/commissionPaymentModule.css` : classes prefixe `cpm-`, mobile first, variables CSS theme Beauty Savage. Inclut `.cpm-modal-loader`, `.cpm-loader-spinner`, `.cpm-kebab__item--dev`.

### Regles metier
- Index unique `{ month, year }` : impossible de creer deux fois le meme mois.
- Anti-doublon paiement : verification `status === succeeded` avant creation intent.
- Montant nul : si `total === 0` a la creation, le document est cree directement en `status: succeeded`, `paidAt: periodStart`, `availableMailSentAt: new Date()` Ã¢â‚¬â€ aucun mail de rappel ne sera envoye.
- Deduction remboursement proportionnelle : `refundAmount / totalAmount * commissionAmount`.
- Succes paiement uniquement apres confirmation Stripe via `check-status`.
- Generat. facture asynchrone (non-bloquante) lancee apres `status = succeeded`.

### Idempotence webhook
- Avant de traiter, le webhook verifie : `Sale.findOne({ stripePaymentIntentId | stripeSessionId })` - si existe, retourne 200 sans retraiter.
- `stripePaymentIntentId` porte un index UNIQUE partiel (`name: 'uniq_stripe_payment_intent'`, `partialFilterExpression: { stripePaymentIntentId: { $type: 'string' } }`) depuis la Phase 1B-1 : l'unicite est garantie au niveau base, et la livraison concurrente du meme webhook echoue en `E11000` avant tout effet de bord. Voir la section "Reprise V1 — Phase 0 a Phase 1B-3". `stripeSessionId` reste indexe pour compat. (Ancien etat documente: index `sparse` non unique — desormais obsolete.)

### Regle de securite resultat paiement
- Le webhook Stripe payment_intent.succeeded est la seule source de verite pour la creation de vente.
- Le frontend ne modifie jamais de PaymentIntent et n interfere jamais avec la confirmation Stripe.
- Le resultat client provient de /api/stripe/payment-result (verification Stripe + DB + session utilisateur).
- L ecran d echec est reserve au cas explicite redirect_status=failed ; sinon timeout/pending reste un etat neutre.
- En cas d erreur transitoire pendant le traitement webhook, le serveur effectue jusqu a 3 tentatives locales rapides avant de laisser Stripe planifier un retry.
- Sequence Stripe + carte cadeau: `create-checkout-session` persiste le checkoutState et reserve temporairement le solde carte cadeau (sans debit), puis `payment_intent.succeeded` cree la vente, puis `runPostSaleSideEffects` applique le debit unique et libere la reservation.

### Regle anti double achat formation/session
- Controle backend obligatoire avant Stripe: `POST /api/stripe/create-checkout-session` verifie l absence d achat actif et ne contacte jamais Stripe si un achat actif existe deja.
- Statut bloquant un nouvel achat: `Purchase.participationStatus = 'active'` (regle appliquee via `participationStatus != 'canceled'`).
- Statut autorisant un nouvel achat: `Purchase.participationStatus = 'canceled'`.
- Le modele `Sale` ne porte pas le statut actif/inactif source de verite pour ce controle; la decision se base sur `Purchase`.
### Procedure tests locaux
1. Lancer ngrok : `ngrok http --domain=<NGROK_DOMAIN> 3000`
2. Demarrer le serveur : l'URL webhook est affichee dans la console au demarrage.
3. Coller l'URL dans le dashboard Stripe > Webhooks > Endpoint, selectionner les events `payment_intent.succeeded` et `payment_intent.payment_failed`.
4. Utiliser la carte test `4242 4242 4242 4242` (succes) ou `4000 0000 0000 9995` (refus).

## Auth client - signup + verification email code 6 chiffres (STEP 6)
- Flux client ajoute: `signup -> envoi code -> verify-email -> activation compte`.
- Backend auth (`routers/authRouter.js`):
  - `POST /auth/signup`: cree un compte `role=client` en `emailVerified=false`, hash mot de passe, genere un code 6 chiffres, stocke uniquement le hash du code, expiration 10 min, tentatives reset, envoi email.
  - `POST /auth/verify-email`: verifie email+code (hash compare en timing-safe), limite de tentatives, expiration stricte, active `emailVerified=true`, purge les champs de verification puis cree la session (auto-login).
  - `POST /auth/resend-verification`: renvoi code avec throttling serveur 30s.
  - `POST /auth/login`: refuse les comptes non verifies avec `code=EMAIL_NOT_VERIFIED` (message explicite), sans casser login admin/dev existant, et applique un rate-limit dedie (5 tentatives / 15 min / IP, succes non comptes).
  - `POST /auth/password-reset/request|validate|complete`: rate limits dedies par route via `express-rate-limit` pour eviter spam et brute-force de token.
  - Rate limits dedies sur signup/verify/resend/login/password-reset via `express-rate-limit`.
- Modele `User` et compat:
  - Nouveaux champs: `emailVerified`, `emailVerificationCodeHash`, `emailVerificationExpiresAt`, `emailVerificationAttempts`, `emailVerificationLastSentAt`.
  - Compat legacy: les anciens comptes sans champ restent consideres verifies (`isEmailVerified` fallback true), pour eviter tout lock involontaire.
- Vitrine / navigation:
  - `controllers/vitrineController.js` ajoute des fallback pages publiques `signup` -> `signupModule` et `verify-email` -> `verifyEmailModule`.
  - Login vitrine (`public/login.html` + `public/js/modules/auth.js`) ajoute:
    - lien `Creer un compte`,
    - bouton `Renvoyer le code de verification` en erreur `EMAIL_NOT_VERIFIED`,
    - redirection auto vers `Mon compte` si utilisateur deja connecte.
- Nouveaux modules vitrine:
  - `public/js/modules/signupModule.js`: formulaire email/mot de passe/confirmation, validation locale, loader patte inline, toast universel, redirection vers `verify-email` avec email.
  - `public/js/modules/verifyEmailModule.js`: saisie code 6 chiffres (sanitize/paste), validation, renvoi code avec cooldown 30s (UX) + gestion throttling serveur, auto-login puis redirection `Mon compte`.
- Emails Brevo:
  - `services/mailService.js` ajoute template transactionnel editable `email_confirmation_code` + fonction `sendEmailConfirmationCodeEmail`.
  - `public/js/modules/mailTemplateEditorModule.js` expose ce template dans l editeur (variables `{{firstName}}`, `{{email}}`, `{{code}}`, `{{expiresMinutes}}`).

## Gestion - Clients dashboard + fiche onglets (STEP 7)
- Le module `public/js/modules/clientManagerModule.js` est refondu en UX premium avec deux vues internes sans reload global: `list` (graphe + liste) et `detail` (fiche client).
- Vue `list`:
  - Graphe "Evolution des clients" avec filtres `jour | semaine | mois | annee` agreges cote front depuis `registeredAt`.
  - Liste minimaliste des clients (email + action oeil) ; clic sur oeil ouvre la fiche detail.
  - Loader pattes inline + toast erreur sur chargement initial/filtres.
- Vue `detail`:
  - Header client (email + date inscription) + bouton `Retour a la liste`.
  - Onglets premium `Achats`, `Cartes cadeaux`, `Avis` avec underline animee.
  - `Achats`: liste date/id/montant + modal detail vente (items, facture si disponible, preuves IP/renonciation).
  - `Cartes cadeaux`: liste active/epuisee + modal detail via endpoint gestion gift-card existant.
  - `Avis`: cards avec miniature formation, note en pattes (5), et modal commentaire.
- Donnees backend reutilisees:
  - `GET /api/gestion/clients`
  - `GET /api/gestion/clients/:clientId`
  - `GET /api/gestion/gift-cards/:id`
- Enrichissement minimal de `controllers/clientManagementController.js`:
  - Detail ventes inclut maintenant items, preuves (`client_ip`, `consumerWaiverAcceptedText`) et metadonnees facture.
  - Detail avis inclut `formationId` et `formationCover` pour rendu thumbnail cote gestion.

## Gestion - Planning FullCalendar (correctifs 2026-04-01, v4 2026-04-01)
- `public/js/modules/planningModule.js` : module FullCalendar v6 — refonte UX avec correctifs appliques.
  - Pattern : `export async function renderModule(container)` — injecte le HTML, pre-initialise `state.myPractitionerId` via `GET /schedule/me` avant le rendu calendrier, initialise FullCalendar.
  - State : `{ calendar, root, myPractitionerId }` — vue globale/personnelle et select praticienne supprimes. Le planning affiche toujours le planning de l'admin connecte (`myPractitionerId`).
  - Toolbar custom (headerToolbar: false) : select vue (semaine/jour/mois), navigation prev/today/next, titre dynamique via `datesSet`, bouton "Disponibilites", bouton contextuel "Modifier" (`[data-plm-edit-view]`). Toggle global/personnel et select praticienne supprimes.
  - `fetchEvents` : passe toujours `practitionerId=state.myPractitionerId` si defini. Pas de condition de mode.
  - Bouton "Modifier" : visible des que `state.myPractitionerId` est defini. Label adaptatif selon la vue : "Modifier ce jour" (timeGridDay), "Modifier cette semaine" (timeGridWeek), "Modifier mon planning type" (autre). Mis a jour dans `datesSet` et `viewDidMount` via `updateEditViewBtn()`.
  - `handleEditViewClick()` : dispatch vers `openDayModal(date)`, `openWeekModal(weekStart)` ou `openScheduleModal()` selon la vue.
  - Time pickers dropdown : `createTimePicker`, `getTimePickerValue`, `setTimePickerValue`, `renderDropdown(tpEl, cb, disabledSlots)`, `attachTimePickerEvents(tpEl, cb)`, `closeAllDropdowns()`. Grille 07h00-22h00 par pas 30 min. A l'ouverture, `revalidateDay(dayRow)` est appele AVANT l'affichage du dropdown pour mettre `dataset.disabledSlots` a jour (correctif anti-chevauchement a l'ouverture).
  - Anti-chevauchement live : `revalidateDay(dayRow)` calcule `disabledStart`/`disabledEnd` pour chaque plage (prevEnd, nextStart, start/end courant), stocke dans `dataset.disabledSlots`, re-rend les dropdowns ouverts. Appele via callback `attachTimePickerEvents` a chaque selection ET a l'ouverture du picker.
  - Toggle slide jours : `attachDayToggleListeners` ecoute `change` sur `[data-day-toggle]`, bascule `.plm-day-slots--collapsed` avec animation max-height/opacity.
  - Modal blocage : toggle `[data-plm-exc-fullday]` (checkbox) bascule `.plm-day-slots--collapsed` sur `[data-plm-time-range]` (anime). `openExceptionModal({ date, exceptionId, event, editMode })` pre-remplit tous les champs, titre et bouton.
  - Modal "Modifier ce jour" (`[data-plm-modal="day-edit"]`) : `openDayModal(date)` charge les exceptions type=modify du jour + planning type, pre-remplit toggle actif/repos + plages. `saveDayEdit()` POST block (repos) ou POST/PUT modify (actif, slots[]).
  - Modal "Modifier cette semaine" (`[data-plm-modal="week-edit"]`) : `openWeekModal(weekStart)` charge les exceptions + planning pour les 7 jours. Warning si modifications existantes. `saveWeekEdit()` construit un tableau d'exceptions et appelle `POST /exceptions/batch`. `.plm-modal--wide` (max-width 640px).
  - `dateClick` : appelle directement `openDayModal(info.date)` — clic sur toute cellule calendrier ouvre le modal "Modifier ce jour" pour cette date. Les events `.plm-event-unavailable` ont `pointer-events:none`, le clic passe a travers vers la cellule.
  - Action clic sur event bloque : `handleEventClick` pour `type=blocked` affiche ctx menu `edit-block` (bi-pencil) + `unblock` (bi-slash-circle). `edit-block` → `openExceptionModal` en editMode. `unblock` → `DELETE /exceptions/:id`.
  - Action clic sur event formation : ctx menu `detail` (bi-info-circle) → toast info.
  - `saveExceptionHandler` : detecte mode edition via `[data-plm-exc-id]`, fait PUT si editMode, POST sinon. Reset id + titre + bouton apres succes. `practitionerId` = `state.myPractitionerId` uniquement.
  - `[data-plm-exc-id]` : champ hidden dans le modal exception.
  - Affichage "Indisponible" : les blocs manuels `isFullDay=true` genèrent des events `.plm-event-unavailable` (fond sombre `rgba(30,30,30,0.75)`, texte blanc, pointer-events:none) couvrant exactement les plages du planning type pour ce jour.
  - CSS injection dynamique (`/css/planningModule.css`).
- `public/css/planningModule.css` : styles prefixe `plm-`. `.plm-day-slots--collapsed` a `pointer-events:none`. `.plm-time-range` supporte l'animation max-height/opacity via `.plm-day-slots--collapsed`. Classes ajoutees : `.plm-btn-edit-view` (bouton outline primary), `.plm-modal--wide` (max-width 640px), `.plm-week-warning` (alerte rose secondary), `.plm-event-unavailable` (fond sombre, uppercase, pointer-events:none). Classes supprimees : `.plm-toggle-wrap`, `.plm-toggle-btn`, `.plm-toggle-btn--active`, `.plm-select--pract`.

## Backend - Disponibilites praticiennes (2026-04-01)
- `models/ScheduleException.js` : champ `slots[]` ajoute — `[{ startTime: String, endTime: String }]` — utilise par les exceptions de type `modify`. Index `{ practitionerId, date }` **unique** — garantit l'idempotence du upsert batch. `app.js` drop l'index non-unique legacy au demarrage puis appelle `syncIndexes()`.
- `controllers/availabilityController.js` : 9 fonctions exportees.
  - `getSchedule(req, res)` : `GET /schedule/:practitionerId` — retourne PractitionerSchedule ou null.
  - `saveSchedule(req, res)` : `PUT /schedule/:practitionerId` — valide weeklySchedule (7 jours, dayOfWeek 0-6, slots[]), upsert PractitionerSchedule.
  - `getMySchedule(req, res)` : `GET /schedule/me` — trouve le profil praticienne via `req.sessionUserId`, retourne schedule + practitionerId.
  - `getExceptions(req, res)` : `GET /exceptions/:practitionerId?from=&to=` — filtre par date si fourni.
  - `createException(req, res)` : `POST /exceptions` — body: `{ practitionerId, date, type, isFullDay, startTime, endTime, slots[], reason }`, types: block/add/modify. `slots[]` est stocke pour le type `modify`.
  - `updateException(req, res)` : `PUT /exceptions/:id` — `findByIdAndUpdate($set: req.body)`, retourne 404 si introuvable.
  - `batchUpsertExceptions(req, res)` : `POST /exceptions/batch` — body: `{ exceptions[] }` — upsert par `{ practitionerId, date }` pour chaque exception, retourne `{ ok, count }`.
  - `deleteException(req, res)` : `DELETE /exceptions/:id`.
  - `getCalendarEvents(req, res)` : `GET /calendar-events?from=&to=&practitionerId=` — aggregate: FormationSessions dans la periode (populate formationId.name) + si practitionerId: disponibilites background + exceptions. Logique d'override : construit `overriddenDays` (Set) des jours avec exception modify ou block+isFullDay — les backgrounds du planning type sont supprimes pour ces jours. Les exceptions type=modify genèrent des events background depuis leurs `slots[]`. Les exceptions type=block `isFullDay=true` genèrent des events `.plm-event-unavailable` (fond `rgba(30,30,30,0.75)`, texte blanc, `display:'block'`, pointer-events:none) couvrant exactement les plages du planning type pour ce jour de semaine (depuis `schedule.weeklySchedule`). Si pas de planning type pour ce jour, aucun event genere. Les exceptions type=block sur creneau genèrent un event `.plm-event-unavailable` sur la plage horaire exacte. Headers no-cache sur tous les GET availability.
- `routers/availabilityRouter.js` : monte sur `/api/gestion/availability`, protege par `requireAuth() + requireMode('gestion')`. Routes : GET schedule/me, GET/PUT schedule/:practitionerId, GET exceptions/:practitionerId, POST exceptions/batch (AVANT :id), POST exceptions, PUT exceptions/:id, DELETE exceptions/:id, GET calendar-events.
- `app.js` : import + `app.use('/api/gestion/availability', availabilityRouter)`.
- CSP `scriptSrc` enrichi de `https://cdn.jsdelivr.net` pour FullCalendar CDN.
- `public/gestion.html` : CDN FullCalendar 6.1.11 (CSS + JS global + locale fr) ajoute dans `<head>`.

## Gestion - Reseaux sociaux (STEP 9)
- `public/js/modules/socialLinksModule.js` passe sur une UI cartes premium (1 carte par reseau supporte) avec deux etats:
  - `Reseau ajoute` si URL presente.
  - `Reseau manquant` si URL absente.
- Reseaux supportes par defaut: `instagram`, `tiktok`, `youtube`; tout type supplementaire renvoye par API reste affiche (fallback meta).
- Aucun systeme d ordre n est introduit: la vue reste une liste fixe de reseaux, pilotee uniquement par la presence/absence d URL.
- Actions disponibles:
  - `Ajouter le reseau` (etat manquant) -> modal centree `Ajouter <reseau>`.
  - `Modifier` (etat ajoute) -> modal centree `Modifier <reseau>`.
  - `Supprimer` -> modal de confirmation custom (pas de confirm natif).
- Source de verite:
  - `GET /api/gestion/social-links` pour hydrater la grille.
  - `POST /api/gestion/social-links` pour creer un lien.
  - `PUT /api/gestion/social-links/:id` pour editer l URL.
  - `DELETE /api/gestion/social-links/:id` pour retirer un lien.
- UX/feedback:
  - loader pattes inline (`PAW_ICON_SVG`) au chargement initial et pendant refresh apres save/delete.
  - toast universel 1s pour succes/erreur.
  - logs techniques via `uiLogger` (status, endpoint, payload safe).
- Styles premium dedies dans `public/css/app.css`:
  - cards `slm-*`, modal `slm-modal-*`, inputs minimalistes `border-bottom` via `gcg-minimal-input`,
  - layout mobile-first (cards empilees, actions accessibles, pas d overflow horizontal).

## Gestion - A propos + politiques (STEP 11)
- `public/js/modules/aboutUsGestionModule.js` est maintenant autonome (plus de wrapper `createPageGestionModule`) et rend les blocs editoriaux sous forme de cards premium minimalistes:
  - icone Bootstrap large en `var(--theme-accent-strong)`,
  - titre + description + preview texte clamp 2-3 lignes,
  - action texte `Modifier` (icone crayon) sans fond/bordure, hover `var(--theme-accent)`.
- `public/js/modules/legalPagesManagerModule.js` applique la meme UX card premium sur les 3 pages fixes (`mentions-legales`, `politique-confidentialite`, `cgv`).
- Le composant editorial reste invisible par defaut: au clic `Modifier`, la liste est remplacee par une vue d edition inline (meme composant editorial dans `editorialEditor.js`) avec bouton `Retour` en haut a gauche.
- Loader + toast universels sont branches sur les actions existantes:
  - chargement initial + refresh + save/update: contenu module masque et loader pattes inline (`PAW_ICON_SVG`) centre dans la zone contenu,
  - duree minimale perceptible: 1s sur ces actions,
  - sauvegarde/update: toast succes `Modifications enregistrÃƒÆ’Ã‚Â©es`, toast erreur `ÃƒÆ’Ã¢â‚¬Â°chec de l'enregistrement`,
  - logs detailes uniquement en echec via `logUiError(...)`.
- `public/js/modules/editorialEditor.js` expose desormais deux usages du meme composant:
  - `openEditorialEditor(...)` (modal),
  - `mountEditorialEditorInline(...)` (edition inline), avec `setActionButtonState(...)` sur le bouton `Enregistrer`.
- `public/css/app.css` ajoute les styles `epm-*`:
  - grille responsive 1 colonne mobile / 2 colonnes desktop,
  - cards premium `var(--color-surface)` + ombre douce + transitions opacity/translate,
  - vue editeur inline (remplacement de liste) + bouton retour,
  - preview ellipsis multi-lignes, empty-state dedie, action edit minimaliste theme-token only,
  - contraintes mobile-first sans overflow horizontal (320px).

## Gestion - Factures commissions (UX premium)
- `public/js/modules/monthlyCommissionInvoicesModule.js` garde les memes endpoints et la logique metier existante, mais refond l interface en cards premium:
  - card par facture mensuelle avec icone commission, mois, badge statut email (`Envoye`, `En cours`, `Echec`), montant total mis en avant, volume de commissions.
  - actions icones accessibles: `Details`, `Telecharger`, `Relancer`, et `Supprimer` pour les simulations.
  - details depliables animes (height/opacity) avec resume + lignes commissions (montant, type, id vente, formations, date).
- Loader/toast universels branches sur toutes les actions module:
  - loader pattes inline (`PAW_ICON_SVG`) dans la zone liste avec duree minimale 1s pour chargement initial, simulation, suppression et sauvegarde des parametres.
  - toasts 1s pour succes/erreur (`Telechargement lance`, `Email envoye`, `Action effectuee`, `Parametres enregistres`, messages d echec).
  - logs detailes uniquement en echec via `logUiError` (status, endpoint, payload, message).
- Modal `Parametres` conservee (sans changement API) avec saisie minimaliste (border-bottom uniquement), validation emails, anti-double-submit et feedback stateful sans reload global.
- Styles dedies ajoutes dans `public/css/app.css` sous namespace `mci-*`:
  - grille responsive 1 colonne mobile / 2 colonnes desktop,
  - cards/action buttons/theme tokens only, animations legeres sans flicker,
  - compat mobile 320px sans overflow horizontal.

## Gestion - Commissions (3 onglets Ã¢â‚¬â€ 2026-03-19)
- `public/js/modules/commissionModule.js` restructure en 3 onglets : Dashboard, Configuration, Historique.
- `public/css/commissionModule.css` : nouveaux styles onglets/config/historique/modal creation (namespace `cmm-*` partage avec `app.css`).

### Onglet Dashboard
- Contenu inchange : graph evolution (ligne/points accent), tabs periode (`jour`, `semaine`, `mois`, `annee`, `personnalisee`), liste transactions avec recherche ID vente.
- Bouton `Exporter devis` supprime (frontend + backend).

### Onglet Configuration
- Affiche la configuration active (GET /api/gestion/commissions/config/stats) : type, valeur, active depuis, revenus bruts/deductions/net calcules depuis `createdAt` de la config.
- Empty state si aucune config active -> bouton `Creer une configuration` -> modal premium.
- Modal creation : custom select anime (pas de <select> natif), stepper incrementiel clavier+boutons, apercu live, non fermable pendant la sauvegarde.
- Bouton `Supprimer la configuration` : soft delete (isActive: false + deletedAt). Bloque si contrat actif (409 blocked: true, reason: 'active_contract') -> note inline 6s.

### Onglet Historique
- Liste des configs supprimees (isActive: false) triees par deletedAt desc.
- Stats par config calculees cote backend sur la periode [createdAt, deletedAt) de la config.

### Backend
- `models/CommissionConfig.js` : ajout champs `isActive: Boolean (default: true)`, `deletedAt: Date (default: null)`.
- `services/commissionService.js` : `getActiveCommissionConfig()` utilise `{ isActive: { $ne: false } }` (compat docs sans champ). `createCommissionConfigEntry()` desactive toutes les configs actives avant de creer la nouvelle (updateMany + isActive:false + deletedAt).
- `controllers/commissionController.js` : suppression `exportCommissionPdf`. Ajout `getCommissionConfigStats` (config active + stats revenus), `deleteActiveCommissionConfig` (soft delete + verif contrat actif). `getCommissionConfigHistory` retourne uniquement les configs `isActive: false` avec stats par periode calculees backend.
- `routers/commissionRouter.js` : GET /commissions/config/stats, DELETE /commissions/config/active. Route export-pdf supprimee.

### Invariants
- Suppression = soft delete uniquement (jamais de suppression physique).
- Un seul document CommissionConfig avec isActive:true a la fois (garanti par updateMany avant create).
- isActive: { $ne: false } compatible avec docs existants sans le champ (migration 0-downtime).

## Gestion - Administrative contrat (STEP 15)
- Nouveau backend contrat persistant:
  - `models/Contract.js` introduit le contrat administratif avec `contractId`, statut (`active|terminated`), mensualite maintenance, commission %, periode (`startAt/endAt/duration`), metadonnees fichier signe, createur et infos de resilisation.
  - Contrainte metier: un seul contrat actif a la fois via index partiel unique sur `status=active`.
- Nouveau service metier:
  - `services/contractService.js` centralise `getActiveContract`, `listArchivedContracts`, `createNewContract`, `terminateActiveContract`, `getContractById`, `getContractFile`.
  - Creation contrat:
    - validation payload + duree + PDF,
    - generation `contractId` lisible (`CTR-YYYYMMDD-XXXX`),
    - persistance du fichier upload (`/uploads/contracts/*`),
    - creation automatique d une nouvelle config de commission de type `percentage` avec la valeur du contrat (sans toucher aux commissions historiques).
  - Resilisation:
    - bascule du contrat actif en `terminated`,
    - conservation dans les archives avec `terminatedAt` et `terminationReason`.
- Nouveau controleur + router DEV-only:
  - `controllers/contractController.js` expose les handlers API contrats et la serialisation reponse.
  - `routers/contractRouter.js` ajoute les endpoints proteges `requireAuth + requireMode('gestion') + requireStrictDev`:
    - `GET /api/gestion/contract/active`
    - `GET /api/gestion/contract/archives`
    - `POST /api/gestion/contract` (multipart, champ `contractFile`)
    - `POST /api/gestion/contract/terminate`
    - `GET /api/gestion/contract/:contractId`
    - `GET /api/gestion/contract/:contractId/file` (inline ou download via `?download=1`)
  - `app.js` monte le router sur `/api/gestion/contract`.
- Liaison commissions (obligatoire):
  - `services/commissionService.js` expose maintenant `createCommissionConfigEntry(...)`.
  - `controllers/commissionController.js` l utilise pour la creation de config standard.
  - `services/contractService.js` reutilise la meme mecanique pour creer la config commission lors d un nouveau contrat.
- Nouveau module gestion front:
  - `public/js/modules/administrativeModule.js` rend la page administrative contrat (DEV) avec UI premium stateful:
    - bloc contrat actif (mensualite, commission, timer fin de contrat),
    - actions fichier signe (`Voir` iframe modal / `Telecharger`),
    - resilisation via modal de confirmation,
    - modal `Nouveau contrat` (mensualite, commission, duree custom annees/mois/jours, upload PDF),
    - archives en cards + modal detail.
  - Loader pattes inline (zone module, min 1s) et toast universel 1s sur chargement, creation, resilisation et telechargement.
  - Logs detailes uniquement en echec via `uiLogger`.
- Styles:
  - `public/css/app.css` ajoute le namespace `ctm-*` (cards premium, modals centres hauteur fixe scroll Y, actions icones, layout mobile-first sans overflow horizontal).

## Vitrine - Mes cartes cadeaux (STEP 15.1)
- `public/js/modules/myGiftCardsModule.js` est refondu en UX premium minimaliste sans changement backend:
  - header `Mes cartes cadeaux` + bloc `Solde total restant` calcule cote front avec `computeTotalRemaining(cards)`,
  - liste des cartes en cards premium (icone gift, statut `Active`/`Epuisee`, solde restant mis en avant, date achat),
  - CTA `Voir ma carte` qui ouvre un modal details centre (plus de navigation forcee vers la page detail pour ce flux).
- Modal details client:
  - ouverture fluide en 1 fois, fond opaque, fermeture `ESC`, clic exterieur et bouton `X`,
  - contenu ordonne: solde restant en gros, details (solde initial, date achat, code, mot de passe visible), puis transactions,
  - actions copier (code/mot de passe) avec clipboard + toast succes.
- Loader/toast/logger:
  - loader pattes inline (`PAW_ICON_SVG`) dans le container du module au chargement initial et dans le corps du modal pendant fetch detail,
  - duree minimale conservee a 500 ms pour eviter le flicker,
  - toast universel 1s (`Copie`, `Details charges`, `Echec`) et logs detailes uniquement en erreur via `uiLogger` (status, endpoint, payload, message).
- Styles `public/css/app.css`:
  - nouveaux namespaces `giftcards-*` / `giftcard-*` pour summary, grille responsive (1 colonne mobile, 2 desktop), cards premium, statuts, modal details scrollable Y et micro-animations,
  - compat mobile-first 320px (pas d overflow horizontal).

## Vitrine - Mon panier (STEP 15.2)
- `public/js/modules/cartModule.js` est refondu en UI premium minimaliste sans changement backend:
  - layout item en 4 zones (`checkbox` gauche, `image` a 85% de la hauteur card, bloc titre/meta, colonne droite prix+poubelle),
  - items rendus en liste cartes compactes (image a gauche, titre, type, prix et reduction si disponible),
  - actions par item: bouton `Voir le produit` (navigation vers `item-detail` comme depuis la boutique) et suppression via bouton icone poubelle rouge,
  - checkbox custom animee par item (remplissage accent + check icon), avec update local `aria-checked`,
  - interactions stateful sans re-render complet: patch DOM local (`syncCartUI`) pour subtitle/total/waiver/bouton payer.
- Renonciation distanciel dans le panier:
  - le texte de la checkbox inclut le nombre de formations distancielles concernees dans la selection,
  - le bouton `plus d informations ici` ouvre le modal legal avec une section supplementaire listant les formations concernees du panier (liste premium avec puce accent + label distancielle).
- Rappel total:
  - un bloc `Total selection` est affiche sous le bouton d achat et se met a jour en live lors des checks/unchecks/suppressions,
  - `Economies` est affiche uniquement si les reductions sont calculables cote front (base - final).
- Loader/toast:
  - loader pattes inline (`PAW_ICON_SVG`) sur chargement initial + loader partiel de liste (min 500ms) sur selection/suppression,
  - toast universel 1s sur succes/erreur actions (`OK`, `Echec`, `Panier mis a jour`) et logs detailes uniquement en echec via `uiLogger`.
- `public/js/helpers/consumerWaiverModal.js` accepte maintenant un contexte optionnel (`concernedCount`, `concernedItems`) pour enrichir le modal legal sans impacter les appels existants.
- `public/css/app.css` ajoute:
  - namespace `cartp-*` pour layout premium panier (cards, medias, prix promo, actions, boutons),
  - styles checkbox custom panier + checkbox custom renonciation et section modal des formations concernees,
  - contraintes mobile-first 320px sans overflow horizontal.

## Vitrine - Mon compte (STEP 15.3)
- `public/js/modules/myAccountModule.js` est refondu en UX premium minimaliste sans changement backend:
  - header profil (icone + email), onglets icones `Informations` / `Mes achats` avec underline animee et navigation mobile scrollable,
  - loader pattes inline (`PAW_ICON_SVG`, min 500ms) au chargement du module et lors du chargement des achats,
  - toasts universels 1s + logs detailes `uiLogger` en cas d echec.
- Onglet `Informations`:
  - formulaire prenom/nom editable (inputs `gcg-minimal-input` border-bottom), email en readonly,
  - sauvegarde via `PUT /api/client/profile` avec feedback inline + toast succes/erreur,
  - action `Modifier mon mot de passe` conserve le flux existant `POST /auth/password-reset/request`,
  - confirmation reset affichee dans un bloc anime (succes/erreur), fermable et auto-masquee (~7s),
  - action deconnexion conservee via `POST /auth/logout`.
- Onglet `Mes achats`:
  - cards premium par vente (icone panier, montant, date, nombre d articles),
  - modal details centree (max-height fixe + scroll Y, fermeture croix/clic exterieur/ESC),
  - contenu modal: items achetes, cartes cadeaux utilisees (si presentes), facture telechargeable (si disponible), bloc renonciation uniquement si un champ waiver existe deja dans le payload.
- `public/css/app.css` ajoute le namespace `myacc-*`:
  - layout premium du module, tabs, formulaire, notice reset, cards achats, modal details et empty-states,
  - contraintes mobile-first 320px sans overflow horizontal ni flicker.

## Vitrine - Checkout + utilisation carte cadeau + paiement simule (STEP 15.5)
- Le checkout vitrine (`public/js/modules/checkoutModule.js`) passe sur un flow premium minimaliste:
  - recap achat (article/type/prix/promo/sous-total/total),
  - liste epuree des cartes cadeaux appliquees avec retrait,
  - flow carte cadeau en modal overlay (cache par defaut): `code` -> `mot de passe` -> confirmation montant (+/- 10 EUR) + preview live (avant/apres),
  - recalcul instantane du reste a payer et bascule CTA `Proceder au paiement` -> `Valider mon achat` quand reste a 0,
  - ligne `Carte cadeau` dans le recap total final (ajout/suppression dynamique),
  - bloc legal unifie (CGV obligatoire + renonciation contextuelle) avec bouton bloque tant que non accepte.
- Nouveau module vitrine `public/js/modules/paymentSimulationModule.js` (slug fallback `payment`):
  - recap mini + 2 actions `Simuler paiement valide` / `Simuler paiement refuse`,
  - transmission du checkout state via token + `sessionStorage` (fallback propre sans query payload massif),
  - finalisation via la meme source de verite front + garde legal (bouton valide desactive si etat legal incomplet).
- Nouveau service front `public/js/modules/purchaseFlowService.js`:
  - `buildCheckoutState(...)` structure l etat pour checkout/paiement (items, cartes appliquees, legal state CGV/renonciation/date formation, origin, provider futur Stripe),
  - `finalizePurchase({ outcome, checkoutState })` centralise le comportement success/failed,
  - failed: aucun appel vente, aucun debit, retour origin + message echec,
  - success: appel backend achat, puis retour origin + message succes (seulement si etat legal valide).
- Retour fiche produit:
  - `public/js/modules/itemDetailModule.js` consomme le resultat de finalisation et affiche un bloc premium succes/echec,
  - en echec, CTA `Reessayer` qui reouvre directement le checkout,
  - ajout d une mention presentiel sous le bouton acheter: annulation gratuite selon la politique institut configurable (`formation.refundDays`) et le droit legal de retractation 14 jours (sans renonciation), affichee seulement si date session connue.
- Navigation:
  - fallback vitrine `payment` ajoute dans `controllers/vitrineController.js`,
  - `myFavorites` et `itemDetail` transmettent maintenant l origin checkout pour le retour post-paiement.
- Backend cartes cadeaux / vente:
  - nouvel endpoint client `POST /api/client/gift-cards/validate-credentials` (code + mot de passe),
  - `mockPay`/`mockPayCart` supportent `requireGiftCardPassword` pour revalider les credentials lors de la finalisation checkout,
  - pour le flow Stripe webhook, le debit carte cadeau est execute dans `runPostSaleSideEffects` (jamais avant `payment_intent.succeeded`), puis facture/mail sont declenches,
  - aucun debit carte cadeau n est effectue pendant `create-checkout-session`: le checkoutState stocke uniquement le code et le montant prevu;
  - `processCheckoutStatePurchase` n annule plus sale/purchase/session si une erreur survient apres `runPostSaleSideEffects`, pour eviter un debit applique puis rollback metier.
  - rollback logique renforce sur debits/transactions cartes cadeaux en cas d erreur pour eviter les etats partiels.

## Remboursements & annulation (STEP 16.1)
- Source de verite backend:
  - annulation client presentiel traitee par `POST /api/client/formations/:formationId/cancel`,
  - suppression gestion d une session presentielle reservee convertie en `annulation institut`: la session passe en statut `canceled_by_institute`, un `SessionCancellationFlow` unique est regenere par client, et l email `session_cancelled_choice` est envoye avec lien tokenise vers la page de choix,
  - remboursement automatique institut a J+7 porte par `automatisme/sessionCancellationAutoRefundJob.js`, demarre dans `app.js`,
  - eligibilite remboursement calculee cote serveur au moment de la demande: combinaison `retractation legale 14 jours apres achat (si pas de renonciation)` OU `sessionStartAt - now > formation.refundDays` (strictement),
  - idempotence: si participation deja annulee, l endpoint renvoie l etat existant et tente de rattacher/creer la demande de remboursement manquante si eligible.
- Donnees metier ajoutees:
  - `models/RefundRequest.js`: trace refundId/saleId/userId/item/formation, amount/currency, status (`requested|pending|succeeded|failed|canceled`), requestedAt/processedAt, reason, sessionStartAt, eligibleRefund, clientIp, purchaseAcceptedText, meta.
  - `models/Purchase.js`: champs `saleId`, `participationStatus`, `canceledAt`, `cancellationReason`, `cancellationEligibleRefund`, `cancellationSessionStartAt`, `refundRequestId`.
  - `models/FormationSession.js`: statut de session `active|canceled_by_institute|canceled` + helpers de filtre actif pour masquer une session annulee des listes/reservations.
  - creation achat (`mockPay`, `mockPayCart`) met a jour `Purchase.saleId` des que la vente est persistee.
- Endpoints gestion remboursements:
  - `GET /api/gestion/refunds?from=&to=&status=&page=&limit=`: liste paginee, total remboursÃƒÆ’Ã‚Â©, enrichissement client/formation.
  - `PUT /api/gestion/refunds/:refundId/status`: update statut + application des regles de compensation commissions.
- Commissions & facture mensuelle:
  - provision deduite des commissions des la creation de la demande (`status=requested`) via transaction `CommissionTransaction.sourceType = refund_adjustment` (montant negatif),
  - compensation inverse si remboursement `failed|canceled` via `sourceType = refund_reversal` (montant positif),
  - `services/monthlyCommissionInvoiceService.js` integre ces lignes dans les factures (lignes signees, `sourceType` persiste),
  - `services/commissionPdfService.js` affiche la nature de ligne (vente / ajustement remboursement / reversal remboursement).
- Front vitrine (mes formations presentiel):
  - `public/js/modules/myFormationDetailModule.js` ajoute:
    - bloc `Annuler la formation` (bouton danger premium),
    - message contextuel remboursement selon compteur restant,
    - bouton `Plus d informations` reutilisant le modal legal partage (`consumerWaiverModal`) avec sous-titre live,
    - flow annulation en 2 etapes: confirmation + saisie obligatoire du mot `annulation`,
    - loader pattes + toasts et ecran de confirmation final (avec ou sans remboursement).
- Front gestion:
  - `public/js/modules/formationManagerModule.js`: la suppression de session affiche maintenant le modal de confirmation standard avec nombre de clients reserves et mention du flux email -> choix -> remboursement auto a J+7 (delai du workflow institut, distinct de `formation.refundDays`).
  - planning detail (`public/js/modules/planningModule.js`): badge rouge `Annule` sur les participants avec `status=canceled`.
  - ventes (`public/js/modules/salesModule.js`): 3e onglet `Remboursements`, total en rouge, cartes remboursement, modal detail, lien vers detail vente, section `Transaction Stripe` (ID copiable + synthese financiere). Le modal calcule le `Revenu net = Montant total - Commission Stripe - Commission prestataire`, et affiche un etat d attente tant que les frais Stripe ne sont pas disponibles. L onglet `Statistiques & analyses` affiche aussi un indicateur discret "Transactions en attente de donnees Stripe" quand `count > 0`.
  - commissions (`public/js/modules/commissionModule.js` + `public/js/helpers/graphStylePreset.js`): affichage des montants signes (positifs/negatifs) et graphe compatible valeurs negatives (ligne zero).
  - factures commissions (`public/js/modules/monthlyCommissionInvoicesModule.js`): montants signes et rendu explicite des ajustements remboursements dans le detail.

## Formations - Options payantes presentiel (STEP 17)

### Modele de donnees
- `models/Formation.js`: champ `options[]` (sous-document) avec `name`, `description`, `image`, `price`, `deadlineDays`. ReservÃƒÆ’Ã‚Â© aux formations `presentiel`.
- `models/Purchase.js`: champ `selectedOptions[]` frozen au moment de l achat avec `optionId`, `name`, `price`.
- `models/Sale.js`: type enum etendu avec `'formation-option'` pour que les lignes options soient tracees comme items de vente distincts.

### Backend gestion - CRUD options
- `controllers/formationOptionController.js`: `listOptions`, `createOption`, `updateOption`, `deleteOption`, `deleteOptionImage`. Chaque endpoint verifie `formation.type === 'presentiel'`.
- Upload image via `multer` vers `uploads/formation-options/`, avec suppression physique du fichier en cas d echec, de mise a jour, de suppression d option, ou de suppression explicite d image.
- Routes montees dans `routers/formationRouter.js`:
  - `GET /api/gestion/formations/:formationId/options`
  - `POST /api/gestion/formations/:formationId/options`
  - `PUT /api/gestion/formations/:formationId/options/:optionId`
  - `DELETE /api/gestion/formations/:formationId/options/:optionId/image`
  - `DELETE /api/gestion/formations/:formationId/options/:optionId`

### Backend vitrine - exposition options par session
- `controllers/vitrineShopController.js`: `buildOptionForVitrine(option, sessionStartAt)` calcule `available = startAt - now > deadlineDays * 86400000`. Expose `options[]` dans `getFormationDetail` pour les formations presentiel.
- `getFormationSessionOptions` expose `GET /api/vitrine/formations/:id/sessions/:sessionId/options` (disponible via `vitrineFormationSessionRouter`).

### Backend achat - validation et stockage
- `clientController.js`: `validateAndBuildSelectedOptions(rawOptions, formation, sessionStartAt)` valide existence + deadline cote serveur pour `mockPay` et `mockPayCart`.
- Les options valides sont stockees dans `Purchase.selectedOptions` (snapshot immutable) et ajoutees comme items `formation-option` dans la vente (`Sale.items`).
- Regle metier actuelle: les options ne sont pas remboursables (champ retire). `createPresentielRefundRequest` ne les inclut plus dans le montant de remboursement.
- Commissions: les items `formation-option` sont exclus de la base de commission car `buildFormationEntryFromSale` filtre sur `type='formation'` uniquement.

### Frontend gestion - onglet Options
- `public/js/modules/formationManagerModule.js`: onglet `Options` (`data-editor-tab="options"`) visible uniquement pour les formations `presentiel`.
- Fonctions: `loadFormationOptions`, `renderOptionsList`, `openOptionModal`, `handleOptionFormSubmit`, `handleDeleteOption`, `attachOptionsEvents`.
- Les cards options reutilisent des `formation-card` (meme media 140px, ratio 4/3, `object-fit: cover`, meme placeholder `formation-card__placeholder` si image absente) pour rester visuellement alignees aux cards formation.
- Les actions option passent par le kebab standard (`kebab-button` + `formation-card__menu`) avec logique d ouverture/fermeture identique et actions `Modifier` / `Supprimer`; la suppression continue d utiliser le modal de confirmation standard.
- La modale option applique un flux image explicite: bouton `Ajouter une image` si vide, sinon preview + `Modifier l'image` + `Supprimer l'image` avec confirmation standard, puis appel backend dedie pour suppression physique.
- L onglet est masque/reinitialise automatiquement via `syncTypeManagedSections` si le type change.

### Frontend vitrine - selection options
- `public/js/modules/itemDetailModule.js`:
  - apres selection d une session, appel `GET /api/vitrine/formations/:id/sessions/:sessionId/options`,
  - rendu compact et minimaliste des options `[data-session-options]` sur la fiche produit (nom/prix), sans selection directe,
  - mention explicite sur la fiche: la selection des options se fait au checkout.
- `public/js/modules/cartService.js`: `normalizeInput` preserve `selectedOptions[]` dans les items du panier.
- `public/js/modules/cartModule.js`: inclut `selectedOptions` par item dans le payload `POST /api/client/mock-pay-cart`.
- `public/js/modules/checkoutModule.js`:
  - lit `beautysavage_pending_options` en sessionStorage au mount (consomme et supprime),
  - rend les options presentiel en cards checkbox epurees (checkbox gauche, nom, `+prix`),
  - si une option a une image, elle est affichee dans une zone checkbox a taille fixe (l image s adapte a la checkbox, pas l inverse),
  - chaque card expose un bouton `Voir l option` ouvrant un modal superpose (image + description + prix),
  - animation UI premium locale sur check/uncheck (selection ET deselection), sans reload page/module,
  - recalcule en live les options visibles a chaque changement de session selon `session.startAt/startDate - now > option.deadlineDays * 86400000`,
  - masque les options hors delai (non desactivees), decoche/retire immediatement du total celles devenues indisponibles, puis affiche le modal de confirmation existant,
  - `computeTotals(pricing, giftCards, selectedOptions)` inclut `optionsTotal` dans le `subtotal`,
  - `updateSummary` affiche une ligne par option dans `[data-summary-options-container]`,
  - `maxGiftUsage` utilise `state.totals.subtotal` (qui inclut les options),
  - sous-total affiche quand il y a une promotion OU des options selectionnees,
  - `buildCheckoutState` transmet `selectedOptions` vers `purchaseFlowService`.
- `public/js/modules/purchaseFlowService.js`:
  - `buildCheckoutState` normalise `selectedOptions` dans `normalizedItem`,
  - `submitMockPurchase` inclut `selectedOptions` dans le payload si non vide.

### Frontend planning - options par participant
- `controllers/planningController.js`: le detail session expose `selectedOptions[]` par participant (issue du `Purchase`).
- `public/js/modules/planningModule.js`: `renderParticipantsList` affiche les badges option (`planning-detail-participants__option-badge`) sous le nom de chaque participant.

### Factures
- `services/invoiceService.js`: `TYPE_LABELS` inclut `'formation-option': 'Option de formation'` pour que les lignes options soient affichees avec un libelle lisible dans les factures PDF.

## Integration Stripe refunds + suivi remboursement (STEP 19)

### Modele RefundRequest - nouveaux champs
- `stripeRefundId` : ID du remboursement Stripe (`re_xxx`), null si aucun appel Stripe.
- `stripeRefundStatus` : statut brut retourne par Stripe (`pending`, `succeeded`, `failed`).
- `refundedAt` : date de confirmation effective du remboursement.
- `giftCardRecredited` : booleen, vrai si une carte cadeau a ete recrreditee.
- `giftCardRecreditAmount` : montant exact recredite sur la carte cadeau (en euros).
- `trackingToken` : token aleatoire 64 hex (`crypto.randomBytes(32).toString('hex')`), genere automatiquement via pre-save hook si absent a la creation. Index sparse.
- `trackingTokenExpiresAt` : 30 jours apres creation.

### Logique de remboursement dans updateRefundStatus (salesController)
- Seul `succeeded` est intercepte : les autres transitions restent directes.
- `updateRefundStatus` delegue maintenant l execution financiere a `services/refundExecutionService.js` (`triggerRefundExecution`).
- **Calcul split** : `giftCardTotal = sum(sale.giftCardUsage[].amountUsed)` ; `stripeTotal = max(0, saleTotal - giftCardTotal)`. `saleTotal = sale.totalAmount` — pour les prestations a acompte, `totalAmount = depositAmount` donc le remboursement est automatiquement limite a l'acompte encaisse. Pas de logique specifique necessaire.
- **Cas 1 : 100% Stripe** : appel `stripe.refunds.create({ payment_intent, amount })`, `status=pending` jusqu au webhook `charge.refund.updated`.
- **Cas 2 : mixte Stripe + carte cadeau** : appel Stripe sur la part bancaire, `giftCardRefundStatus=pending` (pas de recredit immediat), confirmation finale apres webhook Stripe.
- **Cas 3 : 100% carte cadeau** : recredit immediat, `status=succeeded`, email `refund_confirmed` envoye immediatement.

### Webhook charge.refund.updated (stripeController)
- Nouvel event ecoute en plus de `payment_intent.succeeded`.
- Retrouve le `RefundRequest` via `stripeRefundId`.
- Si `status === 'succeeded'` : `refundRequest.status = 'succeeded'`, `refundedAt`, `processedAt`, save, envoie `sendRefundConfirmedEmail`.
- Si `status === 'failed'` : `refundRequest.status = 'failed'`, `processedAt`, save, log erreur.
- Sinon : met a jour `stripeRefundStatus` uniquement.
- **Regle** : `status = succeeded` ne peut etre set que via ce webhook (ou 100% carte cadeau). Jamais directement par l admin.

### Endpoint public suivi remboursement
- `GET /api/refund-tracking/:token` (public, aucun auth) monte dans `app.js` apres `express.json()`.
- Retourne : `{ ok, refund: { status, amount, itemType, itemTitle, itemDate, formationTitle, sessionDate, refundedAt, estimatedDelay, giftCardRecredited, giftCardRecreditAmount } }`.
- `itemType` : `'formation'` ou `'service'` (selon `refund.itemType`).
- `itemTitle` : nom de la formation ou de la prestation. Pour `service`, lookup live `ServiceBooking.populate('serviceId')` avec fallback sur `meta.formationTitle`.
- `itemDate` : pour `formation` = `sessionStartAt` formate jj mois aaaa ; pour `service` = `booking.startAt` ou `sessionStartAt` formate avec heure.
- `formationTitle` et `sessionDate` conserves dans le payload pour retrocompatibilite des remboursements formation existants.
- Verifie trackingTokenExpiresAt ; retourne 404 si expire ou introuvable.
- Si giftCardRefundStatus === succeeded, la reponse inclut aussi giftCard: { code, password, balance, expiresAt, recipientName }.
- Les details carte cadeau ne sont jamais exposes tant que giftCardRefundStatus !== succeeded.

### Module frontend refundTrackingModule
- `public/js/modules/refundTrackingModule.js` : page vitrine `?slug=refund-tracking&token=xxx`.
- Enregistree dans `FALLBACK_PAGES` de `vitrineController.js` (public, sans auth, sans achat).
- 3 etats : `pending` (horloge SVG animee + spinner tournant), `succeeded` (check SVG anime identique a paymentResultModule), `failed` (croix SVG + CTA support).
- Affiche : intitule et date adaptatifs selon `itemType` — label "Formation"/"Session" pour formations, "Prestation"/"Date du rendez-vous" pour services. Valeurs lues depuis `itemTitle`/`itemDate` avec fallback sur `formationTitle`/`sessionDate` pour les anciens remboursements.
- Quand le statut partiel carte cadeau est Effectue, un bouton Voir la carte apparait a cote du statut.
- Le bouton ouvre un modal premium Votre carte cadeau avec solde, code, mot de passe, date d expiration (si presente), nom du beneficiaire (si present), et boutons Copier pour code/mot de passe.
- Injecte un `<style>` unique (`[data-refund-tracking-styles]`) pour les animations CSS propres au module.
- Reutilise les classes CSS `payment-result__*` pour la coherence visuelle.

### Emails remboursement enrichis
- `refund_requested` : ajout CTA "Suivre mon remboursement" pointant vers `trackingUrl`.
- `refund_auto_initiated` : meme CTA de suivi.
- `refund_confirmed` (nouveau) : envoye apres webhook `succeeded` ou 100% carte cadeau. Affiche recap + CTA, note conditionnelle recreditage carte cadeau via variable `{{giftCardBalance}}` (vide = pas de note).
- Nouvelles variables `mailService` : `trackingurl`, `refundedatformatted`.

### Simplification onglet remboursements en gestion
- `salesModule.js` : badge statut simplifie a 2 etats : `RemboursÃƒÂ©` (succeeded) et `En attente` (tout autre statut).
- Chip CSS : `sales-record-chip--success` pour succeeded, `sales-record-chip--danger` pour en attente.
- Le modal detail remboursement conserve le statut brut pour l admin.

### Procedure tests
1. Configurer `charge.refund.updated` dans le dashboard Stripe > Webhooks (en plus de `payment_intent.succeeded`).
2. Passer un remboursement en admin -> `succeeded` : verifier appel Stripe, statut reste `pending` en base, email `refund_confirmed` arrive apres webhook.
3. Cas 100% carte cadeau : verifier `giftCardRecredited = true`, statut passe directement a `succeeded` sans webhook.
4. Ouvrir `?slug=refund-tracking&token=xxx` pour verifier les 3 etats visuels.

## Correctifs securite financiere pre-production (2026-03-10)

### 1) Endpoint admin remboursement manuel desactive
- La route `PUT /api/gestion/refunds/:refundId/status` n'est plus exposee dans `routers/salesRouter.js`.
- L'onglet gestion remboursements reste en lecture (`GET /api/gestion/refunds`).
- `updateRefundStatus` est conserve cote controller pour usage interne/eventuel, mais plus accessible depuis l'API gestion.

### 2) Remboursement scinde Stripe + carte cadeau securise
- `models/RefundRequest.js` ajoute:
  - `stripeRefundStatus` (`not_applicable|pending|succeeded|failed`)
  - `giftCardRefundStatus` (`not_applicable|pending|succeeded|failed|rollback_needed`)
  - `stripeRefundAmount` (EUR)
  - `giftCardRefundAmount` (EUR)
- Flux mixte:
  - l'initiation met `stripeRefundStatus=pending` et `giftCardRefundStatus=pending`.
  - le recredit carte cadeau est differe jusqu'au webhook Stripe `charge.refund.updated` en succes.
- Webhook `charge.refund.updated`:
  - `succeeded`: confirme Stripe, puis recredite la part carte cadeau (si applicable), puis confirme globalement le remboursement et envoie `refund_confirmed`.
  - `failed`: passe `stripeRefundStatus=failed`, conserve la partie carte cadeau en attente, marque une alerte admin exploitable en interface.
- Cas 100% carte cadeau: recredit immediat, `giftCardRefundStatus=succeeded`, `stripeRefundStatus=not_applicable`.
- Cas 100% Stripe: partie carte cadeau `not_applicable`, confirmation finale au webhook.

### 3) Suppression du fallback succeeded sans operation financiere
- Dans `controllers/salesController.js`, la branche fallback qui passait un remboursement a `succeeded` sans appel Stripe ni recredit carte cadeau est supprimee.
- Si aucun flux financier valide n'est applicable, le systeme logue une erreur critique et retourne un conflit (409), sans valider artificiellement le remboursement.

### 4) Email de vente decouple de la facture PDF
- `runPostSaleSideEffects` envoie maintenant le mail `vente` en premier, sans attendre la generation PDF.
- `services/mailService.js` n'exige plus l'existence immediate de la facture pour envoyer le mail de confirmation.
- Le lien facture du mail pointe vers la page vitrine tokenisee:
  - `.../vitrine.html?slug=invoice&token=<invoiceToken>`

### 5) Invoice token + endpoint public facture
- `models/Sale.js` ajoute `invoiceToken` (genere a la creation, indexe).
- Nouveau endpoint public: `GET /api/invoice/:token`
  - reponse: `{ ready, invoiceUrl, formationTitle, amount, date }`
  - `ready=false` tant que la facture PDF n'est pas prete.
- Nouveau telechargement public PDF par token: `GET /api/invoice/download/:token` (sans session).
- `invoiceUrl` renvoye par `GET /api/invoice/:token` pointe vers `/api/invoice/download/:token`.
- `routers/invoiceRouter.js` expose desormais `GET /api/invoice/:token`, `GET /api/invoice/download/:token` et conserve `/invoice/:invoiceId` pour compatibilite.

### 6) Nouvelle page vitrine invoice
- Nouveau module: `public/js/modules/invoiceModule.js`.
- Accessible via fallback page `invoice` (`controllers/vitrineController.js`) et URL email `?slug=invoice&token=...`.
- Deux etats:
  - facture prete: recap + bouton `Telecharger ma facture`.
  - facture en cours: message + loader + polling 10s (max 5 tentatives), puis message support.

### 7) Garde anti-doublon RefundRequest actif
- Ajout d'un controle avant creation de `RefundRequest` dans:
  - `controllers/clientController.js` (annulation client presentiel)
  - `services/sessionCancellationFlowService.js` (flow institut + auto-refund)
- Regle appliquee:
  - si un remboursement actif existe deja pour la vente (`status` hors `failed|canceled`), creation refusee avec erreur `REFUND_ALREADY_EXISTS`.

### 8) Visibilite admin + suivi client detaille
- `public/js/modules/salesModule.js` affiche une alerte visible sur les remboursements avec `stripeRefundStatus=failed`:
  - `Echec Stripe Ã¯Â¿Â½ intervention requise`
- Le detail remboursement affiche distinctement:
  - `Remboursement bancaire: [statut]`
  - `Recredit carte cadeau: [statut]`
- `public/js/modules/refundTrackingModule.js` affiche ces statuts separes pour le client (en attente/effectue/echec/intervention).

### 9) Correctifs residuels critiques (2026-03-10 - suite)
- Nouveau service central: `services/refundExecutionService.js` avec `triggerRefundExecution(refundRequest, sale)`:
  - calcule le split Stripe/carte cadeau,
  - initie Stripe et positionne `status=pending` + statuts partiels pour les cas Stripe/mixte,
  - gere le cas 100% carte cadeau en recredit immediat + `status=succeeded` + email `refund_confirmed`.
- Le declenchement financier Stripe est maintenant branche automatiquement a la creation d un `RefundRequest`:
  - `controllers/clientController.js` (`createPresentielRefundRequest`),
  - `services/sessionCancellationFlowService.js` (`applyFlowRefundDecision`, couvre aussi `sessionCancellationAutoRefundJob`).
- En cas d echec de `triggerRefundExecution` (ex: erreur Stripe), le flow principal continue: erreur loguee, `RefundRequest` conserve en `requested` pour retry manuel/interne.
- `controllers/salesController.js` reutilise cette logique centralisee dans `updateRefundStatus` (plus de duplication locale de declenchement financier).

## Stripe gift-card reservation concurrency update (2026-03-10)
- Source of truth unchanged: only `payment_intent.succeeded` creates the sale; frontend remains passive.
- Reservation step at checkout: `createCheckoutSession` now reserves gift-card amounts per `paymentIntentId` before returning `clientSecret`.
- Reservation model: `GiftCard` stores `reservedAmount` and `reservations[]` entries (`paymentIntentId`, `amount`, `createdAt`).
- Available balance rule (global): all availability checks must use `balance - reservedAmount`.
- Success path: gift-card debit still occurs only in `runPostSaleSideEffects` -> `finalizeGiftCardUsage`; reservation is released after successful debit.
- Failure path: webhook now handles `payment_intent.payment_failed` and releases reservations linked to the failed `paymentIntentId`.
- Orphan safety net: server startup registers an hourly cleanup job that releases reservations older than 2 hours.
- Stripe dashboard manual action required: ensure webhook endpoint subscribes to both `payment_intent.succeeded` and `payment_intent.payment_failed`.

## Gift-card reservation key alignment fix (2026-03-10)
- `planGiftCardUsage` resolves each gift card with `giftCardId` priority; fallback by `code` is used only when `giftCardId` is absent.
- Stripe checkout persistence rule: after successful reservation, `StripeCheckoutIntent.checkoutState.appliedGiftCards` is normalized and persisted with explicit `giftCardId` for each reserved entry.
- Alignment rule: reservation key `paymentIntentId` (stored in `GiftCard.reservations[]`) must match `reservationPaymentIntentId` passed to `planGiftCardUsage` from webhook (`payment_intent.id`).

## GiftCardTransaction item-type enum alignment (2026-03-10)
- `models/GiftCardTransaction.js` now accepts the same item types as `models/Sale.js` for `items[].type`: `product`, `formation`, `gift-card`, `formation-option`.
- This removes validation drift between Sale item generation and gift-card transaction persistence (notably `formation-option` purchases).
- Temporary diagnostic logs added in checkout/webhook/planGiftCardUsage were removed after root-cause confirmation.

## Refund split resilience update (2026-03-10)
- `finalizeGiftCardUsage` now re-persists `Sale.giftCardUsage` after successful debit/transaction creation so refund split data is guaranteed on webhook-created sales.
- Refund split primary source remains `Sale.giftCardUsage`.
- Fallback added in `triggerRefundExecution`: when `Sale.giftCardUsage` is empty on a Stripe sale, gift-card total is reconstructed from `GiftCardTransaction` (`transactionType=redeem`, same `saleId`) without migration.
- Reconstructed gift-card total is clamped to `sale.totalAmount` before computing Stripe vs gift-card refund portions.

## Refund amount and split update (2026-03-10)
- Refundable amount for presentiel cancellation now includes all refundable sale items for the formation purchase: `formation` + `formation-option`.
- Refund split now follows real payment composition with gift-card priority on the refunded amount:
  - `giftCardRefundAmount = min(refundAmount, giftCardTotal)`
  - `stripeRefundAmount = refundAmount - giftCardRefundAmount` (clamped by Stripe-paid portion)
- Split source remains `Sale.giftCardUsage`, with existing fallback to `GiftCardTransaction` (`transactionType=redeem`) when legacy Stripe sales have empty `giftCardUsage`.
- Any gift-card recredit (`balance += amount`) now creates a positive `GiftCardTransaction` (`transactionType=credit`, `amount > 0`) with note `Remboursement de vente <saleId>` for traceability.
- Front refund UIs (`refundTrackingModule.js`, `salesModule.js`) already read `refund.amount`, `stripeRefundAmount`, and `giftCardRefundAmount`; with these backend fixes they display formation+options totals and the correct Stripe/gift-card split.
- Recredit path resilience: if `Sale.giftCardUsage` is missing on older sales, gift-card recredit resolves per-card amounts from `GiftCardTransaction` (`transactionType=redeem`, grouped by `giftCardId`) before applying credit.

## Stripe fee base correction in sales modal (2026-03-10)
- Financial summary in `public/js/modules/salesModule.js` now computes Stripe fee percentage from the real Stripe-paid amount, not from `sale.totalAmount`.
- Source for real Stripe amount is `GET /api/stripe/transaction-fees` field `amount` (gross amount from Stripe BalanceTransaction/Charge, in cents).
- Fallback base when `amount` is missing: `fee + net` (still Stripe-only base).
- Net revenue formula remains unchanged and explicit:
  - `netRevenue = totalAmount - (stripeFee / 100) - commissionAmount`
- This keeps split payments (card + gift card) accurate: Stripe fee percentage is now based only on the Stripe portion.

## Refund detail modal premium redesign (2026-03-11)
- `public/js/modules/salesModule.js` refund detail modal was rebuilt to match the premium sale-detail modal visual language.
- New modal structure:
  - Header: refund ID + copy action, requested date, global status badge (`En attente` / `Rembourse`).
  - Client section: full name + mailto email.
  - Formation section: title, inferred type chip (`Presentielle` when `sessionStartAt` exists, otherwise `Distancielle`), session date when available, and deep-link button to related sale detail.
  - Refunded amounts section: right-aligned rows for total, Stripe refund, and gift-card recredit with per-line status chips and conditional `Voir la carte` action when gift-card refund succeeded.
  - Stripe section (when applicable): Stripe refund ID (`re_...`) + copy action and Stripe confirmation date when succeeded.
  - Client tracking section: tokenized link to `/vitrine.html?page=refund-tracking&token=...` in a new tab.
  - Alert section: soft red intervention block when `stripeRefundStatus=failed`.
- `public/css/app.css` adds dedicated `srm-*` classes for premium refund modal layout and keeps header sticky for long-content scrolling.
- `controllers/salesController.js` (`listRefunds`) now includes `trackingToken` so admin refund details can generate the client tracking URL without extra calls.

## Addendum fusion depuis /architecture.md (racine)

Ce bloc preserve le contenu de la version racine afin de garantir zero perte d'information lors de la consolidation.

## Structure gÃƒÂ©nÃƒÂ©rale

```
backend/
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ controllers/          # Logique mÃƒÂ©tier des endpoints API
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ models/               # SchÃƒÂ©mas Mongoose (MongoDB)
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ services/             # Services rÃƒÂ©utilisables (mail, refund, giftCardÃ¢â‚¬Â¦)
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ routers/              # DÃƒÂ©finition des routes Express
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ middlewares/          # Auth, validation, session
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ utils/                # Fonctions utilitaires
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ public/
Ã¢â€â€š   Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ css/              # Feuilles de style (app.css, gestion.css, modulesÃ¢â‚¬Â¦)
Ã¢â€â€š   Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ js/
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ modules/      # Modules front-end (salesModule.js, Ã¢â‚¬Â¦)
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ ui/           # Composants UI rÃƒÂ©utilisables
Ã¢â€â€š       Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ helpers/      # Helpers graphiques (graphStylePreset.js)
Ã¢â€â€š       Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ constants/    # Constantes front
Ã¢â€Å“Ã¢â€â‚¬Ã¢â€â‚¬ templates/            # Templates email/PDF
Ã¢â€â€Ã¢â€â‚¬Ã¢â€â‚¬ scripts/              # Scripts d'administration
```

## Module Ventes (`salesModule.js`)

**Chemin :** `backend/public/js/modules/salesModule.js`

Module front-end de gestion du tableau de bord des ventes. ComposÃƒÂ© de 3 onglets :
- **Statistiques & analyses** Ã¢â‚¬â€ KPIs, graphiques de tendances par pÃƒÂ©riode
- **Ventes et Paniers** Ã¢â‚¬â€ liste des ventes + paniers actifs
- **Remboursements** Ã¢â‚¬â€ liste et gestion des remboursements

### Modal de dÃƒÂ©tail de vente (refonte 2025)

Structure en sections visuellement distinctes (`sdm-section`) :

1. **En-tÃƒÂªte** Ã¢â‚¬â€ ID vente + copier, date formatÃƒÂ©e, badge statut
2. **Client** Ã¢â‚¬â€ nom complet, email cliquable
3. **Formation** Ã¢â‚¬â€ titre, type (prÃƒÂ©sentielle/distancielle), date de session
4. **RÃƒÂ©capitulatif de paiement** Ã¢â‚¬â€ tableau caisse :
   - Articles avec prix unitaires
   - Options indentÃƒÂ©es sous la formation
   - Sous-total
   - DÃƒÂ©duction carte cadeau (si applicable) avec code
   - "PayÃƒÂ© par Stripe" (si carte cadeau utilisÃƒÂ©e)
5. **SynthÃƒÂ¨se financiÃƒÂ¨re** :
   - Montant total client
   - Commission Stripe (avec % calculÃƒÂ© sur le montant Stripe rÃƒÂ©el)
   - Commission prestataire
   - Revenu net
6. **Transaction Stripe** Ã¢â‚¬â€ PaymentIntent ID + copier
7. **Remboursement** (si applicable) Ã¢â‚¬â€ statut, montant
8. **Preuves d'achat** Ã¢â‚¬â€ CGV, IP, renonciation (section collapsible)

### RÃƒÂ¨gle commission Stripe (IMPORTANT)

> La commission Stripe est calculÃƒÂ©e sur le **montant rÃƒÂ©ellement encaissÃƒÂ© par Stripe** (montant total Ã¢Ë†â€™ cartes cadeaux), PAS sur le montant total de la commande.
>
> `stripePercentage = (stripeFee / stripeAmount) * 100`
>
> Le label affiche : `"7,08 Ã¢â€šÂ¬ (3,37% sur 210,00 Ã¢â€šÂ¬)"` oÃƒÂ¹ 210 Ã¢â€šÂ¬ est le montant Stripe.

### Chargement des frais Stripe

Les frais Stripe sont chargÃƒÂ©s asynchroniquement via `GET /api/stripe/transaction-fees?paymentIntentId=pi_xxx`.

L'endpoint retourne : `{ fee, net, amount, currency, updated }` Ã¢â‚¬â€ tous en centimes.

`stripeAmount` (en centimes) est estimÃƒÂ© avant la rÃƒÂ©ponse API comme `(totalAmount - giftCardTotal) * 100`.

## Endpoints principaux

| MÃƒÂ©thode | Route | Description |
|---------|-------|-------------|
| GET | `/api/gestion/sales/stats` | Statistiques ventes par pÃƒÂ©riode |
| GET | `/api/gestion/sales` | Liste des ventes avec commission |
| GET | `/api/gestion/carts` | Paniers actifs |
| GET | `/api/gestion/refunds` | Liste des remboursements |
| GET | `/api/stripe/transaction-fees` | Frais Stripe en temps rÃƒÂ©el (admin/dev) |
| GET | `/api/stripe/pending-fees-count` | Nb de transactions sans frais Stripe |

## ModÃƒÂ¨le Sale (champs clÃƒÂ©s)

```javascript
{
  saleId: String,          // ID unique de la vente
  customer: {              // Infos client
    firstName, lastName, email
  },
  items: [{                // Articles achetÃƒÂ©s
    type: 'formation' | 'formation-option' | 'product' | 'gift-card',
    name: String,
    finalPrice: Number,    // Prix aprÃƒÂ¨s promotion
    price: Number          // Prix catalogue
  }],
  giftCardUsage: [{        // Cartes cadeaux utilisÃƒÂ©es en paiement
    code: String,          // Code de la carte (stockÃƒÂ© en clair)
    amountUsed: Number     // Montant utilisÃƒÂ© (en euros)
  }],
  totalAmount: Number,     // Montant TOTAL catalogue (avant dÃƒÂ©duction carte cadeau)
  commissionRate: Number,  // Taux commission prestataire (%)
  commissionAmount: Number,// Montant commission prestataire (Ã¢â€šÂ¬)
  stripeFee: Number,       // Frais Stripe en centimes (null si non encore rÃƒÂ©cupÃƒÂ©rÃƒÂ©s)
  stripeNet: Number,       // Net Stripe en centimes
  stripePaymentIntentId: String,
  refundStatus: String,    // 'requested' | 'pending' | 'succeeded' | 'failed'
  refundAmount: Number
}
```

## CSS Ã¢â‚¬â€ Variables du thÃƒÂ¨me

DÃƒÂ©finies dans `:root` de `app.css` :
- `--color-primary: #5f4ff7` (violet)
- `--color-secondary: #f24692` (rose)
- `--color-success: #1f7a3a` (vert)
- `--color-danger: #dc2626` (rouge)
- `--color-muted: rgba(15, 23, 42, 0.5)`
- `--color-surface: #ffffff`
- `--color-background: #f5f4ef`
- `--color-border: rgba(15, 15, 15, 0.12)`
- `--theme-accent` = mix primary/secondary
- `--theme-accent-strong` = mix primary 45%/secondary 55%

### Classes modal de vente

- `.sdm-section` Ã¢â‚¬â€ bloc section
- `.sdm-section--finance` Ã¢â‚¬â€ section synthÃƒÂ¨se (fond teintÃƒÂ© primary)
- `.sdm-section--refund` Ã¢â‚¬â€ section remboursement (fond teintÃƒÂ© danger)
- `.sdm-payment-row` Ã¢â‚¬â€ ligne du tableau paiement
- `.sdm-payment-row--option` Ã¢â‚¬â€ option indentÃƒÂ©e
- `.sdm-payment-row--giftcard` Ã¢â‚¬â€ dÃƒÂ©duction carte cadeau (vert)
- `.sdm-payment-row--stripe` Ã¢â‚¬â€ montant Stripe (primary, gras)
- `.sdm-finance-row` Ã¢â‚¬â€ ligne synthÃƒÂ¨se financiÃƒÂ¨re
- `.sdm-finance-row--net` Ã¢â‚¬â€ revenu net (vert, gras)
- `.sdm-status-badge--confirmed/refunded/pending` Ã¢â‚¬â€ badges statut

## Module Suivi Remboursement (`refundTrackingModule.js`)

**Chemin :** `backend/public/js/modules/refundTrackingModule.js`

Refonte UI (2026-03-11) orientee premium digital, en conservant la logique de fetch existante (`GET /api/refund-tracking/:token`).

### Principes visuels

- Carte unique centree (`max-width: 600px`), fond `var(--color-surface)`, sans gradient
- Hierarchie typographique renforcee + sections lisibles (Informations, Split remboursement)
- Utilisation exclusive des variables theme (`--color-*`, `--theme-*`)

### Icones et animations

- Bootstrap Icons utilisees (`bi-hourglass-split`, `bi-x-circle`, `bi-gift`, `bi-clipboard`, `bi-x`)
- Succes : SVG check anime (trace cercle + check via stroke-dasharray)
- En attente : icone sablier en rotation lente (`3s linear infinite`)
- Contenu : fade-in leger apres le bloc statut
- Copie modal : feedback visuel `Copie !` avec disparition auto (2s)

### Modal carte cadeau (version suivi remboursement)

- Modale dediee avec classes `refund-tracking-gift-modal*` (scope local au module)
- Header minimaliste gauche (icone cadeau + titre)
- Pattern label/valeur pour code, mot de passe, expiration, beneficiaire
- Bouton fermeture centre (icone `bi-x`)
- Fermeture via bouton, clic exterieur, touche `Escape`

### Chargement Bootstrap Icons

Bootstrap Icons sont chargees via :
- `backend/public/css/app.css` (ligne 1): `@import url('https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css');`

### Donnees de confirmation Stripe (2026-03-11)

- `RefundRequest` stocke `stripeRefundConfirmedAt` (Date, `null` par defaut).
- Le webhook Stripe `charge.refund.updated` remplit ce champ quand `refund.status === 'succeeded'` avec `new Date(refund.updated * 1000)`.
- `GET /api/refund-tracking/:token` retourne aussi `stripeRefundConfirmedAt`.
- Dans `refundTrackingModule.js`, la ligne "Remboursement bancaire" affiche une note discrÃƒÂ¨te avec `bi-check2-circle` :
  - "Remboursement confirme par Stripe le [date] a [heure]" si `stripeRefundConfirmedAt` est present.
  - Sinon "Remboursement effectue le [date] a [heure]" si `refundedAt` est present.

### Paiement Stripe unifie (2026-03-11)

- Les achats `formation`, `product` et `gift-card` passent par `POST /api/stripe/create-checkout-session`.
- Le `checkoutState` accepte `item.type = 'gift-card'` avec les donnees d'achat (montant + destinataire/message si fournis).
- Le webhook `payment_intent.succeeded` finalise aussi `gift-card` via `processCheckoutStatePurchase` (meme pattern que formation):
  - creation carte cadeau
  - creation `Sale` avec `items[].type = 'gift-card'`
  - execution `runPostSaleSideEffects` (email vente, facture, notifications)
- Les reservations/settlements cartes cadeaux restent actives pour le cas de paiement partiel d'une carte cadeau par une autre carte cadeau.

## Flow decision annulation session (token-only)

- Les endpoints client `session-cancel-flows` sont accessibles sans session connectee:
  - `GET /api/client/session-cancel-flows/:flowId?token=...`
  - `POST /api/client/session-cancel-flows/:flowId/{refund|reschedule|confirm|gift-card}` avec `token` dans le body (ou query).
- La validation d'acces repose uniquement sur le lien securise:
  - `flowId` existant
  - `token` valide (hash correspondant)
  - token non expire
  - flow encore `pending` et non utilise.
- Aucune verification supplementaire sur `req.sessionUser` (role/proprietaire) n'est appliquee pour ce flow.
- Cote front (`sessionCanceledDecisionModule.js`), la page charge directement le flow via `flowId + token` sans etape de connexion obligatoire.

## Refonte UI - cards ventes/remboursements (2026-03-12)

Portee: `backend/public/js/modules/salesModule.js` et `backend/public/css/app.css` (UI uniquement).

- Refonte des cards ventes et remboursements avec un layout premium commun:
  - header avec badge type (formation / produit / carte cadeau / remboursement)
  - badge statut aligne a droite
  - separateur fin
  - mode compacte par defaut (resume court)
  - panneau detail depliable anime via bouton
  - zone contenu detail (titre, client, date, montant, metadonnees)
  - zone action en bas a droite
- Nouveau bouton d'action "Details": format pill, icone Bootstrap `bi-arrow-right-circle`, micro-animation de translation de l'icone au hover.
- Remboursements: lignes "part bancaire" et "part carte cadeau" avec badges compacts inline + statut global de card (Rembourse / En cours / Intervention requise).
- Barres de recherche/filtres harmonisees (surface, bordure, focus ring, switch segmente).
- Animation d'apparition des cards au rendu: fade-in + legere translation verticale avec effet stagger.
- Aucune modification de logique metier, de filtres/recherche/pagination ni des modales de detail.

## Stripe - Documentation technique

### 1) Vue d'ensemble - Schema des circuits

```text
CIRCUIT 1 - PAIEMENT
Frontend (paymentSimulationModule / checkout flow)
  -> POST /api/stripe/create-checkout-session
  -> Stripe PaymentIntent (clientSecret)
  -> Confirmation carte cote Stripe.js
  -> Webhook POST /api/stripe/webhook (event: payment_intent.succeeded)
  -> processCheckoutStatePurchase (controllers/clientController.js)
  -> runPostSaleSideEffects
  -> Persistance/side effects: Sale, Purchase, GiftCard debit final, Invoice Stripe, email de vente

CIRCUIT 2 - REMBOURSEMENT
Admin/Client
  -> creation RefundRequest
  -> triggerRefundExecution (services/refundExecutionService.js)
  -> Stripe Refund (si part Stripe > 0)
  -> Webhook POST /api/stripe/webhook (event: charge.refund.updated)
  -> mise a jour RefundRequest (stripeRefundStatus, dates, giftCard status)
  -> tentative creation Stripe Credit Note (si invoice Stripe existante)
  -> email refund_confirmed + PDF credit note exploitable dans salesModule

CIRCUIT 3 - FACTURATION
runPostSaleSideEffects
  -> createStripeInvoiceForSale (services/stripeInvoiceService.js)
  -> Customer Stripe (create/reuse via User.stripeCustomerId)
  -> Invoice draft (auto_advance: false)
  -> Invoice items (articles + ligne negative carte cadeau si applicable)
  -> finalizeInvoice
  -> invoices.pay(..., paid_out_of_band: true)
  -> stockage refs Invoice: stripeInvoiceId, stripeInvoiceNumber, stripeInvoicePdfUrl, stripeHostedUrl
```

### 2) Endpoints Stripe exposes

#### `POST /api/stripe/create-checkout-session`
- Auth: oui (`requireAuth()`).
- Role: cree un PaymentIntent Stripe pour un checkout valide et reserve les cartes cadeaux.
- Retour: `{ ok, clientSecret, returnUrl }` ou erreur metier (`ALREADY_PURCHASED`, validation legale, montant trop bas, etc.).
- Dependances:
  - Modeles: `StripeCheckoutIntent`, `User`, `Product`, `Formation`, `FormationSession`, `Purchase` (checks), `GiftCard` (via reservation service).
  - Services/Fonctions: `validateCheckoutStateAgainstCatalog`, `reserveGiftCardAmountsForPaymentIntent`, `releaseGiftCardReservationsForPaymentIntent`.

#### `POST /api/stripe/webhook`
- Auth: non (signature Stripe obligatoire, `STRIPE_WEBHOOK_SECRET`).
- Role: point d'entree des evenements Stripe (`payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refund.updated`).
- Retour: `{ received: true }` (ou 500 pour forcer retry Stripe sur erreurs critiques).
- Dependances:
  - Modeles: `Sale`, `StripeCheckoutIntent`, `RefundRequest`, `Invoice`, `GiftCardTransaction`.
  - Services/Fonctions: `processCheckoutStatePurchase`, `releaseGiftCardReservationsForPaymentIntent`, `recoverStripeFeesAndUpdateSale`, `sendRefundConfirmedEmail`.

#### `GET /api/stripe/payment-result`
- Auth: oui (`requireAuth()`).
- Role: endpoint de verification passive du resultat de paiement (ne cree pas la vente, ne declenche aucun side effect).
- Retour: `status: succeeded | pending | failed` + payload achat si vente deja creee.
- Dependances:
  - Modeles: `Sale`, `StripeCheckoutIntent`.
  - Stripe API: `paymentIntents.retrieve`.

#### `GET /api/stripe/config`
- Auth: non.
- Role: expose uniquement la cle publishable Stripe au frontend.
- Retour: `{ publishableKey }`.
- Dependances: variable env `STRIPE_PUBLISHABLE_KEY`.

#### `GET /api/stripe/transaction-fees`
- Auth: oui (`requireAuth()` + role `admin` ou `dev`).
- Role: lit les frais Stripe en temps reel et persiste `Sale.stripeFee` / `Sale.stripeNet`.
- Retour: `{ ok, fee, net, amount, currency, updated }`.
- Dependances:
  - Modeles: `Sale`.
  - Services/Fonctions: `recoverStripeFeesAndUpdateSale`.

#### `GET /api/stripe/pending-fees-count`
- Auth: oui (`requireAuth()` + role `admin` ou `dev`).
- Role: compte les ventes Stripe sans frais encore persistes.
- Retour: `{ ok, count }`.
- Dependances:
  - Modeles: `Sale`.
  - Services/Fonctions: `countPendingStripeFeesSales`.

### 3) Evenements webhook ecoutes

#### `payment_intent.succeeded`
- Declencheur Stripe: PaymentIntent confirme avec succes.
- Traitement Beauty Savage:
  - idempotence sur `Sale` (`stripeSessionId`/`stripePaymentIntentId`),
  - resolution contexte achat (`StripeCheckoutIntent` prioritaire, metadata fallback),
  - execution `processCheckoutStatePurchase` (jusqu'a 3 tentatives locales),
  - recuperation/persistance frais Stripe (`stripeFee`, `stripeNet`) avec retries.
- Modeles mis a jour: `Sale`, `Purchase`, `GiftCard`, `GiftCardTransaction`, `Invoice`, `User` (stripeCustomerId), `StripeCheckoutIntent`.
- Services appeles: `processCheckoutStatePurchase`, puis via ce flow `runPostSaleSideEffects` -> `createStripeInvoiceForSale`, `sendSaleEmail`.
- Emails: email de vente (appel non bloquant).
- Gestion erreurs: 500 renvoye pour que Stripe retente.

#### `payment_intent.payment_failed`
- Declencheur Stripe: echec final du PaymentIntent.
- Traitement Beauty Savage:
  - libere les reservations carte cadeau par `paymentIntentId`.
- Modeles mis a jour: `GiftCard` (`reservedAmount`, `reservations[]`).
- Services appeles: `releaseGiftCardReservationsForPaymentIntent`.
- Emails: aucun.
- Gestion erreurs: 500 si liberation impossible (pour retry webhook).

#### `charge.refund.updated`
- Declencheur Stripe: mise a jour de statut d'un refund Stripe.
- Statut `succeeded`:
  - met `stripeRefundStatus=succeeded` + `stripeRefundConfirmedAt`,
  - gere le recredit carte cadeau differe (cas mixte),
  - finalise `RefundRequest` (ou `pending` si rollback necessaire),
  - tente creation credit note Stripe (non bloquant),
  - envoie email `refund_confirmed`.
- Statut `failed`:
  - met `stripeRefundStatus=failed`, `status=failed`,
  - marque note intervention requise,
  - tente reversal de commission (`ensureRefundCommissionReversal`).
- Statut `pending`:
  - maintient `stripeRefundStatus=pending`.
- Modeles mis a jour: `RefundRequest`, `GiftCard`, `GiftCardTransaction`.
- Services appeles: `recreditGiftCardPortion`, `sendRefundConfirmedEmail`, `ensureRefundCommissionReversal`.
- Replay / reprise:
  - `services/sessionCancellationFlowService.js` laisse le flow institut en `pending` si `triggerRefundExecution` echoue au lieu de le consommer definitivement.
  - `automatisme/refundRecoveryJob.js` relance periodiquement les `RefundRequest` `requested/pending` avec un idempotency key Stripe stable derive de `refundId`.
- Gestion erreurs: creation credit note non bloquante; echec logge sans casser la confirmation refund.

### 4) Circuit de facturation Stripe

- Prerequis customer:
  - `User.stripeCustomerId` est relu dans `createStripeInvoiceForSale`.
  - si absent, creation `stripe.customers.create(...)` puis update user.
- Creation facture:
  - `stripe.invoices.create(...)` avec `auto_advance: false`, `collection_method: 'charge_automatically'`, metadata sale/user.
- Idempotence:
  - `stripe.customers.create`, `stripe.invoices.create`, `stripe.invoiceItems.create`, `stripe.invoices.finalizeInvoice` et `stripe.invoices.pay` utilisent des clefs deterministes derivees de `saleId` / `userId`.
- Lignes facture:
  - une ligne par `sale.items`,
  - si carte cadeau utilisee: ajout d'une ligne negative `Carte cadeau utilisee` (remise).
- Finalisation et paiement:
  - `finalizeInvoice(invoice.id)`,
  - `invoices.pay(invoice.id, { paid_out_of_band: true })`.
- Stockage DB (`Invoice`):
  - `stripeInvoiceId`, `stripeInvoiceNumber`, `stripeInvoicePdfUrl`, `stripeHostedUrl`, `status`.
- Contraintes `custom_fields` Stripe:
  - limite 4 champs max respectee,
  - champ `Vendeur` fusionne `nom + email`,
  - troncature `slice(0, 40)` appliquee sur chaque valeur.
- Compat historique:
  - ancien systeme PDFKit conserve (`pdfPath`) et expose en fallback dans les endpoints facture.
- Tolerance erreur:
  - facture Stripe dans `runPostSaleSideEffects` est encapsulee dans `try/catch` non bloquant.

`[Ãƒâ‚¬ CLARIFIER]` la justification metier explicite du choix `paid_out_of_band: true` n'est pas commentee dans le code; le comportement observe indique un paiement de facture marque hors bande apres finalisation.

### 5) Circuit de credit note Stripe

- Declencheur: webhook `charge.refund.updated` quand `refund.status === 'succeeded'`.
- Conditions de creation:
  - `invoice.stripeInvoiceId` present,
  - `refundDoc.stripeRefundAmount > 0`,
  - pas deja de `creditNoteId` sur le `RefundRequest`.
- Parametres actuellement envoyes:
  - `amount` ET `out_of_band_amount` (meme valeur en centimes),
  - `reason: 'order_change'`,
  - `memo` avec la vente.
- Idempotence:
  - la cle Stripe est `refund-request:<refundId>:credit-note`, ce qui permet de rejouer le webhook sans creer un second credit note.
- Persistance:
  - `RefundRequest.creditNoteId`,
  - `RefundRequest.creditNotePdfUrl`.
- Exposition UI:
  - `salesController.listRefunds` renvoie `creditNotePdfUrl`,
  - `salesModule` affiche "Document comptable" + bouton "Telecharger l'avoir".
- Tolerance erreur:
  - credit note encapsulee dans `try/catch`; echec non bloquant pour le remboursement.

`[Ãƒâ‚¬ CLARIFIER]` la regle "utiliser uniquement out_of_band_amount et pas amount" n'est pas conforme au code actuel: les deux champs sont transmis simultanement.

### 6) Circuit de reservation carte cadeau

- Reservation atomique au checkout:
  - `reserveGiftCardAmountsForPaymentIntent` incremente `GiftCard.reservedAmount` et pousse `reservations[]`.
- Liberation a l'echec paiement:
  - webhook `payment_intent.payment_failed` appelle `releaseGiftCardReservationsForPaymentIntent(paymentIntentId)`.
- Debit reel uniquement apres confirmation webhook:
  - `finalizeGiftCardUsage` appele dans `runPostSaleSideEffects` applique le debit effectif + transactions.
- Recredit remboursement:
  - 100% carte cadeau: immediat dans `triggerRefundExecution`,
  - cas mixte: differe apres confirmation Stripe dans `charge.refund.updated` (succeeded).
- Nettoyage reservations orphelines:
  - job serveur toutes les heures (`app.js`),
  - supprime reservations > 2h (`cleanupExpiredGiftCardReservations`).

### 7) Modeles impliques - Champs Stripe

#### `Sale`
- `stripePaymentIntentId`: identifiant Stripe principal de paiement.
- `stripeFee`: frais Stripe en centimes.
- `stripeNet`: net Stripe en centimes.
- `giftCardUsage[]`: repartition du paiement par carte cadeau (split refund).

#### `Invoice`
- `stripeInvoiceId`: ID Stripe Invoice.
- `stripeInvoiceNumber`: numero facture Stripe.
- `stripeInvoicePdfUrl`: URL PDF facture Stripe.
- `stripeHostedUrl`: URL hebergee Stripe.

#### `RefundRequest`
- `stripeRefundId`: ID Stripe Refund (`re_...`).
- `stripeRefundStatus`: statut refund Stripe (`pending/succeeded/failed/...`).
- `stripeRefundAmount`: portion EUR remboursee via Stripe.
- `creditNoteId`: ID Stripe Credit Note.
- `creditNotePdfUrl`: URL PDF credit note.

#### `User`
- `stripeCustomerId`: ID customer Stripe persistant.

#### `GiftCard`
- `reservedAmount`: montant total reserve (non encore debite).
- `reservations[]`: reservations detaillees (`paymentIntentId`, `amount`, `createdAt`).

### 8) Regles critiques et invariants

- Le webhook Stripe `payment_intent.succeeded` est la source de verite pour creation de vente Stripe.
- `GET /api/stripe/payment-result` ne declenche aucun side effect (lecture/verification uniquement).
- Debit carte cadeau effectif uniquement dans `runPostSaleSideEffects` apres confirmation webhook.
- Echec facture Stripe non bloquant: vente confirmee, erreur loggee.
- Echec credit note non bloquant: remboursement conserve, erreur loggee.
- Anti-doublon `RefundRequest`: un seul remboursement actif par `saleId` (`status` hors `failed|canceled`).
- Les factures Stripe sont marquees `paid_out_of_band: true` dans l'implementation actuelle.
- Les credit notes utilisent actuellement `amount + out_of_band_amount` avec la meme valeur.

`[Ãƒâ‚¬ CLARIFIER]` l'assertion "runPostSaleSideEffects appele uniquement depuis le webhook" n'est vraie que pour le circuit Stripe; la fonction est aussi appelee dans d'autres parcours d'achat backend.

### 9) Configuration et variables d'environnement

Variables Stripe/facturation utilisees dans le code:

- `STRIPE_SECRET_KEY`: cle serveur Stripe (PaymentIntent, refunds, invoices, credit notes).
- `STRIPE_PUBLISHABLE_KEY`: cle publique renvoyee par `GET /api/stripe/config`.
- `STRIPE_WEBHOOK_SECRET`: verification signature webhook Stripe.
- `INSTITUTE_NAME`: nom vendeur facture.
- `INSTITUTE_ADDRESS_LINE1`: adresse ligne 1 vendeur.
- `INSTITUTE_CITY`: ville vendeur.
- `INSTITUTE_POSTAL_CODE`: code postal vendeur.
- `INSTITUTE_COUNTRY`: pays vendeur (fallback `FR`).
- `INSTITUTE_SIRET`: identifiant SIRET affiche en facture.
- `INSTITUTE_VAT_MENTION`: mention TVA affichee en facture.

Variables connexes observees (contexte execution):

- `INVOICE_CONTACT_EMAIL`: email de contact facture (fallback vendeur).
- `MAIL_FROM`: fallback email vendeur si `INVOICE_CONTACT_EMAIL` absent.
- `NGROK_DOMAIN`: construit la `returnUrl` checkout et l'URL webhook ciblee.

## Migration Stripe Invoicing (2026-03-12)

- Les nouvelles ventes passent par Stripe Invoicing via `services/stripeInvoiceService.js`.
- Flow applique: customer Stripe (creation/reuse via `User.stripeCustomerId`) -> invoice draft (`auto_advance: false`) -> invoice items -> finalization -> marquage paye `paid_out_of_band: true` -> persistance refs Stripe dans `Invoice`.
- Les informations vendeur sont injectees dynamiquement par API via `config/invoiceVendorConfig.js` (nom, contact, adresse, SIRET, mention TVA depuis `.env`).
- `runPostSaleSideEffects` appelle desormais `createStripeInvoiceForSale(sale, user)` en mode non bloquant: echec facture Stripe ne bloque jamais la confirmation de vente.
- Coexistence historique maintenue:
  - anciennes factures PDFKit (`invoiceService.js`, `pdfPath`) toujours telechargeables,
  - nouvelles factures Stripe servies par `stripeInvoicePdfUrl` (avec tentative de refresh Stripe si URL absente en base).
- `models` enrichis:
  - `User.stripeCustomerId`,
  - `Invoice.stripeInvoiceId`, `stripeInvoiceNumber`, `stripeInvoicePdfUrl`, `stripeHostedUrl`,
  - `RefundRequest.creditNoteId`, `creditNotePdfUrl`.
- Webhook remboursement `charge.refund.updated`:
  - en cas de succes Stripe, creation d'une credit note Stripe rattachee a la facture Stripe si disponible,
  - stockage `creditNoteId` + `creditNotePdfUrl` sur `RefundRequest`,
  - echec credit note non bloquant pour le webhook.
- `salesModule.js`:
  - modal detail vente: telechargement facture priorise `stripeInvoicePdfUrl`, fallback endpoint historique,
  - modal detail remboursement: nouvelle section "Document comptable" avec bouton "Telecharger l'avoir" (PDF credit note) et message "Avoir en cours de generation" si Stripe rembourse mais PDF non encore present.

## Systeme anti-chevauchement de sessions (2026-03-13)

### Regles metier
- Deux sessions sont en conflit si elles couvrent la meme date calendaire et ont des horaires qui se chevauchent (overlap temporel).
- Les champs `formatrice` et `location` n'existent pas dans `FormationSession` : la detection de conflit est basee uniquement sur l'overlap temporel toutes sessions confondues.
- Le modele `FormationSession` utilise `startDate` + `durationDays` + `schedule[]` (par dayIndex) pour definir les plages horaires sur plusieurs jours.
- Pour une date cible D, le `dayIndex` d'une session = floor((D - startDate) / 86400000) + 1.

### Endpoints de detection (formationSessionRouter Ã¢â€ â€™ /api/gestion/*)
- `GET /api/gestion/sessions/conflicts?date=YYYY-MM-DD&excludeSessionId=xxx` :
  - Retourne tous les creneaux occupes le jour donne (toutes formations, hors session exclue).
  - Format reponse : `{ ok: true, occupied: [{ sessionId, formationName, startTime, endTime }] }`.
  - `excludeSessionId` : omis en creation, ID de la session en modification (pour ne pas entrer en conflit avec soi-meme).
- `GET /api/gestion/sessions/conflicts-report` :
  - Retourne tous les chevauchements existants en base entre paires de sessions actives.
  - Format reponse : `{ ok: true, conflicts: [{ date, session1, session2, overlap }] }`.
  - Utilise par le module planning pour afficher la barre de statut et le rapport.

### Validation backend (formationSessionController.js)
- `createSession` et `updateSession` appellent `findConflictingSlots()` avant chaque sauvegarde.
- En cas de conflit : HTTP 409 avec `{ ok: false, error, conflicts: [{ formationName, startTime, endTime }] }`.
- `findConflictingSlots({ startDate, durationDays, schedule, excludeSessionId })` : iterates over all schedule days, finds sessions covering each date, checks time overlap.

### Composant time picker partagÃƒÂ© (formationManagerModule.js)
- `SESSION_TIME_STEP_MINUTES = 30`, plage 07h00Ã¢â‚¬â€œ22h00 (31 options).
- `SESSIONS_CONFLICTS_ENDPOINT = '/api/gestion/sessions/conflicts'`.
- `state.sessionConflictsByDate` : cache `{ [dateKey]: Array<{ sessionId, formationName, startTime, endTime }> }`.
- `loadConflictsForDates(dateKeys, excludeSessionId)` : charge les conflits par date via l'API, stocke dans le cache.
- `getExcludeSessionIdForContext(context)` : retourne l'ID de session selon le contexte ('create' Ã¢â€ â€™ null, 'modal' Ã¢â€ â€™ sessionModal.sessionId, 'detail' Ã¢â€ â€™ planningEditingSessionId).
- Trois contextes d'utilisation du meme composant : 'create' (formulaire creation), 'modal' (modal modification), 'detail' (vue detail planning).
- `buildExternalSessionIntervalsByDate()` : reconstruit la Map depuis `state.sessionConflictsByDate` (remplacement de l'ancienne approche multi-formation).

### Etats visuels des creneaux
- `stp-slot` : creneau disponible
- `stp-slot--start` : creneau selectionne comme heure de debut (icone bi-play-circle-fill)
- `stp-slot--end` : creneau selectionne comme heure de fin (icone bi-stop-circle-fill)
- `stp-slot--below` : creneau avant le debut selectionne (opacite 0.28, non cliquable)
- `stp-slot--reserved` : creneau occupe par une autre session (background accent-strong, tooltip)
- Tooltip : texte "Indisponible Ã¢â‚¬â€ [Formation] Ã‚Â· HHhMM Ã¢â€ â€™ HHhMM", visible au hover ET au clic (mobile).
- Badge de duree : `.session-time-picker__duration-badge` entre les chips debut/fin.
- Rappel heure de debut dans le picker de fin : `.stp-start-reminder` en haut du popover.

### Gestion erreur 409
- A la sauvegarde, si le backend retourne 409 : toast d'erreur 5s + animation pulse sur les chips (`.stp-conflict-pulse`).
- `pulseConflictSlotsInPicker(context, scheduleEntries)` : pulse les chips du picker concerne.

### Rapport de chevauchements dans la page planning (planningModule.js)
- Chargement au montage via `loadConflictsReport()` (appel parallele avec `loadPlanningOverview()`).
- Barre de statut `.planning-conflict-bar` : verte si 0 conflit, rouge avec nombre si conflits.
- Modal rapport `.planning-conflict-modal` (70vh, scrollable) : slide-up 250ms.
- Chaque conflit affiche : date, formation A (horaires), formation B (horaires), periode de chevauchement.
- Fermeture : bouton croix + clic backdrop.

## Mise a jour remboursement presentiel configurable (2026-03-17)

### Champ formation.refundDays
- Nouveau champ `Formation.refundDays` (Number, min 0, default 7).
- Ce champ remplace toute logique metier basee sur une fenetre presentielle fixe a 7 jours.
- Le delai legal de retractation reste fixe et non configurable a `RETRACTATION_DAYS = 14`.

### Eligibilite remboursement presentiel (logique combinee)
- Source: `services/refundService.js` -> `getPresentielRefundEligibility({ sale, formation, now })`.
- Regle legale: remboursable dans les 14 jours apres achat (`sale.createdAt`), sauf si renonciation signee.
- Regle institut: remboursable si la session est dans plus de `formation.refundDays` jours.
- Resultat retourne: `eligibleRefund`, `reason` (`retractation|institut|none`), `refundDays`, `daysBeforeSession`, `daysSincePurchase`, `waiverSigned`.

### Renonciation signee
- `sale.consumerWaiverAcceptedAt` annule explicitement le droit legal de retractation.
- La renonciation ne supprime pas la regle institut basee sur `formation.refundDays`.

### Calcul du montant remboursable (multi-formations)
- Le montant remboursable est maintenant calcule uniquement sur les lignes `Sale.items` liees a la formation annulee.
- Filtrage strict par `formationId` pour `formation-option` et par `formationId/itemId` pour `formation`.
- Cela evite de rembourser des formations non concernees dans un panier multi-formations.

### Checkbox renonciation checkout
- Condition d affichage harmonisee backend/frontend:
  - `isWaiverRequired({ daysBeforeFormation, refundDays })`
  - Equivalent: `daysBeforeFormation < Math.max(14, refundDays)`.
- Le front (`checkoutModule.js`) lit `refundDays` depuis la formation retournee par API (jamais en dur).

### Propagation API de refundDays
- Payload formation admin (`controllers/formationGestionController.js`): liste, creation, edition.
- Payload formation vitrine/checkout (`controllers/vitrineShopController.js`): listing et detail formation.
- Payload formation client (`controllers/clientController.js` via `serializeFormation`) et detail session client (`refundEligibility` inclus).
- Payload favoris (`mapFavoriteTargetPayload` dans `clientController.js`): `refundDays` ajoutÃƒÂ© pour cohÃƒÂ©rence (mÃƒÂªme pattern que `serializeFormation`).

### Validation renonciation prÃƒÂ©sentielle en panier (mockPayCart)
- `enforcePresentielWaiver` activÃƒÂ© (`Boolean(firstPresentielSessionStart)`) si le panier contient une formation prÃƒÂ©sentielle avec session.
- `refundDays` transmis depuis `firstPresentielEntry.formation.refundDays` pour que `getPresentielWaiverExpectation` utilise le bon seuil.
- `firstPresentielEntry` extrait sÃƒÂ©parÃƒÂ©ment pour dÃƒÂ©river ÃƒÂ  la fois `startDate` et `refundDays` sans double `.find()`.

### Tooltip refundDays widget admin (formationManagerModule.js)
- Le contenu de `[data-refund-days-tooltip]` est retirÃƒÂ© du HTML initial (vide) Ã¢â‚¬â€ il est exclusivement alimentÃƒÂ© par `syncRefundDaysWidget(form, value)`.
- `syncRefundDaysWidget` est appelÃƒÂ© lors de l'attachement des ÃƒÂ©vÃƒÂ©nements (dÃƒÂ©faut 7), lors de la rÃƒÂ©initialisation du formulaire crÃƒÂ©ation, lors du peuplement du formulaire ÃƒÂ©dition et lors des clics incrÃƒÂ©ment/dÃƒÂ©crÃƒÂ©ment.

---

## SystÃƒÂ¨me de Contrat v2 (2026-03-17)

### Vue d'ensemble
Le systÃƒÂ¨me de contrat gÃƒÂ¨re le cycle de vie du site Beauty Savage depuis sa configuration initiale jusqu'ÃƒÂ  son activation. Il est pilotÃƒÂ© par le **Developer** (role `dev`) et doit ÃƒÂªtre rÃƒÂ©glÃƒÂ© par l'**Admin** (role `admin`) avant tout accÃƒÂ¨s ÃƒÂ  la gestion du site.

### ModÃƒÂ¨les

**`Contract`** (`models/Contract.js`) Ã¢â‚¬â€ Contrat unique actif ou pending ÃƒÂ  la fois :
- `status` : `pending` | `active` | `cancelled`
- `file` : chemin vers le fichier contrat (PDF/Word)
- `fileDownloadedAt` : horodatage du premier tÃƒÂ©lÃƒÂ©chargement
- `lockedAt` : horodatage de la premiÃƒÂ¨re consultation via `pending-info`
- `launchFee` : `{ amount, taxRate, paid, stripePaymentIntentId }`
- `monthlyFee` : `{ amount, taxRate, active, stripeSubscriptionId, stripeCustomerId, currentPeriodEnd, gracePeriodDays, pendingPaymentIntentId, pendingClientSecret }`
- `cancellationPolicy` : `{ type: 'anytime' | 'locked', lockedMonths }`
- `pendingMessage` : message affichÃƒÂ© sur la page d'attente vitrine

**`ContractCheckoutIntent`** (`models/ContractCheckoutIntent.js`) Ã¢â‚¬â€ Idempotence des paiements :
- `stripePaymentIntentId` / `stripeSetupIntentId` : IDs Stripe (unique + sparse, sans `default: null` Ã¢â‚¬â€ champ absent plutÃƒÂ´t que null pour que sparse fonctionne correctement)
- `contractId` : rÃƒÂ©fÃƒÂ©rence au contrat
- `adminId` : admin qui a initiÃƒÂ© le paiement
- `type` : `launch` | `monthly`
- `processed` : true aprÃƒÂ¨s traitement complet
- **Anti-duplicate key** : avant chaque crÃƒÂ©ation, `deleteMany` sur les intents non traitÃƒÂ©s du mÃƒÂªme type + au dÃƒÂ©marrage `app.js` : `dropIndex` des anciens index non-sparse + `syncIndexes()`
- Ne jamais inclure `stripeSetupIntentId` dans un doc `launch`, ni `stripePaymentIntentId` dans un doc `monthly` Ã¢â‚¬â€ omettre le champ complÃƒÂ¨tement (ne pas passer `null`)

### Deux clients Stripe distincts

| Client | Variable | Usage |
|--------|----------|-------|
| Institut | `STRIPE_SECRET_KEY` | Paiements formations/produits |
| Developer | `STRIPE_DEV_SECRET_KEY` | Frais de lancement + mensualitÃƒÂ©s |

`utils/stripeDevClient.js` instancie le client Developer depuis `STRIPE_DEV_SECRET_KEY`.

### Middlewares

**`contractGuard`** (`middlewares/contractGuard.js`) :
- Cache 30s sur le statut du contrat actif
- `invalidateContractCache()` exportÃƒÂ© Ã¢â‚¬â€ appelÃƒÂ© ÃƒÂ  chaque changement de statut
- Si `active` Ã¢â€ â€™ laisse tout passer
- Si pas de contrat actif Ã¢â€ â€™ bloque les routes API avec 503, les requÃƒÂªtes HTML avec une page d'attente inline (thÃƒÂ¨me Beauty Savage, `pendingMessage`)
- Routes toujours autorisÃƒÂ©es : `/api/stripe/*`, `/api/contract/*`, `/api/vitrine/theme`, `/api/vitrine/site-identity`, `/auth/*`, `/admin-login`, `/api/gestion/*`, `/api/dev/*`, assets statiques
- MontÃƒÂ© dans `app.js` aprÃƒÂ¨s `maintenanceGuard()`, avant les routes mÃƒÂ©tier

**`requireContractForAdmin`** (`middlewares/requireContractForAdmin.js`) :
- `dev` Ã¢â€ â€™ bypass toujours
- `admin` + contrat `active` Ã¢â€ â€™ passe
- `admin` + contrat `pending` Ã¢â€ â€™ `{ blocked: true, reason: 'pending' }`
- `admin` + pas de contrat Ã¢â€ â€™ `{ blocked: true, reason: 'no_contract' }`

### Routes `/api/contract`

| MÃƒÂ©thode | Route | Auth | Description |
|---------|-------|------|-------------|
| GET | `/status` | public | Statut du contrat actif (polling) |
| GET | `/stripe-dev-config` | public | ClÃƒÂ© publique Stripe Developer |
| GET | `/active` | auth | Contrat actif/pending complet |
| GET | `/pending-info` | auth | Infos + met ÃƒÂ  jour `lockedAt` |
| POST | `/download-file` | auth | TÃƒÂ©lÃƒÂ©charge le fichier + enregistre `fileDownloadedAt` |
| POST | `/create-launch-intent` | auth | CrÃƒÂ©e PaymentIntent Stripe Developer |
| POST | `/create-monthly-setup` | auth | CrÃƒÂ©e SetupIntent Stripe Developer |
| POST | `/cancel-immediate` | dev | RÃƒÂ©silie immÃƒÂ©diatement (non-production uniquement) |
| POST | `/activate-free` | dev | Active sans paiement si tous montants = 0 |
| POST | `/` | dev | CrÃƒÂ©e un contrat (multipart/form-data) |
| DELETE | `/:id` | dev | Supprime un contrat (rÃƒÂ¨gles verrouillage) |
| PATCH | `/:id/grace-period` | dev | Modifie `gracePeriodDays` |
| PATCH | `/:id/pending-message` | dev | Modifie `pendingMessage` |
| GET | `/history` | dev | Liste contrats `cancelled` |

### Webhook Stripe Developer

MontÃƒÂ© dans `app.js` **avant** `express.json()` :
```
POST /api/stripe/dev-webhook  Ã¢â€ â€™ express.raw() Ã¢â€ â€™ handleDevWebhook
```

Handler (`controllers/devWebhookController.js`) :

| Event | Action |
|-------|--------|
| `payment_intent.succeeded` | `launchFee.paid = true` uniquement (jamais `contract.status = active`) |
| `setup_intent.succeeded` | CrÃƒÂ©e Subscription + attache payment method |
| `invoice.payment_succeeded` | `monthlyFee.active = true` + `monthlyFee.stripeSubscriptionId` (jamais `contract.status = active`) |
| `invoice.payment_failed` | Log seulement |
| `customer.subscription.updated` | Met ÃƒÂ  jour `currentPeriodEnd` |
| `customer.subscription.deleted` | Contrat Ã¢â€ â€™ `cancelled` + invalide cache |

RÃƒÂ¨gle stricte : les webhooks Developer ne changent jamais `contract.status` vers `active`. L'activation passe uniquement par `POST /api/contract/activate`.

Chaque handler vÃƒÂ©rifie `ContractCheckoutIntent.processed` avant d'agir.

**Idempotence + vÃƒÂ©rification statut Stripe (`createLaunchIntent` / `createMonthlySetup`) :**
- Si un `ContractCheckoutIntent` non traitÃƒÂ© existe Ã¢â€ â€™ retrieve l'intent Stripe avant de dÃƒÂ©cider :
  - `succeeded` Ã¢â€ â€™ marquer `processed: true`, retourner `{ alreadyProcessed: true }` Ã¢â€ â€™ frontend recharge `pending-info` et `goToSlide(resumeSlide)`
  - `canceled` / `requires_payment_method` Ã¢â€ â€™ supprimer le record, crÃƒÂ©er un nouvel intent
  - Autre (`requires_confirmation`, `requires_action`) Ã¢â€ â€™ retourner le `client_secret` existant
- Avant chaque nouvelle crÃƒÂ©ation : `deleteMany` sur les intents non traitÃƒÂ©s du mÃƒÂªme type pour ÃƒÂ©viter les duplicate key

**`POST /api/contract/cancel-immediate` (dev only, `NODE_ENV !== 'production'`) :**
- BloquÃƒÂ© en production (403)
- Annule l'abonnement Stripe Developer si prÃƒÂ©sent (`stripeSubscriptionId`)
- Passe le contrat en `cancelled`, enregistre `cancelledAt` / `cancelledBy`
- Invalide le cache `contractGuard`
- Supprime tous les `ContractCheckoutIntent` liÃƒÂ©s
- AffichÃƒÂ© cÃƒÂ´tÃƒÂ© frontend dans `contractModule.js` (card Statut) uniquement si `contract.isDev === true` (champ fourni par `getActiveContract` quand `NODE_ENV !== 'production'` et role = dev)

**Log de dÃƒÂ©marrage serveur** : ÃƒÂ  chaque `app.listen`, affiche les deux URLs de webhook cÃƒÂ´te ÃƒÂ  cÃƒÂ´te avec le guide des ÃƒÂ©vÃƒÂ©nements Dev ÃƒÂ  configurer dans le dashboard Stripe Developer.

### Page `/admin-login`

- Route `GET /admin-login` Ã¢â€ â€™ `public/admin-login.html`
- Toujours accessible (exclue de `contractGuard`)
- Formulaire de login Ã¢â€ â€™ `POST /auth/login`
- AprÃƒÂ¨s login :
  - `dev` Ã¢â€ â€™ `/gestion.html`
  - `admin` + contrat `active` Ã¢â€ â€™ `/gestion.html`
  - `admin` + contrat `pending` Ã¢â€ â€™ ouvre le modal de rÃƒÂ¨glement (8 slides)
  - `admin` + pas de contrat Ã¢â€ â€™ message d'erreur
- Charge `Stripe.js` CDN uniquement sur cette page

### Modal de rÃƒÂ¨glement (8 slides)

1. **PrÃƒÂ©sentation** Ã¢â‚¬â€ RÃƒÂ©capitulatif montants, politique rÃƒÂ©siliation, ÃƒÂ©tapes
2. **Acceptation** Ã¢â‚¬â€ TÃƒÂ©lÃƒÂ©chargement fichier + checkbox avec ÃƒÂ©tats visuels lock/unlock (voir ci-dessous)
3. **Checkout lancement** Ã¢â‚¬â€ Payment Element Stripe Developer (si launchFee > 0)
4. **RÃƒÂ©sultat lancement** Ã¢â‚¬â€ Loader Ã¢â€ â€™ success/error + bouton RÃƒÂ©essayer (uniquement sur ÃƒÂ©chec)
5. **Transition** Ã¢â‚¬â€ Confirmation + rappel mensualitÃƒÂ© (si les deux existent)
6. **Checkout mensualitÃƒÂ©** Ã¢â‚¬â€ Payment Element SetupIntent (si monthlyFee > 0)
7. **RÃƒÂ©sultat mensualitÃƒÂ©** Ã¢â‚¬â€ Loader Ã¢â€ â€™ success/error + bouton RÃƒÂ©essayer (uniquement sur ÃƒÂ©chec). En cas de succÃƒÂ¨s : transition automatique vers la slide 8 aprÃƒÂ¨s 2s.
8. **Activation manuelle** Ã¢â‚¬â€ `populateSlide8()` affiche le rÃƒÂ©capitulatif final + bouton "Activer le contrat" `bi-rocket-takeoff`. Au clic : modal de confirmation puis `POST /api/contract/activate` Ã¢â€ â€™ loader Ã¢â€ â€™ succÃƒÂ¨s (animation Ã¢Å“â€¦ + redirect) ou erreur inline.

**Reprise automatique (`resumeSlide`) :**
- `GET /api/contract/pending-info` retourne `resumeSlide` (calcul backend via `computeResumeSlide` Ã¢â‚¬â€ maintenant async)
- `computeResumeSlide` appelle `syncStripeStatuses` avant de dÃƒÂ©cider : `status=active || monthlyFee.active` Ã¢â€ â€™ 8 ; `launchFee.paid && monthlyFee > 0` Ã¢â€ â€™ 6 ; `launchFee.paid && !monthlyFee` Ã¢â€ â€™ 8 ; default Ã¢â€ â€™ 1
- Frontend : `goToSlide(resumeSlide)` ouvre directement ÃƒÂ  la bonne slide sans passer par 1
- Si `resumeSlide > 1` : bandeau discret "Reprise de votre activation" (fade-out 4s) avec icÃƒÂ´ne `bi-arrow-clockwise`
- Si `resumeSlide === 8` : `populateSlide8()` dÃƒÂ©clenchÃƒÂ© immÃƒÂ©diatement (plus `startActivationPolling`)
- `startActivationPolling` conservÃƒÂ©e mais ne fait plus rien (compatibilitÃƒÂ©)

**Checkbox slide 2 Ã¢â‚¬â€ ÃƒÂ©tats visuels :**
- **VerrouillÃƒÂ©** (avant tÃƒÂ©lÃƒÂ©chargement) : icÃƒÂ´ne `bi-lock-fill` accent-strong, label opacitÃƒÂ© 0.6, cursor not-allowed, tooltip "TÃƒÂ©lÃƒÂ©chargez d'abord le contrat", pointer-events none sur la checkbox
- **DÃƒÂ©verrouillÃƒÂ©** (aprÃƒÂ¨s download confirmÃƒÂ©) : icÃƒÂ´ne `bi-unlock-fill` accent, animation `unlock-pulse` 300ms, label actif
- **CochÃƒÂ©** : animation `checkbox-pop` scale 0.8Ã¢â€ â€™1.1Ã¢â€ â€™1 300ms ease-out
- Transition icÃƒÂ´ne lockÃ¢â€ â€™unlock : fade couleur 200ms + pulse Ã¢â€ â€™ gÃƒÂ©rÃƒÂ© par `unlockCheckbox()` dans `admin-login.js`

**Bouton RÃƒÂ©essayer :**
- MasquÃƒÂ© par dÃƒÂ©faut Ã¢â‚¬â€ visible uniquement quand `setS4Result('error')` ou `setS7Result('error')` est appelÃƒÂ©
- Jamais visible sur slides 1, 2, 3, 5, 6, 8
- Style pill, fond `--theme-accent-strong`, hover translateY(-2px) + box-shadow
- IcÃƒÂ´ne `bi-arrow-clockwise` avec animation rotation 0.6s au clic

### Interface admin (contractModule.js v3.0 Ã¢â‚¬â€ 2026-03-18)

Module frontend `public/js/modules/contractModule.js` entiÃƒÂ¨rement refondu Ã¢â‚¬â€ prÃƒÂ©fixe CSS unifiÃƒÂ© `contract-*` (remplace `cm-*`/`cmt-*`).

**CSS chargÃƒÂ©** : `<link rel="stylesheet" href="/css/contractModule.css">` statique dans `gestion.html` (mÃƒÂªme pattern que autres modules).

**Onglet "Contrat en cours" Ã¢â‚¬â€ 4 cards `contract-card` :**
- **Card Statut** : badge animÃƒÂ© (`contract-badge--pending` pulse amber, `contract-badge--active` vert stable, `contract-badge--cancelled` rouge), ID contrat monospace + bouton copie `contract-copy-btn`, compteur "Actif depuis X jours/mois", bouton "Afficher le suivi" Ã¢â€ â€™ modal tracking
- **Card Fichier contractuel** : icÃƒÂ´ne 48px (`bi-file-earmark-pdf` / `bi-file-earmark-word`), nom + date ajout + date tÃƒÂ©lÃƒÂ©chargement, badge "VerrouillÃƒÂ©" `contract-badge--locked`, bouton tÃƒÂ©lÃƒÂ©chargement principal
- **Card Facturation** : frais lancement HT + tooltip TVA, mensualitÃƒÂ© HT + tooltip TVA, grace period ÃƒÂ©ditable via widget `contract-stepper`, badge politique rÃƒÂ©siliation
- **Card Message d'attente** (dev uniquement) : textarea + preview live `.contract-message-preview`, bouton "Enregistrer" `bi-floppy`
- **Card Stripe Developer** (dev uniquement, collapsible) : masquÃƒÂ©e par dÃƒÂ©faut, bouton "Consulter" + logo SVG Stripe, animation slide-down `.contract-stripe-body`, IDs monospace avec bouton copie chacun
- **Zone suppression** (non-active uniquement) : double confirmation si fileDownloaded ou lockedAt

**Onglet "Historique"** : cards `contract-card` par contrat cancelled, dÃƒÂ©tails Stripe en accordÃƒÂ©on, boutons copie IDs.

**Formulaire de crÃƒÂ©ation :**
- Dropzone `.contract-dropzone` Ã¢â‚¬â€ machine ÃƒÂ  3 ÃƒÂ©tats : **empty** (bi-cloud-upload, border pulse idle), **uploading** (bi-file-earmark + anneau `contract-dz-spinner-ring` rotatif), **ready** (icÃƒÂ´ne fichier 64px, nom, boutons Remplacer/Supprimer).
- Upload immÃƒÂ©diat au drop/sÃƒÂ©lection via `POST /api/contract/upload-temp` (dev-only) Ã¢â€ â€™ `tempFileId` cÃƒÂ´tÃƒÂ© client.
- **Remplacer** : DELETE ancien temp + POST nouveau temp Ã¢â€ â€™ nouvel ÃƒÂ©tat ready.
- **Supprimer** : DELETE temp Ã¢â€ â€™ retour ÃƒÂ©tat empty.
- `POST /api/contract` envoie `tempFileId` + `originalName` en FormData ; le controller dÃƒÂ©place le fichier du rÃƒÂ©pertoire temp vers contrats.
- Switch politique rÃƒÂ©siliation `.contract-policy-switch` : pill custom JS, thumb slide via `inset` CSS, ÃƒÂ©tat anytime (accent) / locked (accent-strong).
- Compteur engagement `.contract-locked-counter` : `max-height/opacity` transition 300ms ease-out, masquÃƒÂ© par dÃƒÂ©faut, affichÃƒÂ© quand "Engagement minimum".
- Grille 2 colonnes desktop (`.contract-form-grid`, 1 colonne < 480px), widgets `contract-stepper` sur tous les montants.

**Modal de suivi d'activation Ã¢â‚¬â€ prÃƒÂ©fixe `contract-modal-*` :**
- Ouverture via bouton "Afficher le suivi" (card Statut), slide-up 250ms cubic-bezier(0.22,1,0.36,1), max-height 70vh, backdrop cliquable
- 6 ÃƒÂ©tapes Bootstrap Icons : adminConnected, fileDownloaded, contractAccepted, launchFeePaid (si requis), monthlyActive (si requis), contractActive
- Ãƒâ€°tats : `contract-step--done` (icÃƒÂ´ne primary + animation `contractPopIn` 300ms), `contract-step--pending` (spinner `contractSpin`), `contract-step--waiting` (icÃƒÂ´ne grisÃƒÂ©e)
- Footer `.contract-modal-footer` : span "DerniÃƒÂ¨re vÃƒÂ©rif. il y a Xs" (mis ÃƒÂ  jour en temps rÃƒÂ©el) + bouton "VÃƒÂ©rifier maintenant" `bi-arrow-clockwise`
- Appel immÃƒÂ©diat ÃƒÂ  `GET /api/contract/check-payment-status` ÃƒÂ  l'ouverture, polling 10s si contrat pending
- ArrÃƒÂªt polling ÃƒÂ  la fermeture du modal

**CSS dÃƒÂ©diÃƒÂ© : `public/css/contractModule.css`** Ã¢â‚¬â€ toutes classes `contract-*`, `s8-*` (prÃƒÂ©servÃƒÂ©es pour admin-login.html), aucune valeur hex hardcodÃƒÂ©e, toutes couleurs via `var(--color-*)` / `var(--theme-*)`.

**Keyframes CSS :** `contractPopIn`, `contractPulse`, `contractActivePulse`, `contractSpin`, `contractDropzonePulse`, `contractFadeIn`, `contractSlideDown`, `contractSlideUp`.

**Slide 8 admin-login.html Ã¢â‚¬â€ Activation finale :**
- RÃƒÂ©capitulatif des paiements effectuÃƒÂ©s avec `bi-check-circle-fill` vert par item.
- Contrat gratuit : ligne "Contrat gratuit". Politique locked : ligne `bi-lock-fill` grisÃƒÂ©e.
- Bouton "Activer le contrat" `bi-rocket-takeoff` Ã¢â€ â€™ ouvre modal de confirmation inline.
- Modal confirmation : "Ãƒâ‚¬ partir de maintenant votre site sera accessible au public" + avertissement locked avec date de fin calculÃƒÂ©e (aujourd'hui + lockedMonths).
- Boutons "Annuler" / "Confirmer" Ã¢â€ â€™ `POST /api/contract/activate` Ã¢â€ â€™ spinner centrÃƒÂ© Ã¢â€ â€™ check vert 4.5rem + "Contrat activÃƒÂ© !" Ã¢â€ â€™ redirect vers `/` (vitrine) aprÃƒÂ¨s 2s.
- `computeResumeSlide` : retourne slide 3 (ou 6 si pas de launch) si `fileDownloadedAt` est prÃƒÂ©sent Ã¢â€ â€™ l'admin ne revoit jamais les slides 1-2 aprÃƒÂ¨s avoir acceptÃƒÂ©.

**Endpoints backend :**
- `GET /api/contract/check-payment-status` (admin + dev) : `syncStripeStatuses` + retourne `{ steps, contractStatus }`
- `POST /api/contract/activate` (admin + dev) : active le contrat, retourne `{ activatedAt, lockedUntil }` (lockedUntil = activatedAt + lockedMonths si politique locked)
- `POST /api/contract/upload-temp` (dev only) : upload fichier temp Ã¢â€ â€™ `{ tempFileId, originalName }`
- `DELETE /api/contract/upload-temp/:id` (dev only) : supprime un fichier temp
- `syncStripeStatuses(contract)` : fonction partagÃƒÂ©e **exportÃƒÂ©e** de `contractController.js`, importÃƒÂ©e par `contractPaymentSyncJob.js`

**Job de sync :**
- `automatisme/contractPaymentSyncJob.js` : `startContractPaymentSyncJob()` / `stopContractPaymentSyncJob()` Ã¢â‚¬â€ vÃƒÂ©rifie toutes les 5 min, s'arrÃƒÂªte si aucun contrat pending, dÃƒÂ©marrÃƒÂ© depuis `app.js` aprÃƒÂ¨s connexion MongoDB.

## Gestion - Mon contrat (module admin, 2026-03-18)

Module admin permettant de consulter le contrat actif et de programmer sa rÃƒÂ©siliation.

**SchÃƒÂ©ma Contract mis ÃƒÂ  jour :**
- `monthlyFee.cancelAtPeriodEnd: Boolean` (default: false) Ã¢â‚¬â€ indique que la rÃƒÂ©siliation est programmÃƒÂ©e en fin de pÃƒÂ©riode Stripe.

**Nouveaux endpoints dans `contractController.js` + `contractRouter.js` :**
- `GET /api/contract/current` (admin + dev) : retourne `{ ok, contract: { status, startDate, launchFee, monthlyFee, cancelAtPeriodEnd } }`.
- `POST /api/contract/cancel` (admin + dev) : deux chemins selon la prÃƒÂ©sence de `stripeSubscriptionId` :
  - **Avec abonnement Stripe** : appelle `subscriptions.update(cancel_at_period_end: true)`, lit `current_period_end` depuis la rÃƒÂ©ponse Stripe et le persiste dans `monthlyFee.currentPeriodEnd` si absent, passe `cancelAtPeriodEnd=true`, sauvegarde. Retourne `{ ok, cancelAtPeriodEnd: true, immediate: false, currentPeriodEnd }`.
  - **Sans abonnement Stripe** : rÃƒÂ©siliation immÃƒÂ©diate Ã¢â‚¬â€ passe `status='cancelled'`, `cancelledAt`, `cancelledBy`, invalide le cache. Retourne `{ ok, cancelAtPeriodEnd: false, immediate: true }`.
  - La transition `status='cancelled'` via Stripe reste dÃƒÂ©lÃƒÂ©guÃƒÂ©e au webhook `customer.subscription.deleted` (chemin abonnement).
- **Frontend `monContratModule.js`** : aprÃƒÂ¨s POST `/cancel`, lit `d.immediate` pour choisir le rendu :
  - `immediate: true` Ã¢â€ â€™ `loadAndRender` direct (badge "AnnulÃƒÂ©")
  - `immediate: false` Ã¢â€ â€™ affiche le bandeau avec `d.currentPeriodEnd` formatÃƒÂ© en fr-FR immÃƒÂ©diatement, puis `loadAndRender` pour synchroniser.
- La transition `status Ã¢â€ â€™ 'cancelled'` reste rÃƒÂ©servÃƒÂ©e au webhook `customer.subscription.deleted` dans `devWebhookController.js`.

**Module frontend :**
- `public/js/modules/monContratModule.js` Ã¢â‚¬â€ export `renderModule(container)`, prÃƒÂ©fixe CSS `mc-*`.
  - Charge `GET /api/contract/current` au rendu.
  - Affiche : statut (badge colorÃƒÂ©), date d'activation, frais de lancement (TTC + statut RÃƒÂ©glÃƒÂ©/En attente), maintenance mensuelle (TTC + statut Active/Inactive + prochain dÃƒÂ©bit ou dernier accÃƒÂ¨s si `cancelAtPeriodEnd`).
  - Bandeau avertissement orange si `cancelAtPeriodEnd = true`.
  - Bouton "RÃƒÂ©silier le contrat" visible uniquement si `status=active` ET `cancelAtPeriodEnd=false`.
  - Modal de confirmation avec texte conditionnel (avec ou sans abonnement mensuel).
  - AprÃƒÂ¨s succÃƒÂ¨s rÃƒÂ©siliation : rechargement des infos, bouton masquÃƒÂ©.
- `public/css/monContratModule.css` Ã¢â‚¬â€ styles dÃƒÂ©diÃƒÂ©s (`mc-*`), chargÃƒÂ© dans `gestion.html`.
- La page doit ÃƒÂªtre crÃƒÂ©ÃƒÂ©e en base (type=gestion, moduleFile=monContrat, allowedRolesGestion=[admin,dev]) via l'interface dev du module contrat.

**RÃƒÂ¨gle de non-rÃƒÂ©gression :**
- `activateContract`, `verifyLaunchPayment`, `verifyMonthlySetup`, `handleSetupIntentSucceeded`, `handlePaymentIntentSucceeded` non modifiÃƒÂ©s.
- `handleSubscriptionDeleted` (devWebhookController) reste le seul endroit qui passe `contract.status = 'cancelled'`.

---

## Page dÃƒÂ©tail article vitrine v2 (2026-03-19)

**Fichiers modifiÃƒÂ©s :**
- `public/js/modules/itemDetailModule.js` Ã¢â‚¬â€ refonte complÃƒÂ¨te de la page produit/formation
- `public/css/app.css` Ã¢â‚¬â€ ajout des classes `idd-*` (layout, prix, ÃƒÂ©toiles, boutons, modal) et `idc-*` (calendrier)

**Nouveaux composants frontend :**

### Layout deux colonnes (Ã¢â€°Â¥ 992px)
- `.idd-hero-layout` Ã¢â‚¬â€ grille CSS 50/50 image|infos
- `.idd-image-col` / `.idd-info-col` Ã¢â‚¬â€ colonnes

### Image produit
- `.idd-image-wrap` Ã¢â‚¬â€ ratio 16:9 fixe (`aspect-ratio: 16/9`, `object-fit: cover`)
- `.idd-zoom-btn` Ã¢â‚¬â€ bouton `bi-eye` overlay bas-droite
- `.idd-image-modal` / `.idd-image-modal__img` Ã¢â‚¬â€ modal plein ÃƒÂ©cran (`position:fixed`, fermable croix + backdrop + Ãƒâ€°chap)

### Bloc prix / badge promo
- `buildPriceBlock(item)` Ã¢â‚¬â€ gÃƒÂ©nÃƒÂ¨re `.idd-price-block` avec `.idd-promo-badge` (animation pulse), `.idd-price-final`, `.idd-price-original` (barrÃƒÂ©)
- `buildStarIcons(rating)` Ã¢â‚¬â€ Bootstrap Icons `bi-star-fill/bi-star-half/bi-star`, couleur `--theme-accent`

### Calendrier des sessions (remplace la modale session)
- `groupSessionsByDate(sessions)` Ã¢â€ â€™ `Map<dateStr, session[]>`
- `buildCalendarMarkup(sessionsByDate, year, month, selectedId, expandedDate)` Ã¢â‚¬â€ grille 7 colonnes
- `buildDaySlotsMarkup(daySessions, dateStr, selectedId)` Ã¢â‚¬â€ crÃƒÂ©neaux d'une journÃƒÂ©e
- `initCalendar(areaEl, sessions, getSelected, onSelect)` Ã¢â‚¬â€ initialisation avec navigation prev/next, clic jour, clic crÃƒÂ©neau
- Classes CSS : `.idc-day--available/selected/past/expanded`, `.idc-slot`, `.idc-slot.is-selected`
- La sÃƒÂ©lection de session met toujours ÃƒÂ  jour `selectedSessionId` dans la closure Ã¢â€ â€™ checkout inchangÃƒÂ©

### Options (grille de cartes)
- `renderOptionsSection()` rÃƒÂ©ÃƒÂ©crite Ã¢â€ â€™ `.idd-options-grid` + `.idd-option-card` (icon, nom, prix)
- Clic carte Ã¢â€ â€™ toggle `.is-selected` (visuel seulement Ã¢â‚¬â€ sÃƒÂ©lection rÃƒÂ©elle pendant le checkout)

### Boutons actions
- `.idd-btn-cart` / `.idd-btn-buy` Ã¢â‚¬â€ `border-radius: 8px` max, hover `translateY(-2px)` + box-shadow
- `.idd-fav-btn` Ã¢â‚¬â€ bouton favoris outline, `bi-suit-heart` Ã¢â€ â€™ `bi-suit-heart-fill` si favori
- `initFavoriteButton()` Ã¢â‚¬â€ charge le statut favori depuis `GET /api/client/favorites`, toggle via POST/DELETE

### Bloc description (refonte 2026-03-20)
- `buildDescriptionBlock(item, itemType)` gÃƒÂ©nÃƒÂ¨re `.idd-about-section` Ã¢â‚¬â€ fond `var(--theme-surface-header)`, `border-radius: 12px`, `border-left: 3px solid var(--theme-accent)`, padding `1.5rem 2rem`
- En-tÃƒÂªte : `bi-file-text` accent + titre "Ãƒâ‚¬ propos de cette formation"
- Corps `.idd-about-section__body` : `p { line-height:1.75 }`, `h2/h3 { color: var(--theme-accent); font-weight:600 }`, `li::marker { color: var(--theme-accent) }`, `strong { font-weight:700 }`
- Contenu HTML (editorial ou texte brut) rendu dans `.idd-about-section__body`

### Avis clients v2
- `buildReviewCardMarkup(review)` Ã¢â‚¬â€ remplace le rendu inline, affiche nom anonymisÃƒÂ© (PrÃƒÂ©nom N.), ÃƒÂ©toiles, date, commentaire
- Animation `idd-review-fade` sur les nouvelles cartes
- `.idd-reviews-summary` Ã¢â‚¬â€ rÃƒÂ©sumÃƒÂ© ÃƒÂ©toiles+note+nombre en tÃƒÂªte de section
- `.idd-btn-more` Ã¢â‚¬â€ bouton "Voir plus d'avis" avec `bi-chevron-down`

**FonctionnalitÃƒÂ©s conservÃƒÂ©es intactes :**
- Panier (`addItem`, fly animation, ÃƒÂ©tat `added/loading/default`)
- Checkout (`requestVitrineNavigation('checkout', ...)`, `selectedSessionId` dans closure)
- Options de session (chargement dynamique via `fetchSessionOptions` aprÃƒÂ¨s sÃƒÂ©lection de session)
- Avis pagination/tri (`hydrateReviewsSection` avec `data-reviews-list`, `data-reviews-load-more`, `data-reviews-sort`)
- VÃƒÂ©rification achat dÃƒÂ©jÃƒÂ  effectuÃƒÂ© (`fetchPurchaseStatus`)
- Notice annulation prÃƒÂ©sentiel (`syncPresentielCancellationNotice`)
- RÃƒÂ©sultat checkout (`consumeCheckoutResult`, `buildPurchaseResultMarkup`)

## SystÃƒÂ¨me Prestations & Praticiennes (2026-04-01)

### ModÃƒÂ¨les

- `models/Service.js` : prestation. Champs : `name`, `slug` (unique), `description`, `shortDescription`, `duration` (min), `price`, `photos[]`, `isActive`, `isBookable`, `paymentType` (full/deposit/free), `depositType`, `depositValue`, `capacity`, `bufferTime`, `promotion { isActive, type, value, startDate, endDate }`, `boost { isActive, order }`, `cancellationDays`, `options[]` (inline schema), `createdBy`, `updatedBy`. Index : `slug` unique, `{ isActive, boost.isActive }`.
- `models/PractitionerProfile.js` : profil praticienne. Champs : `userId` (ref User, unique), `displayName`, `bio`, `photo`, `color`, `slotGranularity` (15/30/45/60), `serviceIds[]`, `isActive`. Index : `userId` unique.
- `models/PractitionerSchedule.js` : planning type hebdomadaire. Champs : `practitionerId` (unique), `weeklySchedule[]` (dayOfWeek, isWorking, slots[]), `lunchBreak`. Index : `practitionerId` unique.
- `models/ScheduleException.js` : exceptions manuelles. Champs : `practitionerId`, `date`, `type` (block/add/modify), `isFullDay`, `startTime`, `endTime`, `reason`. Index : `{ practitionerId, date }`.
- `models/ServiceBooking.js` : `status` enum `pending_payment/confirmed/cancelled/no_show/completed` -> `pending_payment` serves as a reservation before payment, `confirmed` covers finalized orders.
- `models/NoShowRecord.js` : historique no-shows. Champs : `clientId`, `bookingId`, `recordedBy`, `recordedAt`.
- `models/ServiceSettings.js` : rÃƒÂ©glages globaux singleton. Champs : `allowClientChoosePractitioner`, `noShowSystemEnabled`, `noShowSuspensionThreshold`, `reminders[]`.

### Controllers & Routers

- `controllers/serviceController.js` : CRUD prestations + routes vitrine. Exports : `listServices`, `getService`, `createService`, `updateService`, `deleteService` (soft), `uploadServicePhoto`, `deleteServicePhoto`, `patchServiceBoost`, `patchServicePromotion`, `listPublicServices`, `getPublicServiceBySlug`, `listBoostedServices`.
- `controllers/practitionerController.js` : gestion praticiennes auto-portee par les comptes admin. Exports : `listPractitioners`, `getMyPractitionerProfile`, `activateMyPractitionerProfile`, `deactivateMyPractitionerProfile`, `updateMyPractitionerProfile`.
- `routers/serviceRouter.js` : montÃƒÂ© sur `/api/gestion/services`, protÃƒÂ©gÃƒÂ© `requireAuth + requireMode('gestion')`, multer upload `/uploads/services/`.
- `routers/practitionerRouter.js` : montÃƒÂ© sur `/api/gestion/practitioners`, protÃƒÂ©gÃƒÂ© `requireAuth + requireMode('gestion')`.
- `routers/vitrineServiceRouter.js` : montÃƒÂ© sur `/api/vitrine/services`, public. Route `GET /boosted` AVANT `GET /:slug` pour ÃƒÂ©viter conflit.

### Endpoints admin (gestion)

- `GET  /api/gestion/services` Ã¢â‚¬â€ liste toutes les prestations
- `POST /api/gestion/services` Ã¢â‚¬â€ crÃƒÂ©er prestation (slug auto-gÃƒÂ©nÃƒÂ©rÃƒÂ© depuis le nom)
- `GET  /api/gestion/services/:id` Ã¢â‚¬â€ dÃƒÂ©tail prestation
- `PUT  /api/gestion/services/:id` Ã¢â‚¬â€ modifier prestation
- `DELETE /api/gestion/services/:id` Ã¢â‚¬â€ soft delete (isActive: false)
- `POST /api/gestion/services/:id/upload-photo` Ã¢â‚¬â€ upload photo (multer, `/uploads/services/`)
- `DELETE /api/gestion/services/:id/photos/:photoIndex` Ã¢â‚¬â€ supprimer photo par index
- `PATCH /api/gestion/services/:id/boost` Ã¢â‚¬â€ activer/dÃƒÂ©sactiver boost
- `PATCH /api/gestion/services/:id/promotion` Ã¢â‚¬â€ configurer promotion
- `GET  /api/gestion/practitioners` — liste tous les comptes `admin` avec leur profil praticienne associe (si existant)
- `GET  /api/gestion/practitioners/me` — retourne mon profil praticienne (ou `null` si inexistant)
- `POST /api/gestion/practitioners/me/activate` — active mon statut praticienne (creation du profil si necessaire)
- `POST /api/gestion/practitioners/me/deactivate` — desactive mon statut praticienne (`isActive: false`)
- `PUT  /api/gestion/practitioners/me` — met a jour mon profil (nom affiche, bio, intervalle, prestations)

### Endpoints vitrine (publics)

- `GET /api/vitrine/services/boosted` Ã¢â‚¬â€ prestations boostÃƒÂ©es (page d'accueil)
- `GET /api/vitrine/services` Ã¢â‚¬â€ catalogue public (isActive: true)
- `GET /api/vitrine/services/:slug` Ã¢â‚¬â€ fiche prestation + praticiennes associÃƒÂ©es

### Frontend admin

- `public/js/modules/serviceModule.js` + `public/js/modules/serviceManagerModule.js` : `renderModule(container)`. Onglet **Prestations** inchange (cards + modal 5 tabs). Onglet **Praticiennes** refondu avec 2 sous-onglets.
- Sous-onglet **Liste** : lecture seule de tous les comptes admin avec badge `Active/Inactive`, prestations et intervalle.
- Sous-onglet **Mon profil** : activation/desactivation du statut praticienne puis formulaire (nom affiche, bio, **Intervalle entre creneaux** en boutons radio 15/30/45/60, prestations cochees).
- Aucun bouton "Ajouter une praticienne" (logique impossible : un admin = une praticienne potentielle).
- Modal 5 tabs : GÃƒÂ©nÃƒÂ©ral (nom, descriptions, durÃƒÂ©e widget incrÃƒÂ©mental, capacitÃƒÂ©), Tarifs (prix, type paiement boutons, acompte, dÃƒÂ©lai annulation), Options (inline CRUD), Photos (upload + suppression), AvancÃƒÂ© (battement, promotion, boost, toggle actif).
- `public/css/serviceModule.css` : classes prÃƒÂ©fixe `svm-`, mobile first, variables CSS thÃƒÂ¨me.

### Frontend vitrine

- `public/js/modules/servicesModule.js` : catalogue prestations. `renderModule(container)`. Grille responsive `auto-fill minmax(240px, 1fr)`. Skeleton loader. Clic Ã¢â€ â€™ navigation `service-detail?slug=xxx`.
- `public/js/modules/serviceDetailModule.js` : fiche prestation. Galerie photos (miniatures cliquables), section Ãƒâ‚¬ propos (style `idd-about-section`), options disponibles, politique d'annulation, praticienne(s), aside sticky avec prix/durÃƒÂ©e/CTA. Bouton "RÃƒÂ©server" Ã¢â€ â€™ message "bientÃƒÂ´t disponible" inline.
- `public/css/servicesModule.css` : classes prÃƒÂ©fixe `svs-`, skeleton shimmer.
- `public/css/serviceDetailModule.css` : classes prÃƒÂ©fixe `sdd-`, layout 2 colonnes desktop.

### Bloc boostÃƒÂ© page d'accueil

- `homeModule.js` : section "Nos prestations phares" insÃƒÂ©rÃƒÂ©e entre le bloc "Ãƒâ‚¬ la une" et "Nos collections". Charge `GET /api/vitrine/services/boosted`. Cards cliquables Ã¢â€ â€™ `service-detail`. Bouton "Voir toutes nos prestations" Ã¢â€ â€™ `services`. CSS ajoutÃƒÂ© dans `app.css` (.home-service-card, .home-services-grid, .home-services-cta).
- Section masquÃƒÂ©e automatiquement si aucune prestation boostÃƒÂ©e (fonction retourne `''`).

### RÃƒÂ¨gles mÃƒÂ©tier

- Slug : auto-gÃƒÂ©nÃƒÂ©rÃƒÂ© depuis le nom (slugify), suffixe `-N` en cas de collision.
- Soft delete : `DELETE` met `isActive: false`, ne supprime pas le document.
- Prix effectif : calculÃƒÂ© ÃƒÂ  la volÃƒÂ©e en tenant compte de la promotion (dates incluses).
- `GET /boosted` montÃƒÂ© AVANT `GET /:slug` dans le router vitrine (ÃƒÂ©vite que "boosted" soit interprÃƒÂ©tÃƒÂ© comme slug).
- Upload photos : rÃƒÂ©pertoire `uploads/services/`, max 5 Mo, mimetypes image/* validÃƒÂ©s.
- RÃƒÂ©servation en ligne : bouton prÃƒÂ©sent en vitrine mais renvoie un message "bientÃƒÂ´t disponible" Ã¢â‚¬â€ le systÃƒÂ¨me de rÃƒÂ©servation complet est prÃƒÂ©vu dans le Prompt 3.

## Systeme de reservation de prestations (Prompt 3 — 2026-04-02)

### Vue d'ensemble

Le systeme de reservation permet aux clients connectes de reserver des creneaux de prestation depuis la vitrine, avec paiement Stripe ou sans paiement (prestation gratuite). La source de verite du paiement reste le webhook `payment_intent.succeeded`.

### Modeles modifies

- `models/Sale.js` : enum `saleItem.type` etendu avec `'service'` et `'service-option'`.
- `models/Service.js` : champs ajoutes :
  - `bookingLeadDays: Number (default: 0)` — delai minimum avant reservation.
  - `allowClientChoosePractitioner: Boolean (default: true)` — expose le choix de praticienne.
- `models/ServiceBooking.js` : champ `saleId: String (default: null)` — lien vers la vente apres paiement.
- `models/RefundRequest.js` : enum `itemType` etendu avec `'service'`.

### Backend — Disponibilites (publiques, sans auth)

- `controllers/availabilityController.js` :
  - `getAvailableSlots` — `GET /api/vitrine/availability/slots?serviceId=&date=&practitionerId=` : creneaux disponibles pour une prestation un jour donne (PractitionerSchedule + ScheduleException + bookings existants + duree).
  - `getAvailableDays` — `GET /api/vitrine/availability/days?serviceId=&month=&year=` : jours ayant au moins un creneau disponible dans le mois, en tenant compte de `bookingLeadDays`.
- `routers/vitrineServiceRouter.js` : export supplementaire `vitrineAvailabilityRouter`.
- `app.js` : `app.use('/api/vitrine/availability', vitrineAvailabilityRouter)`.

### Backend — CRUD reservations client

- `controllers/serviceBookingController.js` :
  - `listMyBookings` — `GET /api/client/bookings` : reservations du client.
  - `getBookingStatus` — `GET /api/client/bookings/:bookingId/status` : retourne `{ status, paymentStatus }`.
  - `getBookingByPaymentIntent` — `GET /api/client/bookings/by-payment-intent/:paymentIntentId` : retrouve un booking par PaymentIntent Stripe. Route declaree AVANT `/:bookingId/status` dans Express. Utilise pour le polling post-paiement (12 tentatives x 1.5s = 18s max).
  - `cancelMyBooking` — `POST /api/client/bookings/:bookingId/cancel` : annulation avant prestation, retourne `{ eligibleRefund }`.
- `models/ServiceBooking.js` : `status` enum `confirmed/cancelled/no_show/completed` — cree directement en `confirmed` via webhook (plus de `pending_payment`).
- `routers/clientRouter.js` : routes booking `requireAuth()`.

### Backend — Dispatch checkout service

- `controllers/clientController.js` : detection `normalizedItemType === 'service'` → `processServiceCheckoutStatePurchase` — cree ServiceBooking + Sale depuis `checkoutState.service` (serviceId, slotStart, slotEnd, practitionerId, selectedOptions). Calcul prix depuis DB (promo incluse). Pas de bookingId preexistant. `saleItems[].finalPrice` = prix unitaire complet (pas l'acompte). Mode acompte : `sale.totalAmount = depositAmount`. Mode full : `sale.totalAmount = totalPrice`. Cartes cadeaux via `planGiftCardUsage` (base = depositAmount si deposit) + `giftCardSettlement`.
- `services/stripeInvoiceService.js` : pour les ventes service en mode acompte, applique un `depositRatio = sale.totalAmount / serviceBooking.totalPrice` sur chaque ligne de facture. Items stockes au prix unitaire, ratio applique uniquement dans la facture Stripe — la Sale conserve les prix de catalogue.
- `controllers/stripeController.js` : validation `checkoutState.service.serviceId/slotStart/slotEnd` + CGV pour `itemType === 'service'`. Montant PaymentIntent = `checkoutState.totals.amountToPay` (acompte ou total, net cartes cadeaux).

### Backend — Eligibilite remboursement et emails

- `services/refundService.js` : `getServiceRefundEligibility({ sale, booking, now })` — retractation 14j ou politique `cancellationDays`.
- `services/mailService.js` : `sendBookingConfirmedEmail` et `sendBookingCancelledEmail` via `sendPremiumHtmlEmail` (Brevo).

### Frontend vitrine — Modal de reservation et checkout service

- `public/js/modules/serviceDetailModule.js` : bouton "Reserver" ouvre modal calendrier (2 etapes : calendrier + creneaux). Clic "Continuer" → navigation `checkout?serviceSlug=&slotStart=&slotEnd=&practitionerId=`. Pas de creation de booking ici.
- `public/css/serviceBookingModule.css` : CSS prefixe `sbm-*`, animations.
- `public/js/modules/checkoutModule.js` : detecte `query.serviceSlug` → mode service (`runServiceCheckout`). Affiche recap créneau, options, cartes cadeaux, CGV + renonciation. Build `checkoutState` avec `.service = { serviceId, slotStart, slotEnd, practitionerId, selectedOptions }`, `.paymentType`, `.depositAmount`, `.totals = { subtotal, giftCardUsed, depositAmount, amountToPay, remainingOnSite, totalAmount }`. Navigue vers `payment` (amountToPay > 0) ou `finalizePurchase` (gratuit). Mode acompte : masque le prix total, affiche "Acompte à régler maintenant : X €", carte cadeau plafonnée à `depositAmount` via `svcMaxGift` (base = `depositAmount` si deposit, `subtotal` si full). `syncGiftPreview` utilise `state.totals.amountToPay` (pas `remainingToPay`). "Total dû maintenant : Y €", note info `data-svc-deposit-info` "Il restera Z € à régler sur place". Bouton "Payer X €" = amountToPay.
- **Header recap prestation + bouton "Modifier" (2026-04-04)** : bloc `checkoutp-focus` remplacé par `.checkoutp-service-header` (flex, card arrondie). Contient `.checkoutp-service-header__info` (nom h2 + meta date/heure avec `[data-svc-slot-date]` / `[data-svc-slot-time]`) et `.checkoutp-service-header__modify` (bouton `data-svc-modify-slot`, outline accent, hover fond accent). Responsive : flex-column sous 480px. `slotStart`/`slotEnd`/`practitionerId` migres dans `state` (mutables). Clic → `openServiceSlotCalendarModal(container, state, service, onUpdated)` : modal `.checkout-session-calendar-modal` appende au `document.body`, calendrier `createBookingCalendar({ mode: 'service' })` monté dans `.checkout-session-calendar-modal__body`, bouton "Confirmer ce créneau" activé apres sélection. Confirmation : met à jour `state.slotStart/slotEnd/practitionerId`, recalcule waivers via `computeServiceWaiver`, reset `state.waiverAccepted` si type waiver change, puis callback `onUpdated`. Fonctions helper : `computeServiceWaiver(slotStart, service)`, `buildSlotLabels(slotStart, slotEnd)`, `syncServiceSlotDisplay(container, state)`, `syncServiceWaiverUI(container, state)`. Waiver section toujours rendue (`data-svc-waiver-section` avec `hidden` si non requise). `checkoutState.service.slotStart/slotEnd/practitionerId` lus depuis `state` au proceed.

### Frontend vitrine — Mes prestations

- `public/js/modules/myServicesModule.js` : liste reservations client groupees "A venir" / "Historique". Annulation avec confirm modal.
- `public/css/myServicesModule.css` : prefixe `msm-*`.
- `public/js/modules/paymentSimulationModule.js` : branche service vs formation. Services : `redirect: if_required`, resultat inline. Formations : flow redirect Stripe existant.

### Frontend gestion

- `public/js/modules/salesModule.js` : badge "Prestation" (`sales-pill--type-service`), filtre tabs par type. Section prestation dans le modal : items `type === 'service'` + `'service-option'`. Si `totalAmount < sum(serviceItems.finalPrice)` → affiche "Acompte encaissé / Reste dû sur place / Total prestation". `paymentSimulationModule.js` : polling post-paiement service via `GET /api/client/bookings/by-payment-intent/:paymentIntentId` (12 tentatives x 1.5s), timeout → etat `pending` (pas echec).
- `public/css/app.css` : `.sales-pill--type-service` (rose), `.sales-type-filters` / `.sales-type-filter`.
- `public/js/modules/serviceManagerModule.js` : stepper `bookingLeadDays` dans onglet "Avance".

### Algorithme creneaux

Pour date D, service duree `D_min`, granularite `G_min` :
1. Recuperer PractitionerSchedule pour chaque praticienne du service.
2. Extraire plages horaires du jour de semaine, appliquer ScheduleException.
3. Decouper en slots de G_min, verifier que `slot + D_min` reste dans la plage.
4. Filtrer slots occupes par ServiceBooking existants (status != cancelled) avec overlap.
5. Appliquer bookingLeadDays : exclure jours < today + X.
6. Filtrer les creneaux deja passes : `new Date(\`${dateStr}T${slotStart}:00\`) <= now` → skip. Applique dans `computeSlotsForPractitioner`, couvre aussi `getAvailableDays` (un jour n'est disponible que s'il a au moins un creneau futur).

### Correctifs 2026-04-03
- `serviceController.updateService` : `bookingLeadDays` et `allowClientChoosePractitioner` ajoutés au destructuring et à la mise à jour — ces champs n'étaient pas sauvegardés en base.
- `computeSlotsForPractitioner` : filtre les créneaux dont `slotStartDateTime <= now` (heure locale serveur). Impact : `getAvailableDays` exclut automatiquement les jours n'ayant plus que des créneaux passés.
- Correctif 3 (sessions formation bloquent créneaux praticienne) : implémenté 2026-04-03. `FormationSession` enrichi du champ `instructorId` (ref User, default null). Peuplé à la création/mise à jour de session (`req.sessionUser._id`). `computeSlotsForPractitioner` récupère les sessions de formation du jour via `instructorId = profile.userId` et les passe à `isSlotOccupied` comme `formationOccupancies[]`. `isSlotOccupied` accepte désormais un 5e paramètre optionnel `formationOccupancies = []`. Bug timezone corrigé (2026-04-03) : `startDate` stocké en UTC (22h = minuit Paris) → comparaison via `localDateStr(date)` en heure locale au lieu de timestamps UTC. `localDateStr` ajoutée comme helper dans `availabilityController.js`.
- `buildSessionPayload(doc, { instructorName, isCurrentUserInstructor })` : 2e paramètre optionnel. Retourne `instructorId`, `instructorName`, `isCurrentUserInstructor`. `listSessions` batch-résout les noms (PractitionerProfile.displayName > User.firstName+lastName > email) et retourne `currentUserId` dans la réponse. `createSession` / `updateSession` résolvent le nom instructeur inline.
- `formationManagerModule.js` : `state.sessionListFilter` ('mine'|'all') + `state.currentUserId`. `renderSessionList` : sélecteur "Mes sessions / Toutes" + cards refondues (badge statut, instructeur, participants). Kebab limité pour sessions autres instructeurs (vue participants seule). `renderSessionDetailModal` : ligne instructeur + badge ownership + notice readonly + champs/boutons désactivés pour autres instructeurs. "Voir les participants" → `openPlanningSessionDetail(sessionId)`. Kebab : icônes seules + `title` tooltip, pas de texte visible.

### Regles metier

- `ServiceBooking.status = 'confirmed'` uniquement apres webhook Stripe ou immediatement si gratuit.
- `saleId` sur ServiceBooking est null jusqu'au traitement webhook.
- Sale prestation : `items[].type = 'service'` ou `'service-option'`.
- `getServiceRefundEligibility` appele a l'annulation client et dans `getBookingDetail`. `eligibleRefund` est la source de verite — `waiverSigned` n'affecte que `legalEligible`, pas `institutEligible`. Un client peut etre remboursable via la politique institut meme avec une renonciation signee.
- `planningModule.js` `buildBookingModalBody` : badge remboursement conditionne par `elig.eligibleRefund` en premier, puis `elig.waiverSigned` pour le libelle non-remboursable.
- `checkoutModule.js` `buildServiceCheckoutMarkup` : quand `waiverType === 'legal'` (retractation legale sans delai institut), affiche une note informative "Vous conservez la possibilite d'annuler gratuitement jusqu'a N jours" apres la checkbox.
- `app.css` : classe `.checkout-waiver-legal-note` — fond violet subtil, icone info.

## Planning FullCalendar — Correctifs 2026-04-02

### Correctifs vérifiés déjà implémentés (aucune modification)

- **C1 — Bouton "Modifier" adaptatif** : `updateEditViewBtn()` est appelé dans `datesSet` ET `viewDidMount`. Le label change dynamiquement selon la vue (Jour/Semaine/Mois). Aucune modification requise.
- **C2 — Dropdown time picker en position fixed** : `attachTimePickerEvents` appende le dropdown au `document.body` en `position:fixed` pour éviter tout clipping. Aucune modification requise.
- **C3 — Anti-chevauchement à l'ouverture** : `revalidateDay(dayRow)` est appelé avant l'ouverture du dropdown pour pré-calculer les `disabledSlots`. Aucune modification requise.
- **C5 — Guards roles** : `requireDev` reste inclusif (`dev` + `admin`) pour le périmètre gestion classique, tandis que `requireStrictDev` est maintenant strictement `dev`-only. Aucune modification requise sur le planning.

### Correctif 4 — Modal "Voir les détails" formation

- `controllers/availabilityController.js` : `extendedProps` des événements formation enrichis avec `formationId`, `formationName`, `sessionStatus`.
- `public/js/modules/planningModule.js` :
  - `state.currentFormationDetail` : tracking `{ sessionId, formationId, reservedCount, sessionStart, sessionStatus }`.
  - `buildHtml()` : deux nouveaux modals ajoutés — `[data-plm-modal="formation-detail"]` et `[data-plm-modal="cancel-confirm"]`.
  - `handleEventClick` type `formation` : ouvre directement `openFormationDetailModal()` (plus de ctx menu intermédiaire).
  - `buildParticipantSkeleton()` : 3 lignes skeleton pendant le chargement.
  - `buildParticipantCard(p, sessionStart)` : carte participant avec nom, email, date réservation, options, badge Annulé, éligibilité remboursement.
  - `openFormationDetailModal(sessionId, formationId, formationName, sessionStatus, eventStartStr)` : charge `GET /api/gestion/planning/:sessionId`, affiche participants. Bouton "Annuler la session" visible uniquement si `sessionStart > now` ET `status !== cancelled`.
  - `handleCancelSession()` : ferme modal détail, ouvre modal confirmation avec nombre de clients.
  - `confirmCancelSession()` : appelle `DELETE /api/gestion/formations/:formationId/sessions/:sessionId`, toast + `calendar.refetchEvents()`.
  - `bindToolbar()` : listeners sur `[data-plm-cancel-session]` et `[data-plm-confirm-cancel-session]`.

### Correctif 5 — Annulation session depuis le planning

- Guard `requireDev` déjà inclusif (dev + admin) ; `requireStrictDev` strict dev-only. Aucune modification backend.
- Flow annulation : modal confirmation → `DELETE /api/gestion/formations/:formationId/sessions/:sessionId` → controller existant `deleteSession` gère tout (status + emails clients).

### CSS ajoutés (`public/css/planningModule.css`)

- `.plm-fdet-header-info` / `.plm-fdet-meta` — header modal formation.
- `.plm-btn-danger` — bouton danger (fond `--color-danger`, hover opacity).
- `.plm-fdet-participant`, `--cancelled`, `__header`, `__name`, `__email`, `__joined`, `__refund` — cartes participants.
- `.plm-fdet-options`, `.plm-fdet-option` — liste options.
- `.plm-fdet-badge`, `--cancelled` — badge statut.
- `.plm-fdet-skeleton`, `__line`, `--wide`, `--narrow` — skeleton avec animation `plm-shimmer`.
- `.plm-fdet-confirm-msg` — texte modal confirmation.

## Planning FullCalendar — Correctifs bugfix 2026-04-02

### Correctif 1 — Route 404 participants

- `controllers/planningController.js` : nouvelle fonction exportée `getSessionAttendees(req, res)` — charge participants sans bloquer sur le statut de la session (contrairement à `getPlanningSessionDetail` qui retournait 404 pour les sessions annulées).
- `routers/planningRouter.js` : nouvelle route `GET /sessions/:sessionId/attendees` → `getSessionAttendees`. Montée sur `/api/gestion` → URL finale `GET /api/gestion/sessions/:sessionId/attendees`.
- `public/js/modules/planningModule.js` `openFormationDetailModal()` : URL corrigée de `/api/gestion/planning/${sessionId}` vers `/api/gestion/sessions/${sessionId}/attendees`.

### Correctif 2 — Bouton "Annuler la session" visible sur sessions passées

- `public/js/modules/planningModule.js` `openFormationDetailModal()` : visibilité du footer calculée immédiatement depuis `eventStartStr` et `sessionStatus` (params de l'événement FullCalendar, disponibles avant l'appel API). Règle : `footer.hidden = (eventStartStr <= now) || (sessionStatus === 'canceled_by_institute' || 'canceled')`. Plus de dépendance à `session.startDate` de l'API.

### Correctif 3 — Pré-chargement modal jour/semaine ignore les exceptions block

- `public/js/modules/planningModule.js` `openDayModal()` : `dayExc` cherche maintenant toute exception (type `modify` OU `block`), pas uniquement `modify`. Priorité : `block+isFullDay` → isOn=false, `modify` → isOn=true+slots exception, sinon → planning type.
- `public/js/modules/planningModule.js` `openWeekModal()` : même correction. `excsWithOverride` remplace `modifyExcs` pour le message d'avertissement (compte aussi les blocks journée entière). Pour chaque jour : cherche toute exception, gère `block+isFullDay` et `modify` en priorité sur le planning type.

## Planning FullCalendar - Bugfix 2026-04-02 (footer display fix)

### C1 - Bouton "Annuler la session" visible sur sessions passees
- **Root cause** : `.plm-modal__footer { display: flex }` a la meme specificite que `[hidden] { display: none }`. La regle CSS du fichier gagne car elle apparait apres la feuille de style du navigateur. Resultat : `footer.hidden = true` est ignore.
- **Fix** : utiliser `footer.style.display = 'none'` (style inline > regle de classe). HTML initial change de `hidden` a `style="display:none"`.
- **Comparaison isPast** : `<=` remplace par `<` (strict) — une session qui debute exactement maintenant n'est pas encore passee.
- **Log temporaire** : `[DEBUG session] start/now/isPast` dans `handleEventClick` pour diagnostiquer.
- **Info.event.start** : objet Date natif FullCalendar v6 (fiable, pas de parsing ISO ambigu).

### C2 - Reinitialiser dans les modals jour/semaine
- **Modal jour** : apres DELETE exception, `closeModal` + `await openDayModal(date)` (reload complet avec planning type frais) + `refetchEvents` + `loadBusinessHours`.
- **Modal semaine** : apres DELETE exception, fetch frais `SCHEDULE_API` pour recuperer le planning type a jour (evite le closure stale sur `weekSchedule`), puis mise a jour du row en place (toggle + slots + suppression badge).

## Planning FullCalendar - Diagnostic + correctifs 2026-04-02 (v7)

### C1 - isPast robustesse (getTime)
- `getTime()` utilise pour la comparaison afin d'eviter toute ambiguïte de coercion Date :
  `sessionStartMs = eventStartStr instanceof Date ? eventStartStr.getTime() : new Date(eventStartStr).getTime()`
  `isPast = sessionStartMs <= 0 || sessionStartMs < Date.now()`
- Log diagnostique : `[DEBUG isPast]` avec eventStart, eventStartType, now, isPast

### C2 - Legende corrigee
- Legende : Disponible / Indisponible / Bloque / Formation (dans cet ordre)
- `.plm-legend-dot--unavailable` : hachures diagonales identiques a `.plm-calendar .fc-non-business`
- `.plm-legend-dot--blocked` : rgba(30,30,30,0.75) correspond aux vrais events Bloque (était rgba(0,0,0,0.08) incorrect)
- `availabilityController.js` : title des events block passe de "Indisponible" a "Bloque"

### C3 - Dropdown time picker z-index
- `.plm-tp-dropdown-floating` passe de z-index:9999 a z-index:99999 !important
- Inline style JS passe de '9999' a '99999'
- Le dropdown est deja appende a document.body (confirme) — pas de clipping overflow
- Modal overlay custom a z-index:1000, donc 99999 garantit la visibilite dans tous les contextes de empilement

## Planning FullCalendar - Correctif timezone 2026-04-02 (v8)

### Bug toISOString — décalage d'un jour en timezone positive
- `date.toISOString().slice(0, 10)` retourne la date en UTC. En UTC+2, lundi 00:00 local = dimanche 22:00 UTC → dateStr = dimanche.
- Conséquence : exceptions non retrouvées (dateStr UTC ≠ date stockée en local), fromStr/toStr de l'API query décalés, saveBtn.dataset.editDate incorrect.

### Correctif
- Fonction utilitaire `localDateStr(date)` ajoutée après la constante DAYS :
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
- 5 occurrences remplacées dans openDayModal et openWeekModal.
- Logs debug temporaires supprimés ([DEBUG isPast], [DEBUG week day]).

## Planning FullCalendar - Correctif badge Modifié 2026-04-02 (v9)

### Bug : badge "Modifié" affiché même sans modification réelle
- Condition précédente : `dayExc?._id` — s'affichait dès qu'une exception existait en base.
- Un save de planning type crée une exception en base avec les mêmes valeurs → badge parasite.

### Correctif : comparaison sémantique
- `isSameSlots(slotsA, slotsB)` : compare deux tableaux `{startTime, endTime}` élément par élément.
- `isDayReallyModified(exception, typeDaySchedule)` :
  - `block + isFullDay` → modifié seulement si le planning type prévoyait `isWorking: true`
  - `modify` → modifié si `!typeDaySchedule.isWorking` OU si les slots diffèrent
- 3 sites mis à jour : `modifiedBar` (openDayModal), `weekDayModifiedBar` (openWeekModal forEach), `excsWithOverride` (compteur du message d'avertissement).


## Gestion Admin — Reservations de prestations (2026-04-02)

### Affichage dans FullCalendar
- availabilityController.getCalendarEvents : ajoute les ServiceBooking (status confirmed/completed/no_show) comme events FullCalendar si practitionerId filtre
- Events type=booking : classe plm-event-booking + plm-event-booking--{status}
- fetchEvents frontend : colore les bookings (violet=confirmed, vert=completed, rouge=no_show)
- Legende mise a jour : item Reservation ajoute

### Modal detail reservation (pbm-*)
- Ouverture au clic sur un event booking dans FullCalendar
- Sections : header (nom prestation + date + badge statut), client, options, paiement, eligibilite remboursement
- Footer contextuel selon statut+date : [Annuler] / [Marquer No-show][Marquer Completee] / vide
- Modals de confirmation imbriques : noshow-confirm, booking-cancel-confirm
- CSS prefixe pbm- dans planningModule.css

### Endpoints gestion bookings
- GET /api/gestion/bookings/:bookingId/detail — detail + refundEligibility
- POST /api/gestion/bookings/:bookingId/no-show — marque no_show, cree NoShowRecord, verifie seuil suspension User.bookingSuspended
- POST /api/gestion/bookings/:bookingId/complete — marque completed
- POST /api/gestion/bookings/:bookingId/cancel — annule, cree RefundRequest si eligible
- POST /api/gestion/bookings/simulate-reminders — body { date: 'YYYY-MM-DD' } optionnel (defaut: aujourd'hui). Envoie sendBookingReminderEmail a toutes les reservations confirmed du jour entier (dayStart/dayEnd UTC). NE met PAS a jour remindersSent (simulation uniquement). Retourne { ok, date, total, sent, failed }.
- Router : routers/gestionBookingRouter.js monte sur /api/gestion

### Rappels email automatiques
- automatisme/bookingRemindersJob.js : runBookingRemindersJob() — itere sur ServiceSettings.reminders actifs, fenetre 30min, anti-doublon via remindersSent[] sur ServiceBooking
- mailService.sendBookingReminderEmail ajoutee
- app.js : setInterval toutes les 1h + run immediat au demarrage
- Bouton "Simuler les rappels" dans toolbar planning : ouvre mini modal plm-remind-date avec date picker natif (defaut = aujourd'hui). Confirmer -> POST avec { date } -> toast info/success/warning selon total/sent/failed.

### ServiceSettings endpoints
- GET /api/gestion/service-settings — retourne ou cree defaults
- PUT /api/gestion/service-settings — upsert
- Router : routers/serviceSettingsRouter.js monte sur /api/gestion/service-settings

### Onglet Parametres dans serviceManagerModule
- 3e onglet "Parametres" dans serviceManagerModule.js
- Sections : Systeme No-show (toggle activer + stepper seuil 1-10), Rappels automatiques (liste + form inline ajout + toggle actif/inactif + suppression), Reservations (toggle choix praticienne)
- Stepper threshold : `svm-stepper` avec `data-svm-stepper="minus/plus"`, mise a jour in-place sans re-render. Grise quand no-show desactive (`svm-settings-row--disabled`).
- Form ajout rappel : `#svm-add-reminder-form` masque/demasque, confirmation avec `#svm-add-reminder-confirm`, saisie heures.
- CSS ajoute dans serviceManagerModule.css : svm-btn-primary, svm-stepper/svm-stepper__btn/svm-stepper__val, svm-settings-row--disabled, svm-settings-sublabel, svm-reminder-row__label, svm-add-reminder-form, svm-btn--sm

### Modeles modifies
- models/user.js : bookingSuspended: { type: Boolean, default: false } ajoute
- models/NoShowRecord.js : existait deja
- models/ServiceSettings.js : existait deja


## Suspension compte et verif statut booking (2026-04-02)

### Suspension check dans createBooking
- createBooking (serviceBookingController.js) verifie desormais User.bookingSuspended avant toute validation.
- Si bookingSuspended === true : retourne 403 avec code: 'BOOKING_SUSPENDED' et message explicite.
- La verification se fait via User.findById(userId).select('bookingSuspended').lean() apres extraction de l userId de session.

### Nouvel endpoint GET /api/client/me/booking-status
- Exporte getMyBookingStatus depuis serviceBookingController.js.
- Route ajoutee dans clientRouter.js : GET /api/client/me/booking-status (requireAuth).
- Positionne AVANT les routes parametriques /bookings/* pour eviter les conflits de routage.
- Retourne { ok: true, bookingSuspended: Boolean }. Si userId absent de la session, retourne bookingSuspended: false sans erreur.

### Banniere suspension dans serviceDetailModule
- Apres le rendu initial du bouton "Reserver ce soin", si context.user est defini (utilisateur connecte) :
  - Appel GET /api/client/me/booking-status.
  - Si bookingSuspended: true : bouton desactive (disabled + opacity 0.5 + cursor not-allowed), banniere .idd-suspension-banner inseree apres le bouton.
- Si utilisateur non connecte : aucune modification.
- La verification est silencieuse (catch vide) — non bloquante pour le rendu.
- CSS ajoute dans serviceDetailModule.css : .idd-suspension-banner et ses selecteurs enfants.
- Couleurs : fond rgba(251, 146, 60, 0.12), bordure rgba(251, 146, 60, 0.35), texte #92400e, icone #f97316.

### Rappel email booking ameliore (sendBookingReminderEmail)
- timeLabel : "demain" si hoursAhead === 24, "dans X jours" si >= 48, "dans X heure(s)" sinon.
- detailItems enrichis avec ligne "Praticienne" si booking.practitionerId.displayName existe.
- bookingRemindersJob.js : ajout .populate('practitionerId', 'displayName').
- Aucun changement de la chaine d'envoi — deja HTML direct via buildPremiumMailTemplate + sendPremiumHtmlEmail.

### Templates email booking editables MongoDB (2026-04-03)
- booking_reminder et booking_confirmed sont desormais des templates editables dans MongoDB (TEMPLATE_FUNCTIONS).
- Premier envoi : ensureTemplate cree automatiquement le document EmailTemplate en base (via loadTemplate).
- L editeur mail admin peut desormais personnaliser le sujet, le corps HTML et le contenu de ces deux templates.
- sendBookingReminderEmail : utilise loadTemplate('booking_reminder') + replaceTemplateVariables + postToBrevo (meme chaine que sendSaleEmail). Signature : { booking, hoursAhead }.
- sendBookingConfirmedEmail : utilise loadTemplate('booking_confirmed') + replaceTemplateVariables + postToBrevo. Signature simplifiee : { booking } (clientId/serviceId/practitionerId doivent etre populated).
- Variables injectees : firstname, lastname, sitename, servicename, bookingdate, bookingtime, bookingdatetime, practitionername, cancellationdays, timelabel, bookingid, paymenttype, depositamount, remainingamount + variables theme mail.

### Flow annulation client prestation (2026-04-03)
- GET /api/client/bookings/:bookingId/refund-eligibility (requireAuth) : calcule l eligibilite au remboursement AVANT annulation. Retourne eligibleRefund, reason, waiverSigned, refundAmount, daysBeforeService, cancellationDays. Utilise getServiceRefundEligibility({ sale, booking, now }).
- cancelMyBooking : desormais populate serviceId/practitionerId/clientId sur le booking, appelle getServiceRefundEligibility, cree un RefundRequest si eligible (via buildRefundId), declenche triggerRefundExecution, envoie sendBookingCancelledEmail({ booking, eligibleRefund, refundAmount, refundRequest }).
- sendBookingCancelledEmail : refonte complete — utilise loadTemplate('booking_cancelled_client') + replaceTemplateVariables. Signature : { booking, eligibleRefund, refundAmount, refundRequest }.
- sendBookingCancelledByAdminEmail : nouvelle fonction — template booking_cancelled_admin. Signature : { booking, eligibleRefund, refundAmount, refundRequest, refundReason }.
- sendNoShowEmail : nouvelle fonction — template booking_no_show. Signature : { booking } (clientId/serviceId populated).
- sendBookingSuspendedEmail : nouvelle fonction — template booking_suspended. Signature : { toEmail, firstName, noShowCount, suspensionThreshold, instituteName }.
- Templates editables MongoDB : booking_cancelled_client, booking_cancelled_admin, booking_no_show, booking_suspended.
- VARIABLE_KEYS ajoutees : eligiblerefund, noshowcount, suspensionthreshold, refundreason (refundamount existait deja).
- myServicesModule.js handleCancel : fetch /refund-eligibility avant confirmation, modal avec skeleton loading, affichage eligibilite (vert si remboursable, rouge sinon), bouton confirmation desactive pendant fetch, toast avec montant si remboursement.

### Correctifs annulation prestation (2026-04-03)
- sale.totalAmount stocke en euros (Number, ex: 27.00) — PAS en centimes. formatAmount() formate la valeur telle quelle.
- Bug corrige : formatAmount(refundAmount * 100) remplace par formatAmount(refundAmount) dans sendBookingCancelledEmail et sendBookingCancelledByAdminEmail.
- sendBookingCancelledEmail : section remboursement conditionnelle via variable refundsection — affiche le montant si eligibleRefund && refundAmount > 0, message generique si eligibleRefund seul, sinon 'Cette annulation ne donne pas lieu a un remboursement.'. Template booking_cancelled_client : paragraphe {{eligibleRefund}} remplace par {{refundSection}}.
- sendBookingCancelledNotifyAdminEmail : nouvelle fonction — notifie l'institut (INSTITUTE_EMAIL || MAIL_FROM) a chaque annulation client. Template : booking_cancelled_notify_admin (nouveau). Variables : customername, servicename, bookingdate, bookingtime, refundsection, refundamount, sitename.
- cancelMyBooking : appelle sendBookingCancelledNotifyAdminEmail apres l'email client (erreur silencieuse). refundAmount transmis en euros dans res.json et les deux emails.
- VARIABLE_KEYS : ajout de 'refundsection'.

### Correctifs emails prestation — remboursement et annulation (2026-04-03)
- refund_confirmed : template mis a jour — utilise desormais {{itemDetail}} a la place de {{formationTitle}}. Fonctionne pour formations ET prestations.
  - sendRefundConfirmedEmail : signature etendue avec itemDetail, isService, serviceName, bookingDate, bookingTime.
  - refundExecutionService.js : sendRefundConfirmedEmailInternal detecte itemType === 'service', fait un ServiceBooking.findOne({ saleId }) + populate('serviceId') pour construire itemDetail = "Nom prestation — date a heure". Pour les formations, itemDetail = meta.formationTitle.
  - ServiceBooking import ajoute dans refundExecutionService.js.
- booking_cancelled_client : bloc remboursement toujours present (temoigne du statut eligible ou non).
  - sendBookingCancelledEmail : signature etendue avec waiverSigned. refundSection construit conditionnellement : eligible + montant -> texte avec montant et lien suivi, eligible sans montant -> message generique, non eligible -> raison claire (waiverSigned ou delai depasse).
  - Template booking_cancelled_client : callout "Suivi" supprime (lien suivi desormais integre dans le paragraphe refundSection si eligible).
- cancelMyBooking : waiverSigned: eligibility.waiverSigned passe a sendBookingCancelledEmail.
- Debug admin email : logs console '[DEBUG cancelMyBooking] sending admin notif to:' + adminTarget et '[DEBUG cancelMyBooking] admin notif result:' + result avant/apres sendBookingCancelledNotifyAdminEmail.
- buildCommonMailVars : accepte desormais itemDetail, serviceName, bookingDate, bookingTime — retourne itemdetail, servicename, bookingdate, bookingtime.
- VARIABLE_KEYS : ajout de 'itemdetail'.

### Correctifs emails prestation — praticienne et refundSection HTML (2026-04-03)
- sendBookingCancelledNotifyAdminEmail : envoi a la praticienne de la reservation uniquement (plus a tous les admins). Lookup PractitionerProfile.findById(booking.practitionerId).populate('userId', 'email firstName lastName') pour obtenir l email. Si email introuvable, retourne false silencieusement.
- sendBookingCancelledNotifyAdminEmail : client popule depuis User.findById(booking.clientId) pour avoir nom + email exacts (evite "Client inconnu" quand booking.clientId est un ObjectId non peuple). Variables clientemail et customername passees dans le template.
- sendBookingCancelledEmail : refundSection remplace par un bloc HTML inline conditionnel — fond vert (#f0fdf4) si eligible au remboursement, fond rouge (#fef2f2) si non eligible. Raison explicite (waiverSigned ou delai depasse). replaceTemplateVariables ne sanitise pas HTML — la valeur est injectee telle quelle dans le template.
- refundExecutionService.js : logs debug [DEBUG refund_confirmed] ajoutes dans sendRefundConfirmedEmailInternal avant sendRefundConfirmedEmail — diagnostiquent itemType, saleId, bookingFound, servicePopulated, itemDetail. Marques TODO: remove after debug.

### Split templates annulation client + remboursement prestation (2026-04-03)
- 3 templates annulation client distincts remplacent le template generique booking_cancelled_client :
  - booking_cancelled_refundable : sujet "Annulation confirmee — Remboursement de {{refundAmount}} en cours". Bloc vert avec montant + lien suivi via {{trackingUrl}}.
  - booking_cancelled_not_refundable_delay : sujet "Annulation confirmee — {{serviceName}}". Bloc rouge avec message "Le delai d'annulation gratuit de {{cancellationDays}} jour(s) est depasse."
  - booking_cancelled_not_refundable_waiver : sujet "Annulation confirmee — {{serviceName}}". Bloc rouge avec message "Vous avez renonce a votre droit d'annulation lors de la reservation."
- sendBookingCancelledEmail : choisit le template selon eligibleRefund (-> refundable) ou waiverSigned (-> waiver) ou defaut (-> delay). Plus de refundSection generique — chaque template embarque son propre bloc HTML.
- booking_cancelled_notify_admin : ajout de {{clientEmail}} en detailItem "Email client".
- 2 templates remboursement confirme distincts :
  - refund_confirmed : inchange — pour les formations (itemDetail + refundedAtFormatted).
  - refund_confirmed_service : nouveau — pour les prestations. Detailitems : Prestation, Date RDV, Heure, Praticienne, Montant rembourse, Rembourse le.
- sendRefundConfirmedEmail : detecte isService, utilise refund_confirmed_service si vrai (montant formate en euros via Intl.NumberFormat, refundDateTime passe a buildCommonMailVars). Sinon refund_confirmed inchange.
- refundExecutionService.js : sendRefundConfirmedEmailInternal peuple desormais practitionerId sur ServiceBooking (populate 'displayName'), passe practitionerName a sendRefundConfirmedEmail. Log debug renomme [DEBUG refund template] avec templateName.
- buildCommonMailVars : ajout du parametre practitionerName -> practitionername dans le retour.

## Flow annulation prestation par l'institut — page de décision tokenisée (2026-04-04)

### Modèle `SessionCancellationFlow`
- `flowType` enum étendu : `'service_booking_cancelled'` ajouté (était `session_cancelled | session_updated | formation_deleted`).
- `formationId` passe de `required: true` à `required: false, default: null` — compatible avec les docs existants.
- Nouveaux champs : `serviceId` (ObjectId → Service), `bookingId` (String), `serviceSnapshot { name, slug, duration, cancellationDays, isActive, isBookable, allowClientChoosePractitioner }`, `bookingSnapshot { startAt, endAt, totalPrice, practitionerId, selectedOptions }`.
- Nouveaux index : `{ serviceId, flowType, decision }`, `{ bookingId, flowType, decision }`.

### `services/sessionCancellationFlowService.js`
- Import ajouté : `Service`, `ServiceBooking`, `sendServiceCancellationChoiceEmail`.
- Constante : `FLOW_TYPE_SERVICE_BOOKING_CANCELLED = 'service_booking_cancelled'`, `REFUND_REASON_SERVICE_BOOKING_CANCELLED_BY_INSTITUTE`.
- `createOrRefreshInstituteDecisionFlow` : accepte `formationId` optionnel + `serviceId`, `bookingId`, `serviceSnapshot`, `bookingSnapshot`. Branch isServiceFlow pour la construction du flow et la requête de recherche.
- `createOrRefreshServiceCancellationFlow` : wrapper pour prestations — buildSnapshot + bookingSnapshot, appelle `createOrRefreshInstituteDecisionFlow(flowType: service_booking_cancelled)`.
- `notifyServiceCancellationChoiceForFlow` : envoie `sendServiceCancellationChoiceEmail` avec lien tokenisé.
- `applyFlowRefundDecision` : branch `service_booking_cancelled` → appelle `applyServiceFlowRefundDecision` (lookup sale par saleId direct, RefundRequest `itemType: 'service'`, mark ServiceBooking paymentStatus: refunded, skip Purchase/session decrement).
- `listAvailableSessionsForReschedule` : Partie 8 — vérifie `Formation.isActive !== false` avant de lister les sessions ; retourne `[]` si formation inactive ou supprimée.
- `listAvailableSlotsForServiceReschedule` : vérifie `service.isActive && service.isBookable`, retourne `{ available, reason, service }`.
- `applyFlowServiceRescheduleDecision` : valide flow, vérifie service actif/bookable, crée `ServiceBooking` (status: confirmed, paymentType: free, paymentStatus: paid, saleId conservé), marque flow `decision: reschedule`.
- `getFlowDecisionContext` : branch `service_booking_cancelled` → retourne `{ service, serviceAvailable, formation: null, availableSessions: [] }`.

### `controllers/serviceBookingController.js` — `cancelBookingByAdmin`
- Refonte : annule la réservation (`status: cancelled, cancelledBy: admin`), crée le flow tokenisé via `createOrRefreshServiceCancellationFlow`, envoie email au client via `notifyServiceCancellationChoiceForFlow`.
- Plus de création immédiate de `RefundRequest` — c'est le client qui choisit via la page tokenisée (ou le job J+7 qui déclenche automatiquement).
- Retourne `{ ok, flowCreated, flowId, flowError }`.

### `controllers/sessionCancellationFlowController.js`
- `buildClientFlowPayload` : ajout `autoRefundDays`, `options.serviceRescheduleAvailable` pour service flows.
- `getSessionCancellationFlowDecision` : branch service flow → retourne `{ service, serviceSnapshot, bookingSnapshot, serviceAvailable }` au lieu des données formation/sessions.
- Nouveau handler `submitServiceRescheduleDecision` : valide flow, appelle `applyFlowServiceRescheduleDecision`, retourne newBooking.

### Routes
- `POST /api/client/session-cancel-flows/:flowId/service-reschedule` — nouveau endpoint (sans auth, token dans body).

### `services/mailService.js`
- Template `service_booking_cancelled_choice` : sujet "Votre réservation a été annulée — {{serviceName}}", variables `firstname`, `servicename`, `bookingdate`, `bookingtime`, `actionurl`, `autorefunddays`.
- Fonction `sendServiceCancellationChoiceEmail` exportée.

### Job auto-remboursement J+7 (`automatisme/sessionCancellationAutoRefundJob.js`)
- Inchangé — la requête `{ decision: 'pending', usedAt: null, autoRefundAt: { $lte: now } }` inclut naturellement `service_booking_cancelled` (pas de filtre sur `flowType`).

### `public/js/modules/sessionCanceledDecisionModule.js`
- **Partie 7 fix** : `onSelectSession` ne calcule plus `computeRequiredWaiverText` au report de formation — `state.requiredWaiverText` est toujours vide lors du report après annulation par l'institut.
- Ajout `renderServiceDecisionView` : carte héro avec résumé prestation annulée + options "Choisir un nouveau créneau" / "Demander un remboursement" + note auto-remboursement J+N.
- Bouton "Choisir un nouveau créneau" grisé si `!serviceAvailable`.
- Ajout `buildServiceRescheduleModalMarkup` : calendrier mensuel interactif (`/api/vitrine/availability/days`) + sélection créneau (`/api/vitrine/availability/slots`) + bouton "Confirmer ce créneau".
- Handlers service : `onOpenServiceReschedule`, `onCloseServiceReschedule`, `onCalPrev`, `onCalNext`, `onSelectDate`, `onSelectSlot`, `onSubmitServiceReschedule`.
- `renderPage` branch sur `flowType === 'service_booking_cancelled'` → `renderServiceDecisionView`.

### `public/css/app.css`
- Styles `.scd-calendar*`, `.scd-cal-day*`, `.scd-slot*`, `.scd-slots-section`, `.scd-badge--muted`, `.scd-card--info` ajoutés.

## Correctifs page de décision tokenisée + mail (2026-04-04)

### `services/mailService.js` — Correctif 1 : `autorefunddays` manquant
- `'autorefunddays'` ajouté à `VARIABLE_KEYS` — la variable `{{autoRefundDays}}` dans le template `service_booking_cancelled_choice` est désormais remplacée correctement.

### `public/css/app.css` — Correctif 2 : Bug mobile opacity:0
- `.scd-reveal` : `opacity: 1` (visible par défaut), `transform: translateY(0)`, `animation-fill-mode: both`. Si l'animation est bloquée (throttling mobile), l'élément reste visible.
- `@media (prefers-reduced-motion: reduce)` `.scd-reveal` : `animation: none !important; opacity: 1 !important; transform: none !important`.
- Nouvelle classe `.scd-page` : `color-scheme: light; background-color: #ffffff; color: #0f172a` — forcé sur le conteneur de la page de décision.

### `public/js/modules/sessionCanceledDecisionModule.js` — Correctif 2 : Filet de sécurité JS
- `renderPage` : `container.classList.add('scd-page')` au démarrage.
- `renderDecision` : `setTimeout(..., 300)` après chaque rendu — force `opacity:1 / translateY(0)` en inline styles sur `.scd-reveal`, et `backgroundColor + color` sur les cards hero/choices/info.

### `services/sessionCancellationFlowService.js` — Correctif 3 : Emails post-report
- Import ajouté : `PractitionerProfile`, `sendBookingConfirmedEmail`, `sendServiceRescheduledAdminEmail`.
- `applyFlowServiceRescheduleDecision` : deux blocs `try/catch` non bloquants après `flow.save()` :
  1. Email client — `sendBookingConfirmedEmail` avec booking synthétique peuplé (client, service, practitioner).
  2. Email praticienne — `sendServiceRescheduledAdminEmail` : fetch `PractitionerProfile.userId` → User pour l'email, dates formatées `fr-FR` depuis `flow.bookingSnapshot.startAt` (ancienne) et `startDate` (nouvelle). Conditionnel : `resolvedPractitionerId` présent ET `oldStart` valide.

### `services/mailService.js` — Nouveau template praticienne (2026-04-04)
- `VARIABLE_KEYS` : `'oldbookingdate'`, `'oldbookingtime'`, `'newbookingdate'`, `'newbookingtime'`, `'clientname'` ajoutés.
- Template `service_booking_rescheduled_admin` : sujet "Report de réservation — {{serviceName}}", variables `firstname` (praticienne), `clientname`, `clientemail`, `servicename`, `oldbookingdate`, `oldbookingtime`, `newbookingdate`, `newbookingtime`.
- Fonction `sendServiceRescheduledAdminEmail` exportée — prend `practitionerEmail`, `practitionerFirstName`, `clientName`, `clientEmail`, `serviceName`, anciennes/nouvelles dates.

## Composant calendrier de reservation (2026-04-04)

### `public/js/modules/bookingCalendarComponent.js`
- Composant reutilisable exportant `createBookingCalendar(options)` — retourne `{ mount(el), destroy(), getSelectedSlot(), reset() }`.
- Deux modes : `service` (fetch API) et `formation` (sessions pre-chargees).
- Mode service : etape 1 = calendrier mensuel (`GET /api/vitrine/availability/days`), etape 2 = grille de creneaux (`GET /api/vitrine/availability/slots`). Navigation mois ◀ ▶.
- Mode formation : calendrier base sur `sessions[]`, clic sur un jour = selection directe (1 session) ou liste de sessions pour le jour (plusieurs). Sessions completes grises.
- Option `leadDays` : jours minimum avant reservation (mode service).
- CSS injecte dynamiquement via `<link id="bkc-styles" href="/css/bookingCalendar.css">`.
- Callbacks : `onSlotSelected(slot)` (service), `onSessionSelected(session)` (formation), `onBack()`.
- Aucune dependance externe — uniquement `fetch` natif.

### `public/css/bookingCalendar.css`
- Classes prefixe `bkc-*`. Couleurs via variables CSS uniquement.
- Mobile first, `prefers-reduced-motion` respecte.
- Classes cles : `.bkc-root`, `.bkc-nav`, `.bkc-nav-btn`, `.bkc-title`, `.bkc-grid`, `.bkc-hcell`, `.bkc-cell`, `.bkc-cell--available`, `.bkc-cell--disabled`, `.bkc-cell--selected`, `.bkc-cell--today`, `.bkc-slots-grid`, `.bkc-slot`, `.bkc-slot--selected`, `.bkc-back-btn`, `.bkc-session-card`, `.bkc-session-card--selected`, `.bkc-session-card--full`, `.bkc-loading`, `.bkc-empty`, `.bkc-error`.

### Integrations
- `serviceDetailModule.js` : `createBookingModal(service)` utilise le composant en mode service. Modal `.sbm-overlay/.sbm-modal` preservee, calendrier monte dans `.sbm-calendar-mount`. Recap creneau selectionne dans `.sbm-slot-recap` en dessous.
- `sessionCanceledDecisionModule.js` : variable module `_calendarInstance` (null par defaut). Mode formation (`buildRescheduleModalMarkup`) — monte le composant dans `[data-scd-calendar-mount]`. Mode service (`bindServiceRescheduleModalEvents`) — monte le composant service dans `[data-scd-calendar-mount]`. `destroyCalendar()` appele avant tout remplacement ou fermeture.
- `checkoutModule.js` : `<select data-session-select>` remplace par `.checkout-session-picker` + modal `.checkout-session-calendar-modal`. `syncSessionDisplay(container, state)` met a jour l affichage de la session selectionnee. `openSessionCalendarModal`/`closeSessionCalendarModal` gere le cycle de vie du composant.

### CSS app.css ajouts
- `.checkout-session-picker`, `.checkout-session-picker__selected`, `.checkout-session-picker__date/time/avail/edit`
- `.checkout-session-calendar-modal`, `.checkout-session-calendar-modal__inner`, `.checkout-session-calendar-modal__header`, `.checkout-session-calendar-modal__body`

## Correctifs 2026-04-04 v2 -- CGV reschedule, UI decision v3, bookingCalendar itemDetail, multi-sessions

### Correctif 1 -- CGV supprimee du flow de report (sessionCanceledDecisionModule.js)
- `state.acceptedCgv` supprime de l'etat -- seul `state.acceptedWaiver` subsiste
- `buildLegalCheckboxMarkup` remplace par `buildWaiverCheckboxMarkup` (waiver uniquement)
- `onToggleCgv` / `open-cgv-info` / listener `[data-accept-cgv]` supprimes
- `onSubmitReschedule` : guard `!state.acceptedCgv` retire. Seul le guard waiver reste.
- Body POST reschedule : `acceptedCgv` retire du JSON envoye au backend
- Import `requestVitrineNavigation` supprime (plus utilise)

### Correctif 2 -- UI page de decision v3 (sessionCanceledDecisionModule.js + app.css)
- `renderDecisionView` et `renderServiceDecisionView` : structure hero+choices remplacee par une unique `.scd-card` minimaliste (titre, sous-titre, deadline, separateur, question, actions boutons, note auto-remboursement)
- Boutons `.primary-button` pleine largeur + `.danger-button` pour remboursement
- Modal reschedule en 2 etapes via `state.rescheduleStep = 1|2`
  - Etape 1 : calendrier + bouton "Suite" (disabled sans selection)
  - Etape 2 : recap formation + date + waiver (si requis) + boutons "Modifier / Confirmer"
- `onNextStep` : calcule `requiredWaiverText` au passage a l'etape 2
- `onPrevStep` : retour a l'etape 1, remonte le calendrier
- CSS `.scd-page/.scd-shell/.scd-card` refondus (border-radius 8px, fond surface, sans gradient)
- Nouvelles classes CSS : `.scd-card__title/subtitle/deadline/divider/question`, `.scd-auto-refund-note`, `.scd-recap/__name/__date`, `.scd-waiver-box`
- Classes CSS supprimees : `.scd-option*`, `.scd-card--hero/choices/info`, `.scd-hero-top`, `.scd-kicker`, `.scd-badge`

### Correctif 3 -- itemDetailModule.js : migration vers bookingCalendarComponent
- Import `createBookingCalendar` ajoute
- `groupSessionsByDate`, `buildCalendarMarkup`, `buildDaySlotsMarkup`, `hasSessionsInMonth` supprimees
- `initCalendar` recrite : `createBookingCalendar({ mode:'formation', sessions, initialDate, onSessionSelected })`. Instance sur `areaEl._bkcInstance` pour destroy propre.

### Correctif 4 -- formationManagerModule.js : sessions multiples par jour
- 4a : `renderSessionCalendar` -- badge `.calendar-day__count` si count > 1, point `.calendar-day__dot` si count = 1
- 4b : `openSessionCreateModal` -- warning `[data-session-sameday-warning]` si sessions existantes le meme jour
- 4c : `renderSessionDetailModal` -- warning avant le form si autres sessions le meme jour
- 4d : `renderSessionList` -- sessions groupees par date avec separateur `.session-list__date-separator`
- CSS : `.calendar-day__dot`, `.calendar-day__count`, `.session-list__date-separator` ajoutes dans app.css

## Gestion - Formation Manager : refonte UX sessions (2026-04-04)

### Partie 1 -- Modal liste du jour (openDaySessionsModal)

- `handleSessionCalendarClick(dateKey)` : n'appelle plus directement `openSessionDetailModal`. Delegue vers `openDaySessionsModal(dateKey)`.
- `buildDaySessionCard(session)` : helper qui retourne le HTML d'une card pour une session du jour. Contenu : plage horaire (`buildSessionScheduleSummaryShort`), badge formatrice (`gmf-session-badge--unassigned` si absente), badge statut, places restantes, bouton "Modifier" uniquement si `session.isOwn === true`.
- `openDaySessionsModal(dateKey)` : cree un modal body-appended (overlay `.gmf-day-sessions-overlay` + panel `.gmf-day-sessions-modal`). Header avec titre du jour (`formatCalendarKeyLabel`), liste des sessions via `buildDaySessionCard`, footer avec bouton "Creer une session ce jour" (`data-action="create-session-from-day"`, pre-rempli avec la date du jour). Clic "Modifier" deleguee vers `openSessionDetailModal(session._id)`. Modal ferme via `data-close-day-sessions-modal` ou clic overlay.
- CSS ajoute : `.gmf-day-sessions-overlay`, `.gmf-day-sessions-modal`, `.gmf-day-sessions-modal__header`, `.gmf-day-sessions-modal__title`, `.gmf-day-sessions-modal__list`, `.gmf-day-sessions-modal__empty`, `.gmf-day-sessions-modal__footer`.

### Partie 2 -- Refonte renderSessionDetailModal

- Section "deplacement de session" (drag calendrier) **entierement supprimee** : les appels `renderSessionMoveCalendar()`, `bindSessionMoveCalendarDirectHandlers()`, `startSessionMoveSuggestionLoop()` ne sont plus emis (les fonctions restent dans le module mais ne sont plus appelees).
- `renderSessionDetailModal` genere maintenant une structure `.gmf-session-edit-modal` :
  - `__header` : titre "Modifier la session" + sous-titre date/duree + badge owner si non-own.
  - `__readonly-notice` : notice visible si l'utilisateur n'est pas proprietaire de la session.
  - switcher formation (inchange).
  - `__form` (`data-session-detail-form`) avec champs : date de debut, duree (lecture seule), horaires (time pickers `stp-*`), capacite (stepper widget). Boutons `__btn-save` (`data-action="save-session-modal"`) et `__btn-delete` (`data-action="delete-session-modal"`).
- Tous les `data-*` existants preserves : `data-session-detail-form`, `name="sessionId"`, `name="startDate"`, `data-capacity-widget`, `data-action="save-session-modal"`, `data-action="delete-session-modal"`.
- CSS ajoute : `.gmf-session-edit-modal`, `__header`, `__title`, `__subtitle`, `__readonly-notice`, `__form`, `__field`, `__field-label`, `__field-value`, `__actions`, `__btn-save`, `__btn-delete`.

### Partie 3 -- Bouton "Creer une session" dans le sous-onglet Sessions planifiees

- `renderSessionList` : insere un bouton `.gmf-session-list-create-btn` (`data-action="open-create-session-from-list"`) apres la zone de filtre et avant la liste de sessions.
- `attachSessionListActions` : handler delegue ajoute pour `data-action="open-create-session-from-list"` -> appel `openSessionCreateModal()`. Handler insere au debut du listener existant, respecte le guard `container.dataset.boundSessionListActions === 'true'`.
- CSS ajoute : `.gmf-session-list-create-btn` (bouton outline primary pleine largeur, icone `bi-plus-lg`).

### Nouveaux namespaces CSS (app.css)

- `.gmf-day-sessions-*` : overlay + panel liste sessions du jour
- `.gmf-day-session-card` + enfants : card individuelle dans la liste du jour
- `.gmf-session-badge--unassigned` : badge gris "Non assignee" pour formatrice absente
- `.gmf-session-edit-modal__*` : structure du modal d'edition de session (remplace l'ancien layout avec section deplacement)
- `.gmf-session-list-create-btn` : bouton creation session dans le sous-onglet liste

## Gestion - Formation Manager : modal création session depuis "Sessions planifiées" (2026-04-05)

- **Probleme initial** : `[data-session-create-modal]` imbrique dans `data-planning-panel="calendar"` — invisible depuis le sous-onglet "Sessions planifiees". Approches tentees et rejetees : switch tabs programmatique (timing fragile), clone body-appended incompatible avec le systeme existant.
- **Solution finale** : `openSessionCreateFromListModal()` — modal body-appended autonome en 2 etapes, sans dependance au panel "Calendrier global".
- **Etape 1 — Selection de date** : mini calendrier mensuel (`buildMiniCalendarHtml`) avec navigation prev/next mois, jours passes desactives, jour selectionne en `var(--color-primary)`. Bouton "Suite" actif apres selection uniquement.
- **Etape 2 — Horaires et capacite** : time pickers custom via `buildSessionTimePickerRow(1, { context: 'list-create' })`, stepper capacite (`session-capacity-widget`), bouton "Creer la session". Conflits charges via `loadConflictsForDates([selectedDate], null)` a la transition etape 1→2. Handler `handleSessionTimePickerAction` delegue depuis le listener de l'overlay.
- **Nouveau contexte time picker `list-create`** : `buildSessionTimePickerRow` etendu pour accepter `'list-create'` (data-list-create-schedule-start/end, noms `listCreateSessionScheduleStart/End-N`). `getSessionTimePickerDateKeys` traite `'list-create'` comme `'create'` (via `state.sessionSelectedDates`). Pas de conflit DOM avec les pickers `create` (panel masque) ni `modal` (session detail modal).
- **State** : `modalState { step, selectedDate, capacity, calYear, calMonth }` — `state.sessionSelectedDates` sync au passage etape 2 pour alimenter le conflict checker.
- **Soumission** : lit les valeurs via `getSessionTimePickerValues(picker)` sur le picker `list-create` dans l'overlay. `POST /api/gestion/formations/:id/sessions` avec `{ startDate, durationDays:1, schedule:[{dayIndex:1, startTime, endTime}], maxClients }`. Succes : `closeSessionTimePicker()` + `overlay.remove()` + `fetchSessionsForSelectedPresentiel()` + `renderSessionList()`.
- **CSS** : `.gmf-create-session-overlay` (fixed z-9999 fadeIn), `.gmf-create-session-modal` (flex column max-height 88vh). Header/champs/bouton-save reutilisent `gmf-session-edit-modal__*` existants. `.gmf-create-session-modal__btn-secondary` (bouton Retour). `.gmf-csm-cal__*` (mini calendrier grille 7 colonnes, nav mois, jour selectionne primary).
## STEP 20 — Suspension renforcee + Refonte clientManagerModule

### Blocage suspension multi-niveaux
- `serviceDetailModule.js` : bouton "Reserver" desactive par defaut si `context?.user` present. Fetch non-bloquant `GET /api/client/me/booking-status` (`.then/.catch`). Si `bookingSuspended === true` -> reste desactive + banniere. Si `false` ET `service.isBookable` -> actif. Si erreur reseau -> active si bookable (non bloquant).
- `checkoutModule.js` : `runServiceCheckout` verifie la suspension AVANT afficher quoi que ce soit. Si `bookingSuspended === true` -> remplace container par `.checkout-suspended-notice` et `return`. Non bloquant : erreur reseau ignoree.
- `stripeController.js` : `createCheckoutSession` verifie `User.bookingSuspended` AVANT la creation Stripe quand `isServiceBooking === true`. Retourne `403 BOOKING_SUSPENDED` si suspendu.

### Refonte clientManagerModule.js (STEP 20)
- Graphe Chart.js dynamiquement charge (`cdn.jsdelivr.net/npm/chart.js@4`) si `window.Chart` absent.
- Endpoint `GET /api/gestion/clients/stats?period=7d|30d|3m|12m` -> `getClientStats` dans `clientManagementController.js`. Agregation MongoDB par jour ou mois, remplissage continu des labels sans trous.
- Route `/stats` montee AVANT `/:clientId` dans `clientManagementRouter.js` pour eviter collision.
- Layout liste : tableau avec colonnes Nom, Email, Date, Statut, Chevron. Grid CSS `1fr 1fr auto auto 20px`.
- Badges : `clm-badge--suspended` + `clm-badge--noshows` sur les lignes de la liste.
- Fiche detail : avatar initiales, KPIs (no-shows, prestations, total achats), boutons `clm-btn-suspend` / `clm-btn-unsuspend` outline.
- Onglets : `sales | bookings | noshows | refunds | giftcards | reviews` — identiques a avant mais rendu avec `.clm-item` + `.clm-detail-btn`.
- State : `chartPeriod`, `chartData`, `chartInstance` ajoutes.
- CSS : `.clm-*` entierement refondu (classes obsoletes supprimees : `clm-header`, `clm-client-row`, `clm-chevron-btn`, `clm-suspension-block/btn`, etc. Nouvelles classes : `clm-table-wrap`, `clm-table-row`, `clm-col--*`, `clm-chart-card`, `clm-period-tabs`, `clm-kpi-grid`, `clm-kpi`, `clm-detail-shell`, `clm-avatar`, `clm-btn-suspend/unsuspend`, `clm-item-list`, `clm-detail-btn`).
- `.checkout-suspended-notice` : styles inclus dans la section `clm-*` du CSS.

## STEP 21 — Systeme de notifications in-app (2026-04-05)

### Modeles
- `models/Notification.js` : document par notification. Champs : `notificationId` (NOTIF-xxx), `title`, `message`, `category` (enum prestations/formations/ventes/systeme/remboursements/clients), `targetType` (all/role/user), `targetRole`, `targetUserId`, `link`, `linkLabel`, `eventType`, `variables` (Mixed), `readBy[]` (ObjectId[]), `expiresAt` (TTL sparse). Index : `{ targetType, targetRole, targetUserId, createdAt }`.
- `models/NotificationConfig.js` : singleton. Champs : `widgetPosition` (top-left/top-right/bottom-left/bottom-right), `pollingIntervalSeconds`, `notificationLifetimeDays`, `events[]` (eventType, label, isActive, category, targetType, targetRole, titleTemplate, messageTemplate, availableVariables[]).

### Service
- `services/notificationService.js` : `triggerNotification(eventType, variables)` -- charge la config, trouve l'eventConfig actif, interpole les templates `{{variable}}`, resout le destinataire (user_concerned -> targetUserId = variables.userId), calcule expiresAt, cree le document Notification. Toujours appele avec `void`, erreurs silencieuses.

### Controller et routes
- `controllers/notificationController.js` + `routers/notificationRouter.js` montes sur `/api/gestion/notifications` (protege par requireGestionRole).
  - `GET /` : liste paginee (limit, unreadOnly), filtre targetType/targetRole/targetUserId, exclut expirées, retourne `{ notifications, unreadCount }`.
  - `PATCH /:notificationId/read` : ajoute userId dans readBy[].
  - `PATCH /read-all` : updateMany readBy.
  - `DELETE /:notificationId` : suppression.
  - `GET /config` + `PUT /config` : lecture/ecriture config singleton.

### Migration
- `automatisme/notificationConfigMigration.js` : `runNotificationConfigMigration()` -- cree le singleton config si absent avec 8 evenements preconfigures. Appelee au boot dans `app.js`.

### Widget frontend
- `public/js/notificationWidget.js` : script module charge dans `gestion.html`. Init asynchrone : charge la config, injecte bouton flottant + banniere + overlay + modal dans le body. Polling toutes les N secondes (config). Badge nombre non-lus. Banniere slide-in/out 3s si nouvelles notifs. Modal 70vh depuis le bas. Rendu liste avec icone colore par categorie, point non-lu, lien cliquable. Actions mark-read inline + mark-all-read.
- `public/css/notificationWidget.css` : styles widget. Variables CSS theme exclusivement. Classes : `ntf-widget-btn`, `ntf-badge`, `ntf-banner`, `ntf-overlay`, `ntf-modal`, `ntf-item`, `ntf-item--unread`. Animations `ntf-slide-in` / `ntf-slide-out`.

### Evenements branches
| eventType | Declencheur | Variables cles |
|---|---|---|
| booking_created | serviceBookingController (service gratuit) + clientController (Stripe) | clientName, serviceName, bookingDate, bookingTime, userId |
| booking_cancelled_client | serviceBookingController.cancelMyBooking | clientName, serviceName, bookingDate, userId |
| booking_rescheduled_client | sessionCancellationFlowService (reschedule service) | clientName, serviceName, newBookingDate, userId |
| no_show_recorded | serviceBookingController.markNoShow | clientName, serviceName, bookingDate |
| new_sale | clientController.runPostSaleSideEffects | saleId, amount |
| refund_requested | stripeController.handleRefundUpdatedEvent (succeeded) | clientName, amount |
| new_client | authRouter /signup | clientName (email), clientEmail |
| formation_session_cancelled | formationSessionController.deleteSession | formationName, sessionDate |

## STEP 21b — Correctifs notification system (2026-04-05)

### Correctif 1 — Widget : suppression des CTA
- `public/js/notificationWidget.js` : `renderItem` ne genere plus le `ntf-item__link-label` ni ne navigue au clic. Seuls titre, message et date relative sont affiches. Le clic marque uniquement la notif comme lue.

### Correctif 2 — Fix ciblage user_concerned
- `services/notificationService.js` : resolution `targetUserId` depuis `PractitionerProfile.userId` (User._id) au lieu de l'ID brut du practitioner profile, qui est different de User._id.

### Correctif 3 — Module notificationManagerModule.js (4 onglets)
- `public/js/modules/notificationManagerModule.js` : module 4 onglets, export `renderModule(container)`.
  - **Onglet Notifications** : filtres categorie + lu/non-lu (custom selects), bouton "Tout marquer lu", actions mark-read + delete par item. Categories et icones issues de `state.config.categories`.
  - **Onglet Evenements** : 10 evenements configurables (8 existants + 2 formation). Selects custom avec icone coloree. Select destinataire → sous-select role si "Par rôle" avec animation slide-down. Chips variables inserable au curseur.
  - **Onglet Categories** : liste des categories avec icone coloree. Boutons edit/delete (non supprimable si `isDefault`). Modale creation/edition : champ nom (id auto-genere), icon picker (grille 180 icons Bootstrap avec recherche), color picker natif. Suppression : confirmation si events lies.
  - **Onglet Parametres** : radios position widget (4 options), steppers polling + lifetime.

## STEP 21c — Catégories dynamiques et evenements formation (2026-04-05)

### Modele
- `models/NotificationConfig.js` : ajout `categories[]` (id, label, icon, color, isDefault). Les 6 categories hardcodees migrent en documents MongoDB.

### Migration
- `automatisme/notificationConfigMigration.js` : mise a jour -- si config existante sans categories, les ajoute. Ajoute les nouveaux eventTypes manquants (`formation_distancielle_purchased`, `formation_presentielle_purchased`).

### Controller
- `controllers/notificationController.js` : `updateConfig` accepte `categories[]`. Nouvel endpoint `DELETE /config/categories/:categoryId` : valide isDefault, nullifie `category` sur les events lies, retourne `affectedEvents` count + config mise a jour.

### Nouveaux evenements
| eventType | Declencheur | Variables cles |
|---|---|---|
| formation_distancielle_purchased | clientController.runPostSaleSideEffects | clientName, formationName, saleId, amount |
| formation_presentielle_purchased | clientController.runPostSaleSideEffects | clientName, formationName, sessionDate, sessionTime, optionsCount, saleId |
| formation_participation_cancelled | clientController.cancelFormationParticipation (après Purchase.participationStatus=canceled) | clientName, formationName, sessionDate, saleId |

- Detection dans `runPostSaleSideEffects` : `sale.items.find(i => i.type === 'formation')` → lookup `Formation.type` → branche distancielle/elearning ou presentielle.

### Frontend
- Selects natifs → selects custom animes (`nmm-select`, `nmm-select__trigger`, `nmm-select__dropdown`). Position absolute z-index 9999. `.nmm-event-card` : `overflow: hidden` retire.
- `public/css/notificationManagerModule.css` : ajout styles custom select (`nmm-select*`), role field slide-down, categories tab (`nmm-cat-row`, `nmm-icon-btn`), modal (`nmm-modal-overlay`, `nmm-modal`), icon picker (`nmm-icon-picker`, `nmm-icon-tile`), color picker (`nmm-color-input`), badge default.

## STEP 21d — Validation creneau report prestation (2026-04-05)

### Probleme
`applyFlowServiceRescheduleDecision` creait le `ServiceBooking` sans verifier la disponibilite du creneau — double-booking possible.

### Correctif
- `services/sessionCancellationFlowService.js` : ajout `localDateStr(date)` helper (meme impl que `availabilityController.js`). Avant `ServiceBooking.create`, validation en deux passes :
  1. `ServiceBooking.findOne({ practitionerId, status: {$nin:[cancelled,no_show]}, startAt<endDate, endAt>startDate })` → conflict → throw `SLOT_UNAVAILABLE`
  2. `FormationSession.find(buildActiveFormationSessionFilter({ instructorId: profile.userId }))` → compare en minutes → overlap → throw `SLOT_UNAVAILABLE`
- `controllers/sessionCancellationFlowController.js` : catch `SLOT_UNAVAILABLE` avant le catch générique → `409 { code: 'SLOT_UNAVAILABLE' }`.
- `public/js/modules/sessionCanceledDecisionModule.js` : dans `onSubmitServiceReschedule` catch `error.code === 'SLOT_UNAVAILABLE'` → toast erreur + reset `rescheduleStep=1` + reset `selectedSlot*` + `renderDecision()` (retour au calendrier sans recharger le flow).

## Reprise V1 — Phase 0 a Phase 1B-3

> Section de synchronisation (2026-06-22). Documente l'etat reel du code apres la reprise de stabilisation V1 (branche `phase-0-security-baseline`, dernier commit `f1f0b73 Prevent service booking double-booking`). Rapports sources : `Rapports/version 1/20` a `29`. Cette section fait autorite sur les sections plus anciennes lorsqu'elles divergent.

### Phase 0 — Initialisation Git / GitHub
- Depot Git initialise (`git init`), branche par defaut `main` + branche de travail `phase-0-security-baseline`. Remote GitHub ajoute, les deux branches poussees.
- Commit baseline `Initial audit baseline before V1 stabilization` (~394 fichiers suivis ; `node_modules/`, `uploads/`, `Rapports/`, `memory/` exclus).
- `.gitignore` reecrit : `node_modules/`, `.env`, `.env.*` (sauf `.env.example`), `uploads/`, `logs/`, `Rapports/`, `memory/`, scripts one-off (`insert_*.py`, `inspect_*.py`, etc.), fichiers temporaires.
- Aucun secret present dans l'historique Git (verifie via `git grep --cached` sur `sk_live_`, `xkeysib-`, `whsec_`, `mongodb+srv://...`). `.env` non suivi ; `.env.example` ne contient que des placeholders.
- Rapports d'audit initiaux crees dans `Rapports/version 1/` (00 a 19), puis rapports de reprise 20 a 29.

### Phase 0 — Harnais de tests
- Stack de test : **Vitest** (runner ESM), **Supertest** (HTTP), **mongodb-memory-server** (Mongo en memoire isole), `cross-env`.
- Scripts npm : `test` = `vitest run` ; `test:watch` = `vitest` ; `test:p0` = `vitest run tests/p0` ; `test:integration` = `vitest run tests/integration`.
- `tests/setup/` :
  - `testEnv.js` : pre-definit toutes les variables d'environnement sensibles AVANT l'import de `app.js` (empeche dotenv de charger le vrai `.env`).
  - `testDb.js` : cycle de vie mongodb-memory-server, exporte `clearDatabase()`.
  - `testApp.js` : boot de `app` sur la base en memoire, garde-fou exigeant un `MONGODB_URI` local uniquement.
  - `seedTestData.js` : fixtures deterministes, cree un contrat actif pour passer `contractGuard()`.
  - `stripeWebhookTestUtils.js` : genere de vraies signatures de webhook Stripe pour les tests.
- `tests/integration/` : `health.test.js` (boot en `NODE_ENV=test`, pas de fuite de cle), `auth.test.js` (signup→code mocke, login refuse tant que non verifie, verify-email, `/auth/me`).
- `tests/p0/` (tests de non-regression P0) :
  - `mockPay.exposure.test.js` — `/api/client/mock-pay` joignable en test, 404 en production.
  - `security.secrets.test.js` — `requireSecret()` (valeur, fallback, throw sans rien).
  - `security.tracking-token.test.js` — le suivi public n'expose jamais le mot de passe carte cadeau.
  - `security.logging.test.js` — aucun log ne contient `trackingToken`.
  - `stripe.webhook.idempotence.characterization.test.js` — une seule vente par PaymentIntent (replay + concurrence).
  - `giftcard.concurrentDebit.test.js` — debit carte cadeau atomique.
  - `refund.doubleRequest.characterization.test.js` — demande de remboursement dupliquee rejetee/refetchee.
  - `refund.recreditIdempotent.test.js` — webhook duplique recredite exactement une fois.
  - `refund.overRefund.test.js` — remboursement plafonne au total de la vente.
  - `booking.doubleSlot.characterization.test.js` — rejette double-booking exact, chevauchement partiel, slot passe / hors planning / bloque.
  - `booking.slotRevalidation.test.js` — revalidation serveur du slot a la creation finale (webhook).
  - `giftcard.zeroPayment.characterization.test.js` — **todo** : le bug du paiement 0€ vit dans le frontend, l'endpoint backend manque (gap documente, hors perimetre 1B).
- Etat des tests au commit `f1f0b73` (verifie 2026-06-22) :
  - `npm test` → 14 fichiers, 37 passes, 1 todo.
  - `npm run test:p0` → 12 fichiers, 31 passes, 1 todo.
  - `npm run test:integration` → 2 fichiers, 6 passes.

### Phase 1A — Securite P0
- **Garde production sur `/api/client/mock-pay`** : middleware `requireNonProductionMockPayment` (`routers/clientRouter.js`) renvoie **404** quand `NODE_ENV === 'production'` (404 plutot que 403 pour ne pas reveler l'existence de l'endpoint). `mock-pay` n'est donc plus utilisable en production. Verrouille par `tests/p0/mockPay.exposure.test.js`.
- **Suppression des fallbacks de secrets** : les litteraux de repli en dur (`'beautysavage-gift-card-secret'`, `'beautysavage-email-verification-secret'`) sont supprimes et remplaces par `requireSecret(...)`. Plus aucun secret n'a de valeur par defaut publique.
- **`utils/secretEnv.js`** (NOUVEAU) : exporte `requireSecret(name, { fallback } = {})` — retourne la valeur trimmee de la variable primaire ; sinon celle du fallback ; sinon **leve une erreur** (refus de continuer avec un defaut non securise). Utilise dans `controllers/giftCardController.js`, `services/giftCardService.js`, `routers/authRouter.js`, `controllers/salesController.js`.
- **Fuite mot de passe carte cadeau supprimee** dans `/api/refund-tracking/:token` (`getRefundByTrackingToken`, `salesController.js`) : le champ `password` n'est plus inclus dans le payload de carte cadeau recreditee. Le suivi public expose uniquement `code`, `balance`, `expiresAt`, `recipientName`. Le frontend (`refundTrackingModule.js`) n'affiche plus le mot de passe et redirige vers le compte / le contact institut. Verrouille par `security.tracking-token.test.js`.
- **Logs `trackingToken` supprimes** (`sessionCancellationFlowController.js`). Garde de regression statique : `security.logging.test.js`.

### Phase 1B-1 — Stripe / carte cadeau (idempotence)
- **Index UNIQUE partiel sur `Sale.stripePaymentIntentId`** (`models/Sale.js`) : `{ stripePaymentIntentId: 1 }`, `unique: true`, `name: 'uniq_stripe_payment_intent'`, `partialFilterExpression: { stripePaymentIntentId: { $type: 'string' } }`. Remplace l'ancien index `sparse` non unique. Les ventes mock/internes/legacy (`null`) sont exclues de la contrainte. L'idempotence Stripe n'est plus seulement applicative : elle est garantie au niveau base.
- **Gestion E11000 dans le webhook** (`stripeController.js`) : la violation de cle unique sur `stripePaymentIntentId` est traitee comme un succes idempotent (HTTP 200, aucun effet de bord, pas de log critique), en complement du garde `findOne` pour le replay sequentiel.
- **`persistSale` ecrit le PaymentIntent des l'insert** (`clientController.js`) : `stripePaymentIntentId` / `stripeSessionId` sont poses AVANT `save()`, sur les 4 chemins (formation, carte cadeau, produit, panier). Un webhook concurrent echoue donc en `E11000` avant tout debit/commission.
- **Debit carte cadeau atomique** — `debitGiftCardBalanceAtomic({ giftCardId, amount })` (`services/giftCardReservationService.js`) : `GiftCard.findOneAndUpdate({ _id, balance: { $gte: montant } }, [pipeline de soustraction arrondi 2 decimales + maj status redeemed/active])`. Le solde ne passe jamais negatif ; le perdant d'une course concurrente leve `GIFT_CARD_BALANCE_INSUFFICIENT` (400). Retourne `{ balanceBefore, balanceAfter, card }`.
- **Recredit carte cadeau atomique** — `recreditGiftCardBalanceAtomic({ giftCardId, amount })` : pipeline `$add` + status `active`.
- Tests : `stripe.webhook.idempotence.characterization.test.js`, `giftcard.concurrentDebit.test.js`.

### Phase 1B-2 — Remboursements
- **`constants/refundRequest.js`** (NOUVEAU) : `ACTIVE_REFUND_REQUEST_STATUSES = ['requested','pending','succeeded']`, `INACTIVE_REFUND_REQUEST_STATUSES = ['failed','canceled']`, `REFUND_REQUEST_STATUSES`, `REFUND_REQUEST_ACTIVE_UNIQUE_INDEX_NAME = 'uniq_active_refundrequest_sale_item'`.
- **Index UNIQUE partiel `RefundRequest`** (`models/RefundRequest.js`) : `{ saleId: 1, itemId: 1, itemType: 1 }`, `unique: true`, `partialFilterExpression: { status: { $in: ACTIVE_REFUND_REQUEST_STATUSES } }`. Empeche tout doublon de remboursement actif pour un meme article ; un remboursement `failed`/`canceled` peut etre recree.
- **`services/refundRequestService.js`** (NOUVEAU) — anti-doublon RefundRequest actif :
  - `findActiveRefundRequestForSaleItem({ saleId, itemId, itemType })`.
  - `createRefundRequestOnce(payload)` : si un remboursement actif existe → `{ refundRequest, created:false, duplicate:true }` ; sinon creation ; sur `E11000` concurrent → refetch et retour de l'existant.
  - `assertNoActiveRefundRequestForSaleItem(...)` → throw `REFUND_ALREADY_EXISTS` (409).
  - `calculateRefundExecutionCap({ refundRequest, sale })` → `cappedAmount = min(requestedAmount, saleTotal - somme des autres remboursements actifs de la vente)`.
  - `applyRefundExecutionCap(...)` : mute `refundRequest.amount` au plafond, ajoute une note si plafonne.
  - `claimGiftCardRecredit(refundId)` : `findOneAndUpdate` conditionnel (`giftCardRecredited != true` ET `giftCardRecreditInProgress != true`) → claim atomique avant recredit.
- **Plafond `saleTotal` (anti sur-remboursement)** : `calculateRefundExecutionCap` applique a la creation ET a l'execution (`triggerRefundExecution`). La somme des remboursements actifs d'une vente ne depasse jamais `saleTotal`.
- **Recredit carte cadeau idempotent** : `claimGiftCardRecredit` (flag `giftCardRecreditInProgress`/`giftCardRecredited` sur `RefundRequest`) garantit qu'un webhook `charge.refund.updated` duplique ne recredite pas deux fois et ne cree pas de second `GiftCardTransaction`.
- **`services/refundGiftCardService.js`** (NOUVEAU) : `recreditGiftCardPortion(sale, amountEur)` — resout les usages carte cadeau (`sale.giftCardUsage`, fallback `GiftCardTransaction` redeem), recredite via `recreditGiftCardBalanceAtomic`, cree un `GiftCardTransaction` type `credit`, rollback du debit si l'enregistrement de la transaction echoue.
- Tests : `refund.doubleRequest.characterization.test.js`, `refund.recreditIdempotent.test.js`, `refund.overRefund.test.js`.

### Phase 1B-3 — Booking / disponibilites
- **`services/serviceAvailabilityService.js`** (NOUVEAU) — source unique de verite des creneaux reservables :
  - `assertServiceSlotBookable({ practitionerId, serviceId, startAt, endAt, now, ignoreBookingId, session })` : revalidation serveur. Codes d'erreur : `SERVICE_NOT_BOOKABLE`, `PRACTITIONER_NOT_FOUND`, `PRACTITIONER_SERVICE_MISMATCH`, `INVALID_START_AT`/`INVALID_END_AT`, `INVALID_SLOT_RANGE`, `INVALID_SLOT_DURATION`, `SLOT_PAST` (slot passe), `SLOT_OUTSIDE_SCHEDULE` (hors planning), `SLOT_UNAVAILABLE` (indisponible/bloque/double). Retourne `{ service, practitioner, schedule, startAt, endAt, slot }`.
  - `computeAvailableSlotsForPractitioner({ practitioner, schedule, service, dateStr, ... })` : applique `weeklySchedule` + `lunchBreak` ; applique les `ScheduleException` (`modify` remplace les creneaux du jour, `block` plein jour ferme, `block` partiel soustrait, `add` etend) ; filtre les slots passes, ceux couverts par des bookings actifs, par des sessions de formation de la formatrice, et applique `service.duration` / `slotGranularity` / `bufferTime`.
  - `createServiceBookingWithProtection({ bookingData, service, now, ignoreBookingId, session })` : appelle `assertServiceSlotBookable`, pose des verrous minute par minute sur `[startAt, endAt + bufferTime)` via `BookingSlotLock.insertMany(..., { ordered:true })`, insere le `ServiceBooking` ; sur cle dupliquee (11000) libere les verrous et leve `SLOT_UNAVAILABLE` (409).
  - `releaseServiceBookingSlotLocks({ bookingId, session })` : supprime les verrous d'un booking.
- **`models/BookingSlotLock.js`** (NOUVEAU) : collection `booking_slot_locks`. Champs `practitionerId`, `bookingId`, `slotStartAt` (Date, granularite minute), `createdAt`. Index UNIQUE `{ practitionerId: 1, slotStartAt: 1 }` (empeche la collision exacte / le double-booking concurrent) + index `{ bookingId: 1 }` (nettoyage). Un document par minute occupee.
- **`constants/serviceBooking.js`** (NOUVEAU) : `ACTIVE_SERVICE_BOOKING_STATUSES = ['pending_payment','confirmed']` (statuts bloquant un creneau ; `cancelled`/`no_show`/`completed` non bloquants), `SERVICE_SLOT_ERROR_CODES`, `isActiveServiceBookingStatus(value)`.
- **Anti double-booking exact** : index unique `{ practitionerId, slotStartAt }` sur `BookingSlotLock`. **Anti chevauchement partiel** : couverture minute par minute incluant le `bufferTime`. **Refus slot passe** : controle `now` dans `assertServiceSlotBookable`. **Hors planning** : `computeAvailableSlotsForPractitioner` vs `weeklySchedule` + exceptions. **Slot bloque** : exceptions `block` (plein jour / creneau) soustraites. Support coherent des `ScheduleException`.
- **Recablage** :
  - `controllers/serviceBookingController.js` : `createBooking` → `createServiceBookingWithProtection` (statut `pending_payment` avant paiement, service gratuit → Sale immediate `paid`) ; `cancelMyBooking` et `cancelBookingByAdmin` → `releaseServiceBookingSlotLocks`.
  - `controllers/clientController.js` : `processServiceCheckoutStatePurchase` → `createServiceBookingWithProtection` (revalidation post-paiement, statut `confirmed`). Si le slot est devenu indisponible apres encaissement → throw `SLOT_UNAVAILABLE` (remboursement auto non encore implemente, voir risques).
  - `controllers/stripeController.js` : `create-checkout-session` → `assertServiceSlotBookable` en preflight avant toute creation de session Stripe.
  - `automatisme/pendingPaymentCleanupJob.js` : job horaire qui cible les `pending_payment` expires, libere les `BookingSlotLock` associes, puis marque le booking `cancelled` par le systeme.
  - `controllers/availabilityController.js` : consomme `computeAvailableSlotsForPractitioner` (alias `computeBookableSlotsForPractitioner`) → l'affichage vitrine reste aligne sur la validation serveur.
  - `services/sessionCancellationFlowService.js` : `applyFlowServiceRescheduleDecision` (report d'une prestation annulee) passe par `createServiceBookingWithProtection` — **remplace** le correctif ad hoc decrit en "STEP 21d" (double passe `findOne`/`FormationSession`), desormais obsolete.
- Tests : `booking.doubleSlot.characterization.test.js`, `booking.slotRevalidation.test.js`.

### Risques encore ouverts (a traiter apres 1B-3)
- ~~**Achat 0€** : pas d'endpoint backend de finalisation gratuite~~ → **RESOLU en Phase 1B-4** (voir section "Phase 1B-4"). `POST /api/client/checkout/finalize-free` finalise un achat 0€ (100% carte cadeau ou article gratuit) ; le test `giftcard.zeroPayment` est desormais vert.
- ~~**Expiration / liberation automatique des `pending_payment`**~~ -> **RESOLU en Phase 1B-5** : job horaire dedie, verrous liberes, bookings expires marques `cancelled` par le systeme.
- **Remboursement automatique si paiement encaisse mais slot devenu indisponible** : le booking est rejete (409) mais aucun remboursement automatique n'est declenche.
- **Reprise complete des refunds bloques** : pas encore de mecanisme de relance/reconciliation exhaustif.
- **Credit notes / factures d'avoir Stripe totalement idempotentes** : non encore garanties.
- ~~**`requireStrictDev` / gestion fine des roles**~~ -> **RESOLU en Phase P1-1** : `requireStrictDev` est dev-only, `gestionUsersRouter` passe par `requireAdminOrDev` et `gestionUsersController` bloque l assignation/promotion vers `dev` pour les admins.
- ~~**Rate-limit login / reset password**~~ -> **RESOLU en Phase P1-1** : login et password-reset ont des rate-limits dedies par route.
- **XSS / SVG / responsive / migration React** : reportes plus tard.

## Phase 1B-4 — Finalisation des achats 0 € (100% carte cadeau / gratuite)

> Section ajoutee le 2026-06-23 (branche `phase-0-security-baseline`). Ferme le dernier P0 d'audit : un achat dont le reste a payer est 0 € (100% carte cadeau, ou article reellement gratuit) doit produire exactement les memes effets metier qu'un paiement Stripe reussi. Rapports : `Rapports/version 1/31_audit_phase1b4_zero_payment.md`, `32_rapport_phase1b4_zero_payment.md`.

### Principe : un seul finaliseur metier
- `processCheckoutStatePurchase(...)` (`controllers/clientController.js`) reste **l'unique** point de finalisation : creation `Sale`, `Purchase`/`ServiceBooking`, reservation session, debit carte cadeau atomique, commission, effets post-vente (email/notif/facture). Il est appele par le webhook Stripe **et** par le nouveau chemin 0 €. **Aucun flow parallele, aucune duplication de la logique de vente/booking/debit.**

### Nouvel endpoint
- `POST /api/client/checkout/finalize-free` (`requireAuth` + `requireSiteActiveForPurchases`) → handler `finalizeFreeCheckout` (`clientController.js`). Contrairement a `mock-pay`, c'est un endpoint de **production** (pas de garde non-prod).
- Body : `{ checkoutState, idempotencyKey }`. Le `checkoutState` a la meme forme que pour le flux Stripe (item/cart/service, `appliedGiftCards`, `legal`).
- Le handler exige `legal.acceptedCgv === true` (pas de contournement des validations), puis appelle `processCheckoutStatePurchase({ ..., requireZeroRemaining: true, stripeSessionId: freeRef, stripePaymentIntentId: freeRef })`.

### Garde anti-contournement
- Nouveau parametre `requireZeroRemaining` propage dans `processCheckoutStatePurchase`, `processCartCheckoutStatePurchase`, `processServiceCheckoutStatePurchase` et les branches inline (formation / gift-card / product).
- Apres `planGiftCardUsage` (qui recalcule prix catalogue + couverture carte **reelle** cote serveur), `assertZeroRemainingForFreeOrder(...)` leve **402 `PAYMENT_REQUIRED`** si un montant reste du. Impossible donc de finaliser gratuitement un achat partiellement paye (le client doit passer par Stripe).
- Pour la prestation, la verification a lieu **avant** `createServiceBookingWithProtection` → aucun `ServiceBooking` orphelin si paiement requis.

### Idempotence (reutilise Phase 1B-1)
- Reference synthetique deterministe `freeRef = "free_<idempotencyKey>"` ecrite dans `Sale.stripePaymentIntentId`. L'index UNIQUE partiel `uniq_stripe_payment_intent` (Phase 1B-1) garantit **une seule** vente : double soumission concurrente → E11000 → reponse idempotente.
- `finalizeFreeCheckout` : pre-check `Sale.findOne({ stripePaymentIntentId: freeRef })` (fast path sequentiel) ; sur E11000 concurrent, `waitForExistingFreeSale(freeRef)` attend que la vente gagnante apparaisse (le perdant peut echouer plus tot sur `purchase_unique_product`) puis renvoie le meme `saleId`.

### Debit carte cadeau
- Inchange : `finalizeGiftCardUsage` → `deductGiftCardBalance` → `debitGiftCardBalanceAtomic` (Phase 1B-1). Solde jamais negatif, debit plafonne au montant du (`useAmount = min(desired, available, remaining)`). Aucune reservation prealable necessaire (finalisation synchrone) ; pas de reservation orpheline.

### Hygiene job frais Stripe
- `STRIPE_FEE_PENDING_QUERY` (`stripeController.js`) exclut desormais les references `free_*` (`stripePaymentIntentId: { $nin: [null, ''], $not: /^free_/ }`) : une commande 0 € n'a pas de frais Stripe a recuperer.

### Comportement officiel retenu
- **Cas A** (panier = carte cadeau, reste 0 €) : aucune session Stripe ; vente creee ; carte debitee ; booking cree si prestation ; effets post-vente ; `Sale` coherente.
- **Cas B** (carte > montant) : debit plafonne au montant du, solde restant conserve, vente creee.
- **Cas C** (article reellement gratuit, prix 0) : vente creee, flux finalise, aucun Stripe.
- **Reste a payer > 0** : refus `402 PAYMENT_REQUIRED` (doit passer par Stripe).

### Tests
- `tests/p0/giftcard.zeroPayment.characterization.test.js` (le `it.todo` devient un test reel) : 100% carte cadeau (sale+booking+debit), carte > montant (debit plafonne), produit gratuit (sans Stripe), double soumission (une seule vente, un seul debit), refus si reste du. Harnais P0 : **0 todo, 0 expected-fail**.

## Phase 1B-5 -- Expiration et liberation automatique des `pending_payment`

> Section ajoutee le 2026-06-23. Cette phase ferme le dernier risque d accumulation de reservations de prestation bloquantes. Elle ne change pas les flux Stripe normaux ni les roles ; elle ajoute uniquement un cleanup serveur idempotent pour les reservations qui sont restees en attente trop longtemps.

### Principe
- `constants/serviceBooking.js` expose `PENDING_PAYMENT_EXPIRATION_MINUTES = 30`.
- `automatisme/pendingPaymentCleanupJob.js` execute un job horaire, ignore les tests, et traite les bookings dont `status = pending_payment`, `paymentStatus = pending`, `saleId = null` et `stripePaymentIntentId = null`.
- Le job libere d abord les `BookingSlotLock` associes au `bookingId`, puis marque le booking `cancelled` avec `cancelledBy = system`.
- Les bookings deja payes, confirmes, ou encore rattaches a une vente / un PaymentIntent sont volontairement exclus.

### Impact metier
- Un `pending_payment` expire ne continue plus a bloquer le creneau.
- Les confirmations Stripe et les bookings deja finalises restent intacts.
- Le cleanup est idempotent: un second passage sur le meme booking ne recree pas de modification utile.

### Tests
- `tests/p0/booking.pendingPaymentCleanup.test.js` couvre :
  - expiration d un `pending_payment` age + liberation des verrous ;
  - absence d effet sur un booking non expire ;
  - absence d effet sur un booking confirme ;
  - idempotence sur deux executions consecutives ;
  - protection d un booking deja paye avant expiration.


## Phase 1B-4B â€” Cablage frontend achat 0 EUR vers `finalize-free`

> Section ajoutee le 2026-06-23. Cette phase ne touche pas le backend metier ; elle branche uniquement le frontend sur `POST /api/client/checkout/finalize-free`.

### Principe
- Tout checkout dont le montant du **maintenant** est nul ne charge plus Stripe.
- Le frontend cree quand meme un `checkoutToken`, puis navigue vers `slug=payment&checkoutToken=...&freeCheckout=1`.
- `public/js/vitrine.js` force `paymentResultModule` pour `payment_intent` **ou** `freeCheckout=1`, ce qui donne le meme ecran premium succes/echec que le retour Stripe.

### `checkoutModule.js`
- Achat simple : `remainingToPay > 0` -> Stripe inchange ; `remainingToPay === 0` -> ecran `payment` en mode free.
- Panier : meme branchement sur `remainingToPay`.
- Prestation : meme idee, mais la decision se fait sur `amountToPay` (montant du maintenant), pas sur `remainingToPay`.
- Les paths 0 EUR reutilisent un `checkoutToken` stable par tentative (fingerprint du `checkoutState` sans timestamps volatils) afin qu un double-clic ne regenere pas une nouvelle cle.

### `paymentResultModule.js`
- Si `payment_intent` est present : flow Stripe historique, inchange.
- Si `freeCheckout=1` :
  - relit le `checkoutState` via `readCheckoutStateToken(checkoutToken)` ;
  - verifie cote front que `getCheckoutAmountDue(checkoutState) === 0` ;
  - appelle `submitFreeCheckoutRequest({ checkoutState, idempotencyKey: checkoutToken })` ;
  - n appelle jamais Stripe et ne touche jamais `create-checkout-session`.
- En succes : meme ecran de confirmation que Stripe.
- En `402 PAYMENT_REQUIRED` : ecran d echec clair avec retry vers `origin`.

### `purchaseFlowService.js`
- Nouveau helper `getCheckoutAmountDue(checkoutState)` : utilise `amountToPay` s il existe, sinon `remainingToPay`.
- Nouveau helper `submitFreeCheckoutRequest({ checkoutState, idempotencyKey })` : `POST /api/client/checkout/finalize-free`.
- `finalizePurchase(...)` ne depend plus de `mock-pay` : tout path 0 EUR legacy reutilise `finalize-free`.

### Tests frontend
- `tests/p0/purchaseFlowService.zeroPayment.wiring.test.js` verrouille :
  - le calcul du montant du ;
  - le POST vers `/api/client/checkout/finalize-free` avec `checkoutState + idempotencyKey` ;
  - la remontee claire d une erreur `402 PAYMENT_REQUIRED`.

## Phase P1-1 -- Durcissement roles dev/admin + rate-limit auth

> Section ajoutee le 2026-06-23. Cette phase ferme deux risques P1 visibles dans les audits 09/13/19/35 : la confusion entre `dev` et `admin`, et l absence de rate-limits dedies sur les routes d authentification sensibles.

### Principe
- `middlewares/requireDev.js` distingue maintenant clairement :
  - `requireDev` / `requireAdminOrDev` -> `admin` + `dev` autorises ;
  - `requireStrictDev` -> `dev` uniquement.
- `routers/gestionUsersRouter.js` passe par `requireAdminOrDev` pour laisser un admin gerer les comptes usuels.
- `controllers/gestionUsersController.js` refuse a un admin de creer ou promouvoir un compte `dev`, tout en gardant la gestion des comptes `admin` / `client`.

### Auth rate-limit
- `routers/authRouter.js` applique un rate-limit dedie a `POST /auth/login` (5 tentatives / 15 min / IP, successful logins skipped).
- `routers/passwordResetRouter.js` applique des rate-limits dedies a `POST /request`, `POST /validate` et `POST /complete`.
- Les messages de rate-limit restent generiques et ne revelent ni existence d email ni etat du token.

### Routes concernees
- Strict dev :
  - `POST /api/dev/create-user`
  - toutes les routes deja branchees sur `requireStrictDev` (site status, mail templates, themes, etc.)
- Admin/dev :
  - `GET /api/gestion/users`
  - `POST /api/gestion/users`
  - `PUT /api/gestion/users/:id`
  - les routes deja branchees sur `requireAdminOrDev` (clients, editorial content, admins, etc.)
- Auth rate-limited :
  - `POST /auth/login`
  - `POST /auth/password-reset/request`
  - `POST /auth/password-reset/validate`
  - `POST /auth/password-reset/complete`

### Impact metier
- Un admin ne peut plus utiliser les routes de gestion utilisateurs pour creer ou promouvoir un compte `dev`.
- Les routes admin/dev classiques restent accessibles aux admins lorsque c est voulu.
- Le brute-force login et le spam / token brute-force sur les resets sont ralentis sans casser le flux normal.

### Tests
- `tests/p1/security.roles.test.js` :
  - dev -> route strict dev OK ;
  - admin -> route strict dev refuse ;
  - client -> route strict dev refuse ;
  - admin -> gestion users OK pour client, refuse pour `dev` ;
  - dev -> gestion users OK pour `dev`.
- `tests/p1/auth.rateLimit.test.js` :
  - login normal OK ;
  - login -> 429 apres repetitions ;
  - password reset request -> 429 apres repetitions ;
  - password reset validate -> 429 apres repetitions ;
  - password reset complete -> 429 apres repetitions.

## Coffre de credentials `IntegratedApi` (Phase 1 — 2026-06)

Mono-tenant. Centralise les secrets de **fournisseurs tiers** (Stripe Institut,
Stripe Dev, Brevo) chiffrés au repos, lus via un contrat unique fail-loud.

- `models/IntegratedApi.js` — registre : `{ slug, name, provider, runtimeModel
  ('single'|'dual_environment'), mode ('test'|'prod'), modeUpdatedAt,
  credentials[] }`. Sous-doc `credentials[]` : `{ role, type
  ('secret_key'|'publishable_key'|'webhook_secret'|'api_key'), runtime
  ('test'|'prod'|null), encryptedValue, lastFourChars, isActive }`. Invariants
  (pre-validate) : runtimeModel↔runtime cohérents ; **1 seul actif** par
  (role, runtime).
- `utils/credentialVault.js` — AES-256-GCM. `encryptCredential` /
  `decryptCredential` (format `iv.authTag.ciphertext`, IV aléatoire),
  `validateCredentialVaultKey` (clé `CREDENTIAL_VAULT_KEY` = 64 hex ; **boot
  bloquant en production** si absente/invalide).
- `services/integratedApiCredentialService.js` — `getCredential(slug,{role,
  runtime})`, `getCredentials(slug,{runtime})`, `setIntegratedApiMode(slug,mode)`.
  Ordre : **vault prioritaire** → fallback `.env` **uniquement si**
  `ALLOW_ENV_CREDENTIAL_FALLBACK==='true'` (migration) → sinon **erreur typée**
  (jamais d'appel tiers dégradé). Aucune valeur de secret n'est jamais loggée.
- `seeders/seedIntegratedApisFromEnv.js` — pré-seed idempotent des 3 intégrations
  depuis `.env`, runtime déduit du préfixe (`sk_test_`/`sk_live_`…). Appelé au boot
  (`app.js`, hors mode test).
- **Migration** : `secret_key` Stripe Institut (`getStripe()` async dans 5 fichiers),
  `secret_key` Stripe Dev (`utils/stripeDevClient.js` → `getStripeDevClient()` lazy,
  consommé par devWebhook/contract/commissionPayment), `api_key` Brevo
  (`mailService.postToBrevo`). `publishable_key`/`webhook_secret` **seedés** mais
  lus encore en `.env` (étape suivante).
- Tests : `tests/p1/credentialVault.test.js`, `integratedApiCredentials.test.js`,
  `integratedApiSeed.test.js`.
- ⚠️ Une ancienne clé Stripe **live** orpheline (inutilisée) a été retirée du
  projet (voir rapports 46 et 52) ; **révocation Stripe = action manuelle**.
  Secrets crypto internes (`SESSION_SECRET`, `PWD_PEPPER`, …) et
  infra (`MONGODB_URI`) **restent en `.env`** (hors périmètre coffre).
- Détails : `Rapports/version 1/48_audit_env_keys_usage.md`,
  `Rapports/version 1/49_rapport_phase1_coffre_integrated_api.md`.

### Phase 1B (2026-06) — Stripe publishable/webhook au coffre + rotation

- **Webhooks** : `stripeController.handleWebhook` (Institut) et
  `devWebhookController.handleDevWebhook` (Dev) lisent le `webhook_secret` via
  `getCredential('stripe-institut'|'stripe-dev',{role:'webhook_secret'})`. **Raw
  body et vérification de signature inchangés** ; signature invalide → 400 ;
  secret indisponible → 500 contrôlé.
- **Publishable** : `stripeController.getConfig` (devenu async) et
  `contractController.getStripeDevConfig` renvoient la publishable key via le
  coffre (jamais de secret key exposée).
- Plus aucune lecture directe de `STRIPE_(DEV_)?WEBHOOK_SECRET` /
  `STRIPE_(DEV_)?PUBLISHABLE_KEY` dans `controllers/` (seul le seeder + la map de
  fallback + les fakes de test y réfèrent).
- **Rotation** : `scripts/rotateCredentialVaultKey.js` re-chiffre tous les
  `IntegratedApi.credentials[]` d'une ancienne clé vers une nouvelle.
  Dry-run par défaut, `--apply` pour persister ; lit
  `OLD_CREDENTIAL_VAULT_KEY`/`NEW_CREDENTIAL_VAULT_KEY` ; ne loggue jamais de
  valeur (slug/role/runtime/status uniquement). Primitives `encrypt/
  decryptCredentialWithKey` ajoutées à `utils/credentialVault.js`.
- Tests : `tests/p1/stripeCredentialMigration.test.js`,
  `stripeWebhookCredentialVault.test.js`, `credentialVaultRotation.test.js`.
- Détails : `Rapports/version 1/50_audit_phase1b_remaining_stripe_credentials.md`,
  `Rapports/version 1/51_rapport_phase1b_stripe_credentials_rotation.md`.

## SendLog & observabilité email Brevo (Phase 2 — 2026-06)

Trace les envois sortants et l'engagement, sans toucher aux flux métier.

- `models/SendLog.js` — un doc par envoi : `channel/provider/templateKey`,
  `recipientHash` (**SHA-256**, jamais l'email), `status`
  (`queued|sent|delivered|opened|bounced|failed`), `providerMessageId`, `subject`,
  `contextType/contextId` (optionnels), horodatages, `errorCode/errorMessageSafe`
  (jamais le payload brut). Index sur `providerMessageId`, `status+createdAt`,
  `createdAt`, `contextType+contextId`.
- `services/sendLogService.js` — `hashRecipient`, `createQueuedSendLog`,
  `markSendLogSent`, `markSendLogFailed`, `applyBrevoEvent`. Toutes les écritures
  sont **défensives** (un échec de log ne casse jamais l'envoi).
- `services/mailService.js` — `postToBrevo` (exporté) crée un SendLog `queued`
  puis `sent` (avec `messageId` Brevo) ou `failed` (`provider_not_configured` /
  `network_error` / `http_<status>`). Comportement métier (retour true/false)
  inchangé ; `fetch` désormais dans un try/catch.
- `controllers/brevoWebhookController.js` + `routers/brevoWebhookRouter.js` —
  `POST /api/webhooks/brevo` (public, exempté de `contractGuard` via
  `/api/webhooks/`). Événements `delivered/opened/hard_bounce/soft_bounce`
  corrélés par `providerMessageId`. Protection = secret partagé **optionnel**
  (`x-brevo-secret`/`?secret=`, vault `brevo/webhook_secret` ou
  `BREVO_WEBHOOK_SECRET`, comparaison timing-safe) ; sinon accepté + warning
  (limite V1). Jamais d'email loggé.
- `controllers/devDiagnosticController.js` + `routers/devDiagnosticRouter.js` —
  `GET /api/gestion/dev/send-logs` (`requireGestionRole` puis `requireStrictDev`).
  Retour de champs sûrs uniquement (jamais email/token/secret).
- Tests : `tests/p1/{sendLog,brevoWebhook,sendLogEndpoint}.test.js`.
- Détails : `Rapports/version 1/53_rapport_sendlog_brevo_observability.md`. Clé
  Stripe live orpheline supprimée du code (rapport 52).

## Bus d'événements backend (Phase 3 — 2026-06)

Socle event-driven **backend uniquement** (pas d'UI, pas d'automatisation no-code,
broadcast d'audit). 

- `constants/eventCatalog.js` — catalogue figé `{ name, domain, version,
  description, payload[] }` (domaines `sale/booking/refund/gift_card/commission/
  email/job`, ~24 events, v1).
- `models/EventLog.js` — log append-only `{ eventName, domain, version, actorType,
  actorId, source, contextType, contextId, payloadSafe, traceId, emittedAt }`.
  Index `eventName+createdAt`, `contextType+contextId`, `createdAt`,
  `domain+createdAt`. **payloadSafe : jamais email/secret/token**.
- `services/eventBusService.js` — `emitEvent(name, payload, options)` **persiste
  toujours** un EventLog (best-effort, ne throw jamais) + notifie les subscribers
  in-process ; `subscribe(name, handler)` (`'*'` = tout) ; un subscriber qui échoue
  **ne casse jamais** l'action métier. Redaction du payload (clés sensibles +
  emails). Pas de retry/cross-process (V1).
- `services/sendLogService.js` — chaque transition SendLog émet `email.queued/
  sent/failed/delivered/opened/bounced` (payload sûr, jamais l'email). `contextType`
  **auto-dérivé** du tag ; `contextId` explicite pour `sale` et `booking_confirmed`
  (via le 2e param `context` de `mailService.postToBrevo`). Autres contextId
  différés (dispatchers partagés — rapport 54).
- `GET /api/gestion/dev/events` (`requireStrictDev`) — diagnostic, champs sûrs
  uniquement.
- Tests : `tests/p1/{eventBus,sendLogEvents,eventLogEndpoint}.test.js`.
- Détails : `Rapports/version 1/54..56`. Migration notifications planifiée
  (rapport 55) ; lien futur Studio Email Template via `templateKey`/`email.*`.
