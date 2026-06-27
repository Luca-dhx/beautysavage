import mongoose from 'mongoose';
import argon2 from 'argon2';

import Product from '../models/Product.js';
import Formation from '../models/Formation.js';
import Service from '../models/Service.js';
import ServiceBooking from '../models/ServiceBooking.js';
import PractitionerProfile from '../models/PractitionerProfile.js';
import FormationModule from '../models/FormationModule.js';
import FormationSession, {
  buildActiveFormationSessionFilter,
  isInactiveFormationSessionStatus
} from '../models/FormationSession.js';
import Purchase from '../models/Purchase.js';
import User from '../models/user.js';
import CartSnapshot from '../models/CartSnapshot.js';
import Sale from '../models/Sale.js';
import RefundRequest from '../models/RefundRequest.js';
import Review from '../models/Review.js';
import Favorite from '../models/Favorite.js';
import GiftCard from '../models/GiftCard.js';
import GiftCardTransaction from '../models/GiftCardTransaction.js';
import Invoice from '../models/Invoice.js';
import { recordCommissionTransactions } from '../services/commissionService.js';
import {
  calculateFinalPrice,
  getActivePromotion,
  getActivePromotionsForTargets
} from '../services/promotionService.js';
import {
  sendClientSessionCancellationEmail,
  sendInstituteClientCancelledNoticeEmail,
  sendSaleEmail
} from '../services/mailService.js';
import { createStripeInvoiceForSale } from '../services/stripeInvoiceService.js';
import { emitSaleEvent, emitBookingEvent } from '../services/businessEventService.js';
import { getSessionUserId } from '../utils/session.js';
import { extractClientIp } from '../utils/requestClientIp.js';
import { validateAndBuildConsumerWaiver } from '../utils/consumerWaiver.js';
import {
  deriveLegalRequirements,
  validateCheckoutLegalConsents,
  buildLegalConsentSnapshot
} from '../services/legalConsentService.js';
import {
  assertCheckoutFormationsPurchasable,
  resolveAccessDeliveryStatusForFormation
} from '../services/offerReadinessService.js';
import { buildTaxSnapshot } from '../constants/tax.js';
import { buildServerCheckoutPricing } from '../services/checkoutPricingService.js';
import { getAppBaseUrl } from '../utils/invoiceUrl.js';
import { buildModulePayload } from './formationModuleController.js';
import { buildSessionPayload } from './formationSessionController.js';
import {
  REFUND_REASON_CLIENT_CANCEL_PRESENTIEL,
  buildRefundId,
  getPresentielRefundEligibility,
  resolveSaleForFormationPurchase,
  resolveSaleAcceptedText,
  ensureRefundCommissionProvision
} from '../services/refundService.js';
import { triggerRefundExecution } from '../services/refundExecutionService.js';
import {
  applyRefundExecutionCap,
  createRefundRequestOnce,
  findActiveRefundRequestForSaleItem
} from '../services/refundRequestService.js';
import {
  formatSessionDateLabel,
  formatSessionTimeLabel,
  resolveSiteName
} from '../services/sessionCancellationFlowService.js';
import { triggerNotification } from '../services/notificationService.js';
import {
  computeAvailableGiftCardBalance,
  releaseGiftCardReservationsForPaymentIntent,
  debitGiftCardBalanceAtomic,
  recreditGiftCardBalanceAtomic
} from '../services/giftCardReservationService.js';
import crypto from 'node:crypto';
import { isActiveRefundRequestStatus } from '../constants/refundRequest.js';
import { createServiceBookingWithProtection } from '../services/serviceAvailabilityService.js';

function serializeItem(item) {
  if (!item) return null;
  return {
    id: item._id?.toString(),
    name: item.name,
    active: Boolean(item.active),
    createdAt: item.createdAt
  };
}

function serializeFormation(formation) {
  if (!formation) return null;
  const parsedRefundDays = Number(formation.refundDays);
  return {
    id: formation._id?.toString(),
    name: formation.name,
    description: formation.description || '',
    formalities: formation.formalities || '',
    durationDays: formation.durationDays || 1,
    refundDays: Number.isFinite(parsedRefundDays) ? Math.max(0, parsedRefundDays) : 7,
    type: formation.type,
    status: formation.status,
    price: formation.price,
    coverImage: formation.coverImage,
    whatsappGroupUrl: formation.whatsappGroupUrl || null,
    createdAt: formation.createdAt
  };
}

function serializeProduct(product) {
  if (!product) return null;
  return {
    id: product._id?.toString(),
    name: product.name,
    description: product.description || '',
    price: Number(product.price || 0),
    coverImage: product.coverImage || '',
    photos: Array.isArray(product.photos) ? product.photos : [],
    trailerVideoUrl: product.trailerVideoUrl || '',
    createdAt: product.createdAt
  };
}

function serializePurchasePayload(purchase, formation, session, product) {
  return {
    id: purchase._id?.toString(),
    formationId: purchase.formationId?.toString(),
    sessionId: purchase.sessionId?.toString(),
    paymentProvider: purchase.paymentProvider,
    paymentStatus: purchase.paymentStatus,
    paymentRef: purchase.paymentRef,
    saleId: String(purchase.saleId || '').trim(),
    participationStatus: String(purchase.participationStatus || 'active').trim() || 'active',
    canceledAt: purchase.canceledAt || null,
    cancellationReason: String(purchase.cancellationReason || '').trim(),
    cancellationEligibleRefund: Boolean(purchase.cancellationEligibleRefund),
    cancellationSessionStartAt: purchase.cancellationSessionStartAt || null,
    refundRequestId: String(purchase.refundRequestId || '').trim(),
    createdAt: purchase.createdAt,
    formation: serializeFormation(formation),
    session: session ? buildSessionPayload(session) : null,
    product: serializeProduct(product)
  };
}

function buildCustomerProfile(user) {
  return {
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    email: user?.email || ''
  };
}

async function collectAdminEmails() {
  const admins = await User.find({ role: 'admin' }).select('email').lean();
  const seen = new Set();
  const emails = [];
  for (const admin of admins) {
    const email = String(admin?.email || '').trim();
    const key = email.toLowerCase();
    if (!email || seen.has(key)) continue;
    seen.add(key);
    emails.push(email);
  }
  return emails;
}

const NAME_MAX_LENGTH = 64;

function sanitizeProfileName(value) {
  return String(value || '').trim().slice(0, NAME_MAX_LENGTH);
}

export async function updateProfile(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const updates = {};
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'firstName')) {
    updates.firstName = sanitizeProfileName(req.body.firstName);
  }
  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'lastName')) {
    updates.lastName = sanitizeProfileName(req.body.lastName);
  }
  if (!Object.keys(updates).length) {
    return res.status(400).json({ ok: false, error: 'Aucun champ valide pour la mise ÃƒÂ  jour.' });
  }
  try {
    const updated = await User.findByIdAndUpdate(userId, updates, { new: true }).lean();
    if (!updated) {
      return res.status(404).json({ ok: false, error: 'Utilisateur introuvable.' });
    }
    return res.json({
      ok: true,
      user: {
        firstName: updated.firstName || '',
        lastName: updated.lastName || '',
        email: updated.email || ''
      }
    });
  } catch (error) {
    console.error('Erreur mise ÃƒÂ  jour profil client', error);
    return res.status(500).json({ ok: false, error: 'Impossible de mettre ÃƒÂ  jour votre profil.' });
  }
}

function buildSaleId() {
  const suffix = crypto.randomUUID().split('-')[0];
  return `SALE-${Date.now()}-${suffix}`;
}

function roundToCents(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function normalizeGiftCardCode(value) {
  return String(value || '').trim().toUpperCase();
}

function sanitizeGiftCardAmount(value) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.max(0, roundToCents(parsed));
}

async function deductGiftCardBalance(card, amount) {
  // Phase 1B-1: atomic conditional debit (no over-debit under concurrency).
  // Throws GIFT_CARD_BALANCE_INSUFFICIENT if the balance is no longer sufficient.
  const { balanceBefore, balanceAfter } = await debitGiftCardBalanceAtomic({
    giftCardId: card._id,
    amount
  });
  // Keep the in-memory document consistent for downstream reads (no extra save).
  card.balance = balanceAfter;
  card.status = balanceAfter > 0 ? 'active' : 'redeemed';
  return { balanceBefore, balanceAfter };
}

async function verifyGiftCardPasswordHash(card, candidatePassword) {
  const passwordHash = String(card?.passwordHash || '').trim();
  const password = String(candidatePassword || '').trim();
  if (!passwordHash || !password) return false;
  try {
    return await argon2.verify(passwordHash, password);
  } catch (_error) {
    return false;
  }
}

async function planGiftCardUsage(
  rawGiftCards,
  totalAmount,
  { requirePassword = false, reservationPaymentIntentId = null } = {}
) {
  const normalizedTotal = roundToCents(totalAmount);
  if (!normalizedTotal || !Array.isArray(rawGiftCards) || !rawGiftCards.length) {
    return { usages: [], saleEntries: [], remainingAmount: normalizedTotal };
  }
  const seenReferences = new Set();
  const requests = [];
  for (const raw of rawGiftCards) {
    const rawGiftCardId = String(raw?.giftCardId || '').trim();
    const giftCardId = validateObjectId(rawGiftCardId) ? rawGiftCardId : '';
    const code = normalizeGiftCardCode(raw?.code);
    const referenceKey = giftCardId ? `id:${giftCardId}` : code ? `code:${code}` : '';
    if (!referenceKey || seenReferences.has(referenceKey)) continue;
    seenReferences.add(referenceKey);
    const amount = sanitizeGiftCardAmount(raw?.amount);
    const password = String(raw?.password || '').trim();
    requests.push({
      giftCardId: giftCardId || null,
      code,
      amount,
      password
    });
  }
  if (!requests.length) {
    return { usages: [], saleEntries: [], remainingAmount: normalizedTotal };
  }
  const requestedGiftCardIds = requests.map(entry => entry.giftCardId).filter(Boolean);
  const requestedCodes = requests.map(entry => entry.code).filter(Boolean);
  const cardQuery = [];
  if (requestedGiftCardIds.length) {
    cardQuery.push({ _id: { $in: requestedGiftCardIds } });
  }
  if (requestedCodes.length) {
    cardQuery.push({ code: { $in: requestedCodes } });
  }
  const cards = cardQuery.length
    ? await GiftCard.find(cardQuery.length === 1 ? cardQuery[0] : { $or: cardQuery })
    : [];
  const cardById = new Map(cards.map(card => [String(card._id || '').trim(), card]));
  const cardByCode = new Map(cards.map(card => [card.code, card]));
  const usages = [];
  let remaining = normalizedTotal;
  for (const request of requests) {
    if (remaining <= 0) break;
    const card = request.giftCardId
      ? cardById.get(request.giftCardId)
      : cardByCode.get(request.code);
    const availableBalance = computeAvailableGiftCardBalance(card, {
      paymentIntentId: reservationPaymentIntentId
    });
    if (!card || card.status !== 'active' || availableBalance <= 0) {
      const error = new Error('Carte introuvable ou epuisee.');
      error.status = 404;
      throw error;
    }
    if (requirePassword && !request.password) {
      const error = new Error('Mot de passe carte cadeau requis.');
      error.status = 400;
      error.code = 'GIFT_CARD_PASSWORD_REQUIRED';
      throw error;
    }
    if (request.password) {
      const isPasswordValid = await verifyGiftCardPasswordHash(card, request.password);
      if (!isPasswordValid) {
        const error = new Error('Code ou mot de passe carte cadeau invalide.');
        error.status = 401;
        error.code = 'INVALID_GIFT_CARD_CREDENTIALS';
        throw error;
      }
    }
    const available = roundToCents(
      computeAvailableGiftCardBalance(card, { paymentIntentId: reservationPaymentIntentId })
    );
    if (available <= 0) {
      const error = new Error('Carte introuvable ou epuisee.');
      error.status = 404;
      throw error;
    }
    const desired =
      Number.isFinite(Number(request.amount)) && Number(request.amount) > 0
        ? roundToCents(request.amount)
        : available;
    const useAmount = Math.min(desired, available, remaining);
    if (useAmount <= 0) continue;
    usages.push({ card, amount: useAmount });
    remaining = roundToCents(Math.max(0, remaining - useAmount));
  }
  const saleEntries = usages.map(entry => ({
    giftCardId: entry.card._id,
    code: entry.card.code,
    amountUsed: entry.amount
  }));
  return { usages, saleEntries, remainingAmount: remaining };
}

async function finalizeGiftCardUsage({
  userId,
  saleDoc,
  saleItems,
  usages,
  paymentIntentId = null
}) {
  if (!usages?.length || !saleDoc) return;
  const items = saleItems.map(entry => ({
    type: entry.type === 'gift-card' ? 'product' : entry.type,
    itemId: entry.itemId,
    price: entry.finalPrice
  }));
  const applied = [];
  const appliedUsageEntries = [];
  try {
    for (const entry of usages) {
      const { balanceBefore, balanceAfter } = await deductGiftCardBalance(entry.card, entry.amount);
      const transaction = new GiftCardTransaction({
        giftCardId: entry.card._id,
        userId,
        amount: entry.amount,
        balanceBefore,
        balanceAfter,
        saleId: saleDoc.saleId,
        items
      });
      await transaction.save();
      applied.push({
        card: entry.card,
        balanceBefore,
        amount: entry.amount,
        transactionId: transaction._id
      });
      appliedUsageEntries.push({
        giftCardId: entry.card._id,
        code: String(entry.card.code || '').trim().toUpperCase(),
        amountUsed: roundToCents(entry.amount)
      });
    }
    const normalizedPaymentIntentId = String(paymentIntentId || '').trim();
    if (normalizedPaymentIntentId) {
      await releaseGiftCardReservationsForPaymentIntent(normalizedPaymentIntentId, {
        reason: 'payment_succeeded'
      });
    }
    if (appliedUsageEntries.length) {
      if (typeof saleDoc.save === 'function') {
        saleDoc.giftCardUsage = appliedUsageEntries;
        await saleDoc.save();
      } else if (saleDoc?._id) {
        await Sale.findByIdAndUpdate(saleDoc._id, {
          giftCardUsage: appliedUsageEntries
        });
      }
    }
  } catch (error) {
    if (applied.length) {
      await GiftCardTransaction.deleteMany({
        _id: { $in: applied.map(entry => entry.transactionId).filter(Boolean) }
      }).catch(() => {});
      await Promise.all(
        applied.map(async entry => {
          // Phase 1B-1: atomic compensating recredit (no stale-doc overwrite).
          const recredited = await recreditGiftCardBalanceAtomic({
            giftCardId: entry.card._id,
            amount: entry.amount
          });
          if (recredited) {
            entry.card.balance = recredited.balance;
            entry.card.status = recredited.status;
          }
        })
      ).catch(() => {});
    }
    throw error;
  }
}

function buildSaleEntry({ type, itemId, formationId = null, name, basePrice, promotion }) {
  const normalizedBase = Number.isFinite(Number(basePrice)) ? Number(basePrice) : 0;
  const { finalPrice } = calculateFinalPrice(normalizedBase, promotion);
  return {
    type,
    itemId: new mongoose.Types.ObjectId(itemId),
    formationId: validateObjectId(formationId) ? new mongoose.Types.ObjectId(formationId) : null,
    name: (name || '').trim(),
    basePrice: normalizedBase,
    finalPrice,
    price: finalPrice,
    promotionApplied: Boolean(promotion),
    promotionId: promotion?._id || null
  };
}

