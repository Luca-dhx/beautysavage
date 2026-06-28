# ManagerArchitecture — app `manager` (institut + dev)

> Architecture technique de l'app React manager (`manager.beautysavage.fr`) incluant la section
> `/dev`. Scope à mettre à jour à chaque sprint manager/dev. Global :
> [FolderArchitecture](./FolderArchitecture.md). Produit : [ManagerProjectContext](./ManagerProjectContext.md).

## Accès & guards
- App protégée : `RequireRole(['admin','dev'])` au niveau racine.
- Section `/dev/*` : `RequireRole(['dev'])`.
- Onboarding : si login admin renvoie `{ blocked, reason:'no_contract'|'pending' }` → flux activation contrat avant accès dashboard.
- Le backend reste l'autorité (401/403 ; `requireGestionRole`, `requireStrictDev`, `requireContractForAdmin`).

## Routes Manager (role admin)
| Route | Écran | API |
|---|---|---|
| `/login` | Login manager | `POST /auth/login` |
| `/onboarding` | Activation contrat (règlement) | `/api/contract/*` (create-launch-intent, create-monthly-setup, verify-*, activate) + Stripe |
| `/` | Dashboard | `/api/gestion/sales/stats`, `/api/commissions/*` |
| `/planning` | Planning sessions/créneaux | `/api/gestion/sessions`, `/availability`, `/bookings` |
| `/reservations` | Réservations prestations | `/api/gestion/bookings*` |
| `/prestations` | Prestations + praticiennes | `/api/gestion/services`, `/practitioners` |
| `/formations` | Formations + sessions + modules | `/api/gestion/formations`, `/sessions` |
| `/produits` | Produits | `/api/gestion/business/products` |
| `/cartes-cadeaux` | Cartes cadeaux | `/api/gestion/gift-cards` |
| `/ventes` | Ventes | `/api/gestion/sales`, invoice |
| `/remboursements` | Remboursements | `/api/gestion/refunds` |
| `/commissions` | **Commissions à payer** | `/api/commissions/*` (create-intent, check-status) |
| `/mon-contrat` | Vue contrat | `/api/contract/active`, `/current` |
| `/parametres` | Identité, thème, pages légales, statut site | `/api/gestion/site-identity`, `/themes`, `/pages-gestion`, `/promotions` |

## Routes Dev (role dev)
| Route | Écran | API |
|---|---|---|
| `/dev/contrats` | Contrats (CRUD, activation, annulation) | `/api/contract` POST/DELETE/activate-free/cancel-immediate |
| `/dev/commissions` | Commissions reçues + config | `/api/gestion/commissions/*` |
| `/dev/integrations` | IntegratedAPI / coffre credentials | routers credential/integrated |
| `/dev/emails` | Email Template Studio | `/api/gestion/mails/*` |
| `/dev/logs/sendlog` | SendLog | `/api/gestion/dev/send-logs` |
| `/dev/logs/events` | EventLog | `/api/gestion/dev/*` |
| `/dev/logs/webhooks` | WebhookFailureLog | `/api/gestion/dev/*` |
| `/dev/maintenance` | Statut site / maintenance | `/api/gestion/site-status/*` |

