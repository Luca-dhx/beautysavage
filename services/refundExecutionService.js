import Stripe from 'stripe';

import Sale from '../models/Sale.js';
import GiftCard from '../models/GiftCard.js';
import GiftCardTransaction from '../models/GiftCardTransaction.js';
import SiteIdentity from '../models/SiteIdentity.js';
import User from '../models/user.js';
import ServiceBooking from '../models/ServiceBooking.js';
import { sendRefundConfirmedEmail } from './mailService.js';
import { getAppBaseUrl } from '../utils/invoiceUrl.js';

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY manquante dans .env');
  }
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function roundToCents(value) {
  const candidate = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.round(candidate * 100) / 100;
}

function roundToCentsInt(value) {
  return Math.round(Number(value || 0) * 100);
}

function buildConflictError(message) {
  const error = new Error(message);
  error.status = 409;
  return error;
}

function normalizeCurrentStatus(value) {
  return String(value || '').trim().toLowerCase();
}

async function resolveSiteNameForEmail() {
  try {
    const identity = await SiteIdentity.findOne({ key: 'global' }).lean();
    const siteName = String(identity?.siteName || '').trim();
    return siteName || 'Beauty Savage';
  } catch (_error) {
    return 'Beauty Savage';
  }
}

export async function sendRefundConfirmedEmailInternal(refundRequest) {
  try {
    const user = refundRequest?.userId ? await User.findById(refundRequest.userId).lean() : null;
    const toEmail = String(user?.email || '').trim();
    if (!toEmail) return;

    const trackingUrl = refundRequest?.trackingToken
      ? `${getAppBaseUrl()}/vitrine.html?page=refund-tracking&token=${refundRequest.trackingToken}`
      : '';
    const siteName = await resolveSiteNameForEmail();

    const isService = refundRequest?.itemType === 'service';
    let itemDetail = '';
    let serviceName = '';
    let bookingDateStr = '';
    let bookingTimeStr = '';
    let practitionerName = '';
    let booking = null;

    if (isService) {
      try {
        booking = await ServiceBooking.findOne({ saleId: String(refundRequest.saleId || '') })
          .populate('serviceId')
          .populate('practitionerId', 'displayName')
          .lean();
        serviceName = booking?.serviceId?.name || '';
        practitionerName = booking?.practitionerId?.displayName || '';
        const startAt = booking?.startAt ? new Date(booking.startAt) : null;
        bookingDateStr = startAt
          ? startAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : '';
        bookingTimeStr = startAt
          ? startAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
          : '';
        itemDetail = serviceName
          ? `${serviceName}${bookingDateStr ? ' — ' + bookingDateStr : ''}${bookingTimeStr ? ' à ' + bookingTimeStr : ''}`
          : '';
      } catch (lookupErr) {
        console.error('[sendRefundConfirmedEmailInternal] ServiceBooking lookup error', lookupErr.message);
      }
    } else {
      const formationTitle = String(refundRequest?.meta?.formationTitle || '').trim();
      itemDetail = formationTitle;
    }

    const templateName = isService ? 'refund_confirmed_service' : 'refund_confirmed';

    // TODO: remove after debug
    console.log('[DEBUG refund template]', {
      itemType: refundRequest.itemType,
      templateName,
      bookingFound: !!booking,
      serviceName: booking?.serviceId?.name || '(empty)',
      refundAmountCents: refundRequest.amount,
    });

    await sendRefundConfirmedEmail({
      toEmail,
      siteName,
      firstName: String(user?.firstName || '').trim(),
      lastName: String(user?.lastName || '').trim(),
      formationName: isService ? '' : String(refundRequest?.meta?.formationTitle || '').trim(),
      itemDetail,
      isService,
      serviceName,
      bookingDate: bookingDateStr,
      bookingTime: bookingTimeStr,
      practitionerName,
      amount: Number(refundRequest?.amount || 0),
      refundId: String(refundRequest?.refundId || '').trim(),
      refundedAt: refundRequest?.refundedAt
        ? new Date(refundRequest.refundedAt).toLocaleString('fr-FR')
        : '',
      giftCardRecredited: Boolean(refundRequest?.giftCardRecredited),
      giftCardRecreditAmount: Number(refundRequest?.giftCardRecreditAmount || 0),
      trackingUrl
    });
  } catch (error) {
    console.error('[triggerRefundExecution] Erreur envoi email refund_confirmed', error);
  }
}