function validateAndBuildSelectedOptions(rawOptions, formation, sessionStartAt) {
  if (!Array.isArray(rawOptions) || !rawOptions.length) {
    return { selectedOptions: [], optionSaleItems: [] };
  }
  if (!formation || !Array.isArray(formation.options)) {
    return { selectedOptions: [], optionSaleItems: [] };
  }
  const now = Date.now();
  const sessionStartMs = sessionStartAt ? new Date(sessionStartAt).getTime() : 0;
  const optionMap = new Map(formation.options.map(opt => [opt._id?.toString(), opt]));
  const selectedOptions = [];
  const optionSaleItems = [];
  for (const raw of rawOptions) {
    const optionId = String(raw?.optionId || '').trim();
    if (!validateObjectId(optionId)) {
      const error = new Error('Option invalide.');
      error.status = 400;
      throw error;
    }
    const option = optionMap.get(optionId);
    if (!option) {
      const error = new Error(`Option ${optionId} introuvable sur cette formation.`);
      error.status = 400;
      throw error;
    }
    const deadlineMs = Number(option.deadlineDays || 0) * 86400000;
    if (!sessionStartMs || sessionStartMs - now <= deadlineMs) {
      const error = new Error(`L'option "${option.name}" n'est plus disponible pour cette session.`);
      error.status = 400;
      error.code = 'OPTION_DEADLINE_EXCEEDED';
      throw error;
    }
    selectedOptions.push({
      optionId: option._id,
      name: option.name || '',
      price: Number.isFinite(Number(option.price)) ? Number(option.price) : 0
    });
    optionSaleItems.push({
      type: 'formation-option',
      itemId: option._id,
      formationId: formation._id,
      name: option.name || 'Option',
      basePrice: Number.isFinite(Number(option.price)) ? Number(option.price) : 0,
      finalPrice: Number.isFinite(Number(option.price)) ? Number(option.price) : 0,
      price: Number.isFinite(Number(option.price)) ? Number(option.price) : 0,
      promotionApplied: false,
      promotionId: null
    });
  }
  return { selectedOptions, optionSaleItems };
}

function buildFormationEntryFromSale(entry) {
  if (!entry || entry.type !== 'formation') {
    return null;
  }
  return {
    formationId: entry.itemId,
    formationName: entry.name || 'Formation',
    price: Number.isFinite(Number(entry.finalPrice)) ? Number(entry.finalPrice) : 0
  };
}

function buildSaleCommissionSnapshot(commissionTransactions = []) {
  if (!Array.isArray(commissionTransactions) || !commissionTransactions.length) {
    return null;
  }
  const commissionAmount = roundToCents(
    commissionTransactions.reduce((sum, entry) => sum + Number(entry?.commissionAmount || 0), 0)
  );
  if (!Number.isFinite(commissionAmount)) {
    return null;
  }
  const percentageEntry = commissionTransactions.find(
    entry =>
      String(entry?.commissionType || '').trim().toLowerCase() === 'percentage' &&
      Number.isFinite(Number(entry?.commissionValue))
  );
  return {
    commissionRate: percentageEntry ? Number(percentageEntry.commissionValue) : null,
    commissionAmount
  };
}

async function applySaleCommissionSnapshot(saleDoc, commissionTransactions = []) {
  if (!saleDoc || !Array.isArray(commissionTransactions) || !commissionTransactions.length) {
    return;
  }
  const snapshot = buildSaleCommissionSnapshot(commissionTransactions);
  if (!snapshot) {
    return;
  }
  saleDoc.commissionRate = snapshot.commissionRate;
  saleDoc.commissionAmount = snapshot.commissionAmount;
  await saleDoc.save();
}

function normalizeSnapshotItem(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const type = entry.type === 'product' ? 'product' : 'formation';
  const itemId = entry.itemId || entry.id;
  if (!itemId) return null;
  const hasSession = entry.sessionId !== undefined && entry.sessionId !== null;
  const sessionId = hasSession ? entry.sessionId : null;
  return {
    type,
    itemId,
    name: String(entry.name || entry.label || '').trim(),
    price: Number.isFinite(Number(entry.price)) ? Number(entry.price) : 0,
    sessionId
  };
}

async function runPostSaleSideEffects(sale, { giftCardSettlement = null } = {}) {
  if (!sale) return;
  console.log('[PostSaleEffects] Demarrage pour sale:', sale._id);
  const settlement = giftCardSettlement && typeof giftCardSettlement === 'object'
    ? giftCardSettlement
    : null;
  if (settlement?.usages?.length) {
    await finalizeGiftCardUsage({
      userId: settlement.userId,
      saleDoc: sale,
      saleItems: Array.isArray(settlement.saleItems) ? settlement.saleItems : [],
      usages: settlement.usages,
      paymentIntentId: settlement.paymentIntentId || null
    });
  }
  void sendSaleEmail(sale);
  void triggerNotification('new_sale', {
    saleId: sale.saleId || '—',
    amount: typeof sale.totalAmount === 'number' ? sale.totalAmount.toFixed(2) : '—',
    link: '/gestion.html?page=ventes',
    linkLabel: 'Voir les ventes'
  });

  // Formation purchase notifications
  try {
    const formationItem = sale.items?.find(i => i.type === 'formation');
    if (formationItem?.formationId) {
      const [formation, client] = await Promise.all([
        Formation.findById(formationItem.formationId).select('type name').lean(),
        User.findById(sale.userId).select('firstName lastName email').lean()
      ]);
      const clientName = [client?.firstName, client?.lastName].filter(Boolean).join(' ') || client?.email || '—';

      if (formation?.type === 'distanciel') {
        void triggerNotification('formation_distancielle_purchased', {
          clientName,
          formationName: formation.name || '—',
          saleId: sale.saleId || '—',
          amount: typeof sale.totalAmount === 'number' ? sale.totalAmount.toFixed(2) : '—'
        });
      } else if (formation?.type === 'presentiel') {
        const purchase = await Purchase.findOne({ saleId: sale.saleId, itemType: 'formation' }).select('sessionId').lean();
        const session = purchase?.sessionId
          ? await FormationSession.findById(purchase.sessionId).lean()
          : null;
        const optionItems = sale.items?.filter(i => i.type === 'formation-option') || [];
        const sessionDate = session?.startDate
          ? new Date(session.startDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : 'Non renseignée';
        const schedule = session?.schedule?.[0];
        const sessionTime = schedule ? `${schedule.startTime} → ${schedule.endTime}` : '';
        void triggerNotification('formation_presentielle_purchased', {
          clientName,
          formationName: formation.name || '—',
          sessionDate,
          sessionTime,
          optionsCount: optionItems.length,
          saleId: sale.saleId || '—'
        });
      }
    }
  } catch (err) {
    console.error('[runPostSaleSideEffects] Formation notification error:', err?.message || err);
  }

  console.log('[Invoice] Recherche user pour sale:', sale._id, 'userId:', sale.userId);
  try {
    const user = await User.findById(sale.userId).select({
      _id: 1,
      email: 1,
      firstName: 1,
      lastName: 1,
      stripeCustomerId: 1
    }).lean();
    console.log('[Invoice] User trouve:', user ? user.email : 'NULL');
    if (user) {
      await createStripeInvoiceForSale(sale, user);
    } else {
      console.warn('[Invoice] User null - generation facture skippee');
    }
  } catch (err) {
    console.error('[Invoice] Echec generation Stripe Invoice:', err?.message || err);
  }
}

async function persistSale({
  userId,
  customer,
  items,
  giftCardUsage,
  consumerWaiver,
  clientIp,
  stripePaymentIntentId = null,
  stripeSessionId = null,
  skipPostSaleSideEffects = false,
  legalConsentSnapshot = null,
  accessDeliveryStatus = null,
  accessGrantedAt = null
}) {
  if (!userId || !items?.length) return null;
  const normalizedItems = items.map(entry => {
    const basePrice =
      Number.isFinite(Number(entry.basePrice)) && Number(entry.basePrice) >= 0
        ? Number(entry.basePrice)
        : Number.isFinite(Number(entry.price)) && Number(entry.price) >= 0
        ? Number(entry.price)
        : 0;
    const rawFinal =
      Number.isFinite(Number(entry.finalPrice)) && Number(entry.finalPrice) >= 0
        ? Number(entry.finalPrice)
        : Number(entry.price) >= 0
        ? Number(entry.price)
        : basePrice;
    const finalPrice = Math.max(0, roundToCents(rawFinal));
    return {
      ...entry,
      basePrice,
      finalPrice,
      price: finalPrice,
      promotionApplied: Boolean(entry.promotionApplied || entry.promotionId),
      promotionId: entry.promotionId || null
    };
  });
  const totalAmount = normalizedItems.reduce((sum, item) => sum + Number(item.finalPrice || 0), 0);
  const normalizedIp = String(clientIp || '').trim() || '0.0.0.0';
  const acceptedCgv =
    typeof consumerWaiver?.accepted_cgv === 'boolean'
      ? consumerWaiver.accepted_cgv
      : true;
  const renonciationText = String(
    consumerWaiver?.renonciation_text || consumerWaiver?.consumerWaiverAcceptedText || ''
  ).trim();
  const dateAchat = consumerWaiver?.date_achat ? new Date(consumerWaiver.date_achat) : new Date();
  const hasValidDateAchat = !Number.isNaN(dateAchat.getTime());
  const dateFormation = consumerWaiver?.date_formation
    ? new Date(consumerWaiver.date_formation)
    : null;
  const hasValidDateFormation = dateFormation && !Number.isNaN(dateFormation.getTime());
  const sale = new Sale({
    saleId: buildSaleId(),
    userId,
    customer,
    items: normalizedItems,
    totalAmount: roundToCents(totalAmount),
    itemCount: normalizedItems.length,
    giftCardUsage: Array.isArray(giftCardUsage) ? giftCardUsage : [],
    accepted_cgv: Boolean(acceptedCgv),
    renonciation_text: renonciationText || null,
    date_formation: hasValidDateFormation ? dateFormation : null,
    date_session: hasValidDateFormation ? dateFormation : null,
    date_achat: hasValidDateAchat ? dateAchat : new Date(),
    client_ip: normalizedIp
  });
  if (renonciationText) {
    sale.consumerWaiverAcceptedText = renonciationText;
    sale.consumerWaiverAcceptedAt = consumerWaiver?.consumerWaiverAcceptedAt || sale.date_achat;
  }
  // Sprint pré-React A1 — snapshot des consentements légaux revalidés serveur.
  if (legalConsentSnapshot && typeof legalConsentSnapshot === 'object') {
    sale.legalConsentSnapshot = legalConsentSnapshot;
  }
  // Sprint pré-React A7 — marqueur de livraison d'accès (distanciel : pas de faux
  // « accès immédiat »).
  if (accessDeliveryStatus) {
    sale.accessDeliveryStatus = accessDeliveryStatus;
  }
  // Pré-React C3 — horodatage d'octroi d'accès (distanciel immédiat → non remboursable).
  if (accessGrantedAt) {
    sale.accessGrantedAt = accessGrantedAt;
  }
  // Pré-React B1 — snapshot fiscal V1 (franchise en base, TVA non applicable, HT=TTC).
  sale.taxSnapshot = buildTaxSnapshot(sale.totalAmount);
  // Phase 1B-1: set the Stripe PaymentIntent id AT INSERT so the unique partial
  // index on stripePaymentIntentId rejects a concurrent/duplicate webhook with an
  // E11000 BEFORE any side effect (gift-card debit, commission) runs — preventing
  // both a duplicate Sale and an orphan Sale.
  const normalizedPi = String(stripePaymentIntentId || '').trim();
  const normalizedSession = String(stripeSessionId || '').trim();
  if (normalizedPi) sale.stripePaymentIntentId = normalizedPi;
  if (normalizedSession) sale.stripeSessionId = normalizedSession;
  const saved = await sale.save();
  // Audit-only event (best-effort, no side effect, never throws to the flow).
  await emitSaleEvent('sale.finalized', saved);
  if (!skipPostSaleSideEffects) {
    await runPostSaleSideEffects(saved);
  }
  return saved;
}

async function persistCartSnapshot(userId, items) {
  if (!userId) return;
  const normalized = Array.isArray(items)
    ? items
        .map(normalizeSnapshotItem)
        .filter(Boolean)
    : [];
  if (!normalized.length) {
    await CartSnapshot.deleteOne({ userId });
    return;
  }
  const totalAmount = normalized.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const itemCount = normalized.length;
  await CartSnapshot.findOneAndUpdate(
    { userId },
    { items: normalized, totalAmount, itemCount, updatedAt: new Date() },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function buildParticipantLabel(user, fallbackId) {
  const email = user?.email || '';
  if (!email.includes('@')) {
    return fallbackId ? `Participant ${String(fallbackId).slice(-4)}` : 'Participant';
  }
  const [local, domain] = email.split('@');
  const safeLocal = local ? `${local[0]}***` : 'participant';
  let safeDomain = domain || 'domaine';
  if (safeDomain.includes('.')) {
    safeDomain = safeDomain.replace(/(.).*?(\..+)/, '$1***$2');
  }
  return `${safeLocal}@${safeDomain}`;
}

async function loadPublishedFormation(formationId) {
  if (!validateObjectId(formationId)) return null;
  const formation = await Formation.findById(formationId).lean();
  if (!formation || formation.status !== 'published') {
    return null;
  }
  return formation;
}

async function loadFormationPurchase(userId, formationId) {
  if (!userId) return null;
  return Purchase.findOne({ userId, formationId, itemType: 'formation' })
    .sort({ createdAt: -1 })
    .lean();
}

async function loadActiveFormationPurchase(userId, formationId) {
  if (!userId) return null;
  return Purchase.findOne({
    userId,
    formationId,
    itemType: 'formation',
    participationStatus: { $ne: 'canceled' }
  })
    .sort({ createdAt: -1 })
    .lean();
}

async function loadFormationPurchaseByIdForUser({ userId, formationId, purchaseId, activeOnly = false } = {}) {
  const normalizedPurchaseId = String(purchaseId || '').trim();
  if (!userId || !validateObjectId(formationId) || !validateObjectId(normalizedPurchaseId)) {
    return null;
  }
  const query = {
    _id: normalizedPurchaseId,
    userId,
    formationId,
    itemType: 'formation'
  };
  if (activeOnly) {
    query.participationStatus = { $ne: 'canceled' };
  }
  return Purchase.findOne(query).lean();
}

async function resolveFormationPurchaseForRequest({
  userId,
  formationId,
  purchaseId,
  activeOnly = false
} = {}) {
  const normalizedPurchaseId = String(purchaseId || '').trim();
  if (normalizedPurchaseId) {
    return loadFormationPurchaseByIdForUser({
      userId,
      formationId,
      purchaseId: normalizedPurchaseId,
      activeOnly
    });
  }
  return activeOnly ? loadActiveFormationPurchase(userId, formationId) : loadFormationPurchase(userId, formationId);
}

function findExistingActiveFormationPurchase(existingPurchases, formationId, { sessionId = null } = {}) {
  const normalizedFormationId = String(formationId || '').trim();
  const normalizedSessionId = sessionId ? String(sessionId).trim() : '';
  return (Array.isArray(existingPurchases) ? existingPurchases : []).find(entry => {
    if (String(entry?.itemType || '').trim().toLowerCase() !== 'formation') return false;
    if (String(entry?.itemId || '') !== normalizedFormationId) return false;
    if (String(entry?.participationStatus || 'active').trim().toLowerCase() === 'canceled') return false;
    if (normalizedSessionId) {
      return String(entry?.sessionId || '') === normalizedSessionId;
    }
    return !entry?.sessionId;
  });
}

function serializeRefundPayload(refund) {
  if (!refund) return null;
  return {
    refundId: String(refund.refundId || '').trim(),
    saleId: String(refund.saleId || '').trim(),
    status: String(refund.status || '').trim(),
    amount: Number.isFinite(Number(refund.amount)) ? Number(refund.amount) : 0,
    requestedAt: refund.requestedAt || null,
    processedAt: refund.processedAt || null,
    eligibleRefund: Boolean(refund.eligibleRefund),
    sessionStartAt: refund.sessionStartAt || null
  };
}

async function findExistingRefundForPurchase(purchaseDoc) {
  const refundId = String(purchaseDoc?.refundRequestId || '').trim();
  if (refundId) {
    const byId = await RefundRequest.findOne({ refundId }).lean();
    if (byId && isActiveRefundRequestStatus(byId.status)) return byId;
  }
  const saleId = String(purchaseDoc?.saleId || '').trim();
  if (!saleId || !purchaseDoc?.itemId) return null;
  const activeRefund = await findActiveRefundRequestForSaleItem({
    saleId,
    itemId: purchaseDoc.itemId,
    itemType: 'formation'
  });
  if (activeRefund) {
    return activeRefund.toObject();
  }
  return null;
}

async function loadUserPurchases(userId, itemType, Model) {
  const purchases = await Purchase.find({ userId, itemType }).sort({ createdAt: -1 }).lean();
  if (!purchases.length) return [];
  const ids = purchases.map(entry => entry.itemId?.toString()).filter(Boolean);
  const records = ids.length ? await Model.find({ _id: { $in: ids } }).lean() : [];
  const recordMap = new Map(records.map(record => [record._id?.toString(), record]));
  return purchases.map(purchase => ({
    id: purchase._id?.toString(),
    itemId: purchase.itemId?.toString(),
    createdAt: purchase.createdAt,
    item: serializeItem(recordMap.get(purchase.itemId?.toString()))
  }));
}

export async function getMyProducts(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  try {
    const products = await loadUserPurchases(userId, 'product', Product);
    return res.json({ ok: true, products });
  } catch (error) {
    console.error('Erreur chargement produits client', error);
    return res.status(500).json({ ok: false, error: 'Impossible de lire les achats produits.' });
  }
}

export async function getMyFormations(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  try {
    const purchases = await Purchase.find({ userId, itemType: 'formation' }).sort({ createdAt: -1 }).lean();
    if (!purchases.length) {
      return res.json({ ok: true, formations: [] });
    }
    const formationIds = Array.from(
      new Set(purchases.map(entry => entry.formationId?.toString()).filter(Boolean))
    );
    const sessionIds = Array.from(
      new Set(purchases.map(entry => entry.sessionId?.toString()).filter(Boolean))
    );
    const [formations, sessions] = await Promise.all([
      formationIds.length ? Formation.find({ _id: { $in: formationIds } }).lean() : [],
      sessionIds.length
        ? FormationSession.find(buildActiveFormationSessionFilter({ _id: { $in: sessionIds } })).lean()
        : []
    ]);
    const formationMap = new Map(formations.map(entry => [entry._id?.toString(), entry]));
    const sessionMap = new Map(sessions.map(entry => [entry._id?.toString(), entry]));
    const reviews = formationIds.length
      ? await Review.find({ userId, formationId: { $in: formationIds } }).lean()
      : [];
    const reviewedSet = new Set(reviews.map(entry => entry.formationId?.toString()).filter(Boolean));
    const payload = purchases.map(purchase => {
      const base = serializePurchasePayload(
        purchase,
        formationMap.get(purchase.formationId?.toString()),
        sessionMap.get(purchase.sessionId?.toString()),
        null
      );
      return {
        ...base,
        hasReview: reviewedSet.has(purchase.formationId?.toString())
      };
    });
    return res.json({ ok: true, formations: payload });
  } catch (error) {
    console.error('Erreur chargement formations client', error);
    return res.status(500).json({ ok: false, error: 'Impossible de lire les achats formations.' });
  }
}

function validateObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || '').trim());
}

