# 89 — Cartographie complète des circuits métier

> Audit pré-React **lecture seule**. Branche `phase-0-security-baseline`, HEAD `b819d7d`.
> Aucun code métier modifié. Établit la carte entrée → endpoint → contrôleur → service →
> modèle → effets (métier / financier / facture / EventLog / SendLog / Notification) → risque.
>
> Légende risque : 🟢 faible · 🟡 fragile · 🔴 élevé · ⬜ indéterminé.

## Vue d'ensemble des modèles financiers
- `Sale` — vente unitaire/panier/prestation/carte cadeau. Porte `totalAmount` (catalogue),
  `giftCardUsage[]`, `commissionAmount/Rate`, `stripeFee/Net`, `legalConsentSnapshot` (A1),
  `accessDeliveryStatus` (A7), `consumerWaiver*`.
- `Purchase` — droit d'accès (formation/produit), index anti-doublon.
- `ServiceBooking` — réservation prestation, `practitionerId`, lock via `BookingSlotLock`.
- `RefundRequest` — remboursement, split `stripeRefundAmount`/`giftCardRefundAmount`, `amount` total.
- `CommissionTransaction` — ledger (`sale`/`refund_adjustment`/`refund_reversal`).
- `CommissionPayment` — facture commission mensuelle (1/{month,year}).
- `Invoice` — facture client interne (PDF, mention 293B). `stripeInvoiceId` côté Stripe.
- `GiftCard` / `GiftCardTransaction` — solde + mouvements.
- `Promotion` — réduction par cible (product/formation), date-bornée.
- `EventLog` / `SendLog` / `WebhookFailureLog` — observabilité.

---

## 1. Réservation prestation (paiement Stripe)
| Étape | Détail |
|---|---|
| Entrée | Vitrine : choix prestation + créneau → checkout |
| Endpoint | `POST /api/stripe/create-checkout-session` (cart=false, item.type=service) |
| Contrôleur | `stripeController.createCheckoutSession` |
| Services | `assertServiceSlotBookable` (revalide créneau), `deriveLegalRequirements`+`validateCheckoutLegalConsents` (A1), `assertCheckoutFormationsPurchasable` (A7, no-op service), `reserveGiftCardAmountsForPaymentIntent` |
| Modèles | `StripeCheckoutIntent` (persistance state), PaymentIntent Stripe |
| Webhook | `POST /api/stripe/webhook` → `payment_intent.succeeded` → `processCheckoutStatePurchase` → `processServiceCheckoutStatePurchase` |
| Effet métier | `ServiceBooking` créé `confirmed` + `BookingSlotLock` par minute |
| Effet financier | `Sale` (deposit→totalAmount=acompte), gift-card debit, frais Stripe récupérés |
| Facture | `createStripeInvoiceForSale` (ratio acompte, ligne carte cadeau négative, 293B) |
| EventLog | `sale.finalized`, `booking.created`, `booking.confirmed` |
| SendLog | email confirmation (mailService) |
| Notification | `booking_created` (admin/praticienne) |
| Risque | 🟡 acompte = booking financièrement incomplet (A7 bloque désormais la mise en vente deposit) ; 🟡 revalidation créneau au webhook seulement si pas déjà au checkout |

## 2. Réservation prestation 0 € (100 % carte cadeau / gratuit)
| Endpoint | `POST /api/client/checkout/finalize-free` |
| Contrôleur | `clientController.finalizeFreeCheckout` → `processCheckoutStatePurchase` (requireZeroRemaining) |
| Garde | CGV+consentement (A1), offres (A7), `assertZeroRemainingForFreeOrder` (anti-bypass) |
| Effet | Sale + ServiceBooking + debit carte cadeau, **idempotence** via `free_<key>` sur `stripePaymentIntentId` |
| Risque | 🟢 anti-bypass paiement vérifié serveur ; 🟢 idempotence double-submit |

