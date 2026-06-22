import express from 'express';

import { requireAuth } from '../utils/session.js';
import { requireMode } from '../middlewares/modeGuard.js';
import { requireStrictDev } from '../middlewares/requireDev.js';
import {
  getTemplate,
  saveTemplateController,
  simulateSale,
  listCategories,
  listTemplates,
  updateTemplateCategory
} from '../controllers/mailTemplateController.js';

const router = express.Router();

router.use(requireAuth(), requireMode('gestion'), requireStrictDev);

router.get('/templates', listTemplates);
router.get('/categories', listCategories);
router.get('/template', getTemplate);
router.post('/template', saveTemplateController);
router.patch('/templates/:functionName/category', updateTemplateCategory);
router.post('/simulate-sale', simulateSale);

export default router;
