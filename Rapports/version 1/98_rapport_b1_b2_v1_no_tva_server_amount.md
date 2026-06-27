# 98 — Rapport B1-B2 : V1 sans TVA + serveur source de vérité du montant

> Implémentation. Branche `phase-0-security-baseline`. **Aucun** : React, UI, modification
> des commissions, refactor massif, changement de prix catalogue, rupture P0/P1, merge main.

## Résumé
| Point | Livré | Impact contrat API React |
|---|---|---|
| B1 | `constants/tax.js` (V1 franchise 293 B) + `Sale.taxSnapshot` + label fiscal centralisé | Toute vente porte un snapshot fiscal explicite ; React lit `taxSnapshot` (pas de TVA en V1). |
| B2 | `checkoutPricingService` + PaymentIntent au montant **serveur** + `CHECKOUT_AMOUNT_MISMATCH` | Le client ne peut plus imposer le montant ; l'API checkout est fiabilisée avant React. |

## B1 — V1 sans TVA (franchise en base, art. 293 B)
- **`constants/tax.js`** : `TAX_MODE='vat_exempt_franchise_base'`, `VAT_RATE=0`,
  `VAT_LEGAL_LABEL='TVA non applicable, art. 293 B du CGI'`, `buildTaxSnapshot(ttc)` →
  `{ taxMode, vatRate:0, vatLegalLabel, totalExcludingTax=ttc, vatAmount:0, totalIncludingTax=ttc, version }`.
- **`Sale.taxSnapshot`** (sous-document optionnel) renseigné :
  - dans `persistSale` (formation/produit/carte cadeau/panier/mock) ;
  - directement sur la vente prestation (`processServiceCheckoutStatePurchase`).
- **Label fiscal centralisé** : `invoiceService.js` et `stripeInvoiceService.js` importent
  `VAT_LEGAL_LABEL` (plus de chaîne codée en dur divergente).
- **Pas de moteur TVA** : aucun taux n'est calculé. Le chemin futur d'assujettissement est
  documenté dans `constants/tax.js` (taux par ligne → calcul HT/TVA/TTC → ventilation
  factures/avoirs → versionnage `taxMode`).

## B2 — Serveur unique source de vérité du montant
- **`services/checkoutPricingService.js`** :
  - `buildServerCheckoutPricing(checkoutState)` — recalcule depuis le **catalogue** :
    prix produits/formations/prestations (+ promotions actives `getActivePromotion` /
    `Service.promotion`, + options), couverture carte cadeau **capée au solde réel**
    (lecture seule, réplique `planGiftCardUsage`), `amountToPay = max(0, payBase − coverage)`,
    `isZeroPayment`, et `taxSnapshot` V1. Gère single / panier / prestation / carte cadeau.
  - `assertClientPricingMatchesServer(checkoutState, serverPricing)` — si le client a déclaré
    `totals.amountToPay`/`remainingToPay` divergent (> 0,01 €) → **`CHECKOUT_AMOUNT_MISMATCH`**
    (400). Si le client n'impose rien → le serveur fait foi.
- **Câblage** :
  - **Stripe checkout** (`createCheckoutSession`) : calcule `serverPricing`, refuse le
    mismatch, **crée le PaymentIntent avec le montant SERVEUR** (`serverPricing.amountToPay`),
    et persiste `checkoutState.serverPricing` avec l'intent (le finaliseur dispose du montant
    faisant foi). Couvre prestation / formation / produit / carte cadeau / panier.
  - **Free checkout** (`finalizeFreeCheckout`) : `serverPricing` calculé et attaché
    (best-effort, observabilité) ; l'anti-bypass reste `assertZeroRemainingForFreeOrder`
    (recalcul serveur de la couverture carte cadeau, 402 si solde dû).
- **Finalisation** : inchangée — le webhook recompose déjà la vente au catalogue
  (server-truth) ; le snapshot fiscal y est ajouté.

### Comportements en cas de mismatch
- Montant client < serveur (sous-paiement tenté) → **refus** `CHECKOUT_AMOUNT_MISMATCH`.
- Carte cadeau sur-déclarée → **capée au solde** → `amountToPay` recalculé (et mismatch si
  le client espérait payer moins).
- Carte cadeau inactive/épuisée → **ignorée** (couverture 0).
- Promotion expirée → **non appliquée** (prix plein serveur).

## Facturation V1 sans TVA
- Snapshot fiscal porté par chaque `Sale` (`taxSnapshot`).
- Factures interne + Stripe sourcent le **même** label central (293 B). HT = TTC, vatAmount 0.
- **Pas** de moteur TVA créé (conforme à la décision V1).

## Tests
Ajoutés (`tests/p1/`) :
- `v1TaxMode.test.js` — contrat fiscal central, `buildTaxSnapshot`, `Sale.taxSnapshot`
  (vatAmount 0, HT=TTC, label 293 B), source unique du label.
- `serverCheckoutPricing.test.js` — montant serveur pour produit / formation / prestation /
  panier / carte cadeau + couverture carte cadeau (partielle, 100 %).
- `checkoutAmountTampering.test.js` — baisse `amountToPay` → mismatch ; conforme → OK ;
  client n'impose rien → serveur fait foi ; sur-déclaration carte cadeau → capée + mismatch ;
  carte inactive ignorée.
- `serverPricingGiftCardPromotion.test.js` — promo active appliquée, promo expirée ignorée,
  promo + carte cadeau, carte cadeau solde insuffisant.

### Résultats (tous verts, 0 todo, 0 expected-fail)
| Suite | Tests |
|---|---|
| `npm test` (global) | **249** (53→57 fichiers) |
| `test:p0` | 44 |
| `test:p1` | 199 |
| `test:integration` | 6 |
| `npm run audit:business-scenarios` | 36 |

Aucun impact sur les tests booking/refund existants.

## Règle V1 sans TVA (synthèse)
**V1 = franchise en base de TVA, TVA non applicable (art. 293 B du CGI). Aucun taux n'est
calculé. HT = TTC, vatAmount = 0. Source unique : `constants/tax.js`. Snapshot immuable sur
chaque vente (`Sale.taxSnapshot`).**

## Source serveur du pricing (synthèse)
**Le serveur recalcule le montant à payer depuis le catalogue (prix + promotions + options −
cartes cadeaux capées au solde réel). Le PaymentIntent Stripe est créé avec ce montant. Toute
divergence d'un montant imposé par le client est refusée (`CHECKOUT_AMOUNT_MISMATCH`).**

## Limites / risques restants
- `createCheckoutSession` non couvert par tests automatisés (Stripe réseau) ; B2 vérifié via
  le pricing service en isolation.
- Couverture carte cadeau au pricing basée sur le solde (réservations concurrentes non
  déduites) ; débit réel finalisé serveur.
- Le front doit aligner son calcul de couverture sur le catalogue (sinon mismatch ; tolérance
  0,01 €).
- TVA multi-taux : volontairement non implémentée (chemin futur documenté).

## PROCHAINE ÉTAPE RECOMMANDÉE
**Discussion produit/architecture sur l'unification du système de commissions.**
Les commissions n'ont **pas** été modifiées dans cette mission (exclusion volontaire). Le
double mécanisme (ledger `CommissionTransaction` vs `computeCommissionsForPeriod`), la
claw-back manuelle et la règle « commission sur prix catalogue vs prix vendu » doivent être
tranchés en amont, avant de figer le contrat d'API commission pour React (cf. rapports 94/95).
