# FolderArchitecture — Beauty Savage React (global)

> Architecture globale du frontend React **parallèle** au Vanilla existant. Source de vérité
> technique inter-apps. Mise à jour OBLIGATOIRE à chaque sprint qui touche l'architecture globale.
> Liens : [Vitrine](./VitrineArchitecture.md) · [Manager](./ManagerArchitecture.md) ·
> [Contexte produit global](./FolderProjectContext.md).

## Vue d'ensemble
```
beautysavage.fr          → app React "vitrine" (public + client)
manager.beautysavage.fr  → app React "manager" (role admin) + section /dev (role dev)
backend Express (Node)   → API JSON + webhooks Stripe/Brevo (INCHANGÉ), /api proxifié par app
Vanilla (backend/public) → reste actif jusqu'à bascule (rollback)
```

## Monorepo `frontend-react/`
```
frontend-react/
  apps/
    vitrine/      # SPA publique + client (beautysavage.fr)
    manager/      # SPA manager + /dev (manager.beautysavage.fr)
  packages/
    api-client/   # client HTTP typé (fetch credentials:'include'), mapping codes erreur, hooks TanStack Query
    ui/           # design system (tokens depuis /api/vitrine/theme), composants partagés
    auth/         # session (/auth/me), guards RequireAuth / RequireRole, login
    config/       # env, constantes, dictionnaire codes erreur → UX
  docs/           # cette documentation (Folder*, Vitrine*, Manager*)
```

## Stack
- **Vite + React + TypeScript** (typage des payloads/erreurs/montants/statuts).
- **React Router** (routes réelles ; fin du routing `?slug=`/`?module=`).
- **TanStack Query** (cache/refetch/états serveur ; pas de Redux).
- **Zod** (validation des payloads API aux frontières — optionnel mais recommandé).
- CSS : **à décider** (CSS Modules vs Tailwind) — voir `packages/ui`. Le thème vient de `/api/vitrine/theme` (CSS custom properties), à conserver dynamique.
- **Playwright** (E2E) — plus tard (cf. rapport 140).

## Backend / API
- API JSON existante, **inchangée** (cf. rapport 139). Enveloppe `{ ok, ...data }` / `{ ok:false, error, code }`.
- Auth : cookie `beautysavage_session` (HttpOnly, signé, SameSite=Lax, Secure prod). `credentials:'include'` obligatoire.
- **Prérequis backend** : cookie élargi à `Domain=.beautysavage.fr` (partage session vitrine ↔ manager). CORS uniquement si API sur origine dédiée (évité par proxy `/api`).
- Paiement : **Stripe Checkout hébergé** (montant > 0) via le moteur **UnifiedCheckout** (rapports 143/144) ; **finalize-free** (0 €).

## Auth & routing
- Boot : `GET /auth/me` → `{ role, mustChangePassword }`. Guards React = UX ; le backend (401/403) reste l'autorité.
- `vitrine` : routes publiques + routes client (auth). `manager` : routes admin (RequireRole admin/dev) + `/dev` (RequireRole dev).
- Le toggle vitrine/gestion est **supprimé** (séparation par domaine, pas par mode).

## Conventions
- TypeScript strict ; payloads API typés dans `packages/api-client`.
- Erreurs : ne jamais se fier au texte `error` ; mapper le `code` via le dictionnaire (`packages/config`).
- Montants : formatage front (Intl `fr-FR`) ; le **serveur fait foi** (ne jamais recalculer un total à charger).
- Dates : ISO en transport, affichage `fr-FR`.
- Pas de secret côté front (clé Stripe publique via `/api/stripe/config`).

## Stratégie de migration (résumé)
- React construit en parallèle ; Vanilla conservé. Bascule **manager d'abord** (audience interne) puis **apex** (public). Rollback DNS/proxy/feature-flag. **Zéro changement d'endpoint.** Détails : rapports 137, 146, 149.

