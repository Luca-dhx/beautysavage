# 96 — Verdict deep GO / NO-GO React

> Synthèse des rapports 89-95 + matrice automatisée (36 probes vertes). Lecture seule.

## Verdict : **GO React — conditionnel, démarrage immédiat possible**

La réécriture UI React **peut commencer maintenant** sur les circuits **PASS** (réservation,
paiement, remboursement standard, commission, promotions, observabilité — tous solides et,
pour l'essentiel, vérifiés par simulation). **Trois décisions/corrections bloquantes**
doivent être traitées **avant de figer définitivement le contrat d'API** des modules
factures/commissions, mais elles **ne bloquent pas le démarrage** du chantier UI (parcours
vitrine, planning, dashboards).

### GO React maintenant ?
**Oui pour l'UI** des circuits PASS (≈62 % des scénarios), qui constituent le cœur du
produit et dont le contrat backend est stable (A1-A7 livrés, 229 tests verts).

### GO après corrections ?
**Oui pleinement** une fois le **Bac 1** (rapport 95) traité :
- **B1** — décision régime TVA (293B confirmé ou cadrage assujetti).
- **B2** — contrainte montant Stripe encaissé vs catalogue.
- **B3** — réconciliation commission (ledger ↔ compute) + politique claw-back.

### NO-GO ?
**Non.** Aucun blocage justifie un NO-GO : pas de faille de sécurité ouverte (A1-A3), pas de
perte d'argent silencieuse non tracée (A4-A6), anti-oversell et idempotence en place. Les
FAIL sont circonscrits (TVA assujettie non implémentée — non requise en franchise ;
remboursement distanciel — contournable manuellement).

## Corrections minimales avant React (figer l'API)
1. **TVA** : acter le régime. Si franchise 293B → documenter « TVA hors périmètre V1 ».
2. **Montant Stripe** : valider `amountToPay` contre le catalogue serveur avant PaymentIntent.
3. **Commission** : réconcilier les deux mécanismes + définir la claw-back.
4. (Fortement recommandé) **Remboursement distanciel** + retrait du statut mort `pending_payment`.

## Dette qui peut vivre pendant React
- Choix/planning multi-praticiennes en UI (backend prêt, 91).
- Paiement orphelin → remboursement auto (C1), reprise `rollback_needed` (C2).
- Events session standardisés, expiration gift card, numérotation facture.
- Migration UTC, coupons, export comptable, attestations → **V2**.

## Scores

| Domaine | Score /100 | Justification |
|---|---:|---|
| **Réservation** | 82 | Locks par praticienne, anti-doublon atomique, revalidation créneau, no-show/suspension. −: paiement orphelin (12), fuseau (mitigé A2). |
| **Paiement** | 85 | Idempotence webhook, 0 €/mixte/anti-bypass, A6 observabilité. −: montant Stripe vs catalogue (B2), fallback metadata. |
| **TVA / facture** | 58 | Cohérent en franchise 293B mais zéro extensibilité TVA, divergence facture interne/Stripe, pas d'export comptable. |
| **Remboursement** | 72 | Split CC/Stripe, idempotence, cap, recovery, A4 tracé. −: distanciel absent (46), `rollback_needed` manuel (44). |
| **Commission** | 68 | A5 corrige le trou carte cadeau, events d'audit. −: double mécanisme non réconcilié, claw-back manuelle, règle prix promu indéterminée. |
| **Formation** | 70 | Présentiel robuste (oversell atomique), A1/A7 distanciel cadrés. −: remboursement distanciel + solde acompte + attestation. |
| **Maintenabilité** | 62 | Observabilité en place, snapshots légaux/prix. −: monolithes (clientController/stripeController), logique dupliquée (promo, commission, gift-card split), statuts ambigus. |
| **GLOBAL** | **72** | Cœur métier solide et testé ; dette concentrée sur TVA, commission-réconciliation, distanciel et maintenabilité — adressable sans bloquer le démarrage React. |

## Matrice automatisée (preuve)
`npm run audit:business-scenarios` → **36 probes vertes** (créneaux, locks multi-praticiennes,
éligibilités remboursement, split carte cadeau, commission A5, promotions, garde-fous A7,
consentement A1, observabilité A6, anti-doublon remboursement). Caractérisation figée pour
détecter toute régression future. Suite principale inchangée (229 tests verts).

## Recommandation finale
**Lancer React** sur la vitrine + le parcours réservation/paiement (PASS), **en parallèle**
du traitement du Bac 1 (B1-B3) côté backend avant d'exposer les écrans factures/commissions.
Geler le contrat d'API module par module : réservation/paiement d'abord (stable), factures/
commissions après B1/B3.