## 3. Disponibilités / créneaux
| Endpoint | `GET /api/vitrine/availability/slots` & `/days` (public) |
| Service | `computeAvailableSlotsForPractitioner` (planning hebdo + exceptions + lunch + bookings + sessions formation) |
| Modèles | `PractitionerSchedule`, `ScheduleException`, `ServiceBooking`, `FormationSession` |
| Risque | 🟡 **fuseau** : créneaux en heure murale locale (A2 force TZ=Europe/Paris hors test) ; 🟡 encodage exceptions UTC-minuit vs sessions local-minuit (incohérence aux bords) |

## 4. Annulation prestation — client
| Endpoint | `POST /api/client/bookings/:id/cancel` (`serviceBookingController.cancelMyBooking`) |
| Service | `getServiceRefundEligibility` → si éligible, `createRefundRequestOnce` + exécution |
| Effet | booking `cancelled`, lock libéré, RefundRequest |
| Risque | 🟡 si non éligible : annulation sans remboursement (comportement légal mais à confirmer côté UX) |

## 5. Annulation prestation — admin
| Endpoint | `POST /api/gestion/bookings/:bookingId/cancel` (`cancelBookingByAdmin`) |
| Effet | booking `cancelled`, lock libéré, **flow tokenisé** d'annulation + email (choix client refund/report/avoir) |
| EventLog | `booking.cancelled` (A4 : `actorId` admin + `reason`) |
| Risque | 🟢 A4 : trace acteur+raison ; 🟡 le remboursement effectif dépend du choix client via flow (auto-refund J+7) |

## 6. Annulation / déplacement de session formation (institut)
| Service | `sessionCancellationFlowService` : flows `session_cancelled` / `session_updated` / `formation_deleted` |
| Décisions client | `refund` / `reschedule` / `gift_card` (avoir) / `confirm` ; auto-refund J+7 |
| Effet financier | RefundRequest (auto/manuel) **ou** `giftCardCompensation` (avoir) **ou** report (`rescheduleInfo`) |
| EventLog | flux d'audit interne `pushFlowAudit` (pas d'EventLog domaine dédié `formation.session_cancelled`) |
| Risque | 🟡 pas d'event domaine `formation.session_cancelled` standardisé (audit interne au flow seulement) |

## 7. Remboursement (exécution)
| Service | `refundExecutionService.triggerRefundExecution` : split gift-card d'abord puis Stripe |
| Stripe | `stripe.refunds.create(payment_intent, amount, idempotencyKey)` → webhook `charge.refund.updated` |
| Gift-card | `recreditGiftCardPortion` + `claimGiftCardRecredit` (anti-double) |
| Webhook | `handleRefundUpdatedEvent` : succeeded→recrédit+credit note+email ; failed→commission reversal |
| Facture | `creditNotes.create` (out_of_band) si invoice Stripe |
| EventLog | `refund.succeeded` (email step), `refund.requested/failed` (A4 admin) |
| Risque | 🟡 `giftCardRefundStatus='rollback_needed'` si recrédit échoue post-Stripe (intervention manuelle) |

## 8. Remboursement — admin (décision)
| Endpoint | `PUT /api/gestion/.../refunds/:refundId` (`salesController.updateRefundStatus`) |
| Effet | transition statut → exécution / provision / reversal commission |
| EventLog | A4 : `refund.succeeded/failed/requested` + `actorId` + `reason` (persistée `meta.notes`) |
| Risque | 🟢 A4 tracé |

## 9. Commissions
| Vente | `recordCommissionTransactions` + `applySaleCommissionSnapshot` (snapshot `Sale.commissionAmount`) |
| Facture mensuelle | `computeCommissionsForPeriod` (ventes − remboursements réglés) → `CommissionPayment` |
| Remboursement | A5 : `ensureRefundCommissionProvision` (ligne négative) + events `commission.adjusted`/`reversal_required` ; `ensureRefundCommissionReversal` + `commission.cancelled` |
| Paiement | `commissionPaymentController.generateCommissionInvoice` (Stripe Dev) ; index unique `{month,year}` anti-doublon |
| Risque | 🟡 claw-back commission déjà payée = manuelle (event seulement) ; 🟡 double ledger (CommissionTransaction vs CommissionPayment.compute) non réconcilié |

