# 47 — Roadmap Phase 1 : Coffre de secrets (credential vault)

> **Statut.** Document de conception stratégique. **Aucun code.** Fait suite à
> `46_audit_secrets_inventory.md`. Périmètre minimal, **mono-tenant**, sans OAuth,
> sans auto-refresh, sans usage ledger, sans UI.
>
> **Pré-requis non négociable (hors coffre).** Révoquer la clé live
> `WEBHOOK_API_KEY` **avant** toute autre action (cf. rapport 46 §3).

---

## 1. Inventaire final (rappel condensé)

| Décision | Secrets concernés |
|---|---|
| **À migrer au coffre V1** (8) | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_DEV_SECRET_KEY`, `STRIPE_DEV_PUBLISHABLE_KEY`, `STRIPE_DEV_WEBHOOK_SECRET`, `BREVO_API_KEY` |
| **À révoquer + supprimer** (1) | `WEBHOOK_API_KEY` (clé live Stripe, inutilisée) |
| **À laisser en `.env`** | `SESSION_SECRET`, `PWD_PEPPER`, `GIFT_CARD_PASSWORD_SECRET`, `EMAIL_VERIFICATION_SECRET` (crypto interne) ; `MONGODB_URI`, `PORT`, `NODE_ENV`, `APP_BASE_URL`, `NGROK_DOMAIN` (infra) ; `MAIL_FROM*`, `INSTITUTE_*`, `INVOICE_CONTACT_EMAIL`, `PLATFORM_*` (config/identité) |

**Pourquoi seulement les credentials tiers ?** Le coffre vit **en base** (Mongo) ;
il ne peut donc pas héberger les secrets nécessaires **avant** la connexion DB
(`MONGODB_URI`) ni les secrets crypto lus au boot. Ceux-ci restent en `.env`,
déjà durcis par `requireSecret()`.

---

## 2. Dette supprimée par le coffre

| Dette (réf. rapports 1/46) | Supprimée ? | Comment |
|---|---|---|
| Secrets de fournisseur en clair au repos | ✅ | Chiffrement AES-256-GCM en base |
| Pas de bascule test/prod gouvernée (D-I2) | ✅ | `mode` + `setMode` gardé (refus prod si rôle requis manquant) |
| Rotation manuelle + redémarrage (D-I3) | ✅ (partiel) | Ajouter/activer un token sans redéploiement |
| Duplication `STRIPE_SECRET_KEY` (5 fichiers) | ✅ | `getCredentials()` unique |
| Appel tiers avec placeholder | ✅ | Sentinelle `__UNFILLED__` + erreurs typées |
| Clé live morte non gérée | ✅ | Révocation + suppression (étape 0) |

**Dette NON supprimée (assumée) :** secrets crypto internes et infra restent en
`.env` ; dépendance fournisseur unique (Brevo/Stripe) demeure ; **nouvelle** dette
introduite = la **clé de chiffrement** du coffre (cf. §7 risques).

---

## 3. Modèle cible recommandé (Tâche 5 — sans code)

### 3.1 Principes (repris de l'IAP, réduits à Beauty Savage)

1. **Configuration en base, pas en `.env`** pour les credentials tiers.
2. **Chiffrement authentifié au repos** (AES-256-GCM), clé en `.env`, validée au
   boot (**bloquant en prod**).
3. **Fail-loud** : credential absent/placeholder → erreur typée, **jamais** un
   appel tiers dégradé.
4. **Contrat unique** `getCredentials(slug,{role,runtime})`.
5. **Pas de multi-tenant** (pas de `scope`/`garageId`), **pas d'OAuth**, **pas
   d'auto-refresh**, **pas d'usage ledger**, **pas d'UI** en V1.

### 3.2 Entité `IntegratedApi` (modèle conceptuel)

```
IntegratedApi {
  slug          : string  UNIQUE  [a-z0-9-]+     // "stripe-institut", "stripe-dev", "brevo"
  name          : string                          // libellé humain
  baseUrl       : string                          // racine API (info/driver)
  runtimeModel  : enum { single, dual_environment }
  mode          : enum { test, prod }  default test
  modeUpdatedAt : Date | null
  modeUpdatedBy : ref User (role=dev) | null
  credentials   : [Credential]                    // sous-documents
  createdAt, updatedAt
}
```
**Retiré volontairement vs IAP :** `scope`, `garageId`, `tenantId`, `files[]`,
`trackingEnabled`, `notes` (ajoutables plus tard).

### 3.3 Sous-document `Credential` (token)

```
Credential {
  role           : string        // "secret_key" | "publishable_key" | "webhook_secret" | "api_key"
  encryptedValue : string        // "iv.authTag.ciphertext" (AES-256-GCM)
  lastFourChars  : string        // affichage masqué ••••XXXX
  isActive       : boolean        // un seul actif par (role, runtime)
  runtime        : enum { test, prod, null }   // null si runtimeModel=single
  createdAt, createdBy
}
```
**Invariants (hooks de validation) :**
- `runtimeModel=single` ⇒ tous les credentials ont `runtime=null`.
- `runtimeModel=dual_environment` ⇒ `runtime ∈ {test,prod}`.
- **Un seul `isActive` par (role, runtime)**.

**Retiré volontairement vs IAP :** `type` (static/auto_refresh), tous les champs
`refresh*`, `ttlSeconds`, `expiresAt` (pas de token de session chez Beauty Savage).

### 3.4 Contrat `getCredentials()` (signature cible, non implémentée)

```
getCredentials(slug, { role = "default", runtime = null }) -> string
  1. resolveApi(slug)                         // sinon → IntegratedApiNotFoundError
  2. effectiveRuntime =
       single + runtime=null   -> null
       single + runtime!=null  -> RuntimeMismatchError
       dual   + test|prod      -> tel quel
       dual   + null           -> api.mode (sinon ConfigMissingError)
  3. findActiveToken(api, role, effectiveRuntime)   // sinon → NoActiveTokenError
  4. clear = decrypt(encryptedValue)                 // sinon → DecryptError
  5. if isUnfilledSentinel(clear) -> CredentialsUnfilledError
  6. return clear
