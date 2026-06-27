# 95 — Roadmap corrective pré-React (deep)

> Lecture seule. Classe tous les problèmes des rapports 89-94 en 4 bacs. Pour chaque :
> gravité (🔴/🟡/🟢), effort (S/M/L), impact, justification, ordre, dépendances.
> Rappel : A1-A7 (rapports 85-88) sont **déjà faits**.

## Bac 1 — BLOQUANT avant React
*(fige le contrat d'API ou crée un risque financier/juridique inacceptable)*

| # | Problème | Grav | Effort | Impact | Justification | Ordre | Dépend. |
|---|---|---|---|---|---|---|---|
|B1|**Régime TVA** : décider 293B (franchise) vs assujetti. Si assujetti < 12 mois → cadrer le modèle taux/HT/TTC AVANT de figer l'API factures | 🔴 | M (décision) / L (impl.) | Factures/avoirs/commission changent de forme | React fige le contrat ; refaire après = coûteux (92) | 1 | expert-comptable |
|B2|**Cohérence montant Stripe encaissé vs catalogue** : contraindre `amountCents` au dû serveur avant PaymentIntent | 🟡→🔴 | S | Anti-sous-paiement | Le webhook recrée au catalogue mais l'encaissé peut diverger (94§2) | 2 | — |
|B3|**Réconciliation commission** ledger ↔ `computeCommissionsForPeriod` + politique claw-back | 🔴 | M | Exactitude financière éditeur/institut | Deux vérités non réconciliées (75,77,94§1) | 3 | — |

## Bac 2 — FORTEMENT RECOMMANDÉ avant React
*(évite de figer une dette structurante dans l'API)*

| # | Problème | Grav | Effort | Impact | Justification | Ordre | Dépend. |
|---|---|---|---|---|---|---|---|
|R1|**Remboursement distanciel** : endpoint + règle d'éligibilité explicite (ne pas dépendre de sessionDate null) | 🔴 | M | Parité présentiel/distanciel | Cas non modélisé (46,89) | 4 | — |
|R2|**Statuts morts** : retirer `pending_payment` (ServiceBooking) du contrat ou le documenter | 🟡 | S | Clarté API React | Ne pas figer un statut quasi-mort (94§4) | 5 | — |
|R3|**Unifier promotions** `Promotion` vs `Service.promotion` | 🟡 | M | Cohérence remise/commission/facture | Logique dupliquée (93,94§1) | 6 | B1? |
|R4|**Facture interne vs Stripe (carte cadeau)** : une seule représentation | 🟡 | M | Cohérence comptable | Divergence 62-63 | 7 | B1 |
|R5|**Politique commission sur prix promu** (catalogue vs vendu) | 🟡 | S (décision) | Exactitude commission | Indéterminé (76,107,93) | 8 | B3 |
|R6|**Acompte/solde** : décider collecte du solde OU retrait définitif (A7 bloque déjà la vente) | 🟡 | M | Parcours prestation | Trou fonctionnel (91) | 9 | — |

## Bac 3 — PEUT être fait PENDANT React
*(n'impacte pas la forme du contrat, ou s'y greffe naturellement)*

| # | Problème | Grav | Effort | Impact | Ordre |
|---|---|---|---|---|---|
|C1|Paiement orphelin (créneau pris après paiement) → remboursement auto du PI | 🟡 | M | Fiabilité | 10 |
|C2|État `rollback_needed` : job de reprise / procédure | 🟡 | M | Fiabilité remboursement | 11 |
|C3|Choix praticienne + planning multi-praticiennes en UI | 🟡 | L | Multi-prestataires (91) | 12 |
|C4|Events `formation.session_cancelled/updated` standardisés (EventLog domaine) | 🟢 | S | Observabilité | 13 |
|C5|Expiration carte cadeau : confirmer/implémenter | 🟡 | S | Exactitude | 14 |
|C6|Numérotation séquentielle légale des factures | 🟡 | S | Conformité | 15 |

## Bac 4 — PEUT attendre V2
| # | Problème | Grav | Effort |
|---|---|---|---|
|V1|Migration UTC + librairie timezone (luxon) | 🟡 | L |
|V2|Système de coupons / codes promo / remise panier | 🟢 | L |
|V3|Export comptable (FEC/CSV) | 🟡 | M |
|V4|Attestation de formation | 🟢 | M |
|V5|Règles d'affectation multi-praticiennes (round-robin, charge) | 🟢 | L |
|V6|Découpage des monolithes (clientController, stripeController) | 🟡 | L |
|V7|TTL/rétention EventLog/SendLog | 🟢 | S |

## Ordre recommandé (chemin critique avant React)
1. **B1** (décision TVA) — débloque R3/R4.
2. **B2** (montant Stripe) — quick win sécurité financière.
3. **B3** (réconciliation commission) — débloque R5.
4. **R1** (remboursement distanciel) + **R2** (statuts morts) — parité + propreté API.
5. **R5/R6** (décisions commission promo / acompte).
6. **R3/R4** (unification promo / facture) si B1 = assujetti.

## Effort agrégé estimé avant React
- Bloquant (B1-B3) : 1 décision majeure (TVA) + 2 corrections M.
- Fortement recommandé (R1-R6) : ~3 M + 3 décisions/S.
- Le reste (C, V) : pendant React ou V2.
