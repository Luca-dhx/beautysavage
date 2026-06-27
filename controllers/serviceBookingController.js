import crypto from 'node:crypto';
import mongoose from 'mongoose';

import Service from '../models/Service.js';
import ServiceBooking from '../models/ServiceBooking.js';
import PractitionerProfile from '../models/PractitionerProfile.js';
import Sale from '../models/Sale.js';
import Invoice from '../models/Invoice.js';
import User from '../models/user.js';
import NoShowRecord from '../models/NoShowRecord.js';
import ServiceSettings from '../models/ServiceSettings.js';
import RefundRequest from '../models/RefundRequest.js';
import { getSessionUserId } from '../utils/session.js';
import { extractClientIp } from '../utils/requestClientIp.js';
import { emitBookingEvent } from '../services/businessEventService.js';
import { runPostSaleSideEffects } from './clientController.js';
import {
  getServiceRefundEligibility,
  buildRefundId,
  resolveSaleAcceptedText
} from '../services/refundService.js';
import {
  applyRefundExecutionCap,
  createRefundRequestOnce
} from '../services/refundRequestService.js';
import {
  createOrRefreshServiceCancellationFlow,
  notifyServiceCancellationChoiceForFlow,
  SESSION_CANCELLATION_TOKEN_TTL_DAYS
} from '../services/sessionCancellationFlowService.js';
import { triggerNotification } from '../services/notificationService.js';
import {
  createServiceBookingWithProtection,
  releaseServiceBookingSlotLocks
} from '../services/serviceAvailabilityService.js';
import { resolveEffectiveServiceUnitPrice } from '../services/promotionService.js';

function formatDateFR(date) {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function formatTimeFR(date) {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function buildBookingId() {
  const suffix = crypto.randomUUID().split('-')[0];
  return `BKG-${Date.now()}-${suffix}`;
}

function buildSaleId() {
  const suffix = crypto.randomUUID().split('-')[0];
  return `SALE-${Date.now()}-${suffix}`;
}

function roundToCents(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function validateObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || ''));
}

function serializeBooking(booking, service, practitioner) {
  return {
    id: booking._id?.toString(),
    bookingId: booking.bookingId,
    serviceId: booking.serviceId?.toString(),
    serviceName: service?.name || '',
    practitionerId: booking.practitionerId?.toString(),
    practitionerName: practitioner?.displayName || '',
    practitionerPhoto: practitioner?.photo || null,
    startAt: booking.startAt,
    endAt: booking.endAt,
    totalPrice: booking.totalPrice,
    depositAmount: booking.depositAmount,
    paymentType: booking.paymentType,
    paymentStatus: booking.paymentStatus,
    status: booking.status,
    cancelledAt: booking.cancelledAt,
    cancelledBy: booking.cancelledBy,
    selectedOptions: booking.selectedOptions || [],
    saleId: booking.saleId || null,
    cancellationPolicySnapshot: booking.consumerWaiverSnapshot || {},
    createdAt: booking.createdAt
  };
}

// ─── GET /api/client/me/booking-status ────────────────────────────────────

