# 158 — Audit React R1 : proxy + catalogue public

> Audit avant la première vraie couche vitrine React (catalogue public). Branche
> `phase-0-security-baseline`. Suite de R0 (rapports 156/157).

## 1. Proxy actuel (déjà complet depuis R0)

`frontend-react/vite.shared.ts` → `makeApiProxy(target = VITE_PROXY_TARGET || 'http://localhost:3000')`
retourne **`/api`, `/auth`, `/uploads`** (même `target`, `changeOrigin:true`, `secure:false`). Les
deux apps l'utilisent : `apps/vitrine/vite.config.ts` (`server.proxy: makeApiProxy()`, port 5173) et
`apps/manager/vite.config.ts` (port 5174). **Le proxy R1 requis est déjà en place** ; R1 ne fait que
le durcir (extraction de la liste `PROXY_PATHS` dans `@bs/config` + test). Same-origin → pas de CORS ;
cookie `beautysavage_session` via `credentials:'include'` (déjà dans `apiFetch`). Les médias
`/uploads/...` sont servis par le proxy, donc utilisables tels quels (chemins relatifs).

## 2. Endpoints publics disponibles (sans auth)

Montés dans `app.js` : `/api/vitrine` (vitrineRouter), `/api/vitrine/services` (vitrineServiceRouter),
`/api/vitrine/availability`, `/api/site-status`, `/uploads` (statique).

| Endpoint | Réponse | Notes |
|---|---|---|
| `GET /api/vitrine/shop` | `{ok, formations[], products[]}` | catalogue formations **et** produits ensemble |
| `GET /api/vitrine/highlights` | `{ok, highlights[]}` | 3 mises en avant (`kind:'product'\|'formation'`) |
| `GET /api/vitrine/formations/:id` | `{ok, formation{...}}` | détail formation (clé `_id`) |
| `GET /api/vitrine/products/:id` | `{ok, product{...}}` | détail produit (clé `_id`) |
| `GET /api/vitrine/services` | `{ok, services[]}` | liste prestations |
| `GET /api/vitrine/services/:slug` | `{ok, service{... practitioners[]}}` | détail prestation (clé **`slug`**) |
| `GET /api/vitrine/gift-cards` | `{ok, config{minAmount, description, image}}` | **config seule** (pas de liste/détail) |
| `GET /api/site-status` | `{ok, status:'active'\|'suspended'\|'maintenance', reason, eta, startedAt, updatedAt}` | blocage site |
| `GET /api/vitrine/home-settings` | `{ok, settings{banner, slogan, hookEditorialHtml, about}}` | accueil |
| `GET /api/vitrine/site-identity` | `{siteName, logoUrlResolved}` | **bare object** (pas de `ok`) |
| `GET /api/vitrine/theme` | `{ok, theme{colors, derivedTokens, ...}}` | thème dynamique |

### Champs catalogue (faithful)
- **Formation (shop/detail)** : `id, name, description, price, finalPrice, coverImage, type('distanciel'|'presentiel'), refundDays, status, activePromotion|null, createdAt` (+ détail : `photos[], trailerVideoUrl, editorialHtml, salesCount, options[]`).
- **Produit** : `id, name, price, finalPrice, coverImage, activePromotion|null, createdAt` (+ détail : `photos[], editorialHtml`).
- **Prestation (service)** : `id, slug, name, shortDescription, description, duration(min), price, effectivePrice, hasPromo, promotionLabel|null, photos[], isBookable, paymentType, depositValue, depositType, capacity, cancellationDays, bookingLeadDays, options[]` (+ détail : `practitioners[]`).
- **Carte cadeau** : `config { minAmount, description, image }` uniquement.
- **Prix** : `price` (base) + `finalPrice`/`effectivePrice` (après promo) ; promo = `activePromotion` (objet|null) ou `hasPromo`/`promotionLabel` (services).
- **Médias** : chemins relatifs `/uploads/...` (`coverImage`, `photos[]`, `image`, `*UrlResolved`). Jamais d'URL absolue → consommés via proxy same-origin.