const FAVORITE_TARGET_MODELS = {
  product: Product,
  formation: Formation
};

const FAVORITE_TARGET_LABELS = {
  product: 'Produit',
  formation: 'Formation'
};

async function fetchFavoriteTarget(targetType, targetId) {
  const Model = FAVORITE_TARGET_MODELS[targetType];
  if (!Model) return null;
  const query = { _id: targetId };
  if (targetType === 'product') {
    query.active = true;
  }
  if (targetType === 'formation') {
    query.status = 'published';
  }
  return Model.findOne(query).lean();
}

function buildFavoriteDetailUrl(targetType, targetId) {
  if (!targetType || !targetId) return null;
  const params = new URLSearchParams({ type: targetType, id: targetId });
  return `/vitrine.html?page=item-detail&${params.toString()}`;
}

function mapFavoriteTargetPayload(targetType, targetDoc) {
  if (!targetDoc) return null;
  const id = targetDoc._id?.toString();
  if (!id) return null;
  const base = {
    id,
    name: targetDoc.name || '',
    coverImage: targetDoc.coverImage || '',
    price: Number.isFinite(Number(targetDoc.price)) ? Number(targetDoc.price) : 0,
    label: FAVORITE_TARGET_LABELS[targetType] || 'Article',
    available:
      targetType === 'product'
        ? Boolean(targetDoc.active)
        : String(targetDoc.status || '').toLowerCase() === 'published',
    kind: targetType
  };
  if (targetType === 'formation') {
    const formationType = String(targetDoc.type || 'distanciel').toLowerCase();
    const parsedRefundDays = Number(targetDoc.refundDays);
    return {
      ...base,
      formationType,
      formationStatus: targetDoc.status || 'draft',
      sessionRequired: formationType === 'presentiel',
      refundDays: Number.isFinite(parsedRefundDays) ? Math.max(0, parsedRefundDays) : 7
    };
  }
  return { ...base, sessionRequired: false };
}

function buildFavoritePayload(favorite, targetDoc) {
  const target = mapFavoriteTargetPayload(favorite.targetType, targetDoc);
  if (!target) return null;
  return {
    id: favorite._id?.toString(),
    targetType: favorite.targetType,
    targetId: target.id,
    createdAt: favorite.createdAt,
    detailUrl: buildFavoriteDetailUrl(favorite.targetType, target.id),
    target
  };
}

export async function getModulesForFormation(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const formationId = String(req.params.id || '').trim();
  if (!validateObjectId(formationId)) {
    return res.status(400).json({ ok: false, error: 'Formation invalide.' });
  }
  try {
    const formation = await loadPublishedFormation(formationId);
    if (!formation || formation.type !== 'distanciel') {
      return res.status(404).json({ ok: false, error: 'Formation distancielle introuvable.' });
    }
    const purchase = await resolveFormationPurchaseForRequest({
      userId,
      formationId: formation._id,
      purchaseId: req.query?.purchaseId,
      activeOnly: false
    });
    if (!purchase) {
      return res.status(403).json({ ok: false, error: 'AccÃ¨s refusÃ© aux modules.' });
    }
    const modules = await FormationModule.find({ formationId: formation._id })
      .sort({ order: 1, createdAt: 1 })
      .lean();
    return res.json({
      ok: true,
      formation: serializeFormation(formation),
      modules: modules.map(buildModulePayload)
    });
  } catch (error) {
    console.error('Erreur chargement modules client', error);
    return res.status(500).json({ ok: false, error: 'Impossible de lire les modules.' });
  }
}

export async function getModuleDetail(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const moduleId = String(req.params.moduleId || '').trim();
  if (!validateObjectId(moduleId)) {
    return res.status(400).json({ ok: false, error: 'Module invalide.' });
  }
  try {
    const module = await FormationModule.findById(moduleId).lean();
    if (!module) {
      return res.status(404).json({ ok: false, error: 'Module introuvable.' });
    }
    const formation = await loadPublishedFormation(module.formationId?.toString());
    if (!formation || formation.type !== 'distanciel') {
      return res.status(404).json({ ok: false, error: 'Module distanciel introuvable.' });
    }
    const purchase = await resolveFormationPurchaseForRequest({
      userId,
      formationId: formation._id,
      purchaseId: req.query?.purchaseId,
      activeOnly: false
    });
    if (!purchase) {
      return res.status(403).json({ ok: false, error: 'AccÃ¨s refusÃ© au module.' });
    }
    return res.json({
      ok: true,
      module: buildModulePayload(module)
    });
  } catch (error) {
    console.error('Erreur lecture module client', error);
    return res.status(500).json({ ok: false, error: 'Impossible de lire le module.' });
  }
}

export async function getFormationSession(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const formationId = String(req.params.id || '').trim();
  if (!validateObjectId(formationId)) {
    return res.status(400).json({ ok: false, error: 'Formation invalide.' });
  }
  try {
    const formation = await loadPublishedFormation(formationId);
    if (!formation || formation.type !== 'presentiel') {
      return res.status(404).json({ ok: false, error: 'Formation prÃ©sentielle introuvable.' });
    }
    const purchase = await resolveFormationPurchaseForRequest({
      userId,
      formationId: formation._id,
      purchaseId: req.query?.purchaseId,
      activeOnly: false
    });
    if (!purchase) {
      return res.status(403).json({ ok: false, error: 'AccÃ¨s refusÃ© : achat requis.' });
    }
    if (!purchase.sessionId) {
      return res.status(404).json({ ok: false, error: 'Session non rÃ©servÃ©e.' });
    }
    const session = await FormationSession.findOne(
      buildActiveFormationSessionFilter({ _id: purchase.sessionId })
    ).lean();
    if (!session || String(session.formationId) !== String(formation._id)) {
      return res.status(409).json({
        ok: false,
        error: 'Cette session a ete annulee par l institut. Consultez votre email pour choisir une option.'
      });
    }
    const payload = buildSessionPayload(session);
    if (!payload) {
      return res.status(404).json({ ok: false, error: 'Session introuvable.' });
    }
    const resolvedSale = await resolveSaleForFormationPurchase({
      userId,
      formationId: formation._id,
      preferredSaleId: String(purchase.saleId || '').trim()
    });
    const refundEligibility = getPresentielRefundEligibility({
      sale: resolvedSale?.sale || null,
      formation: {
        ...formation,
        sessionDate: session.startDate
      },
      now: new Date()
    });
    return res.json({ ok: true, session: payload, refundEligibility });
  } catch (error) {
    console.error('Erreur lecture session client', error);
    return res.status(500).json({ ok: false, error: 'Impossible de lire la session.' });
  }
}

export async function getFormationParticipants(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const formationId = String(req.params.id || '').trim();
  if (!validateObjectId(formationId)) {
    return res.status(400).json({ ok: false, error: 'Formation invalide.' });
  }
  try {
    const formation = await loadPublishedFormation(formationId);
    if (!formation || formation.type !== 'presentiel') {
      return res.status(404).json({ ok: false, error: 'Formation prÃ©sentielle introuvable.' });
    }
    const purchase = await resolveFormationPurchaseForRequest({
      userId,
      formationId: formation._id,
      purchaseId: req.query?.purchaseId,
      activeOnly: false
    });
    if (!purchase || !purchase.sessionId) {
      return res.status(403).json({ ok: false, error: 'AccÃ¨s refusÃ© : achat requis.' });
    }
    const participantsPurchases = await Purchase.find({
      sessionId: purchase.sessionId,
      itemType: 'formation'
    }).lean();
    if (!participantsPurchases.length) {
      return res.json({ ok: true, participants: [] });
    }
    const userIds = Array.from(
      new Set(participantsPurchases.map(entry => entry.userId?.toString()).filter(Boolean))
    );
    const users = userIds.length ? await User.find({ _id: { $in: userIds } }).lean() : [];
    const userMap = new Map(users.map(user => [user._id?.toString(), user]));
    const participants = participantsPurchases
      .filter(entry => String(entry.userId) !== String(userId))
      .map(entry => ({
        id: entry.userId?.toString(),
        label: buildParticipantLabel(userMap.get(entry.userId?.toString()), entry.userId?.toString()),
        joinedAt: entry.createdAt,
        status: String(entry.participationStatus || 'active').trim() || 'active',
        canceledAt: entry.canceledAt || null
      }))
      .sort((left, right) => {
        if (left.status !== right.status) {
          return left.status === 'active' ? -1 : 1;
        }
        return new Date(left.joinedAt || 0).getTime() - new Date(right.joinedAt || 0).getTime();
      });
    return res.json({ ok: true, participants });
  } catch (error) {
    console.error('Erreur lecture participants', error);
    return res.status(500).json({ ok: false, error: 'Impossible de lire les participants.' });
  }
}

export async function getFormationSummary(req, res) {
  const formationId = String(req.params.id || '').trim();
  if (!validateObjectId(formationId)) {
    return res.status(400).json({ ok: false, error: 'Formation invalide.' });
  }
  try {
    const formation = await Formation.findById(formationId).lean();
    if (!formation || formation.status !== 'published') {
      return res.status(404).json({ ok: false, error: 'Formation introuvable.' });
    }
    return res.json({ ok: true, formation: serializeFormation(formation) });
  } catch (error) {
    console.error('Erreur lecture formation', error);
    return res.status(500).json({ ok: false, error: 'Impossible de lire la formation.' });
  }
}

export async function getPurchaseStatus(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const formationId = String(req.query?.formationId || '').trim();
  const sessionId = String(req.query?.sessionId || '').trim();
  if (!validateObjectId(formationId)) {
    return res.status(400).json({ ok: false, error: 'formationId invalide.' });
  }
  if (sessionId && !validateObjectId(sessionId)) {
    return res.status(400).json({ ok: false, error: 'sessionId invalide.' });
  }
  try {
    const purchased = Boolean(
      await Purchase.exists({
        userId,
        itemType: 'formation',
        itemId: formationId,
        sessionId: sessionId || null,
        participationStatus: { $ne: 'canceled' }
      })
    );
    return res.json({ ok: true, purchased });
  } catch (error) {
    console.error('Erreur lecture statut achat formation', error);
    return res.status(500).json({ ok: false, error: 'Impossible de verifier le statut de votre achat.' });
  }
}

export async function postFormationReview(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const formationId = String(req.params.id || '').trim();
  if (!validateObjectId(formationId)) {
    return res.status(400).json({ ok: false, error: 'Formation invalide.' });
  }
  const rating = Number(req.body?.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ ok: false, error: 'Note invalide.' });
  }
  const comment = String(req.body?.comment || '').trim();
  try {
    const formation = await loadPublishedFormation(formationId);
    if (!formation) {
      return res.status(404).json({ ok: false, error: 'Formation introuvable.' });
    }
    const purchase = await loadFormationPurchase(userId, formation._id);
    if (!purchase) {
      return res.status(403).json({ ok: false, error: 'Achat requis pour laisser un avis.' });
    }
    const existingReview = await Review.findOne({ userId, formationId: formation._id }).lean();
    if (existingReview) {
      return res.status(409).json({ ok: false, error: 'Vous avez dÃ©jÃ  laissÃ© un avis.' });
    }
    const review = new Review({
      userId,
      formationId: formation._id,
      rating,
      comment,
      createdAt: new Date()
    });
    await review.save();
    return res.status(201).json({ ok: true });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Vous avez dÃ©jÃ  laissÃ© un avis.' });
    }
    console.error('Erreur sauvegarde avis formation', error);
    return res.status(500).json({ ok: false, error: "Impossible de sauvegarder l'avis." });
  }
}