## Règle de documentation
Chaque sprint React met à jour la doc du scope touché (Vitrine* ou Manager*) **et** ce fichier +
[FolderProjectContext](./FolderProjectContext.md) si l'architecture globale change.

## MAJ U1 — Fondations UnifiedCheckout (backend)
Le moteur backend `UnifiedCheckout` (kinds institut: service/formation/product/gift_card/cart) est
livré en parallèle (rapport 151) : `models/UnifiedCheckout.js` + `services/checkout/unified/*`,
snapshots serveur (pricing/tax/legal), idempotence par clé, finaliseur qui DÉLÈGUE aux finaliseurs
existants. NON câblé aux endpoints live en U1. U2 = câblage + Stripe Checkout hébergé (redirection
`url`, webhook `checkout.session.completed`). Le client React (`packages/api-client`) consommera un
point d'entrée unique de paiement.

## MAJ U2 — UnifiedCheckout câblé + Stripe Checkout hébergé
Feature flag backend `CHECKOUT_HOSTED` (défaut false). `false` → Stripe Elements inchangé ;
`true` → `create-checkout-session` crée un UnifiedCheckout et renvoie `{ mode:'hosted', url }`
(redirection Stripe Checkout) ou `{ mode:'free', checkoutId }` (0 € → finalize-free). Webhook
`checkout.session.completed` → finalisation idempotente (délègue à `processCheckoutStatePurchase`).
Côté React : `packages/api-client` gère la réponse `mode:'hosted'` (redirection vers `url`) /
`mode:'free'` ; la bascule UI (consommer `url`) est le chantier R2.

## MAJ U3 — UnifiedCheckout plateforme (Stripe Dev)
Kinds plateforme ajoutés : `commission`, `launch_fee`, `subscription` (provider `stripe_dev`), flag
`PLATFORM_CHECKOUT_HOSTED` (défaut false). true → Stripe Checkout hébergé (mode payment commission/
launch, mode setup abonnement) ; finalisation par les webhooks Dev EXISTANTS. Indépendant du flag
institut `CHECKOUT_HOSTED`. Côté React : le Manager (R3) consomme `create-intent`/`create-launch-intent`/
`create-monthly-setup` → `{ mode:'hosted', url }` (redirection) ou ancien `clientSecret` (flag off).

