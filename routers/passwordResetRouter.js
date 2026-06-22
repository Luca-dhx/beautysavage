import express from 'express';

import {
  requestResetToken,
  validateResetToken,
  completeResetPassword
} from '../controllers/passwordResetController.js';

const router = express.Router();

router.post('/request', requestResetToken);
router.post('/validate', validateResetToken);
router.post('/complete', completeResetPassword);

export default router;
