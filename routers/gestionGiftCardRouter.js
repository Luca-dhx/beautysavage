import express from 'express';

import { requireAuth } from '../utils/session.js';
import { requireMode } from '../middlewares/modeGuard.js';
import { requireDev } from '../middlewares/requireDev.js';
import {
  getGiftCardConfig,
  updateGiftCardConfig,
  listGiftCards,
  getGiftCardDetailForGestion,
  lookupGiftCardForGestion,
  verifyGiftCardPasswordForGestion,
  manualDebitGiftCardForGestion,
  generateMissingGiftCardPasswords
} from '../controllers/giftCardController.js';

const router = express.Router();

router.use(requireAuth(), requireMode('gestion'), requireDev);

router.get('/config', getGiftCardConfig);
router.put('/config', updateGiftCardConfig);
router.post('/generate-missing-passwords', generateMissingGiftCardPasswords);
router.post('/lookup', lookupGiftCardForGestion);
router.post('/verify-password', verifyGiftCardPasswordForGestion);
router.post('/manual-debit', manualDebitGiftCardForGestion);
router.get('/', listGiftCards);
router.get('/:id', getGiftCardDetailForGestion);

export default router;
