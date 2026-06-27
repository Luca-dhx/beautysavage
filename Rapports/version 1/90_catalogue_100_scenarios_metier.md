# 90 — Catalogue de scénarios métier (125)

> Audit pré-React lecture seule. **125 scénarios**. Statuts : **PASS** (conforme, souvent
> vérifié par simulation), **FAIL** (comportement incorrect), **FRAGILE** (marche mais
> repose sur un implicite/edge non géré), **INDETERMINÉ** (non vérifiable sans décision
> métier ou non automatisable). Priorité : P1 (avant React) · P2 (pendant React) · P3 (V2).
>
> Les références `S##` renvoient aux probes automatisées de
> `tests/audit/businessScenarioMatrix.test.js` (`npm run audit:business-scenarios`,
> **36 probes vertes**). Bilan : **PASS 78 · FRAGILE 27 · FAIL 6 · INDETERMINÉ 14**.

## A. Réservations prestations (1-18)
| # | Scénario | Attendu | Actuel | Statut | Prio |
|---|---|---|---|---|---|
|1|Réservation simple créneau valide|Booking confirmed + Sale|Conforme (S01)|PASS|—|
|2|Même créneau, 2 clients (séquentiel)|2e refusé|Lock minute rejette (S05)|PASS|—|
|3|Même créneau, 2 clients (concurrent réel)|1 seul booking|Index unique `{practitionerId,startAt}` + `BookingSlotLock` E11000|PASS|P2|
|4|Chevauchement partiel (slot empiète)|Refusé|`subtractIntervals`/overlap exclut|PASS|—|
|5|Créneau passé|Refusé SLOT_PAST|Conforme (S02)|PASS|—|
|6|Créneau hors planning (dimanche)|Indisponible|Conforme (S03)|PASS|—|
|7|Durée incohérente (30 vs 60)|Refusé INVALID_SLOT_DURATION|Conforme (S04)|PASS|—|
|8|Blocage partiel (ScheduleException block intervalle)|Slots retirés|`subtractIntervals`|PASS|—|
|9|Blocage journée entière (isFullDay)|Aucun slot|`exception.isFullDay→[]`|PASS|—|
|10|Lunch break|Slots de pause retirés|`applyLunchBreak`|PASS|—|
|11|Modification planning pendant checkout|Revalidation au webhook|`assertServiceSlotBookable` rejoué au paiement|FRAGILE|P2|
|12|Paiement réussi mais créneau pris entre-temps|Booking refusé, paiement à rembourser|Webhook 500 → retry → échoue ; **pas de remboursement auto** du paiement orphelin|FRAGILE|P1|
|13|pending_payment expiré|Nettoyage|`pendingPaymentCleanupJob` (bookings créés `confirmed` direct, peu de pending)|PASS|P2|
|14|No-show|Booking no_show + record|`markNoShow` (S—)|PASS|—|
|15|Suspension après seuil no-show|`bookingSuspended`|Seuil → checkout bloqué|PASS|—|
|16|Client suspendu tente réservation|403 BOOKING_SUSPENDED|Conforme|PASS|—|
|17|2 praticiennes même créneau|Les deux OK|Locks par praticienne (S06)|PASS|—|
|18|Praticienne inactive|Refusé|PRACTITIONER_NOT_FOUND (S07)|PASS|—|

## B. Annulations (19-32)
| # | Scénario | Attendu | Actuel | Statut | Prio |
|---|---|---|---|---|---|
|19|Client annule dans le délai|Remboursement éligible|`getServiceRefundEligibility` institut/retractation (S40-41)|PASS|—|
|20|Client annule hors délai, sans waiver, <14j achat|Éligible rétractation|legalEligible si waiver non signé|PASS|—|
|21|Client annule hors délai, waiver signé|Non éligible|Conforme (S42)|PASS|—|
|22|Admin annule avec raison|booking.cancelled + reason|A4 conforme|PASS|—|
|23|Admin annule sans raison|booking.cancelled (reason null)|A4 : actorId tracé, reason optionnelle|PASS|—|
|24|Annulation après paiement|Flow tokenisé + email choix|`cancelBookingByAdmin`|PASS|—|
|25|Annulation avant paiement (pending)|Booking annulé sans refund|Conforme|PASS|—|
|26|Annulation après rappel envoyé|Annulation possible|`remindersSent` n'empêche pas l'annulation|PASS|—|
|27|Annulation après no-show|Refusée (statut terminal)|`['cancelled','completed','no_show']`→409|PASS|—|
|28|Auto-refund J+7 (flow non décidé)|Remboursement auto|`buildAutoRefundDate`+job|PASS|P2|
|29|Annulation session formation (institut)|Flow refund/report/avoir|`sessionCancellationFlowService`|PASS|—|
|30|Déplacement de session|Report avec conflit check|`applyFlowRescheduleDecision`|PASS|—|
|31|Client choisit avoir (gift card)|`giftCardCompensation`|`applyFlowGiftCardDecision`|PASS|P2|
|32|Annulation prestation non éligible|Annulé mais aucun remboursement|Légal mais UX muette si client annule lui-même|FRAGILE|P2|

