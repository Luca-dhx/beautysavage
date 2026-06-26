# 67 — Rapport Phase 4D : premier subscriber Notification

> Repo `backend/`, branche `phase-0-security-baseline`, base `ebb69f0`.
> **Tests : 41 fichiers / 166 verts** (était 157, +9 : p0 44 · p1 116 · integration 6).
> Aucun secret/email affiché. **In-app uniquement, flag OFF par défaut.**

## 1. Livré

| Élément | Fichier |
|---|---|
| Ledger d'idempotence | `models/NotificationEventDelivery.js` |
| Subscriber | `subscribers/notificationEventSubscriber.js` |
| Flag de rollout | `.env.example` (`ENABLE_EVENT_NOTIFICATION_SUBSCRIBERS=false`) + `app.js` |
| Tests | `tests/p1/{notificationEventSubscriber,notificationEventIdempotence}.test.js` |
| Rapports | 66 (audit) + 67 (ce rapport) |

## 2. Notifications branchées (subscriber)

- `sale.finalized` → notification **`new_sale`**.
- `booking.no_show_marked` → notification **`no_show_recorded`**.

> Le brief disait `new_client` pour `sale.finalized` ; corrigé en `new_sale`
> (mapping sémantiquement correct ; `new_client` = inscription, sans event source).
> Voir rapport 66.

## 3. Flag de rollout

`ENABLE_EVENT_NOTIFICATION_SUBSCRIBERS` (défaut **`false`**) :
- prod/dev : subscribers enregistrés au boot **seulement si `true`** (`app.js`,
  hors mode test) ;
- test : **jamais** auto-enregistrés ; les tests appellent
  `registerNotificationSubscribers()` explicitement ;
- rollback : repasser le flag à `false` (aucun enregistrement) — instantané.

## 4. Subscriber — comportement

`registerNotificationSubscribers()` abonne 2 handlers via `subscribe()`
(dédoublonnage par Set du bus → pas de double-enregistrement). Chaque handler :
1. vérifie `eventName` ; 2. extrait `contextId` (sinon : **rien**, pas de throw) ;
3. **réclame** la livraison (idempotence) ; 4. crée la notif via
`triggerNotification` (service existant **réutilisé**, aucune réécriture).
**Best-effort** : try/catch interne + isolation des subscribers par le bus →
**jamais de throw** vers l'émetteur métier. **Aucun email, aucun autre effet.**

## 5. Idempotence

`NotificationEventDelivery` : index unique
`(eventName, contextType, contextId, notificationType)`. Réémettre le **même**
event (même `contextId`) → **une seule** notification (test : 2 emits → 1 notif,
1 delivery). `contextId` différents → notifications distinctes.

## 6. Double-run temporaire & rollback

- **Appels directs conservés** (`new_sale`, `no_show_recorded` dans
  clientController/serviceBookingController) — **non supprimés** (preuve forte
  requise avant suppression).
- **Subscriber OFF par défaut** : aucun doublon en prod tant que le flag reste
  `false`. On n'active **pas** subscriber + appel direct simultanément en prod (le
  ledger ne dédoublonne pas les deux chemins ; cf. rapport 66).
- **Rollback** : flag `false` → plus aucun enregistrement.

## 7. Tests (9)

flag OFF (non enregistré) → aucune notif ; enregistré → `new_sale` /
`no_show_recorded` créées ; payload incomplet → aucune notif, pas de throw ;
double emit → 1 notif ; handler appelé 2× → 1 notif ; contextIds différents → 2
notifs ; échec création → pas de throw à l'émetteur ; aucun SendLog/email créé.

## 8. Limites V1

- 2 notifications seulement (démonstration du pattern).
- Variables de notif **minimales** (dérivées de l'EventLog : `saleId`/`amount`,
  `bookingId`) — pas de parité complète avec l'appel direct (clientName,
  serviceName…). Enrichissement possible (re-fetch) en Phase 4E.
- Appels directs encore présents (pas d'activation simultanée en prod).
- Pas de TTL sur `NotificationEventDelivery`.

## 9. Risques restants

- 🟠 Si le flag est activé **et** l'appel direct conservé → doublon (le ledger ne
  couvre pas le chemin direct). **Mitigation** : ne pas activer les deux ;
  supprimer l'appel direct au moment de l'activation.
- 🟢 Bus in-process : perte possible d'un event au crash → notif manquée (mitigée
  par la persistance EventLog + future reprise).
- 🟢 Variables minimales (cf. limites).

## 10. Prochaine phase recommandée

**Phase 4E** : valider le subscriber en staging (flag ON), **supprimer l'appel
direct** des 2 notifications migrées (après preuve), enrichir les variables
(re-fetch léger), puis migrer 1-2 notifications P2. Ensuite **versioning des
templates email** (draft→publish). Toujours backend, avant React.