export async function getMyPresentielSession(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  try {
    const purchase = await Purchase.findOne({ userId, sessionId: { $ne: null }, itemType: 'formation' })
      .sort({ createdAt: -1 })
      .lean();
    if (!purchase) {
      return res.status(404).json({ ok: false, error: 'Aucune session reserves.' });
    }
    const [formation, session] = await Promise.all([
      Formation.findById(purchase.formationId).lean(),
      purchase.sessionId
        ? FormationSession.findOne(buildActiveFormationSessionFilter({ _id: purchase.sessionId })).lean()
        : null
    ]);
    if (!formation || formation.type !== 'presentiel' || !session) {
      return res.status(404).json({ ok: false, error: 'Session introuvable.' });
    }
    return res.json({ ok: true, purchase: serializePurchasePayload(purchase, formation, session) });
  } catch (error) {
    console.error('Erreur lecture session client', error);
    return res.status(500).json({ ok: false, error: 'Impossible de lire la session.' });
  }
}

export async function mockPay(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const user = await User.findById(userId).lean();
  if (!user) {
    return res.status(401).json({ ok: false, error: 'Utilisateur introuvable.' });
  }
  const customer = buildCustomerProfile(user);
  const clientIp = extractClientIp(req);
  const giftCardRequest = Array.isArray(req.body?.giftCards) ? req.body.giftCards : [];
  const requireGiftCardPassword = Boolean(req.body?.requireGiftCardPassword);
  let saleRecord = null;
  let purchaseRecord = null;
  let reservedSession = null;
  const requestedType = String(req.body?.type || '').toLowerCase();
  const itemType = requestedType === 'product' ? 'product' : 'formation';
  const itemId = String(req.body?.id || req.body?.formationId || '').trim();
  const legalDateAchat = new Date();
  if (!validateObjectId(itemId)) {
    return res.status(400).json({ ok: false, error: 'Identifiant de produit ou formation invalide.' });
  }
  try {
    if (itemType === 'formation') {
      const formation = await Formation.findById(itemId).lean();
      if (!formation || formation.status !== 'published') {
        return res.status(404).json({ ok: false, error: 'Formation introuvable.' });
      }
      let consumerWaiver = null;
      const alreadyPurchased = await Purchase.exists({
        userId,
        itemType: 'formation',
        itemId: formation._id,
        sessionId: null,
        participationStatus: { $ne: 'canceled' }
      });
      if (alreadyPurchased) {
        return res.status(409).json({ ok: false, error: 'Vous avez dÃ©jÃ  achetÃ© cette formation.' });
      }
      reservedSession = null;
      let purchaseSelectedOptions = [];
      let optionSaleItemsForMockPay = [];
      if (formation.type === 'presentiel') {
        const sessionId = String(req.body?.sessionId || '').trim();
        const alreadyPurchasedSameSession = await Purchase.exists({
          userId,
          itemType: 'formation',
          itemId: formation._id,
          sessionId,
          participationStatus: { $ne: 'canceled' }
        });
        if (!validateObjectId(sessionId)) {
          return res.status(400).json({ ok: false, error: 'Session requise pour une formation en présentiel.' });
        }
        if (alreadyPurchasedSameSession) {
          return res.status(409).json({ ok: false, error: 'Vous avez deja achete cette session.' });
        }
        const targetSession = await FormationSession.findOne(
          buildActiveFormationSessionFilter({
            _id: sessionId,
            formationId: formation._id
          })
        ).lean();
        if (!targetSession) {
          return res.status(404).json({ ok: false, error: 'Session introuvable.' });
        }
        consumerWaiver = validateAndBuildConsumerWaiver(req.body, {
          dateAchat: legalDateAchat,
          hasDistancielItem: false,
          dateFormation: targetSession.startDate,
          refundDays: formation.refundDays,
          enforcePresentielWaiver: true,
          requireAcceptedCgv: true
        });
        if (Number(targetSession.reservedCount || 0) >= Number(targetSession.maxClients || 0)) {
          return res.status(409).json({ ok: false, error: 'Session complète.' });
        }
        const updatedSession = await FormationSession.findOneAndUpdate(
          buildActiveFormationSessionFilter({
            _id: targetSession._id,
            formationId: formation._id,
            reservedCount: { $lt: targetSession.maxClients }
          }),
          { $inc: { reservedCount: 1 } },
          { new: true }
        );
        if (!updatedSession) {
          return res.status(409).json({ ok: false, error: 'Session complète.' });
        }
        reservedSession = updatedSession;
        const rawSelectedOptions = Array.isArray(req.body?.selectedOptions) ? req.body.selectedOptions : [];
        const optionsResult = validateAndBuildSelectedOptions(rawSelectedOptions, formation, targetSession.startDate);
        purchaseSelectedOptions = optionsResult.selectedOptions;
        optionSaleItemsForMockPay = optionsResult.optionSaleItems;
      } else {
        consumerWaiver = validateAndBuildConsumerWaiver(req.body, {
          dateAchat: legalDateAchat,
          hasDistancielItem: String(formation.type || '').toLowerCase() === 'distanciel',
          enforcePresentielWaiver: false,
          requireAcceptedCgv: true
        });
      }
      const now = new Date();
      const purchase = new Purchase({
        userId,
        formationId: formation._id,
        sessionId: reservedSession ? reservedSession._id : null,
        paymentProvider: 'mock',
        paymentStatus: 'paid',
        paymentRef: `MOCK-${Date.now()}`,
        itemType: 'formation',
        itemId: formation._id,
        selectedOptions: purchaseSelectedOptions,
        createdAt: now
      });
      await purchase.save();
      purchaseRecord = purchase;
      const promotion = await getActivePromotion('formation', formation._id);
      const saleItems = [
        buildSaleEntry({
          type: 'formation',
          itemId: formation._id,
          formationId: formation._id,
          name: formation.name,
          basePrice: Number(formation.price || 0),
          promotion
        }),
        ...optionSaleItemsForMockPay
      ];
      const totalAmount = saleItems.reduce((sum, entry) => sum + Number(entry.finalPrice || 0), 0);
      const giftPlan = await planGiftCardUsage(giftCardRequest, totalAmount, {
        requirePassword: requireGiftCardPassword
      });
      saleRecord = await persistSale({
        userId,
        customer,
        items: saleItems,
        giftCardUsage: giftPlan.saleEntries,
        consumerWaiver,
        clientIp,
        skipPostSaleSideEffects: true,
        legalConsentSnapshot: buildLegalConsentSnapshot({
          legal: {
            acceptedCgv: consumerWaiver?.accepted_cgv,
            waiverAccepted: Boolean(consumerWaiver?.renonciation_text),
            waiverText: consumerWaiver?.renonciation_text || '',
            waiverAcceptedAt: consumerWaiver?.consumerWaiverAcceptedAt || legalDateAchat
          },
          acceptedAt: legalDateAchat,
          source: 'mock_pay'
        })
      });
      const formationEntries = saleItems
        .map(buildFormationEntryFromSale)
        .filter(Boolean);
      if (saleRecord && formationEntries.length) {
        const commissionTransactions = await recordCommissionTransactions({
          saleId: saleRecord.saleId,
          formationEntries
        });
        await applySaleCommissionSnapshot(saleRecord, commissionTransactions);
      }
      if (saleRecord?.saleId && purchaseRecord?._id) {
        purchaseRecord.saleId = saleRecord.saleId;
        await Purchase.findByIdAndUpdate(purchaseRecord._id, { saleId: saleRecord.saleId }).catch(() => {});
      }
      if (giftPlan.usages.length) {
        await finalizeGiftCardUsage({
          userId,
          saleDoc: saleRecord,
          saleItems,
          usages: giftPlan.usages
        });
      }
      if (saleRecord) {
        await runPostSaleSideEffects(saleRecord);
      }
      await CartSnapshot.deleteOne({ userId });
      return res.status(201).json({
        ok: true,
        purchase: serializePurchasePayload(purchase.toObject(), formation, reservedSession || null, null),
        giftCardUsage: giftPlan.saleEntries
      });
    }
    const product = await Product.findById(itemId).lean();
    if (!product || !product.active) {
      return res.status(404).json({ ok: false, error: 'Produit introuvable.' });
    }
    const alreadyPurchased = await Purchase.exists({ userId, itemType: 'product', itemId: product._id });
    if (alreadyPurchased) {
      return res.status(409).json({ ok: false, error: 'Vous avez dÃ©jÃ  achetÃ© ce produit.' });
    }
    const consumerWaiver = validateAndBuildConsumerWaiver(req.body, {
      dateAchat: legalDateAchat,
      hasDistancielItem: false,
      enforcePresentielWaiver: false,
      requireAcceptedCgv: true
    });
    const now = new Date();
    const purchase = new Purchase({
      userId,
      formationId: null,
      sessionId: null,
      paymentProvider: 'mock',
      paymentStatus: 'paid',
      paymentRef: `MOCK-${Date.now()}`,
      itemType: 'product',
      itemId: product._id,
      createdAt: now
    });
    await purchase.save();
    purchaseRecord = purchase;
    const promotion = await getActivePromotion('product', product._id);
    const saleItems = [
      buildSaleEntry({
        type: 'product',
        itemId: product._id,
        name: product.name,
        basePrice: Number(product.price || 0),
        promotion
      })
    ];
    const totalAmount = saleItems.reduce((sum, entry) => sum + Number(entry.finalPrice || 0), 0);
    const giftPlan = await planGiftCardUsage(giftCardRequest, totalAmount, {
      requirePassword: requireGiftCardPassword
    });
    const saleDoc = await persistSale({
      userId,
      customer,
      items: saleItems,
      giftCardUsage: giftPlan.saleEntries,
      consumerWaiver,
      clientIp,
      skipPostSaleSideEffects: true,
      legalConsentSnapshot: buildLegalConsentSnapshot({
        legal: {
          acceptedCgv: consumerWaiver?.accepted_cgv,
          waiverAccepted: Boolean(consumerWaiver?.renonciation_text),
          waiverText: consumerWaiver?.renonciation_text || '',
          waiverAcceptedAt: consumerWaiver?.consumerWaiverAcceptedAt || legalDateAchat
        },
        acceptedAt: legalDateAchat,
        source: 'mock_pay'
      })
    });
    saleRecord = saleDoc;
    if (saleDoc?.saleId && purchaseRecord?._id) {
      purchaseRecord.saleId = saleDoc.saleId;
      await Purchase.findByIdAndUpdate(purchaseRecord._id, { saleId: saleDoc.saleId }).catch(() => {});
    }
    if (giftPlan.usages.length) {
      await finalizeGiftCardUsage({
        userId,
        saleDoc,
        saleItems,
        usages: giftPlan.usages
      });
    }
    if (saleDoc) {
      await runPostSaleSideEffects(saleDoc);
    }
    await CartSnapshot.deleteOne({ userId });
    return res.status(201).json({
      ok: true,
      purchase: serializePurchasePayload(purchase.toObject(), null, null, product),
      giftCardUsage: giftPlan.saleEntries
    });
  } catch (error) {
    if (saleRecord || purchaseRecord || reservedSession) {
      await rollbackSingleSale({
        sale: saleRecord,
        purchase: purchaseRecord,
        session: reservedSession
      });
    }
    if (error?.status) {
      return res.status(error.status).json({ ok: false, error: error.message, code: error.code || null });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Vous avez dÃ©jÃ  achetÃ© cet article.' });
    }
    console.error('Erreur paiement simulÃ©', error);
    return res.status(500).json({ ok: false, error: 'Impossible de simuler le paiement.' });
  }
}

export async function saveCartSnapshot(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  try {
    await persistCartSnapshot(userId, items);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Erreur snapshot panier', error);
    return res.status(500).json({ ok: false, error: 'Impossible de sauvegarder le panier.' });
  }
}

export async function listFavorites(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  try {
    const favorites = await Favorite.find({ userId }).sort({ createdAt: -1 }).lean();
    if (!favorites.length) {
      return res.json({ ok: true, favorites: [] });
    }
    const toLoad = favorites.reduce(
      (acc, favorite) => {
        const type = favorite.targetType;
        const targetId = favorite.targetId?.toString();
        if (!type || !targetId) return acc;
        if (!acc[type]) {
          acc[type] = new Set();
        }
        acc[type].add(targetId);
        return acc;
      },
      {}
    );
    const [products, formations] = await Promise.all([
      toLoad.product?.size
        ? Product.find({ _id: { $in: Array.from(toLoad.product) }, active: true }).lean()
        : [],
      toLoad.formation?.size
        ? Formation.find({ _id: { $in: Array.from(toLoad.formation) }, status: 'published' }).lean()
        : []
    ]);
    const productMap = new Map(products.map(entry => [entry._id?.toString(), entry]));
    const formationMap = new Map(formations.map(entry => [entry._id?.toString(), entry]));
    const payload = favorites
      .map(favorite => {
        const targetMap = favorite.targetType === 'formation' ? formationMap : productMap;
        const target = targetMap.get(favorite.targetId?.toString());
        return buildFavoritePayload(favorite, target);
      })
      .filter(Boolean);
    return res.json({ ok: true, favorites: payload });
  } catch (error) {
    console.error('Erreur chargement favoris', error);
    return res.status(500).json({ ok: false, error: 'Impossible de charger les favoris.' });
  }
}

export async function listMySales(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  try {
    const sales = await Sale.find({ userId }).sort({ createdAt: -1 }).lean();
    const saleIds = sales.map(entry => entry.saleId).filter(Boolean);
    const invoices = saleIds.length
      ? await Invoice.find({ saleId: { $in: saleIds } }).lean()
      : [];
    const invoiceMap = new Map(invoices.map(entry => [entry.saleId, entry]));
    const payload = sales.map(sale => {
      const items = Array.isArray(sale.items)
        ? sale.items.map(item => ({
            type: item.type,
            name: item.name || 'Article',
            price:
              Number.isFinite(Number(item.finalPrice))
                ? Number(item.finalPrice)
                : Number.isFinite(Number(item.price))
                  ? Number(item.price)
                  : 0
          }))
        : [];
      const giftCardUsage = Array.isArray(sale.giftCardUsage)
        ? sale.giftCardUsage.map(entry => ({
            amountUsed: Number.isFinite(Number(entry.amountUsed)) ? Number(entry.amountUsed) : 0
          }))
        : [];
      const invoice = invoiceMap.get(sale.saleId);
      const saleIdParam = encodeURIComponent(String(sale.saleId || ''));
      return {
        id: sale.saleId,
        createdAt: sale.createdAt,
        date_achat: sale.date_achat || sale.createdAt,
        date_formation: sale.date_formation || null,
        totalAmount: Number.isFinite(Number(sale.totalAmount)) ? Number(sale.totalAmount) : 0,
        itemCount: Number.isFinite(Number(sale.itemCount))
          ? Number(sale.itemCount)
          : items.length,
        items,
        giftCardUsage,
        accepted_cgv: Boolean(sale.accepted_cgv),
        renonciation_text: String(
          sale.renonciation_text || sale.consumerWaiverAcceptedText || ''
        ).trim(),
        client_ip: String(sale.client_ip || '').trim(),
        consumerWaiverAcceptedText: String(
          sale.consumerWaiverAcceptedText || sale.renonciation_text || ''
        ).trim(),
        invoice: invoice
          ? {
              id: invoice.invoiceId,
              number: invoice.invoiceNumber || invoice.stripeInvoiceNumber || '',
              date: invoice.invoiceDate ? new Date(invoice.invoiceDate).toISOString() : null,
              stripeInvoiceId: invoice.stripeInvoiceId || null,
              stripeInvoicePdfUrl: invoice.stripeInvoicePdfUrl || null,
              downloadUrl: saleIdParam ? `/api/client/sales/${saleIdParam}/invoice` : null
            }
          : null
      };
    });
    return res.json({ ok: true, sales: payload });
  } catch (error) {
    console.error('Erreur chargement ventes client', error);
    return res.status(500).json({ ok: false, error: "Impossible de charger l'historique des ventes." });
  }
}

