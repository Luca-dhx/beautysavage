# 57 — Audit de cohérence documentaire (post-Phase 3)

> Consolidation **documentaire uniquement** (aucune modification métier). Repo
> `backend/`, branche `phase-0-security-baseline`, HEAD `180054c`. Tests : 130
> verts. Vérifie que `architecture.md`, `projectContext.json`, `tests/README.md`
> et les rapports reflètent le code réel.

## Méthode
Relecture croisée des docs vs code : modèles (`IntegratedApi`, `SendLog`,
`EventLog`), services (`credentialVault`, `integratedApiCredentialService`,
`sendLogService`, `eventBusService`, `mailService`), `constants/eventCatalog.js`,
`controllers/{brevoWebhook,devDiagnostic}`, `routers/devDiagnosticRouter`, `app.js`,
seeder, script de rotation. Inventaire vérifié : 51 modèles, 40 contrôleurs, 44
routers, 26 services, 11 jobs ; tous les fichiers Phase 1/2/3 présents.

## Classement

### ✅ Cohérent
- **Coffre IntegratedApi** : `architecture.md` (section coffre Phase 1/1B) +
  `projectContext.json` (phase1/1b) ⇆ code (`models/IntegratedApi.js`,
  `utils/credentialVault.js`, `services/integratedApiCredentialService.js`,
  seeder, rotation). Aligné.
- **SendLog & Brevo Observability** : doc Phase 2 ⇆ code (`models/SendLog.js`,
  `services/sendLogService.js`, `controllers/brevoWebhookController.js`,
  `GET /api/gestion/dev/send-logs`). Aligné.
- **EventBus / EventLog / EventCatalog** : doc Phase 3 ⇆ code. Aligné.
- **Tests** : doc annonce 130 (p0 44 / p1 80 / integration 6) ⇆ exécution réelle.
  Aligné.
- **Sécurité P0/P1** : sections existantes ⇆ code (guards, rate-limit, index,
  refund recovery). Aligné.

### ⚠️ Partiellement cohérent (corrigé)
- **§9 « Variables d'environnement »** (`architecture.md` ~l.1211) : décrivait
  `STRIPE_SECRET_KEY/PUBLISHABLE/WEBHOOK_SECRET` comme **lues directement** depuis
  `.env`. Depuis le coffre (Phase 1/1B), ces clés sont **sourcées via
  `getCredential`** avec `.env` en fallback LEGACY. → **Corrigé** : note de mise à
  jour ajoutée + mapping coffre (`stripe-institut/...`) en regard de chaque variable.
- **Table « double compte » Stripe** (~l.1381) : reste valide (les comptes
  existent) mais désormais médiatisée par le coffre. → Couverte par la nouvelle
  section consolidée et la note §9.
- **`projectContext.json`** : contenait les entrées phases 1/1b/2/3 mais pas de
  **snapshot consolidé** ni de `stabilizationStatus`. → **Corrigé** : ajout de
  `stabilizationStatus` + `projectStateSnapshot` (IntegratedApi, CredentialVault,
  SendLog, EventCatalog, EventBus, EventLog, keyFiles, statuts).

### 🟥 Obsolète (aucun trouvé de bloquant)
- Aucune assertion **fausse** bloquante détectée. Les marqueurs historiques
  (`[À CLARIFIER]` sur `runPostSaleSideEffects`, « migration React reportée »)
  restent **exacts**. La clé Stripe live orpheline est **retirée du code**
  (rapport 52) ; mention restante = historique des rapports (intentionnel).

## Corrections apportées (doc-only)
1. `architecture.md` §9 : note coffre + mapping `stripe-institut/*` sur les
   variables Stripe.
2. `architecture.md` : **nouvelle section « Etat du projet au commit 180054c »**
   (Sécurité / Paiements / Communication / Event System / Tests / Dette / Roadmap).
3. `projectContext.json` : `stabilizationStatus` + `projectStateSnapshot` complet.
4. `tests/README.md` : note de consolidation (130 tests) + pointeurs 57/58.
5. Création `58_architecture_snapshot_2026.md` (photographie pour reprise rapide).

## Conclusion
Après corrections, **documentation alignée sur le code** au commit `180054c`.
Aucune incohérence bloquante. Les seules zones « partielles » (descriptions
env-var pré-coffre) sont désormais annotées et pointent vers la source autoritaire
(coffre + section consolidée).
