# 50 — Audit Phase 1B : credentials Stripe restants (publishable + webhook)

> Audit ciblé des 4 lectures `.env` restantes après la Phase 1 (rapport 49).
> Aucune valeur réelle de secret n'apparaît ici. Repo `backend/`, branche
> `phase-0-security-baseline`, base `12bad1e`.

## Lectures directes restantes

| Variable | Fichier | Usage | Risque | Plan de migration |
|---|---|---|---|---|
| `STRIPE_PUBLISHABLE_KEY` | `controllers/stripeController.js:1612` (`getConfig`) | Endpoint public `GET /api/stripe/config` → renvoie la clé **publishable** (jamais la secret) au front | Faible (clé publique par nature) ; mais lecture hors coffre = config dispersée | `getCredential('stripe-institut',{role:'publishable_key'})` ; `getConfig` → async ; 500 si absente ; fallback `.env` si flag |
| `STRIPE_WEBHOOK_SECRET` | `controllers/stripeController.js:965` (`handleWebhook`) | Vérif signature du webhook Institut (`stripe.webhooks.constructEvent(rawBody, sig, secret)`) | **Élevé** — chemin de signature ; toute erreur casse l'idempotence/sécurité webhook | `getCredential('stripe-institut',{role:'webhook_secret'})` ; **raw body inchangé**, vérif identique ; 500 si absente ; fallback si flag |
| `STRIPE_DEV_PUBLISHABLE_KEY` | `controllers/contractController.js:116` (`getStripeDevConfig`) | Endpoint `GET` config contrat → clé publishable Stripe Dev au front | Faible (clé publique) | `getCredential('stripe-dev',{role:'publishable_key'})` ; déjà async ; 500 si absente ; fallback si flag |
| `STRIPE_DEV_WEBHOOK_SECRET` | `controllers/devWebhookController.js:8` (const module) + usage `handleDevWebhook` (201, 213) | Vérif signature du webhook Dev (`stripeDevClient.webhooks.constructEvent`) | **Élevé** — chemin de signature contrat | Lire dans `handleDevWebhook` via `getCredential('stripe-dev',{role:'webhook_secret'})` ; supprimer la const module ; 500 si absente ; fallback si flag |

## Notes
- **Raw body** : aucun changement au parsing du corps ; les webhooks utilisent
  déjà `express.raw` en amont. La migration ne touche que la **source du secret**,
  pas la vérification de signature ni le corps.
- **Seeds** : ces 4 rôles sont **déjà seedés** au coffre (Phase 1) ; il ne reste
  qu'à **basculer la lecture** du `.env` vers `getCredential`.
- **Fallback** : en test (`ALLOW_ENV_CREDENTIAL_FALLBACK=true`, vault non seedé),
  la valeur revient des fakes `testEnv.js` — identiques à celles utilisées par
  `stripeWebhookTestUtils.js` pour signer → vérification de signature inchangée.
- **Hors périmètre** : aucun changement de montants/refunds/booking/ventes ; pas
  d'exposition de secret key ; pas d'UI.

## Conclusion
4 lectures à migrer (2 publishable faible risque, 2 webhook risque élevé). Plan :
basculer chaque lecture vers `getCredential` avec garde 500 + fallback gardé par
flag, puis tests dédiés (publishable depuis coffre, webhook Institut+Dev depuis
coffre, signature invalide refusée, secret manquant → erreur contrôlée). Voir
rapport 51.