async function createPresentielRefundRequest({
  userId,
  formation,
  purchase,
  preferredSaleId = '',
  sessionStartAt = null,
  clientIp = '0.0.0.0'
} = {}) {
  const { sale, amount } = await resolveSaleForFormationPurchase({
    userId,
    formationId: formation?._id,
    preferredSaleId: preferredSaleId || purchase?.saleId || ''
  });
  if (!sale) {
    const missingSaleError = new Error('Vente introuvable pour enregistrer la demande de remboursement.');
    missingSaleError.status = 409;
    throw missingSaleError;
  }

  const totalRefundAmount = roundToCents(amount);

  const refundPayload = {
    refundId: buildRefundId(),
    saleId: String(sale.saleId || '').trim(),
    userId: purchase?.userId || userId,
    itemId: formation?._id || purchase?.itemId,
    itemType: 'formation',
    formationId: formation?._id || purchase?.formationId,
    amount: totalRefundAmount,
    currency: 'EUR',
    status: 'requested',
    requestedAt: new Date(),
    reason: REFUND_REASON_CLIENT_CANCEL_PRESENTIEL,
    clientIp: String(clientIp || '').trim() || '0.0.0.0',
    purchaseAcceptedText: resolveSaleAcceptedText(sale),
    sessionStartAt: sessionStartAt || null,
    eligibleRefund: true,
    meta: {
      formationTitle: String(formation?.name || '').trim() || 'Formation',
      formationCoverImage: String(formation?.coverImage || '').trim() || '',
      saleCreatedAt: sale?.createdAt || null
    }
  };
  await applyRefundExecutionCap({
    refundRequest: refundPayload,
    sale,
    logPrefix: '[createPresentielRefundRequest]'
  });

  const creation = await createRefundRequestOnce(refundPayload);
  let refundRequest = creation.refundRequest;
  if (creation.created) {
    try {
      await ensureRefundCommissionProvision(refundRequest);
    } catch (commissionError) {
      await RefundRequest.deleteOne({ _id: refundRequest._id }).catch(() => {});
      throw commissionError;
    }

    try {
      const execution = await triggerRefundExecution(refundRequest, sale);
      if (execution?.refund) {
        refundRequest = execution.refund;
      }
    } catch (triggerError) {
      console.error('[createPresentielRefundRequest] triggerRefundExecution failed', {
        refundId: String(refundRequest?.refundId || ''),
        saleId: String(sale?.saleId || ''),
        error: triggerError
      });
    }
  }

  const refundId = String(refundRequest.refundId || '').trim();
  if (purchase?._id && refundId) {
    await Purchase.findByIdAndUpdate(purchase._id, {
      refundRequestId: refundId,
      saleId: String(sale.saleId || purchase.saleId || '').trim()
    }).catch(() => {});
  }

  return refundRequest.toObject();
}

export async function cancelFormationParticipation(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }

  const formationId = String(req.params.formationId || '').trim();
  if (!validateObjectId(formationId)) {
    return res.status(400).json({ ok: false, error: 'Formation invalide.' });
  }

  const requestedPurchaseId = String(req.body?.purchaseId || req.query?.purchaseId || '').trim();
  const requestedSaleId = String(req.body?.saleId || '').trim();
  const requestedSessionId = String(req.body?.sessionId || '').trim();

  try {
    const formation = await Formation.findById(formationId).lean();
    if (!formation || String(formation.type || '').toLowerCase() !== 'presentiel') {
      return res
        .status(404)
        .json({ ok: false, error: 'Formation presentielle introuvable.' });
    }

    const purchase = await resolveFormationPurchaseForRequest({
      userId,
      formationId: formation._id,
      purchaseId: requestedPurchaseId,
      activeOnly: false
    });

    if (!purchase) {
      return res.status(403).json({ ok: false, error: 'Achat requis pour annuler cette formation.' });
    }

    const purchaseSessionId = String(purchase.sessionId || '').trim();
    const effectiveSessionId = requestedSessionId || purchaseSessionId;
    if (!effectiveSessionId || !validateObjectId(effectiveSessionId)) {
      console.warn('[CancelPresentiel] session introuvable', {
        userId,
        formationId,
        saleId: requestedSaleId || purchase.saleId || '',
        purchaseId: String(purchase._id || '')
      });
      return res.status(400).json({ ok: false, error: 'Session introuvable.' });
    }

    const session = await FormationSession.findOne({
      _id: effectiveSessionId,
      formationId: formation._id
    }).lean();
    if (!session) {
      console.warn('[CancelPresentiel] session absente en base', {
        userId,
        formationId,
        effectiveSessionId
      });
      return res.status(404).json({ ok: false, error: 'Session introuvable.' });
    }
    if (isInactiveFormationSessionStatus(session.status)) {
      return res.status(409).json({
        ok: false,
        error: 'Cette session a ete annulee par l institut. Consultez votre email pour choisir une option.'
      });
    }

    const now = new Date();
    const normalizedIp = extractClientIp(req);
    const previewSale = await resolveSaleForFormationPurchase({
      userId,
      formationId: formation._id,
      preferredSaleId: requestedSaleId || String(purchase.saleId || '').trim()
    });
    const refundEligibility = getPresentielRefundEligibility({
      sale: previewSale?.sale || null,
      formation: {
        ...formation,
        sessionDate: session.startDate
      },
      now
    });
    const eligibleRefund = Boolean(refundEligibility.eligibleRefund);

    console.info('[CancelPresentiel] decision', {
      userId: String(userId || ''),
      formationId: String(formation._id || ''),
      saleId: requestedSaleId || String(purchase.saleId || '').trim(),
      sessionStartAt: session.startDate || null,
      eligibleRefund,
      reason: refundEligibility.reason,
      refundDays: refundEligibility.refundDays,
      amountHint: Number.isFinite(Number(previewSale?.amount)) ? Number(previewSale.amount) : null
    });

    if (String(purchase.participationStatus || 'active') === 'canceled') {
      let existingRefund = await findExistingRefundForPurchase(purchase);
      if (eligibleRefund && !existingRefund) {
        try {
          existingRefund = await createPresentielRefundRequest({
            userId,
            formation,
            purchase,
            preferredSaleId: requestedSaleId,
            sessionStartAt: session.startDate,
            clientIp: normalizedIp
          });
        } catch (refundError) {
          if (refundError?.code === 'REFUND_ALREADY_EXISTS') {
            return res.status(409).json({
              ok: false,
              code: 'REFUND_ALREADY_EXISTS',
              error: 'REFUND_ALREADY_EXISTS'
            });
          }
          console.error('[CancelPresentiel] creation refund apres annulation existante', refundError);
        }
      }
      return res.json({
        ok: true,
        canceled: true,
        alreadyCanceled: true,
        eligibleRefund: Boolean(eligibleRefund),
        refundEligibility,
        refund: serializeRefundPayload(existingRefund),
        sessionStartAt: session.startDate || null
      });
    }

    const purchaseUpdate = {
      participationStatus: 'canceled',
      canceledAt: now,
      cancellationReason: REFUND_REASON_CLIENT_CANCEL_PRESENTIEL,
      cancellationEligibleRefund: Boolean(eligibleRefund),
      cancellationSessionStartAt: session.startDate || null
    };
    if (requestedSaleId && !purchase.saleId) {
      purchaseUpdate.saleId = requestedSaleId;
    }

    const updatedPurchase = await Purchase.findByIdAndUpdate(purchase._id, purchaseUpdate, {
      new: true
    });

    await FormationSession.findOneAndUpdate(
      { _id: session._id, reservedCount: { $gt: 0 } },
      { $inc: { reservedCount: -1 } }
    ).catch(() => {});

    let refundDoc = null;
    if (eligibleRefund) {
      try {
        refundDoc = await createPresentielRefundRequest({
          userId,
          formation,
          purchase: updatedPurchase || purchase,
          preferredSaleId: requestedSaleId,
          sessionStartAt: session.startDate,
          clientIp: normalizedIp
        });
      } catch (refundError) {
        if (refundError?.code === 'REFUND_ALREADY_EXISTS') {
          return res.status(409).json({
            ok: false,
            code: 'REFUND_ALREADY_EXISTS',
            error: 'REFUND_ALREADY_EXISTS'
          });
        }
        console.error('[CancelPresentiel] erreur creation refund request', refundError);
        return res.status(500).json({
          ok: false,
          error:
            'Annulation enregistree, mais la demande de remboursement a echoue. Reessayez dans quelques instants.'
        });
      }
    }

    // Notification — non bloquant
    try {
      const notifClient = await User.findById(userId).select('firstName lastName email').lean();
      const notifClientName = [notifClient?.firstName, notifClient?.lastName].filter(Boolean).join(' ') || notifClient?.email || '—';
      void triggerNotification('formation_participation_cancelled', {
        clientName: notifClientName,
        formationName: formation?.name || '—',
        sessionDate: session?.startDate
          ? new Date(session.startDate).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
          : 'Non renseignée',
        saleId: (updatedPurchase || purchase)?.saleId || ''
      });
    } catch (notifErr) {
      console.error('[Notif] formation_participation_cancelled failed:', notifErr?.message || notifErr);
    }

    try {
      const siteName = await resolveSiteName();
      const sessionLabel = formatSessionDateLabel(buildSessionPayload(session));
      const sessionTimeLabel = formatSessionTimeLabel(buildSessionPayload(session));
      const saleIdForMail = String(
        (updatedPurchase || purchase)?.saleId || requestedSaleId || previewSale?.sale?.saleId || ''
      ).trim();
      const amountPaid = Number.isFinite(Number(previewSale?.amount)) ? Number(previewSale.amount) : 0;
      const trackingUrl = refundDoc?.trackingToken
        ? `${getAppBaseUrl()}/vitrine.html?page=refund-tracking&token=${refundDoc.trackingToken}`
        : '';
      const customerName = `${String(req.sessionUser?.firstName || '').trim()} ${String(req.sessionUser?.lastName || '').trim()}`.trim();

      await sendClientSessionCancellationEmail({
        toEmail: String(req.sessionUser?.email || '').trim(),
        siteName,
        firstName: String(req.sessionUser?.firstName || '').trim(),
        lastName: String(req.sessionUser?.lastName || '').trim(),
        clientEmail: String(req.sessionUser?.email || '').trim(),
        formationTitle: String(formation?.name || '').trim() || 'Formation',
        sessionDateLabel: sessionLabel,
        sessionTimeLabel,
        saleId: saleIdForMail,
        amountPaid,
        refundAmount: Number(refundDoc?.amount || 0),
        refundStatus: refundDoc ? String(refundDoc.status || '').trim() : 'non_eligible',
        trackingUrl,
        eligibleRefund: Boolean(eligibleRefund)
      });

      const adminEmails = await collectAdminEmails();
      if (adminEmails.length) {
        await sendInstituteClientCancelledNoticeEmail({
          toEmails: adminEmails,
          siteName,
          customerName: customerName || String(req.sessionUser?.email || '').trim(),
          clientEmail: String(req.sessionUser?.email || '').trim(),
          formationTitle: String(formation?.name || '').trim() || 'Formation',
          sessionDateLabel: sessionLabel,
          sessionTimeLabel,
          saleId: saleIdForMail,
          amountPaid,
          eligibleRefund: Boolean(eligibleRefund),
          reason: REFUND_REASON_CLIENT_CANCEL_PRESENTIEL
        });
      }
    } catch (mailError) {
      console.error('Erreur envoi mails annulation client presentiel', mailError);
    }

    return res.json({
      ok: true,
      canceled: true,
      eligibleRefund: Boolean(eligibleRefund),
      refundEligibility,
      refund: serializeRefundPayload(refundDoc),
      sessionStartAt: session.startDate || null
    });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ ok: false, error: error.message || 'Action impossible.' });
    }
    console.error('Erreur annulation formation presentielle client', error);
    return res.status(500).json({ ok: false, error: 'Impossible d annuler cette formation.' });
  }
}

export async function addFavorite(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const rawType = String(req.body?.targetType || '').trim().toLowerCase();
  if (!FAVORITE_TARGET_MODELS[rawType]) {
    return res.status(400).json({ ok: false, error: 'Type de favori invalide.' });
  }
  const targetId = String(req.body?.targetId || '').trim();
  if (!validateObjectId(targetId)) {
    return res.status(400).json({ ok: false, error: 'Article invalide.' });
  }
  try {
    const target = await fetchFavoriteTarget(rawType, targetId);
    if (!target) {
      return res.status(404).json({ ok: false, error: 'Article introuvable.' });
    }
    const favorite = await Favorite.create({
      userId,
      targetType: rawType,
      targetId
    });
    const payload = buildFavoritePayload(favorite, target);
    return res.status(201).json({ ok: true, favorite: payload });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Favori deja enregistre.' });
    }
    console.error('Erreur ajout favori', error);
    return res.status(500).json({ ok: false, error: "Impossible d'enregistrer le favori." });
  }
}

export async function removeFavorite(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const favoriteId = String(req.params.id || '').trim();
  if (!validateObjectId(favoriteId)) {
    return res.status(400).json({ ok: false, error: 'Favori invalide.' });
  }
  try {
    const favorite = await Favorite.findOne({ _id: favoriteId, userId });
    if (!favorite) {
      return res.status(404).json({ ok: false, error: 'Favori introuvable.' });
    }
    await favorite.deleteOne();
    return res.json({ ok: true });
  } catch (error) {
    console.error('Erreur suppression favori', error);
    return res.status(500).json({ ok: false, error: 'Impossible de supprimer le favori.' });
  }
}

