# 27 - Rapport Phase 1B-2 remboursements

Date : 2026-06-22 · Branche : `phase-0-security-baseline`

## 1. Objectif
Fermer les P0 remboursements identifies par l'audit :
- anti-doublon `RefundRequest` par vente/item ;
- recredit carte cadeau idempotent ;
- plafond de remboursement au montant reellement paye.

## 2. Fichiers audites
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
- `tests/README.md`
- `tests/p0/refund.doubleRequest.characterization.test.js`
- `tests/p0/refund.recreditIdempotent.test.js`
- `tests/p0/refund.overRefund.test.js`

## 3. Fichiers modifies
| Fichier | Modification |
|---|---|
| `constants/refundRequest.js` | Source unique de verite des statuts actifs/inactifs refund + nom d'index. |
| `models/RefundRequest.js` | Ajout `giftCardRecreditInProgress` + index unique partiel actif `saleId + itemId + itemType`. |
| `services/refundRequestService.js` | Nouveau helper central : recherche d'actif, creation idempotente/refetch, claim de recredit, calcul/plafond du montant executable. |
| `services/refundGiftCardService.js` | Nouveau service partage de recredit carte cadeau utilisant les primitives atomiques existantes. |
| `services/refundExecutionService.js` | Plafond central, reutilisation du service partage, claim pour refunds 100% carte cadeau. |
| `controllers/stripeController.js` | Webhook `charge.refund.updated` rendu idempotent pour le recredit carte cadeau via claim persistant. |
| `controllers/clientController.js` | Flux refund client presentiel bascule sur `createRefundRequestOnce` + recherche d'actif par item. |
| `services/sessionCancellationFlowService.js` | Flux institut formation/prestation bascules sur le helper central + plafonnement avant creation. |
| `controllers/serviceBookingController.js` | Annulation client prestation basculee sur le helper central ; creation initiale en `requested`. |
| `app.js` | Construction guardee de l'index unique partiel `RefundRequest`. |
| `tests/p0/refund.doubleRequest.characterization.test.js` | Conversion en non-regression verte. |
| `tests/p0/refund.recreditIdempotent.test.js` | Nouveau test P0 duplicate webhook refund => un seul recredit. |
| `tests/p0/refund.overRefund.test.js` | Nouveau test P0 plafond sale total. |
| `tests/README.md` | Mise a jour de l'etat reel des tests P0 apres Phase 1B-2. |
| `Rapports/version 1/26_audit_phase1b2_remboursements.md` | Audit cible prealable. |

## 4. Index ajoute / modifie
- **Ajout** : `RefundRequest` index unique partiel `uniq_active_refundrequest_sale_item`
  - cles : `{ saleId: 1, itemId: 1, itemType: 1 }`
  - filtre : `status in ['requested', 'pending', 'succeeded']`
- Construction ciblee via `RefundRequest.collection.createIndex(...)` dans `app.js`, protegee par `try/catch` pour ne pas bloquer le boot si des doublons legacy existent deja.

## 5. Strategie anti-doublon RefundRequest
- Definition explicite des statuts actifs : `requested`, `pending`, `succeeded`.
- Nouveau helper `createRefundRequestOnce(payload)` :
  - cherche un refund actif par `saleId + itemId + itemType`,
  - cree si absent,
  - intercepte `E11000`,
  - refetch le refund existant au lieu d'en lancer un second.
- Tous les chemins de creation refund audites passent desormais par ce helper :
  - annulation client prestation ;
  - annulation client formation presentiel ;
  - flow institut formation ;
  - flow institut prestation.
- Effet : un seul document actif et un seul declenchement financier.

## 6. Strategie idempotence recredit carte cadeau
- Nouveau flag persistant : `giftCardRecreditInProgress`.
- Nouveau claim atomique `claimGiftCardRecredit(refundId)` :
  - `findOneAndUpdate` conditionnel sur `giftCardRecredited != true` et `giftCardRecreditInProgress != true`,
  - pose le claim avant tout recredit.
- Recredit mutualise dans `services/refundGiftCardService.js` et execute via primitive atomique `recreditGiftCardBalanceAtomic`.
- En duplicate webhook :
  - le second appel ne reprend pas le claim,
  - il skippe le recredit,
  - aucune seconde `GiftCardTransaction` positive n'est creee.

