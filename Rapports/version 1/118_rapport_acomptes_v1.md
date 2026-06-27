# 118 — Rapport acomptes V1 (D3)

> Branche `phase-0-security-baseline`. Débloque l'acompte de façon SÛRE.

## Décision (option recommandée #1, validée)
L'acompte est autorisé **uniquement** si un **circuit de solde** existe :
`Service.balanceSettlementMode = 'pay_on_site'` (solde **tracé** et **réglé sur place**).
Sinon → **bloqué** (`OFFER_BALANCE_UNSUPPORTED`, A7). Pas de paiement Stripe du solde en V1.

## Règle métier
- `totalSoldAmount` = prix vendu total (après promotion).
- `depositAmount` = acompte (% ou fixe) encaissé **en ligne** (Stripe) → facture **officielle
  Stripe** = acompte.
- `balanceDueAmount` = `totalSoldAmount − depositAmount`, **réglé sur place** (tracé).
- `paymentStatus` : `deposit_paid` (acompte encaissé) → `paid` (solde réglé sur place).
- **Remboursement** : capé à l'**acompte encaissé** car `Sale.totalAmount = depositAmount`
  (le moteur de remboursement existant ne peut pas rembourser plus que l'encaissé).
- **Commission** : les prestations **ne génèrent pas** de commission → aucun risque de
  commission abusive sur le solde non encaissé.

## Changements
- `Service.balanceSettlementMode` (`none`|`pay_on_site`, défaut `none`).
- `ServiceBooking` : `totalSoldAmount`, `balanceDueAmount`, `balanceSettlementMode`, `balancePaidAt`.
- `offerReadinessService.evaluateServiceOfferReadiness` : deposit `ready` ssi `pay_on_site`.
- `processServiceCheckoutStatePurchase` : pose `totalSoldAmount`/`balanceDueAmount`/
  `balanceSettlementMode` ; `paymentStatus='deposit_paid'`.
- Endpoint admin `POST /api/gestion/bookings/:bookingId/balance-paid`
  (`markBalancePaidOnSite`) : solde réglé sur place → `balanceDueAmount=0`, `paymentStatus='paid'`,
  event `booking.balance_paid_on_site`. Idempotent.

## Tests
`tests/p1/depositPaymentFlow.test.js` : 100 €/acompte 30 €/solde 70 € → deposit_paid + solde
tracé ; sans circuit → refus ; double booking impossible ; remboursement capé à l'acompte ;
markBalancePaidOnSite → paid.

## Limites restantes
- **Pas de paiement Stripe du solde** en V1 (réglé sur place uniquement). Paiement en ligne du
  solde = V2 (endpoint + PaymentIntent + facture du solde).
- **Relance automatique** du solde : non implémentée (V2).
- **Formations présentielles en acompte** : non câblées (les formations n'utilisent pas
  `paymentType=deposit`) — V2 si besoin.
- Remboursement partiel après règlement du solde sur place : non géré (le solde n'est pas
  encaissé en ligne) — V2.