// TEMPORARY â€” FOR TEST PURPOSES ONLY
export async function changeFormationSession(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const formationId = String(req.params.formationId || '').trim();
  if (!validateObjectId(formationId)) {
    return res.status(400).json({ ok: false, error: 'Formation invalide.' });
  }
  const requestedPurchaseId = String(req.body?.purchaseId || req.query?.purchaseId || '').trim();
  const newSessionId = String(req.body?.newSessionId || '').trim();
  if (!validateObjectId(newSessionId)) {
    return res.status(400).json({ ok: false, error: 'Session invalide.' });
  }
  const formation = await loadPublishedFormation(formationId);
  if (!formation || formation.type !== 'presentiel') {
    return res.status(404).json({ ok: false, error: 'Formation prÃ©sentielle introuvable.' });
  }
  const purchase = await resolveFormationPurchaseForRequest({
    userId,
    formationId: formation._id,
    purchaseId: requestedPurchaseId,
    activeOnly: true
  });
  if (!purchase) {
    return res.status(403).json({ ok: false, error: 'Achat requis pour modifier la session.' });
  }
  if (String(purchase.participationStatus || 'active') === 'canceled') {
    return res.status(409).json({ ok: false, error: 'Cette formation est deja annulee.' });
  }
  const currentSessionId = purchase.sessionId?.toString();
  if (!currentSessionId) {
    return res.status(400).json({ ok: false, error: 'Aucune session Ã  modifier.' });
  }
  if (currentSessionId === newSessionId) {
    return res.status(400).json({ ok: false, error: 'La session sÃ©lectionnÃ©e est identique.' });
  }
  const targetSession = await FormationSession.findOne(
    buildActiveFormationSessionFilter({
      _id: newSessionId,
      formationId: formation._id
    })
  ).lean();
  if (!targetSession) {
    return res.status(404).json({ ok: false, error: 'Session introuvable.' });
  }
  const alreadyBookedTargetSession = await Purchase.exists({
    userId,
    itemType: 'formation',
    formationId: formation._id,
    sessionId: targetSession._id,
    participationStatus: { $ne: 'canceled' },
    _id: { $ne: purchase._id }
  });
  if (alreadyBookedTargetSession) {
    return res.status(409).json({ ok: false, error: 'Cette session est deja reservee sur un autre achat.' });
  }
  if (Number(targetSession.reservedCount || 0) >= Number(targetSession.maxClients || 0)) {
    return res.status(409).json({ ok: false, error: 'Session complÃ¨te.' });
  }
  let updatedTargetSession = null;
  try {
    updatedTargetSession = await FormationSession.findOneAndUpdate(
      buildActiveFormationSessionFilter({
        _id: targetSession._id,
        formationId: formation._id,
        reservedCount: { $lt: targetSession.maxClients }
      }),
      { $inc: { reservedCount: 1 } },
      { new: true }
    );
    if (!updatedTargetSession) {
      return res.status(409).json({ ok: false, error: 'Session complÃ¨te.' });
    }
    const decrementedSession = await FormationSession.findOneAndUpdate(
      {
        _id: currentSessionId,
        reservedCount: { $gt: 0 }
      },
      { $inc: { reservedCount: -1 } },
      { new: true }
    );
    if (!decrementedSession) {
      throw Object.assign(new Error('Impossible de libÃ©rer la session prÃ©cÃ©dente.'), { status: 500 });
    }
    const updatedPurchase = await Purchase.findByIdAndUpdate(
      purchase._id,
      { sessionId: updatedTargetSession._id },
      { new: true }
    ).lean();
    return res.json({
      ok: true,
      session: updatedTargetSession,
      purchase: serializePurchasePayload(updatedPurchase, formation, updatedTargetSession, null)
    });
  } catch (error) {
    if (updatedTargetSession) {
      await FormationSession.findByIdAndUpdate(updatedTargetSession._id, { $inc: { reservedCount: -1 } }).catch(
        () => {}
      );
    }
    const status = error?.status || 500;
    const message = status === 500 ? 'Impossible de changer la session.' : error.message;
    return res.status(status).json({ ok: false, error: message });
  }
}

async function rollbackSingleSale({ sale, purchase, session }) {
  if (session) {
    await FormationSession.findByIdAndUpdate(session._id, { $inc: { reservedCount: -1 } }).catch(
      () => {}
    );
  }
  if (purchase) {
    await Purchase.deleteOne({ _id: purchase._id }).catch(() => {});
  }
  if (sale) {
    await Sale.deleteOne({ _id: sale._id }).catch(() => {});
  }
}

async function clearCartSnapshotBestEffort(userId) {
  if (!userId) return;
  try {
    await CartSnapshot.deleteOne({ userId });
  } catch (error) {
    console.error('Erreur suppression CartSnapshot (best effort)', error);
  }
}

// Phase 1B-4: guard for the free / 0€ finalization path. When an order is finalized
// WITHOUT Stripe (POST /api/client/checkout/finalize-free), the REAL remaining amount
// (catalog prices minus the actual gift-card coverage computed server-side) MUST be 0.
// Otherwise a balance is still due and the order has to go through Stripe — this
// prevents finalizing a partially-paid order for free.
function assertZeroRemainingForFreeOrder(requireZeroRemaining, remainingAmount) {
  if (!requireZeroRemaining) return;
  if (roundToCents(remainingAmount) > 0) {
    const err = new Error('Un montant reste du: ce paiement ne peut pas etre finalise sans reglement.');
    err.status = 402;
    err.code = 'PAYMENT_REQUIRED';
    throw err;
  }
}

async function processCartCheckoutStatePurchase({
  userId,
  customer,
  normalizedCheckoutState,
  normalizedIp,
  normalizedStripeSessionId,
  normalizedStripePaymentIntentId,
  legalDateAchat,
  requireZeroRemaining = false,
  legalConsentSnapshot = null
}) {
  const cartItems = Array.isArray(normalizedCheckoutState?.items) ? normalizedCheckoutState.items : [];
  const rawGiftCards = Array.isArray(normalizedCheckoutState?.appliedGiftCards)
    ? normalizedCheckoutState.appliedGiftCards
    : [];
  const refundPolicySnapshots = normalizedCheckoutState?.refundPolicySnapshots || {};

  const applyStripeFieldsToSale = async saleDoc => {
    if (!saleDoc) return;
    const stripePatch = {};
    if (normalizedStripeSessionId) stripePatch.stripeSessionId = normalizedStripeSessionId;
    if (normalizedStripePaymentIntentId) {
      stripePatch.stripePaymentIntentId = normalizedStripePaymentIntentId;
    }
    if (!Object.keys(stripePatch).length) return;
    await Sale.findByIdAndUpdate(saleDoc._id, stripePatch);
    Object.assign(saleDoc, stripePatch);
  };

  const formationIds = [
    ...new Set(
      cartItems
        .filter(i => String(i?.type || '').toLowerCase() === 'formation')
        .map(i => String(i?.id || '').trim())
        .filter(Boolean)
    )
  ];
  const productIds = [
    ...new Set(
      cartItems
        .filter(i => String(i?.type || '').toLowerCase() === 'product')
        .map(i => String(i?.id || '').trim())
        .filter(Boolean)
    )
  ];
  const sessionIds = [
    ...new Set(cartItems.map(i => String(i?.sessionId || '').trim()).filter(Boolean))
  ];

  const [formations, products, sessions, formationPromotions, productPromotions] = await Promise.all([
    formationIds.length ? Formation.find({ _id: { $in: formationIds } }).lean() : [],
    productIds.length ? Product.find({ _id: { $in: productIds } }).lean() : [],
    sessionIds.length
      ? FormationSession.find(buildActiveFormationSessionFilter({ _id: { $in: sessionIds } })).lean()
      : [],
    formationIds.length ? getActivePromotionsForTargets('formation', formationIds) : new Map(),
    productIds.length ? getActivePromotionsForTargets('product', productIds) : new Map()
  ]);

  const formationMap = new Map(formations.map(f => [f._id.toString(), f]));
  const productMap = new Map(products.map(p => [p._id.toString(), p]));
  const sessionMap = new Map(sessions.map(s => [s._id.toString(), s]));

  const saleItems = [];
  const createdPurchases = [];
  const reservedSessions = [];
  let saleRecord = null;
  let postSaleSideEffectsApplied = false;

  try {
    for (const item of cartItems) {
      const itemType = String(item?.type || '').trim().toLowerCase();
      const itemId = String(item?.id || '').trim();
      const itemSessionId = String(item?.sessionId || '').trim() || null;
      const selectedOptions = Array.isArray(item?.selectedOptions) ? item.selectedOptions : [];

      const policySnapshot = refundPolicySnapshots[itemId] || null;
      const consumerWaiverSnapshot =
        itemType === 'formation' && policySnapshot
          ? {
              refundDays: policySnapshot.refundDays ?? null,
              retractationDays: 14,
              waiverType: policySnapshot.waiverType || null,
              waiverAcceptedAt: policySnapshot.acceptedAt
                ? new Date(policySnapshot.acceptedAt)
                : null
            }
          : { refundDays: null, retractationDays: 14, waiverType: null, waiverAcceptedAt: null };

      if (itemType === 'product') {
        const product = productMap.get(itemId);
        if (!product || !product.active) {
          const err = new Error('Produit introuvable.');
          err.status = 404;
          throw err;
        }
        const alreadyPurchased = await Purchase.exists({
          userId,
          itemType: 'product',
          itemId: product._id
        });
        if (alreadyPurchased) {
          const err = new Error('Vous avez deja achete ce produit.');
          err.status = 409;
          throw err;
        }
        const purchase = new Purchase({
          userId,
          formationId: null,
          sessionId: null,
          paymentProvider: 'stripe',
          paymentStatus: 'paid',
          paymentRef: normalizedStripeSessionId || `STRIPE-${Date.now()}`,
          itemType: 'product',
          itemId: product._id,
          createdAt: new Date()
        });
        await purchase.save();
        createdPurchases.push({ purchase, session: null });

        const promotion = productPromotions.get(itemId);
        const saleItem = buildSaleEntry({
          type: 'product',
          itemId: product._id,
          name: product.name,
          basePrice: Number(product.price || 0),
          promotion
        });
        saleItem.consumerWaiverSnapshot = consumerWaiverSnapshot;
        saleItems.push(saleItem);
      } else {
        const formation = formationMap.get(itemId);
        if (!formation || formation.status !== 'published') {
          const err = new Error('Formation introuvable.');
          err.status = 404;
          throw err;
        }

        let purchaseSelectedOptions = [];
        let optionSaleItems = [];
        let reservedSession = null;

        if (formation.type === 'presentiel') {
          if (!itemSessionId || !validateObjectId(itemSessionId)) {
            const err = new Error('Session requise pour une formation en presentiel.');
            err.status = 400;
            throw err;
          }
          const alreadyPurchased = await Purchase.exists({
            userId,
            itemType: 'formation',
            itemId: formation._id,
            sessionId: itemSessionId,
            participationStatus: { $ne: 'canceled' }
          });
          if (alreadyPurchased) {
            const err = new Error('Vous avez deja achete cette session.');
            err.status = 409;
            err.code = 'ALREADY_PURCHASED';
            throw err;
          }
          const targetSession = sessionMap.get(itemSessionId);
          if (!targetSession) {
            const err = new Error('Session introuvable.');
            err.status = 404;
            throw err;
          }
          const updatedSession = await FormationSession.findOneAndUpdate(
            buildActiveFormationSessionFilter({
              _id: targetSession._id,
              formationId: formation._id,
              reservedCount: { $lt: targetSession.maxClients }
            }),
            { $inc: { reservedCount: 1 } },
            { new: true }
          );
          if (!updatedSession) {
            const err = new Error('Session complete.');
            err.status = 409;
            throw err;
          }
          reservedSession = updatedSession;
          reservedSessions.push(updatedSession);

          const optionsResult = validateAndBuildSelectedOptions(
            selectedOptions,
            formation,
            targetSession.startDate
          );
          purchaseSelectedOptions = optionsResult.selectedOptions;
          optionSaleItems = optionsResult.optionSaleItems;
        } else {
          const alreadyPurchased = await Purchase.exists({
            userId,
            itemType: 'formation',
            itemId: formation._id,
            sessionId: null,
            participationStatus: { $ne: 'canceled' }
          });
          if (alreadyPurchased) {
            const err = new Error('Vous avez deja achete cette formation.');
            err.status = 409;
            throw err;
          }
        }

        const purchase = new Purchase({
          userId,
          formationId: formation._id,
          sessionId: reservedSession ? reservedSession._id : null,
          paymentProvider: 'stripe',
          paymentStatus: 'paid',
          paymentRef: normalizedStripeSessionId || `STRIPE-${Date.now()}`,
          itemType: 'formation',
          itemId: formation._id,
          selectedOptions: purchaseSelectedOptions,
          createdAt: new Date()
        });
        await purchase.save();
        createdPurchases.push({ purchase, session: reservedSession });

        const promotion = formationPromotions.get(itemId);
        const mainSaleItem = buildSaleEntry({
          type: 'formation',
          itemId: formation._id,
          formationId: formation._id,
          name: formation.name,
          basePrice: Number(formation.price || 0),
          promotion
        });
        mainSaleItem.consumerWaiverSnapshot = consumerWaiverSnapshot;
        saleItems.push(mainSaleItem);

        for (const optItem of optionSaleItems) {
          optItem.consumerWaiverSnapshot = consumerWaiverSnapshot;
          saleItems.push(optItem);
        }
      }
    }

    const totalAmount = saleItems.reduce((sum, e) => sum + Number(e.finalPrice || 0), 0);
    const giftPlan = await planGiftCardUsage(rawGiftCards, totalAmount, {
      requirePassword: false,
      reservationPaymentIntentId: normalizedStripePaymentIntentId
    });
    assertZeroRemainingForFreeOrder(requireZeroRemaining, giftPlan.remainingAmount);

    const firstAcceptedWaiver = Array.isArray(normalizedCheckoutState?.consumerWaivers)
      ? normalizedCheckoutState.consumerWaivers.find(w => w.accepted && w.text)
      : null;
    const consumerWaiver = {
      accepted_cgv: true,
      renonciation_text: firstAcceptedWaiver?.text || null,
      date_formation: null,
      date_achat: legalDateAchat,
      consumerWaiverAcceptedText: firstAcceptedWaiver?.text || null,
      consumerWaiverAcceptedAt: firstAcceptedWaiver ? legalDateAchat : null
    };

    // A7 — si le panier contient une formation distancielle, marquer la livraison
    // d'accès (pas de faux « accès immédiat »).
    const cartDistancielFormation = formations.find(
      f => String(f?.type || '').toLowerCase() === 'distanciel'
    );
    const cartAccessDeliveryStatus = cartDistancielFormation
      ? resolveAccessDeliveryStatusForFormation(cartDistancielFormation)
      : null;

    saleRecord = await persistSale({
      userId,
      customer,
      items: saleItems,
      giftCardUsage: giftPlan.saleEntries,
      consumerWaiver,
      clientIp: normalizedIp,
      stripePaymentIntentId: normalizedStripePaymentIntentId,
      stripeSessionId: normalizedStripeSessionId,
      skipPostSaleSideEffects: true,
      legalConsentSnapshot,
      accessDeliveryStatus: cartAccessDeliveryStatus
    });

    await applyStripeFieldsToSale(saleRecord);

    const formationEntries = saleItems.map(buildFormationEntryFromSale).filter(Boolean);
    if (saleRecord && formationEntries.length) {
      const commissionTransactions = await recordCommissionTransactions({
        saleId: saleRecord.saleId,
        formationEntries
      });
      await applySaleCommissionSnapshot(saleRecord, commissionTransactions);
    }

    if (saleRecord?._id && createdPurchases.length) {
      const purchaseIds = createdPurchases.map(e => e.purchase?._id).filter(Boolean);
      await Purchase.updateMany({ _id: { $in: purchaseIds } }, { saleId: saleRecord.saleId }).catch(
        () => {}
      );
    }

    if (saleRecord) {
      await runPostSaleSideEffects(saleRecord, {
        giftCardSettlement: {
          userId,
          saleItems,
          usages: giftPlan.usages,
          paymentIntentId: normalizedStripePaymentIntentId
        }
      });
      postSaleSideEffectsApplied = true;
    }

    await clearCartSnapshotBestEffort(userId);
    return { ok: true, saleId: saleRecord?.saleId };
  } catch (error) {
    if (!postSaleSideEffectsApplied) {
      const purchaseIds = createdPurchases.map(e => e.purchase?._id).filter(Boolean);
      if (purchaseIds.length) {
        await Purchase.deleteMany({ _id: { $in: purchaseIds } }).catch(() => {});
      }
      await Promise.all(
        reservedSessions.map(session =>
          FormationSession.findByIdAndUpdate(session._id, { $inc: { reservedCount: -1 } })
        )
      ).catch(() => {});
      if (saleRecord) {
        await Sale.deleteOne({ _id: saleRecord._id }).catch(() => {});
      }
    }
    throw error;
  }
}