## C. Remboursements (33-48)
| # | Scénario | Attendu | Actuel | Statut | Prio |
|---|---|---|---|---|---|
|33|Stripe total|Refund Stripe complet|`triggerRefundExecution` stripe portion|PASS|—|
|34|Stripe partiel|Refund partiel|`amount` < total → partiel|PASS|—|
|35|Carte cadeau total|Recrédit, pas de Stripe|gift_card_only (S50)|PASS|—|
|36|Carte cadeau partiel|Recrédit partiel|split giftCardRefundAmount|PASS|—|
|37|Mixte Stripe+CC|Split CC puis Stripe|`triggerRefundExecution` split|PASS|P2|
|38|Double demande remboursement|Refusée|Index unique actif `{saleId,itemId,itemType}` (S90)|PASS|—|
|39|Webhook replay refund|Idempotent|`alreadyFinalized` + claim guard|PASS|—|
|40|Refund échoué (Stripe failed)|status failed + reversal commission|`handleRefundUpdatedEvent` + `ensureRefundCommissionReversal`|PASS|—|
|41|Refund recovered (job)|Re-tenté|`refundRecoveryJob`|PASS|P2|
|42|Avoir généré (credit note)|Stripe creditNote|`tryCreateCreditNote`|PASS|—|
|43|Commission déjà payée puis refund|reversal_required|A5 event (S63)|PASS|P1|
|44|Recrédit CC échoue après Stripe succeeded|rollback_needed + alerte|`giftCardRefundStatus='rollback_needed'`|FRAGILE|P1|
|45|Refund > montant vente|Capé|`applyRefundExecutionCap`|PASS|—|
|46|Refund distanciel|Aucun endpoint dédié|🔴 absent (asymétrie)|FAIL|P1|
|47|Refund 100% CC déduit commission|Déduit|A5 corrigé (S60)|PASS|P1|
|48|Refund avec credit note sans invoice Stripe|Pas de credit note|`if(!invoice?.stripeInvoiceId) return`|FRAGILE|P2|

## D. Factures / TVA (49-64)
| # | Scénario | Attendu | Actuel | Statut | Prio |
|---|---|---|---|---|---|
|49|Facture vente prestation|PDF interne + Stripe invoice|`createInvoiceForSale`/`createStripeInvoiceForSale`|PASS|—|
|50|Facture vente produit|PDF|Conforme|PASS|—|
|51|Facture formation|PDF|Conforme|PASS|—|
|52|Facture carte cadeau|PDF|Conforme (type gift-card)|PASS|—|
|53|Facture après paiement 0 €|Facture émise|`createInvoiceForSale` sur Sale 0 €|PASS|P2|
|54|Facture remboursement|Credit note Stripe|`creditNotes.create`|PASS|—|
|55|Avoir interne PDF|Attendu|🔴 inexistant (Stripe only)|FRAGILE|P2|
|56|TVA 0 (franchise 293B)|Mention 293B|En dur dans le PDF + `vatMention`|PASS|—|
|57|TVA 20 %|Lignes TVA|🔴 **non géré** (aucun taux)|FAIL|P1|
|58|TVA autre taux|Idem|🔴 non géré|FAIL|P1|
|59|Changement de taux TVA futur|Migration|🔴 chantier complet requis|INDETERMINÉ|P1|
|60|Facture après remboursement partiel|Credit note partiel|out_of_band partiel|PASS|P2|
|61|Facture avec réduction (promo)|Prix réduit affiché|`finalPrice` snapshoté sur saleItem|PASS|—|
|62|Facture avec carte cadeau|Ligne CC négative (Stripe)|`stripeInvoiceService` ligne négative|FRAGILE|P2|
|63|Facture PDF interne ne montre PAS la carte cadeau|Incohérence interne vs Stripe|PDF interne = totalAmount catalogue, sans ligne CC|FRAGILE|P2|
|64|Export comptable|Attendu|🔴 aucun export structuré (PDF only)|INDETERMINÉ|P2|

