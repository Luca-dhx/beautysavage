# 103 — Roadmap corrective commissions

> Lecture seule. Classe les corrections (aucune appliquée ici). Gravité 🔴/🟡/🟢, effort S/M/L.

## À CORRIGER AVANT REACT
*(fige le contrat d'API commission / risque financier direct)*

| # | Correction | Grav | Effort | Impact | Fichiers | Tests nécessaires |
|---|---|---|---|---|---|---|
|C1|**Rafraîchir le montant pending avant paiement** : appeler `refreshCommissionPayment` dans `createCommissionIntent` (et/ou `getCommissionPayments`) pour les `pending` ; sinon montant périmé | 🔴 | S | Évite de payer un mauvais montant | `commissionPaymentController.js`, `commissionPaymentService.js` | montant recalculé après refund tardif ; pas de recalcul si succeeded |
|C2|**Finaliser la commission via le webhook Dev** : handler dédié au PI `metadata.commissionPaymentId` (marque succeeded + facture) ; ne plus dépendre du seul polling | 🔴 | M | Robustesse paiement (navigateur fermé, fiabilité) | `devWebhookController.js`, `commissionPaymentController.js` | PI commission succeeded via webhook ; replay idempotent ; PI launch inchangé |
|C3|**Décision carry-over du négatif** (clamp `max(0,…)`) : reporter la déduction non absorbée sur le mois suivant OU documenter la perte comme acceptée | 🔴 | M | Exactitude financière (règle 6) | `commissionPaymentService.js` (modèle report) | refunds>ventes mois M → report sur M+1 |
|C4|**Réconcilier ledger ↔ facturation** : choisir UNE source de vérité (recommandé : `computeCommissionsForPeriod`) et reléguer `CommissionTransaction` à l'audit pur OU le supprimer du chemin de calcul | 🔴 | M | Supprime le doublon/divergence | `refundService.js`, `commissionPaymentService.js`, `commissionService.js`, `CommissionTransaction.js` | cohérence ledger vs facture |
|C5|**Verrou anti double-clic concurrent** sur `create-intent` (findOneAndUpdate conditionnel avant création du PI) | 🟡 | S | Évite deux PaymentIntents | `commissionPaymentController.js` | deux create-intent concurrents → un seul PI |

## PEUT ÊTRE CORRIGÉ PENDANT REACT
| # | Correction | Grav | Effort | Fichiers |
|---|---|---|---|---|
|D1|`accountPurpose` sur `IntegratedApi` (option B, rapport 101) + routage par purpose | 🟡 | S | `IntegratedApi.js`, `seedIntegratedApisFromEnv.js`, clients Stripe |
|D2|Confirmer le **périmètre commission** (formations seules vs + prestations/produits) et l'expliciter | 🟡 | S→M | `commissionService.js`, processors |
|D3|Marqueur explicite « commission facturée/payée » par vente (traçabilité fine) | 🟢 | M | `Sale.js` ou `CommissionTransaction` |
|D4|TVA sur facture commission : aligner avec la politique plateforme (subscription = 20 %, commission = 0) ou trancher | 🟡 | S | `commissionPaymentController.generateCommissionInvoice` |

## PEUT ATTENDRE V2
| # | Correction | Grav | Effort |
|---|---|---|---|
|V1|Modèle enfant `IntegratedApiAccount` (option C) si multi-comptes par provider | 🟢 | L |
|V2|Tableau de bord de réconciliation commission (ledger vs facture) | 🟢 | M |
|V3|Export comptable des commissions | 🟢 | M |

## Ordre recommandé (chemin critique)
1. **C4** (réconciliation — décide la source de vérité) → conditionne C1/C3.
2. **C1** (refresh avant paiement) — quick win anti mauvais-montant.
3. **C3** (carry-over) — décision métier puis implémentation.
4. **C2** (webhook Dev commission) — robustesse.
5. **C5** (verrou concurrent) — quick win.
6. **D1/D2** pendant React.

## Dépendances
- C1/C3 dépendent de C4 (quelle source fait foi).
- C3 nécessite une **décision métier** (carry-over ou perte assumée).
- D2 nécessite une **décision métier** (périmètre commission).

## Note
Aucune de ces corrections n'est appliquée dans la présente mission (audit only). Elles
constituent l'input de la **discussion produit/architecture sur l'unification du système de
commissions** recommandée en clôture du sprint B1-B2 (rapport 98).
