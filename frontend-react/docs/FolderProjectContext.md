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

## MAJ U2 — Paiement hébergé activable
Le backend peut désormais router les achats client vers Stripe Checkout hébergé (flag
`CHECKOUT_HOSTED`), tout en gardant Elements en fallback. Décision produit confirmée : la sécurité
(SCA/3DS délégués à Stripe) et le mobile priment ; la carte cadeau reste un moyen de paiement
(jamais un discount), Stripe n'encaisse que le reste dû. La bascule visible côté client se fera avec React (R2).

## MAJ U3 — Paiements plateforme unifiés
Les encaissements de la plateforme (commission mensuelle, frais de lancement, abonnement) peuvent
désormais passer par Stripe Checkout hébergé (flag `PLATFORM_CHECKOUT_HOSTED`), comme les achats
client. Le modèle SaaS (frais + abonnement + commissions) est ainsi entièrement routable par le
moteur UnifiedCheckout, base d'une facturation plateforme cohérente. Anciens flows conservés (fallback).

## MAJ R0 — Fondations React livrées
La décision produit « React en parallèle, bascule progressive » est désormais **amorcée
techniquement** : le squelette des deux espaces (Vitrine public/client, Manager + section Dev)
existe, navigable, avec guards de rôle (relabel UI `admin→Manager`, `dev→Développeur`). Aucune
fonctionnalité métier n'est encore migrée — le Vanilla reste la seule UI de production. R0 valide la
faisabilité (build, tests, proxy same-origin) sans aucun risque sur l'existant. Les vraies pages
arrivent à partir de **R1** (vitrine) puis **R3** (manager), en consommant l'API et le paiement
hébergé déjà prêts côté backend (U2/U3).

## MAJ R1 — Première valeur produit visible
La vitrine React affiche désormais le vrai catalogue (prestations/formations/produits/cartes
cadeaux) en réutilisant l'API publique existante — preuve que la migration progressive fonctionne
sur du contenu réel, sans toucher au backend ni au Vanilla. L'achat reste fermé (R2) : R1 est une
étape « consultation » qui dérisque la suite (typage des payloads, formats prix/médias centralisés,
états de chargement, responsive) avant d'ouvrir la conversion et le paiement hébergé.

## MAJ Theme Foundation — Deux identités visuelles
Décision produit actée techniquement : la **vitrine** (devanture premium, violet/rose, thème piloté
par le backend) et le **panel** Manager/Dev (outil interne sobre, bleu/ardoise) ont des identités
**distinctes**. Les couleurs ne sont plus codées en dur dans les composants : un système de tokens
(`@bs/ui/theme`) centralise tout et permettra au rôle **dev** de configurer chaque thème depuis un
futur « Theme Studio » (plan 161), sans toucher au code. La vitrine reprend le thème backend existant
(`/api/vitrine/theme`) avec fallback ; le panel a son défaut en attendant son endpoint dédié.

## MAJ T1 — Deux thèmes pilotés côté backend
Le backend sait maintenant stocker et servir **deux thèmes distincts** (vitrine et manager). Le panel
Manager n'est plus figé sur un défaut codé en dur : il charge son thème depuis `/api/theme/manager`
(avec repli sur le défaut si rien n'est configuré). Cela rend les deux identités visuelles
**configurables** (le dev pourra les éditer via le futur Theme Studio) tout en garantissant zéro
changement visible tant qu'aucune config manager n'existe. Étape clé avant un Theme Studio Dev
réellement multi-scope.

## MAJ R2A — Vers la conversion (sans encore payer)
L'utilisateur peut désormais composer un panier et choisir un créneau de prestation dans React, puis
préparer sa commande (consentements légaux), **sans paiement**. C'est l'étape qui précède la
conversion : on valide l'expérience d'achat (panier indicatif, calendrier, transparence légale) en
gardant le backend comme seule autorité (prix, disponibilité, verrou de créneau). Le paiement réel
(Stripe Checkout hébergé) est volontairement reporté à **R2B** pour livrer la préparation de façon
sûre et testée d'abord.

## MAJ R2B — La conversion est ouverte (paiement)
React peut désormais déclencher un **paiement réel** : redirection vers la page Stripe hébergée
(montant > 0) ou finalisation directe (0 €), toujours **via le backend** (jamais Stripe.js côté
client). C'est la première fois qu'un achat peut aboutir depuis React. La sécurité prime : aucune
donnée bancaire ne transite par le front, le serveur recalcule tout, et le succès n'est jamais
affirmé tant que le webhook n'a pas confirmé (wording prudent « confirmation en cours »). Le retour
des paiements hébergés atterrit encore sur le Vanilla (URL backend) — bascule complète vers les pages
React en R2C.

## MAJ R2C — Boucle d'achat React complète
Le parcours d'achat peut désormais se dérouler **entièrement dans React** : sélection → panier →
consentements → paiement (hébergé ou gratuit) → **retour sur les pages React** → confirmation. Un
**login client léger** permet de s'authentifier sans quitter le tunnel (panier conservé, reprise du
checkout après connexion). La bascule du retour Stripe vers React est **opt-in** (variable backend
`CHECKOUT_RETURN_BASE_URL`) pour ne jamais casser le Vanilla. C'est le premier parcours de bout en
bout côté React ; l'espace client complet et le manager restent à venir (R3).

## MAJ M1 — Vers une communication structurée par rôle
Le backend pose les bases d'une communication à **identités d'expéditeur** distinctes : **support**
(plateforme/dev → vers l'institut) et **commerciale** (institut/admin → vers le client), le **client**
n'étant jamais une identité configurable mais un destinataire résolu depuis le contexte. Cette
fondation (vérification sender Brevo, domaine DNS, résolution from/to) prépare une future plateforme
de communication unifiée et une UI de gestion côté Manager/Dev — sans encore changer les e-mails
envoyés aujourd'hui (brique additive). Prochaine étape : M2 (moteur d'envoi événementiel) puis l'UI.

## MAJ M2 — Le « qui envoie quoi » devient déclaratif
Au-delà des identités (M1), le backend sait maintenant **router un e-mail par rôle au moment de
l'événement** : une règle déclare, pour chaque event métier, le template et le couple
expéditeur→destinataire (ex. vente → commerciale→client ; commission → support→commerciale). Le
template ne contient jamais d'adresse ; le moteur l'injecte. Pour l'instant c'est en **shadow** (on
n'envoie pas en double : les e-mails directs actuels restent la source), mais la mécanique est prête
et journalisée (idempotente). Cela prépare une plateforme de communication unifiée et une UI de
pilotage côté Manager/Dev (règles + journal d'envois), tout en gardant le comportement de prod
inchangé tant que le flag n'est pas activé.
