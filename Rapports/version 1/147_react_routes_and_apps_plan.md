# 147 — Plan des routes & apps React

> Cartographie des routes par app, remplaçant le routing `?slug=`/`?module=` du Vanilla.
> Détails par scope : `docs/VitrineArchitecture.md`, `docs/ManagerArchitecture.md`.

## App `vitrine` (beautysavage.fr)
### Publiques
`/` · `/prestations` · `/prestations/:slug` · `/formations` · `/formations/:id` · `/produits` ·
`/produits/:id` · `/cartes-cadeaux` · `/a-propos` · `/cgv` · `/mentions-legales` ·
`/confidentialite` · `/maintenance` · `/suivi-remboursement/:token`.

### Client (RequireAuth)
`/panier` · `/checkout` · `/paiement` (retour Stripe) · `/mon-compte` · `/mes-formations` ·
`/mes-formations/:id` · `/mes-prestations` · `/mes-cartes-cadeaux` · `/favoris`.

### Auth
`/connexion` (login client) · `/inscription` · `/verifier-email` · `/mot-de-passe/*` (reset).

## App `manager` (manager.beautysavage.fr)
### Manager (RequireRole admin/dev, RequireActiveContract pour admin)
`/connexion` (login manager) · `/onboarding` (activation contrat) · `/` (dashboard) · `/planning` ·
`/reservations` · `/prestations` · `/formations` · `/produits` · `/cartes-cadeaux` · `/ventes` ·
`/remboursements` · `/commissions` · `/mon-contrat` · `/parametres/*` (identité, thème, pages, promos, statut site).

### Dev (RequireRole dev)
`/dev/contrats` · `/dev/commissions` · `/dev/integrations` · `/dev/emails` · `/dev/logs/sendlog` ·
`/dev/logs/events` · `/dev/logs/webhooks` · `/dev/maintenance`.

## Mapping Vanilla → React (redirections legacy)
| Vanilla | React |
|---|---|
| `vitrine.html?slug=home` | `/` |
| `vitrine.html?slug=shop` | `/formations` `/produits` (selon onglet) |
| `vitrine.html?slug=checkout` | `/checkout` |
| `vitrine.html?slug=payment&payment_intent=…` | `/paiement?payment_intent=…` |
| `vitrine.html?slug=myformations` | `/mes-formations` |
| `gestion.html?module=salesModule` | `/ventes` |
| `gestion.html?module=planningModule` | `/planning` |
| `gestion.html?module=commissionPaymentModule` | `/commissions` |
| `gestion.html?module=contractModule` | `/dev/contrats` |
| `gestion.html?module=mailTemplateEditorModule` | `/dev/emails` |
| `admin-login.html` | `manager` `/connexion` + `/onboarding` |

> Prévoir des redirections (proxy/route) des anciennes URLs `?slug=`/`?module=` vers les nouvelles
> routes pendant la cohabitation, pour ne pas casser les liens existants.

## Guards par zone
- vitrine public : aucun ; vitrine client : `RequireAuth`.
- manager : `RequireRole(['admin','dev'])` + `RequireActiveContract` (admin) ; `/dev/*` : `RequireRole(['dev'])`.
- Autorité = backend (401 → login, 403 → écran refus). Les guards React sont UX.

## Layouts
- vitrine : `PublicLayout` (header catalogue/panier/compte, footer légal) ; pages d'état plein écran (maintenance/contrat/suspension) hors layout.
- manager : `ManagerLayout` (nav latérale par catégories, filtrée par rôle) ; `OnboardingLayout` (wizard contrat) ; `DevLayout` (sous-section `/dev`).
