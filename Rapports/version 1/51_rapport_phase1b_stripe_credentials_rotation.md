# 51 — Rapport Phase 1B : Stripe publishable/webhook au coffre + rotation clé

> Finalise la migration des credentials Stripe restants vers le coffre et ajoute
> le script de rotation de `CREDENTIAL_VAULT_KEY`. Aucune valeur de secret n'est
> affichée. Repo `backend/`, branche `phase-0-security-baseline`, base `12bad1e`.
> **Tests : 27 fichiers / 99 tests verts** (était 85, +14).

## 1. Lectures `.env` supprimées (production)

| Variable | Avant | Après |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | `stripeController.handleWebhook` lisait `process.env` | `getCredential('stripe-institut',{role:'webhook_secret'})` |
| `STRIPE_DEV_WEBHOOK_SECRET` | const module `devWebhookController` | `getCredential('stripe-dev',{role:'webhook_secret'})` dans `handleDevWebhook` |
| `STRIPE_PUBLISHABLE_KEY` | `stripeController.getConfig` (sync) | `getConfig` async → `getCredential('stripe-institut',{role:'publishable_key'})` |
| `STRIPE_DEV_PUBLISHABLE_KEY` | `contractController.getStripeDevConfig` | `getCredential('stripe-dev',{role:'publishable_key'})` |

Plus aucune lecture directe de ces 4 variables dans `controllers/` (vérifié par
grep). Elles ne subsistent que dans : le **seeder** (alimente le coffre), la **map
de fallback** du service, les **fakes de test** (`testEnv.js`,
`stripeWebhookTestUtils.js`).

## 2. Comportement final — webhooks

- `handleWebhook` (Institut) et `handleDevWebhook` (Dev) récupèrent le
  `webhook_secret` **depuis le coffre** (runtime résolu via `integration.mode`).
- **Raw body et schéma de signature inchangés** : `constructEvent(rawBody, sig,
  secret)` reçoit exactement le même secret qu'avant (le coffre, ou `.env` en
  fallback si `ALLOW_ENV_CREDENTIAL_FALLBACK=true`).
- **Signature invalide → 400** (inchangé). **Secret indisponible → 500 contrôlé**
  (coffre vide + fallback off). Jamais d'envoi/vérif dégradé silencieux.
- **Priorité coffre** prouvée par test : avec une valeur `.env` différente, c'est
  la valeur du coffre qui est passée à `constructEvent`.

## 3. Comportement final — publishable key

- `GET /api/stripe/config` et la config Stripe Dev renvoient la **publishable key
  depuis le coffre** ; **jamais** de secret key exposée (test dédié vérifie que
  la réponse ne contient que `publishableKey`).
- Coffre vide + fallback off → **500**. Fallback on → valeur `.env`.

## 4. Script de rotation

`scripts/rotateCredentialVaultKey.js` :
- **dry-run par défaut**, `--apply` pour persister.
- Lit `OLD_CREDENTIAL_VAULT_KEY` / `NEW_CREDENTIAL_VAULT_KEY` ; valide les deux
  (64 hex) ; refuse sinon.
- Pour chaque `IntegratedApi.credentials[]` : déchiffre avec l'ancienne clé,
  rechiffre avec la nouvelle. Déjà-migré (déchiffrable seulement par la nouvelle)
  → `skipped` ; non déchiffrable par aucune → `error`.
- **Ne loggue jamais de valeur** : par credential, seulement
  `slug / role / runtime / status (migrated|skipped|error)`.
- Fonction `rotateVaultKey({oldKeyHex,newKeyHex,apply})` exportée et **testée**
  (`tests/p1/credentialVaultRotation.test.js`) ; le CLI ne s'exécute que si le
  script est invoqué directement (garde `import.meta.url`).

**Primitives ajoutées** au coffre : `encryptCredentialWithKey` /
`decryptCredentialWithKey` (clé explicite) ; `encryptCredential` /
`decryptCredential` délèguent à la clé d'env. `isValidKeyHex` exporté.

## 5. Tests ajoutés (14)

- `tests/p1/stripeCredentialMigration.test.js` — publishable depuis coffre,
  priorité coffre, gating fallback, pas de secret key exposée.
- `tests/p1/stripeWebhookCredentialVault.test.js` — webhook Institut+Dev depuis
  coffre (priorité coffre), signature invalide → 400, secret manquant → 500, aucun
  secret loggé.
- `tests/p1/credentialVaultRotation.test.js` — dry-run sans persistance, `--apply`
  rechiffre, idempotence (skip), clés invalides refusées, summary sans secret.

Suite complète : **99 tests verts** (p0 44 · p1 49 · integration 6).

## 6. Documentation mise à jour

`.env.example` (clés de rotation `OLD_/NEW_CREDENTIAL_VAULT_KEY`, rappel
`ALLOW_ENV_CREDENTIAL_FALLBACK=false` en prod, LEGACY conservé), `architecture.md`,
`projectContext.json`, `tests/README.md`.

## 7. Risques restants

| Risque | Gravité | Mitigation |
|---|---|---|
| `CREDENTIAL_VAULT_KEY` perdue | 🔴 | Boot bloquant prod + **script de rotation désormais livré et testé** |
| `WEBHOOK_API_KEY` live non révoquée | 🔴 | Action manuelle ouverte (hors code) |
| Fallback `.env` laissé `true` en prod | 🟠 | `false` par défaut + rappel doc ; à auditer au déploiement |
| Webhook Dev non couvert par un test e2e signé réel | 🟢 | Couverture unitaire (secret sourcing + 400/500) ; signature vérifiée par Stripe SDK inchangée |
| Lecture coffre par appel (findOne) | 🟢 | Acceptable ; cache possible ultérieurement |

## 8. Conclusion

Les 4 dernières lectures `.env` Stripe sont migrées au coffre **sans toucher** à
la logique de paiement/refund/booking/vente ni à la vérification de signature
(99 tests verts). Le script de rotation de clé racine est livré (dry-run/apply,
jamais de secret loggé). Reste l'action manuelle **révoquer `WEBHOOK_API_KEY`** et,
au déploiement, **seed du coffre + `ALLOW_ENV_CREDENTIAL_FALLBACK=false`**.
