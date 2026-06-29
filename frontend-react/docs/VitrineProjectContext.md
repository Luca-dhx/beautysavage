# VitrineProjectContext — vision produit Vitrine + Client

> Pourquoi chaque écran existe, côté client. Complément de
> [VitrineArchitecture](./VitrineArchitecture.md). Global : [FolderProjectContext](./FolderProjectContext.md).

## React UX Motion Guideline (à partir de M9, rapport 196)
La vitrine, surface publique premium et mobile, doit suivre la ligne UX globale : **mobile-first**,
animations fluides et sobres, transitions propres, micro-interactions utiles, **respect du
reduced-motion**, **jamais de table sur mobile**, feedback immédiat — l'expérience téléphone doit être
agréable. (Les notifications internes restent côté panel ; la vitrine ne les affiche pas.)

## Vision
La vitrine est la **devanture premium** de l'institut : elle doit inspirer confiance, valoriser
l'expertise (prestations, formations) et convertir sans friction. C'est l'unique surface publique
(SEO, performance, mobile). Tout ce qui est administration est ailleurs (manager).

## Parcours client
1. **Découverte** : accueil (mise en avant), catalogues prestations/formations/produits/cartes cadeaux.
2. **Détail** : page produit/formation/prestation → preuve sociale (avis), prix clair, disponibilité (créneaux prestation).
3. **Décision** : panier → consentements (transparence légale) → paiement.
4. **Paiement sécurisé** : Stripe Checkout hébergé (3DS/SCA délégués à Stripe → confiance + conformité).
5. **Possession** : accès formation immédiat & à vie, réservation confirmée, carte cadeau utilisable, suivi remboursement.

## Intérêt métier par écran
- **Accueil** : conversion (mise en avant, identité de marque, réassurance).
- **Catalogues** : découvrabilité ; filtrage ; pré-désactivation des offres non disponibles (pas de cul-de-sac au checkout).
- **Détail prestation + calendrier** : réserver un créneau réel (anti-chevauchement serveur).
- **Détail formation** : présentiel vs distanciel, avis, sessions/places ; promesse « accès à vie ».
- **Cartes cadeaux** : acquisition (cadeau) + utilisation (moyen de paiement) → leviers de CA.
- **Panier / checkout** : minimiser l'abandon ; consentements clairs ; montant juste (serveur).
- **Paiement** : sécurité perçue = taux de conversion ; Checkout hébergé = mobile-friendly.
- **Mes formations** : valeur perçue « à vie » ; rétention ; upsell.
- **Mes prestations / cartes / favoris / compte** : fidélisation, self-service (moins de support).

## Expérience premium & conversion
- Rapidité (Vite, cache TanStack Query), thème dynamique (identité institut), zéro friction de paiement (redirection Stripe), messages d'erreur clairs (dictionnaire code→message), états vides soignés.
- **Sécurité** : aucun secret côté front ; pricing serveur ; carte cadeau réservée serveur.

## Logiques produit spécifiques
- **Formation à vie** : une fois achetée, accès permanent (distanciel : modules/vidéos ; présentiel : session). Argument de vente fort, à mettre en avant.
- **Carte cadeau** : se vend (cadeau) ET se dépense (paiement, capée au solde) — jamais une remise. Double rôle = double opportunité de CA.
- **Acompte prestation** : encaisser un acompte en ligne, solde sur place (V1) → réserve l'engagement client.
- **0 €** : 100 % carte cadeau ou offre gratuite → finalize-free (pas de Stripe), parcours identique côté UX.

→ Détails techniques : [VitrineArchitecture](./VitrineArchitecture.md).

## MAJ U1 — Paiement sécurisé unifié
L'expérience de paiement client cible un parcours unique quel que soit l'achat (prestation/
formation/produit/carte cadeau/panier) : redirection vers Stripe Checkout hébergé (confiance, SCA,
mobile) ou finalisation 0 € transparente. Les fondations backend (UnifiedCheckout, U1) garantissent
pricing serveur, consentements et carte cadeau capée — base d'un paiement sûr et cohérent. Cf.
VitrineArchitecture (section Checkout via UnifiedCheckout).

## MAJ U2 — Paiement sécurisé hébergé
L'expérience cible : redirection vers une page de paiement Stripe hébergée (confiance maximale,
SCA, mobile natif) pour tout montant > 0, finalisation 0 € transparente sinon. Le backend est prêt
(flag `CHECKOUT_HOSTED`) ; l'activation visible côté client arrive avec R2 (consommation de la
redirection). Carte cadeau toujours capée au solde, jamais une remise Stripe.

