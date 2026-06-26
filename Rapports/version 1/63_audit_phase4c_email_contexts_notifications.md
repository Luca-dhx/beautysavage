# 63 — Audit Phase 4C : contextId email restants

> Repo `backend/`, branche `phase-0-security-baseline`, base `6b85186`. Audit
> uniquement. Aucun secret/email affiché. `contextType` déjà **auto-dérivé**
> (Phase 3) pour tous les emails ; cet audit porte sur le `contextId`.

## Table des contextId email

| Email / template | contextType actuel | contextId actuel | contextId possible ? | Risque | Action |
|---|---|---|---|---|---|
| `vente` (sale) | `sale` | `saleId` | déjà | — | ✅ Fait (4A) |
| `booking_confirmed` | `service_booking` | `booking._id` | déjà | — | ✅ Fait (4A) |
| `booking_*` (cancelled/no_show/reminder/suspended) | `service_booking` (auto) | null | via caller (refactor) | Faible | ⏳ Différé |
| `refund_*` | `refund_request` (auto) | `refundId` | déjà | — | ✅ Fait (4B) |
| `commission_*` | `commission_payment` (auto) | `payment._id` | déjà | — | ✅ Fait (4B) |
| `password_reset` | `user` (auto) | `user._id` | **oui (trivial)** | Faible | ✅ **Fait (4C)** — `sendPasswordResetEmail(user)` |
| `email_confirmation_code` | `user` (auto) | null | **non** (pré-compte, pas de user._id) | Faible | ➖ N/A (aucun user au moment de l'envoi) |
| `gift_card_compensation` | `gift_card` (auto) | null | non sans refactor (le sender reçoit `saleId`/code, pas `giftCard._id`) | Faible | ⏳ Différé |
| `session_*` / formation | `formation_session` (auto) | null | non sans refactor (senders dénormalisés, pas `session._id`) | Moyen | ⏳ Différé |
| `site_*` / `maintenance_*` | `system` (auto) | null | n/a (pas d'objet métier) | — | ✅ OK (correct) |

## Conclusion
- **Ajouté (4C, trivial)** : `password_reset` → `contextType: user`,
  `contextId: user._id` (le sender reçoit déjà `user`).
- **N/A** : `email_confirmation_code` (envoyé avant la création du compte → aucun
  `user._id`) ; `site/system` (pas d'objet métier, `contextId: null` correct).
- **Différé** : `gift_card_compensation`, `session_*`, et les `booking_*` autres
  que confirmed — les senders **ne reçoivent pas l'id métier** ; l'attacher
  nécessiterait de propager l'id via les dispatchers/callers (les 3 dispatchers
  acceptent déjà `context` depuis 4B → ajout trivial une fois l'id propagé).
  Conforme à la règle « ne pas refactorer massivement `mailService.js` ».
