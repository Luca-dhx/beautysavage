# 138 — Roadmap React écran par écran

> Découpage par phases. Endpoints = ceux audités (cf. 139). Complexité : S/M/L/XL.

## Phase R0 — Setup
| Élément | Reco | Complexité | Risque |
|---|---|---|---|
| Stack | **Vite + React + TypeScript** | M | TS recommandé (API riche, codes/montants/statuts typés) |
| Design system | tokens depuis `/api/vitrine/theme` → CSS vars ; composants UI partagés | M | parité visuelle thème dynamique |
| Router | React Router (routes réelles, fin du `?slug=`) | S | redirections legacy `?slug=`→path |
| API client | wrapper fetch `credentials:include` + intercepteur codes (135) | M | mapping erreurs exhaustif |
| Auth guard | `/auth/me`, `RequireAuth`/`RequireRole` | S | — |

## Phase R1 — Vitrine (publique)
| Écran | Endpoints | Priorité | Complexité | Risque | Tests |
|---|---|---|---|---|---|
| Accueil | `/api/vitrine/home-settings`, `/highlights`, `/theme`, `/site-identity` | P1 | M | thème dynamique | snapshot rendu |
| Catalogue prestations | `/api/vitrine/services`, `/availability/*` | P1 | M | dispo créneaux | E2E browse |
| Catalogue formations | `/api/vitrine/shop`, `/formations/:id`, `/formations/:id/reviews` | P1 | M | sessions/places | — |
| Produits | `/api/vitrine/shop`, `/products/:id` | P1 | S | — | — |
| Cartes cadeaux | `/api/vitrine/gift-cards` | P1 | S | — | — |
| Pages légales/à propos | `/api/vitrine/editable-content`, `/pages/:slug` | P2 | S | — | — |
| Maintenance / état | `/api/site-status` | P1 | S | écran plein écran | E2E maintenance |

## Phase R2 — Checkout
| Écran | Endpoints | Priorité | Complexité | Risque | Tests |
|---|---|---|---|---|---|
| Panier | `cartService` (local + sync), `/api/vitrine/*` | P1 | M | sync local/serveur | — |
| Consentements légaux | `legalConsentService` (via checkout) | P1 | M | A1 (CGV/waiver/ack) | E2E consent manquant |
| Checkout Stripe | `POST /api/stripe/create-checkout-session`, `/config` | P1 | L | pricing serveur B2, mismatch | E2E paiement |
| Checkout 0 € / carte cadeau | `POST /api/client/checkout/finalize-free` | P1 | L | 402 PAYMENT_REQUIRED, idempotence | E2E 0€/giftcard |
| Résultat paiement | `GET /api/stripe/payment-result`, `/session-status` | P1 | M | retour redirect, statut | E2E succès/échec |

## Phase R3 — Manager (role admin)
| Écran | Endpoints | Priorité | Complexité | Risque | Tests |
|---|---|---|---|---|---|
| Login manager | `POST /auth/login` (blocked/reason) | P3 | S | onboarding | E2E login |
| Onboarding contrat | `/api/contract/*` (launch/monthly/verify/activate) + Stripe | P3 | XL | paiement contrat, états | E2E onboarding |
| Dashboard | `/api/gestion/sales/stats`, `/commissions/*` | P3 | M | — | — |
| Planning | `/api/gestion/sessions`, `/availability`, `/bookings` | P3 | L | anti-chevauchement | E2E planning |
| Réservations | `/api/gestion/bookings*` | P3 | M | annulation/no-show | — |
| Prestations CRUD | `/api/gestion/services`, `/practitioners` | P3 | L | acompte/options | — |
| Formations CRUD | `/api/gestion/formations`, `/sessions`, modules | P3 | L | présentiel/distanciel | — |
| Produits CRUD | `/api/gestion/business/products` | P3 | M | — | — |
| Cartes cadeaux | `/api/gestion/gift-cards` | P3 | M | — | — |
| Ventes / remboursements | `/api/gestion/sales`, `/refunds`, invoice | P3 | M | remboursement | E2E remboursement |
| **Commissions à payer** | `/api/commissions/*` | P3 | L | paiement commission (Stripe Dev) | E2E commission |
| Mon contrat | `/api/contract/active`, `/current` | P3 | S | — | — |
| Paramètres institut | `/api/gestion/site-identity`, `/themes`, `/pages-gestion` | P4 | M | — | — |

## Phase R4 — Dev (role dev)
| Écran | Endpoints | Priorité | Complexité | Risque | Tests |
|---|---|---|---|---|---|
| Contrats (CRUD) | `/api/contract` POST/DELETE/activate-free/cancel-immediate | P4 | L | états contrat | E2E accès dev |
| Commissions reçues | `/api/gestion/commissions/*` (config/stats) | P4 | M | — | — |
| IntegratedAPI / coffre | (routers credential/integrated) | P4 | M | secrets (jamais exposés) | secret scan |
| Email Template Studio | `/api/gestion/mails/*` | P4 | L | rendu/versioning | — |
| Logs (SendLog/EventLog/WebhookFailure/JobRun) | `/api/gestion/dev/*` | P4 | M | pagination (cf. 141) | — |
| Config plateforme / maintenance | `/api/gestion/site-status/*` | P4 | M | bascule maintenance | E2E maintenance |

## Phase R5 — Formation client (accès)
| Écran | Endpoints | Priorité | Complexité | Risque | Tests |
|---|---|---|---|---|---|
| Mes formations | `/api/client/me/formations` | P2 | M | accès distanciel | E2E distanciel |
| Détail formation + modules | `/api/client/formations/:id`, `/modules`, `/modules/:id` | P2 | M | vidéos/liens, progression | — |
| Mes prestations | `/api/client/me/booking-status`, `/bookings` | P2 | M | — | — |
| Mon compte | `/api/client/profile`, favoris, sales/invoice | P2 | S | — | — |

## Ordre recommandé
R0 → R1 → R2 → R5 (vitrine + client = `beautysavage.fr`, bascule apex) ‖ en parallèle R3 → R4
(manager+dev = `manager.beautysavage.fr`, bascule sous-domaine d'abord car audience interne).
