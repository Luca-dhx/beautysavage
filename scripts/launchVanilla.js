// RX-RUN — Lance le serveur en mode VANILLA (rollback ; REACT_OFFICIAL_FRONTEND=OFF), quel que soit le .env.
// Équivalent au défaut de production. Utile pour revenir en arrière immédiatement après un canary.
process.env.REACT_OFFICIAL_FRONTEND = 'false';
if (!process.env.NODE_ENV) process.env.NODE_ENV = 'development';

console.log('[RX-RUN] Démarrage en mode VANILLA (rollback, REACT_OFFICIAL_FRONTEND=false). Ctrl+C pour arrêter.');

await import('../app.js');
