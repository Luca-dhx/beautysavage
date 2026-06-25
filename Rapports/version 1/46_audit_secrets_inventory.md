# 46 — Audit & inventaire des secrets (Phase 0, avant coffre)

> **Nature.** Audit **read-only**. Aucune fonctionnalité, aucune modification
> métier, aucune migration. Prépare l'introduction d'un coffre de secrets sans
> l'implémenter.
>
> **Branche cible.** `phase-0-security-baseline`.
>
> **Règle de confidentialité.** Aucune **valeur** de secret n'apparaît dans ce
> rapport. Seuls les **noms**, **statuts** et **classifications** sont consignés.
> Les valeurs ont été inspectées localement uniquement pour classer (ex. préfixe
> de clé), jamais reproduites.
>
> **⚠️ Constat de cadrage.** Le dépôt **n'est pas un repository git** à ce jour
> (`git rev-parse` échoue ; aucun `.git` à la racine ni dans `backend/`). Les
> étapes git/`commit`/`push` de la mission **n'ont pas pu être exécutées**. Les
> tests, eux, ont été lancés (cf. §6). Ce point est remonté tel quel.

---

## 1. Méthode

Sources auditées : `backend/.env`, `backend/.env.example`, `backend/.gitignore`,
`app.js`, services Stripe (`stripeController`, `stripeDevClient`,
`refundExecutionService`, `invoiceController`, `stripeInvoiceService`,
`salesController`, `contractController`, `devWebhookController`), service Brevo
(`mailService`), webhooks (`/api/stripe/webhook`, `/api/stripe/dev-webhook`),
jobs (`automatisme/*`), middlewares, utilitaires (`utils/secretEnv.js`,
`utils/session.js`, `utils/password.js`), config (`config/invoiceVendorConfig.js`)
et scripts (`scripts/*`).

