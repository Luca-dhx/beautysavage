# 48 — Audit complet des clés `.env` & usage

> **Audit read-only.** Aucune valeur réelle de secret n'apparaît ici (lues
> uniquement pour classer par préfixe / chiffrer au seed). Complète et recoupe
> `46_audit_secrets_inventory.md`.
>
> **Repo.** `backend/` · branche `phase-0-security-baseline` · base `6eb462a`.

## Tableau d'usage

Légende **Type** : credential tiers · crypto interne · infra · config.
**Migrer coffre ?** ✅ oui (V1) · ➖ reste `.env` · ❌ supprimer.

| Variable | Type | Utilisée ? | Fichiers (lecteurs) | Rôle | Migrer coffre ? | Remarque |
|---|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | credential tiers | ✅ | `stripeController`, `refundExecutionService`, `invoiceController`, `stripeInvoiceService`, `salesController` | Clé secrète Stripe Institut (SDK) | ✅ `stripe-institut/secret_key` | Migrée (vault-first + fallback) |
| `STRIPE_PUBLISHABLE_KEY` | credential tiers | ✅ | `stripeController` | Clé publishable (front) | ✅ seedée `…/publishable_key` | **Seedée**, lecture encore `.env` (étape ultérieure) |
| `STRIPE_WEBHOOK_SECRET` | credential tiers | ✅ | `stripeController` | Vérif signature webhook Institut | ✅ seedée `…/webhook_secret` | **Seedée**, lecture encore `.env` (path signature delicat) |
| `STRIPE_DEV_SECRET_KEY` | credential tiers | ✅ | `utils/stripeDevClient` | Clé secrète Stripe Dev (contrat) | ✅ `stripe-dev/secret_key` | Migrée (singleton → lazy async) |
| `STRIPE_DEV_PUBLISHABLE_KEY` | credential tiers | ✅ | `contractController` | Publishable Dev (front contrat) | ✅ seedée `…/publishable_key` | **Seedée**, lecture encore `.env` |
| `STRIPE_DEV_WEBHOOK_SECRET` | credential tiers | ✅ | `devWebhookController` | Vérif signature webhook Dev | ✅ seedée `…/webhook_secret` | **Seedée**, lecture encore `.env` |
| `BREVO_API_KEY` | credential tiers | ✅ | `services/mailService` | Clé API Brevo (emails) | ✅ `brevo/api_key` | Migrée (vault-first + fallback) |
| `WEBHOOK_API_KEY` | — | ❌ (code) | `.env.example`, `testEnv` (factice) | **Aucun** | ❌ | **Clé LIVE Stripe (`sk_live_`), inutilisée → À RÉVOQUER** |
| `SESSION_SECRET` | crypto interne | ✅ | `utils/session`, `authRouter`, fallback gift/email | Signature session + secrets dérivés | ➖ | Durci par `requireSecret()` |
| `PWD_PEPPER` | crypto interne | ✅ | `utils/password` | Pepper hash mot de passe | ➖ | — |
| `GIFT_CARD_PASSWORD_SECRET` | crypto interne | ✅ | `giftCardService`, `giftCardController`, `salesController` | Hash code carte cadeau | ➖ | fallback `SESSION_SECRET` |
| `EMAIL_VERIFICATION_SECRET` | crypto interne | ✅ | `authRouter` | Signature token vérif email | ➖ | fallback `SESSION_SECRET` |
| `MONGODB_URI` | infra | ✅ | `app.js`, scripts | Connexion DB (héberge le coffre) | ➖ | Lue avant le coffre → ne peut s'auto-héberger |
| `PORT` / `NODE_ENV` / `APP_BASE_URL` / `NGROK_DOMAIN` | infra | ✅ | `app.js`, divers | Démarrage / URLs / tunnel | ➖ | Non-secret |
| `MAIL_FROM` / `MAIL_FROM_NAME` | config | ✅ | `mailService`, `invoice*`, `commission*` | Identité expéditeur | ➖ | Non-secret |
| `INSTITUTE_*` / `INVOICE_CONTACT_EMAIL` / `PLATFORM_*` | config | ✅/⚠️ | `invoiceVendorConfig`, `invoiceService`, `commission*` | Mentions facture | ➖ | Certaines absentes du `.env` (défauts code) |
| `CREDENTIAL_VAULT_KEY` | **nouveau** crypto | ✅ (boot) | `utils/credentialVault`, `app.js` | Clé AES-256-GCM du coffre | ➖ (clé racine) | 64 hex ; boot bloquant en prod si absente |
| `ALLOW_ENV_CREDENTIAL_FALLBACK` | **nouveau** flag | ✅ | `integratedApiCredentialService` | Autorise fallback `.env` (migration) | ➖ | `false` par défaut |

## Intégrations seedées dans le coffre

| slug | provider | runtimeModel | rôles seedés | mode (détecté) |
|---|---|---|---|---|
| `stripe-institut` | stripe | dual_environment | secret_key, publishable_key, webhook_secret | test (préfixe `sk_test_`) |
| `stripe-dev` | stripe | dual_environment | secret_key, publishable_key, webhook_secret | test |
| `brevo` | brevo | single | api_key | — |

**Détermination du runtime au seed** : `sk_test_`/`pk_test_` → `test`,
`sk_live_`/`pk_live_` → `prod`. `webhook_secret` (préfixe `whsec_`, sans
indicateur d'environnement) est **associé au runtime du `secret_key` du même
compte** (cohérence de compte) et documenté ainsi.

## Statut `WEBHOOK_API_KEY`

🔴 **Clé secrète Stripe LIVE (`sk_live_`), 47 car., inutilisée** dans le code
applicatif (référencée seulement en `.env.example` et `testEnv` factice).
**Non migrée.** Action : **révoquer sur le dashboard Stripe**, supprimer de `.env`
et `.env.example`, retirer la ligne factice de `testEnv`. (`.env` est gitignoré →
pas de fuite versionnée connue, mais une clé live morte reste un passif à éliminer.)

## Conclusion

7 credentials tiers cartographiés (3 intégrations) ; **3 secret-keys/api-key migrés
au coffre** cette phase, publishable/webhook **seedés** mais lus encore en `.env`
(étape suivante) ; secrets crypto internes + infra/config **restent en `.env`** ;
`WEBHOOK_API_KEY` **à révoquer**. Modèle et plan : `49_rapport_phase1_coffre_integrated_api.md`.
