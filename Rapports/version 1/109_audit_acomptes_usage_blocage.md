# 109 — Audit acomptes : usage & blocage

> Audit only. Lecture seule.

## Le système d'acompte actuel
- **Configuré sur `Service`** : `paymentType` (`full`|`deposit`|`free`), `depositType`
  (`percentage`|`fixed`), `depositValue`.
- **Calcul** (`processServiceCheckoutStatePurchase`) : si `paymentType==='deposit'`,
  `depositAmount = depositValue%` du total (ou montant fixe capé) ; `Sale.totalAmount =
  depositAmount` (seul l'acompte est encaissé) ; `ServiceBooking.depositAmount` /
  `paymentType:'deposit'` / `paymentStatus:'deposit_paid'`.
- **Réservation** : un booking deposit serait créé `confirmed` mais **financièrement
  incomplet** (solde jamais collecté).

## Pourquoi il est bloqué
- Sprint **A7** : `offerReadinessService.assertServiceOfferBookable` **bloque** toute
  prestation `paymentType==='deposit'` au point central `assertServiceSlotBookable` →
  code **`OFFER_BALANCE_UNSUPPORTED`** (409). Donc **aucune réservation deposit possible** en V1.
- Raison : le **solde n'est jamais collecté** (pas de relance, pas de paiement du solde, pas
  de facture du solde, pas d'annulation/remboursement partiel) → laisser vendre un acompte
  serait vendre une réservation incomplète (cf. rapports 90 §91, 94, 95-B2).

## Exemple d'usage (cible, non implémenté)
Prestation 100 € : acompte 30 € en ligne (Stripe) à la réservation, solde 70 € réglé sur
place le jour du rendez-vous. Aujourd'hui : **bloqué** (la prestation doit être en
`paymentType:'full'`).

## Ce qui manque pour activer l'acompte (V2)
1. **Suivi du solde** : champs `balanceDue` / `balancePaidAt` / `balanceStatus` sur
   `ServiceBooking` (partiellement esquissé : `remainingPaymentRequired` côté offerReadiness).
2. **Relance** : rappel automatique du solde avant le rendez-vous.
3. **Paiement du solde** : endpoint + PaymentIntent dédié (ou encaissement sur place tracé).
4. **Facture** : la facture Stripe doit refléter acompte puis solde (ratio déjà géré côté
   `stripeInvoiceService` pour l'acompte, mais pas le solde).
5. **Annulation / remboursement partiel** : politique de remboursement de l'acompte
   (rétractation, no-show) à définir.
6. **Commission** : base = total ou encaissé ? (cohérence avec la règle commission).

## Décision
- **Bloqué en V1** (statu quo A7). C'est la position **sûre** : pas de réservation
  financièrement incomplète exposée à React.
- **Roadmap V2** (si le besoin produit est confirmé) : implémenter les 6 points ci-dessus,
  dérouler un parcours « acompte → solde » complet (en ligne ou sur place), puis lever le
  blocage `OFFER_BALANCE_UNSUPPORTED`.

## Bloquant React ?
**Non.** Le blocage est explicite et testé (A7). React n'a qu'à ne pas proposer d'offre
`deposit` tant que le parcours solde n'existe pas. Aucun risque financier.
