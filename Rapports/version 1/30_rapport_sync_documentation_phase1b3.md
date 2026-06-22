# Rapport 30 — Synchronisation documentation technique (Phase 0 → Phase 1B-3)

- **Date** : 2026-06-22
- **Branche** : `phase-0-security-baseline`
- **Dernier commit avant sync** : `f1f0b73 Prevent service booking double-booking`
- **Objectif** : aligner `architecture.md` et `projectContext.json` sur l'état réel du code après les phases de stabilisation V1 (init Git, harnais de tests, sécurité P0, Stripe/carte cadeau, remboursements, booking/disponibilités).

---

## 1. Fichiers lus

### Rapports de reprise
- `Rapports/version 1/20_rapport_init_git_phase0.md`
- `Rapports/version 1/21_audit_harnais_tests.md`
- `Rapports/version 1/22_rapport_harnais_tests_phase0.md`
- `Rapports/version 1/23_rapport_phase1a_securite_p0.md`
- `Rapports/version 1/24_audit_phase1b1_stripe_giftcard.md`
- `Rapports/version 1/25_rapport_phase1b1_stripe_giftcard.md`
- `Rapports/version 1/26_audit_phase1b2_remboursements.md`
- `Rapports/version 1/27_rapport_phase1b2_remboursements.md`
- `Rapports/version 1/28_audit_phase1b3_booking_disponibilites.md`
- `Rapports/version 1/29_rapport_phase1b3_booking_disponibilites.md`

### Code & config
- `tests/README.md`, `package.json`
- `utils/secretEnv.js`
- `models/Sale.js`, `models/RefundRequest.js`, `models/BookingSlotLock.js`
- `services/serviceAvailabilityService.js`, `services/giftCardReservationService.js`, `services/refundRequestService.js`, `services/refundGiftCardService.js`
- `constants/refundRequest.js`, `constants/serviceBooking.js`
- `controllers/stripeController.js`, `controllers/clientController.js`, `controllers/serviceBookingController.js`, `controllers/availabilityController.js`
- `tests/setup/*` et `tests/p0/*`, `tests/integration/*`
- `architecture.md`, `projectContext.json` (cibles)

---

## 2. Incohérences trouvées (avant sync)

1. **`architecture.md` — Idempotence webhook (section "Idempotence webhook")** : affirmait que `stripePaymentIntentId` était indexé en `sparse: true` (non unique). **Faux désormais** : index UNIQUE partiel `uniq_stripe_payment_intent` depuis Phase 1B-1.
2. **`architecture.md` — STEP 21d** : décrit l'ancien correctif de report de prestation (double passe `findOne` / `FormationSession`). **Superseded** par `createServiceBookingWithProtection` (Phase 1B-3). Conservé tel quel, mais la nouvelle section indique explicitement qu'il est obsolète.
3. **Absence totale de documentation** sur : harnais de tests (Vitest/Supertest/mongo-memory-server), garde production `mock-pay`, `utils/secretEnv.js`, suppression fuite mot de passe carte cadeau, index unique partiel `RefundRequest`, service d'anti-doublon refunds, `BookingSlotLock` / `serviceAvailabilityService`, constantes `refundRequest`/`serviceBooking`.
4. **`projectContext.json`** : 10 fichiers clés (créés ou recâblés par les phases) absents du tableau `files` ; `keyFiles` ne référençait aucun des nouveaux modules ; aucune entrée de changelog pour la reprise V1.

> À noter : `architecture.md` ne contenait **pas** d'affirmation explicite du type « mock-pay utilisable sans garde », « secrets avec fallback public », « double-booking non protégé » ou « pas d'anti-doublon refund ». Ces points étaient simplement **non documentés** ; la sync les couvre désormais positivement.

---

## 3. Modifications apportées à `architecture.md`

- **Correction ciblée** de la section *Idempotence webhook* : remplacement de la mention `sparse: true` par la description de l'index UNIQUE partiel `uniq_stripe_payment_intent` (`partialFilterExpression: { stripePaymentIntentId: { $type: 'string' } }`) + gestion E11000, avec renvoi vers la nouvelle section.
- **Ajout** d'une grande section finale **`## Reprise V1 — Phase 0 a Phase 1B-3`** (UTF-8 propre), faisant autorité, couvrant :
  - Phase 0 — init Git/GitHub + baseline + `.gitignore` + scan secrets ;
  - Phase 0 — harnais de tests (libs, scripts npm, `tests/setup/*`, liste des tests P0/intégration, résultats) ;
  - Phase 1A — garde `mock-pay`, `secretEnv.js`, fuite mot de passe carte cadeau, logs `trackingToken` ;
  - Phase 1B-1 — index unique partiel `Sale`, E11000 idempotent, `persistSale`, débit/recrédit atomiques ;
  - Phase 1B-2 — `constants/refundRequest.js`, `refundRequestService`, index unique partiel `RefundRequest`, plafond `saleTotal`, `refundGiftCardService` ;
  - Phase 1B-3 — `serviceAvailabilityService`, `BookingSlotLock`, `constants/serviceBooking.js`, anti double-booking / chevauchement / slot passé / hors planning / bloqué, recâblage des contrôleurs/services ;
  - Bloc **« Risques encore ouverts »**.

