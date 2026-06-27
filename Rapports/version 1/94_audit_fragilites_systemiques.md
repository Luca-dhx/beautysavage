# 94 — Audit des fragilités systémiques

> Lecture seule. Patterns transverses qui menacent la maintenabilité et la fiabilité,
> indépendamment d'un circuit précis. Gravité : 🔴 élevée · 🟡 moyenne · 🟢 faible.

## 1. Logique dupliquée
- 🟡 **Deux mécanismes de promotion** : `Promotion` (produit/formation) vs `Service.promotion`
  (sous-document prestation, évalué inline). Formats et logiques distincts (cf. 93).
- 🟡 **Deux mécanismes de commission au remboursement** : ledger `CommissionTransaction`
  (`refund_adjustment`/`refund_reversal`) **et** recalcul `computeCommissionsForPeriod`
  (sur `RefundRequest`). Non réconciliés → risque d'écart entre l'audit (ledger) et la
  facture réellement émise (compute).
- 🟡 **Calcul du split gift-card/Stripe** présent dans `refundExecutionService` ET logique
  de réservation dans `giftCardReservationService` ET fallback `GiftCardTransaction` — 3
  sources de vérité pour « combien a été payé en carte cadeau ».
- 🟡 **Finalisation d'achat** : `mockPay` (legacy) et `processCheckoutStatePurchase`
  dupliquent une grande partie de la logique de création de vente.

## 2. Calculs côté client / confiance au frontend
- 🟡 **Prix `amountToPay`/`remainingToPay`** proviennent du `checkoutState` client ; le
  serveur recalcule le gift-card plan mais la confiance initiale au montant client subsiste
  pour le montant Stripe (mitigé par `assertZeroRemainingForFreeOrder` côté 0 €, mais le
  chemin Stripe charge `amountToPay` client — un client malveillant pourrait sous-payer ?
  → le webhook recrée la vente au **catalogue** donc la vente est correcte, mais le **montant
  encaissé Stripe** peut différer du dû). 🟡 **À vérifier/contraindre** : cohérence
  `amountCents` vs catalogue côté serveur avant PaymentIntent.
- 🟢 CGV/waiver désormais revalidés serveur (A1).
- 🟢 Créneau revalidé serveur (A7/availability).

## 3. Champs non snapshotés
- 🟢 `consumerWaiverSnapshot`, `legalConsentSnapshot`, `finalPrice`, `commissionAmount`
  snapshotés.
- 🟡 **TVA** : aucun snapshot de taux (inexistant) → si TVA introduite, les ventes passées
  n'ont aucune trace de taux.
- 🟡 **Practitioner/serviceName** parfois re-résolus à la lecture (email refund) plutôt que
  snapshotés sur le booking.

## 4. Statuts ambigus / absence d'état terminal
- 🟡 `RefundRequest.giftCardRefundStatus='rollback_needed'` : état d'**alerte** sans
  résolution automatique (intervention manuelle requise, pas de job de reprise dédié).
- 🟡 `ServiceBooking.status` inclut `pending_payment` (enum) alors que les bookings sont
  créés directement `confirmed` → statut quasi-mort, source de confusion.
- 🟡 Remboursement `status` vs `stripeRefundStatus` vs `giftCardRefundStatus` : **3 axes**
  de statut à tenir cohérents (logique de finalisation complexe dans `handleRefundUpdatedEvent`).

## 5. Cas non modélisés
- 🔴 **Remboursement distanciel** : aucun endpoint ; éligibilité présentiel renvoie
  toujours non-éligible institut (sessionDate null) → « marche par accident » (S43).
- 🔴 **Solde d'acompte** : jamais collecté (A7 bloque la vente deposit, mais la
  fonctionnalité reste un trou).
- 🟡 **Attestation de formation**, **export comptable** : absents.
- 🟡 **Expiration carte cadeau** : champ présent, application non confirmée.
- 🟡 **Paiement orphelin** (créneau pris entre paiement et webhook) : pas de remboursement
  automatique du PaymentIntent encaissé si le booking échoue au webhook (scénario 12).

## 6. Couplages dangereux
- 🟡 **Formation instructrice ↔ planning prestations** : `listFormationOccupancies` couple
  les deux agendas via `instructorId`/`practitionerUserId`. Correct mais fort couplage.
- 🟡 **`serviceBookingController` importe `runPostSaleSideEffects` depuis `clientController`**
  → dépendance circulaire potentielle / contrôleur dépendant d'un autre contrôleur.
- 🟡 **Webhook Stripe → `processCheckoutStatePurchase` (clientController)** : le webhook
  dépend d'un gros contrôleur monolithique (clientController ~3300 lignes).

## 7. Zones mono-prestataire implicites
- 🟡 UI/parcours conçus autour d'une praticienne principale (`PractitionerProfile` lié à
  l'admin par défaut). Backend multi-OK (cf. 91), mais conventions implicites à lever.

## 8. Fuseau horaire (rappel A2)
- 🟡 Créneaux en heure murale locale ; A2 force `TZ=Europe/Paris` hors test mais la
  migration UTC + librairie reste souhaitable (encodage exceptions UTC-minuit vs sessions
  local-minuit = incohérence aux bords DST/minuit).

## 9. Monolithes / taille
- 🟡 `clientController.js` (~3300 lignes), `sessionCancellationFlowService.js`,
  `stripeController.js` (~1700 lignes) : difficiles à raisonner, surface de régression
  élevée. React n'y touche pas directement mais le contrat d'API en dépend.

## 10. Observabilité
- 🟢 EventLog/SendLog/WebhookFailureLog en place (A6).
- 🟡 Pas de TTL/rétention ; events `formation.session_*` non standardisés (audit interne au
  flow seulement) → trou de traçabilité sur les annulations de session.

## Synthèse — fragilités à adresser avant de figer le contrat d'API React
1. 🔴 Réconciliation commission (ledger vs compute) + claw-back.
2. 🔴 Remboursement distanciel (chemin + règle d'éligibilité explicite).
3. 🟡 Cohérence montant Stripe encaissé vs catalogue (anti-sous-paiement).
4. 🟡 Unification promotions (Promotion vs Service.promotion).
5. 🟡 Facture interne vs Stripe (carte cadeau) — une seule vérité.
6. 🟡 État `rollback_needed` : job de reprise ou procédure documentée.
7. 🟡 Statuts morts (`pending_payment`) à nettoyer pour ne pas les figer dans l'API.
