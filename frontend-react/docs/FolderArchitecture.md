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
