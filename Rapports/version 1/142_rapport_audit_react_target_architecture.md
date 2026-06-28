# 142 — Synthèse : audit site actuel & architecture cible React

> Rapport de synthèse de l'audit (rapports 133-141). **Documentation uniquement** — aucun code
> modifié, aucun setup React. Backend pré-React stabilisé (353 tests + audits verts).

## 1. État des lieux (133)
- Frontend Vanilla : 2 SPA séparées (`vitrine.html`, `gestion.html`), 72 modules JS, routing par query-param, **pas de toggle runtime** (le champ `currentMode`/`modeGuard` est vestigial).
- Backend : API JSON cohérente, logique en services testés (post-refactor F1-F3B), codes d'erreur stables.

## 2. Rôles & espaces (134)
- Rôles backend **conservés** : `client`, `admin`, `dev`. Relabel **UI seulement** : `admin → Manager`, `dev → Développeur`.
- 4 espaces : **Public/Client**, **Manager** (admin), **Developer** (dev, sur-ensemble bypass).

## 3. Blocages (135)
- Site complet : **maintenance**, **contrat inactif** (+ admin suspendu).
- Achat/booking : suspension client, offre non prête (distanciel/acompte), consentement légal, mismatch pricing, capacité session, créneau, montant min, solde dû.
- Tous exposent un **code stable** → React = dictionnaire code→UX + écrans d'état + désactivation préventive des CTA.

## 4. Architecture cible recommandée (136)
```
beautysavage.fr            → React Vitrine (public + client)
manager.beautysavage.fr    → React Manager (role admin) + section /dev (role dev)  [Option B]
backend Express (Node)     → API + webhooks (INCHANGÉ), proxifié /api par chaque app
```
- **Espace dev = `manager.beautysavage.fr/dev`** (Option B : 1 app, auth/cookie partagés, déploiement simple).
- Session partagée via cookie **`Domain=.beautysavage.fr`** ; **proxy `/api`** par app → pas de CORS.

## 5. React parallèle (137)
- `frontend-react/apps/{vitrine,manager}` + `packages/{api-client,ui,auth}`. **Vite + React + TS**.
- Vanilla reste actif ; bascule progressive (chemin → sous-domaine manager → apex) ; **rollback DNS/proxy/flag instantané** ; **zéro changement d'endpoint**.

## 6. Roadmap écran par écran (138)
- **R0** setup → **R1** vitrine → **R2** checkout (Stripe/0€/carte cadeau) → **R5** accès formation client (apex).
- En parallèle : **R3** manager (login, onboarding contrat, dashboard, planning, CRUD, ventes, commissions à payer) → **R4** dev (contrats, commissions reçues, IntegratedAPI, Template Studio, logs).
- Bascule **manager d'abord** (audience interne), **apex en dernier** (public).

## 7. Contrat API (139)
- API **React-ready** : JSON, cookie credentials, codes stables, montants €, dates ISO.
- Legacy à éviter : `mock-pay*`, `/api/mode`/`currentMode`, routing `?slug=`.
- À compléter (mineur) : pagination listes admin/dev, enveloppe d'erreur homogène, flags `purchasable/bookable` en catalogue.

## 8. Tests E2E (140)
- **Playwright** (non installé) ; 16 scénarios critiques (login/onboarding/checkout/0€/carte cadeau/distanciel/remboursement/commission/blocages/dev). Gate principal = 353 Vitest backend.

## 9. Corrections avant React (141)
- **Seule correction requise** : cookie **`Domain=.beautysavage.fr`** (+ CORS si API sur origine dédiée, évitable par proxy). Le reste (pagination, enveloppe, flags, neutralisation `mode`) = incrémental, non bloquant.

## Décisions tranchées
| Question | Décision |
|---|---|
| Domaine principal | `beautysavage.fr` = vitrine publique + client |
| Manager | `manager.beautysavage.fr` (sous-domaine dédié) |
| Espace dev | `manager.beautysavage.fr/dev` (Option B), `dev.` réservé pour plus tard |
| Toggle vitrine/gestion | **supprimé** en React (`mode`/`currentMode` vestigial) |
| Rôles backend | **inchangés** (client/admin/dev) ; relabel UI seulement |
| React | **parallèle** (Vite+React+TS), bascule progressive, rollback instantané, API inchangée |

## Verdict final
**GO pour le chantier React, en parallèle.** Le backend post-refactor (F1-F3B) est stable, modulaire
et React-ready : domaines isolés derrière des services testés, codes d'erreur stables, API JSON.
**Prérequis unique** avant setup : cookie `.beautysavage.fr` (partage de session sous-domaines).
Construire d'abord la **Vitrine** (apex) et le **Manager** (sous-domaine) en parallèle du Vanilla,
basculer par domaine avec rollback DNS/proxy, l'espace **Dev** sous `manager/dev`. Aucune réécriture
backend nécessaire ; les corrections restantes sont incrémentales (pagination, enveloppe, flags catalogue).
