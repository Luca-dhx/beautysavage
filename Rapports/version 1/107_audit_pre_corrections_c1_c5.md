# 107 — Audit pré-corrections C1-C6

> État AVANT (HEAD `9c9de3e`) + stratégie. Lecture seule.

## C1 — Carte cadeau `rollback_needed`
- **Quand** : `stripeController.handleRefundUpdatedEvent` — Stripe refund `succeeded` mais
  `recreditGiftCardPortion` (services/refundGiftCardService.js) **throw** → `giftCardRefundStatus='rollback_needed'`,
  `status='pending'`, note « Echec Stripe - intervention requise ».
- **Reprise actuelle** : `refundRecoveryService.runRefundRecovery` ne cible que
  `status ∈ {requested,pending}` et rappelle `triggerRefundExecution` — **pas de reprise
  dédiée** au recrédit carte cadeau ; risque de re-déclencher la logique Stripe.
- **Garde anti-double** disponible : `refundRequestService.claimGiftCardRecredit(refundId)`
  (atomique : pose `giftCardRecreditInProgress` seulement si pas déjà recrédité/en cours).
- **Stratégie C1** : `giftCardRecreditRecoveryService` + job dédié ; cible
  `giftCardRefundStatus='rollback_needed'` & `giftCardRecredited!=true` ; claim → recredit →
  finalise ; idempotent ; compteur d'essais ; events `gift_card.recredit_recovered` /
  `gift_card.recredit_failed`. (Pas de JobRunLog dans le projet → EventLog + logs safe.)

## C2 — Factures internes vs Stripe
- **Facture interne** : `services/invoiceService.createInvoiceForSale` → PDF + `Invoice`
  (mention 293 B, total catalogue). **Facture Stripe** : `stripeInvoiceService`
  (`paid_out_of_band`, ratio acompte, ligne carte cadeau négative, `stripeInvoiceId`).
- **Commission** : `commissionPaymentController.generateCommissionInvoice` → facture Stripe Dev
  (`stripeInvoiceId`/`stripeInvoicePdfUrl`).
- **Constat** : aucune marque explicite « officiel vs interne ». La facture interne pourrait
  être prise pour un document fiscal.
- **Stratégie C2** : marquer la facture interne comme **non officielle** (`Invoice.official=false`,
  `Invoice.documentKind='internal_snapshot'`) ; documenter que la **facture Stripe** est
  officielle (vente client + commission). 0 € → pas de facture Stripe (reçu interne non fiscal).
  Aucune rupture UI : champs additifs.

## C3 — Distanciel
- **Achat sans waiver** : déjà bloqué (A1 `digitalImmediateAccessWaiverRequired` →
  `LEGAL_CONSENT_REQUIRED`).
- **Accès** : A7 — `Formation.accessDeliveryMode` (`manual`|`immediate`) + `accessUrl` ;
  `Sale.accessDeliveryStatus` (`manual_pending`|`immediate`). `immediate` sans URL → achat bloqué.
- **Remboursement** : **aucun endpoint distanciel** (`cancelFormationParticipation` est
  **présentiel-only**). L'éligibilité présentiel renverrait non-éligible institut (sessionDate null).
- **Stratégie C3** : `Formation.accessLifetime`(défaut true)/`accessExpiresAt`(null)/`isRefundableAfterAccess`(false) ;
  `Sale.accessGrantedAt` (posé quand accès immédiat) ; `getDistancielRefundEligibility` →
  **refus** (`DISTANCIEL_ACCESS_NON_REFUNDABLE`) une fois l'accès donné. Renonciation =
  `legalConsentSnapshot.digitalContentImmediateAccessAccepted` (A1).

## C4 — Promotions (audit only)
- `Promotion` (product/formation, %/fixe, date-bornée) + `Service.promotion` (sous-doc inline
  prestation). **Deux mécanismes**. → rapport 108.

## C5 — Acomptes (audit only)
- `Service.paymentType='deposit'` + `depositType`/`depositValue`. Réservation deposit **bloquée**
  (A7 `assertServiceOfferBookable` → `OFFER_BALANCE_UNSUPPORTED`). Solde jamais collecté. → rapport 109.

## C6 — Gros contrôleurs (audit only)
- `clientController.js` (~3400 l), `stripeController.js` (~1750 l), `mailService.js`,
  `commissionPaymentController.js`. → rapports 110/111.

## Risques
- 🟡 Reprise recrédit : double-crédit si le claim n'est pas respecté → réutiliser
  `claimGiftCardRecredit` (atomique).
- 🟡 Distanciel : pas de endpoint refund → la règle est portée par l'helper d'éligibilité
  (+ absence d'endpoint), pas par un blocage de flux existant.
- 🟢 C2 additif (champs `official`/`documentKind`) — aucune rupture.
- 🟢 Ne pas toucher commissions sauf doc facturation Stripe (déjà officielle).
