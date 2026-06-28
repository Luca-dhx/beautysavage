# 159 — Rapport Sprint React R1 : proxy complet + vitrine catalogue

> Première vraie couche vitrine React (catalogue public) consommant l'API existante. **Zéro
> changement backend**, Vanilla intact, **pas de checkout** (R2). Branche `phase-0-security-baseline`.
> Suite de l'audit 158.

## Objectif

Brancher la vitrine React sur les endpoints publics existants : accueil + catalogues prestations /
formations / produits / cartes cadeaux (+ détails), avec états loading/error/empty, responsive,
proxy complet et client API typé. Aucune migration Vanilla, aucun checkout.

## 1. Proxy (durci)

La liste des chemins proxifiés est désormais **source unique** dans `@bs/config` :
`PROXY_PATHS = ['/api', '/auth', '/uploads']` + `buildProxyMap(target)` (`changeOrigin`, `secure:false`).
`vite.shared.makeApiProxy(target = VITE_PROXY_TARGET || 'http://localhost:3000')` le consomme ; les
deux apps (`vitrine` 5173, `manager` 5174) proxifient les **3 chemins**. Same-origin → pas de CORS ;
cookie `beautysavage_session` via `credentials:'include'` (déjà dans `apiFetch`). Médias `/uploads/...`
servis tels quels via le proxy. **Aucun secret côté front.** Couvert par `packages/config/src/proxy.test.ts`.

## 2. Endpoints catalogue consommés (existants, inchangés)

| Endpoint | Usage R1 |
|---|---|
| `GET /api/vitrine/services` | liste prestations |
| `GET /api/vitrine/services/:slug` | détail prestation (clé **slug**) |
| `GET /api/vitrine/shop` | `{formations[], products[]}` (cache partagé) |
| `GET /api/vitrine/formations/:id` | détail formation |
| `GET /api/vitrine/products/:id` | détail produit |
| `GET /api/vitrine/gift-cards` | config carte cadeau (minAmount/description/image — **pas** de liste/détail) |
| `GET /api/site-status` | bandeau maintenance/suspension |

Mapping fidèle aux payloads réels (cf. rapport 158) — aucun champ inventé.

## 3. Client API catalogue (`packages/api-client/src/catalog/`)

- `types.ts` : `PublicService`, `PublicServiceOption`, `PublicPractitioner`, `PublicTraining`,
  `PublicProduct`, `PublicShopResponse`, `PublicGiftCardConfig`, `PublicSiteStatus`, `PublicMedia`,
  `PublicCategory` (défini pour l'avenir, non peuplé). Tout optionnel sauf `id`/`name`.
- `format.ts` : `formatPrice` (Intl fr-FR EUR), `formatDuration` (min → « 1 h 30 »),
  `resolveMediaUrl` (URL absolue conservée, chemin relatif servi via proxy, vide→null).
- `raw.ts` + `mappers.ts` : lecture tolérante (sans `any`) + mappers `mapService/mapTraining/
  mapProduct/mapGiftCardConfig/mapSiteStatus`. **Le serveur fait foi sur les prix** (jamais recalculés).
- Clients : `services.ts`, `shop.ts`, `trainings.ts`, `products.ts`, `giftCards.ts`, `site.ts`.

## 4. Hooks TanStack Query (`apps/vitrine/src/features/catalog/hooks/`)

`usePublicShop` (clé `['catalog','shop']`), `usePublicTrainings` / `usePublicProducts` (même clé +
`select` → **un seul fetch** partagé pour formations + produits), `usePublicServices`
(+ `usePublicService(slug)`), `usePublicTraining(id)`, `usePublicProduct(id)`, `usePublicGiftCards`,
`useSiteStatus` (retry off, best-effort). QueryClient app : `retry:1`, `refetchOnWindowFocus:false`,
`staleTime 60s`. Chaque hook gère loading/error/empty via l'état de la query.

## 5. Composants UI catalogue (`packages/ui/src/catalog.tsx`)

`CatalogueGrid` (responsive : 1 col mobile → 2 (≥640px) → 3 (≥960px)), `CatalogueCard` (média +
badge promo + titre + meta + prix + action), `PriceLabel` (présentation pure : prix courant + barré
+ badge promo), `MediaImage` (placeholder dégradé si pas d'image), `SectionHeader`, `EmptyState`.
`LoadingState`/`ErrorState` réutilisés. Tokens CSS étendus (grille, cartes, prix, bandeau, hero).

## 6. Pages vitrine créées (placeholders R0 → pages réelles)

- **`/` (Accueil)** : hero + CTA + sections aperçu prestations/formations/produits (3 max) + CTA
  cartes cadeaux. Fallback propre si API vide/erreur (« bientôt disponible »).
- **`/prestations`** + **`/prestations/:slug`** (détail, durée, prix, « Réservation bientôt »).
- **`/formations`** + **`/formations/:id`** (distanciel = accès à vie / présentiel, éditorial HTML).
- **`/produits`** + **`/produits/:id`**.
- **`/cartes-cadeaux`** : config (montant min, description, image) + « Achat bientôt disponible ».
- **`SiteStatusBanner`** dans `PublicLayout` (affiché si statut ≠ active, best-effort).
- Hors R1 (placeholders) : `/connexion`, `/paiement/*`, `/panier`, `/checkout`.

**Aucun bouton d'achat actif** — checkout/paiement/réservation = R2.

## 7. Blocages site publics

`/api/site-status` → bandeau (maintenance / suspension + raison + ETA). Best-effort : si l'appel
échoue, le bandeau ne s'affiche pas et **n'empêche jamais** la consultation du catalogue. Messages
cibles documentés (maintenance / indisponibilité).

## 8. Tests

### Frontend (`npm run react:test`) — 26 verts (était 12)
- `packages/config/src/proxy.test.ts` (3) : `/api`,`/auth`,`/uploads` + cibles.
- `packages/api-client/src/catalog/mappers.test.ts` (5) : mapping tolérant + coercition + statut.
- `apps/vitrine/src/pages/catalogPages.test.tsx` (5) : prestations loading→cards, formations empty,
  produits error, accueil sections, détail prestation par slug.
- `apps/vitrine/src/App.test.tsx` (2) : hero + bandeau maintenance.
- (R0 conservés : apiFetch 3, guards 4, manager App 4.)
- `npm run react:lint` vert, `npm run typecheck` vert, `npm run react:build` (2 apps) OK.

### Backend (inchangé)
`npm test` (394) + `audit:business-scenarios` (36) + `audit:commissions` (20) restent verts. Aucun
fichier backend métier modifié.

## 9. Limites R1

- Carte cadeau : **config seule** (pas de liste/détail) → pas de route `/cartes-cadeaux/:id`.
- Pas de **catégories publiques** dans `/shop` → `PublicCategory` défini mais non peuplé.
- Pas de **réservation prestation** (calendrier `/availability`) ni **checkout/paiement** → R2.
- Manager / dev : intacts (hors périmètre).

## 10. Prochaine mission — React R2

Panier + **checkout** + **paiement Stripe Checkout hébergé** : consommer la réponse
`{ mode:'hosted', url }` de `create-checkout-session` (flag `CHECKOUT_HOSTED`) → redirection ;
`{ mode:'free' }` → finalize-free (0 €). Réservation prestation (calendrier `/api/vitrine/availability`).
Consentements légaux (CGV / rétractation) avant paiement.
