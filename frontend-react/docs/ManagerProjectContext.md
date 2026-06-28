# ManagerProjectContext — vision produit Manager + Dev

> Pourquoi chaque module existe, côté institut (admin) et plateforme (dev). Complément de
> [ManagerArchitecture](./ManagerArchitecture.md). Global : [FolderProjectContext](./FolderProjectContext.md).

## Vision
Le manager est le **poste de pilotage de l'institut** ; l'espace dev est la **tour de contrôle de
la plateforme**. Deux rôles, deux responsabilités, une même app (séparée par guard de rôle) pour
simplifier l'auth et le déploiement.

## Rôle de l'institut (Manager — role admin)
La gérante gère son activité au quotidien : catalogue (prestations/formations/produits/cartes
cadeaux), planning et réservations, ventes et remboursements, et **paie ses commissions** à la
plateforme. Elle ne voit pas la supervision technique.
- **Activation contrat** : condition d'entrée. Au 1er login, onboarding guidé (règlement des frais
  de lancement + souscription mensuelle) ; tant que non actif, accès bloqué. Modèle économique de la plateforme.
- **Gestion quotidienne** : planning anti-chevauchement, réservations (annulation/no-show),
  CRUD catalogue, suivi des ventes, traitement des remboursements.
- **Commissions à payer** : la gérante règle mensuellement ce qu'elle doit (calcul serveur unifié,
  report négatif) via Stripe (compte Dev) → facture officielle.

## Rôle du développeur (Dev — role dev)
Supervise la plateforme et la relation contractuelle ; sur-ensemble du manager (bypass
contrat/maintenance/suspension).
- **Contrats** : création/activation/annulation des contrats institut (frais + abonnement).
- **Commissions reçues** : configuration du barème + suivi des encaissements plateforme.
- **IntegratedAPI / coffre** : credentials Stripe (Institut + Dev) et Brevo, jamais exposés.
- **Email Template Studio** : édition versionnée des emails transactionnels (published-only en prod).
- **Observabilité** : SendLog (envois email), EventLog (événements métier), WebhookFailureLog
  (pannes webhook), pour diagnostiquer sans accéder aux données sensibles.
- **Maintenance** : bascule maintenance/suspension du site.

## Intérêt métier par module
- **Dashboard** : santé de l'activité (ventes, commissions dues) en un coup d'œil.
- **Planning / réservations** : cœur opérationnel d'un institut (prestations datées, capacité).
- **Catalogue (CRUD)** : autonomie de la gérante sur son offre (prix, promos, options, sessions).
- **Ventes / remboursements** : traçabilité financière + service client (remboursements cadrés).
- **Commissions à payer** : modèle de revenu plateforme ; règlement fluide = rétention SaaS.
- **Mon contrat** : transparence sur les engagements.
- **Paramètres** : identité de marque, thème, pages légales, statut site → personnalisation.
- **Dev / contrats & commissions reçues** : pilotage du business plateforme.
- **Dev / intégrations & logs** : fiabilité, sécurité, support technique.

## Activation contrat & paiement commissions (logique SaaS)
- Le **contrat** rend l'institut payant et débloque le manager ; sans lui, pas d'accès.
- Les **commissions** récurrentes financent la plateforme ; calcul serveur faisant foi, facturé via Stripe Dev.
- Ensemble : frais de lancement (one-shot) + abonnement (récurrent) + commissions (variable) = le revenu plateforme. Le moteur **UnifiedCheckout** (rapports 143/144) unifiera ces encaissements.

## Supervision technique (dev)
- Tout est observable (logs) et configurable (intégrations, templates, maintenance) sans toucher au
  code → exploitation autonome de la plateforme. Les secrets restent dans le coffre (jamais en clair).

→ Détails techniques : [ManagerArchitecture](./ManagerArchitecture.md).

## MAJ U3 — Activation contrat & paiement commissions hébergés
L'onboarding (frais de lancement + souscription mensuelle) et le règlement mensuel des commissions
pourront s'effectuer sur des pages Stripe hébergées (flag `PLATFORM_CHECKOUT_HOSTED`), offrant à la
gérante une expérience de paiement sécurisée et cohérente avec la vitrine. Le modèle économique
plateforme (frais + abonnement + commissions) est unifié derrière UnifiedCheckout. Fallback Elements conservé.

## MAJ R0 — Espaces Manager & Dev esquissés
Les deux audiences internes (gérante = Manager, plateforme = Développeur) ont désormais leur
coquille navigable, avec la séparation des droits matérialisée : un admin voit le manager mais pas
la section Dev, un dev voit les deux. Le relabel UI (`admin→Manager`, `dev→Développeur`) est en
place sans toucher aux rôles backend. Aucun module réel n'est branché — R0 valide l'architecture des
espaces et des guards. L'onboarding contrat, le dashboard et les outils Dev décrits ci-dessus seront
implémentés en **R3**, en consommant les endpoints et le paiement plateforme hébergé déjà prêts (U3).

## MAJ Theme Foundation — Un panel à l'identité propre
Le panel Manager/Dev adopte une **identité visuelle distincte** de la vitrine (palette bleu/ardoise
sobre, orientée outil de travail), conformément à la décision produit. Les couleurs sont centralisées
en tokens (aucun hex en dur), et le rôle **dev** pourra à terme configurer ce thème panel (et celui
de la vitrine) depuis un Theme Studio dédié — pour l'instant un thème par défaut s'applique, sans
dépendance backend. Cela prépare une cohérence visuelle maîtrisée avant l'arrivée des vrais modules
manager (R3).

## MAJ T1 — Le panel a son propre thème (configurable)
L'identité du panel Manager/Dev devient **configurable côté backend** (scope `manager`), séparée de
la vitrine. Tant qu'aucun thème manager n'est défini, le panel garde son défaut sobre (bleu/ardoise) —
donc aucune surprise visuelle. Le dev pourra activer/éditer un thème manager dédié (via le futur
Theme Studio), faisant évoluer l'outil interne indépendamment de la devanture publique.

## MAJ M1 — Qui envoie quoi à qui
Le Manager/Dev pourra bientôt configurer les **expéditeurs** des communications : le **développeur**
gère l'adresse **support** (plateforme → institut), la **gérante** (admin) gère l'adresse
**commerciale** (institut → client). Le **client** n'est jamais une adresse à configurer : c'est un
destinataire résolu automatiquement depuis le dossier métier. Cette séparation (avec vérification de
l'expéditeur chez Brevo et authentification du domaine) garantit des e-mails fiables et une frontière
de responsabilité claire dev/admin. M1 pose le backend ; l'écran de gestion arrive ensuite.
