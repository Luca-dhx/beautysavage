# VitrineArchitecture — app `vitrine` (public + client)

> Architecture technique de l'app React publique/client (`beautysavage.fr`). Scope à mettre à jour
> à chaque sprint vitrine. Global : [FolderArchitecture](./FolderArchitecture.md). Produit :
> [VitrineProjectContext](./VitrineProjectContext.md).

## Routes
### Publiques
| Route | Écran | API |
|---|---|---|
| `/` | Accueil | `/api/vitrine/home-settings`, `/highlights`, `/theme`, `/site-identity` |
| `/prestations` `/prestations/:slug` | Catalogue + détail prestation (calendrier) | `/api/vitrine/services`, `/availability/*` |
| `/formations` `/formations/:id` | Catalogue + détail formation | `/api/vitrine/shop`, `/formations/:id`, `/formations/:id/reviews` |
| `/produits` `/produits/:id` | Catalogue + détail produit | `/api/vitrine/shop`, `/products/:id` |
| `/cartes-cadeaux` | Cartes cadeaux | `/api/vitrine/gift-cards` |
| `/cgv` `/mentions-legales` `/confidentialite` `/a-propos` | Pages éditoriales | `/api/vitrine/pages/:slug`, `/editable-content` |
| `/maintenance` | Écran d'état | `/api/site-status` |

### Client (auth)
| Route | Écran | API |
|---|---|---|
| `/panier` | Panier | `cartService` (local + sync) |
| `/checkout` | Consentements + récap | `/api/vitrine/*`, pricing serveur |
| `/paiement` | Redirection Stripe Checkout / résultat | `/api/stripe/create-checkout-session`, `/payment-result` |
| `/mon-compte` | Profil | `/api/client/profile`, favoris, sales/invoice |
| `/mes-formations` `/mes-formations/:id` | Accès formations + modules | `/api/client/me/formations`, `/formations/:id`, `/modules/:id` |
| `/mes-prestations` | Réservations | `/api/client/me/booking-status`, `/bookings` |
| `/mes-cartes-cadeaux` | Cartes cadeaux | `/api/client/gift-cards` |
| `/favoris` | Favoris | `/api/client/favorites` |
| `/suivi-remboursement/:token` | Suivi (public token) | `/refund-tracking/:token` |

## Checkout (cœur)
- **Panier** : `cartService` (localStorage + sync serveur).
- **Consentements** : CGV + waiver rétractation (distanciel immédiat) + ack prestation datée → bloquants (code `LEGAL_CONSENT_REQUIRED`).
- **Paiement > 0** : `POST /api/stripe/create-checkout-session` → (cible) **Stripe Checkout hébergé** → redirection ; retour `success_url` → `/api/stripe/payment-result`.
- **Paiement 0 €** : `POST /api/client/checkout/finalize-free` (100 % carte cadeau / gratuit), idempotent.
- **Carte cadeau** : appliquée serveur (réservée), capée au solde ; montant à charger = serveur après cartes cadeaux.
- **Pricing serveur fait foi** : ne jamais recalculer côté front ; mismatch → `CHECKOUT_AMOUNT_MISMATCH`.

## Accès formation
- Distanciel : accès immédiat (modules/vidéos/liens) après achat ; à vie. Présentiel : session + participants.
- Endpoints : `/api/client/formations/:id`, `/modules`, `/modules/:id`.

## Composants / stores / guards
- **Composants** (`packages/ui`) : Layout public, Header (panier/favoris/compte), CatalogCard, ServiceCalendar, CartDrawer, ConsentCheckboxes, StatePage (maintenance/contrat/suspension), PriceTag.
- **Stores** : TanStack Query (données serveur) ; `cartStore` (local + sync) ; `sessionStore` (`/auth/me`).
- **Guards** : `RequireAuth` (routes client) ; redirection login si 401.

## Erreurs (mapping code → UX, cf. rapport 135)
- Site : `MAINTENANCE` / `CONTRACT_INACTIVE` / `SITE_SUSPENDED` → **StatePage** plein écran.
- Achat : `LEGAL_CONSENT_REQUIRED` (inline), `CHECKOUT_AMOUNT_MISMATCH` (recalcul transparent), `SESSION_FULL`/`ALREADY_PURCHASED`/`SLOT_*` (toast + CTA adapté), `OFFER_*` (CTA masqué en amont), `PAYMENT_REQUIRED` (→ paiement).
- Pré-désactivation des CTA via `/api/site-status` + flags catalogue `purchasable/bookable` (à exposer, cf. 141).

## Responsive
- Mobile-first ; Stripe Checkout hébergé = paiement mobile natif. Catalogue en grille adaptative ; calendrier prestation tactile.

## MAJ U1 — Checkout via UnifiedCheckout (câblage U2)
Le checkout vitrine consommera le moteur UnifiedCheckout : un appel `createCheckout` côté client →
réponse `{ mode:"hosted", url }` (redirection Stripe Checkout hébergé, remplace Elements) ou
`{ mode:"free", saleId }` (finalize-free, 0 €). Retour via `success_url` → `/api/stripe/payment-result`.
En U1 le moteur est posé côté backend (non câblé) ; le front garde le flux actuel jusqu'à U2. Le
pricing serveur fait toujours foi ; la carte cadeau reste un moyen de paiement capé au solde.

## MAJ U2 — Checkout hébergé (backend prêt)
`POST /api/stripe/create-checkout-session` (flag `CHECKOUT_HOSTED=true`) renvoie `{ mode:'hosted',
url, checkoutId }` → l'app vitrine redirige vers `url` (Stripe Checkout) ; retour via `success_url`.
0 € → `{ mode:'free' }` → `finalize-free`. Le client API (R2) doit gérer ces deux modes + la
redirection. Tant que R2 n'est pas livré, le front Vanilla utilise Elements (flag false).

## MAJ R0 — Squelette app vitrine (exécuté)
L'app `apps/vitrine` est créée (Vite + React Router + TanStack Query + `AuthProvider`). **Routing
placeholder** sous `PublicLayout` (header catalogue/panier/connexion + footer légal) :
`/`, `/prestations`, `/formations`, `/formation/:id`, `/produits`, `/cartes-cadeaux`, `/connexion`,
`/paiement/succes`, `/paiement/annule`, et — sous `RequireAuth(loginPath="/connexion")` —
`/panier`, `/checkout`. Chaque page = composant `Placeholder` (titre + description + lien doc),
**aucun appel métier** (seul `/auth/me` au boot via `AuthProvider`). Les routes/écrans/API réels
décrits ci-dessus seront branchés à partir de **R1** (catalogue) puis **R2** (checkout hébergé).
Test : `apps/vitrine/src/App.test.tsx` (rendu de l'accueil).
