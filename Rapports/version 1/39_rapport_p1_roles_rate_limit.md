# Rapport Phase P1-1 - Durcissement roles dev/admin + rate-limit auth

## 1. Objectif
Fermer le durcissement P1: vraie separation `dev` / `admin`, blocage des promotions vers `dev` depuis un compte admin, et rate-limits dedies sur login + password reset.

## 2. Commit de livraison
`a renseigner apres le commit final`

## 3. Fichiers modifies
- `middlewares/requireDev.js`
- `routers/gestionUsersRouter.js`
- `controllers/gestionUsersController.js`
- `routers/authRouter.js`
- `routers/passwordResetRouter.js`
- `tests/p1/security.roles.test.js`
- `tests/p1/auth.rateLimit.test.js`
- `package.json`
- `tests/README.md`
- `architecture.md`
- `projectContext.json`
- `Rapports/version 1/38_audit_p1_roles_rate_limit.md`
- `Rapports/version 1/39_rapport_p1_roles_rate_limit.md`

## 4. Tests executes
- `npm run test:p1` -> 2 files, 10 passed
- `npm test` -> 18 files, 60 passed, 0 todo, 0 expected-fail
- `npm run test:p0` -> 14 files, 44 passed, 0 todo
- `npm run test:integration` -> 2 files, 6 passed

## 5. Resultat global
Le durcissement P1 est ferme et ne casse ni les P0 ni l integration.
Les tests P1 couvrent le comportement reel des routes, pas seulement les helpers.

## 6. Comportement final roles
- `requireStrictDev` est strictement `dev`-only.
- `requireAdminOrDev` reste inclusif (`admin` + `dev`).
- `routers/gestionUsersRouter.js` passe par `requireAdminOrDev`.
- `controllers/gestionUsersController.js` refuse a un admin de creer ou de promouvoir un compte `dev`.
- Un dev peut creer/promouvoir `dev`.
- Un admin peut continuer a gerer des comptes `admin` / `client` via la gestion utilisateur.

## 7. Comportement final rate-limit
- `POST /auth/login` a un rate-limit dedie de 5 tentatives / 15 min / IP, avec succes non comptes.
- `POST /auth/password-reset/request` a un rate-limit dedie.
- `POST /auth/password-reset/validate` a un rate-limit dedie.
- `POST /auth/password-reset/complete` a un rate-limit dedie.
- Les messages de rate-limit restent generiques.

## 8. Risques fermes
- Escalade admin -> dev via la gestion utilisateur.
- Confusion entre routes strict-dev et routes admin/dev.
- Brute-force login.
- Spam / brute-force sur les routes de reset password.

## 9. Risques restants non P1
- Les autres risques deja documentes en Phase P0 / P1b restent ceux cites dans `architecture.md` et `projectContext.json`.
- Les warnings Mongoose d index dupliques restent du bruit technique, pas une regression de ce lot.

## 10. Cohérence doc
- `architecture.md` documente la vraie separation des guards et les rate-limits.
- `tests/README.md` reference `tests/p1/` et la commande `npm run test:p1`.
- `projectContext.json` a ete mis a jour avec les nouveaux risques fermes, les tests P1 et le compteur de harness courant.

## 11. Commandes executees
- `npm run test:p1`
- `npm test`
- `npm run test:p0`
- `npm run test:integration`
- `git grep -n "beautysavage-gift-card-secret\\|beautysavage-email-verification-secret\\|trackingToken.*console\\|password.*refund-tracking\\|mock-pay" .`
- `git grep --cached -n "sk_live_\\|xkeysib-\\|whsec_\\|mongodb+srv://.*:.*@"`

## 12. Decision
P1 roles + auth rate-limit ferme.
