// RX-RUN — Lance le serveur en mode React CANARY (REACT_OFFICIAL_FRONTEND=ON) sans toucher le .env ni le
// défaut prod. Le flag est lu dynamiquement par requête ; on le pose ici pour cette session uniquement.
// ROLLBACK = arrêter ce process et relancer via `npm run vanilla:up` (ou simplement `npm start`).
//
// Prérequis : builds React présents (npm run react:build). Vérifiez avant : npm run check:launch:canary
process.env.REACT_OFFICIAL_FRONTEND = 'true';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

console.log('[RX-RUN] Démarrage en mode CANARY React (REACT_OFFICIAL_FRONTEND=true). Ctrl+C pour arrêter.');
console.log('[RX-RUN] Rollback : arrêter ce process puis `npm run vanilla:up` (ou `npm start`).');

await import('../app.js');
