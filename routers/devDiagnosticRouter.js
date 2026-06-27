// routers/devDiagnosticRouter.js
// Mounted at /api/gestion/dev (gestion perimeter already requires admin/dev; the
// routes below additionally require STRICT dev).
import { Router } from 'express';
import { requireStrictDev } from '../middlewares/requireDev.js';
import { getSendLogs, getEvents, getWebhookFailures } from '../controllers/devDiagnosticController.js';

const router = Router();

router.get('/send-logs', requireStrictDev, getSendLogs);
router.get('/events', requireStrictDev, getEvents);
router.get('/webhook-failures', requireStrictDev, getWebhookFailures);

export default router;
