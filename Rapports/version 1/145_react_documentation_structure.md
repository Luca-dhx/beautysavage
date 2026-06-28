# 145 — Structure de documentation React

> Convention de documentation obligatoire pour le chantier React. Les docs vivent dans
> `frontend-react/docs/` et sont versionnées avec le code.

## Fichiers (créés)
| Fichier | Scope | Contenu |
|---|---|---|
| `FolderArchitecture.md` | Global tech | Monorepo, apps, packages, stack, API/auth/routing, sous-domaines, conventions, stratégie migration. |
| `FolderProjectContext.md` | Global produit | Vision SaaS, séparation vitrine/manager/dev, logique métier, décisions produit. |
| `VitrineArchitecture.md` | Vitrine tech | Routes public/client, catalogue, panier, checkout, Stripe Checkout, 0 €, carte cadeau, accès formation, composants/stores/guards/erreurs/responsive. |
| `VitrineProjectContext.md` | Vitrine produit | Parcours client, intérêt métier par écran, premium, conversion, formation à vie, carte cadeau. |
| `ManagerArchitecture.md` | Manager+Dev tech | Routes manager/dev, login, onboarding contrat, modules, guards admin/dev, API. |
| `ManagerProjectContext.md` | Manager+Dev produit | Rôle institut, rôle dev, gestion quotidienne, activation contrat, commissions, supervision. |

## Règle de mise à jour (OBLIGATOIRE)
Chaque sprint React doit, dans le même commit :
1. Mettre à jour la **doc du scope touché** (`Vitrine*` si vitrine/client, `Manager*` si manager/dev).
2. Mettre à jour **`FolderArchitecture.md` + `FolderProjectContext.md`** si l'architecture ou une
   décision produit **globale** change (nouvelle app, nouveau package, changement auth/domaines/stack).
3. Maintenir les **liens croisés** (chaque Architecture pointe vers son ProjectContext et inversement,
   tous pointent vers les Folder*).

## Liens avec les rapports backend
- Architecture cible & décisions : rapports 136, 142.
- Blocages → mapping erreurs : rapport 135 (→ `packages/config`).
- Contrat API : rapport 139 (→ `packages/api-client`, cf. 148).
- UnifiedCheckout : rapports 143/144 (→ checkout vitrine + onboarding manager).
- Setup parallèle / routes / roadmap : rapports 146, 147, 149.

## Principe
La doc est **normative** (ce qu'on construit), pas descriptive a posteriori. Un écran non documenté
dans le scope correspondant ne doit pas être mergé. Les `ProjectContext` justifient le « pourquoi »
(métier) ; les `Architecture` décrivent le « comment » (technique).
