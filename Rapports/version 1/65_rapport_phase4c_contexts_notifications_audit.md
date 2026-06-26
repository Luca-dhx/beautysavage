# 65 — Rapport Phase 4C : contextId emails + audit notifications

> Repo `backend/`, branche `phase-0-security-baseline`, base `6b85186`.
> **Tests : 39 fichiers / 157 verts** (était 151, +6 : p0 44 · p1 107 · integration 6).
> Aucun secret/email affiché.
> **Audit-only** : aucune notification migrée, aucun subscriber métier, aucun
> email/notif déclenché par event, montants/flux inchangés.

## 1. contextId ajoutés (Phase 4C)

| Email | contextType | contextId | Mécanisme |
|---|---|---|---|
| `password_reset` | `user` | `user._id` | `sendPasswordResetEmail(user)` → `postToBrevo(payload, { contextType:'user', contextId:user._id })` |

> Seul ajout trivial possible : le sender `password_reset` reçoit déjà l'objet
> `user`. Les autres senders cibles ne reçoivent pas l'id métier (voir différés).

## 2. contextId différés / N/A

| Email | Statut | Raison |
|---|---|---|
| `email_confirmation_code` | N/A | Envoyé **avant** la création du compte → aucun `user._id` |
| `gift_card_compensation` | Différé | Le sender reçoit `saleId`/code, **pas** `giftCard._id` |
| `session_*` / formation | Différé | Senders dénormalisés, **pas** `session._id` |
| `booking_*` (hors confirmed) | Différé | Pas d'id booking dans le sender |
| `site_*` / `maintenance` | OK | `contextType: system`, `contextId: null` (pas d'objet métier) |

`contextType` reste **auto-dérivé** (Phase 3) pour **tous** ces emails ; seul le
`contextId` manque, et les 3 dispatchers acceptent déjà `context` (4B) → ajout
trivial une fois l'id propagé. Détails : rapport 63.

## 3. Notifications auditées (aucune migrée)

11 points d'appel de `triggerNotification` recensés (clientController,
serviceBookingController, formationSessionController, stripeController, authRouter,
sessionCancellationFlowService). Système : config-driven (`NotificationConfig`),
crée un doc `Notification` in-app, non bloquant. Mapping notification → event cible
+ migratabilité + priorité : **rapport 64**.

**Aucune migration effectuée.** Tests : émettre un event métier **ne crée aucune
`Notification`** (aucun subscriber métier enregistré).

## 4. Plan Phase 4D (résumé)

Migration **progressive** des notifications derrière le bus via des **subscribers
idempotents** réutilisant `triggerNotification`, **commençant par 1-2
notifications P1 non critiques** (`new_client`, `no_show_recorded`). Pas d'envoi
email automatique (notif in-app seulement). Idempotence par
`(eventName, contextType, contextId)`. Rollback = additif + flag. Détails et
pattern : **rapport 64**.

## 5. Limites V1 (inchangées)

- **Aucune notification migrée** (Phase 4D à venir).
- Broadcast d'audit : les events ne déclenchent rien.
- contextId emails : password_reset ajouté ; gift_card/session/booking-autres
  différés (dispatchers prêts).
- Pas de TTL/rétention EventLog/SendLog.

## 6. Future relation Template Studio

Le `contextId` plus complet (sale, booking, refund, commission, user) renforce le
lien « un envoi ↔ son objet métier » pour le futur **Studio Email Template**
(post-React) : analytics par template **et** par objet/utilisateur.

## 7. Prochaine phase recommandée

**Phase 4D** : implémenter le **premier subscriber** (1-2 notifications P1 :
`new_client`, `no_show_recorded`) — idempotent, notif in-app uniquement, additif +
rollback. Puis compléter les `contextId` emails restants (gift_card/session) via
les dispatchers prêts. Puis **versioning des templates email** (draft→publish).
Toujours backend, avant React.
