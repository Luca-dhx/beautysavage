import express from 'express';

import User from '../models/user.js';
import { requireAuth, clearSessionCookie } from '../utils/session.js';
import { isAdminBlockedBySuspension } from '../middlewares/siteStatusGuards.js';

const router = express.Router();

router.post('/toggle', requireAuth(), async (req, res) => {
  try {
    const userId = req.sessionUserId;
    const user = await User.findById(userId).select('role currentMode');
    if (!user) {
      clearSessionCookie(res);
      return res.status(401).json({ ok: false, error: 'Session invalide.' });
    }
    if (!['admin', 'dev'].includes(user.role)) {
      return res.status(403).json({ ok: false, error: 'Acces refuse.' });
    }
    if (await isAdminBlockedBySuspension(user)) {
      clearSessionCookie(res);
      return res.status(403).json({
        ok: false,
        error: 'SUSPENDED_ADMIN_LOGOUT',
        code: 'SUSPENDED_ADMIN_LOGOUT',
        message: 'Le site est suspendu par le developpeur jusqu a nouvel ordre'
      });
    }
    user.currentMode = user.currentMode === 'gestion' ? 'vitrine' : 'gestion';
    await user.save();
    return res.json({ ok: true, currentMode: user.currentMode });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
});

export default router;
