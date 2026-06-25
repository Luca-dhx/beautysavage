# 49 — Rapport Phase 1 : Coffre de credentials `IntegratedApi` (minimal)

> **Phase 1 livrée.** Coffre AES-256-GCM + modèle `IntegratedApi` mono-tenant +
> service `getCredential` fail-loud + seeder depuis `.env` + migration des
> credentials tiers (secret_key Stripe Institut/Dev + api_key Brevo). Aucune
> valeur de secret n'apparaît dans ce rapport.
>
> **Repo.** `backend/` · branche `phase-0-security-baseline` · base `6eb462a`.
> **Tests.** 24 fichiers / 85 tests **verts** (dont 3 nouveaux fichiers Phase 1).

---

## 1. Inventaire final

| Décision | Secrets |
|---|---|
| **Migrés au coffre (lecture via `getCredential`)** | `STRIPE_SECRET_KEY` (stripe-institut/secret_key), `STRIPE_DEV_SECRET_KEY` (stripe-dev/secret_key), `BREVO_API_KEY` (brevo/api_key) |
| **Seedés au coffre, lecture encore `.env`** | `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_DEV_PUBLISHABLE_KEY`, `STRIPE_DEV_WEBHOOK_SECRET` |
| **À révoquer / supprimer** | `WEBHOOK_API_KEY` (clé live Stripe inutilisée) |
| **Conservés en `.env`** | `SESSION_SECRET`, `PWD_PEPPER`, `GIFT_CARD_PASSWORD_SECRET`, `EMAIL_VERIFICATION_SECRET` (crypto interne) ; `MONGODB_URI`, `PORT`, `NODE_ENV`, `APP_BASE_URL`, `NGROK_DOMAIN` (infra) ; `MAIL_FROM*`, `INSTITUTE_*`, `INVOICE_CONTACT_EMAIL`, `PLATFORM_*` (config) |
| **Nouveaux** | `CREDENTIAL_VAULT_KEY` (clé AES racine), `ALLOW_ENV_CREDENTIAL_FALLBACK` (flag migration) |

