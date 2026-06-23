# Rapport Phase 1B-5 - Expiration et liberation automatique des `pending_payment`

## 1. Objectif
Fermer le dernier risque P0 de reservation de prestation bloquante: les bookings `pending_payment` trop anciens doivent expirer automatiquement et liberer leurs verrous, sans toucher aux bookings payes ou confirmes.

## 2. Commit de depart
`93fec794b94e3130eccb0dee0d57741587683d8a`

## 3. Fichiers modifies
- `automatisme/pendingPaymentCleanupJob.js`
- `app.js`
- `constants/serviceBooking.js`
- `models/ServiceBooking.js`
- `architecture.md`
- `tests/p0/booking.pendingPaymentCleanup.test.js`
- `tests/README.md`
- `projectContext.json`
- `Rapports/version 1/36_audit_phase1b5_pending_payment.md`
- `Rapports/version 1/37_rapport_phase1b5_pending_payment.md`

## 4. Tests executes
- `npx vitest run tests/p0/booking.pendingPaymentCleanup.test.js`
- `npm test`
- `npm run test:p0`
- `npm run test:integration`

## 5. Resultat global
Tout est vert.
- `npm test`: 16 files, 50 passed, 0 todo, 0 expected-fail
- `npm run test:p0`: 14 files, 44 passed, 0 todo
- `npm run test:integration`: 2 files, 6 passed

## 6. Comportement final
- `PENDING_PAYMENT_EXPIRATION_MINUTES = 30`.
- Le job `automatisme/pendingPaymentCleanupJob.js` tourne hors test, de facon horaire.
- Il cible uniquement les bookings encore vraiment en attente: `status = pending_payment`, `paymentStatus = pending`, `saleId = null`, `stripePaymentIntentId = null`, et `createdAt` plus vieux que le cutoff.
- Il libere les `BookingSlotLock` associes au `bookingId`, puis marque le booking `cancelled` avec `cancelledBy = system`.
- Les bookings confirmes, payes, ou deja rattaches a une vente / un PaymentIntent restent intacts.
- Le job est idempotent: un second passage ne recree pas d effet utile.

## 7. Risques fermes
- Le blocage indefini des slots par `pending_payment` vieillissants.
- La suppression brute des reservations au lieu d une expiration metier.
- La confusion entre bookings en attente reelle et bookings deja payes mais pas encore reclasses.

## 8. Risques restants non P0
- Remboursement automatique si paiement encaisse mais slot devenu indisponible.
- Reprise complete des refunds bloques.
- Credit notes / factures d avoir Stripe totalement idempotentes.
- `requireStrictDev` / gestion fine des roles.
- Rate-limit login / reset password.
- XSS / SVG / responsive / migration React.

## 9. Cohérence doc
- `architecture.md`, `tests/README.md` et `projectContext.json` ont ete mis a jour.
- `projectContext.json` conservait deja un ajustement de documentation zero-payment du commit precedent; il a ete garde et etendu avec la Phase 1B-5.

## 10. Commandes executees
- `git status --short --branch`
- `git diff -- projectContext.json`
- `git rev-parse HEAD`
- `git branch --show-current`
- `npm test`
- `npm run test:p0`
- `npm run test:integration`
- `git grep --cached -n "sk_live_\\|xkeysib-\\|whsec_\\|mongodb+srv://.*:.*@"` -> uniquement placeholders `.env.example`, env de test et anciens rapports; aucun secret live

## 11. Decision
P0 pending_payment ferme. Le depot est pret pour la suite P1, sous reserve de confirmer les controles de secrets et l etat du worktree avant commit.
