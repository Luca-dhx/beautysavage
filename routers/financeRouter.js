// routers/financeRouter.js
// RX2 — Espace Finance (admin/dev). Monté AVANT les broad-mounts dev-only sur '/api/gestion'
// (commissionRouter requireStrictDev) dans app.js, sinon shadow 403 pour les admins (cf. M3A/M11B/M12).
import express from 'express';

import { requireAuth } from '../utils/session.js';
import { requireMode } from '../middlewares/modeGuard.js';
import { requireAdminOrDev } from '../middlewares/requireDev.js';
import { getFinanceDashboard, getFinanceTimeline } from '../controllers/financeController.js';

const router = express.Router();

router.use(requireAuth(), requireMode('gestion'), requireAdminOrDev);

router.get('/dashboard', getFinanceDashboard);
// RX2.2 — Financial Timeline (mouvements + résumé filtrable).
router.get('/timeline', getFinanceTimeline);

export default router;