## MAJ R0 — Infrastructure React posée (exécutée)
Le monorepo `frontend-react/` est **opérationnel** (npm workspaces) : apps `vitrine` + `manager`,
packages `config`/`api-client`/`auth`/`ui`. Stack figée : **Vite 5 + React 18 + TS strict + React
Router 6 + TanStack Query 5** ; tests **Vitest + Testing Library (jsdom)** ; lint **ESLint 9** (flat).
CSS = **tokens CSS variables** dans `@bs/ui` (pas de Tailwind). Alias `@bs/*` → `packages/*/src`
(pas d'étape de build des packages : source TS importée directement).
- **Proxy dev** : Vite proxifie `/api`, `/auth` (⚠️ l'auth est hors `/api`, montée sur `/auth` dans
  `app.js`) et `/uploads` vers `VITE_PROXY_TARGET` (défaut `http://localhost:3000`) → same-origin,
  pas de CORS, cookie `beautysavage_session` via `credentials:'include'`.
- **api-client** : `apiFetch`/`apiGet`/`apiPost`, `ApiError`, types (`Role`, `AuthUser`,
  `MoneyAmount`, `DateIso`, `ApiResult`), `getSession()` (GET `/auth/me`) + `logout()`.
- **auth** : `AuthProvider` (boot `/auth/me`, `loader` injectable pour tests), `useAuth`,
  `RequireAuth`, `RequireRole` ; relabel UI `admin→Manager`, `dev→Développeur` (rôles backend
  inchangés).
- **Validation** : `react:build` (2 apps), `react:test` (12 tests verts), `react:lint`,
  `typecheck` — tous verts. Suite backend inchangée (aucun fichier backend métier touché ; seuls des
  scripts `react:*` ajoutés au `package.json` racine).
- **Limite R0** : aucune vraie page métier (placeholders) ; seul `/auth/me` est appelé (boot).
  Prochaine phase **R1** = première vraie page vitrine. Cf. rapport 157.

## MAJ R1 — Catalogue vitrine public (exécuté)
Première consommation réelle de l'API publique (rapports 158/159). **Zéro changement backend.**
- **Proxy durci** : `PROXY_PATHS`/`buildProxyMap` dans `@bs/config` (source unique testée) ;
  `vite.shared.makeApiProxy` le réutilise pour les 2 apps (`/api`,`/auth`,`/uploads`).
- **`@bs/api-client/catalog`** : types publics (Service/Training/Product/GiftCardConfig/SiteStatus),
  format (prix fr-FR + médias `/uploads`), mappers tolérants, clients `services/shop/trainings/
  products/giftCards/site`. Le serveur fait foi sur les prix (jamais recalculés).
- **`@bs/ui`** : composants catalogue (`CatalogueGrid` responsive 1/2/3 col, `CatalogueCard`,
  `PriceLabel`, `MediaImage`, `SectionHeader`, `EmptyState`) — présentation pure (pas de dépendance
  data, props préformatées).
- **Vitrine** : pages réelles accueil + 4 catalogues (+ détails formations/produits/prestations),
  hooks TanStack Query (cache `/shop` partagé), états loading/error/empty, `SiteStatusBanner`.
- **Limite** : pas de checkout/paiement (R2) ; carte cadeau = config seule ; manager/dev intacts.
  26 tests frontend verts ; backend inchangé.

## MAJ Theme Foundation — Système de thème React (exécuté)
Fondation de thème **deux scopes** (`vitrine` / `panel`), couleurs **jamais en dur** dans les
composants (rapports 160/161/162). **Zéro changement backend** ; Vanilla intact.
- **`@bs/ui/theme`** : `ThemeTokens` (colors étendus + radius/shadow/font/spacing), `defaultVitrineTheme`
  (violet/rose, aligné Vanilla), `defaultPanelTheme` (bleu/ardoise, **distinct**), `themeToCssVars`
  (tokens → `--bs-*`), `applyThemeVars`, `mergeTheme`, `normalizeHex`, `ThemeProvider scope`,
  `useThemeTokens`.
- **CSS variables** : les composants `@bs/ui` lisent EXCLUSIVEMENT `--bs-color-*` / `--bs-radius` /
  `--bs-shadow` / `--bs-font-sans` / `--bs-space-*`. `tokens.css :root` = fallback ; le `ThemeProvider`
  réécrit ces vars sur `<html>` selon le scope.
- **Vitrine** : `VitrineThemeProvider` charge `/api/vitrine/theme` (best-effort, TanStack Query) →
  mappe vers une surcharge partielle (hex normalisés) → `ThemeProvider scope="vitrine"` ; fallback
  défaut si l'API échoue (jamais bloquant).
- **Manager** : `ThemeProvider scope="panel"` + `defaultPanelTheme` (pas d'endpoint → Theme Studio Dev
  futur, plan 161 : `/api/gestion/dev/themes/:scope`, dev-only).
- **Règle** : tout sprint React qui touche l'UI lit les tokens (`--bs-*`), jamais de hex en dur.

## MAJ T1 — Thème backend multi-scope (exécuté)
Le backend gère désormais deux scopes de thème (`vitrine` / `manager`) — rapports 163/164. **Aucune
régression** (endpoints/payload/couleurs inchangés sans config). 
- `models/Theme.js` : `+scope enum['vitrine','manager'] default vitrine` (legacy sans scope = vitrine)
  + champs additifs optionnels (typography/radius/shadow/spacing/metadata) + index unique partiel
  `theme_active_per_scope` (1 actif/scope).
- Endpoints : `GET /api/vitrine/theme` **conservé** (vitrine) ; **`GET /api/theme/:scope`** public
  (vitrine|manager, `theme:null` si aucun actif) ; CRUD dev `/api/gestion/themes` accepte `scope`,
  activation **par scope**.
- Migration `scripts/migrateThemesToScopes.js` (dry-run/`--apply`, idempotente).
- React : `@bs/api-client` `getThemeByScope(scope)` ; `@bs/ui` `mapBackendThemeToTokens` (mapping
  neutre réutilisé vitrine + manager). Manager : `PanelThemeProvider` charge `/api/theme/manager`
  (fallback `defaultPanelTheme`). Vitrine inchangée.

## MAJ R2A — Préparation checkout (panier, créneau, consentements)
Couche de **préparation** du checkout, **sans paiement** (rapports 165/166). Aucun appel Stripe /
create-checkout-session ; aucun changement backend.
- **`@bs/api-client/booking/`** : `availability` (jours/créneaux), `legalConsents`
  (`isLegalConsentComplete`), `checkoutPreparation` (`buildCheckoutPreparationPayload` — **pur**),
  types (AvailabilitySlot, SelectedServiceSlot, LegalConsentState, CheckoutLine, CheckoutPreparationPayload).
- **Vitrine** : `features/cart` (`CartProvider`/`useCart`, localStorage versionné, indicatif),
  `features/booking` (`AvailabilityCalendar`/`SlotPicker`/`ServiceBookingPanel`), `features/legal`
  (`LegalConsentChecklist`). Pages réelles `/panier` + `/checkout` (préparation, payload en debug).
- **Règle confirmée** : le backend fait foi (prix/dispo/lock) ; le front prépare seulement. Pas de
  lock de créneau côté front. Composants 100 % tokens `--bs-*` (aucun hex). 54 tests frontend verts.
- Prochaine : **R2B** (paiement Stripe Checkout hébergé).

## MAJ R2B — Paiement Stripe Checkout hébergé + finalize-free
Le checkout React appelle le **backend** pour payer (rapports 167/168). **Aucun Stripe.js / aucun
appel Stripe direct ; aucun changement backend.**
- **`@bs/api-client/checkout/`** : `createCheckoutSession({checkoutState})` (`/api/stripe/create-checkout-session`,
  body direct), `finalizeFreeCheckout` (`/api/client/checkout/finalize-free`), `getPaymentResult`
  (`/api/stripe/payment-result`), `buildServiceCheckoutState` (sans montant), `buildIdempotencyKey`.
- **`/checkout`** : bouton « Payer / Confirmer » → `hosted` (`window.location.assign(url)`) / `free`
  (finalize-free → `/paiement/succes`) / `elements` (flag off → message) / `401` (connexion requise,
  panier conservé) / erreur (ErrorState + mapping `@bs/config`).
- **`/paiement/succes`** (free / payment_intent_id → payment-result ; wording **prudent** si pending)
  et **`/paiement/annule`** (panier conservé).
- **Limite** : `success_url`/`cancel_url` hosted = backend (Vanilla) → flow free 100 % React ; hosted
  prêt côté React dès paramétrage backend (R2C). 71 tests frontend verts. Backend = source de vérité.

## MAJ R2C — Retour Stripe React + login client (exécuté)
La boucle paiement React est fermée (rapports 169/170). Backend touché **uniquement** sur les URLs de
retour + lecture session-status (aucun pricing/finalizer/consentement).
- **Backend** : `CHECKOUT_RETURN_BASE_URL` (env, fallback Vanilla, http(s) only → pas d'open redirect)
  → `success_url={base}/paiement/succes?session_id={CHECKOUT_SESSION_ID}&checkoutId=…`,
  `cancel_url={base}/paiement/annule`. `session-status` résout désormais les ids `cs_…` (Checkout
  Session → PaymentIntent).
- **api-client** : `getCheckoutSessionStatus(sessionId)` (mapping succeeded/pending/failed/unknown),
  `auth/login(email,password)` (cookie HttpOnly ; getSession/logout existants).
- **Vitrine** : `/paiement/succes` (free / session_id / payment_intent_id ; **panier vidé seulement si
  confirmé** ; wording prudent si pending), `/paiement/annule` (panier conservé), `/connexion`
  (`LoginPage` léger → `refresh()` + redirect interne validé). `/checkout` 401 →
  `/connexion?redirect=/checkout` (panier conservé). 91 tests frontend / 411 backend verts.
- **Limite** : retour React effectif si `CHECKOUT_RETURN_BASE_URL` défini (sinon Vanilla). Pas
  d'inscription/reset/OAuth.

## MAJ M1 — Identités de communication (backend, brique additive)
Fondation backend `CommunicationIdentity` (rapports 171/172) — **aucune UI React encore**, aucun
envoi migré, mailService/SendLog/webhook **non touchés**.
- Modèle `CommunicationIdentity` : rôles **support** (scope platform, dev) / **commerciale** (scope
  institute, admin) ; **client** jamais une identité (résolu depuis le contexte). status/active,
  vérification sender Brevo, domaine DNS (`domainAuthenticated`/`dnsRecords`). 1 actif par role/scope.
- Services : `communicationIdentityService` (create/verify/setActive/assertReady),
  `communicationBrevoSenderAdapter` (mockable), `communicationRoleResolver` (resolveSender/Recipient/
  MailEnvelope — **non câblé** aux envois, M2).
- Endpoints gestion : `/api/gestion/dev/communication-identities` (dev, support) +
  `/api/gestion/communication-identities` (admin/dev, commerciale). Aucun secret exposé.
- **Côté React (futur)** : le Manager/Dev consommera ces endpoints (UI de gestion des expéditeurs) —
  pas en M1. Le client React continue d'utiliser l'API existante ; rien ne change pour la vitrine.

## MAJ M2 — Moteur d'envoi e-mail par rôles (backend, brique additive)
Le backend possède désormais un **Mail Event Dispatch Engine** (rapports 173/174) : event métier →
règle (`constants/mailDispatchRules.js`) → fromRole/toRole → resolver M1 → template → gateway →
SendLog, **idempotent** (`models/MailEventDelivery.js`). Flag `MAIL_ROLE_RESOLVER_ENABLED=false` (défaut
→ no-op) ; les envois directs existants sont **conservés** (moteur en **shadow** pour éviter les
doublons). SendLog/EventLog **inchangés** (rôles tracés via `metadata.tags`). **Aucune UI React** — un
futur écran Manager/Dev affichera les règles + le journal `MailEventDelivery`. Rien ne change pour la
vitrine/client React.

## Sprint M3A — Notification Target Engine admin/dev (backend, rapports 175-176)

Même principe que M2 (mail dispatch) appliqué aux **notifications in-app** : `Notification.targetRole`
devient une **cible métier** `admin|dev` (enum, default admin, indexé) — l'audience/panel. `targetType`
(all/role/user) reste la granularité de livraison. Service `services/notificationTargetService.js`
(resolve/normalize/assert) + mapping type→audience. `triggerNotification(type, vars, options?)` persiste
toujours `targetRole` (3e arg optionnel, anciens appelants intacts). Deux endpoints filtrés :
`/api/gestion/notifications` (admin, legacy-safe `{$ne:'dev'}`) et `/api/gestion/dev/notifications`
(dev-only `requireStrictDev`). Backfill `scripts/backfillNotificationTargetRole.js` (dry-run/--apply,
non destructif). **Aucune UI React** en M3A. Règles mail M2 inchangées. Rien ne change pour la
vitrine/client. Suite : **M3B** (enrichissement contexte event).
