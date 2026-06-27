import express from 'express';
import { requireAuth } from '../utils/session.js';
import { requireMode } from '../middlewares/modeGuard.js';
import {
  getBookingDetail,
  markNoShow,
  markCompleted,
  cancelBookingByAdmin,
  markBalancePaidOnSite,
  simulateReminders
} from '../controllers/serviceBookingController.js';

const router = express.Router();

router.use(requireAuth(), requireMode('gestion'));

// Static routes BEFORE parametric routes
router.post('/bookings/simulate-reminders', simulateReminders);

// Parametric routes
router.get('/bookings/:bookingId/detail', getBookingDetail);
router.post('/bookings/:bookingId/no-show', markNoShow);
router.post('/bookings/:bookingId/complete', markCompleted);
router.post('/bookings/:bookingId/cancel', cancelBookingByAdmin);
router.post('/bookings/:bookingId/balance-paid', markBalancePaidOnSite);

export default router;