Recherche exhaustive de `process.env.*` et `process.env[...]` (accès indirects
via `requireSecret(name,{fallback})` et constantes d'env).

---

## 2. Inventaire complet (Tâche 1)

Légende **Criticité** : 🔴 Critique (credential/crypto, fuite = compromission) ·
🟠 Sensible (infra/connexion) · 🟢 Non-secret (config/identité).

Légende **Remplaçable par coffre** : ✅ candidat coffre V1 (credential de
fournisseur tiers) · ➖ reste en `.env` (secret interne / infra / config, hors
périmètre coffre) · ❌ à supprimer.

### 2.1 Credentials de fournisseurs tiers (périmètre coffre)

| Secret | Utilisé | Où (fichiers applicatifs) | Env | Criticité | Coffre |
|---|---|---|---|---|---|
| `STRIPE_SECRET_KEY` | ✅ Oui | `stripeController`, `refundExecutionService`, `invoiceController`, `stripeInvoiceService`, `salesController` (5 fichiers) | test (`sk_test`) | 🔴 | ✅ |
| `STRIPE_PUBLISHABLE_KEY` | ✅ Oui | `stripeController` | test (`pk_test`) | 🟠 (public par nature) | ✅ |
| `STRIPE_WEBHOOK_SECRET` | ✅ Oui | `stripeController` (vérif signature) | test (`whsec`) | 🔴 | ✅ |
| `STRIPE_DEV_SECRET_KEY` | ✅ Oui | `utils/stripeDevClient` | test (`sk_test`) | 🔴 | ✅ |
| `STRIPE_DEV_PUBLISHABLE_KEY` | ✅ Oui | `contractController` | test (`pk_test`) | 🟠 | ✅ |
| `STRIPE_DEV_WEBHOOK_SECRET` | ✅ Oui | `devWebhookController` (vérif signature) | test (`whsec`) | 🔴 | ✅ |
| `BREVO_API_KEY` | ✅ Oui | `services/mailService` | unique (`xkeysib`) | 🔴 | ✅ |

### 2.2 Secrets cryptographiques internes (hors coffre — restent en `.env`)

> Ce ne sont **pas** des credentials de fournisseur tiers : ils ne rentrent pas
> dans le modèle `IntegratedApi` (cf. rapport 47). Ils restent en `.env` mais
> sont déjà durcis par `requireSecret()` (échec explicite si absent, plus de
> littéral en dur).

| Secret | Utilisé | Où | Criticité | Coffre |
|---|---|---|---|---|
| `SESSION_SECRET` | ✅ Oui | `utils/session.js` (obligatoire au boot), `authRouter`, fallback de `GIFT_CARD_PASSWORD_SECRET` & `EMAIL_VERIFICATION_SECRET` | 🔴 | ➖ |
| `PWD_PEPPER` | ✅ Oui | `utils/password.js` | 🔴 | ➖ |
| `GIFT_CARD_PASSWORD_SECRET` | ✅ Oui (fallback `SESSION_SECRET`) | `giftCardService`, `giftCardController`, `salesController` | 🔴 | ➖ |
| `EMAIL_VERIFICATION_SECRET` | ✅ Oui (fallback `SESSION_SECRET`) | `authRouter` | 🔴 | ➖ |

### 2.3 Infrastructure & configuration (non-secret ou infra — restent en `.env`)

| Variable | Utilisé | Où | Criticité | Coffre |
|---|---|---|---|---|
| `MONGODB_URI` | ✅ Oui | `app.js`, scripts, tests | 🟠 (peut contenir credentials DB) | ➖ |
| `PORT` | ✅ Oui | `app.js`, `scripts/cleanPort` | 🟢 | ➖ |
| `NODE_ENV` | ✅ Oui | `app.js`, `session`, `clientRouter`, `contractController`, `commissionPaymentController`, `formationModuleController` | 🟢 | ➖ |
| `APP_BASE_URL` | ✅ Oui | `utils/invoiceUrl` | 🟢 | ➖ |
| `NGROK_DOMAIN` | ✅ Oui (dev) | `app.js`, `stripeController` | 🟢 | ➖ |
| `MAIL_FROM` | ✅ Oui | `mailService`, `invoiceService`, `commissionInvoiceSettingsService`, `invoiceVendorConfig` | 🟢 (identité expéditeur) | ➖ |
| `MAIL_FROM_NAME` | ✅ Oui | `mailService` | 🟢 | ➖ |
| `INSTITUTE_ADDRESS_LINE1` / `CITY` / `POSTAL_CODE` / `COUNTRY` / `SIRET` / `VAT_MENTION` | ✅ Oui | `config/invoiceVendorConfig`, `invoiceService` | 🟢 | ➖ |
| `INSTITUTE_NAME` | ⚠️ Référencé, **absent du `.env`** (défaut code) | `invoiceVendorConfig`, `invoiceService`, `commission*Service` | 🟢 | ➖ |
| `INVOICE_CONTACT_EMAIL` | ⚠️ Référencé, **absent du `.env`** (défaut code) | `invoiceVendorConfig`, `invoiceService` | 🟢 | ➖ |
| `PLATFORM_NAME` / `PLATFORM_ADDRESS` / `INSTITUTE_ADDRESS` | ⚠️ Référencé, **absent du `.env`/`.env.example`** (défaut code) | `commissionInvoiceSettingsService`, `commissionPdfService` | 🟢 | ➖ |

### 2.4 Variable morte

| Variable | Statut | Coffre |
|---|---|---|
| `WEBHOOK_API_KEY` | ❌ **Inutilisée dans le code applicatif** — voir §3 | ❌ à supprimer + révoquer |

### 2.5 Variables test-only (jamais en prod)

`SESSION_SECRET_TEST` (fallback de test dans `tests/setup/testEnv.js`),
`__SEC_PRIMARY` / `__SEC_FALLBACK` (placeholders du test
`p0/security.secrets.test.js`). Sans objet pour le coffre.

---

## 3. Vérification spéciale `WEBHOOK_API_KEY` (Tâche 2)

| Question | Réponse |
|---|---|
| Utilisée dans le code applicatif ? | **NON** — aucun `process.env.WEBHOOK_API_KEY` hors tests |
| Jamais utilisée ? | **Jamais** dans le runtime applicatif |
| Référencée dans le code ? | Seulement `tests/setup/testEnv.js:32` (valeur **factice** pour l'env de test) |
| Référencée dans la doc ? | `backend/.env.example:19` (placeholder), + ce dossier d'audit |
| Reliquat ? | **Oui** — vestige de configuration, non câblé |
| Clé live ou test ? | **🔴 CLÉ LIVE** — classification par préfixe : format **`sk_live_`** (clé secrète Stripe de production), longueur 47, présente dans `backend/.env` |

### Conclusion `WEBHOOK_API_KEY`

> **🔴 À RÉVOQUER IMMÉDIATEMENT.**
>
> C'est une **clé secrète Stripe LIVE** (`sk_live_`), **non utilisée** par
> l'application, mal nommée (« WEBHOOK_API_KEY » alors que c'est une clé secrète
> de compte, pas un secret de webhook). Une clé secrète de production qui traîne
> sans usage et sans gestion est un passif de sécurité pur : aucun bénéfice, tout
> le risque.
>
> **Actions (hors périmètre coffre, prioritaires) :**
> 1. **Révoquer / rouler** la clé depuis le dashboard Stripe (Developers → API keys).
> 2. **Supprimer** la ligne de `backend/.env` et le placeholder de `backend/.env.example`.
> 3. **Retirer** la ligne factice de `tests/setup/testEnv.js` (aucun test ne la lit fonctionnellement).
>
> **Atténuation existante :** `backend/.gitignore` ignore bien `.env` (`.env`,
> `.env.*`, `!.env.example`) → la clé n'est **pas** versionnée. Le risque est donc
> « secret live local non géré », pas « secret commité ». La révocation reste
> requise car on ne peut prouver qu'elle n'a jamais fuité (sauvegardes, images,
> historique de poste).

---

## 4. Cartographie des dépendances futures (Tâche 3)

### 4.1 Périmètre **Coffre V1** (credentials de fournisseurs tiers)

| Intégration (slug proposé) | `runtimeModel` | Rôles (credentials) | Justification |
|---|---|---|---|
| `stripe-institut` | `dual_environment` | `secret_key`, `publishable_key`, `webhook_secret` | Compte Stripe principal (formations/produits) ; clés distinctes test/prod attendues au go-live |
| `stripe-dev` | `dual_environment` | `secret_key`, `publishable_key`, `webhook_secret` | Compte Stripe « Developer » (contrat : frais de lancement + abonnement) |
| `brevo` | `single` | `api_key` | Pas de notion sandbox/prod chez Brevo (une seule clé) |

**Justification du périmètre :** seuls ces 7+1 secrets sont des **credentials
d'API tierce** consommés par des drivers. Ce sont exactement les cibles du
contrat `getCredentials(slug,{role,runtime})`.

### 4.2 Restent dans `.env` (justifié)

| Catégorie | Variables | Pourquoi pas le coffre |
|---|---|---|
| Secrets crypto internes | `SESSION_SECRET`, `PWD_PEPPER`, `GIFT_CARD_PASSWORD_SECRET`, `EMAIL_VERIFICATION_SECRET` | Ne sont pas des credentials de fournisseur ; déjà durcis par `requireSecret()`. Le modèle `IntegratedApi` ne les modélise pas. Un futur « secret store interne » pourrait les couvrir, hors V1. |
| Infra | `MONGODB_URI`, `PORT`, `NODE_ENV`, `APP_BASE_URL`, `NGROK_DOMAIN` | Variables techniques / de démarrage, lues avant tout coffre (bootstrap) ; le coffre lui-même vivra en base accessible via `MONGODB_URI` → ne peut pas s'auto-héberger. |
| Identité / config facturation | `MAIL_FROM(_NAME)`, `INSTITUTE_*`, `INVOICE_CONTACT_EMAIL`, `PLATFORM_*` | Données de configuration non secrètes (identité institut, mentions facture). Aucun gain de sécurité à les chiffrer. |

> **Note de dérive de config (non bloquante) :** `INSTITUTE_NAME`,
> `INVOICE_CONTACT_EMAIL`, `PLATFORM_NAME`, `PLATFORM_ADDRESS`, `INSTITUTE_ADDRESS`
> sont **référencés en code mais absents du `.env`** → le code retombe sur des
> valeurs par défaut. À aligner (`.env`/`.env.example`) lors d'un futur passage,
> **hors périmètre Phase 0**.

---

## 5. Audit des accès directs à `process.env` (Tâche 4)

### 5.1 Tableau par variable (lectures applicatives, hors tests)

| Variable | Nb fichiers | Fichiers |
|---|---|---|
| `STRIPE_SECRET_KEY` | **5** | `stripeController`, `refundExecutionService`, `invoiceController`, `stripeInvoiceService`, `salesController` |
| `MAIL_FROM` | 4 | `mailService`, `invoiceService`, `commissionInvoiceSettingsService`, `config/invoiceVendorConfig` |
| `GIFT_CARD_PASSWORD_SECRET` | 3 (via `requireSecret`) | `giftCardService`, `giftCardController`, `salesController` |
| `INSTITUTE_NAME` | 3 | `invoiceVendorConfig`, `invoiceService`, `commissionPdfService` (+`commissionInvoiceSettingsService`) |
| `NODE_ENV` | 6 | `app.js`, `utils/session`, `clientRouter`, `contractController`, `commissionPaymentController`, `formationModuleController` |
| `MONGODB_URI` | 1 app (+scripts/tests) | `app.js` |
| `NGROK_DOMAIN` | 2 | `app.js`, `stripeController` |
| `STRIPE_PUBLISHABLE_KEY` | 1 | `stripeController` |
| `STRIPE_WEBHOOK_SECRET` | 1 | `stripeController` |
| `STRIPE_DEV_SECRET_KEY` | 1 | `utils/stripeDevClient` |
| `STRIPE_DEV_PUBLISHABLE_KEY` | 1 | `contractController` |
| `STRIPE_DEV_WEBHOOK_SECRET` | 1 | `devWebhookController` |
| `BREVO_API_KEY` | 1 | `mailService` |
| `SESSION_SECRET` | 2 directs (+ indirects) | `authRouter`, `utils/session` |
| `PWD_PEPPER` | 1 | `utils/password` |
| `EMAIL_VERIFICATION_SECRET` | 1 | `authRouter` |
| `INSTITUTE_*` (adresse/SIRET/TVA) | 2 | `invoiceVendorConfig`, `invoiceService` |
| `PLATFORM_NAME` | 2 | `commissionInvoiceSettingsService`, `commissionPdfService` |

### 5.2 Groupes logiques de lecture

- **Groupe Stripe Institut** (5 fichiers, ~10 sites) → **plus forte dispersion**.
  `STRIPE_SECRET_KEY` est ré-instancié dans 5 services. **Cible n°1 du coffre** :
  une seule `getCredentials("stripe-institut",{role:"secret_key",runtime:mode})`
  remplace 5 lectures dupliquées.
- **Groupe Stripe Dev** (3 fichiers) : `stripeDevClient` centralise déjà le
  secret ; `contractController`/`devWebhookController` lisent publishable/webhook.
- **Groupe Brevo** (1 fichier) : déjà centralisé dans `mailService` → migration
  triviale (1 point d'appel).
- **Groupe crypto interne** (`secretEnv`, `session`, `password`) : déjà centralisé
  via `requireSecret()` → **modèle à imiter** par le coffre (échec explicite).
- **Groupe config facturation/identité** : dispersé mais non-secret → laissé tel
  quel.

**Enseignement clé :** la dette de duplication est concentrée sur **Stripe
Institut** (5 fichiers). Brevo et Stripe Dev sont déjà quasi centralisés. Le
coffre apporte surtout (a) le **chiffrement au repos**, (b) la **bascule
test/prod gouvernée**, (c) la **consolidation des 5 lectures Stripe**.

---

## 6. Validation (tests)

Exécutés dans `backend/` (read-only, aucune modification de code) :

| Commande | Résultat |
|---|---|
| `npm test` (vitest run, tout) | ✅ **21 fichiers / 64 tests passés** (181 s) |
| `npm run test:p0` | ✅ 14 fichiers / 44 tests |
| `npm run test:p1` | ✅ 5 fichiers / 14 tests |
| `npm run test:integration` | ✅ 2 fichiers / 6 tests |

`git status` : **N/A** — le dossier n'est pas un repository git (voir en-tête).

---

## 7. Synthèse

- **9 credentials de fournisseur** identifiés → 8 à migrer au coffre V1 (3
  intégrations), **1 (`WEBHOOK_API_KEY`) à révoquer/supprimer**.
- **4 secrets crypto internes** + **infra/config** restent en `.env` (justifié).
- **`.env` correctement gitignoré** → pas de fuite versionnée connue.
- **Dette de duplication** concentrée sur `STRIPE_SECRET_KEY` (5 fichiers).
- **Action immédiate hors coffre :** révoquer la clé live `WEBHOOK_API_KEY`.

Le modèle cible et le plan d'implémentation détaillé figurent dans
`47_roadmap_phase1_coffre.md`.
