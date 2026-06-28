# 133 — Audit du site Vanilla actuel

> État des lieux du frontend Vanilla JS (backend/public) avant le chantier React. Aucune
> modification de code. 7 pages HTML, 2 SPA (vitrine / gestion), 72 modules JS, ~34 feuilles CSS.

## Architecture front actuelle
- **2 SPA indépendantes**, chargées par fichier HTML distinct (pas de toggle runtime) :
  - `vitrine.html` → `js/vitrine.js` (routing par `?slug=`/`?page=`, fetch `GET /api/vitrine/pages/:slug`, import dynamique `${slug}Module.js`, `renderPage(slot, {user,query,data})`).
  - `gestion.html` → `js/gestion.js` (routing par `?module=`, fetch `GET /api/gestion/pages-gestion/pages`, filtre par rôle, import `${module}Module.js`, `renderModule(container)`).
- **Pas de switch vitrine/gestion runtime** : `[data-mode-switch]` est `hidden` ; on bascule en chargeant une autre page HTML. Le champ `User.currentMode` (`vitrine|gestion`) + `modeGuard` sont **vestigiaux** côté UX React (décision produit #4).
- Auth : cookie `beautysavage_session` (signé, HttpOnly, sameSite=lax). `GET /auth/me` partout.
- 2 logins : `login.html` (client + bootstrap dev) ; `admin-login.html` (admin/dev + **modal règlement contrat 8 slides** avec Stripe.js).

## Table de migration (pages & SPA)
| Page actuelle | URL | Public/Manager/Dev/Client | JS | API utilisée | Migrer React ? | Priorité | Risque |
|---|---|---|---|---|---|---|---|
| Vitrine (SPA) | `/vitrine.html?slug=` | Public + Client | `vitrine.js` + ~24 modules | `/api/vitrine/*`, `/api/client/*`, `/api/stripe/*` | Oui | P1 | Moyen |
| Gestion (SPA) | `/gestion.html?module=` | Manager + Dev | `gestion.js` + ~30 modules | `/api/gestion/*`, `/api/contract/*`, `/api/commissions/*` | Oui | P3/P4 | Élevé |
| Login client | `/login.html` | Public | `modules/auth.js` | `/auth/login`, `/auth/me` | Oui | P1 | Faible |
| Login admin + règlement | `/admin-login.html` | Manager/Dev | `admin-login.js` | `/auth/login`, `/api/contract/*`, `/api/stripe/config` | Oui (onboarding manager) | P3 | Élevé |
| Maintenance | `/maintenance.html` | Public | `maintenance.js` | `/api/site-status` | Oui (page d'état) | P1 | Faible |
| Reset password (req) | `/reset-password-request.html` | Public | `modules/passwordResetRequest.js` | `/auth/password-reset/*` | Oui | P1 | Faible |
| Reset password | `/reset-password.html` | Public | `modules/resetPassword.js` | `/auth/password-reset/*` | Oui | P1 | Faible |

## Modules par audience (72 fichiers)
### Vitrine publique / client (≈24)
home, shop, services, serviceModule, serviceDetail, itemDetail, giftCards, giftCardPurchase, cart (+ cartService), checkout, paymentSimulation, paymentResult, invoice, myFormations, myFormationDetail, myFormationModuleDetail, myServices, myGiftCards, myGiftCardDetail, myAccount, myFavorites, signup, verifyEmail, refundTracking, sessionCanceledDecision, about, legalPage, socialLinks, naviguationVitrine, bookingCalendarComponent, giftCardModal, acquisitionNotificationService, vitrineNavigationHelper.

### Manager (institut / rôle admin) (≈14)
homeGestion, salesModule, planningModule, serviceManager, formationManager, productManager, clientManager, presentielSessions, distancielModules, notificationManager, legalPagesManager, monContrat (vue contrat), giftCard gestion, promotions (inclus dans managers CRUD), siteIdentity, siteStatus, themeManager, uiConfigManager, vitrineManager, aboutUsGestion, pageEditorial.

### Développeur plateforme (rôle dev) (≈10)
contractModule (cycle de vie contrat), commissionModule (stats/config), commissionPaymentModule (commissions reçues), mailTemplateEditor (Email Template Studio), naviguationGestion (éditeur nav), administrative, adminManager, userManager, userTestManager, devDiagnostic (logs via API).

### Partagé / UI (≈14)
auth, confirmActionModal, uiConfirmModal, emptyStateHelper, editableContentClient, editorialEditor, pageContentLoader, notificationWidget, etc.

## Dépendances CSS/JS
- CSS : `app.css` (variables thème `:root`, classes vitrine), `gestion.css`, + ~32 CSS par module (préfixes `cpm-`, `sdm-`, `stp-`, etc.). Thème dynamique via `/api/vitrine/theme` → CSS custom properties.
- JS : **aucun framework** (Vanilla ES modules), Stripe.js CDN (paiement), Bootstrap Icons. Tailwind config présent côté gestion (`tailwind-gestion.config.js`).
- Routing : query-param (`?slug=`, `?module=`) + `history.pushState` → à normaliser en routes React Router.

## Constats clés pour React
1. 2 SPA déjà séparées → migration **indépendante vitrine vs gestion**.
2. Routing piloté serveur (pages/modules/rôles renvoyés par API) → React définira son propre routing mais peut consommer les mêmes payloads.
3. Cart = localStorage + sync serveur (`cartService`).
4. `admin-login` embarque le **flow de paiement contrat** (onboarding manager) → écran complexe.
5. Pas de CORS (same-origin) → un sous-domaine manager nécessitera CORS + cookie `.beautysavage.fr` (cf. rapport 141).