Aucune section existante n'a été réécrite ou supprimée (préservation maximale). Aucun mojibake supplémentaire introduit (ajouts en UTF-8 propre).

---

## 4. Modifications apportées à `projectContext.json`

Édition programmatique (round-trip JSON 2 espaces vérifié stable → diff strictement additif).

- **`files[]`** : 10 entrées ajoutées —
  `utils/secretEnv.js`, `constants/refundRequest.js`, `constants/serviceBooking.js`, `models/BookingSlotLock.js`, `services/serviceAvailabilityService.js`, `services/refundRequestService.js`, `services/refundGiftCardService.js`, `controllers/serviceBookingController.js`, `controllers/availabilityController.js`, `services/sessionCancellationFlowService.js` (avec `role` + `functions`).
- **`files[]` — champ `v1Stabilization` ajouté** sur 6 fichiers existants modifiés :
  `models/Sale.js`, `models/RefundRequest.js`, `services/giftCardReservationService.js`, `controllers/clientController.js`, `controllers/stripeController.js`, `controllers/salesController.js`.
- **`keyFiles`** : ajout de `secretEnvUtil`, `bookingSlotLockModel`, `serviceAvailabilityService`, `refundRequestService`, `refundGiftCardService`, `refundRequestConstants`, `serviceBookingConstants`, `testsReadme`.
- **Nouvelle clé `lastV1StabilizationPhases`** : changelog structuré (date, branche, dernier commit, rapports sources, détail Phase 0/1A/1B-1/1B-2/1B-3, résultats tests, risques restants).

---

## 5. Sections ajoutées

- `architecture.md` → `## Reprise V1 — Phase 0 a Phase 1B-3` (avec sous-section « Risques encore ouverts »).
- `projectContext.json` → clé `lastV1StabilizationPhases` + 10 entrées `files[]` + 8 entrées `keyFiles`.

---

## 6. Risques encore documentés (volontairement laissés ouverts)

- Achat 0 € (pas d'endpoint backend de finalisation gratuite ; bug frontend — test `giftcard.zeroPayment` en `todo`).
- Expiration / libération automatique des bookings `pending_payment` (les verrous persistent jusqu'à annulation manuelle/admin).
- Remboursement automatique si paiement encaissé mais slot devenu indisponible (booking rejeté en 409, pas d'auto-refund).
- Reprise complète des refunds bloqués.
- Credit notes / factures d'avoir Stripe totalement idempotentes.
- `requireStrictDev` / gestion fine des rôles.
- Rate-limit login / reset password.
- XSS / SVG / responsive / migration React (plus tard).

---

## 7. Points volontairement non modifiés

- Aucune logique métier touchée (sync documentaire uniquement).
- Sections historiques d'`architecture.md` (STEP 6 → STEP 21d) conservées intégralement, y compris leur mojibake d'origine (non corrigé pour éviter un diff massif ; aucun mojibake ajouté).
- STEP 21d conservé (marqué obsolète par la nouvelle section plutôt que supprimé).
- Tableau `files[]` existant non réordonné ni reformaté (ajouts en fin de tableau).

---

## 8. Commandes exécutées

```bash
npm test                 # 14 fichiers, 37 passed, 1 todo
npm run test:p0          # 12 fichiers, 31 passed, 1 todo
npm run test:integration # 2 fichiers, 6 passed
git grep --cached -n "sk_live_|xkeysib-|whsec_|mongodb+srv://.*:.*@"   # aucun match
git diff --stat -- architecture.md projectContext.json
git status
```

- **Tests** : tous verts (1 `todo` attendu : `giftcard.zeroPayment.characterization`, hors périmètre).
- **Scan secrets** : aucun secret dans les fichiers suivis.
- **Diff** : `architecture.md` +~90 lignes ; `projectContext.json` strictement additif (nouvelles entrées + champ `v1Stabilization`).

---

## 9. État Git final

- Branche : `phase-0-security-baseline` (pas de merge dans `main`).
- Fichiers modifiés : `architecture.md`, `projectContext.json`.
- Fichier ajouté : `Rapports/version 1/30_rapport_sync_documentation_phase1b3.md`.
- Commit : `Sync project documentation after V1 stabilization phases`.