export async function getMyBookingStatus(req, res) {
  try {
    const userId = req.sessionUserId || req.sessionUser?._id;
    if (!userId) {
      return res.json({ ok: true, bookingSuspended: false });
    }
    const user = await User.findById(userId).select('bookingSuspended').lean();
    return res.json({ ok: true, bookingSuspended: user?.bookingSuspended === true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── POST /api/client/bookings ─────────────────────────────────────────────

export async function createBooking(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'Authentification requise.' });

  try {
    const user = await User.findById(userId).select('bookingSuspended').lean();
    if (user?.bookingSuspended) {
      return res.status(403).json({
        ok: false,
        code: 'BOOKING_SUSPENDED',
        error: 'Votre compte est suspendu suite à des absences répétées. Contactez l\'institut pour régulariser votre situation.'
      });
    }

    const {
      serviceId,
      practitionerId,
      startAt,
      selectedOptions = []
    } = req.body;

    if (!serviceId || !practitionerId || !startAt) {
      return res.status(400).json({ ok: false, error: 'serviceId, practitionerId et startAt sont requis.' });
    }

    if (!validateObjectId(serviceId) || !validateObjectId(practitionerId)) {
      return res.status(400).json({ ok: false, error: 'Identifiants invalides.' });
    }

    const service = await Service.findById(serviceId).lean();
    if (!service || !service.isActive || !service.isBookable) {
      return res.status(404).json({ ok: false, error: 'Prestation introuvable ou non réservable.' });
    }

    const practitioner = await PractitionerProfile.findById(practitionerId).lean();
    if (!practitioner || !practitioner.isActive) {
      return res.status(404).json({ ok: false, error: 'Praticienne introuvable.' });
    }

    if (!practitioner.serviceIds?.some(id => String(id) === String(serviceId))) {
      return res.status(400).json({ ok: false, error: 'Cette praticienne ne propose pas cette prestation.' });
    }

    const startDate = new Date(startAt);
    if (Number.isNaN(startDate.getTime())) {
      return res.status(400).json({ ok: false, error: 'Date de début invalide.' });
    }

    const endDate = new Date(startDate.getTime() + service.duration * 60 * 1000);

    // Validate and price selected options
    const normalizedOptions = [];
    let optionsTotal = 0;
    for (const sel of selectedOptions) {
      const opt = (service.options || []).find(o => String(o._id) === String(sel.optionId) && o.isActive);
      if (!opt) continue;
      normalizedOptions.push({ optionId: opt._id, name: opt.name, price: opt.price });
      optionsTotal += opt.price;
    }

    // Compute prices — E1 : promotion via la source unique Promotion (plus de legacy).
    const { unitPrice: effectiveServicePrice } = await resolveEffectiveServiceUnitPrice(service);

    const totalPrice = roundToCents(effectiveServicePrice + optionsTotal);
    const depositAmount = (() => {
      if (service.paymentType === 'deposit') {
        if (service.depositType === 'percentage') return roundToCents(totalPrice * service.depositValue / 100);
        return roundToCents(Math.min(service.depositValue, totalPrice));
      }
      return 0;
    })();

    // Waiver snapshot
    const now = new Date();
    const daysBeforeService = (startDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    const waiverType = (() => {
      const legalNeeded = daysBeforeService < 14;
      const institutNeeded = daysBeforeService < service.cancellationDays;
      if (legalNeeded && institutNeeded) return 'both';
      if (legalNeeded) return 'legal';
      if (institutNeeded) return 'institut';
      return null;
    })();

    const { booking } = await createServiceBookingWithProtection({
      bookingData: {
        serviceId: service._id,
        practitionerId: practitioner._id,
        clientId: userId,
        bookingId: buildBookingId(),
        startAt: startDate,
        endAt: endDate,
        selectedOptions: normalizedOptions,
        totalPrice,
        depositAmount,
        paymentType: service.paymentType,
        paymentStatus: 'pending',
        status: 'pending_payment',
        consumerWaiverSnapshot: {
          refundDays: service.cancellationDays,
          retractationDays: 14,
          waiverType,
          waiverAcceptedAt: null
        }
      },
      service,
      now
    });

    // Free service → create Sale immediately
    if (service.paymentType === 'free') {
      const user = await User.findById(userId).select('firstName lastName email').lean();
      const saleItems = [
        {
          type: 'service',
          itemId: service._id,
          name: service.name,
          basePrice: service.price,
          finalPrice: 0,
          price: 0
        },
        ...normalizedOptions.map(opt => ({
          type: 'service-option',
          itemId: opt.optionId,
          name: opt.name,
          basePrice: opt.price,
          finalPrice: 0,
          price: 0
        }))
      ];

      const sale = new Sale({
        saleId: buildSaleId(),
        userId,
        customer: {
          firstName: user?.firstName || '',
          lastName: user?.lastName || '',
          email: user?.email || ''
        },
        items: saleItems,
        totalAmount: 0,
        itemCount: saleItems.length,
        accepted_cgv: true,
        client_ip: extractClientIp(req)
      });
      const savedSale = await sale.save();
      await ServiceBooking.findByIdAndUpdate(booking._id, {
        saleId: savedSale.saleId,
        paymentStatus: 'paid'
      });
      void runPostSaleSideEffects(savedSale);
      const clientForNotif = await User.findById(userId).select('firstName lastName email').lean();
      const notifClientName = [clientForNotif?.firstName, clientForNotif?.lastName].filter(Boolean).join(' ') || clientForNotif?.email || '—';
      void triggerNotification('booking_created', {
        clientName: notifClientName,
        serviceName: service.name,
        bookingDate: formatDateFR(booking.startAt),
        bookingTime: formatTimeFR(booking.startAt),
        userId: String(practitioner?._id || ''),
        link: '/gestion.html?page=planning',
        linkLabel: 'Voir le planning'
      });
      return res.status(201).json({
        ok: true,
        booking: serializeBooking({ ...booking.toObject(), saleId: savedSale.saleId }, service, practitioner),
        paymentRequired: false
      });
    }

    return res.status(201).json({
      ok: true,
      booking: serializeBooking(booking.toObject(), service, practitioner),
      paymentRequired: true,
      bookingId: booking.bookingId,
      totalPrice,
      depositAmount,
      paymentType: service.paymentType
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ ok: false, code: error.code || null, error: error.message });
    }
    console.error('createBooking error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── GET /api/client/bookings ──────────────────────────────────────────────

export async function listMyBookings(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'Authentification requise.' });

  try {
    const bookings = await ServiceBooking.find({ clientId: userId })
      .sort({ startAt: -1 })
      .lean();

    const serviceIds = [...new Set(bookings.map(b => String(b.serviceId)))];
    const practitionerIds = [...new Set(bookings.map(b => String(b.practitionerId)))];

    const [services, practitioners] = await Promise.all([
      Service.find({ _id: { $in: serviceIds } }).lean(),
      PractitionerProfile.find({ _id: { $in: practitionerIds } }).lean()
    ]);

    const serviceMap = new Map(services.map(s => [String(s._id), s]));
    const practMap = new Map(practitioners.map(p => [String(p._id), p]));

    const result = bookings.map(b =>
      serializeBooking(b, serviceMap.get(String(b.serviceId)), practMap.get(String(b.practitionerId)))
    );

    return res.json({ ok: true, bookings: result });
  } catch (error) {
    console.error('listMyBookings error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── POST /api/client/bookings/:bookingId/cancel ───────────────────────────

export async function cancelMyBooking(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'Authentification requise.' });

  try {
    const { bookingId } = req.params;
    const booking = await ServiceBooking.findOne({ bookingId, clientId: userId })
      .populate('serviceId practitionerId clientId').lean();

    if (!booking) return res.status(404).json({ ok: false, error: 'Réservation introuvable.' });
    if (booking.status === 'cancelled') return res.status(400).json({ ok: false, error: 'Déjà annulée.' });
    if (new Date(booking.startAt) <= new Date()) {
      return res.status(409).json({ ok: false, error: 'Impossible d\'annuler une prestation passée.' });
    }

    // 1. Fetch sale for eligibility check (provides purchase date)
    let sale = booking.saleId
      ? await Sale.findOne({ saleId: String(booking.saleId) }).lean()
      : null;

    // 2. Calculate eligibility BEFORE cancelling
    const eligibility = getServiceRefundEligibility({ sale, booking, now: new Date() });

    // 3. Cancel
    await ServiceBooking.findByIdAndUpdate(booking._id, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledBy: 'client'
    });
    await releaseServiceBookingSlotLocks({ bookingId: booking.bookingId }).catch(() => {});
    // Audit-only event (best-effort, no side effect).
    await emitBookingEvent('booking.cancelled', { ...booking, status: 'cancelled' }, { extra: { cancelledBy: 'client' } });

    // Notification annulation client
    void triggerNotification('booking_cancelled_client', {
      clientName: [booking.clientId?.firstName, booking.clientId?.lastName].filter(Boolean).join(' ') || booking.clientId?.email || '—',
      serviceName: booking.serviceId?.name || '—',
      bookingDate: formatDateFR(booking.startAt),
      userId: String(booking.practitionerId?._id || booking.practitionerId || ''),
      link: '/gestion.html?page=planning',
      linkLabel: 'Voir le planning'
    });

    // 4. RefundRequest if eligible
    let refundRequest = null;
    if (eligibility.eligibleRefund && sale && Number(sale.totalAmount) > 0) {
      const saleItem = Array.isArray(sale.items)
        ? sale.items.find(it => it.type === 'service')
        : null;
      try {
        const refundPayload = {
          refundId: buildRefundId(),
          saleId: String(sale.saleId),
          userId: booking.clientId?._id || booking.clientId,
          itemId: saleItem?.itemId || booking.serviceId?._id || booking.serviceId,
          itemType: 'service',
          amount: Number(sale.totalAmount),
          currency: 'EUR',
          status: 'requested',
          reason: 'client_cancel_presentiel',
          clientIp: extractClientIp(req),
          purchaseAcceptedText: resolveSaleAcceptedText(sale),
          eligibleRefund: true,
          sessionStartAt: booking.startAt || null,
          meta: {
            notes: 'Annulation client',
            formationTitle: booking.serviceId?.name || '',
            saleCreatedAt: sale.createdAt || null
          }
        };
        await applyRefundExecutionCap({
          refundRequest: refundPayload,
          sale,
          logPrefix: '[cancelMyBooking]'
        });
        const createdRefund = await createRefundRequestOnce(refundPayload);
        refundRequest = createdRefund.refundRequest;
        if (createdRefund.created) {
          const { triggerRefundExecution } = await import('../services/refundExecutionService.js');
          try {
            await triggerRefundExecution(refundRequest, sale);
            refundRequest = await RefundRequest.findById(refundRequest._id).lean() || refundRequest;
          } catch (refundErr) {
            console.error('[cancelMyBooking] triggerRefundExecution error', refundErr.message);
          }
        }
      } catch (createErr) {
        console.error('[cancelMyBooking] createRefundRequestOnce error', createErr.message);
      }
    }

    const refundAmountEuros = Number(sale?.totalAmount || 0);

    // 5. Send cancellation email to client
    try {
      const { sendBookingCancelledEmail } = await import('../services/mailService.js');
      await sendBookingCancelledEmail({
        booking,
        eligibleRefund: eligibility.eligibleRefund,
        refundAmount: refundAmountEuros,
        refundRequest,
        waiverSigned: eligibility.waiverSigned
      });
    } catch (emailErr) {
      console.error('[cancelMyBooking] email error', emailErr.message);
    }

    // 6. Notify admin users of client cancellation
    try {
      const { sendBookingCancelledNotifyAdminEmail } = await import('../services/mailService.js');
      await sendBookingCancelledNotifyAdminEmail({
        booking,
        eligibleRefund: eligibility.eligibleRefund,
        refundAmount: refundAmountEuros,
        refundRequest
      });
    } catch (adminEmailErr) {
      console.error('[cancelMyBooking] admin email error', adminEmailErr.message);
    }

    return res.json({
      ok: true,
      eligibleRefund: eligibility.eligibleRefund,
      reason: eligibility.reason,
      refundAmount: refundAmountEuros
    });
  } catch (error) {
    console.error('cancelMyBooking error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── GET /api/client/bookings/:bookingId/refund-eligibility ───────────────

export async function getBookingRefundEligibility(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'Non authentifié.' });
  try {
    const { bookingId } = req.params;
    const booking = await ServiceBooking.findOne({ bookingId, clientId: userId })
      .populate('serviceId').lean();
    if (!booking) return res.status(404).json({ ok: false, error: 'Réservation introuvable.' });

    const sale = booking.saleId
      ? await Sale.findOne({ saleId: String(booking.saleId) }).select('totalAmount createdAt').lean()
      : null;

    const eligibility = getServiceRefundEligibility({ sale, booking, now: new Date() });

    const now = new Date();
    const daysBeforeService = booking.startAt
      ? (new Date(booking.startAt).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      : 0;
    const cancellationDays = booking.consumerWaiverSnapshot?.refundDays
      ?? booking.serviceId?.cancellationDays
      ?? 7;

    return res.json({
      ok: true,
      eligibleRefund: eligibility.eligibleRefund,
      reason: eligibility.reason,
      waiverSigned: eligibility.waiverSigned,
      refundAmount: Number(sale?.totalAmount || 0),
      daysBeforeService: Math.floor(daysBeforeService),
      cancellationDays
    });
  } catch (err) {
    console.error('getBookingRefundEligibility error', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ─── POST /api/client/bookings/:bookingId/confirm-payment ─────────────────
// Called after successful Stripe payment for a service booking

export async function confirmBookingPayment(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'Authentification requise.' });

  try {
    const { bookingId } = req.params;
    const { paymentIntentId, waiverAcceptedAt } = req.body;

    const booking = await ServiceBooking.findOne({ bookingId, clientId: userId });
    if (!booking) return res.status(404).json({ ok: false, error: 'Réservation introuvable.' });

    if (waiverAcceptedAt) {
      booking.consumerWaiverSnapshot.waiverAcceptedAt = new Date(waiverAcceptedAt);
    }
    if (paymentIntentId) {
      booking.stripePaymentIntentId = paymentIntentId;
    }
    await booking.save();

    return res.json({ ok: true });
  } catch (error) {
    console.error('confirmBookingPayment error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── GET /api/client/bookings/:bookingId/status ────────────────────────────

export async function getBookingStatus(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'Authentification requise.' });

  try {
    const { bookingId } = req.params;
    const booking = await ServiceBooking.findOne({ bookingId, clientId: userId })
      .select('status paymentStatus bookingId')
      .lean();
    if (!booking) return res.status(404).json({ ok: false, error: 'Réservation introuvable.' });
    return res.json({ ok: true, status: booking.status, paymentStatus: booking.paymentStatus });
  } catch (error) {
    console.error('getBookingStatus error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── GET /api/client/bookings/by-payment-intent/:paymentIntentId ──────────

export async function getBookingByPaymentIntent(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'Authentification requise.' });

  try {
    const { paymentIntentId } = req.params;
    if (!paymentIntentId) return res.status(400).json({ ok: false, error: 'paymentIntentId manquant.' });

    const booking = await ServiceBooking.findOne({
      stripePaymentIntentId: paymentIntentId,
      clientId: userId
    }).select('bookingId status paymentStatus startAt endAt').lean();

    return res.json({
      ok: true,
      booking: booking
        ? {
            bookingId: booking.bookingId,
            status: booking.status,
            paymentStatus: booking.paymentStatus,
            startAt: booking.startAt,
            endAt: booking.endAt
          }
        : null
    });
  } catch (error) {
    console.error('getBookingByPaymentIntent error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── GET /api/client/bookings/:bookingId/invoice ───────────────────────────

export async function getBookingInvoice(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) return res.status(401).json({ ok: false, error: 'Authentification requise.' });

  try {
    const { bookingId } = req.params;
    const booking = await ServiceBooking.findOne({ bookingId, clientId: userId })
      .select('saleId')
      .lean();
    if (!booking) return res.status(404).json({ ok: false, error: 'Réservation introuvable.' });
    if (!booking.saleId) return res.status(404).json({ ok: false, pdfUrl: null });

    const invoice = await Invoice.findOne({ saleId: booking.saleId })
      .select('stripeInvoicePdfUrl stripeInvoiceNumber')
      .lean();

    if (!invoice?.stripeInvoicePdfUrl) {
      return res.status(404).json({ ok: false, pdfUrl: null });
    }

    return res.json({
      ok: true,
      pdfUrl: invoice.stripeInvoicePdfUrl,
      invoiceNumber: invoice.stripeInvoiceNumber || null
    });
  } catch (error) {
    console.error('getBookingInvoice error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── GET /api/gestion/bookings/:bookingId/detail ───────────────────────────

export async function getBookingDetail(req, res) {
  try {
    const { bookingId } = req.params;
    const booking = await ServiceBooking.findOne({ bookingId })
      .populate('serviceId', 'name duration price cancellationDays')
      .populate('clientId', 'firstName lastName email')
      .lean();
    if (!booking) return res.status(404).json({ ok: false, error: 'Réservation introuvable.' });

    const sale = booking.saleId ? await Sale.findOne({ saleId: booking.saleId }).lean() : null;
    const refundEligibility = getServiceRefundEligibility({ sale, booking, now: new Date() });

    return res.json({ ok: true, booking, refundEligibility });
  } catch (error) {
    console.error('getBookingDetail error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── POST /api/gestion/bookings/:bookingId/no-show ─────────────────────────

export async function markNoShow(req, res) {
  const adminId = getSessionUserId(req);
  try {
    const { bookingId } = req.params;
    const booking = await ServiceBooking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ ok: false, error: 'Réservation introuvable.' });
    if (booking.status !== 'confirmed') return res.status(409).json({ ok: false, error: 'Statut invalide pour cette action.' });

    booking.status = 'no_show';
    booking.noShowAt = new Date();
    await booking.save();
    // Audit-only event (best-effort, no side effect).
    await emitBookingEvent('booking.no_show_marked', booking);

    await NoShowRecord.create({
      clientId: booking.clientId,
      bookingId: booking._id,
      recordedBy: adminId || booking.clientId
    });

    // Check suspension threshold
    const settings = await ServiceSettings.findOne().lean();
    if (settings?.noShowSystemEnabled && settings?.noShowSuspensionThreshold > 0) {
      const count = await NoShowRecord.countDocuments({ clientId: booking.clientId });
      if (count >= settings.noShowSuspensionThreshold) {
        await User.findByIdAndUpdate(booking.clientId, { bookingSuspended: true });
        // Audit-only event (best-effort, no side effect).
        await emitBookingEvent('booking.client_suspended', booking, {
          contextType: 'user',
          contextId: String(booking.clientId || ''),
          extra: { userId: String(booking.clientId || '') }
        });
      }
    }

    try {
      const [noShowClient, noShowService] = await Promise.all([
        User.findById(booking.clientId).select('firstName lastName email').lean(),
        Service.findById(booking.serviceId).select('name').lean()
      ]);
      void triggerNotification('no_show_recorded', {
        clientName: [noShowClient?.firstName, noShowClient?.lastName].filter(Boolean).join(' ') || noShowClient?.email || '—',
        serviceName: noShowService?.name || '—',
        bookingDate: formatDateFR(booking.startAt),
        link: '/gestion.html?page=planning',
        linkLabel: 'Voir le planning'
      });
    } catch {}

    return res.json({ ok: true });
  } catch (error) {
    console.error('markNoShow error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── POST /api/gestion/bookings/:bookingId/complete ────────────────────────

export async function markCompleted(req, res) {
  try {
    const { bookingId } = req.params;
    const booking = await ServiceBooking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ ok: false, error: 'Réservation introuvable.' });
    if (booking.status !== 'confirmed') return res.status(409).json({ ok: false, error: 'Statut invalide pour cette action.' });

    booking.status = 'completed';
    await booking.save();
    return res.json({ ok: true });
  } catch (error) {
    console.error('markCompleted error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── POST /api/gestion/bookings/:bookingId/balance-paid ────────────────────
// Pré-React D3 — solde d'acompte réglé sur place (pay_on_site). Trace le règlement du
// solde : balanceDueAmount → 0, paymentStatus 'paid'. Idempotent.
export async function markBalancePaidOnSite(req, res) {
  try {
    const { bookingId } = req.params;
    const booking = await ServiceBooking.findOne({ bookingId });
    if (!booking) return res.status(404).json({ ok: false, error: 'Réservation introuvable.' });
    if (booking.paymentType !== 'deposit') {
      return res.status(409).json({ ok: false, error: 'Cette réservation n\'est pas un acompte.' });
    }
    if (booking.balanceSettlementMode !== 'pay_on_site') {
      return res.status(409).json({ ok: false, code: 'BALANCE_NO_CIRCUIT', error: 'Aucun circuit de règlement du solde.' });
    }
    if (booking.paymentStatus === 'paid' && Number(booking.balanceDueAmount || 0) <= 0) {
      return res.json({ ok: true, idempotent: true, balanceDueAmount: 0 });
    }
    booking.balanceDueAmount = 0;
    booking.paymentStatus = 'paid';
    booking.balancePaidAt = new Date();
    await booking.save();
    // Audit-only event (best-effort).
    await emitBookingEvent('booking.balance_paid_on_site', booking, {
      actorType: getSessionUserId(req) ? 'user' : 'system',
      actorId: getSessionUserId(req) ? String(getSessionUserId(req)) : null
    });
    return res.json({ ok: true, balanceDueAmount: 0, paymentStatus: 'paid' });
  } catch (error) {
    console.error('markBalancePaidOnSite error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── POST /api/gestion/bookings/:bookingId/cancel ──────────────────────────

export async function cancelBookingByAdmin(req, res) {
  try {
    const { bookingId } = req.params;
    // A4 — acteur (admin) + raison pour l'audit. Best-effort si adminId absent.
    const adminId = getSessionUserId(req);
    const adminReason = String(req.body?.reason || '').trim().slice(0, 500);
    const booking = await ServiceBooking.findOne({ bookingId })
      .populate('clientId', 'firstName lastName email')
      .populate('serviceId');
    if (!booking) return res.status(404).json({ ok: false, error: 'Réservation introuvable.' });
    if (['cancelled', 'completed', 'no_show'].includes(booking.status)) {
      return res.status(409).json({ ok: false, error: 'Impossible d\'annuler cette réservation.' });
    }

    // 1. Annuler la réservation
    booking.status = 'cancelled';
    booking.cancelledAt = new Date();
    booking.cancelledBy = 'admin';
    await booking.save();
    await releaseServiceBookingSlotLocks({ bookingId: booking.bookingId }).catch(() => {});
    // A4 — annulation admin jamais silencieuse : event d'audit avec acteur + raison.
    await emitBookingEvent('booking.cancelled', booking, {
      actorType: adminId ? 'user' : 'system',
      actorId: adminId ? String(adminId) : null,
      extra: { cancelledBy: 'admin', reason: adminReason || null }
    });

    const client = booking.clientId;
    const service = booking.serviceId;
    const saleId = String(booking.saleId || '').trim();

    // 2. Créer le flow tokenisé et envoyer l'email au client
    let flow = null;
    let flowToken = null;
    let flowError = null;

    if (client?.email) {
      try {
        const { flow: createdFlow, token } = await createOrRefreshServiceCancellationFlow({
          booking: booking.toObject(),
          serviceId: booking.serviceId?._id || booking.serviceId,
          userId: booking.clientId?._id || booking.clientId,
          clientEmail: String(client.email || '').trim(),
          saleId,
          serviceDoc: service && typeof service.toObject === 'function' ? service.toObject() : service
        });
        flow = createdFlow;
        flowToken = token;

        const startAt = booking.startAt ? new Date(booking.startAt) : null;
        const bookingDate = startAt
          ? startAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : '';
        const bookingTime = startAt
          ? startAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : '';

        await notifyServiceCancellationChoiceForFlow({
          flow,
          token: flowToken,
          serviceName: String(service?.name || 'Prestation').trim(),
          firstName: String(client.firstName || '').trim(),
          bookingDate,
          bookingTime,
          autoRefundDays: SESSION_CANCELLATION_TOKEN_TTL_DAYS
        });
      } catch (flowErr) {
        console.error('[cancelBookingByAdmin] flow/email error', flowErr.message);
        flowError = flowErr.message;
      }
    }

    return res.json({
      ok: true,
      flowCreated: Boolean(flow),
      flowId: flow?.flowId || null,
      flowError: flowError || null
    });
  } catch (error) {
    console.error('cancelBookingByAdmin error', error);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── POST /api/gestion/bookings/simulate-reminders ────────────────────────

export async function simulateReminders(req, res) {
  try {
    const { sendBookingReminderEmail } = await import('../services/mailService.js');

    const targetDate = req.body.date
      ? new Date(req.body.date + 'T00:00:00.000Z')
      : new Date();

    const dayStart = new Date(targetDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setUTCHours(23, 59, 59, 999);

    const bookings = await ServiceBooking.find({
      status: 'confirmed',
      startAt: { $gte: dayStart, $lte: dayEnd }
    }).populate('serviceId clientId practitionerId').lean();

    let sent = 0;
    let failed = 0;

    for (const booking of bookings) {
      try {
        await sendBookingReminderEmail({ booking, hoursAhead: 24 });
        sent++;
        // NE PAS mettre à jour remindersSent — simulation uniquement
      } catch (err) {
        console.error('[SimulateReminders] Echec email:', booking.bookingId, err.message);
        failed++;
      }
    }

    return res.json({
      ok: true,
      date: targetDate.toISOString().slice(0, 10),
      total: bookings.length,
      sent,
      failed
    });
  } catch (err) {
    console.error('[simulateReminders]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
