# FolderProjectContext — Beauty Savage (vision produit globale)

> Pourquoi le produit est structuré ainsi. Complément métier de
> [FolderArchitecture](./FolderArchitecture.md). Mise à jour si une décision produit globale change.

## Vision produit
Beauty Savage est une **plateforme SaaS mono-institut** : un institut de beauté/formation vend en
ligne (prestations, formations présentielles & distancielles, produits, cartes cadeaux) et paie en
retour la **plateforme** (commissions mensuelles, frais de lancement, abonnement de maintenance).
Trois publics, trois expériences distinctes → trois espaces.

## Pourquoi la séparation Vitrine / Manager / Dev
- **Vitrine (public + client)** — `beautysavage.fr` : expérience d'achat premium, orientée
  conversion et confiance (paiement sécurisé, accès formation à vie). Doit être rapide, SEO,
  cacheable, sans surface d'administration.
- **Manager (institut, role admin)** — `manager.beautysavage.fr` : outil de gestion quotidienne de
  la gérante (catalogue, planning, ventes, remboursements, commissions à payer, contrat). Audience
  interne, non indexée, derrière login + contrat actif.
- **Développeur (plateforme, role dev)** — `manager.beautysavage.fr/dev` : supervision technique &
  business plateforme (contrats, commissions reçues, intégrations API/coffre, templates email,
  logs, maintenance). Sur-ensemble du manager (bypass contrat/maintenance/suspension).

Séparer évite le **toggle vitrine/gestion** historique (UX confuse) et isole les surfaces : le
public ne voit jamais l'administration ; le manager ne voit jamais la supervision plateforme.

## Logique métier clé
- **Pricing serveur fait foi** (anti-fraude) : le client ne peut pas imposer un montant.
- **Carte cadeau = moyen de paiement** (jamais une remise) ; capée au solde réel.
- **Promotion = source unique** (`Promotion`) ; le prix vendu = catalogue − promo.
- **Commission** = ce que l'institut doit à la plateforme (calcul unifié + report négatif).
- **Contrat** = condition d'accès du manager (frais de lancement + abonnement) ; activation au 1er login.
- **Acompte V1** : prestation avec acompte en ligne + solde réglé sur place (`pay_on_site`).
- **Factures officielles = Stripe** (client : compte Institut ; commissions : compte Dev).

## Expérience utilisateur cible
- **Client** : parcours fluide catalogue → panier → checkout (Stripe Checkout hébergé) → accès
  immédiat (formation/produit) ou réservation confirmée (prestation). Mes formations à vie, mes
  cartes cadeaux, mes réservations, suivi remboursement.
- **Manager** : onboarding contrat guidé, puis dashboard opérationnel ; gestion sans friction.
- **Dev** : observabilité (logs, webhooks), pilotage contrats/commissions, maintenance.

## Stratégie SaaS
- Mono-tenant aujourd'hui ; l'isolation des comptes Stripe (Institut = encaissement client,
  Dev = facturation plateforme) et la séparation des espaces préparent une éventuelle
  multi-instituts. Le moteur **UnifiedCheckout** (rapports 143/144) centralise tous les paiements
  derrière un pipeline unique → base d'un produit SaaS facturable.

## Décisions produit validées
1. React en **parallèle** du Vanilla (bascule progressive, rollback).
2. Domaine principal = Vitrine + Client ; `manager.` = Manager + Dev.
3. **Stripe Checkout hébergé** remplace Stripe Elements (montant > 0) ; 0 € via finalize-free.
4. **Plus de toggle** vitrine/gestion.
5. Rôles backend `client/admin/dev` **inchangés** ; relabel UI `admin→Manager`, `dev→Développeur`.
6. Documentation obligatoire par scope (cette structure de docs).

→ Détails techniques : [FolderArchitecture](./FolderArchitecture.md).

## MAJ U1 — Stratégie de paiement unifiée
Décision produit confirmée : tous les paiements passeront par un moteur unique (UnifiedCheckout),
Stripe Checkout hébergé pour montant > 0 (sécurité/SCA délégués, mobile-friendly), finalize-free
pour 0 €. U1 pose les fondations backend sans changer les flux existants ; U2 branchera le checkout
client réel. Cf. FolderArchitecture (section UnifiedCheckout) et rapports 143/144/151.
