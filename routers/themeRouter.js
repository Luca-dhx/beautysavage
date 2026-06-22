import express from 'express';

import { requireAuth } from '../utils/session.js';
import { requireStrictDev } from '../middlewares/requireDev.js';
import { requireMode } from '../middlewares/modeGuard.js';
import {
  listThemes,
  createTheme,
  updateTheme,
  activateTheme
} from '../controllers/themeController.js';

const router = express.Router();

router.use(requireAuth(), requireMode('gestion'), requireStrictDev);

router.get('/', listThemes);
router.post('/', createTheme);
router.put('/:id', updateTheme);
router.post('/:id/activate', activateTheme);

export default router;
