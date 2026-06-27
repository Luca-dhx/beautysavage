# 106 — Audit documentation post-correction commissions

> Vérifie qu'aucune documentation **vivante** ne contredit le système corrigé (rapport 105).
> Les rapports d'audit historiques (99-104) sont des **instantanés pré-correction** : ils
> restent valides comme historique et pointent vers la correction.

## Vérifications demandées

| Vérification | Résultat |
|---|---|
| Aucune doc vivante ne dit que le montant commission est **figé** | ✅ `architecture.md` : section commissions 2026-03 marquée « historique » + section « Correction commissions » décrivant le **refresh obligatoire**. `projectContext.json` : `commissionCorrection.scope` documente le refresh. `tests/README.md` : suite `commissionPaymentRefresh`. |
| Aucune doc vivante ne dit que le **webhook Dev ne finalise pas** les commissions | ✅ `architecture.md` (section Webhook Dev) + `projectContext.json` documentent la finalisation via `metadata.commissionPaymentId` (`finalizeCommissionPaymentById`, idempotent), polling = fallback. |
| Aucune doc vivante ne dit que le **clamp perd les déductions** | ✅ `architecture.md` (carry-over) + `projectContext.json` documentent `negativeCarryOverAmount` (report). `tests/README.md` : `commissionCarryOver`. |
| `IntegratedAPI` documente `accountPurpose` | ✅ `architecture.md` (section IntegratedApi.accountPurpose) + `projectContext.json` + modèle `IntegratedApi.js` (enum exporté `ACCOUNT_PURPOSES`). |
| Roadmap pré-React à jour | ✅ Le rapport 103 listait C1-C5 ; le rapport 105 indique lesquels sont **faits** (C1 refresh, C2 webhook, C3 carry-over, C4 source unique/ledger audit, C5 verrou) + D1 accountPurpose. |
| Limitations restantes clairement marquées | ✅ Rapports 105 §Limites + `projectContext.json.commissionCorrection.limitesRestantes`. |

## Documents vivants mis à jour
- `architecture.md` :
  - Section « Systeme de paiement des commissions (2026-03-19) » : **avertissement** ajouté
    (historique, voir correction) + `computeCommissionsForPeriod`/`buildMonthlyComputation`
    réécrits.
  - Nouvelle section **« Correction commissions (2026-06 — rapports 104/105/106) »** = fait foi.
  - Compteur de tests : **268** / 63 fichiers ; mention des deux harnais d'audit.
- `projectContext.json` : clé `commissionCorrection` (règle, scope, limites) + statut.
- `tests/README.md` : section « Correction commissions (rapports 104-106) ».

## Cohérence des rapports d'audit historiques (99-104)
- Rapports **99-103** : audit *avant* correction — décrivent les fragilités (montant figé,
  webhook non finalisant, clamp, doublon). **Conservés tels quels** (valeur historique) ;
  le rapport **105** est la référence du « après ». Rapport **104** = état pré-correction +
  stratégie. Aucune contradiction : ce sont des instantanés datés, explicitement antérieurs.

## Règle métier finale (rappel)
Commission sur prix réellement payé (carte cadeau + promo incluses) ; remboursement déduit
du mois courant (ligne négative `refundId`+`saleId`) ; déductions excédentaires reportées
(carry-over) ; `CommissionTransaction` = ledger d'audit ; facture = `computeCommissionsForPeriod`
(source unique) ; refresh avant paiement ; webhook Dev finalise (idempotent) ; verrou
double-clic ; `IntegratedApi.accountPurpose` clarifie les comptes Stripe.

## Limites restantes (documentées)
- Documents `CommissionPayment` historiques `paid` non rétro-corrigés.
- Commission uniquement sur formations (produits/prestations = 0).
- Idempotency key inclut le montant (compat refresh).
- Réconciliation comptable / export : hors périmètre (V2, cf. rapport 95).

## Verdict documentation : ✅ COHÉRENTE
Aucune documentation vivante ne contredit le système corrigé. Les audits historiques sont
datés et superseded par le rapport 105.
