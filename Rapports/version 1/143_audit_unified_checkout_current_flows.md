# 143 — Audit des flux de paiement actuels (avant UnifiedCheckout)

> État des lieux de TOUS les chemins de paiement avant la création du moteur **UnifiedCheckout**.
> Documentation uniquement — aucun flux modifié. Objectif : cartographier les 9 types de paiement
> et leurs divergences pour les unifier sans régression.

## Vue d'ensemble — 2 comptes Stripe, ~6 mécaniques distinctes
| Domaine | Compte Stripe | Mécanique Stripe actuelle | Entrée | Finalisation |
|---|---|---|---|---|
| Prestation / formation / produit / carte cadeau / panier (client) | **Institut** | PaymentIntent + **Stripe Elements** (clientSecret) | `POST /api/stripe/create-checkout-session` (`stripeCheckoutService.createCheckoutSessionFromRequest`) | webhook `payment_intent.succeeded` → `checkoutFacade.processCheckoutStatePurchase` |
| Achat 0 € (100 % carte cadeau / gratuit) | — | aucun Stripe | `POST /api/client/checkout/finalize-free` (`checkoutFacade.finalizeFreeCheckout`) | direct (idempotence `free_<key>`) |
| Acompte prestation | **Institut** | PaymentIntent Elements (montant = acompte) | idem create-checkout-session (service+deposit) | idem webhook → `processServiceCheckoutStatePurchase` |
| Commission mensuelle (institut→plateforme) | **Dev** | PaymentIntent (`stripeDevPaymentService.createCommissionPaymentIntent`) | `POST /api/commissions/payments/:id/create-intent` | webhook Dev `payment_intent.succeeded` → `finalizeCommissionPaymentById` |
| Frais de lancement contrat | **Dev** | PaymentIntent (`stripeDevContractBillingService.createLaunchIntent`) | `POST /api/contract/create-launch-intent` | webhook Dev → `launchFee.paid` |
| Abonnement mensuel contrat | **Dev** | **SetupIntent + Subscription** (`createMonthlySetup` + `subscriptions.create`) | `POST /api/contract/create-monthly-setup` | webhook Dev `setup_intent.succeeded` → subscription |

## Étapes communes déjà mutualisées (post-refactor F1/F2)
- **Pricing serveur faisant foi** : `checkoutPricingService.buildServerCheckoutPricing` + `assertClientPricingMatchesServer` (B2) — côté client Institut uniquement.
- **Consentements légaux** : `legalConsentService.deriveLegalRequirements` + `validateCheckoutLegalConsents` (A1).
- **Offre prête** : `offerReadinessService.assertCheckoutFormationsPurchasable` (A7).
- **Carte cadeau = moyen de paiement** : `checkoutGiftCardService.planGiftCardUsage`/`finalizeGiftCardUsage` (réservation + débit atomique).
- **Persistance vente + effets** : `checkoutPersistenceService.persistSale` + `runPostSaleSideEffects` (email/notif/facture).
- **Idempotence** : index unique `Sale.stripePaymentIntentId` (E11000) ; `free_<key>` pour 0 € ; idempotencyKey mensuel commission.

## Divergences à résorber (pourquoi un moteur unifié)
1. **2 UI de paiement** : Institut = Stripe **Elements** (clientSecret embarqué) ; contrat = Elements aussi (admin-login modal). → cible : **Stripe Checkout hébergé** (redirection) pour montant > 0, finalize-free pour 0 €.
2. **Validation dispersée** : pricing/legal/offer appliqués dans `stripeCheckoutService` (client) mais PAS dans les flux Dev (commission/contrat) — chacun valide à sa façon.
3. **Création d'intent dupliquée** : `paymentIntents.create` à 4 endroits (stripeCheckoutService, stripeDevPaymentService, stripeDevContractBillingService ×2) + SetupIntent/Subscription. Métadonnées et idempotence ad hoc par flux.
4. **Finalisation hétérogène** : webhook Institut → `processCheckoutStatePurchase` ; webhook Dev → switch (commission / launch / subscription). Pas de point d'entrée unique « finalize(checkout) ».
5. **Pas d'objet "checkout" persistant unifié** : `StripeCheckoutIntent` (Institut) et `ContractCheckoutIntent` (Dev) sont deux modèles parallèles ; `CommissionPayment` porte son propre `stripePaymentIntentId`.

## Inventaire des modèles d'intent
- `StripeCheckoutIntent` (Institut) : `checkoutState`, `userId`, `clientIp`, `stripeSessionId`.
- `ContractCheckoutIntent` (Dev) : `contractId`, `type:launch|monthly`, `stripePaymentIntentId`/`stripeSetupIntentId`, `processed`.
- `CommissionPayment` : `stripePaymentIntentId`, `stripeInvoiceId`, `status`.

## Codes & garde-fous (réutilisables tels quels)
`CHECKOUT_AMOUNT_MISMATCH`, `AMOUNT_TOO_LOW`, `PAYMENT_REQUIRED`(402), `LEGAL_CONSENT_REQUIRED`,
`OFFER_*`, `SESSION_FULL`, `ALREADY_PURCHASED`, `SLOT_*`, `BOOKING_SUSPENDED`, `GIFT_CARD_*`.

## Contraintes pour l'unification (zéro régression)
- Les webhooks Stripe (Institut + Dev) + leur idempotence sont couverts par tests (353 verts) → toute unification doit **réutiliser** `processCheckoutStatePurchase` / `finalizeCommissionPaymentById` / handlers contrat existants comme « finalizers » derrière l'API unifiée.
- Le passage Elements → Checkout hébergé change l'UI et l'entrée (création d'une **Checkout Session** au lieu d'un PaymentIntent), mais **PAS** la finalisation (webhook `checkout.session.completed`/`payment_intent.succeeded` → mêmes finalizers).
- La carte cadeau (réservation) doit rester appliquée avant la redirection Checkout (montant à charger = serveur après cartes cadeaux).

→ Roadmap d'implémentation détaillée : rapport **144**.
