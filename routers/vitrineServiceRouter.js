import express from 'express';

import {
  listPublicServices,
  getPublicServiceBySlug,
  listBoostedServices
} from '../controllers/serviceController.js';

const router = express.Router();

router.get('/boosted', listBoostedServices);
router.get('/', listPublicServices);
router.get('/:slug', getPublicServiceBySlug);

export default router;

// ─── Public availability sub-router ────────────────────────────────────────
// Exported separately, mounted at /api/vitrine/availability in app.js

import { getAvailableSlots, getAvailableDays } from '../controllers/availabilityController.js';

export const vitrineAvailabilityRouter = express.Router();
vitrineAvailabilityRouter.get('/slots', getAvailableSlots);
vitrineAvailabilityRouter.get('/days', getAvailableDays);
