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
  generateMissingGiftCardPasswords,
  createManualGiftCard,
  lookupGiftCardByQr,
  manualDebitGiftCardById
} from '../controllers/giftCardController.js';
import {
  listLibraryHandler,
  getActiveTemplateHandler,
  activateTemplateHandler,
  previewLibraryTemplateHandler
} from '../controllers/giftCardTemplateController.js';

const router = express.Router();

router.use(requireAuth(), requireMode('gestion'), requireDev);

router.get('/config', getGiftCardConfig);
router.put('/config', updateGiftCardConfig);
router.post('/generate-missing-passwords', generateMissingGiftCardPasswords);

// M13 — librairie de templates (admin : lecture + sélection de l'actif uniquement).
router.get('/templates', listLibraryHandler);
router.get('/templates/active', getActiveTemplateHandler);
router.get('/templates/:id/preview', previewLibraryTemplateHandler);
router.post('/templates/:id/activate', activateTemplateHandler);

// M13 — création manuelle (paiement sur place) + lookups + débit manuel par id.
router.post('/manual', createManualGiftCard);
router.get('/lookup', lookupGiftCardForGestion); // GET ?code=
router.post('/lookup', lookupGiftCardForGestion);
router.post('/lookup-qr', lookupGiftCardByQr);
router.post('/verify-password', verifyGiftCardPasswordForGestion);
router.post('/manual-debit', manualDebitGiftCardForGestion); // legacy (par code + mot de passe)
router.post('/:id/manual-debit', manualDebitGiftCardById); // M13 (par id + motif)
router.get('/', listGiftCards);
router.get('/:id', getGiftCardDetailForGestion);

export default router;
