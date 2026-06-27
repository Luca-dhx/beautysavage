# 102 — Règles métier commission cibles

> Formalisation de la **décision métier validée**, confrontée à l'implémentation actuelle.
> Lecture seule.

## Règle cible (décision produit)
1. **Commission sur le montant réellement payé, carte cadeau incluse.**
2. **Promotions incluses** dans le prix réellement payé (commission sur le prix net vendu).
3. **Remboursement = déduction sur la facture de commission du mois COURANT** (mois du
   règlement du remboursement).
4. **L'ID du remboursement doit être visible dans la facture de commission.**
5. **Remboursement d'une vente d'un mois précédent → déduction sur le mois courant.**
6. **Commission déjà payée → ligne négative sur le mois courant.**
7. **Commission non encore payée → ajustement avant paiement.**

## Conformité actuelle (règle par règle)
| Règle | Implémentation actuelle | Statut |
|---|---|---|
| 1. Montant réellement payé, CC incluse | base = `finalPrice` formation (prix plein, CC = moyen de paiement) | ✅ **conforme** |
| 2. Promotions incluses | `finalPrice` est post-promo (`calculateFinalPrice`) | ✅ **conforme** |
| 3. Déduction sur le mois du règlement | `computeCommissionsForPeriod` bucket par `stripeRefundConfirmedAt\|\|refundedAt\|\|processedAt` | ✅ **conforme** |
| 4. ID remboursement dans la facture | `generateCommissionInvoice` : `invoiceItem` négatif `"REF-xxx → SALE-xxx"` | ✅ **conforme** |
| 5. Vente mois précédent, refund mois courant | bucketé sur le mois du règlement (courant) | ✅ **conforme** |
| 6. Commission déjà payée → ligne négative mois courant | la déduction tombe dans le `CommissionPayment` du mois de règlement ; **mais** clamp `max(0, …)` peut l'annuler si refunds > sales | 🟡 **fragile** |
| 7. Commission non payée → ajustement avant paiement | `computeCommissionsForPeriod` déduit, **mais** `amount` figé après création (refreshCommissionPayment mort) → l'ajustement n'est pas re-répercuté avant paiement | 🔴 **fragile/faux** |

## Cas

### Cas simples (conformes)
- Vente Stripe → commission sur finalPrice.
- Vente carte cadeau 100 % → commission identique (CC incluse).
- Vente avec promo → commission sur prix réduit.
- Remboursement total/partiel **avant** paiement, **même mois** → déduction proportionnelle.

### Cas complexes (fragiles)
- **Remboursement après commission payée** (mois antérieur réglé) : la déduction doit
  apparaître en **négatif sur le mois courant**. Aujourd'hui : c'est le cas SI le mois courant
  a assez de ventes ; sinon le **clamp à 0** annule le négatif → **perte de déduction**.
- **Remboursement tardif sur un mois pending non encore payé** : devrait ajuster le montant
  avant paiement. Aujourd'hui : `amount` figé (refresh mort) → mauvais montant possible.
- **Plusieurs remboursements cross-mois** : bucketing correct, mais cumul + clamp peut perdre.

### Cas indéterminés (décision/clarification nécessaire)
- **Produits / prestations** : aucune commission générée aujourd'hui. La règle cible parle de
  « montant réellement payé » sans restreindre aux formations → **à confirmer** : commission
  sur prestations/produits ou non ?
- **Report d'une déduction non absorbée** (clamp) : faut-il **reporter** le négatif sur le mois
  suivant (carry-over) plutôt que le perdre ? **Décision requise.**
- **Acompte prestation** (bloqué A7) : sans objet en V1.

## Données nécessaires / champs manquants
| Besoin | Présent ? |
|---|---|
| Snapshot commission sur la vente (`Sale.commissionAmount`/`commissionRate`) | ✅ |
| Lien refund → sale (`RefundRequest.saleId`) | ✅ |
| Montant remboursé total (`RefundRequest.amount`) + split (`stripeRefundAmount`/`giftCardRefundAmount`) | ✅ |
| Date de règlement du remboursement | ✅ (`stripeRefundConfirmedAt`/`refundedAt`/`processedAt`) |
| ID remboursement custom (`REF-xxx`) pour la facture | ✅ (résolu depuis `_id`) |
| **Carry-over d'une déduction non absorbée** (mois → mois) | ❌ **manquant** |
| **Réconciliation ledger ↔ facturation** | ❌ (deux mécanismes) |
| **Recalcul du montant pending avant paiement** | ❌ (`refreshCommissionPayment` mort) |
| **Marqueur "commission payée" par vente** (pour distinguer déjà-facturée) | 🟡 indirect (mois `succeeded`) |

## Synthèse
La **base de calcul** et le **principe de déduction mensuelle référencée** sont **déjà
conformes** à la règle cible. Les écarts résiduels sont : (a) le **clamp à 0** sans carry-over,
(b) le **montant pending figé** (refresh non câblé), (c) le **doublon ledger/facturation**, et
(d) le **périmètre formations-seulement** à confirmer.