```

`setMode(slug, toMode, { actorId, requiredRolesForProd })` :
- no-op si déjà dans le mode ;
- si `toMode=prod` : vérifie que chaque rôle requis a un token **actif, non vide,
  non-sentinelle, runtime=prod** → sinon `ModeTransitionError(missingRoles[])` ;
- pose `mode/modeUpdatedAt/modeUpdatedBy`.

### 3.5 Crypto (réutilise le pattern éprouvé du projet)

Format `iv.authTag.ciphertext`, IV aléatoire 12 octets par chiffrement, clé hex
64 (`COFFRE_SECRET_KEY` ou nom dédié) en `.env`. **Cohérent avec la philosophie
`requireSecret()` déjà en place** : échec explicite si clé absente.

### 3.6 Mapping des intégrations Beauty Savage

| slug | runtimeModel | rôles | Remplace |
|---|---|---|---|
| `stripe-institut` | dual_environment | secret_key, publishable_key, webhook_secret | `STRIPE_*` |
| `stripe-dev` | dual_environment | secret_key, publishable_key, webhook_secret | `STRIPE_DEV_*` |
| `brevo` | single | api_key | `BREVO_API_KEY` |

`REQUIRED_ROLES_FOR_PROD` : `stripe-institut` → secret_key + webhook_secret ;
`stripe-dev` → secret_key + webhook_secret ; `brevo` → api_key.

### 3.7 Stratégie de bascule douce (fallback `.env`)

Adapter le pattern `resolveProviderCredential` : `getCredentials()` d'abord, **sinon
fallback `process.env`**. Permet de migrer **sans big-bang** : on seed le coffre,
on bascule driver par driver, l'env reste filet pendant la transition, puis on
retire l'env.

---

## 4. Coût estimé

| Brique | Complexité | Charge backend | Tests |
|---|---|---|---|
| Helper crypto (encrypt/decrypt/validate) | Faible | S | encrypt≠2x, decrypt∘encrypt, tampering→throw |
| Modèle `IntegratedApi` + invariants | Faible | S | hooks d'invariants |
| `getCredentials` + erreurs typées + sentinelle | Moyenne | M | résolution runtime, fail-loud |
| `setMode` gardé + `REQUIRED_ROLES_FOR_PROD` | Faible | S | refus prod si rôle manquant |
| Seeds idempotents (3 intégrations, sentinelles) | Faible | S | idempotence |
| Migration driver-par-driver + fallback env | Moyenne | M | non-régression Stripe/Brevo |
| Script de rotation de clé de chiffrement | Faible | S | re-encrypt aller-retour |

**Complexité globale : Faible→Moyenne.** Pas d'UI, pas d'OAuth, pas de
multi-tenant ⇒ le gros de l'IAP est écarté. Estimation indicative : **petite
poignée de PR backend** (cf. §6), risque maîtrisé grâce au fallback env.

---

## 5. Risques

| Risque | Gravité | Mitigation |
|---|---|---|
| Clé de chiffrement absente/perdue → secrets inaccessibles | 🔴 | Validation **bloquante au boot en prod** ; clé distincte par env ; **script de rotation écrit avant la prod** |
| Régression Stripe/Brevo pendant la migration | 🔴 | **Interdiction de toucher aux flux** (règle mission) ; fallback `.env` ; migration **un driver à la fois** ; suite de tests verte à chaque étape |
| Bascule prod accidentelle sans clés | 🟠 | `setMode` gardé + `missingRoles[]` |
| Coffre auto-hébergé impossible pour secrets de bootstrap | 🟠 | `MONGODB_URI` & crypto interne **restent en `.env`** (acté) |
| Clé live `WEBHOOK_API_KEY` exploitée avant révocation | 🔴 | **Révocation immédiate** (étape 0), indépendante du coffre |
| Faible effectif → dérive de périmètre (multi-tenant, UI…) | 🟠 | Périmètre V1 verrouillé par ce document |

---

## 6. Ordre des PR recommandé

> Chaque PR : tests verts obligatoires, **aucune modification des flux métier**,
> non mergée dans `main` (branche `phase-0-security-baseline` puis branches Phase 1).

```
PR-0  (hors coffre, URGENT) :
      Révoquer WEBHOOK_API_KEY (Stripe dashboard) + supprimer du .env/.env.example
      + retirer la ligne factice de tests/setup/testEnv.js.

