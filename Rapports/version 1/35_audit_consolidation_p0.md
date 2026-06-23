# 35 - Audit de consolidation P0

Date : 2026-06-23
Branche : `phase-0-security-baseline`
Commit de depart : `3e0679f Wire frontend zero-payment checkout`

## 1. Objectif
Verifier que tous les P0 fermes depuis Phase 1A -> 1B-4B sont bien closes, coherents entre eux, documentes, et sans regression cachee avant passage aux P1.

## 2. Commit de depart
- Branche active : `phase-0-security-baseline`
- HEAD audite : `3e0679f Wire frontend zero-payment checkout`
- `main` est reste intact pendant l audit.

## 3. Fichiers lus
- Rapports : `Rapports/version 1/23_rapport_phase1a_securite_p0.md` a `Rapports/version 1/34_rapport_phase1b4b_front_zero_payment.md`
- Documentation : `tests/README.md`, `architecture.md`, `projectContext.json`
- Routes / controllers : `routers/clientRouter.js`, `controllers/clientController.js`, `controllers/stripeController.js`, `controllers/serviceBookingController.js`, `controllers/salesController.js`, `controllers/sessionCancellationFlowController.js`
- Services : `services/giftCardReservationService.js`, `services/refundRequestService.js`, `services/refundGiftCardService.js`, `services/serviceAvailabilityService.js`
- Models : `models/Sale.js`, `models/RefundRequest.js`, `models/BookingSlotLock.js`
- Frontend : `public/js/modules/purchaseFlowService.js`, `public/js/modules/checkoutModule.js`, `public/js/modules/paymentResultModule.js`

## 4. Tests executes
- `npm test` -> 15 files, 45 passed, 0 todo, 0 expected-fail
- `npm run test:p0` -> 13 files, 39 passed, 0 todo
- `npm run test:integration` -> 2 files, 6 passed
- `node -e "JSON.parse(require('fs').readFileSync('projectContext.json','utf8'))"` -> OK
- `git grep -n "beautysavage-gift-card-secret\\|beautysavage-email-verification-secret\\|trackingToken.*console\\|password.*refund-tracking\\|mock-pay" .`
- `git grep --cached -n "sk_live_\\|xkeysib-\\|whsec_\\|mongodb+srv://.*:.*@"`

## 5. Resultat global
Tous les P0 listes dans le cahier de mission sont fermes cote code et tests.
Le seul bruit restant est documentaire / technique :
- warnings Mongoose d index dupliques au boot ;
- references `mock-pay` presentes dans la documentation et les tests de garde, ce qui est attendu ;
- `projectContext.json` a ete realigne pendant l audit pour supprimer le resume stale du zero-payment.

## 6. Tableau P0
| P0 | Statut | Preuve courte |
|---|---|---|
| 1. `mock-pay` inaccessible en production | Ferme | `routers/clientRouter.js` renvoie 404 en production |
| 2. secrets sans fallback public | Ferme | `utils/secretEnv.js` + tests `security.secrets` |
| 3. pas de fuite mot de passe carte cadeau via refund tracking | Ferme | `salesController.js` ne renvoie plus `password` |
| 4. pas de log `trackingToken` | Ferme | suppression du log debug + test statique |
| 5. idempotence Stripe PaymentIntent | Ferme | index unique partiel sur `Sale.stripePaymentIntentId` + E11000 idempotent |
| 6. debit carte cadeau atomique | Ferme | `debitGiftCardBalanceAtomic` |
| 7. anti-doublon `RefundRequest` | Ferme | index unique partiel + `createRefundRequestOnce` |
| 8. recredit carte cadeau idempotent | Ferme | `claimGiftCardRecredit` + `recreditGiftCardPortion` |
| 9. plafond remboursement `saleTotal` | Ferme | `calculateRefundExecutionCap` |
| 10. anti double-booking prestation | Ferme | `BookingSlotLock` + `createServiceBookingWithProtection` |
| 11. revalidation serveur des slots | Ferme | `assertServiceSlotBookable` sur booking et checkout |
| 12. achat 0 EUR backend | Ferme | `POST /api/client/checkout/finalize-free` |
| 13. achat 0 EUR frontend | Ferme | `checkoutModule` -> `paymentResultModule` -> `finalize-free` |
| 14. coherence documentation | Ferme | `architecture.md` coherent ; `projectContext.json` aligne pendant l audit |
| 15. harnais tests P0 sans todo / expected-fail | Ferme | 0 todo, 0 expected-fail |