async function recreditGiftCardPortion(sale, amountEur) {
  const normalizedSaleId = String(sale?.saleId || '').trim();
  let usages = Array.isArray(sale?.giftCardUsage)
    ? sale.giftCardUsage.filter(entry => entry?.giftCardId && Number(entry?.amountUsed || 0) > 0)
    : [];
  if (!usages.length && normalizedSaleId) {
    const fallbackRedeems = await GiftCardTransaction.find({
      saleId: normalizedSaleId,
      transactionType: 'redeem'
    })
      .select({ giftCardId: 1, amount: 1 })
      .lean();
    const usageByCardId = new Map();
    for (const tx of fallbackRedeems) {
      const cardId = String(tx?.giftCardId || '').trim();
      const amount = roundToCents(Number(tx?.amount || 0));
      if (!cardId || amount <= 0) continue;
      usageByCardId.set(cardId, roundToCents((usageByCardId.get(cardId) || 0) + amount));
    }
    usages = Array.from(usageByCardId.entries()).map(([giftCardId, amountUsed]) => ({
      giftCardId,
      amountUsed
    }));
  }

  const refundNote = normalizedSaleId
    ? `Remboursement de vente ${normalizedSaleId}`
    : 'Remboursement carte cadeau';
  let remaining = roundToCents(amountEur);
  for (const usage of usages) {
    if (remaining <= 0) break;
    const portion = roundToCents(Math.min(remaining, Number(usage?.amountUsed || 0)));
    if (portion <= 0) continue;
    if (!usage?.giftCardId) {
      throw new Error('Gift card usage without giftCardId.');
    }

    const card = await GiftCard.findById(usage.giftCardId);
    if (!card) {
      throw new Error(`Gift card not found: ${String(usage.giftCardId)}`);
    }
    const balanceBefore = roundToCents(Number(card.balance || 0));
    card.balance = roundToCents(balanceBefore + portion);
    card.status = 'active';
    await card.save();
    const balanceAfter = roundToCents(Number(card.balance || 0));

    try {
      await GiftCardTransaction.create({
        giftCardId: card._id,
        transactionType: 'credit',
        userId: card.userId,
        actorRole: 'system',
        amount: portion,
        balanceBefore,
        balanceAfter,
        saleId: normalizedSaleId,
        note: refundNote,
        items: []
      });
    } catch (transactionError) {
      card.balance = balanceBefore;
      card.status = balanceBefore > 0 ? 'active' : 'redeemed';
      await card.save().catch(() => {});
      throw transactionError;
    }

    remaining = roundToCents(remaining - portion);
  }
  if (remaining > 0) {
    throw new Error(`Gift card recredit incomplete. Remaining=${remaining}`);
  }
}

