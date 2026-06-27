# 101 — Audit Stripe Institut vs Stripe Développeur + IntegratedAPI

> Lecture seule.

## Les deux comptes Stripe
| | **stripe-institut** | **stripe-dev** (Developer / plateforme) |
|---|---|---|
| Rôle | L'institut **encaisse** ses clients | L'institut **paie** la plateforme (développeur) |
| Client | `getStripe()` (`stripeController`, `salesController`, `refundExecutionService`) via `getCredential('stripe-institut')` | `getStripeDevClient()` via `getCredential('stripe-dev')` |
| Flux | Paiements formations/produits/prestations/cartes cadeaux ; remboursements ; factures client ; credit notes | **Commissions** (mensuelles) ; **frais de lancement** (launchFee) ; **abonnement mensuel** (maintenance) |
| Webhook | `/api/stripe/webhook` (`handleWebhook`) — `payment_intent.succeeded`, `charge.refund.updated`, `payment_intent.payment_failed` | `/api/stripe/dev-webhook` (`handleDevWebhook`) — `payment_intent.succeeded` (**launch only**), `setup_intent.succeeded`, `invoice.payment_*`, `customer.subscription.*` |
| TVA | V1 : aucune (franchise 293 B) | launchFee/monthlyFee `taxRate: 0.20` → **abonnement et frais facturés TTC 20 %** ; **commissions sans TVA** (invoiceItems sans tax) |

## Usage réel des deux comptes — confirmé
- **Institut** : `stripeController.createCheckoutSession`/`handleWebhook`,
  `refundExecutionService`, `stripeInvoiceService`, `salesController` (refunds) → tous via
  `getCredential('stripe-institut', { role })`.
- **Dev** : `commissionPaymentController` (PaymentIntent + invoice commission),
  `devWebhookController` (launch fee + subscription), `contractController`
  (stripe-dev-config). → tous via `getStripeDevClient()` / `getCredential('stripe-dev')`.

## Risques de confusion
- 🟡 **Distinction purement par SLUG** (`stripe-institut` vs `stripe-dev`) — aucune sémantique
  explicite dans le modèle. Un développeur qui ignore la convention pourrait appeler le
  mauvais client. La séparation tient à la discipline d'appel (`getStripe` vs
  `getStripeDevClient`).
- 🟡 **Webhook commission non finalisé côté Dev** : `handleDevWebhook`
  `payment_intent.succeeded` ne traite QUE les `ContractCheckoutIntent type:'launch'`. Le PI
  de **commission** (metadata `commissionPaymentId`) est **ignoré** par le webhook →
  finalisation uniquement par polling frontend (cf. rapport 100). Un replay de ce webhook =
  **no-op** (pas de faux double, mais pas de source de vérité serveur).
- 🟢 Les deux webhooks vérifient la signature avec le secret du **bon** compte
  (`stripe-institut`/`stripe-dev` webhook_secret).

## Le modèle IntegratedAPI actuel représente-t-il bien deux comptes ?
**Oui, implicitement.** Deux **documents** `IntegratedApi` distincts (slug `stripe-institut`,
`stripe-dev`), chacun avec son `provider:'stripe'`, son `runtimeModel`, son `mode`, et ses
`credentials[]` (secret_key, publishable_key, webhook_secret). La séparation des comptes est
donc déjà matérialisée — **mais sans champ sémantique** indiquant l'usage (encaissement client
vs paiement plateforme).

## Faut-il ajouter une notion `account` / `providerAccountType` ?
**Recommandé, mais léger.** Le manque actuel : rien ne dit *à quoi sert* chaque intégration
Stripe. Un champ explicite lèverait l'ambiguïté et préparerait React (qui devra router les
paiements vers le bon compte).

## Options comparées
| Critère | **A. Deux IntegratedApi séparées** (actuel) | **B. Champ `accountPurpose`/`providerAccountType`** | **C. Modèle enfant `IntegratedApiAccount`** |
|---|---|---|---|
| Simplicité | 🟢 déjà en place | 🟢 ajout d'un enum | 🔴 nouveau modèle + jointures |
| Évolutivité | 🟡 ok mono-compte/usage | 🟢 explicite, multi-usage | 🟢 multi-comptes par provider |
| Compatibilité | 🟢 zéro changement | 🟢 additif (défaut dérivé du slug) | 🔴 migration des lectures |
| Risque migration | 🟢 nul | 🟢 faible (backfill par slug) | 🔴 élevé |
| Impact React | 🟡 routage par slug (fragile) | 🟢 routage par purpose (clair) | 🟢 mais surdimensionné V1 |

## Recommandation
**Option B — ajouter un champ sémantique `accountPurpose`** (ex. enum
`customer_payments` | `platform_billing`) sur `IntegratedApi`, **backfillé** depuis le slug
(`stripe-institut → customer_payments`, `stripe-dev → platform_billing`). Garder **deux
documents séparés** (on conserve A + on l'enrichit). Ne PAS créer de modèle enfant
(`IntegratedApiAccount`, option C) en V1 : la mono-instance par usage suffit ; C est un
sur-dimensionnement coûteux à migrer.

Justification : additif, zéro migration risquée, lève l'ambiguïté de routage avant que React
ne câble les parcours de paiement, et reste cohérent avec la vocation mono-tenant du modèle.
Le routage applicatif (`getStripe` vs `getStripeDevClient`) pourra à terme sélectionner par
`accountPurpose` plutôt que par slug codé en dur.

## Points à corriger (résumé pour rapport 103)
1. 🟡 Finaliser la commission via le webhook Dev (handler dédié au PI `commissionPaymentId`).
2. 🟡 Ajouter `accountPurpose` à `IntegratedApi` (option B).
3. 🟢 Documenter explicitement la matrice flux→compte (ce rapport).