## MAJ R0 — Coquille navigable
Le squelette de la vitrine existe (placeholders) : un visiteur peut naviguer entre accueil,
catalogues et pages de paiement, et les routes client (panier/checkout) sont protégées par
`RequireAuth`. Aucune donnée réelle n'est encore affichée — l'objectif R0 est de valider la
structure et les guards, pas l'expérience. Le parcours d'achat décrit ci-dessus se construit à
partir de **R1** (catalogue) et **R2** (checkout hébergé).

## MAJ R1 — La devanture prend vie
Le client peut désormais **parcourir le vrai catalogue** (prestations, formations, produits, cartes
cadeaux) dans React : images, prix vendus (serveur fait foi), badges promo, distinction
distanciel/présentiel, accès aux fiches détail. C'est la première fois que React affiche des données
métier réelles — mais l'achat reste volontairement **désactivé** (boutons « bientôt disponible »),
car checkout/paiement/réservation sont le périmètre R2. Un bandeau informe si le site est en
maintenance/suspendu, sans jamais empêcher la consultation du catalogue. Objectif R1 : valider la
chaîne API publique → React (proxy, typage, états loading/error/empty, responsive) sur du vrai
contenu, avant d'ouvrir la conversion en R2.

## MAJ Theme Foundation — Identité vitrine pilotable
La vitrine reprend le **thème configuré côté backend** (couleurs violet/rose par défaut) : la gérante
(via le dev) garde la main sur l'identité visuelle publique, comme dans le Vanilla. Le thème est
appliqué de façon non bloquante (fallback si indisponible) pour ne jamais dégrader l'expérience. À
terme, le Theme Studio Dev permettra d'éditer/prévisualiser ce thème vitrine.

## MAJ T1 — Identité vitrine = scope dédié
Le thème de la vitrine est désormais un **scope dédié** côté backend, distinct du thème du panel. La
gérante (via le dev) peut faire évoluer l'identité publique sans impacter l'outil interne, et
inversement. Côté expérience, rien ne change pour le visiteur : la vitrine charge toujours son thème
de la même façon, avec repli si indisponible.

## MAJ R2A — Choisir, réserver un créneau, préparer (sans payer)
Le client peut maintenant ajouter une prestation au panier, **choisir un créneau** via un calendrier,
et préparer sa commande avec les consentements légaux — mais **le paiement n'est pas encore actif**.
Message clé pour l'utilisateur : le créneau n'est pas réservé tant que le paiement/validation n'a pas
eu lieu (le backend verrouille au moment du checkout). Le panier est indicatif (le montant final est
calculé par le serveur). Cette étape « préparation » sécurise l'expérience avant d'ouvrir le paiement
Stripe en R2B.

## MAJ R2B — Payer pour de vrai
Le client peut maintenant **payer** : page Stripe hébergée (montant > 0) ou finalisation immédiate
(0 €), toujours via le backend. Promesse tenue : sécurité maximale (pas de Stripe.js côté front, pas
de donnée bancaire sur le site, serveur qui fait foi) et honnêteté du statut (« confirmation en cours »
tant que le webhook n'a pas validé). En cas d'annulation, le panier est conservé ; sans connexion, on
invite à se connecter sans perdre le panier. Le retour des paiements hébergés repasse pour l'instant
par le Vanilla — la boucle 100 % React se ferme en R2C.

## MAJ R2C — Achat de bout en bout dans React
Le client peut désormais payer **et revenir** dans React (page de confirmation propre), et se
**connecter** sans perdre son panier ni quitter le tunnel. La page de succès reste honnête (panier
vidé seulement si le paiement est réellement confirmé ; sinon « confirmation en cours »). En cas
d'annulation ou de session expirée, le panier est conservé et l'achat peut reprendre. La bascule du
retour Stripe vers React est activable proprement (variable backend) sans rien casser côté Vanilla.

## Sprint M5 — Theme Studio (rapports 187-188)

L'apparence de la vitrine (couleurs, police, arrondis, ombres, espacements, logo, slogan) est
désormais pilotable depuis le Theme Studio réservé au dev, avec aperçu en direct. Rien ne change pour
le visiteur tant qu'un nouveau thème n'est pas activé ; en l'absence de configuration, la vitrine
garde son thème par défaut.


## Sprint M11A — Checkout global booking (rapports 199-200)

Le checkout de production est officiellement branche sur le calendrier global de l institut : toute reservation passe par l entite unique, le prestataire n existe plus cote serveur (un ancien identifiant est accepte mais ignore). La disponibilite est calculee globalement. Aucun changement pour le paiement, le remboursement ou le planning. Limites : suppression definitive du champ prestataire reportee a M11B.

Cote vitrine React : le panier et le paiement n ont plus besoin de selectionner une prestataire ; le creneau choisi suffit. Le champ technique `practitionerId` subsiste pour compat ascendante mais est vide/ignore.
