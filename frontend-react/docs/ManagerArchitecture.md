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
