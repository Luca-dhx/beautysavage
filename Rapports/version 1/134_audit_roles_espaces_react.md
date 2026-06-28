# 134 — Audit rôles & espaces (cible React)

> Backend : `User.role ∈ {client, admin, dev}` (`models/user.js`, requis). Champs liés :
> `isActive`, `bookingSuspended`, `mustChangePassword`, `emailVerified`, `currentMode`
> (`vitrine|gestion` — **vestigial** en React, décision #4).

## Rôles backend (à CONSERVER tels quels)
| Rôle backend | Réalité métier | Libellé UI React |
|---|---|---|
| `client` | Acheteur final (vitrine) | **Public / Client** |
| `admin` | Gérante de l'institut | **Manager** |
| `dev` | Développeur / plateforme | **Développeur** |

**Décision tranchée :**
- **admin = Manager institut** (relabel UI uniquement).
- **dev = Développeur plateforme** (relabel UI uniquement).
- **NE PAS renommer les rôles backend** (`admin`/`dev` sont câblés dans middlewares, seeds, tests, contrats). Le relabel est purement front (mapping `admin→Manager`, `dev→Développeur`).

## Middlewares & garde-fous (source : `middlewares/`)
| Middleware | Rôles | Effet | Statut |
|---|---|---|---|
| `requireGestionRole()` | admin, dev | garde globale `/api/gestion/**` | 401/403 `FORBIDDEN_GESTION_ROLE` |
| `requireDev` = `requireAdminOrDev` | admin, dev | endpoints partagés gestion | 401/403 |
| `requireStrictDev` | dev | endpoints dev-only | 401/403 |
| `requireContractForAdmin()` | admin (dev bypass) | bloque admin si contrat no_contract/pending | 403 `{blocked, reason}` |
| `contractGuard()` | tous sauf dev | bloque le SITE si contrat ≠ active | 503 `CONTRACT_INACTIVE` / page HTML |
| `maintenanceGuard()` | tous sauf dev | bloque le SITE en maintenance | 503 `MAINTENANCE` |
| `requireSiteActiveForPurchases()` | acheteurs | bloque achats si site suspendu | 503 `SITE_SUSPENDED` |
| `requireAuth()` | tout connecté | exige session | 401 ou redirect login |

## Les 4 espaces cibles
### 1. Public (non authentifié + client)
- **Droits** : parcourir catalogue, acheter, réserver, accéder aux formations achetées, suivre réservations/remboursements.
- **Pages** : accueil, prestations, formations, produits, cartes cadeaux, panier, checkout, paiement, mon compte, mes formations, mes prestations, mes cartes cadeaux, favoris.
- **Endpoints** : `/api/vitrine/*` (public), `/api/client/*` (auth client), `/api/stripe/*`, `/auth/*`.
- **Restrictions** : email vérifié pour login client ; achats bloqués si site suspendu/maintenance/contrat inactif.

### 2. Client (sous-ensemble authentifié du public)
- Mêmes endpoints `/api/client/*` (requireAuth). Pas de rôle spécial (role=`client`).

### 3. Manager (role=`admin`)
- **Droits** : gérer l'institut (catalogue, planning, ventes, remboursements, commissions à payer, contrat).
- **Pages** : dashboard, planning, réservations, prestations, formations, produits, cartes cadeaux, ventes, remboursements, **commissions à payer**, mon contrat, paramètres institut (identité, thème, pages légales, statut site).
- **Endpoints** : `/api/gestion/**` (sauf dev-only), `/api/contract/*` (vue + activation), `/api/commissions/*` (paiement commissions).
- **Restrictions** : exige contrat **actif** (sinon onboarding) ; bloqué si site suspendu (`SUSPENDED_ADMIN_LOGOUT`) ; **NE voit PAS** : config commission, templates email, site-status mgmt, contrats CRUD, IntegratedAPI, logs (dev-only).

### 4. Developer (role=`dev`)
- **Droits** : tout + plateforme. **Bypass** contrat, maintenance, suspension.
- **Pages** : contrats (CRUD), commissions reçues, IntegratedAPI/coffre, Email Template Studio, SendLog/EventLog/WebhookFailureLog/JobRunLog, config commission, statut site, outils maintenance.
- **Endpoints dev-only** (`requireStrictDev`) : `/api/dev/**`, `/api/gestion/mails/**`, `/api/gestion/commissions/**` (config), `/api/gestion/site-status/**`, `/api/contract/` (POST/DELETE/activate-free/cancel-immediate/upload-temp), `/api/gestion/admins`, logs.

## Onboarding & activation contrat
- 1er login admin (`/auth/login`) → réponse `{ blocked:true, reason:'no_contract'|'pending' }` si pas de contrat actif.
- `admin-login.html` déclenche la **modal règlement** (8 slides : présentation → PDF → frais de lancement Stripe → abonnement mensuel → activation). Endpoints `/api/contract/*` (createLaunchIntent, createMonthlySetup, verify*, activate).
- Tant que contrat ≠ active : `contractGuard` sert une page d'attente (statut `pending` → `Contract.pendingMessage`).
- **dev** crée le contrat (`POST /api/contract`) et bypass tout.

## Recommandations React
- Garder les 3 rôles backend. Mapper en UI : `client→Public/Client`, `admin→Manager`, `dev→Développeur`.
- `currentMode` + `modeGuard` deviennent inutiles (espaces séparés par domaine/route, pas par toggle) → à neutraliser (sans suppression backend immédiate, cf. 141).
- Guard React : `<RequireRole roles=['admin','dev']>` pour le manager, `<RequireRole roles=['dev']>` pour les sections dev, `<RequireAuth>` pour le client. La vérité reste backend (401/403).
