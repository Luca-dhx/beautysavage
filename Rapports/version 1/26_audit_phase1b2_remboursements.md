# 26 - Audit Phase 1B-2 remboursements

Date : 2026-06-22 · Branche : `phase-0-security-baseline` · Base lue avant correction : commit `922e590 Harden Stripe webhook and gift card debit idempotence`.

## Objectif
Auditer precisement les chemins de creation `RefundRequest`, les points de recredit carte cadeau et le calcul de montant, afin de fermer les P0 remboursements sans toucher au double-booking ni a l'achat 0 EUR.

## Fichiers audites
- `models/RefundRequest.js`
- `controllers/serviceBookingController.js`
- `controllers/clientController.js`
- `controllers/salesController.js`
- `controllers/stripeController.js`
- `services/refundExecutionService.js`
- `services/refundService.js`
- `services/sessionCancellationFlowService.js`
- `models/Sale.js`
- `models/GiftCard.js`
- `models/GiftCardTransaction.js`
- `tests/p0/refund.doubleRequest.characterization.test.js`
- tests P0 Stripe/carte cadeau existants

## Chemins de creation RefundRequest
| Chemin | Localisation auditee | Constat avant correction |
|---|---|---|
| Annulation client prestation | `controllers/serviceBookingController.js` | `RefundRequest.create(...)` direct, sans helper central, sans garde atomique, statut initial `pending`. |
| Annulation client formation presentiel | `controllers/clientController.js` | garde locale `assertNoActiveRefundRequestForSale(saleId)` trop large (vente entiere, pas item), puis `new RefundRequest(...).save()`. |
| Flow annulation institut formation | `services/sessionCancellationFlowService.js` | meme garde locale par `saleId`, puis `new RefundRequest(...).save()`. |
| Flow annulation institut prestation | `services/sessionCancellationFlowService.js` | meme probleme : deduplication vente entiere, pas item. |
| Retry/admin execution | `controllers/salesController.js` | pas de creation, mais reexecution d'un refund existant via `triggerRefundExecution`. |

## Champs permettant d'identifier l'unicite
- `saleId`
- `itemId`
- `itemType`

Constat avant correction :
- le modele n'avait qu'un index non unique `saleId + itemId + reason` ;
- aucun index ne protegeait `saleId + itemId + itemType` ;
- les gardes applicatives existantes travaillaient au niveau `saleId` uniquement, donc pouvaient bloquer des items differents tout en laissant une course TOCTOU sur le meme item.

## Statuts consideres actifs
Lecture du comportement metier et des transitions :
- actifs a considerer pour l'anti-doublon : `requested`, `pending`, `succeeded`
- non actifs pour autoriser une relance : `failed`, `canceled`

Justification :
- `requested` = demande creee mais non executee, donc deja engagee metier ;
- `pending` = Stripe declenche / attente webhook ;
- `succeeded` = refund deja honore, un second refund serait un doublon financier ;
- `failed` et `canceled` restent les seuls etats relancables.

## Points de recredit carte cadeau
| Point | Localisation auditee | Constat avant correction |
|---|---|---|
| Refund 100% carte cadeau | `services/refundExecutionService.js` | recredit direct non claime, potentiellement rejouable si `triggerRefundExecution` est relance. |
| Refund mixte apres webhook Stripe `charge.refund.updated` | `controllers/stripeController.js` | recredit rejoue sans garde persistante sur duplicate webhook. |
| Primitive de recredit carte | `services/giftCardReservationService.js` | primitive atomique disponible (`recreditGiftCardBalanceAtomic`), mais non utilisee par les flows refund ; le code faisait encore `card.save()` dans deux endroits refund. |

## Calcul actuel du montant (avant correction)
- `triggerRefundExecution` partait de `refundRequest.amount`.
- La portion carte cadeau etait bornee par `giftCardTotal`, mais le montant global n'etait pas plafonne par `sale.totalAmount`.
- Aucun cumul des autres refunds actifs/reussis de la vente n'etait deduit.
- Consequence : un `RefundRequest.amount` superieur au paye pouvait :
  - demander trop a Stripe cote logique applicative ;
  - surtout recrediter trop de carte cadeau ;
  - laisser des documents/communications avec un montant superieur au reel.

## Risques confirmes
- **P0 ferme par cette mission** :
  - doublon `RefundRequest` pour meme vente / meme item ;
  - double recredit carte cadeau sur duplicate webhook refund ;
  - sur-remboursement au-dela de `sale.totalAmount`.
- **Toujours ouverts hors perimetre strict** :
  - reprise complete des refunds bloques (`requested`/`pending`) si `triggerRefundExecution` echoue ;
  - consommation du flow institut malgre un echec de trigger ;
  - idempotence complete des credit notes Stripe ;
  - double-booking prestations ;
  - achat 0 EUR.

## Plan minimal de correction
1. Definir une source unique de verite pour les statuts actifs refund.
2. Ajouter un helper central `createRefundRequestOnce(payload)` qui :
   - cherche un refund actif par `saleId + itemId + itemType`,
   - tente la creation,
   - intercepte `E11000`,
   - refetch le refund existant au lieu de lancer un second flux financier.
3. Ajouter un index unique partiel Mongo sur `RefundRequest(saleId, itemId, itemType)` filtre sur `requested|pending|succeeded`, construit de facon guardee au boot.
4. Mutualiser le recredit carte cadeau dans un service partage utilisant la primitive atomique existante.
5. Ajouter un claim persistant `giftCardRecreditInProgress` avant tout recredit carte cadeau.
6. Plafonner systematiquement l'execution refund a `min(demande, montant restant remboursable de la vente)` avant split Stripe/carte cadeau.
7. Convertir le test `refund.doubleRequest` en non-regression et ajouter deux tests P0 :
   - duplicate webhook refund => un seul recredit ;
   - over-refund => montant plafonne.

## Conclusion d'audit
Le correctif minimal tient dans :
- un service de deduplication/refetch ;
- un index unique partiel guarde ;
- un claim de recredit carte cadeau ;
- un plafonnement centralise du montant execute.

Cela ferme les trois P0 financiers cibles sans elargir la mission au double-booking ni a l'achat 0 EUR.