## 7. Anomalies detectees
1. Les `git grep` sur `mock-pay` remontent encore des references attendues dans :
- les tests de garde ;
- la documentation historique ;
- le routeur qui maintient `mock-pay` seulement pour test/dev.
2. Aucun secret live n a ete trouve. Les seuls matchs `sk_live_`, `whsec_`, `mongodb+srv://...` sont des placeholders de `.env.example` ou des valeurs de test.
3. Aucun P0 ouvert n a ete identifie pendant l audit.

## 8. Warnings Mongoose d index dupliques
Les warnings sont du bruit de demarrage, pas une regression fonctionnelle immediate. Les tests passent. Ils valent surtout comme dette de nettoyage.

Modeles concernes observes :
- `models/user.js` -> `email`
- `models/Service.js` -> `slug`
- `models/EmailTemplateCategory.js` -> `slug`
- `models/VitrineMenuItem.js` -> `slug`
- `models/EmailTemplate.js` -> `functionName`
- `models/PractitionerProfile.js` -> `userId`
- `models/PractitionerSchedule.js` -> `practitionerId`
- `models/GiftCard.js` -> `code`
- `models/ServiceBooking.js` -> `bookingId`
- `models/SiteStatus.js` -> `key`
- `models/SocialLink.js` -> `type`
- `models/Sale.js` -> `saleId`, `invoiceToken`
- `models/RefundRequest.js` -> `trackingToken`
- `models/CommissionPayment.js` -> `stripePaymentIntentId`, `stripeInvoiceId`
- `models/ResetPasswordToken.js` -> `expiresAt`

Diagnostic :
- bruit seulement, sans casse actuelle ;
- risque principal = surcharge / confusion lors d une future migration d index ;
- correction future recommandee = ne garder qu une seule declaration d index par champ concerné, puis faire un sync indexes controle.

## 9. Coherence documentation
- `architecture.md` est aligne sur le flow final reel :
  - backend `finalize-free` pour les 0 EUR ;
  - frontend zero-payment sur `checkoutToken + freeCheckout=1` ;
  - `purchaseFlowService.finalizePurchase` ne depend plus de `mock-pay` pour les 0 EUR.
- `projectContext.json` contenait encore un resume stale sur `purchaseFlowService` et les compteurs P0 ; il a ete re-aligne pendant l audit sur l etat actuel.
- `tests/README.md` est coherent avec le harness actuel : 0 todo, 0 expected-fail.

## 10. Risques restants non P0
- expiration / liberation automatique des `pending_payment`
- reprise complete des refunds bloques
- credit notes Stripe totalement idempotentes
- durcissement `requireStrictDev` / roles
- rate limit login / reset password
- chantiers UX / React / SVG / responsive

## 11. Recommandations P1
1. Traiter la dette `pending_payment` des bookings avec expiration et liberation des verrous.
2. Nettoyer progressivement les indexes Mongoose dupliques, modele par modele.
3. Fermer la reprise exhaustive des refunds bloques avant d ouvrir des P1 metiers plus larges.
4. Ensuite seulement, attaquer le durcissement roles / rate limit / UX.

## 12. Commandes executees
```bash
git branch --show-current
git rev-parse HEAD
git log --oneline -1 main
git log --oneline -1 phase-0-security-baseline
git status --short
npm test
npm run test:p0
npm run test:integration
git grep -n "beautysavage-gift-card-secret\\|beautysavage-email-verification-secret\\|trackingToken.*console\\|password.*refund-tracking\\|mock-pay" .
git grep --cached -n "sk_live_\\|xkeysib-\\|whsec_\\|mongodb+srv://.*:.*@"
node -e "JSON.parse(require('fs').readFileSync('projectContext.json','utf8'))"
```

## 13. Decision
P0 fermes.
Prêt pour passage P1.
