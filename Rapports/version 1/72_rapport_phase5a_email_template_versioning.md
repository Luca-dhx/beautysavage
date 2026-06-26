# 72 — Rapport Phase 5A : versioning backend des templates email

> Repo `backend/`, branche `phase-0-security-baseline`, base `8340cae`.
> **Tests : 46 fichiers / 185 verts** (était 173, +12 : p0 44 · p1 135 · integration 6).
> Aucun secret affiché. **Contenus envoyés inchangés ; aucun template supprimé ;
> pas d'UI ; pas d'automatisation email.**

## 1. Stratégie

`EmailTemplate` **reste l'entité de version**. Une seule version `published` par
`functionName` pilote le runtime ; les `draft`/`archived` sont l'historique. Le
runtime ne sert **jamais** un draft/archived. Une version published n'est **jamais
écrasée** par le service de versioning (nouvelles versions uniquement).

## 2. Champs ajoutés (`models/EmailTemplate.js`)

`version` (Number, def 1), `status` (`draft|published|archived`, def `published`),
`publishedAt`, `archivedAt`, `publishedBy`, `createdFromVersion`, `isSystemDefault`.

**Index** : l'ancien `functionName_1 unique` est **retiré du schéma** (supprimé en
base par la migration) ; ajout de `{functionName, status}` (non unique) et d'un
**partial unique** `{functionName} where status='published'` (invariant 1 published).

## 3. Compatibilité / zéro régression

- `loadTemplate`/`ensureTemplate` (mailService) lisent désormais la version
  **published** ; **fallback legacy** : un doc dont le `status` est absent/null est
  traité comme published → **le contenu envoyé ne change pas** avant migration.
- Draft/archived ne sont jamais servis (test dédié).
- `saveTemplate` (POST admin existant) édite la version **published/legacy** en
  place (`status ∈ {published, null}`), comportement admin **inchangé** (pas de
  casse de l'UI Vanilla actuelle).

## 4. Migration douce

`scripts/migrateEmailTemplatesToVersioning.js` :
- **dry-run par défaut**, `--apply` pour persister ;
- supprime l'index legacy `functionName_1`, `syncIndexes` (partial unique) ;
- passe chaque doc sans `status` à `published` v1 (**contenu jamais modifié**) ;
- idempotent (ne retouche pas les docs déjà migrés).
- **Self-heal au boot** : `app.js` l'exécute en `--apply` (non-test, best-effort) →
  un déploiement normalise la base automatiquement. Avant exécution, le fallback
  legacy garantit déjà zéro régression.

## 5. Service `services/emailTemplateVersioningService.js`

| Fonction | Rôle |
|---|---|
| `getPublishedTemplate(fn)` | lecture published (fallback legacy) |
| `listVersions(fn)` | historique (toutes versions, newest first) |
| `createDraftFromPublished(fn, changes, actor)` | crée un **draft** (version+1, sanitize) — n'affecte pas le runtime |
| `publishDraft(id, actor)` | **archive** l'ancien published puis publie le draft (1 seul published) |
| `archiveTemplate(id, actor)` | archive une version |
| `rollbackToVersion(fn, version, actor)` | copie le contenu d'une version dans un **nouveau** published (ancien archivé) — historique réversible, jamais d'écrasement |

Sécurité contenu : `bodyHtml` assaini (`sanitizeEditorialHtml`), `fullHtml` assaini
(suppression `<script>`, handlers `on*`, `javascript:`). Validation des fonctions
conservée (`AVAILABLE_FUNCTIONS`).

## 6. Endpoints admin (additifs, dev only, sans UI)

Montés sous `/api/gestion/mails` (déjà `requireStrictDev`) :
- `GET  /templates/:functionName/versions` — historique.
- `POST /templates/:functionName/draft` — créer un draft (changes optionnels).
- `POST /drafts/:id/publish` — publier un draft.
- `POST /drafts/:id/archive` — archiver une version.
- `POST /templates/:functionName/rollback/:version` — rollback.

Les endpoints **existants** (`GET/POST /template`, `listTemplates`, catégories,
simulate-sale) restent **inchangés**.

## 7. Tests (12)

migration v1 published (contenu intact) + dry-run ; 1 seul published par
functionName (partial unique) ; create draft ne change pas le runtime ; publish
change le runtime + archive l'ancien ; rollback (copie + archive, réversible) ;
loadTemplate lit published / fallback legacy / défaut ; draft & archived jamais
servis ; sanitization (pas de `<script>`/`onclick`).

## 8. Compatibilité & limites V1

- **Légère réserve** : le `POST /template` legacy édite le published **en place**
  (pas de draft→publish gouverné) — choix volontaire pour ne pas casser l'UI
  Vanilla actuelle. Le chemin gouverné est exposé par les nouveaux endpoints ; le
  futur Studio React l'utilisera exclusivement, après quoi le legacy POST pourra
  être déprécié.
- `updateTemplateCategory` (métadonnées) reste tel quel (comportement inchangé).
- Pas d'UI, pas d'automatisation, pas de moteur no-code.

## 9. Futur Studio React

Le socle (versions, draft→publish, rollback, historique, sanitize) est l'API
backend du futur **Email Template Studio** (post-React) : édition en draft, aperçu,
publication gouvernée, rollback, et — via `email.*`/`templateKey`/`contextType` —
analytics de délivrabilité/engagement par template.

## 10. Risques restants

- 🟠 `POST /template` legacy édite le published en place (pas de gouvernance draft) →
  déprécié à l'arrivée du Studio React.
- 🟢 Migration boot best-effort (si elle échoue, fallback legacy assure l'envoi ;
  re-tentée au prochain boot).
- 🟢 Pas de TTL/rétention sur les versions archivées (purge à prévoir si volume).

## 11. Prochaine phase recommandée

**Phase 5B** (post-migration React entamée) : exposer le Studio Email Template
(UI React) sur ces endpoints, router le POST d'édition vers le draft, déprécier le
POST legacy, ajouter aperçu + catalogue de variables. Toujours sans automatisation
d'envoi non gouvernée.