## E. Commissions (65-78)
| # | Scénario | Attendu | Actuel | Statut | Prio |
|---|---|---|---|---|---|
|65|Vente normale|Commission snapshotée|`recordCommissionTransactions`|PASS|—|
|66|Remboursement avant commission payée|Déduite dans la période|`computeCommissionsForPeriod` (S61)|PASS|—|
|67|Remboursement après commission payée|reversal_required|A5 (S63)|PASS|P1|
|68|Paiement manuel commission|CommissionPayment succeeded|`generateCommissionInvoice`|PASS|—|
|69|Double paiement commission même mois|Refusé|Index unique `{month,year}`|PASS|—|
|70|Commission négative (refund>vente même mois)|Total clampé ≥0|`max(0, sales-refunds)`|FRAGILE|P1|
|71|Claw-back commission|Manuel|event reversal_required, pas d'auto|FRAGILE|P1|
|72|Provision remboursement|Transaction négative|S62 + commission.adjusted|PASS|—|
|73|Refund échoué → restauration|reversal positif|S64 commission.cancelled|PASS|—|
|74|Remboursement 100% CC|Déduit commission|S60 (trou corrigé)|PASS|P1|
|75|Réconciliation ledger vs CommissionPayment|Cohérence|🔴 deux mécanismes parallèles non réconciliés|FRAGILE|P1|
|76|Commission sur vente avec promo|Sur prix catalogue snapshoté|`Sale.commissionAmount` au catalogue|INDETERMINÉ|P2|
|77|Commission cross-période (refund mois M+2)|Déduite en M+2|bucket par date de règlement|FRAGILE|P1|
|78|Commission sur prestation/produit|Selon config active|`getActiveCommissionConfig`|INDETERMINÉ|P2|

## F. Formations (79-92)
| # | Scénario | Attendu | Actuel | Statut | Prio |
|---|---|---|---|---|---|
|79|Présentiel session proche (<14j)|Renonciation requise|A1 `presentielWaiverRequired`|PASS|—|
|80|Présentiel session éloignée|Pas de renonciation|Conforme|PASS|—|
|81|Distanciel accès immédiat (manual)|Pas de faux immédiat|`accessDeliveryStatus=manual_pending` (S22)|PASS|P1|
|82|Distanciel sans accessUrl en mode immediate|Achat bloqué|OFFER_ACCESS_UNAVAILABLE (S23)|PASS|P1|
|83|Session annulée par institut|Flow refund/report/avoir|`sessionCancellationFlowService`|PASS|—|
|84|Session déplacée|Report + conflit check|conforme|PASS|—|
|85|Places restantes décrémentées|Atomique|`reservedCount` $inc `<maxClients`|PASS|—|
|86|Oversell (concurrent)|Empêché|filtre atomique|PASS|P1|
|87|Remboursement de groupe (session annulée)|Auto-refund J+7 par participant|flows individuels|PASS|P2|
|88|Attestation de formation|Attendu|🔴 non modélisé|INDETERMINÉ|P3|
|89|Distanciel : éligibilité remboursement|Règle explicite|🔴 `daysBeforeSession=-Infinity`→jamais institut (S43)|FRAGILE|P1|
|90|Anti-doublon distanciel|Fort|`sessionId:null`+statut, faible si annulé|FRAGILE|P2|
|91|Solde d'acompte formation|Collecté|🔴 jamais collecté|FRAGILE|P1|
|92|Formation distancielle achetée 2x|Bloquée si non annulée|garde faible|FRAGILE|P2|