## Onboarding contrat (flux)
1. Login admin → `{ blocked, reason }` si contrat non actif.
2. Écran règlement (équivalent de l'admin-login Vanilla 8 slides) : présentation → PDF + acceptation → **frais de lancement** (Stripe) → **abonnement mensuel** (Stripe) → activation.
3. Tant que contrat ≠ active : accès manager bloqué (`contractGuard` 503). `dev` bypass.
4. Cible UnifiedCheckout : `launch_fee` + `subscription` deviennent des "kinds" (rapport 144).

## Composants / stores / guards
- **Composants** (`packages/ui`) : ManagerLayout (nav latérale par catégories/rôle), DataTable (tri + pagination), CrudForm, Calendar (planning), StatCards, ContractWizard, RoleGate.
- **Stores** : TanStack Query (toutes les listes/CRUD) ; `sessionStore` (role) ; pas d'état global lourd.
- **Guards** : `RequireRole(['admin','dev'])` (manager), `RequireRole(['dev'])` (`/dev`), `RequireActiveContract` (admin).

## Pagination & listes
- Listes potentiellement longues (ventes, send-logs, event-logs, webhook-failures, clients, paiements commission) : pagination `?page=&limit=` → `{items,total,page,limit}` (à harmoniser backend, cf. rapport 141). DataTable consomme ce contrat.

## Erreurs
- `FORBIDDEN_GESTION_ROLE` (403) → écran refus. `SUSPENDED_ADMIN_LOGOUT` → logout + message. `CONTRACT_INACTIVE` → onboarding/attente. Dictionnaire code→UX partagé (`packages/config`).

## API utilisées (résumé)
`/auth/*`, `/api/gestion/**` (sauf dev-only pour admin), `/api/contract/*`, `/api/commissions/*`,
`/api/gestion/dev/*` (dev), `/api/gestion/mails/*` (dev), `/api/gestion/site-status/*` (dev).

## MAJ U3 — Onboarding contrat & commissions via Checkout hébergé (backend prêt)
Avec `PLATFORM_CHECKOUT_HOSTED=true` : `POST /api/contract/create-launch-intent` et
`/create-monthly-setup`, et `POST /api/commissions/payments/:id/create-intent` renvoient
`{ mode:'hosted', url }` → l'app Manager (R3) redirige vers Stripe Checkout (Dev) au lieu d'Elements.
- launch fee / commission : mode payment ; abonnement : mode setup (collecte du moyen de paiement).
- Finalisation : webhooks Dev existants (`payment_intent.succeeded`, `setup_intent.succeeded`) ;
  `checkout.session.completed` réconcilie l'UnifiedCheckout. Flag off → Elements (fallback) inchangé.

## MAJ R0 — Squelette app manager (exécuté)
L'app `apps/manager` est créée. **Guards de rôle** (cf. rapport 147) :
- `/login` public (placeholder login manager).
- Tout le reste sous `RequireRole(['admin','dev'], loginPath="/login")` + `ManagerLayout` (nav
  latérale filtrée par rôle ; le lien « Développeur » n'apparaît que pour `dev`) :
  `/` (dashboard), `/onboarding/contrat`, `/planning`, `/reservations`, `/prestations`,
  `/formations`, `/produits`, `/cartes-cadeaux`, `/ventes`, `/remboursements`, `/commissions`,
  `/parametres`.
- Section **`/dev/*`** sous un second guard `RequireRole(['dev'], deniedPath="/")` + `DevLayout` :
  `/dev`, `/dev/contrats`, `/dev/commissions`, `/dev/integrated-api`, `/dev/email-templates`,
  `/dev/send-logs`, `/dev/event-logs`, `/dev/webhook-failures`. Un admin qui tente `/dev` est
  renvoyé au dashboard.
Chaque page = `Placeholder`, **aucun appel métier** (boot `/auth/me` seul). Tests :
`apps/manager/src/App.test.tsx` (anonyme→login, admin→dashboard, dev→`/dev`, admin bloqué sur
`/dev`). L'autorité reste le backend (401/403) ; les guards React sont UX. Les vraies pages arrivent
en **R3**.

## MAJ Theme Foundation — Thème panel (exécuté)
Le manager applique le **thème scope=panel** via `ThemeProvider scope="panel"` (dans `main.tsx`),
utilisant `defaultPanelTheme` (`@bs/ui`) — palette **bleu/ardoise distincte** de la vitrine
(violet/rose). Les CSS vars `--bs-*` sont appliquées sur `<html>` ; les composants lisent ces tokens
(aucun hex en dur). **Aucun endpoint backend** de thème panel pour l'instant → le défaut fait foi ;
le **Theme Studio Dev** (plan rapport 161 : `GET/PUT /api/gestion/dev/themes/:scope`, **dev only**,
preview live + validation + versioning) permettra de le configurer. Test :
`apps/manager/src/theme.test.tsx` (dashboard rendu + thème panel appliqué, distinct vitrine).

## MAJ T1 — Thème panel branché au backend (scope manager)
Le manager ne dépend plus uniquement du défaut local : `PanelThemeProvider`
(`apps/manager/src/features/theme/`) charge **`GET /api/theme/manager`** via
`getThemeByScope('manager')` (`@bs/api-client`), mappe par `mapBackendThemeToTokens` (`@bs/ui`), et
applique `ThemeProvider scope="panel"`. **Fallback systématique** sur `defaultPanelTheme` si
`theme:null` (aucune config manager) ou erreur réseau — jamais bloquant, aucune couleur visible
changée sans config. Backend : modèle `Theme.scope` (vitrine|manager), 1 actif/scope (index unique
partiel), CRUD dev `/api/gestion/themes` scope-aware (activation par scope), migration
`scripts/migrateThemesToScopes.js`. Le **Theme Studio Dev** (plan 161) éditera ce scope manager.
Tests : `features/theme/themeMultiScope.test.tsx` (fallback null/erreur + couleur backend).

## MAJ M1 — Identités de communication (backend prêt pour le Manager)
Le backend expose désormais des endpoints gestion pour les **expéditeurs de communication** que le
Manager/Dev React consommera (UI non créée en M1) :
- **Dev** (`requireStrictDev`) : `/api/gestion/dev/communication-identities` — gère l'identité
  **support** (scope platform) : `GET /`, `POST /support`, `POST /:id/request-verification|
  confirm-verification|set-active|refresh`.
- **Admin/Dev** (`requireAdminOrDev`) : `/api/gestion/communication-identities` — gère l'identité
  **commerciale** (scope institute) ; un admin **ne peut pas** gérer une identité support (403).
- Chaque identité : `email`, `displayName`, `status` (unverified/verification_pending/verified/
  disabled), `active`, vérification sender **Brevo** (Brevo envoie l'OTP), domaine DNS
  (`domainAuthenticated`/`dnsRecords`). Payload **sans secret**.
- Une future page Manager « Identités de communication » (dev: support, admin: commerciale) +
  écran de vérification sender/DNS s'appuiera sur ces endpoints. **client** n'est jamais configurable.
