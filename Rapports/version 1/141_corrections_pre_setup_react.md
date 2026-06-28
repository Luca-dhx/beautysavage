# 141 — Corrections recommandées avant / pendant React

> Aucune correction appliquée dans cette mission (audit + plan uniquement). Classement par
> urgence. La plupart sont **mineures** : l'API est déjà React-ready.

## À CORRIGER AVANT le setup React (bloquant l'archi sous-domaines)
| # | Sujet | Détail | Effort |
|---|---|---|---|
| 1 | **Cookie cross-subdomain** | Élargir le cookie `beautysavage_session` à `Domain=.beautysavage.fr` (actuellement host-only) pour partager la session entre `beautysavage.fr` et `manager.beautysavage.fr`. Conserver HttpOnly/SameSite=Lax/Secure. | S (1 option cookie) |
| 2 | **CORS** (si API sur origine dédiée) | Si on expose `api.beautysavage.fr`, ajouter une allowlist CORS `{apex, manager}` + `credentials:true`. **Évitable** en proxifiant `/api` depuis chaque app (reco 136/137) → alors RIEN à faire. | S ou nul |
| 3 | **CSP** | `helmet` CSP autorise déjà Stripe/inline ; vérifier qu'elle autorise les origines React (scripts/styles servis par les apps) et `connect-src` vers l'API. | S |

## PEUT être corrigé PENDANT React
| # | Sujet | Détail | Effort |
|---|---|---|---|
| 4 | **Pagination listes** | `/api/gestion/sales`, send-logs, event-logs, webhook-failures, `/api/gestion/clients`, `/api/commissions/payments` : exposer `?page=&limit=` → `{items,total,page,limit}`. Évite de charger des historiques entiers. | M |
| 5 | **Enveloppe d'erreur homogène** | Quelques endpoints renvoient un format ad hoc (ex. `/api/stripe/config` → `{publishableKey}` sans `ok`). Harmoniser vers `{ok,...}`/`{ok:false,error,code}` **ou** documenter les exceptions pour le client API. | M |
| 6 | **Messages d'erreur → codes** | S'assurer que tout blocage expose un `code` stable (la plupart le font). Pour les rares `error` sans `code`, ajouter un code. | S |
| 7 | **Blocages bien exposés au front** | `/api/site-status` doit suffire au front pour pré-désactiver les CTA (maintenance/suspension) sans attendre un 503. Vérifier qu'il expose maintenance ET suspension. | S |
| 8 | **Offer readiness exposé en lecture** | Exposer dans les payloads catalogue un flag `purchasable`/`bookable` (dérivé de offerReadinessService) pour masquer les CTA en amont (au lieu d'un 409 au checkout). | M |

## PEUT attendre V2
| # | Sujet | Détail |
|---|---|---|
| 9 | **Neutraliser `mode`/`currentMode`** | `/api/mode`, `modeGuard`, `User.currentMode` deviennent inutiles (toggle supprimé). Laisser en place (inoffensif) ; nettoyer plus tard. |
| 10 | **Bootstrap agrégé** | `/api/vitrine/bootstrap` (theme+identity+ui-config+site-status) pour 1 seul appel au boot. Optimisation. |
| 11 | **Liste d'attente session pleine** | UX `SESSION_FULL` → file d'attente. Feature produit. |
| 12 | **Sous-découpage `mailDomainDispatchers`** | dette backend documentée (rapport 132), sans impact React. |

## Incohérences rôles
- Aucune incohérence bloquante. Les rôles backend (`client/admin/dev`) sont cohérents et bien gardés. Le seul point est **cosmétique** : relabel UI (`admin→Manager`, `dev→Développeur`) — front uniquement, **pas de changement backend** (cf. 134).

## Auth cross-subdomain — détail
- Cookie `.beautysavage.fr` (point 1) = **le seul vrai prérequis** pour l'archi cible.
- `/auth/me`, `/auth/login`, `/auth/logout` fonctionnent inchangés depuis n'importe quel sous-domaine une fois le cookie élargi (+ CORS si origine API dédiée).

## Verdict corrections
**1 correction réellement requise avant React : cookie `.beautysavage.fr`** (+ CORS uniquement si API sur origine séparée — évitable par proxy). Tout le reste est incrémental et non bloquant. **Le backend est prêt.**
