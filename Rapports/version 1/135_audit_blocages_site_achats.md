# 135 — Audit des blocages site / accès / achats

> Tous les mécanismes qui bloquent le site, les achats, les réservations ou le paiement.
> Source : middlewares + services de validation (toute la logique est en couche middleware/
> service, pas HTTP → réutilisable tel quel par React).

## Blocages SITE COMPLET
| Blocage | Source | Modèle | Statut/Code | Message actuel | Qui voit | Message cible React | UX proposée |
|---|---|---|---|---|---|---|---|
| **Maintenance** | `maintenanceGuard.js` | `SiteStatus.currentStatus='maintenance'` | 503 `MAINTENANCE` (+`Retry-After:120`) | « Le site est en maintenance, vous pourrez bientôt y accéder. » | tous sauf dev | idem | Page d'état plein écran (logo + ETA), polling `/api/site-status`, pas de header/nav |
| **Contrat inactif/pending** | `contractGuard.js` | `Contract.status≠active` | 503 `CONTRACT_INACTIVE` / page HTML | `Contract.pendingMessage` (défaut « Site en cours de configuration. Revenez bientôt. ») | visiteurs (dev bypass) | idem | Page d'attente brandée ; sablier ; message dynamique |
| **Admin suspendu** | `siteStatusGuards.js` | `SiteStatus=suspended` + role admin | 403 `SUSPENDED_ADMIN_LOGOUT` | « Le site est suspendu, l'accès administrateur est impossible jusqu'à réactivation. » | manager | idem | Écran logout manager + contact dev |

## Blocages ACHAT / RÉSERVATION / PAIEMENT
| Blocage | Source | Modèle/champ | Statut/Code | Message actuel | Portée | Message cible React | UX proposée |
|---|---|---|---|---|---|---|---|
| **Site suspendu (achats)** | `requireSiteActiveForPurchases` | `SiteStatus=suspended` | 503 `SITE_SUSPENDED` | « Achats temporairement indisponibles » | achats/bookings | idem | Bannière + CTA désactivés, toast à la tentative |
| **Client suspendu** | `serviceBookingController` / `stripeCheckoutService` | `User.bookingSuspended` | 403 `BOOKING_SUSPENDED` | « Votre compte est suspendu suite à des absences répétées… » / « Compte suspendu — réservation impossible. » | bookings prestation | idem | Bandeau compte + contact institut, bouton réserver désactivé |
| **Offre distancielle sans accès** | `offerReadinessService` | `Formation.type=distanciel` accès immédiat sans `accessUrl` | 409 `OFFER_ACCESS_UNAVAILABLE` | « …accès immédiat mais aucun accès n'est configuré. Achat impossible. » | formation | idem | Badge « bientôt disponible », achat masqué |
| **Acompte non supporté** | `offerReadinessService` | `Service.paymentType=deposit` & `balanceSettlementMode≠pay_on_site` | 409 `OFFER_BALANCE_UNSUPPORTED` | « …acompte avec solde à régler ultérieurement, fonctionnalité non encore disponible. » | prestation | idem | Réservation masquée pour ces prestations |
| **Consentement légal requis** | `legalConsentService` | `checkoutState.legal` (CGV/waiver/ack) | 400 `LEGAL_CONSENT_REQUIRED` | « Veuillez accepter les CGV. » / waiver rétractation / ack prestation datée | tous achats | idem | Checkboxes bloquantes au checkout, erreurs inline |
| **Montant divergent** | `checkoutPricingService.assertClientPricingMatchesServer` | pricing serveur | 400 `CHECKOUT_AMOUNT_MISMATCH` | « Montant client (x) différent du montant serveur (y). » | tous achats | message générique « Le panier a été recalculé, réessayez. » | Re-fetch pricing serveur, recalcul transparent (B2 = serveur fait foi) |
| **Montant < 0,50 €** | `stripeCheckoutService` | pricing | 400 `AMOUNT_TOO_LOW` | « Le montant minimum pour un paiement par carte est de 0.50 EUR. » | achats Stripe | idem | Forcer chemin 0 € (finalize-free) si applicable |
| **Solde restant dû (0 €)** | `checkoutPersistenceService.assertZeroRemainingForFreeOrder` | pricing | 402 `PAYMENT_REQUIRED` | « Un montant reste dû: ce paiement ne peut pas être finalisé sans règlement. » | finalize-free | idem | Rediriger vers paiement Stripe |
| **Session complète** | `stripeCheckoutService` / finaliseurs | `FormationSession.reservedCount≥maxClients` | 409 `SESSION_FULL` | « Session complete. » | formation présentielle | « Session complète » | Slot grisé, liste d'attente (V2) |
| **Déjà acheté** | finaliseurs / `stripeCheckoutService` | `Sale`/`Purchase` | 409 `ALREADY_PURCHASED` | « Vous avez déjà acheté cette session. » / UI « Ouvrez Mes formations » | formation | idem | CTA « Accéder à ma formation » |
| **Créneau indisponible** | `serviceAvailabilityService.assertServiceSlotBookable` | `ServiceBooking`/schedule | 409 `SLOT_PAST`/`SLOT_OUTSIDE_SCHEDULE`/`SLOT_UNAVAILABLE` (+400/404) | « Le créneau… passé/occupé/hors emploi du temps. » | prestation | idem | Calendrier revalidé serveur, slot retiré + toast |

## Synthèse
- **2 blocages site-complet** (maintenance, contrat) + **1 manager** (suspension admin).
- **~10 blocages achat/booking** (suspension client, offre, légal, pricing, capacité, créneau).
- Tous exposent un **code stable** + message FR. React doit : (1) une **couche d'interception API** mappant code→UX (toast/bannière/écran), (2) des **écrans d'état pleine page** (maintenance, contrat, suspension), (3) **désactiver les CTA** en amont quand l'état est connu (`/api/site-status`, readiness offre), (4) laisser le **serveur faire foi** (ne jamais contourner un 4xx/402/409 côté client).
- Recommandation : centraliser le mapping code→message dans un **dictionnaire i18n** partagé front, alimenté par les codes listés ici (éviter de coder en dur les messages serveur).
