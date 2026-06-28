# 149 — Roadmap des sprints de migration React

> Découpage en sprints exécutables. Chaque sprint : doc du scope (cf. 145) + tests E2E des
> parcours critiques (cf. 140) avant bascule. Backend inchangé sauf prérequis explicites.

## R0 — Setup (frontend-react)
- Monorepo Vite+React+TS, React Router, TanStack Query, ESLint/Prettier.
- `packages/api-client` (fetch credentials + intercepteur codes), `packages/auth` (session+guards), `packages/ui` (thème dynamique), `packages/config` (dictionnaire erreurs).
- Docs initialisées (Folder*/Vitrine*/Manager*). **DoD** : 2 apps buildables, guards en place.
- *Backend* : aucun changement. (Cookie `.beautysavage.fr` planifié pour la 1re bascule sous-domaine.)

## R1 — Vitrine publique
- Accueil, catalogues (prestations/formations/produits/cartes cadeaux), pages détail, pages éditoriales, StatePage (maintenance).
- API : `/api/vitrine/*`. **DoD** : navigation publique complète, thème dynamique, responsive.

## R2 — Checkout client
- Panier, consentements, **Stripe Checkout hébergé** (via UnifiedCheckout, cf. 144) + **finalize-free** (0 €), carte cadeau, résultat paiement, accès formation.
- API : `/api/stripe/*`, `/api/client/checkout/finalize-free`, `/api/client/*`.
- **Prérequis** : moteur UnifiedCheckout (kinds Institut) implémenté côté backend (mission dédiée, roadmap 144) OU conserver Elements en transition.
- **DoD** + E2E : checkout Stripe, 0 €, carte cadeau, succès/échec (cf. 140 #5-7).

## R3 — Manager (manager.beautysavage.fr)
- Login manager, onboarding contrat (wizard règlement), dashboard, planning, réservations, CRUD (prestations/formations/produits/cartes cadeaux), ventes, remboursements, **commissions à payer**.
- API : `/api/gestion/**`, `/api/contract/*`, `/api/commissions/*`.
- **Prérequis bascule** : cookie `.beautysavage.fr` ; pagination listes (cf. 141).
- **DoD** + E2E : login, onboarding contrat, réservation, paiement commission, blocages (cf. 140 #1-4,10-13).

## R4 — Dev (`/dev`)
- Contrats, commissions reçues, IntegratedAPI/coffre, Email Template Studio, SendLog/EventLog/WebhookFailureLog, maintenance.
- API : `/api/contract` (CRUD), `/api/gestion/commissions/*`, `/api/gestion/mails/*`, `/api/gestion/dev/*`, `/api/gestion/site-status/*`.
- **DoD** + E2E : accès dev (manager n'y accède pas), bascule maintenance (cf. 140 #13-14).

## R5 — Bascule
1. **Manager d'abord** : pointer `manager.beautysavage.fr` sur React Manager (audience interne). Vanilla `gestion.html` reste en fallback.
2. **Vitrine ensuite** : pointer `beautysavage.fr` sur React Vitrine (public). Vanilla `vitrine.html` reste en fallback.
3. **Rollback** : repointer DNS/proxy ou `UI_V2_ENABLED=false` → Vanilla. Instantané, sans déploiement backend.
- Redirections legacy `?slug=`/`?module=` → routes React maintenues pendant la cohabitation (cf. 147).

## Dépendances inter-sprints
- R0 → tout. R1 → R2 (catalogue avant checkout). UnifiedCheckout (144) ⟂ R2 (idéalement avant, sinon Elements transitoire). R3 ⟂ R4 (même app ; R3 d'abord). R5 après parité validée par scope.

## Ordre recommandé
`R0 → R1 → R2 → R5(vitrine)` ‖ `R0 → R3 → R4 → R5(manager d'abord)`.
La bascule **manager précède** la vitrine (risque interne < public). UnifiedCheckout = mission backend
à insérer **avant R2** si possible (sinon R2 sur Elements puis migration hosted en sous-itération).

## Prochaine mission recommandée
**Implémenter le moteur UnifiedCheckout (kinds Institut) + bascule Stripe Checkout hébergé**
(roadmap 144), avec tests de caractérisation/parité — puis **R0 setup** du monorepo React.