export async function triggerRefundExecution(refundRequest, saleInput = null) {
  if (!refundRequest) {
    throw new Error('RefundRequest manquant.');
  }

  const currentStatus = normalizeCurrentStatus(refundRequest.status);
  const currentStripeStatus = normalizeCurrentStatus(refundRequest.stripeRefundStatus);

  if (currentStatus === 'succeeded') {
    return { refund: refundRequest, mode: 'already_succeeded', stripeInitiated: false };
  }
  if (currentStatus === 'pending' && currentStripeStatus === 'pending' && refundRequest.stripeRefundId) {
    return { refund: refundRequest, mode: 'already_pending', stripeInitiated: true };
  }

  const sale =
    saleInput && typeof saleInput === 'object'
      ? saleInput
      : await Sale.findOne({ saleId: String(refundRequest.saleId || '').trim() }).lean();

  if (!sale) {
    throw buildConflictError('Vente introuvable pour ce remboursement.');
  }

  const saleTotal = roundToCents(sale?.totalAmount || 0);
  const hasGiftCardUsage = Array.isArray(sale?.giftCardUsage) && sale.giftCardUsage.length > 0;
  let giftCardTotal = roundToCents(
    hasGiftCardUsage
      ? sale.giftCardUsage.reduce((sum, usage) => sum + Number(usage?.amountUsed || 0), 0)
      : 0
  );
  const normalizedStripePaymentIntentId = String(sale?.stripePaymentIntentId || '').trim();
  if (!giftCardTotal && !hasGiftCardUsage && normalizedStripePaymentIntentId) {
    const normalizedSaleId = String(sale?.saleId || '').trim();
    if (normalizedSaleId) {
      const fallbackGiftTransactions = await GiftCardTransaction.find({
        saleId: normalizedSaleId,
        transactionType: 'redeem'
      })
        .select({ amount: 1 })
        .lean();
      const fallbackGiftCardTotal = roundToCents(
        fallbackGiftTransactions.reduce((sum, tx) => sum + Number(tx?.amount || 0), 0)
      );
      if (fallbackGiftCardTotal > 0) {
        giftCardTotal = fallbackGiftCardTotal;
        console.warn('[triggerRefundExecution] Fallback split depuis GiftCardTransaction', {
          saleId: normalizedSaleId,
          giftCardTotal
        });
      }
    }
  }
  giftCardTotal = roundToCents(Math.min(saleTotal, Math.max(0, giftCardTotal)));
  const stripeTotal = Math.max(0, saleTotal - giftCardTotal);
  const refundAmountEur = roundToCents(refundRequest.amount || 0);
  const giftCardRefundAmountEur = roundToCents(Math.min(refundAmountEur, giftCardTotal));
  const stripeRefundAmountEur = roundToCents(
    Math.min(stripeTotal, Math.max(0, refundAmountEur - giftCardRefundAmountEur))
  );
  const hasStripePortion = stripeRefundAmountEur > 0;
  const hasGiftCardPortion = giftCardRefundAmountEur > 0;

  refundRequest.stripeRefundAmount = hasStripePortion ? stripeRefundAmountEur : null;
  refundRequest.giftCardRefundAmount = hasGiftCardPortion ? giftCardRefundAmountEur : null;

  if (!hasStripePortion && hasGiftCardPortion) {
    await recreditGiftCardPortion(sale, giftCardRefundAmountEur);
    const now = new Date();
    refundRequest.status = 'succeeded';
    refundRequest.stripeRefundStatus = 'not_applicable';
    refundRequest.giftCardRefundStatus = 'succeeded';
    refundRequest.refundedAt = now;
    refundRequest.processedAt = now;
    refundRequest.giftCardRecredited = true;
    refundRequest.giftCardRecreditAmount = giftCardRefundAmountEur;
    await refundRequest.save();
    await sendRefundConfirmedEmailInternal(refundRequest);
    return { refund: refundRequest, mode: 'gift_card_only', stripeInitiated: false };
  }

  if (hasStripePortion) {
    if (!sale?.stripePaymentIntentId) {
      throw buildConflictError('Remboursement Stripe impossible: transaction introuvable.');
    }
    const stripe = getStripe();
    const stripeRefundAmountCents = roundToCentsInt(stripeRefundAmountEur);
    const stripeRefund = await stripe.refunds.create({
      payment_intent: sale.stripePaymentIntentId,
      amount: stripeRefundAmountCents
    });

    refundRequest.stripeRefundId = String(stripeRefund.id || '');
    refundRequest.stripeRefundStatus = 'pending';
    refundRequest.giftCardRefundStatus = hasGiftCardPortion ? 'pending' : 'not_applicable';
    refundRequest.status = 'pending';
    refundRequest.processedAt = null;
    refundRequest.refundedAt = null;
    refundRequest.giftCardRecredited = false;
    refundRequest.giftCardRecreditAmount = hasGiftCardPortion ? giftCardRefundAmountEur : null;
    await refundRequest.save();

    return { refund: refundRequest, mode: 'stripe_pending', stripeInitiated: true };
  }

  throw buildConflictError('Aucune operation financiere applicable pour ce remboursement.');
}
