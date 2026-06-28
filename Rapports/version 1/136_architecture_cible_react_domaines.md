# 136 — Architecture cible : domaines / sous-domaines

> Décision produit : (1) domaine principal = vitrine publique ; (2) sous-domaine manager =
> panel institut ; (3) espace développeur séparé ; (4) plus de toggle vitrine/gestion ;
> (5) React construit en parallèle.

## Proposition de découpage
### Domaine principal — `beautysavage.fr` (Vitrine publique + Client)
accueil, prestations, formations, produits, cartes cadeaux, panier, checkout, paiement,
résultat paiement, accès formation achetée, mon compte, mes formations/prestations/cartes,
favoris, suivi remboursement public (token), pages légales, maintenance.

### Sous-domaine manager — `manager.beautysavage.fr` (role admin)
login manager (`admin-login`), **onboarding activation contrat** au 1er login, dashboard,
planning, prestations, formations, produits, cartes cadeaux, réservations, ventes,
remboursements, **commissions à payer**, mon contrat, paramètres institut (identité, thème,
pages légales, statut site).

### Espace développeur (role dev)
contrats, commissions reçues, IntegratedAPI/coffre, Email Template Studio, SendLog, EventLog,
WebhookFailureLog, JobRunLog, config plateforme, outils maintenance.

## Options pour l'espace dev
| Option | Forme | Avantages | Risques |
|---|---|---|---|
| **A** | `dev.beautysavage.fr` (sous-domaine dédié) | isolation forte, séparation visuelle nette, CSP/headers durcis indépendants | 3e origine → CORS + cookie partagé sur 3 sous-domaines, 3e build/déploiement, surcoût |
| **B (recommandée)** | `manager.beautysavage.fr/dev` (section gated `role=dev`) | 1 seul sous-domaine app, auth/cookie déjà partagés avec manager, 1 build, déploiement simple ; dev = sur-ensemble du manager (bypass contrat/maintenance) | séparation logique (pas physique) — atténué par guard `requireStrictDev` déjà en place |

## Comparatif sous-domaines séparés vs routes
| Critère | Sous-domaines séparés (apex + manager [+ dev]) | Tout en routes d'un seul domaine |
|---|---|---|
| Auth/cookie | cookie `Domain=.beautysavage.fr` partagé (à activer) | trivial (même origine) |
| CORS | requis (apex ↔ manager) si API sur l'apex | aucun |
| Séparation UX | nette (objectif produit #1-3) | faible |
| Déploiement | 2 apps front (vitrine, manager) + 1 API | 1 app |
| SEO/cache | vitrine publique isolée (cache CDN agressif), manager non indexé | mélange |
| Sécurité | surface manager/dev non exposée sur l'apex public | tout sur une origine |

## Recommandation finale
**Adopter :**
- **`beautysavage.fr`** = app **Vitrine** React (publique + client).
- **`manager.beautysavage.fr`** = app **Manager** React (role admin), **incluant `/dev`** pour le rôle dev (**Option B**).
- **API conservée** sur le backend Express actuel, exposée à `api.beautysavage.fr` **ou** servie en `same-origin` derrière chaque app via reverse proxy `/api`.

**Auth / cookies :**
- Élargir le cookie de session à `Domain=.beautysavage.fr` (actuellement implicite host-only) → session partagée vitrine ↔ manager. Conserver `HttpOnly`, `SameSite=Lax`, `Secure` (prod).
- Si API sur un sous-domaine distinct (`api.`), activer **CORS** avec allowlist `{beautysavage.fr, manager.beautysavage.fr}` + `credentials: true`. Sinon (reverse proxy `/api` par app) → pas de CORS.
- **Recommandé V1** : reverse proxy `/api` → backend pour CHAQUE app (vitrine + manager). Évite CORS, garde same-origin par app, ne change rien à l'API. Le cookie `.beautysavage.fr` suffit au partage de session.

**Déploiement cible :**
```
beautysavage.fr            → static React Vitrine  (reverse proxy /api, /auth, /uploads → backend)
manager.beautysavage.fr    → static React Manager  (reverse proxy /api, /auth → backend)  [/dev gated dev]
backend Express (Node)     → API + webhooks Stripe/Brevo (inchangée)
```

**Complexité** : faible→moyenne. Le principal travail backend = cookie `.beautysavage.fr` (1 ligne) + (si `api.` séparé) CORS allowlist. Le reste de l'API est déjà React-ready (JSON, codes stables — cf. 139).
