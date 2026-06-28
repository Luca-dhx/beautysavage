# 140 — Tests E2E critiques React

> Parcours critiques à couvrir en E2E avant chaque bascule de domaine. Outil **recommandé :
> Playwright** (multi-navigateur, intercept réseau, traces) — **NE PAS l'installer dans cette
> mission**. Les 353 tests backend (Vitest) couvrent déjà la logique serveur ; l'E2E valide
> l'intégration front↔API et les écrans d'état.

## Scénarios E2E (priorisés)
| # | Scénario | Préconditions | Assertions clés | Priorité |
|---|---|---|---|---|
| 1 | **Login manager** | compte admin, contrat actif | redirection dashboard, `/auth/me` role=admin | P1 |
| 2 | **Onboarding contrat** | admin sans contrat actif | login → `{blocked, reason}` → modal règlement → paiement lancement + mensuel (Stripe test) → contrat `active` → accès manager | P1 |
| 3 | **Réservation prestation** | service actif, créneau libre | calendrier → créneau → checkout → booking `confirmed` | P1 |
| 4 | **Acompte (deposit pay_on_site)** | service deposit pay_on_site | acompte encaissé, `balanceDueAmount` tracé, booking `deposit_paid` | P1 |
| 5 | **Checkout Stripe (formation)** | formation publiée, session libre | PI créé montant serveur, webhook → Sale, accès formation | P1 |
| 6 | **Checkout 0 €** | item gratuit ou 100% carte cadeau | `finalize-free` → Sale, idempotence (double submit → même saleId) | P1 |
| 7 | **Carte cadeau partielle** | carte cadeau + solde dû | gift card capée, reste payé Stripe ; mismatch refusé | P1 |
| 8 | **Distanciel accès immédiat** | formation distanciel + waiver | waiver requis (LEGAL_CONSENT_REQUIRED si absent), accès accordé/non remboursable | P2 |
| 9 | **Remboursement** | sale remboursable | demande → statut refund → (carte cadeau recredit / Stripe) | P2 |
| 10 | **Paiement commission** | mois commission dû (manager) | create-intent → paiement Stripe Dev → webhook → `succeeded` + facture | P2 |
| 11 | **Blocage site (contrat inactif)** | contrat pending | visiteur → page d'attente `CONTRACT_INACTIVE` ; dev bypass | P1 |
| 12 | **Suspension** | site suspended | achats bloqués `SITE_SUSPENDED` ; admin déconnecté `SUSPENDED_ADMIN_LOGOUT` | P1 |
| 13 | **Maintenance** | maintenance on | écran maintenance `MAINTENANCE` 503 ; dev accède | P1 |
| 14 | **Accès dev** | role dev | section `/dev` accessible, manager n'y accède pas (403) | P1 |
| 15 | **Session complète / déjà acheté** | session pleine / déjà acquise | `SESSION_FULL` / `ALREADY_PURCHASED` → UX adaptée | P2 |
| 16 | **Créneau indisponible** | créneau pris entre temps | `SLOT_UNAVAILABLE` → calendrier rafraîchi | P2 |

## Stratégie
- **Environnement** : backend en `NODE_ENV=test`-like avec Stripe en mode test (clés test du coffre) ; ne JAMAIS utiliser de secrets live ; mock webhook via signatures de test (déjà supporté).
- **Données** : seed dédié (institut + contrat + catalogue) ; réutiliser les fixtures de test backend si possible.
- **Réseau** : Playwright `route.fulfill` pour simuler les états (maintenance/suspension) sans muter la prod ; sinon basculer `SiteStatus` via endpoint dev.
- **Idempotence** : tester le double-submit (6) et le replay webhook (5,10) — couverts backend, à confirmer côté UX.
- **Secrets** : assertion qu'aucune clé (`sk_`, `pk_`, `xkeysib-`, `whsec_`) n'apparaît dans le DOM/réseau exposé au client.

## Intégration CI
- Lancer l'E2E **avant chaque bascule de domaine** (manager puis apex), pas à chaque commit (coût). Garder les 353 Vitest comme gate principal.
