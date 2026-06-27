# 92 — Audit TVA / factures / avoirs (deep)

> Lecture seule. Classement : **conforme probable** · **fragile** · **faux** · **indéterminé**.

## Constat central
Le système est construit pour une **franchise en base de TVA (art. 293 B du CGI)** :
**aucun taux de TVA n'est stocké ni calculé**, et la mention légale est **codée en dur**.
C'est cohérent pour une micro-entreprise non assujettie, mais **tout passage à la TVA
(20 % ou autre) est un chantier**, pas un réglage.

## Où la TVA est (ou n'est pas) gérée
| Sujet | Localisation | État |
|---|---|---|
| Taux TVA stocké | nulle part (ni `Sale`, ni `Invoice`, ni `Service`/`Formation`/`Product`) | **faux** (pour un assujetti) |
| TVA calculée | nulle part | **faux** (pour un assujetti) |
| Mention légale interne | `invoiceService.js` `LEGAL_MENTION = 'TVA non applicable, article 293B du CGI'` (constante en dur) | conforme probable (293B) |
| Mention légale Stripe | `stripeInvoiceService.js` `vatMention` (SiteIdentity/env, défaut 293B) | conforme probable |
| Lignes de facture | HT = TTC (pas de ligne TVA) | conforme (293B) / **faux** (assujetti) |

## Facture interne (`invoiceService.createInvoiceForSale`)
- PDF pdfkit, 1 facture par vente (`Invoice` unique `saleId`).
- Lignes = `sale.items` (name, type, qty=1, unitPrice=finalPrice, lineTotal).
- **Total = `sale.totalAmount` (catalogue)** + mention 293B.
- 🟡 **fragile** : le PDF interne **n'affiche PAS la déduction carte cadeau** (montre le
  catalogue complet), alors que la facture Stripe ajoute une ligne carte cadeau négative
  → **deux représentations divergentes** du même achat (scénarios 62-63).
- 🟡 **fragile** : pas de numérotation séquentielle légale garantie (suffixe aléatoire
  `INV-<date>-<hex>`), pas d'horodatage immuable centralisé.

## Facture Stripe (`stripeInvoiceService`)
- `paid_out_of_band: true` (déjà payé hors facture).
- **Ratio acompte** : si `paymentType==='deposit'`, lignes au prorata `depositAmount/totalPrice`.
- **Ligne carte cadeau négative** : `amount: -toCents(totalGiftCard)`.
- Idempotence par ligne (`buildStripeInvoiceLineIdempotencyKey`).
- conforme probable côté Stripe, **mais** dépend de la cohérence du split (cf. remboursement).

## Avoirs
| Type | État |
|---|---|
| Avoir Stripe (credit note) | `stripe.creditNotes.create({ out_of_band_amount })` au remboursement confirmé. **conforme probable** (lié à `invoice.stripeInvoiceId`). |
| Avoir interne PDF | **inexistant** — aucun document d'avoir interne. 🟡 fragile si la compta exige un avoir formel hors Stripe. |
| Credit note sans invoice Stripe | `if(!invoice?.stripeInvoiceId) return` → pas d'avoir. 🟡 fragile (vente sans facture Stripe = pas d'avoir traçable). |

## Remboursement partiel
- Credit note Stripe partiel (`out_of_band_amount` = montant Stripe remboursé). conforme probable.
- 🟡 La facture interne n'est pas régénérée/annotée après remboursement partiel
  (le PDF initial reste tel quel) → **indéterminé** pour la compta.

## Réduction (promo)
- `finalPrice` (post-promo) est **snapshoté** sur `saleItem` → facture montre le prix réduit.
  conforme probable. Pas de ligne « remise » distincte (le prix est déjà net).

## Carte cadeau
- Facture Stripe : ligne négative. Facture interne : **absente** → divergence (cf. supra).
- 🟡 fragile : la carte cadeau est un **moyen de paiement**, pas une réduction ; son
  traitement comptable (TVA sur l'émission vs l'utilisation) n'est pas modélisé.

## Changement de taux futur
- 🔴 **indéterminé / chantier** : passer à un régime assujetti exige : champ taux par
  ligne, calcul HT/TVA/TTC, mention dynamique, lignes TVA sur PDF interne ET Stripe
  (`tax_rates`/`automatic_tax`), ventilation des avoirs, et reprise de l'historique. À
  cadrer avec un expert-comptable. **Non bloquant React UI**, mais bloquant pour vendre en
  assujetti.

## Export comptable
- 🔴 **inexistant** : pas d'export structuré (CSV/FEC), seulement des PDF unitaires.
  indéterminé / V2.

## Classement final
| Élément | Verdict |
|---|---|
| Régime 293B (franchise) | conforme probable |
| TVA assujettie (taux ≠ 0) | **faux** (non implémenté) |
| Numérotation facture | fragile |
| Facture interne vs Stripe (carte cadeau) | fragile (divergence) |
| Avoir Stripe | conforme probable |
| Avoir interne | inexistant / fragile |
| Remboursement partiel sur facture interne | indéterminé |
| Changement de taux | chantier / indéterminé |
| Export comptable | inexistant / indéterminé |

## Recommandations (sans implémentation ici)
- **Avant React** : décider du régime (293B confirmé ?) ; si oui, documenter que la TVA est
  hors périmètre V1. Si assujettissement prévu < 12 mois → cadrer le chantier TVA **avant**
  de figer le contrat d'API React (les factures/avoirs changeront de forme).
- **Fortement recommandé** : aligner facture interne et Stripe sur la carte cadeau (une
  seule vérité), et numérotation séquentielle.

## Score TVA/facture : **58/100**
Cohérent et fonctionnel en franchise (75), mais zéro extensibilité TVA, divergence
interne/Stripe et pas d'export comptable plombent la note.
