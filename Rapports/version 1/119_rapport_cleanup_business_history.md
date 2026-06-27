# 119 — Rapport cleanup business history (D4)

> Branche `phase-0-security-baseline`. Script VOLONTAIRE, jamais au boot.

## Script `scripts/cleanupBusinessHistory.js`
- **Dry-run par défaut** : `node scripts/cleanupBusinessHistory.js` → compte, ne supprime RIEN.
- `--apply` : supprime les collections transactionnelles.
- Options : `--include-bookings`, `--include-event-logs`, `--include-send-logs`.
- Garde-fou prod : refuse `--apply` en `NODE_ENV=production` sans `--force-prod`.
- Fonction exportée `cleanupBusinessHistory(opts)` (testable).

## Collections supprimables (whitelist STRICTE)
Toujours : `Sale`, `RefundRequest`, `CommissionPayment`, `CommissionTransaction`, `Invoice`,
`Purchase`, `StripeCheckoutIntent`, `GiftCardTransaction`, `BookingSlotLock`.
Optionnelles : `ServiceBooking` (`--include-bookings`), `EventLog` (`--include-event-logs`,
filtré sur `contextType ∈ {sale, service_booking, refund_request, commission_payment,
gift_card, formation_session}`), `SendLog` (`--include-send-logs`, même filtre).

## Collections JAMAIS supprimées (configuration)
`User`/Admin, `Service`, `Formation`, `Product`, `GiftCard`, `EmailTemplate`, `IntegratedApi`,
`Contract`, `CommissionConfig`, `CommissionSettings`, `PractitionerProfile`,
`PractitionerSchedule`, `ScheduleException`, `SiteIdentity`. (Hors whitelist → intouchables.)

## Tests
`tests/p1/businessHistoryCleanup.test.js` : dry-run ne supprime rien ; apply supprime les
transactionnelles ; `--include-bookings`/`--include-event-logs` ciblés ; **Service
(configuration) toujours intact**.

## Sécurité
- Aucune suppression sans `--apply`. Aucune exécution automatique. Whitelist explicite.
- `GiftCard` (cartes réelles, soldes clients) **non supprimée** ; seules les
  `GiftCardTransaction` (mouvements) le sont (avec --apply).