/**
 * Process a service booking purchase from a pre-validated checkoutState (Stripe webhook or mock-pay).
 * Creates the ServiceBooking and Sale from checkoutState data — no pre-existing bookingId needed.
 */
async function processServiceCheckoutStatePurchase({
  userId,
  customer,
  normalizedCheckoutState,
  normalizedIp,
  normalizedStripeSessionId,
  normalizedStripePaymentIntentId,
  requireZeroRemaining = false,
  legalConsentSnapshot = null
}) {
  const serviceData = normalizedCheckoutState?.service;
  if (!serviceData?.serviceId || !serviceData?.slotStart || !serviceData?.slotEnd) {
    throw Object.assign(new Error('Données de réservation incomplètes dans checkoutState.'), { status: 400 });
  }

  const service = await Service.findById(serviceData.serviceId).lean();
  if (!service || !service.isActive) {
    throw Object.assign(new Error('Prestation introuvable ou inactive.'), { status: 404 });
  }

  // Compute effective service price (apply promo if active)
  const effectiveServicePrice = (() => {
    const promo = service.promotion;
    if (promo?.isActive) {
      const now = new Date();
      const start = promo.startDate ? new Date(promo.startDate) : null;
      const end = promo.endDate ? new Date(promo.endDate) : null;
      if ((!start || now >= start) && (!end || now <= end)) {
        if (promo.type === 'percentage') return roundToCents(service.price * (1 - promo.value / 100));
        if (promo.type === 'fixed') return roundToCents(Math.max(0, service.price - promo.value));
      }
    }
    return service.price;
  })();

  // Validate and price selected options
  const rawOptions = Array.isArray(serviceData.selectedOptions) ? serviceData.selectedOptions : [];
  let optionsTotal = 0;
  const validatedOptions = [];
  for (const sel of rawOptions) {
    const opt = (service.options || []).find(o => String(o._id) === String(sel.optionId) && o.isActive !== false);
    if (!opt) continue;
    const optPrice = roundToCents(opt.price || 0);
    validatedOptions.push({ optionId: opt._id, name: opt.name, price: optPrice });
    optionsTotal += optPrice;
  }

  const totalPrice = roundToCents(effectiveServicePrice + optionsTotal);

  const depositAmount = (() => {
    if (service.paymentType === 'deposit') {
      if (service.depositType === 'percentage') return roundToCents(totalPrice * service.depositValue / 100);
      return roundToCents(Math.min(service.depositValue, totalPrice));
    }
    return 0;
  })();

  // Gift card plan — capped at deposit amount for deposit payments
  const rawGiftCards = Array.isArray(normalizedCheckoutState?.appliedGiftCards)
    ? normalizedCheckoutState.appliedGiftCards
    : [];
  const giftCardBase = service.paymentType === 'deposit' ? depositAmount : totalPrice;
  const giftPlan = await planGiftCardUsage(rawGiftCards, giftCardBase, {
    requirePassword: false,
    reservationPaymentIntentId: normalizedStripePaymentIntentId
  });
  // Phase 1B-4: for a free finalization, ensure nothing remains due BEFORE creating the
  // booking, so we never leave an orphan ServiceBooking when payment is actually required.
  assertZeroRemainingForFreeOrder(requireZeroRemaining, giftPlan.remainingAmount);

  // Waiver snapshot from checkoutState legal
  const legal = normalizedCheckoutState?.legal || {};
  const waiverAcceptedAt = legal.waiverAcceptedAt ? new Date(legal.waiverAcceptedAt) : null;
  const consumerWaiverSnapshot = {
    refundDays: service.cancellationDays || 0,
    retractationDays: 14,
    waiverType: legal.waiverType || null,
    waiverAcceptedAt
  };

  // Resolve practitioner (optional)
  const rawPractitionerId = serviceData.practitionerId || null;
  let practitionerObjectId = null;
  if (rawPractitionerId && mongoose.Types.ObjectId.isValid(String(rawPractitionerId))) {
    const practitioner = await PractitionerProfile.findById(rawPractitionerId).lean();
    if (practitioner?.isActive) practitionerObjectId = practitioner._id;
  }
  if (!practitionerObjectId) {
    throw Object.assign(new Error('Praticienne introuvable.'), {
      status: 404,
      code: 'PRACTITIONER_NOT_FOUND'
    });
  }

  // Generate bookingId
  const bookingIdSuffix = crypto.randomUUID().split('-')[0];
  const newBookingId = `BKG-${Date.now()}-${bookingIdSuffix}`;

  const startAt = new Date(serviceData.slotStart);
  const endAt = new Date(serviceData.slotEnd);

  // Create ServiceBooking
  const { booking } = await createServiceBookingWithProtection({
    bookingData: {
      bookingId: newBookingId,
      clientId: userId,
      serviceId: service._id,
      practitionerId: practitionerObjectId,
      startAt,
      endAt,
      totalPrice,
      depositAmount,
      paymentType: service.paymentType || 'full',
      paymentStatus: service.paymentType === 'deposit' ? 'deposit_paid' : 'paid',
      status: 'confirmed',
      selectedOptions: validatedOptions,
      consumerWaiverSnapshot,
      stripePaymentIntentId: normalizedStripePaymentIntentId || null
    },
    service
  });

  // For deposit payments, totalAmount = deposit charged now (not full service price)
  const saleTotal = service.paymentType === 'deposit' ? depositAmount : totalPrice;

  // Sale items store full unit prices — the deposit ratio is applied in stripeInvoiceService
  const saleItems = [
    {
      type: 'service',
      itemId: service._id,
      name: service.name,
      basePrice: effectiveServicePrice,
      finalPrice: effectiveServicePrice,
      price: effectiveServicePrice,
      consumerWaiverSnapshot
    },
    ...validatedOptions.map(opt => ({
      type: 'service-option',
      itemId: opt.optionId,
      name: opt.name,
      basePrice: opt.price,
      finalPrice: opt.price,
      price: opt.price
    }))
  ];

  const saleId = buildSaleId();
  const sale = new Sale({
    saleId,
    userId,
    customer,
    items: saleItems,
    totalAmount: saleTotal,
    itemCount: saleItems.length,
    accepted_cgv: true,
    client_ip: normalizedIp || '0.0.0.0',
    giftCardUsage: giftPlan.saleEntries,
    legalConsentSnapshot: legalConsentSnapshot || undefined,
    // B1 — snapshot fiscal V1 (TVA non applicable, HT=TTC).
    taxSnapshot: buildTaxSnapshot(saleTotal)
  });
  if (normalizedStripeSessionId) sale.stripeSessionId = normalizedStripeSessionId;
  if (normalizedStripePaymentIntentId) sale.stripePaymentIntentId = normalizedStripePaymentIntentId;

  const savedSale = await sale.save();

  // Link sale to booking
  await ServiceBooking.findByIdAndUpdate(booking._id, { saleId: savedSale.saleId });

  // Notification booking confirmé via Stripe
  const stripeNotifClientName = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || customer?.email || '—';
  void triggerNotification('booking_created', {
    clientName: stripeNotifClientName,
    serviceName: service.name,
    bookingDate: booking.startAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
    bookingTime: booking.startAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    userId: practitionerObjectId ? String(practitionerObjectId) : '',
    link: '/gestion.html?page=planning',
    linkLabel: 'Voir le planning'
  });

  await runPostSaleSideEffects(savedSale, {
    giftCardSettlement: giftPlan.usages.length
      ? { userId, saleItems, usages: giftPlan.usages, paymentIntentId: normalizedStripePaymentIntentId }
      : null
  });
  // Audit-only events (best-effort, no side effect). Booking is created confirmed.
  await emitSaleEvent('sale.finalized', savedSale);
  await emitBookingEvent('booking.created', booking);
  await emitBookingEvent('booking.confirmed', booking);
  return savedSale;
}

/**
 * Process a purchase from a pre-validated checkoutState (used by Stripe webhook).
 * Mirrors mockPay logic but takes pre-validated data from checkoutState.
 * Does NOT call validateAndBuildConsumerWaiver — legal validation already done at session creation.
 */