## 7. Strategie plafond remboursement
- Nouveau calcul central dans `refundRequestService.js` :
  - `requestedAmount`
  - `saleTotal`
  - `alreadyCommittedAmount` = somme des autres refunds actifs de la vente
  - `cappedAmount = min(requestedAmount, saleTotal - alreadyCommittedAmount)` borne a `>= 0`
- Ce plafonnement est applique :
  - avant creation sur les chemins metier ;
  - a nouveau dans `triggerRefundExecution` comme garde d'execution.
- Les montants executes (`amount`, `stripeRefundAmount`, `giftCardRefundAmount`) refletent desormais le plafond reel.

## 8. Tests ajoutes / modifies
- `tests/p0/refund.doubleRequest.characterization.test.js`
  - plus de `it.fails`
  - verifie l'index et le helper concurrent : 1 refund actif, 1 seul trigger financier
- `tests/p0/refund.recreditIdempotent.test.js`
  - duplicate concurrent `charge.refund.updated`
  - 1 seul recredit carte
  - 1 seule transaction `credit`
- `tests/p0/refund.overRefund.test.js`
  - refund mixte > `saleTotal` plafonne
  - refund 100% carte cadeau > `saleTotal` plafonne

## 9. Resultats exacts des tests
- `npm test` -> **13 fichiers : 29 passed | 1 expected fail | 1 todo** (31)
- `npm run test:p0` -> **11 fichiers : 23 passed | 1 expected fail | 1 todo** (25)
- `npm run test:integration` -> **2 fichiers : 6 passed** (6)

Attendus inchanges :
- `booking.doubleSlot.characterization.test.js` reste en `it.fails`
- `giftcard.zeroPayment.characterization.test.js` reste en `it.todo`

## 10. Risques fermes
- Double `RefundRequest` actif pour une meme vente / un meme item
- Double declenchement financier associe a un doublon refund
- Double recredit carte cadeau sur duplicate webhook refund
- Sur-remboursement au-dela du montant paye / `saleTotal`

## 11. Risques volontairement non traites
- Double-booking prestations
- Achat 0 EUR
- Systeme complet de retry / dead-letter des refunds bloques
- Idempotence complete des credit notes Stripe
- Reprise complete des flows institut consommes quand `triggerRefundExecution` echoue

## 12. Impacts production
- Aucun changement d'API publique.
- Les chemins refund existants gardent leur comportement nominal mais deviennent surs sur :
  - la concurrence de creation,
  - le rejeu webhook,
  - les montants superieurs au paye.
- En cas de doublon de creation, l'application reutilise desormais le refund existant.

## 13. Points de vigilance donnees legacy
- Si la production contient deja des doublons actifs `RefundRequest` sur le meme `(saleId, itemId, itemType)`, la creation de l'index echouera.
- Le boot reste non bloquant ; un log explicite signale la remediaton a faire.
- Recommandation prod avant enforcement complet :
  - detecter les doublons actifs ;
  - les dedupliquer / cloturer ;
  - redemarrer pour laisser l'index s'activer.

Exemple de detection :
```js
db.refundrequests.aggregate([
  {$match:{status:{$in:['requested','pending','succeeded']}}},
  {$group:{
    _id:{saleId:'$saleId',itemId:'$itemId',itemType:'$itemType'},
    n:{$sum:1},
    refundIds:{$push:'$refundId'}
  }},
  {$match:{n:{$gt:1}}}
])
```

## 14. Commandes executees
```bash
node --check services/refundRequestService.js
node --check services/refundGiftCardService.js
node --check services/refundExecutionService.js
node --check controllers/stripeController.js
node --check controllers/clientController.js
node --check services/sessionCancellationFlowService.js
node --check controllers/serviceBookingController.js
npx vitest run tests/p0/refund.doubleRequest.characterization.test.js tests/p0/refund.recreditIdempotent.test.js tests/p0/refund.overRefund.test.js
npm run test:p0
npm run test:integration
npm test
```

## 15. Recommandation Phase 1B-3
1. Traiter la reprise propre des refunds bloques (`requested`/`pending`) et ne plus consommer un flow institut si le trigger echoue.
2. Fermer le P0 double-booking prestations.
3. Traiter l'achat 0 EUR.
4. Si necessaire ensuite, rendre la credit note Stripe pleinement idempotente.
