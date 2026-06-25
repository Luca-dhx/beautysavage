# 52 — Audit final & suppression `WEBHOOK_API_KEY`

> Repo `backend/`, branche `phase-0-security-baseline`, base `e3c83a6`.
> Aucune valeur de secret n'est affichée.

## A1 — Audit final

`git grep -n "WEBHOOK_API_KEY"` avant nettoyage : occurrences classées.

| Emplacement | Type | Verdict |
|---|---|---|
| `tests/setup/testEnv.js:39` | `process.env.WEBHOOK_API_KEY = 'fake-...'` (valeur **factice** de test) | **morte** — à supprimer |
| `.env.example` | commentaire NOTE (la variable elle-même avait déjà été retirée en Phase 1) | à supprimer |
| `architecture.md`, `projectContext.json` | prose (changelog Phase 1) citant le nom | rephrasé sans le littéral |
| `Rapports/version 1/46..51` | rapports historiques | **conservés** (mémoire d'audit) |

**Recherche d'usage applicatif** : aucun `process.env.WEBHOOK_API_KEY` dans
`controllers/`, `services/`, `routers/`, `seeders/`, `utils/`, `middlewares/`,
`scripts/`, `app.js`. La seule lecture jamais existante était la valeur factice de
test ; le code applicatif ne l'a **jamais** consommée.

### Conclusion : **INUTILISÉE (clé morte)**

Preuves :
- 0 lecture dans le code applicatif (grep exhaustif).
- Présente seulement en placeholder `.env.example` (retiré Phase 1) + fake test.
- Type identifié en Phase 0 : **clé secrète Stripe LIVE (`sk_live_`)** mal nommée,
  sans appelant.

## A2 — Nettoyage effectué

Supprimée de :
- `tests/setup/testEnv.js` (ligne factice retirée).
- `.env.example` (commentaire NOTE retiré ; la variable n'y figurait plus).
- `architecture.md` / `projectContext.json` : mention rephrasée sans le littéral
  (pointeur vers ce rapport conservé).

Après nettoyage, `git grep -n "WEBHOOK_API_KEY"` ne remonte plus que les
**rapports historiques** (46–52).

---

## ⚠️ ACTION MANUELLE REQUISE

```
1. Révoquer la clé Stripe LIVE dans le dashboard Stripe (Developers → API keys).
2. Supprimer WEBHOOK_API_KEY du .env local (fichier réel, non versionné, non touché ici).
```

Rappel : `.env` est gitignoré → la clé n'a jamais été versionnée. La révocation
reste néanmoins requise (impossible de prouver l'absence de fuite locale :
sauvegardes, historique de poste, images).