PR-1  Helper crypto (encrypt/decrypt/validateKey) + tests unitaires.
      Aucune intégration encore branchée. Risque nul sur les flux.

PR-2  Modèle IntegratedApi + Credential + invariants (hooks) + tests.
      Pas de lecture par les drivers. Données seulement.

PR-3  getCredentials() + setMode() + erreurs typées + sentinelle __UNFILLED__
      + seeds idempotents (stripe-institut, stripe-dev, brevo) en sentinelles.
      Toujours zéro impact runtime (personne ne l'appelle).

PR-4  Migration Brevo (1 seul point d'appel : mailService) via getCredentials
      AVEC fallback .env. Le plus simple → valide le contrat de bout en bout.

PR-5  Migration Stripe Dev (stripeDevClient, contractController, devWebhook)
      via getCredentials + fallback .env.

PR-6  Migration Stripe Institut (5 fichiers) via getCredentials + fallback .env.
      Consolidation de la plus grosse duplication.

PR-7  setMode gardé branché + REQUIRED_ROLES_FOR_PROD + script de rotation de clé.

PR-8  (optionnel, après stabilisation) Retrait des fallbacks .env pour les
      credentials migrés + nettoyage .env.example.
```

**Dépendances :** PR-1 → PR-2 → PR-3 → (PR-4, PR-5, PR-6 en série, du plus simple
au plus dispersé) → PR-7 → PR-8. PR-0 est **indépendante et prioritaire**.

---

## 7. Ce qui reste explicitement HORS Phase 1

Multi-tenant (`scope`/`garageId`), OAuth/`auto_refresh` + locks, usage ledger /
quotas, UI d'administration (panel intégrations), gestion des secrets crypto
internes par le coffre, SendLog / bus d'événements / versioning templates (= Phases
2-5 de la roadmap). **Ne rien anticiper.**

---

## 8. Conclusion

La Phase 1 est **petite, sûre et à fort ROI sécurité** : un coffre minimal
(3 intégrations, 8 credentials), un contrat `getCredentials` fail-loud, une
bascule test/prod gardée, migré **driver par driver avec fallback `.env`** pour
zéro régression. Le seul geste **urgent et indépendant** est la **révocation de la
clé live `WEBHOOK_API_KEY`** — à faire sans attendre le coffre.