### Secrets à migrer / à laisser
- **À migrer** : credentials de fournisseurs tiers uniquement (Stripe Institut,
  Stripe Dev, Brevo). Cette phase migre les `secret_key`/`api_key` ; les
  `publishable_key`/`webhook_secret` sont **seedés** mais encore lus en `.env`
  (chemins de signature/front délicats, migrés à l'étape suivante).
- **À laisser** : crypto interne (déjà durci par `requireSecret()`), infra
  (`MONGODB_URI` héberge le coffre → ne peut s'auto-héberger), config non-secrète.

### Statut `WEBHOOK_API_KEY`
🔴 **Clé secrète Stripe LIVE (`sk_live_`), inutilisée**. **Non migrée.** Retirée de
`.env.example`. **À révoquer sur le dashboard Stripe** et supprimer de tout `.env`
réel. `.env` est gitignoré → pas de fuite versionnée connue.

---

## 2. Architecture livrée

```
   app boot ──> validateCredentialVaultKey()   (prod: bloquant si clé absente)
            └─> seedIntegratedApisFromEnv()     (idempotent, non-test)
                     │ encrypt(.env) ──> IntegratedApi (Mongo)
                     ▼
  driver ── getCredential(slug,{role,runtime}) ──┬─ VAULT (prioritaire) ─> decrypt
                                                 ├─ .env fallback (si flag=true)
                                                 └─ FAIL-LOUD (throw typé)
```

**Fichiers créés**
- `models/IntegratedApi.js` — registre mono-tenant + sous-doc `credentials[]` ; invariants (runtimeModel↔runtime, 1 actif par (role,runtime)).
- `utils/credentialVault.js` — `encryptCredential` / `decryptCredential` (AES-256-GCM, IV aléatoire, format `iv.authTag.ciphertext`) / `validateCredentialVaultKey` (boot bloquant en prod).
- `services/integratedApiCredentialService.js` — `getCredential`, `getCredentials`, `setIntegratedApiMode` + erreurs typées + map de fallback `.env`.
- `seeders/seedIntegratedApisFromEnv.js` — seed idempotent des 3 intégrations, runtime déterminé par préfixe de clé.
- `tests/p1/credentialVault.test.js`, `integratedApiCredentials.test.js`, `integratedApiSeed.test.js`.

**Fichiers modifiés (migration credentials)**
- Stripe Institut `secret_key` : `controllers/stripeController.js`, `controllers/invoiceController.js`, `controllers/salesController.js`, `services/refundExecutionService.js`, `services/stripeInvoiceService.js` (`getStripe()` → async, vault-backed).
- Stripe Dev `secret_key` : `utils/stripeDevClient.js` (singleton → `getStripeDevClient()` lazy/caché, null-tolérant), consommé par `controllers/devWebhookController.js`, `controllers/contractController.js`, `controllers/commissionPaymentController.js` (shadow-binding par fonction, aucun changement des call-sites).
- Brevo `api_key` : `services/mailService.js` (`postToBrevo`).
- Boot : `app.js` (validate + seed). Test harness : `tests/setup/testEnv.js` (clé factice + fallback activé en test). Doc : `.env.example`.

---

## 3. Dette supprimée par le coffre

| Dette | Statut | Comment |
|---|---|---|
| Secrets tiers en clair au repos | ✅ | AES-256-GCM en base (seedés chiffrés) |
| Duplication `STRIPE_SECRET_KEY` (5 fichiers) | ✅ | Consolidée derrière `getCredential` |
| Appel tiers avec placeholder | ✅ | Sentinelle `__UNFILLED__` + fail-loud |
| Pas de bascule test/prod modélisée | ✅ (modèle) | `mode` + `setIntegratedApiMode` (garde « rôles requis » = étape suivante) |
| Clé live morte | ⏳ | Retirée de `.env.example` ; **révocation manuelle requise** |

**Dette restante / introduite** : `publishable_key`/`webhook_secret` lus encore en
`.env` (étape suivante) ; secrets crypto internes en `.env` (assumé) ; **nouvelle
dette = `CREDENTIAL_VAULT_KEY`** (clé racine à protéger/rotationner — script de
rotation à écrire avant la prod).

---

## 4. Coût observé

| Axe | Réel |
|---|---|
| Backend | 5 fichiers créés + 11 fichiers migrés (édits ciblés, faible diff par fichier) |
| Frontend | 0 (aucune UI — différée post-React) |
| Migration de données | seed idempotent au boot (aucune migration destructive) |
| Tests | 3 fichiers (22 cas) ; suite passe de 64 → 85 tests |
| Sécurité | clé de coffre, fail-loud, masquage `lastFourChars` |

Complexité **Faible→Moyenne**, conforme à l'estimation du rapport 47.

---

## 5. Modèle recommandé (rappel, tel qu'implémenté)

`IntegratedApi { slug, name, provider, runtimeModel(single|dual_environment),
mode(test|prod), modeUpdatedAt, credentials[] }` · `Credential { role, type,
runtime(test|prod|null), encryptedValue, lastFourChars, isActive, createdAt,
updatedAt }`. **Pas** de multi-tenant, OAuth, auto-refresh, usage ledger, UI.

---

## 6. Plan d'implémentation (réalisé / suite)

**Réalisé (cette PR)** : coffre, modèle, service, seeder, tests, migration
secret_key/api_key, boot wiring, `.env.example`.

**Suite recommandée**
1. **Révoquer `WEBHOOK_API_KEY`** (manuel, Stripe dashboard) — urgent, indépendant.
2. Générer un vrai `CREDENTIAL_VAULT_KEY` (64 hex) par environnement ; seed au boot.
3. Migrer `webhook_secret` + `publishable_key` (lecture vault) — chemins signature/front.
4. `setIntegratedApiMode` gardé (refus prod si rôles requis manquants) + script de rotation de clé.
5. Désactiver `ALLOW_ENV_CREDENTIAL_FALLBACK` une fois le vault seedé et stable, puis retirer les LEGACY de `.env`.
6. (Post-React) UI panneau intégrations.

---

## 7. Risques restants

| Risque | Gravité | Mitigation |
|---|---|---|
| `CREDENTIAL_VAULT_KEY` perdue/absente → secrets inaccessibles | 🔴 | Boot bloquant en prod ; clé par env ; **script de rotation à écrire avant prod** |
| Clé live `WEBHOOK_API_KEY` non révoquée | 🔴 | Révocation manuelle (action ouverte) |
| Fallback `.env` laissé activé en prod par erreur | 🟠 | `false` par défaut dans `.env.example` ; documenté comme temporaire |
| `publishable_key`/`webhook_secret` encore en `.env` | 🟠 | Étape suivante planifiée ; seedés déjà au vault |
| Lecture vault à chaque appel Stripe (findOne) | 🟢 | Acceptable ; cache possible plus tard |
| Bus in-process / pas d'audit des mutations vault | 🟢 | Hors périmètre Phase 1 (Phases ultérieures) |

---

## 8. Ordre des PR (rappel)

`PR-0` révoquer la clé live → **PR-1 (cette PR)** coffre+service+seeder+migration
secret_key/api_key → PR-2 webhook/publishable → PR-3 mode gardé + rotation →
PR-4 retrait fallback/LEGACY → (post-React) UI.

## 9. Conclusion

Coffre minimal **livré et testé**, migration des credentials tiers sensibles sans
régression (85 tests verts), discipline mono-tenant respectée. Seule action
**urgente et manuelle** restante : **révoquer `WEBHOOK_API_KEY`**.
