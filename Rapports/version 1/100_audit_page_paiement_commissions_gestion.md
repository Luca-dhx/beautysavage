# 100 — Audit de la page de paiement des commissions (espace gestion)

> Lecture seule.

## Cartographie
| Élément | Détail |
|---|---|
| Frontend | `public/js/modules/commissionPaymentModule.js` (préfixe `cpm-`) + `public/css/commissionPaymentModule.css` |
| Router | `routers/commissionPaymentRouter.js`, monté sur `/api/commissions` |
| Contrôleur | `controllers/commissionPaymentController.js` |
| Compte Stripe | **Developer** (`stripeDevClient`, slug `stripe-dev`) — l'institut paie la plateforme |
| Stripe.js (front) | config via `GET /api/contract/stripe-dev-config` (publishableKey Dev) |

## Endpoints appelés
| Endpoint | Rôle | Usage |
|---|---|---|
| `GET /payments` | admin+dev | liste mensuelle (getOrComputeCommissionPayment par mois) + settings + activatedAt |
| `POST /payments/:id/create-intent` | admin+dev | crée/réutilise un PaymentIntent Stripe Dev |
| `GET /payments/:id/check-status` | admin+dev | vérifie le PI et met à jour le statut |
| `POST /payments/:id/reset` | **dev only**, non-prod | remet à pending (tests) |
| `GET/PATCH /settings`, `/settings/reminders`, `/settings/simulated-date` | **dev only** | délai retard, rappels, date simulée |
| `GET /contract/stripe-dev-config` | — | publishableKey Dev |

## Flux de paiement (frontend)
1. `loadPayments` → `GET /payments` (mois + montants + statuts).
2. Au chargement, **auto-poll** des paiements `pending` ayant un `stripePaymentIntentId`
   (`check-status`) → resynchronise un paiement réglé hors-ligne.
3. Paiement : `createIntent` → `Stripe.elements(clientSecret)` → `confirmPayment` →
   `checkStatus` (poll).
4. `check-status` succeeded → `status='succeeded'`, `paidAt`, `commission.paid` (EventLog),
   `generateCommissionInvoice` (facture Stripe Dev, non bloquante).

## Affichage / statuts / UX
- Cartes par mois : montant, statut (pending/succeeded/failed), bouton payer, lien PDF
  facture (`stripeInvoicePdfUrl`), kebab (reset en dev).
- Statuts dérivés du `CommissionPayment` + retard (`latePaymentDays`, rappels).
- Simulateur de date (dev) pour tester les échéances.

## Sécurité / permissions
- 🟢 Toutes les routes derrière `requireAuth()` + `requireAdminOrDev` (paiement) ou
  `requireDevOnly` (settings/reset/simulated-date). Le périmètre `/api/gestion` impose déjà
  admin/dev en amont ? Non — `/api/commissions` est monté séparément, mais le router applique
  `requireAuth + requireAdminOrDev`. 🟢 OK.
- 🟢 `reset` et `simulated-date` bloqués en production (`NODE_ENV==='production'` → 403).
- 🟢 Le secret Stripe Dev n'est jamais exposé (seule la publishableKey via config).

## Cas limites
| Cas | Comportement |
|---|---|
| Mois déjà réglé | `create-intent` → **409** (status succeeded). 🟢 |
| Montant nul | total 0 → `getOrComputeCommissionPayment` marque **succeeded** direct (paidAt=periodStart). 🟢 |
| PI pending réutilisé | `create-intent` retrouve le PI : succeeded→marque payé+facture ; processing→renvoie le clientSecret ; canceled/requires_payment_method→réinitialise. 🟢 (idempotent en séquentiel) |
| Double-clic **concurrent** | 🔴 fenêtre : deux `create-intent` simultanés avant la 1re sauvegarde de `stripePaymentIntentId` → **deux PaymentIntents**. Risque de double charge si les deux sont confirmés (faible en pratique : 1 navigateur). |
| Paiement réglé mais navigateur fermé avant poll | 🟡 statut reste `pending` jusqu'au prochain chargement (auto-poll) — **le webhook Dev ne finalise PAS la commission** (cf. rapport 101). |
| Remboursement tardif sur mois courant pending | 🔴 `amount` **figé** (refreshCommissionPayment mort) → montant payé potentiellement **périmé**. |
| Échec paiement | `check-status` → `status='failed'` (réessayable). 🟢 |

## Réponses demandées
- **Cette page est-elle fiable ?** 🟡 **Globalement oui pour le cas nominal**, mais avec deux
  fragilités : montant figé (refresh mort) et finalisation par polling (pas webhook).
- **Paie-t-elle une facture mensuelle ?** ✅ **Oui** — un `CommissionPayment` par mois.
- **Paie-t-elle une commission cumulée ?** ❌ Non — strictement le mois sélectionné (ventes −
  remboursements du mois).
- **Paie-t-elle un abonnement ?** ❌ Non — l'abonnement mensuel (maintenance) est un flux
  **distinct** (contrat, `monthlyFee`, subscription Stripe Dev via dev webhook). La page
  commissions ne gère QUE les commissions sur ventes.
- **Risque de double paiement ?** 🟡 **Faible mais réel** : index unique `{month,year}` +
  garde `status==='succeeded'` empêchent de re-régler un mois ; reste la fenêtre de
  double-clic **concurrent** (deux PI). Pas de verrou applicatif avant le 1er PI.
- **Risque de mauvais montant ?** 🔴 **Oui** : `amount` calculé une seule fois à la création
  du doc et jamais rafraîchi (refreshCommissionPayment non appelé) → un remboursement réglé
  après création n'est pas répercuté avant paiement.

## Recommandations (sans implémentation)
- Rafraîchir `amount` (appeler `refreshCommissionPayment`) **avant** `create-intent` sur un
  paiement pending.
- Finaliser la commission **aussi** via le webhook Dev (handler dédié au PI commission), pas
  seulement par polling.
- Verrou applicatif (findOneAndUpdate conditionnel) avant la création du PI pour fermer la
  fenêtre de double-clic concurrent.