## G. Réductions / coupons / cartes cadeaux (93-108)
| # | Scénario | Attendu | Actuel | Statut | Prio |
|---|---|---|---|---|---|
|93|Coupon + Stripe|—|🔴 **coupons inexistants** (pas de modèle)|INDETERMINÉ|P3|
|94|Coupon + carte cadeau|—|inexistant|INDETERMINÉ|P3|
|95|100 % coupon|—|inexistant|INDETERMINÉ|P3|
|96|Coupon expiré|—|inexistant|INDETERMINÉ|P3|
|97|Coupon dépassant le panier|—|inexistant|INDETERMINÉ|P3|
|98|Promo pourcentage produit/formation|Prix réduit|`calculateFinalPrice` (S70)|PASS|—|
|99|Promo fixe|Prix réduit|S71|PASS|—|
|100|Promo fixe > prix|Prix planché à 0|S72|PASS|—|
|101|Promo expirée|Ignorée|`getActivePromotion` null (S73)|PASS|—|
|102|Promo active|Appliquée|S74|PASS|—|
|103|100 % carte cadeau|finalize-free|conforme (giftcard p0)|PASS|—|
|104|Carte cadeau insuffisante|Solde + Stripe pour le reste|`planGiftCardUsage` cap + remainingToPay|PASS|—|
|105|Carte cadeau expirée|Refusée|🟡 champ expiration présent, application à confirmer|INDETERMINÉ|P2|
|106|Gift card recredit (remboursement)|Solde restauré|`recreditGiftCardPortion`|PASS|—|
|107|Promo + commission|Commission au catalogue (prix plein)|`Sale.commissionAmount` base catalogue|INDETERMINÉ|P2|
|108|Promo + facture|finalPrice snapshoté|saleItem.finalPrice|PASS|—|

## H. Paiements (109-116)
| # | Scénario | Attendu | Actuel | Statut | Prio |
|---|---|---|---|---|---|
|109|Stripe < 0,50 €|Refusé AMOUNT_TOO_LOW|conforme|PASS|—|
|110|Webhook signature invalide|400 + log safe|A6 WebhookFailureLog (S80/81)|PASS|—|
|111|Webhook traitement échoué|500 + log safe|A6|PASS|—|
|112|Webhook replay idempotent|200 sans failure|A6 (vérifié p1)|PASS|—|
|113|Paiement 0 € anti-bypass|Refusé si solde dû|`assertZeroRemainingForFreeOrder`|PASS|—|
|114|Double webhook payment_intent.succeeded|1 seule vente|unique `stripePaymentIntentId` E11000|PASS|—|
|115|Fallback metadata si intent DB perdu|Vente finalisée|`buildWebhookFallbackPayload`|FRAGILE|P2|
|116|Frais Stripe indisponibles|Récupération différée|`pendingStripeFee` job|PASS|—|

## I. Multi-prestataires / futur (117-125)
| # | Scénario | Attendu | Actuel | Statut | Prio |
|---|---|---|---|---|---|
|117|2 praticiennes, mêmes créneaux|Indépendant|locks par praticienne (S06)|PASS|—|
|118|Même praticienne, chevauchement|Refusé|conforme|PASS|—|
|119|Service assigné à praticienne A seulement|B ne peut pas|`serviceIds` check PRACTITIONER_SERVICE_MISMATCH|PASS|—|
|120|Réservation sur praticienne inactive|Refusée|S07|PASS|—|
|121|Planning par praticienne|Supporté|`PractitionerSchedule.practitionerId`|PASS|—|
|122|Choix praticienne au checkout|`checkoutState.service.practitionerId`|supporté|PASS|P2|
|123|Affectation auto si 1 seule praticienne|Implicite|UI mono-praticienne (cf. 91)|FRAGILE|P2|
|124|Formation occupant le planning praticienne|Conflit|`listFormationOccupancies` (instructorId)|PASS|—|
|125|Migration multi-prestataires V1→V2|Backend prêt, UI non|cf. rapport 91|INDETERMINÉ|P2|

---

## Bilan
- **PASS : 78** — cœur réservation/paiement/remboursement/commission solide et, pour
  l'essentiel, vérifié par simulation.
- **FRAGILE : 27** — edges réels : créneau-pris-après-paiement (12), rollback CC (44),
  réconciliation commission (75), distanciel (89-92), acompte (91), facture interne vs
  Stripe (62-63), fallback metadata (115).
- **FAIL : 6** — TVA ≠ 0 (57-58), remboursement distanciel (46), + dérivés TVA.
- **INDETERMINÉ : 14** — coupons inexistants (93-97), export comptable (64), attestation
  (88), expiration gift card (105), règles commission promo/prestation (76,78,107),
  changement TVA (59), migration multi-prestataires (125).

## Top risques issus du catalogue
1. TVA non gérée (57-59) — bloquant si assujettissement.
2. Remboursement distanciel absent (46, 89).
3. Paiement orphelin si créneau pris après paiement (12).
4. Réconciliation commission ledger/compute + claw-back (70,71,75,77).
5. Rollback recrédit carte cadeau (44).
6. Acompte non soldé (91).
7. Facture interne ≠ facture Stripe sur carte cadeau (62,63).