## 10. Factures / TVA / avoirs
| Facture interne | `invoiceService.createInvoiceForSale` (PDF, **mention 293B en dur**, aucun taux TVA) |
| Facture Stripe | `stripeInvoiceService` (`vatMention`, `paid_out_of_band`, ratio acompte, ligne CC négative) |
| Avoir | Stripe `creditNotes` (remboursement) ; pas d'avoir interne PDF |
| Risque | 🔴 **aucune gestion de TVA** (franchise base figée) → tout passage à TVA = chantier ; voir rapport 92 |

## 11. Cartes cadeaux
| Achat | item.type=gift-card → `createGiftCardForPurchase` (Sale) |
| Usage | `planGiftCardUsage` (cap au montant dû) + `reserve`/`finalize` |
| Remboursement | recrédit `recreditGiftCardPortion` |
| Risque | 🟡 expiration carte cadeau : champ présent mais usage/expiration à vérifier (rapport 93) |

## 12. Formations présentielles
| Réservation | session obligatoire, `reservedCount` $inc atomique `< maxClients` (anti-oversell) |
| Annulation | `cancelFormationParticipation` → éligibilité présentiel + provision commission |
| Risque | 🟢 oversell protégé atomiquement ; 🟡 solde d'acompte formation jamais collecté |

## 13. Formations distancielles
| Réservation | pas de session, `sessionId:null` |
| Accès | A7 : `accessDeliveryMode` (`manual` défaut) ; `Sale.accessDeliveryStatus='manual_pending'` ; immédiat sans URL bloqué |
| Remboursement | 🔴 **aucun chemin de remboursement distanciel** (asymétrie présentiel) ; éligibilité présentiel renvoie toujours non-éligible institut (sessionDate null) |
| Risque | 🟡 anti-doublon distanciel faible (sessionId:null + statut) |

## 14. Paiements Stripe / 0 € / mixtes
| Stripe | PaymentIntent ≥ 0,50 € ; webhook idempotent (unique `stripePaymentIntentId`) |
| 0 € | finalize-free (gift-card 100 % / gratuit) |
| Mixte | gift-card + Stripe : split au remboursement ; commission au catalogue |
| Observabilité | A6 : `WebhookFailureLog` (signature/processing), duplicate idempotent non loggé |
| Risque | 🟢 idempotence ; 🟢 A6 observabilité |

## 15. No-show / suspension
| No-show | `markNoShow` → `NoShowRecord` + seuil `noShowSuspensionThreshold` → `User.bookingSuspended` |
| Suspension | bloque `createCheckoutSession` service (BOOKING_SUSPENDED) |
| EventLog | `booking.no_show_marked`, `booking.client_suspended` |
| Risque | 🟢 ; 🟡 pas de levée automatique de suspension documentée |

## 16. Tracking client/public & commissions
| Refund tracking | `GET /api/refund-tracking/:token` (public, token 30j) |
| Session cancel | page tokenisée `session-cancel-decision` |
| Commission | dashboard gestion (transactions + historique) |
| Risque | 🟢 tokens hashés/expirables |

## 17. Observabilité (EventLog / SendLog / WebhookFailureLog)
| EventLog | append-only, payload redacté (email/secret) ; events sale/booking/refund/commission/gift_card |
| SendLog | statut email (recipientHash, jamais l'email) + webhook Brevo (A3 sécurisé prod) |
| WebhookFailureLog | A6 (Stripe) ; endpoint dev `/api/gestion/dev/webhook-failures` |
| Risque | 🟡 pas de TTL/rétention ; 🟡 events `formation.session_*` non standardisés |

---

## Synthèse des risques transverses
1. 🔴 TVA inexistante (franchise base figée) — bloquant si assujettissement.
2. 🔴 Remboursement distanciel sans chemin.
3. 🟡 Fuseau horaire (mitigé A2, migration UTC souhaitable).
4. 🟡 Double mécanisme commission (ledger vs compute) non réconcilié.
5. 🟡 Acompte = réservation financièrement incomplète (A7 bloque la vente).
6. 🟡 Calculs de prix/discount partiellement côté client (à snapshoter, cf. 94).
7. 🟡 Modèle implicitement mono-praticienne côté UI (cf. 91).
