# Product UX Guideline — Beauty Savage (référence officielle)

> Établie au Sprint P1 (Product Polish). **Référence obligatoire** pour tout nouveau développement front.
> Voir aussi la Motion Guideline (M9) et la couche `@bs/ui/polish/`.

## 0. Directive permanente

> **Toute nouvelle interface, composant ou fonctionnalité doit respecter la Product UX Guideline, la Motion
> Guideline et le principe « mobile-first ». Aucune nouvelle page ne peut être validée si elle n'offre pas une
> expérience équivalente sur téléphone et ordinateur, avec une cohérence visuelle et comportementale parfaite
> avec le reste du produit.**

Concrètement, une PR front n'est validable que si : tests + lint + typecheck + build verts ; aucune couleur
hex en dur (tokens `--bs-*`) ; focus visible ; cibles tactiles ≥ 44px ; pas de scroll horizontal en 320px ;
animations dérivées des tokens motion et coupées par `prefers-reduced-motion`.

## 1. Tokens (source unique)
Toujours consommer les variables `--bs-*` (`tokens.css`), jamais de valeurs en dur :
couleurs `--bs-color-*`, espacements `--bs-space-1..4`, `--bs-radius`, `--bs-shadow`, motion
`--bs-motion-fast|normal|slow` + easings, `--bs-z-*`, et (P1) `--bs-tap-target:44px`,
`--bs-motion-shimmer`, `--bs-icon-sm|md|lg`. Le `ThemeProvider` réécrit ces vars à l'exécution (scope
vitrine/panel) → ne jamais court-circuiter.

## 2. Composants — réutiliser avant de créer
Ordre de préférence : `@bs/ui` (`Button`, `Card`, `LoadingState`, `ErrorState`, `EmptyState`,
`SectionHeader`, catalogue…) → `@bs/ui/polish` (`Badge`, `Chip`, `IconButton`, `Skeleton`, `Spinner` +
classes `bs-badge|bs-chip|bs-skeleton|bs-message|bs-icon-btn|bs-device-btn`) → sinon composant feature.
**Ne pas ré-implémenter** un bouton/badge/chip/skeleton localement : utiliser les primitives partagées.

## 3. Accessibilité (non négociable)
- Focus visible (assuré globalement par `polish.css` — ne pas le retirer).
- Cibles tactiles ≥ 44px (`--bs-tap-target`) ; utiliser `IconButton`/`bs-icon-btn` pour les boutons icône.
- Tout bouton icône a un `aria-label` ; icônes décoratives `aria-hidden="true"`.
- `role`/`aria-live` sur les états (status/alert/busy) ; landmarks (`header/main/nav/footer`) ; skip-link.
- Contraste suffisant (tokens), états `:disabled` lisibles.

## 4. Responsive (mobile-first)
- Utilisable au pouce, sans zoom, sans scroll horizontal, sans perte d'info, de 320 à 1024px+.
- Pas de largeur fixe en px qui dépasse 320 ; grilles `1 → 2 → 3` colonnes ; `min-width:0` sur les colonnes
  flex pour éviter l'overflow. `overflow-x: clip` (jamais `hidden` au niveau document → casse `sticky`).
- Layout liste/empilable ; **jamais de `<table>`** (cards/grilles).
- Drawers : bottom-sheet en mobile, slide/centre en desktop.

## 5. Motion (Motion Guideline M9 + presets P1)
- Animations légères (opacity/transform), durées courtes (tokens), easing doux.
- Toujours conditionnées par `prefers-reduced-motion` (reset global déjà en place ; `motionPreset()`/
  `microTransition()` renvoient `''` en reduced-motion).
- Presets disponibles : entrée, sortie, drawer (sheet/slide), dialog, accordion, hover, press, loading
  (skeleton/spinner), success (pop), error (shake), toast, notification, badge.
- Micro-interactions pertinentes (press, copie, succès, publication, rollback, paiement) — **jamais excessif**.

## 6. Formulaires
Labels associés, `required`/optionnel explicites, messages d'erreur via `bs-message--error`, clavier mobile
(`type=email|tel`, `inputMode`, `autoComplete`), formats (téléphone/e-mail/montants/dates) cohérents.

## 7. Textes & icônes
Terminologie/casse/ponctuation cohérentes (Title Case titres & boutons, sentence case messages/vides ;
espace insécable avant `:` en français). Une seule librairie d'icônes (Bootstrap Icons `bi-*`), tailles via
`--bs-icon-*`, alignées et décoratives `aria-hidden`.

## 8. Navigation
État actif toujours visible (`NavLink` + `.bs-nav-link.active`/`[aria-current=page]`) → « vous êtes ici ».
Retour clair, deep-links cohérents, skip-link.

## 9. Performance
Cache TanStack Query raisonnable (retry 1, pas de refetch-on-focus, `staleTime`), lazy/dynamic import pour
les écrans lourds, `memo` ciblé, images dimensionnées. Aucune régression fonctionnelle.

## 10. Checklist de revue (à cocher pour toute nouvelle page/feature)
- [ ] Tokens `--bs-*` only (zéro hex) — `noHardcodedHex.test.ts` présent.
- [ ] Focus visible + cibles ≥ 44px + aria-labels + landmarks.
- [ ] 320/360/390/430/768/1024 : pas de scroll horizontal, utilisable au pouce.
- [ ] Motion via presets/tokens + reduced-motion respecté.
- [ ] Primitives partagées réutilisées (pas de duplication).
- [ ] États loading/empty/error fournis et cohérents.
- [ ] Tests + lint + typecheck + build verts.
