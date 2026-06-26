# 71 — Audit du système EmailTemplate actuel (avant versioning)

> Repo `backend/`, branche `phase-0-security-baseline`, base `8340cae`. Audit du
> système existant pour cadrer le versioning. Aucun secret affiché.

## État actuel

| Élément | État actuel | Risque | Impact versioning |
|---|---|---|---|
| `functionName` | clé logique, **unique** (`index unique`) | Bloque plusieurs versions | Remplacer l'unique par un **partial unique sur published** |
| `subject` | contenu éditable | — | versionné |
| `bodyHtml` | contenu (texte simplifié) | XSS si non assaini | sanitize conservé |
| `fullHtml` | contenu premium (HTML+CSS inline) | XSS si non assaini | sanitize conservé |
| `mode` | `text`/`html` | — | versionné |
| `categoryId` / `recipient` | métadonnées | — | partagées (sur la version active) |
| `isMetadataOnly` | doc « métadonnées seules » sans contenu | loadTemplate régénère le défaut | conservé |
| **defaults** | objet `TEMPLATE_FUNCTIONS` (en dur, ~32 fonctions) | — | fallback inchangé |
| `ensureTemplate(fn)` | crée le défaut si aucun doc | — | crée un **published v1** (`isSystemDefault`) |
| **édition admin** | `POST /api/gestion/mails/template` → `saveTemplate` (sanitize + `findOneAndUpdate({functionName})`, **upsert**) — **dev only** (`requireStrictDev`) | écrit en place | conservé (édite la version published en place) |
| **lecture runtime** | `loadTemplate(fn)` → `EmailTemplate.findOne({functionName})` → contenu, sinon `ensureTemplate` (défaut) | un seul doc/fn | doit lire **published** (fallback legacy) |

## Lecture runtime (détail)

`loadTemplate(functionName)` (mailService) est le **point d'entrée unique** :
appelé par ~15 senders (`vente`, `password_reset`, `booking_confirmed`, …). Il
lit le doc et, si absent/`isMetadataOnly`, régénère le défaut via `ensureTemplate`.
**C'est ici** que la version `published` doit être sélectionnée.

## Contraintes pour le versioning

- **Ne pas changer le contenu envoyé** : les docs existants n'ont pas de `status`.
  Le runtime doit traiter `status` absent **comme published** (fallback legacy)
  pour zéro régression avant migration.
- **Index legacy** `functionName_1 unique` : **doit être supprimé** (sinon une 2e
  version = E11000). Migration dédiée.
- **Édition admin actuelle** (Vanilla JS gestion) : ne pas casser → `POST template`
  conservé (édite la version published en place) ; le draft→publish gouverné est
  exposé via de **nouveaux** endpoints (futur Studio React).

## Conclusion
Stratégie retenue : garder `EmailTemplate` comme **entité de version** ; ajouter
`version/status/publishedAt/archivedAt/publishedBy/createdFromVersion/isSystemDefault` ;
partial unique sur `published` ; `loadTemplate` lit published (fallback legacy) ;
migration douce (legacy → published v1, contenu intact) ; endpoints additifs.
Détails de l'implémentation : rapport 72.
