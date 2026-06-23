# Rapport Phase P1-1 - Audit roles dev/admin + rate-limit auth

## 1. Objectif
Auditer le durcissement P1 demande: separation reelle entre `dev` et `admin`, controle de la creation / promotion vers `dev`, et rate-limits dedies sur les routes sensibles d auth.

## 2. Commit de depart
`91329adcf1baa5ae98d6c5600272d26c9918a762`

## 3. Fichiers lus
- `middlewares/requireDev.js`
- `controllers/gestionUsersController.js`
- `routers/gestionUsersRouter.js`
- `routers/devRouter.js`
- `routers/authRouter.js`
- `routers/passwordResetRouter.js`
- `services/passwordResetService.js`
- `controllers/passwordResetController.js`
- `architecture.md`
- `projectContext.json`
- `tests/README.md`

## 4. Constat actuel
- `requireDev` et `requireAdminOrDev` sont inclusifs (`dev` + `admin`), mais `requireStrictDev` est aussi inclusif dans l etat audite, donc il ne protege pas vraiment les routes dev-only.
- `routers/gestionUsersRouter.js` utilise `requireStrictDev`, ce qui bloque aussi les admins pour la gestion utilisateur alors que le besoin P1 est de laisser les admins gerer les comptes usuels.
- `controllers/gestionUsersController.js` accepte `role=dev` a la creation et a la mise a jour sans verifier que l acteur est lui-meme `dev`.
- `POST /auth/login` n a pas de limiteur dedie.
- `POST /auth/password-reset/request|validate|complete` n ont pas de limiteurs dedies.
- Les rate-limits deja existants sur signup / verify / resend sont bons et doivent rester tels quels.

## 5. Comportement attendu
- `requireStrictDev` doit devenir strictement `dev`-only.
- `requireAdminOrDev` doit rester inclusif pour les routes admin/dev classiques.
- Un admin ne doit pas pouvoir creer ou promouvoir un compte `dev`.
- Un dev doit pouvoir creer / promouvoir un `dev`.
- Login et reset password doivent avoir des rate-limits dedies par route, avec messages generiques.

## 6. Risques identifies
- Escalade de privilege admin -> dev via la gestion utilisateur.
- Absence de separation reelle entre routes strict-dev et routes admin/dev.
- Brute-force login.
- Spam / brute-force des routes de reset password.
- Blocage possible de la gestion utilisateur si on garde le router strict-dev.

## 7. Plan minimal de correction
1. Corriger `requireStrictDev` pour n autoriser que `dev`.
2. Basculer `gestionUsersRouter` sur `requireAdminOrDev`.
3. Bloquer dans `gestionUsersController` toute creation / promotion `role=dev` par un admin.
4. Ajouter un limiteur login dedie.
5. Ajouter un limiteur dedie sur `password-reset/request`, `validate` et `complete`.

## 8. Commandes executees
- `rg -n "requireStrictDev|requireAdminOrDev|requireDev" middlewares/requireDev.js controllers/gestionUsersController.js routers/authRouter.js routers/passwordResetRouter.js`
- `rg -n "login|reset password|rate.?limit|rateLimit" routers/authRouter.js routers/passwordResetRouter.js services/passwordResetService.js`
- `Get-Content middlewares/requireDev.js`
- `Get-Content controllers/gestionUsersController.js`
- `Get-Content routers/devRouter.js`
- `Get-Content routers/gestionUsersRouter.js`
- `Get-Content routers/authRouter.js`
- `Get-Content routers/passwordResetRouter.js`

## 9. Decision
Audit conclut que les deux risques P1 sont ouverts avant correction.
