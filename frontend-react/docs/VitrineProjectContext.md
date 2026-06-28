# VitrineProjectContext — vision produit Vitrine + Client

> Pourquoi chaque écran existe, côté client. Complément de
> [VitrineArchitecture](./VitrineArchitecture.md). Global : [FolderProjectContext](./FolderProjectContext.md).

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