## 3. Endpoints utilisés par le Vanilla

Les modules Vanilla (`backend/public/js/modules/*`) consomment ces mêmes endpoints (`/api/vitrine/shop`,
`/services`, `/highlights`, `/formations/:id`, `/products/:id`, `/gift-cards`, `/site-status`,
`/theme`, `/home-settings`, `/site-identity`). **Aucun changement backend nécessaire** — React
réutilise l'API existante telle quelle.

## 4. Endpoints réutilisables React (R1)

Tous les endpoints du §2 sont réutilisables sans modification. R1 consomme :
- **Catalogues** : `/services`, `/shop` (→ formations + produits), `/gift-cards`.
- **Détails** : `/services/:slug`, `/formations/:id`, `/products/:id`.
- **Mises en avant** : `/highlights` (accueil).
- **Blocage** : `/site-status` (bandeau).
- (Optionnel accueil) `/home-settings`, `/site-identity`.

## 5. Endpoints manquants / limites

- **Pas de détail/liste carte cadeau** : `/gift-cards` ne renvoie qu'une config (montant min,
  description, image). → page `/cartes-cadeaux` affiche la config + « Acheter bientôt » ; **pas** de
  route `/cartes-cadeaux/:id` (documenté, non inventé).
- **Pas de catégories publiques** dans `/shop` → le type `PublicCategory` est défini pour l'avenir
  mais non peuplé en R1 (documenté).
- **Services clés par `slug`** (pas `_id`) → route `/prestations/:slug`.
- Détail prestation expose `practitioners[]` (réservation = R2, hors R1).

## 6. Risques

| Risque | Mitigation |
|---|---|
| Inventer des champs | Types tolérants (tout optionnel sauf id/name) ; mapping fidèle au §2. |
| Casser le proxy en refactorant | `PROXY_PATHS` centralisé + test ; `makeApiProxy` conserve les 3 chemins. |
| Bloquer l'app si `/site-status` échoue | bandeau best-effort : pas de blocage si l'appel échoue. |
| Erreurs retry lentes (UX) | QueryClient `retry:1` app / `retry:false` tests. |
| Dépendance de couche `ui→api-client` | `@bs/ui` reste présentation pure (props préformatées) ; format prix/médias dans `@bs/api-client`. |
| Secret côté front | aucun ; endpoints publics, clé Stripe publique = R2. |

## 7. Plan R1

1. `@bs/config` : `PROXY_PATHS` + `buildProxyMap` (+ test) ; `vite.shared` consomme `buildProxyMap`.
2. `@bs/api-client/catalog/` : `types.ts`, `format.ts` (formatPrice fr-FR + resolveMediaUrl),
   `services.ts`, `trainings.ts`, `products.ts`, `giftCards.ts`, `site.ts`, `shop.ts`, `index.ts`.
3. `@bs/ui` : `CatalogueGrid`, `CatalogueCard`, `PriceLabel`, `MediaImage`, `SectionHeader`,
   `EmptyState` (+ tokens grille) ; `LoadingState`/`ErrorState` réutilisés.
4. `apps/vitrine/src/features/catalog/hooks/` : `usePublicShop`, `usePublicServices`,
   `usePublicTrainings`, `usePublicProducts`, `usePublicGiftCards`, `useSiteStatus` + hooks détail.
5. Pages réelles : Accueil, `/prestations`(+`/:slug`), `/formations`(+`/:id`), `/produits`(+`/:id`),
   `/cartes-cadeaux` ; `SiteStatusBanner` dans `PublicLayout`.
6. États loading/error/empty + responsive (1/2/3 colonnes). **Aucun checkout.**
7. Tests frontend (proxy, mapping, pages) ; build/lint/typecheck ; suite backend verte.
8. Docs (Folder + Vitrine + architecture.md + projectContext.json + tests/README) + rapport 159.
9. Secret scan + commit + push.
