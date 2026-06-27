# 112 — Rapport corrections C1-C3 + audits C4-C6

> Branche `phase-0-security-baseline`. Corrections C1-C3 implémentées ; C4-C6 = audits +
> roadmap (pas de correction lourde). Aucun React, aucune UI, prix catalogue inchangés,
> checkout/remboursements intacts, pas de merge main.

## C1 — Reprise automatique du recrédit carte cadeau
- `services/giftCardRecreditRecoveryService.js` : `recoverGiftCardRecredit(refund)` +
  `runGiftCardRecreditRecovery({limit})`. Cible `giftCardRefundStatus='rollback_needed'` &
  `giftCardRecredited!=true`.
- **Idempotent** : réutilise le claim atomique `claimGiftCardRecredit` → **jamais de
  double-crédit**. Limite **MAX_ATTEMPTS=5** (`RefundRequest.giftCardRecreditAttempts`).
- Sur succès : recrédit + `giftCardRefundStatus='succeeded'` + finalisation du remboursement
  (status `succeeded` si Stripe réglé) + event `gift_card.recredit_recovered`.
- Sur échec : compteur incrémenté, `rollback_needed` conservé, event `gift_card.recredit_failed`.
- `automatisme/giftCardRecreditRecoveryJob.js` : scheduler (15 min, `unref`) câblé dans
  `app.js` (hors test).

## C2 — Facture officielle = Stripe
- `Invoice.documentKind` (`internal_snapshot`|`stripe_official`) + `Invoice.official` (Boolean).
- `invoiceService.createInvoiceForSale` → PDF interne marqué `internal_snapshot` / `official:false`
  (snapshot opérationnel **non fiscal**).
- `stripeInvoiceService` → quand la facture Stripe est attachée : `documentKind:'stripe_official'`,
  `official:true`.
- Helper `invoiceService.resolveOfficialInvoiceRef(invoice)` → `{ official, source:'stripe'|'none', id, url }`.
- **Commission** : facture officielle = facture **Stripe Dev** (`CommissionPayment.stripeInvoiceId`
  /`stripeInvoicePdfUrl`) ; la « facture interne commission » reste un détail de calcul.
- **0 €** : pas de facture Stripe → `official:false` (reçu interne non fiscal).
- Label TVA **293 B conservé** (V1 franchise).

## C3 — Distanciel = accès numérique à vie, non remboursable
- `Formation` : `accessLifetime` (défaut true), `accessExpiresAt` (null),
  `isRefundableAfterAccess` (false).
- `Sale.accessGrantedAt` : posé quand l'accès distanciel est **immédiat** (mode `immediate`
  + `accessUrl`) → `accessDeliveryStatus='immediate'`.
- `refundService.getDistancielRefundEligibility` : accès donné & `!isRefundableAfterAccess`
  → **refus** `distanciel_access_granted_non_refundable`. Pas d'expiration.
- Renonciation au droit de rétractation obligatoire **avant** accès immédiat (A1 :
  `legalConsentSnapshot.digitalContentImmediateAccessAccepted`).
- Achat distanciel **sans** renonciation → refusé (`LEGAL_CONSENT_REQUIRED`, A1).
- ⚠️ Pas d'endpoint client de remboursement distanciel (`cancelFormationParticipation` est
  présentiel-only) : la règle est portée par l'helper d'éligibilité + l'absence d'endpoint.

## C4 — Promotions (audit, rapport 108)
Deux mécanismes (`Promotion` + `Service.promotion`). Recommandation : **système unique**
(`Promotion` étendu à `service`), migration progressive. **Non bloquant React** (pricing
serveur B2 = source de vérité, snapshot du prix réduit).

## C5 — Acomptes (audit, rapport 109)
`Service.paymentType='deposit'` **bloqué** en V1 (A7, `OFFER_BALANCE_UNSUPPORTED`) car le
solde n'est pas collecté. **Bloqué V1**, roadmap V2 (suivi solde + relance + paiement +
facture + remboursement partiel). **Non bloquant React**.

## C6 — Gros contrôleurs (audits, rapports 110/111)
`clientController` (~3445 l) et `mailService` (~3845 l) = monolithes. Plan d'extraction
progressif (services purs, tests d'abord) : cœurs critiques d'abord
(`checkoutFinalizationService`, `stripeWebhookService`). **Non bloquant React** (dette qualité).

## Tests
Ajoutés (`tests/p1/`) : `giftCardRecreditRecovery`, `stripeInvoicesOfficialSource`,
`distanceLearningLifetimeAccessRefund` (+15).

| Suite | Tests |
|---|---|
| `npm test` | **283** |
| `test:p0` | 44 |
| `test:p1` | 233 |
| `test:integration` | 6 |
| `audit:business-scenarios` | 36 |
| `audit:commissions` | 20 |

## Risques restants
- Reprise recrédit **multi-cartes** : best-effort (le cas courant est mono-carte) — documenté.
- Distanciel : pas d'endpoint refund → règle portée par l'helper (pas de blocage de flux existant).
- Promotions dualité + acomptes V2 + refactor contrôleurs : dettes non bloquantes.

## Roadmap restante avant React
1. (Optionnel, recommandé) Extraire `checkoutFinalizationService` + `stripeWebhookService`
   (rapport 111) — fige les cœurs critiques avant ouverture React.
2. Unification promotions (108) — pendant React.
3. Acomptes V2 (109) — si besoin produit.

## Verdict React
**GO React.** Les cœurs paiement/checkout/remboursement/commission sont sécurisés, testés
(283 verts) et documentés. Les dettes restantes (promotions, acomptes, refactor) sont
**non bloquantes** et planifiées. Recommandation : extraire les 2 services critiques avant
d'ouvrir massivement React.