export async function processCheckoutStatePurchase({
  userId,
  itemType,
  itemId,
  sessionId: rawSessionId,
  selectedOptions: rawSelectedOptions = [],
  appliedGiftCards: rawGiftCards = [],
  checkoutState = null,
  waiverText,
  clientIp,
  stripeSessionId,
  stripePaymentIntentId,
  requireZeroRemaining = false
}) {
  const user = await User.findById(userId).lean();
  if (!user) {
    const err = new Error('Utilisateur introuvable.');
    err.status = 400;
    throw err;
  }
  const customer = buildCustomerProfile(user);
  const normalizedCheckoutState =
    checkoutState && typeof checkoutState === 'object' ? checkoutState : null;
  const normalizedIp = String(clientIp || '').trim() || '0.0.0.0';
  const rawItemType = String(itemType || '').trim().toLowerCase();
  const normalizedItemType =
    rawItemType === 'product' ? 'product'
    : rawItemType === 'gift-card' ? 'gift-card'
    : rawItemType === 'service' ? 'service'
    : 'formation';
  const normalizedStripeSessionId = String(stripeSessionId || '').trim() || null;
  const normalizedStripePaymentIntentId =
    String(stripePaymentIntentId || normalizedStripeSessionId || '').trim() || null;
  const legalDateAchat = new Date();

  // Sprint pré-React A1 — snapshot des consentements légaux capturés à l'achat,
  // dérivé du checkoutState revalidé. Stocké sur la vente (audit/preuve).
  const legalConsentSnapshot = normalizedCheckoutState
    ? buildLegalConsentSnapshot({
        checkoutState: normalizedCheckoutState,
        acceptedAt: legalDateAchat,
        source: requireZeroRemaining ? 'free_checkout' : 'stripe_checkout'
      })
    : null;

  // Multi-item cart: delegate to dedicated handler
  if (normalizedCheckoutState?.cart === true) {
    return processCartCheckoutStatePurchase({
      userId,
      customer,
      normalizedCheckoutState,
      normalizedIp,
      normalizedStripeSessionId,
      normalizedStripePaymentIntentId,
      legalDateAchat,
      requireZeroRemaining,
      legalConsentSnapshot
    });
  }

  // Service booking: delegate to dedicated handler
  if (normalizedItemType === 'service') {
    return processServiceCheckoutStatePurchase({
      userId,
      customer,
      normalizedCheckoutState,
      normalizedIp,
      normalizedStripeSessionId,
      normalizedStripePaymentIntentId,
      requireZeroRemaining,
      legalConsentSnapshot
    });
  }

  let saleRecord = null;
  let purchaseRecord = null;
  let reservedSession = null;
  let createdGiftCard = null;
  let postSaleSideEffectsApplied = false;

  const applyStripeFieldsToSale = async saleDoc => {
    if (!saleDoc) return;
    const stripePatch = {};
    if (normalizedStripeSessionId) {
      stripePatch.stripeSessionId = normalizedStripeSessionId;
    }
    if (normalizedStripePaymentIntentId) {
      stripePatch.stripePaymentIntentId = normalizedStripePaymentIntentId;
    }
    if (!Object.keys(stripePatch).length) return;
    await Sale.findByIdAndUpdate(saleDoc._id, stripePatch);
    Object.assign(saleDoc, stripePatch);
  };

  try {
    if (normalizedItemType === 'formation') {
      const formation = await Formation.findById(itemId).lean();
      if (!formation || formation.status !== 'published') {
        const err = new Error('Formation introuvable.');
        err.status = 404;
        throw err;
      }
      let consumerWaiver;
      let purchaseSelectedOptions = [];
      let optionSaleItemsForStripe = [];

      if (formation.type === 'presentiel') {
        if (!validateObjectId(rawSessionId)) {
          const err = new Error('Session requise pour une formation en presentiel.');
          err.status = 400;
          throw err;
        }
        const alreadyPurchasedSameSession = await Purchase.exists({
          userId,
          itemType: 'formation',
          itemId: formation._id,
          sessionId: rawSessionId,
          participationStatus: { $ne: 'canceled' }
        });
        if (alreadyPurchasedSameSession) {
          const err = new Error('Vous avez deja achete cette session.');
          err.status = 409;
          err.code = 'ALREADY_PURCHASED';
          throw err;
        }
        const targetSession = await FormationSession.findOne(
          buildActiveFormationSessionFilter({ _id: rawSessionId, formationId: formation._id })
        ).lean();
        if (!targetSession) {
          const err = new Error('Session introuvable.');
          err.status = 404;
          throw err;
        }
        consumerWaiver = {
          accepted_cgv: true,
          renonciation_text: waiverText || null,
          date_formation: targetSession.startDate,
          date_achat: legalDateAchat,
          consumerWaiverAcceptedText: waiverText || null,
          consumerWaiverAcceptedAt: waiverText ? legalDateAchat : null
        };
        const updatedSession = await FormationSession.findOneAndUpdate(
          buildActiveFormationSessionFilter({
            _id: targetSession._id,
            formationId: formation._id,
            reservedCount: { $lt: targetSession.maxClients }
          }),
          { $inc: { reservedCount: 1 } },
          { new: true }
        );
        if (!updatedSession) {
          const err = new Error('Session complete.');
          err.status = 409;
          throw err;
        }
        reservedSession = updatedSession;
        const optionsResult = validateAndBuildSelectedOptions(
          rawSelectedOptions,
          formation,
          targetSession.startDate
        );
        purchaseSelectedOptions = optionsResult.selectedOptions;
        optionSaleItemsForStripe = optionsResult.optionSaleItems;
      } else {
        const alreadyPurchased = await Purchase.exists({
          userId,
          itemType: 'formation',
          itemId: formation._id,
          sessionId: null,
          participationStatus: { $ne: 'canceled' }
        });
        if (alreadyPurchased) {
          const err = new Error('Vous avez deja achete cette formation.');
          err.status = 409;
          throw err;
        }
        consumerWaiver = {
          accepted_cgv: true,
          renonciation_text: waiverText || null,
          date_formation: null,
          date_achat: legalDateAchat,
          consumerWaiverAcceptedText: waiverText || null,
          consumerWaiverAcceptedAt: waiverText ? legalDateAchat : null
        };
      }

      const purchase = new Purchase({
        userId,
        formationId: formation._id,
        sessionId: reservedSession ? reservedSession._id : null,
        paymentProvider: 'stripe',
        paymentStatus: 'paid',
        paymentRef: stripeSessionId || `STRIPE-${Date.now()}`,
        itemType: 'formation',
        itemId: formation._id,
        selectedOptions: purchaseSelectedOptions,
        createdAt: new Date()
      });
      await purchase.save();
      purchaseRecord = purchase;

      const promotion = await getActivePromotion('formation', formation._id);
      const saleItems = [
        buildSaleEntry({
          type: 'formation',
          itemId: formation._id,
          formationId: formation._id,
          name: formation.name,
          basePrice: Number(formation.price || 0),
          promotion
        }),
        ...optionSaleItemsForStripe
      ];
      const totalAmount = saleItems.reduce((sum, entry) => sum + Number(entry.finalPrice || 0), 0);
      const giftPlan = await planGiftCardUsage(rawGiftCards, totalAmount, {
        requirePassword: false,
        reservationPaymentIntentId: normalizedStripePaymentIntentId
      });
      assertZeroRemainingForFreeOrder(requireZeroRemaining, giftPlan.remainingAmount);

      saleRecord = await persistSale({
        userId,
        customer,
        items: saleItems,
        giftCardUsage: giftPlan.saleEntries,
        consumerWaiver,
        clientIp: normalizedIp,
        stripePaymentIntentId: normalizedStripePaymentIntentId,
        stripeSessionId: normalizedStripeSessionId,
        skipPostSaleSideEffects: true,
        legalConsentSnapshot,
        // A7 — marqueur d'accès distanciel (null pour présentiel).
        accessDeliveryStatus: resolveAccessDeliveryStatusForFormation(formation),
        // C3 — accès distanciel immédiat octroyé → horodatage (non remboursable ensuite).
        accessGrantedAt: resolveAccessDeliveryStatusForFormation(formation) === 'immediate' ? new Date() : null
      });

      await applyStripeFieldsToSale(saleRecord);

      const formationEntries = saleItems.map(buildFormationEntryFromSale).filter(Boolean);
      if (saleRecord && formationEntries.length) {
        const commissionTransactions = await recordCommissionTransactions({
          saleId: saleRecord.saleId,
          formationEntries
        });
        await applySaleCommissionSnapshot(saleRecord, commissionTransactions);
      }
      if (saleRecord?._id && purchaseRecord?._id) {
        await Purchase.findByIdAndUpdate(purchaseRecord._id, { saleId: saleRecord.saleId }).catch(() => {});
      }
      if (saleRecord) {
        await runPostSaleSideEffects(saleRecord, {
          giftCardSettlement: {
            userId,
            saleItems,
            usages: giftPlan.usages,
            paymentIntentId: normalizedStripePaymentIntentId
          }
        });
        postSaleSideEffectsApplied = true;
      }
      await clearCartSnapshotBestEffort(userId);
      return { ok: true, saleId: saleRecord?.saleId };
    }

    if (normalizedItemType === 'gift-card') {
      const checkoutItem =
        normalizedCheckoutState?.item && typeof normalizedCheckoutState.item === 'object'
          ? normalizedCheckoutState.item
          : {};
      const checkoutLegal =
        normalizedCheckoutState?.legal && typeof normalizedCheckoutState.legal === 'object'
          ? normalizedCheckoutState.legal
          : {};
      const rawGiftCardAmount = Number(
        checkoutItem?.amount ??
          normalizedCheckoutState?.totals?.subtotal ??
          normalizedCheckoutState?.totals?.basePrice ??
          normalizedCheckoutState?.totals?.remainingToPay
      );
      const giftCardAmount = roundToCents(rawGiftCardAmount);
      if (!Number.isFinite(giftCardAmount) || giftCardAmount <= 0) {
        const err = new Error('Montant carte cadeau invalide.');
        err.status = 400;
        err.code = 'GIFT_CARD_AMOUNT_INVALID';
        throw err;
      }

      const { createGiftCardForPurchase } = await import('./giftCardController.js');
      const giftCardCreation = await createGiftCardForPurchase({
        userId,
        amount: giftCardAmount,
        purchasedAt: legalDateAchat,
        enforceMinAmount: false
      });
      createdGiftCard = giftCardCreation.giftCard;

      const giftCardLabel = String(checkoutItem?.name || 'Carte cadeau').trim() || 'Carte cadeau';
      const consumerWaiver = {
        accepted_cgv: checkoutLegal.acceptedCgv !== false,
        renonciation_text: waiverText || null,
        date_formation: null,
        date_achat: legalDateAchat,
        consumerWaiverAcceptedText: waiverText || null,
        consumerWaiverAcceptedAt: waiverText ? legalDateAchat : null
      };
      const saleItems = [
        {
          type: 'gift-card',
          itemId: createdGiftCard._id,
          name: giftCardLabel,
          basePrice: giftCardAmount,
          finalPrice: giftCardAmount,
          price: giftCardAmount,
          promotionApplied: false,
          promotionId: null
        }
      ];
      const giftPlan = await planGiftCardUsage(rawGiftCards, giftCardAmount, {
        requirePassword: false,
        reservationPaymentIntentId: normalizedStripePaymentIntentId
      });
      assertZeroRemainingForFreeOrder(requireZeroRemaining, giftPlan.remainingAmount);

      saleRecord = await persistSale({
        userId,
        customer,
        items: saleItems,
        giftCardUsage: giftPlan.saleEntries,
        consumerWaiver,
        clientIp: normalizedIp,
        stripePaymentIntentId: normalizedStripePaymentIntentId,
        stripeSessionId: normalizedStripeSessionId,
        skipPostSaleSideEffects: true,
        legalConsentSnapshot
      });

      await applyStripeFieldsToSale(saleRecord);

      if (saleRecord?.saleId && createdGiftCard?._id) {
        createdGiftCard.saleId = saleRecord.saleId;
        await createdGiftCard.save();
      }

      if (saleRecord) {
        await runPostSaleSideEffects(saleRecord, {
          giftCardSettlement: {
            userId,
            saleItems,
            usages: giftPlan.usages,
            paymentIntentId: normalizedStripePaymentIntentId
          }
        });
        postSaleSideEffectsApplied = true;
      }
      await clearCartSnapshotBestEffort(userId);
      return { ok: true, saleId: saleRecord?.saleId };
    }

    // Product
    const product = await Product.findById(itemId).lean();
    if (!product || !product.active) {
      const err = new Error('Produit introuvable.');
      err.status = 404;
      throw err;
    }
    const alreadyPurchased = await Purchase.exists({ userId, itemType: 'product', itemId: product._id });
    if (alreadyPurchased) {
      const err = new Error('Vous avez deja achete ce produit.');
      err.status = 409;
      throw err;
    }
    const consumerWaiver = {
      accepted_cgv: true,
      renonciation_text: waiverText || null,
      date_formation: null,
      date_achat: legalDateAchat,
      consumerWaiverAcceptedText: waiverText || null,
      consumerWaiverAcceptedAt: waiverText ? legalDateAchat : null
    };

    const purchase = new Purchase({
      userId,
      formationId: null,
      sessionId: null,
      paymentProvider: 'stripe',
      paymentStatus: 'paid',
      paymentRef: stripeSessionId || `STRIPE-${Date.now()}`,
      itemType: 'product',
      itemId: product._id,
      createdAt: new Date()
    });
    await purchase.save();
    purchaseRecord = purchase;

    const promotion = await getActivePromotion('product', product._id);
    const saleItems = [
      buildSaleEntry({
        type: 'product',
        itemId: product._id,
        name: product.name,
        basePrice: Number(product.price || 0),
        promotion
      })
    ];
    const totalAmount = saleItems.reduce((sum, entry) => sum + Number(entry.finalPrice || 0), 0);
    const giftPlan = await planGiftCardUsage(rawGiftCards, totalAmount, {
      requirePassword: false,
      reservationPaymentIntentId: normalizedStripePaymentIntentId
    });
    assertZeroRemainingForFreeOrder(requireZeroRemaining, giftPlan.remainingAmount);

    saleRecord = await persistSale({
      userId,
      customer,
      items: saleItems,
      giftCardUsage: giftPlan.saleEntries,
      consumerWaiver,
      clientIp: normalizedIp,
      stripePaymentIntentId: normalizedStripePaymentIntentId,
      stripeSessionId: normalizedStripeSessionId,
      skipPostSaleSideEffects: true,
      legalConsentSnapshot
    });

    await applyStripeFieldsToSale(saleRecord);

    if (saleRecord?._id && purchaseRecord?._id) {
      await Purchase.findByIdAndUpdate(purchaseRecord._id, { saleId: saleRecord.saleId }).catch(() => {});
    }
    if (saleRecord) {
      await runPostSaleSideEffects(saleRecord, {
        giftCardSettlement: {
          userId,
          saleItems,
          usages: giftPlan.usages,
          paymentIntentId: normalizedStripePaymentIntentId
        }
      });
      postSaleSideEffectsApplied = true;
    }
    await clearCartSnapshotBestEffort(userId);
    return { ok: true, saleId: saleRecord?.saleId };
  } catch (error) {
    // Never rollback sale/purchase/session after gift-card debit has been applied in post-sale effects.
    if (!postSaleSideEffectsApplied && (saleRecord || purchaseRecord || reservedSession)) {
      await rollbackSingleSale({ sale: saleRecord, purchase: purchaseRecord, session: reservedSession });
    }
    if (!postSaleSideEffectsApplied && createdGiftCard?._id) {
      await GiftCard.deleteOne({ _id: createdGiftCard._id }).catch(() => {});
    }
    throw error;
  }
}

/**
 * Phase 1B-4: POST /api/client/checkout/finalize-free
 * Finalizes a 0€ order (100% gift-card coverage OR a genuinely free item) WITHOUT
 * Stripe. Reuses the EXACT same finalizer as the Stripe webhook
 * (processCheckoutStatePurchase) — there is no parallel business flow and no
 * duplicated sale/booking/debit logic. The `requireZeroRemaining` guard re-checks
 * server-side (catalog prices minus real gift-card coverage) that nothing remains due,
 * so a partially-paid order can never be finalized for free. Idempotence reuses the
 * Phase 1B-1 unique partial index: a deterministic synthetic reference
 * `free_<idempotencyKey>` is stored in Sale.stripePaymentIntentId, so a double submit
 * collides (E11000) and resolves to the same sale.
 */
// Phase 1B-4: resolve the winning sale for a free reference. Under concurrent double
// submit, the loser may fail on an EARLIER unique index (e.g. purchase_unique_product)
// before the winner has committed its Sale, so a single immediate lookup can miss it.
// We poll briefly until the winner's Sale appears.
async function waitForExistingFreeSale(freeRef, { attempts = 25, delayMs = 40 } = {}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const found = await Sale.findOne({ stripePaymentIntentId: freeRef }).select('saleId').lean();
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  return null;
}

export async function finalizeFreeCheckout(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const checkoutState = req.body?.checkoutState;
  if (!checkoutState || typeof checkoutState !== 'object') {
    return res
      .status(400)
      .json({ ok: false, error: 'checkoutState manquant.', code: 'CHECKOUT_STATE_REQUIRED' });
  }
  // Sprint pré-React A1 — revalidation serveur des consentements légaux, exactement
  // comme le chemin Stripe (free checkout 0€ respecte les mêmes règles). Les
  // consentements requis sont dérivés du CATALOGUE serveur, jamais des booléens client.
  try {
    const legalRequirements = await deriveLegalRequirements(checkoutState);
    validateCheckoutLegalConsents(checkoutState, legalRequirements);
  } catch (legalError) {
    return res.status(Number(legalError?.status) || 400).json({
      ok: false,
      error: legalError?.message || 'Consentement légal requis.',
      code: legalError?.code || 'LEGAL_CONSENT_REQUIRED'
    });
  }

  // Sprint pré-React A7 — bloque les offres formation non finies (mêmes règles que Stripe).
  try {
    await assertCheckoutFormationsPurchasable(checkoutState);
  } catch (offerError) {
    return res.status(Number(offerError?.status) || 409).json({
      ok: false,
      error: offerError?.message || 'Offre indisponible.',
      code: offerError?.code || 'OFFER_NOT_AVAILABLE'
    });
  }

  // Pré-React B2 — pricing serveur faisant foi (best-effort, observabilité/snapshot).
  // L'anti-bypass paiement reste `assertZeroRemainingForFreeOrder` dans le finaliseur,
  // qui recalcule la couverture carte cadeau côté serveur (planGiftCardUsage). On
  // attache le pricing serveur au checkoutState pour traçabilité sans changer le flux.
  try {
    checkoutState.serverPricing = await buildServerCheckoutPricing(checkoutState);
  } catch (_pricingErr) {
    // best-effort : ne bloque pas le 0 € (le finaliseur fait foi).
  }

  // Deterministic synthetic reference → reuses the Phase 1B-1 unique partial index on
  // Sale.stripePaymentIntentId for idempotence (double submit → E11000 → idempotent).
  const rawKey = String(req.body?.idempotencyKey || '').trim();
  const safeKey = /^[A-Za-z0-9_-]{8,128}$/.test(rawKey) ? rawKey : crypto.randomUUID();
  const freeRef = `free_${safeKey}`;

  const existing = await Sale.findOne({ stripePaymentIntentId: freeRef }).select('saleId').lean();
  if (existing) {
    return res.status(200).json({ ok: true, saleId: existing.saleId, idempotent: true });
  }

  const isCart = checkoutState?.cart === true;
  const item =
    checkoutState?.item && typeof checkoutState.item === 'object' ? checkoutState.item : {};
  const clientIp = extractClientIp(req);

  try {
    const result = await processCheckoutStatePurchase({
      userId,
      itemType: isCart ? null : item?.type,
      itemId: isCart ? null : item?.id,
      sessionId: isCart ? null : item?.sessionId || null,
      selectedOptions: Array.isArray(item?.selectedOptions) ? item.selectedOptions : [],
      appliedGiftCards: Array.isArray(checkoutState?.appliedGiftCards)
        ? checkoutState.appliedGiftCards
        : [],
      checkoutState,
      waiverText: checkoutState?.legal?.waiverText || null,
      clientIp,
      stripeSessionId: freeRef,
      stripePaymentIntentId: freeRef,
      requireZeroRemaining: true
    });
    // Audit-only event (best-effort). sale.finalized is also emitted by persistSale.
    await emitSaleEvent('sale.zero_payment_finalized', result, { extra: { zeroPayment: true } });
    return res.status(200).json({ ok: true, saleId: result?.saleId });
  } catch (error) {
    // Concurrent double-submit lost the race on the unique index → idempotent success.
    const isDuplicate =
      Number(error?.code) === 11000 ||
      Boolean(error?.keyPattern && error.keyPattern.stripePaymentIntentId);
    if (isDuplicate) {
      const dup = await waitForExistingFreeSale(freeRef);
      return res.status(200).json({ ok: true, saleId: dup?.saleId, idempotent: true });
    }
    const status = Number(error?.status || 0);
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    if (safeStatus >= 500) {
      console.error('[finalizeFreeCheckout] Echec finalisation 0 EUR', error);
    }
    return res.status(safeStatus).json({
      ok: false,
      error: error?.message || 'Finalisation impossible.',
      code: error?.code || null
    });
  }
}

export {
  persistSale,
  applySaleCommissionSnapshot,
  runPostSaleSideEffects,
  serializePurchasePayload,
  rollbackSingleSale
};
