import Stripe from 'stripe';
import mongoose from 'mongoose';
import { getSessionUserId } from '../utils/session.js';
import { extractClientIp } from '../utils/requestClientIp.js';
import Sale from '../models/Sale.js';
import Purchase from '../models/Purchase.js';
import StripeCheckoutIntent from '../models/StripeCheckoutIntent.js';
import RefundRequest from '../models/RefundRequest.js';
import Invoice from '../models/Invoice.js';
import GiftCardConfig from '../models/GiftCardConfig.js';
import User from '../models/user.js';
import Product from '../models/Product.js';
import Formation from '../models/Formation.js';
import FormationSession, { buildActiveFormationSessionFilter } from '../models/FormationSession.js';
import { processCheckoutStatePurchase } from './clientController.js';
import { sendRefundConfirmedEmail } from '../services/mailService.js';
import { sendRefundConfirmedEmailInternal } from '../services/refundExecutionService.js';
import { ensureRefundCommissionReversal } from '../services/refundService.js';
import { resolveSiteName } from '../services/sessionCancellationFlowService.js';
import { triggerNotification } from '../services/notificationService.js';
import {
  reserveGiftCardAmountsForPaymentIntent,
  releaseGiftCardReservationsForPaymentIntent
} from '../services/giftCardReservationService.js';
import { recreditGiftCardPortion } from '../services/refundGiftCardService.js';
import { claimGiftCardRecredit } from '../services/refundRequestService.js';
import { getAppBaseUrl } from '../utils/invoiceUrl.js';
import { assertServiceSlotBookable } from '../services/serviceAvailabilityService.js';
import { getCredential } from '../services/integratedApiCredentialService.js';
import {
  deriveLegalRequirements,
  validateCheckoutLegalConsents
} from '../services/legalConsentService.js';
import { recordWebhookFailure } from '../services/webhookFailureService.js';
import { assertCheckoutFormationsPurchasable } from '../services/offerReadinessService.js';
import {
  buildServerCheckoutPricing,
  assertClientPricingMatchesServer
} from '../services/checkoutPricingService.js';

async function getStripe() {
  // Credential sourced from the IntegratedApi vault (env fallback during migration).
  const secretKey = await getCredential('stripe-institut', { role: 'secret_key' });
  return new Stripe(secretKey);
}

// Phase 1B-4: 0€ orders finalized without Stripe carry a synthetic "free_" reference in
// stripePaymentIntentId (for idempotence via the unique partial index). They have no
// real Stripe charge, so they must be excluded from the Stripe-fee recovery sweep.
const STRIPE_FEE_PENDING_QUERY = {
  stripePaymentIntentId: { $nin: [null, ''], $not: /^free_/ },
  stripeFee: null
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function normalizeCurrency(value, fallback = 'eur') {
  return String(value || fallback).toLowerCase();
}

function normalizeStripeId(value) {
  return String(value || '').trim();
}

function stringifyMetadataValue(value, maxLength = 500) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
}

function buildPaymentIntentCheckoutMetadata({ intentId, userId, checkoutState } = {}) {
  const item = checkoutState?.item && typeof checkoutState.item === 'object' ? checkoutState.item : {};
  const selectedOptionIds = Array.isArray(item?.selectedOptions)
    ? item.selectedOptions
        .map(option => String(option?.optionId || '').trim())
        .filter(Boolean)
    : [];
  const appliedGiftCards = Array.isArray(checkoutState?.appliedGiftCards)
    ? checkoutState.appliedGiftCards
        .map(entry => {
          const code = String(entry?.code || '').trim().toUpperCase();
          const amount = Number(entry?.amount ?? entry?.amountUsed);
          if (!code || !Number.isFinite(amount) || amount <= 0) return '';
          return `${encodeURIComponent(code)}~${Math.round(amount * 100) / 100}`;
        })
        .filter(Boolean)
    : [];

  return {
    intentId: stringifyMetadataValue(intentId, 120),
    userId: stringifyMetadataValue(userId, 120),
    itemType: stringifyMetadataValue(item?.type || '', 24),
    itemId: stringifyMetadataValue(item?.id || '', 120),
    sessionId: stringifyMetadataValue(item?.sessionId || '', 120),
    giftCardAmount: stringifyMetadataValue(
      item?.amount ?? checkoutState?.totals?.subtotal ?? checkoutState?.totals?.remainingToPay ?? '',
      32
    ),
    giftCardRemainingToPay: stringifyMetadataValue(checkoutState?.totals?.remainingToPay ?? '', 32),
    giftCardName: stringifyMetadataValue(item?.name || 'Carte cadeau', 120),
    giftCardRecipientName: stringifyMetadataValue(item?.recipientName || '', 120),
    giftCardRecipientEmail: stringifyMetadataValue(item?.recipientEmail || '', 120),
    giftCardMessage: stringifyMetadataValue(item?.message || '', 350),
    selectedOptions: stringifyMetadataValue(selectedOptionIds.join(','), 500),
    appliedGiftCards: stringifyMetadataValue(appliedGiftCards.join('|'), 500)
  };
}

function parseSelectedOptionsMetadata(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return [];
  return value
    .split(',')
    .map(entry => String(entry || '').trim())
    .filter(Boolean)
    .map(optionId => ({ optionId }));
}

function parseAppliedGiftCardsMetadata(rawValue = '') {
  const value = String(rawValue || '').trim();
  if (!value) return [];
  return value
    .split('|')
    .map(entry => String(entry || '').trim())
    .filter(Boolean)
    .map(entry => {
      const [rawCode, rawAmount] = entry.split('~');
      const code = String(rawCode || '').trim();
      const amount = Number(rawAmount);
      if (!code || !Number.isFinite(amount) || amount <= 0) return null;
      let decodedCode = '';
      try {
        decodedCode = decodeURIComponent(code).trim().toUpperCase();
      } catch (_error) {
        decodedCode = code.trim().toUpperCase();
      }
      if (!decodedCode) return null;
      return {
        code: decodedCode,
        amount: Math.round(amount * 100) / 100
      };
    })
    .filter(Boolean);
}

function buildWebhookFallbackPayload(paymentIntent = null) {
  const metadata = paymentIntent?.metadata && typeof paymentIntent.metadata === 'object'
    ? paymentIntent.metadata
    : {};
  const userId = stringifyMetadataValue(metadata?.userId, 120);
  const metadataItemType = stringifyMetadataValue(metadata?.itemType, 24).toLowerCase();
  const itemType = ['formation', 'product', 'gift-card', 'service'].includes(metadataItemType)
    ? metadataItemType
    : 'formation';
  const itemId = stringifyMetadataValue(metadata?.itemId, 120) || (itemType === 'gift-card' ? 'gift-card' : '');
  if (!userId || !itemId) return null;
  const sessionId = stringifyMetadataValue(metadata?.sessionId, 120) || null;
  const giftCardAmount = Number(metadata?.giftCardAmount);
  const giftCardRemainingToPay = Number(metadata?.giftCardRemainingToPay);
  const normalizedGiftCardAmount = Number.isFinite(giftCardAmount) && giftCardAmount > 0
    ? roundToCents(giftCardAmount)
    : 0;
  const normalizedGiftCardRemaining = Number.isFinite(giftCardRemainingToPay) && giftCardRemainingToPay >= 0
    ? roundToCents(giftCardRemainingToPay)
    : normalizedGiftCardAmount;
  const giftCardName = stringifyMetadataValue(metadata?.giftCardName || 'Carte cadeau', 120) || 'Carte cadeau';
  const giftCardRecipientName = stringifyMetadataValue(metadata?.giftCardRecipientName || '', 120);
  const giftCardRecipientEmail = stringifyMetadataValue(metadata?.giftCardRecipientEmail || '', 120);
  const giftCardMessage = stringifyMetadataValue(metadata?.giftCardMessage || '', 350);
  const checkoutState = itemType === 'gift-card'
    ? {
        item: {
          type: 'gift-card',
          id: itemId,
          name: giftCardName,
          amount: normalizedGiftCardAmount,
          recipientName: giftCardRecipientName,
          recipientEmail: giftCardRecipientEmail,
          message: giftCardMessage
        },
        items: [
          {
            type: 'gift-card',
            id: itemId,
            name: giftCardName,
            amount: normalizedGiftCardAmount
          }
        ],
        totals: {
          basePrice: normalizedGiftCardAmount,
          discountAmount: 0,
          subtotal: normalizedGiftCardAmount,
          giftCardUsed: roundToCents(Math.max(0, normalizedGiftCardAmount - normalizedGiftCardRemaining)),
          remainingToPay: normalizedGiftCardRemaining
        },
        legal: {
          acceptedCgv: true,
          waiverRequired: false,
          waiverAccepted: false,
          waiverText: '',
          dateFormation: null
        },
        paymentProvider: 'stripe'
      }
    : null;
  return {
    userId,
    itemType,
    itemId,
    sessionId,
    selectedOptions: parseSelectedOptionsMetadata(metadata?.selectedOptions),
    appliedGiftCards: parseAppliedGiftCardsMetadata(metadata?.appliedGiftCards),
    checkoutState
  };
}

function roundToCents(value) {
  const candidate = Number.isFinite(Number(value)) ? Number(value) : 0;
  return Math.round(candidate * 100) / 100;
}

function normalizeStripeRefundStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (['not_applicable', 'pending', 'succeeded', 'failed'].includes(status)) {
    return status;
  }
  return 'not_applicable';
}

function normalizeGiftCardRefundStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  if (['not_applicable', 'pending', 'succeeded', 'failed', 'rollback_needed'].includes(status)) {
    return status;
  }
  return 'not_applicable';
}

function buildCreditNoteIdempotencyKey(refundDoc) {
  const refundId = String(refundDoc?.refundId || '').trim();
  return refundId ? `refund-request:${refundId}:credit-note` : '';
}

function buildStripeFeeSaleQuery({ paymentIntentId, saleId } = {}) {
  const normalizedSaleId = String(saleId || '').trim();
  if (normalizedSaleId) {
    return { saleId: normalizedSaleId };
  }
  const normalizedPaymentIntentId = normalizeStripeId(paymentIntentId);
  return {
    $or: [
      { stripePaymentIntentId: normalizedPaymentIntentId },
      { stripeSessionId: normalizedPaymentIntentId }
    ]
  };
}

let pendingStripeFeeCreatedListener = null;

export function registerPendingStripeFeeCreatedListener(listener) {
  pendingStripeFeeCreatedListener = typeof listener === 'function' ? listener : null;
}

function notifyPendingStripeFeeCreated(saleId = '') {
  if (typeof pendingStripeFeeCreatedListener !== 'function') return;
  try {
    pendingStripeFeeCreatedListener({ saleId: String(saleId || '').trim() });
  } catch (error) {
    console.error('[Stripe Fees] Erreur callback relance job', error);
  }
}

async function getBalanceTx(stripe, chargeId, attempts = 1, retryDelayMs = 3000) {
  if (!chargeId) return { charge: null, balanceTx: null };
  let lastCharge = null;
  for (let i = 0; i < attempts; i += 1) {
    const charge = await stripe.charges.retrieve(chargeId);
    lastCharge = charge;
    const balanceTransactionId =
      typeof charge?.balance_transaction === 'string'
        ? charge.balance_transaction
        : charge?.balance_transaction?.id || '';
    if (balanceTransactionId) {
      const balanceTx = await stripe.balanceTransactions.retrieve(balanceTransactionId);
      if (typeof balanceTx?.fee !== 'undefined') {
        return { charge, balanceTx };
      }
    }
    if (i < attempts - 1) {
      await sleep(retryDelayMs);
    }
  }
  return { charge: lastCharge, balanceTx: null };
}

async function fetchStripeFeeData({
  paymentIntentId,
  attempts = 1,
  retryDelayMs = 3000
} = {}) {
  const normalizedPaymentIntentId = normalizeStripeId(paymentIntentId);
  if (!normalizedPaymentIntentId) {
    return { fee: null, net: null, amount: null, currency: 'eur', available: false };
  }

  const stripe = await getStripe();
  let lastCurrency = 'eur';
  for (let i = 0; i < attempts; i += 1) {
    const paymentIntent = await stripe.paymentIntents.retrieve(normalizedPaymentIntentId);
    lastCurrency = normalizeCurrency(paymentIntent?.currency, lastCurrency);
    const latestChargeId =
      typeof paymentIntent?.latest_charge === 'string'
        ? paymentIntent.latest_charge
        : paymentIntent?.latest_charge?.id || '';
    if (latestChargeId) {
      const { charge, balanceTx } = await getBalanceTx(stripe, latestChargeId, 1, retryDelayMs);
      if (charge?.currency) {
        lastCurrency = normalizeCurrency(charge.currency, lastCurrency);
      }
      if (balanceTx) {
        const fee = Number.isFinite(Number(balanceTx?.fee)) ? Number(balanceTx.fee) : null;
        const net = Number.isFinite(Number(balanceTx?.net)) ? Number(balanceTx.net) : null;
        const amount = Number.isFinite(Number(balanceTx?.amount))
          ? Number(balanceTx.amount)
          : Number.isFinite(Number(charge?.amount))
            ? Number(charge.amount)
            : null;
        return {
          fee,
          net,
          amount,
          currency: normalizeCurrency(balanceTx?.currency, lastCurrency),
          available: fee !== null && net !== null
        };
      }
    }
    if (i < attempts - 1) {
      await sleep(retryDelayMs);
    }
  }
  return { fee: null, net: null, amount: null, currency: lastCurrency, available: false };
}

async function persistStripeFeeData({ paymentIntentId, saleId, fee, net } = {}) {
  const normalizedPaymentIntentId = normalizeStripeId(paymentIntentId);
  if (!normalizedPaymentIntentId) return false;
  if (!Number.isFinite(Number(fee)) || !Number.isFinite(Number(net))) return false;
  const query = buildStripeFeeSaleQuery({ paymentIntentId: normalizedPaymentIntentId, saleId });
  const updated = await Sale.findOneAndUpdate(
    query,
    {
      $set: {
        stripeFee: Number(fee),
        stripeNet: Number(net)
      }
    },
    { new: true }
  ).lean();
  return Boolean(updated);
}

export async function recoverStripeFeesAndUpdateSale({
  paymentIntentId,
  saleId,
  attempts = 1,
  retryDelayMs = 3000
} = {}) {
  const stripeData = await fetchStripeFeeData({
    paymentIntentId,
    attempts,
    retryDelayMs
  });
  let updated = false;
  if (stripeData.available) {
    updated = await persistStripeFeeData({
      paymentIntentId,
      saleId,
      fee: stripeData.fee,
      net: stripeData.net
    });
  }
  return {
    fee: stripeData.fee,
    net: stripeData.net,
    amount: stripeData.amount,
    currency: stripeData.currency,
    updated,
    available: stripeData.available
  };
}

export async function countPendingStripeFeesSales() {
  return Sale.countDocuments(STRIPE_FEE_PENDING_QUERY);
}

export async function listPendingStripeFeesSales(limit = 200) {
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 1000);
  return Sale.find(STRIPE_FEE_PENDING_QUERY)
    .sort({ createdAt: 1 })
    .limit(safeLimit)
    .select({ saleId: 1, stripePaymentIntentId: 1, createdAt: 1 })
    .lean();
}

function isLegalStateValid(checkoutState) {
  const legal = checkoutState?.legal || {};
  if (!legal.acceptedCgv) return false;
  if (legal.waiverRequired && !legal.waiverAccepted) return false;
  if (legal.waiverRequired && !String(legal.waiverText || '').trim()) return false;
  return true;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value || '').trim());
}

function normalizeCheckoutItems(checkoutState) {
  const list = Array.isArray(checkoutState?.items) && checkoutState.items.length
    ? checkoutState.items
    : checkoutState?.item
      ? [checkoutState.item]
      : [];
  return list
    .map(entry => {
      const rawType = String(entry?.type || '').trim().toLowerCase();
      const type = rawType === 'product' || rawType === 'gift-card' ? rawType : 'formation';
      return {
        type,
        id: String(entry?.id || '').trim() || (type === 'gift-card' ? 'gift-card' : ''),
        sessionId: String(entry?.sessionId || '').trim()
      };
    })
    .filter(entry => entry.type === 'gift-card' || entry.id);
}

function parseGiftCardCheckoutAmount(checkoutState) {
  const item = checkoutState?.item && typeof checkoutState.item === 'object' ? checkoutState.item : {};
  const rawAmount = Number(
    item?.amount ??
      checkoutState?.totals?.subtotal ??
      checkoutState?.totals?.basePrice ??
      checkoutState?.totals?.remainingToPay
  );
  if (!Number.isFinite(rawAmount)) return 0;
  return roundToCents(rawAmount);
}

async function validateGiftCardCheckoutState(checkoutState = {}) {
  const amount = parseGiftCardCheckoutAmount(checkoutState);
  if (!Number.isFinite(amount) || amount <= 0) {
    const error = new Error('Montant carte cadeau invalide.');
    error.status = 400;
    error.code = 'GIFT_CARD_AMOUNT_INVALID';
    throw error;
  }

  const config = await GiftCardConfig.findOne().sort({ createdAt: -1 }).select({ minAmount: 1 }).lean();
  const minAmount = Number(config?.minAmount || 50);
  if (amount < minAmount) {
    const error = new Error(`Le montant minimal est de ${minAmount} EUR.`);
    error.status = 400;
    error.code = 'GIFT_CARD_MIN_AMOUNT';
    throw error;
  }
}

async function validateCheckoutStateAgainstCatalog({ userId, checkoutState }) {
  const normalizedUserId = String(userId || '').trim();
  if (!isValidObjectId(normalizedUserId)) {
    const error = new Error('Utilisateur invalide.');
    error.status = 400;
    error.code = 'INVALID_USER';
    throw error;
  }
  const userExists = await User.exists({ _id: normalizedUserId });
  if (!userExists) {
    const error = new Error('Utilisateur introuvable.');
    error.status = 400;
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const item = checkoutState?.item && typeof checkoutState.item === 'object' ? checkoutState.item : {};
  const rawItemType = String(item?.type || '').trim().toLowerCase();
  const itemType = rawItemType === 'product' || rawItemType === 'gift-card' ? rawItemType
    : rawItemType === 'service' ? 'service'
    : 'formation';
  // Service booking: booking is pre-validated at creation — skip catalog check
  if (itemType === 'service') return;
  if (itemType === 'gift-card') {
    await validateGiftCardCheckoutState(checkoutState);
    return;
  }

  const itemId = String(item?.id || '').trim();
  if (!isValidObjectId(itemId)) {
    const error = new Error('Article invalide.');
    error.status = 400;
    error.code = 'INVALID_ITEM_ID';
    throw error;
  }
  if (itemType === 'product') {
    const product = await Product.findById(itemId).select({ _id: 1, active: 1 }).lean();
    if (!product || !product.active) {
      const error = new Error('Produit introuvable.');
      error.status = 404;
      error.code = 'PRODUCT_NOT_FOUND';
      throw error;
    }
    return;
  }
  const formation = await Formation.findById(itemId)
    .select({ _id: 1, status: 1, type: 1, options: 1 })
    .lean();
  if (!formation || formation.status !== 'published') {
    const error = new Error('Formation introuvable.');
    error.status = 404;
    error.code = 'FORMATION_NOT_FOUND';
    throw error;
  }

  const selectedOptions = Array.isArray(item?.selectedOptions) ? item.selectedOptions : [];
  if (formation.type !== 'presentiel') {
    if (selectedOptions.length) {
      const error = new Error('Options indisponibles pour cette formation.');
      error.status = 400;
      error.code = 'INVALID_OPTIONS_FOR_FORMATION';
      throw error;
    }
    return;
  }

  const sessionId = String(item?.sessionId || '').trim();
  if (!isValidObjectId(sessionId)) {
    const error = new Error('Session requise pour une formation en presentiel.');
    error.status = 400;
    error.code = 'SESSION_REQUIRED';
    throw error;
  }

  const targetSession = await FormationSession.findOne(
    buildActiveFormationSessionFilter({
      _id: sessionId,
      formationId: formation._id
    })
  )
    .select({ _id: 1, startDate: 1, reservedCount: 1, maxClients: 1 })
    .lean();
  if (!targetSession) {
    const error = new Error('Session introuvable.');
    error.status = 404;
    error.code = 'SESSION_NOT_FOUND';
    throw error;
  }
  if (Number(targetSession.reservedCount || 0) >= Number(targetSession.maxClients || 0)) {
    const error = new Error('Session complete.');
    error.status = 409;
    error.code = 'SESSION_FULL';
    throw error;
  }

  if (!selectedOptions.length) return;
  const optionMap = new Map(
    (Array.isArray(formation.options) ? formation.options : []).map(option => [
      option?._id?.toString(),
      option
    ])
  );
  const nowMs = Date.now();
  const sessionStartMs = new Date(targetSession.startDate).getTime();
  for (const raw of selectedOptions) {
    const optionId = String(raw?.optionId || '').trim();
    if (!isValidObjectId(optionId)) {
      const error = new Error('Option invalide.');
      error.status = 400;
      error.code = 'INVALID_OPTION_ID';
      throw error;
    }
    const option = optionMap.get(optionId);
    if (!option) {
      const error = new Error(`Option ${optionId} introuvable sur cette formation.`);
      error.status = 400;
      error.code = 'OPTION_NOT_FOUND';
      throw error;
    }
    const deadlineMs = Number(option?.deadlineDays || 0) * 86400000;
    if (!sessionStartMs || sessionStartMs - nowMs <= deadlineMs) {
      const error = new Error(`L'option "${String(option?.name || 'Option')}" n'est plus disponible.`);
      error.status = 400;
      error.code = 'OPTION_DEADLINE_EXCEEDED';
      throw error;
    }
  }
}
async function validateCartItemsAgainstCatalog({ userId, checkoutState }) {
  const normalizedUserId = String(userId || '').trim();
  if (!isValidObjectId(normalizedUserId)) {
    const error = new Error('Utilisateur invalide.');
    error.status = 400;
    error.code = 'INVALID_USER';
    throw error;
  }
  const userExists = await User.exists({ _id: normalizedUserId });
  if (!userExists) {
    const error = new Error('Utilisateur introuvable.');
    error.status = 400;
    error.code = 'USER_NOT_FOUND';
    throw error;
  }
  const cartItems = Array.isArray(checkoutState?.items) ? checkoutState.items : [];
  if (!cartItems.length) {
    const error = new Error('Panier vide.');
    error.status = 400;
    error.code = 'EMPTY_CART';
    throw error;
  }
  for (const item of cartItems) {
    const rawType = String(item?.type || '').trim().toLowerCase();
    const itemType = rawType === 'product' ? 'product' : 'formation';
    const itemId = String(item?.id || '').trim();
    if (!isValidObjectId(itemId)) {
      const error = new Error('Article invalide dans le panier.');
      error.status = 400;
      error.code = 'INVALID_ITEM_ID';
      throw error;
    }
    if (itemType === 'product') {
      const product = await Product.findById(itemId).select({ _id: 1, active: 1 }).lean();
      if (!product || !product.active) {
        const error = new Error('Produit introuvable.');
        error.status = 404;
        error.code = 'PRODUCT_NOT_FOUND';
        throw error;
      }
    } else {
      const formation = await Formation.findById(itemId)
        .select({ _id: 1, status: 1, type: 1 })
        .lean();
      if (!formation || formation.status !== 'published') {
        const error = new Error('Formation introuvable.');
        error.status = 404;
        error.code = 'FORMATION_NOT_FOUND';
        throw error;
      }
      if (formation.type === 'presentiel') {
        const sessionId = String(item?.sessionId || '').trim();
        if (!isValidObjectId(sessionId)) {
          const error = new Error('Session requise pour une formation en presentiel.');
          error.status = 400;
          error.code = 'SESSION_REQUIRED';
          throw error;
        }
        const targetSession = await FormationSession.findOne(
          buildActiveFormationSessionFilter({ _id: sessionId, formationId: formation._id })
        )
          .select({ _id: 1, reservedCount: 1, maxClients: 1 })
          .lean();
        if (!targetSession) {
          const error = new Error('Session introuvable.');
          error.status = 404;
          error.code = 'SESSION_NOT_FOUND';
          throw error;
        }
        if (Number(targetSession.reservedCount || 0) >= Number(targetSession.maxClients || 0)) {
          const error = new Error('Session complete.');
          error.status = 409;
          error.code = 'SESSION_FULL';
          throw error;
        }
      }
    }
  }
}

async function hasActiveFormationPurchase({ userId, formationId, sessionId }) {
  if (!isValidObjectId(formationId)) return false;
  const query = {
    userId,
    itemType: 'formation',
    itemId: formationId,
    participationStatus: { $ne: 'canceled' }
  };
  if (sessionId && isValidObjectId(sessionId)) {
    query.sessionId = sessionId;
  } else {
    query.sessionId = null;
  }
  return Boolean(await Purchase.exists(query));
}

function isRetryablePurchaseProcessingError(error) {
  if (!error || typeof error !== 'object') return false;
  const status = Number(error?.status || 0);
  if (status >= 500) return true;
  if (status > 0 && status < 500) return false;
  const name = String(error?.name || '').trim();
  if (
    [
      'MongoNetworkError',
      'MongoServerSelectionError',
      'MongooseServerSelectionError',
      'MongoWriteConcernError',
      'MongoCursorExhaustedError'
    ].includes(name)
  ) {
    return true;
  }
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('timed out') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('connection') ||
    message.includes('topology was destroyed')
  );
}

/**
 * POST /api/stripe/create-checkout-session
 * Creates a Stripe PaymentIntent, stores checkoutState in MongoDB, returns clientSecret.
 */
export async function createCheckoutSession(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }

  const checkoutState = req.body?.checkoutState;
  if (!checkoutState) {
    return res.status(400).json({ ok: false, error: 'checkoutState manquant.' });
  }

  const isCart = checkoutState?.cart === true;
  const isServiceBooking = String(checkoutState?.item?.type || '').trim().toLowerCase() === 'service';

  if (isServiceBooking) {
    // Vérifier suspension pour les bookings de service
    const clientUser = await User.findById(userId).select('bookingSuspended').lean();
    if (clientUser?.bookingSuspended) {
      return res.status(403).json({
        ok: false,
        code: 'BOOKING_SUSPENDED',
        error: 'Compte suspendu — réservation impossible.'
      });
    }

    // Service booking: CGV required — catalog re-validation happens in webhook (processServiceCheckoutStatePurchase)
    if (!checkoutState.legal?.acceptedCgv) {
      return res.status(400).json({
        ok: false,
        error: 'Conditions générales non acceptées.',
        code: 'LEGAL_VALIDATION_REQUIRED'
      });
    }
    if (!checkoutState.service?.serviceId || !checkoutState.service?.slotStart || !checkoutState.service?.slotEnd) {
      return res.status(400).json({
        ok: false,
        error: 'Données de réservation incomplètes.',
        code: 'CHECKOUT_CONTEXT_INVALID'
      });
    }
    try {
      await assertServiceSlotBookable({
        practitionerId: checkoutState.service.practitionerId,
        serviceId: checkoutState.service.serviceId,
        startAt: checkoutState.service.slotStart,
        endAt: checkoutState.service.slotEnd,
        now: new Date()
      });
    } catch (validationError) {
      return res.status(Number(validationError?.status || 400)).json({
        ok: false,
        error: validationError?.message || 'Ce creneau n est plus disponible.',
        code: validationError?.code || 'CHECKOUT_CONTEXT_INVALID'
      });
    }
  } else if (isCart) {
    if (!checkoutState.legal?.acceptedCgv) {
      return res.status(400).json({
        ok: false,
        error: 'Conditions generales non acceptees.',
        code: 'LEGAL_VALIDATION_REQUIRED'
      });
    }
    const cartWaivers = Array.isArray(checkoutState.consumerWaivers) ? checkoutState.consumerWaivers : [];
    const unacceptedWaivers = cartWaivers.filter(w => !w.accepted);
    if (unacceptedWaivers.length) {
      return res.status(400).json({
        ok: false,
        error: 'Toutes les renonciations doivent etre acceptees.',
        code: 'WAIVER_NOT_ACCEPTED'
      });
    }
    try {
      await validateCartItemsAgainstCatalog({ userId, checkoutState });
    } catch (validationError) {
      return res.status(Number(validationError?.status || 400)).json({
        ok: false,
        error: validationError?.message || 'Contexte checkout invalide.',
        code: validationError?.code || 'CHECKOUT_CONTEXT_INVALID'
      });
    }
  } else {
    const rawItemType = String(checkoutState?.item?.type || '').trim().toLowerCase();
    const requiresItemId = rawItemType !== 'gift-card';
    if (requiresItemId && !checkoutState.item?.id) {
      return res.status(400).json({ ok: false, error: 'checkoutState manquant ou invalide.' });
    }
    if (!isLegalStateValid(checkoutState)) {
      return res.status(400).json({
        ok: false,
        error: 'Conditions generales non acceptees ou renonciation manquante.',
        code: 'LEGAL_VALIDATION_REQUIRED'
      });
    }
    try {
      await validateCheckoutStateAgainstCatalog({ userId, checkoutState });
    } catch (validationError) {
      return res.status(Number(validationError?.status || 400)).json({
        ok: false,
        error: validationError?.message || 'Contexte checkout invalide.',
        code: validationError?.code || 'CHECKOUT_CONTEXT_INVALID'
      });
    }
  }

  // Sprint pré-React A1 — revalidation serveur des consentements légaux (CGV /
  // rétractation / renonciation). Le serveur re-dérive les consentements requis
  // depuis le CATALOGUE (type de formation, prestation datée, date de session) et
  // refuse l'achat si un consentement requis manque — sans faire confiance aux
  // booléens client (waiverRequired, accepted_cgv inventé). Voir rapports 74/82/84.
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

  // Sprint pré-React A7 — bloque les offres formation non finies (distanciel immédiat
  // sans accès configuré). Avant création du PaymentIntent.
  try {
    await assertCheckoutFormationsPurchasable(checkoutState);
  } catch (offerError) {
    return res.status(Number(offerError?.status) || 409).json({
      ok: false,
      error: offerError?.message || 'Offre indisponible.',
      code: offerError?.code || 'OFFER_NOT_AVAILABLE'
    });
  }

  const checkoutItems = normalizeCheckoutItems(checkoutState);
  for (const item of checkoutItems) {
    if (item.type !== 'formation') continue;
    const alreadyPurchased = await hasActiveFormationPurchase({
      userId,
      formationId: item.id,
      sessionId: item.sessionId
    });
    if (alreadyPurchased) {
      return res.status(409).json({
        ok: false,
        error: 'ALREADY_PURCHASED',
        code: 'ALREADY_PURCHASED'
      });
    }
  }

  const ngrokDomain = process.env.NGROK_DOMAIN;
  if (!ngrokDomain) {
    return res.status(500).json({ ok: false, error: 'NGROK_DOMAIN manquant dans .env' });
  }

  const clientIp = extractClientIp(req);
  const stripe = await getStripe();

  // Pré-React B2 — Le SERVEUR est l'unique source de vérité du montant. On recalcule
  // le montant à charger depuis le catalogue (prix + promotions + options − cartes
  // cadeaux capées au solde réel) et on REFUSE si le client a déclaré un montant
  // divergent (CHECKOUT_AMOUNT_MISMATCH). Le PaymentIntent est créé avec le montant
  // SERVEUR, jamais avec `checkoutState.totals` (client).
  let serverPricing;
  try {
    serverPricing = await buildServerCheckoutPricing(checkoutState);
    assertClientPricingMatchesServer(checkoutState, serverPricing);
  } catch (pricingErr) {
    return res.status(Number(pricingErr?.status) || 400).json({
      ok: false,
      error: pricingErr?.message || 'Montant checkout invalide.',
      code: pricingErr?.code || 'CHECKOUT_AMOUNT_MISMATCH'
    });
  }
  // Snapshot serveur persisté avec l'intent → le finaliseur dispose du montant faisant foi.
  checkoutState.serverPricing = serverPricing;

  // Amount to charge = montant SERVEUR (acompte/plein, après cartes cadeaux serveur).
  const amountToPay = serverPricing.amountToPay;
  const amountCents = Math.round(amountToPay * 100);
  if (amountCents < 50) {
    return res.status(400).json({
      ok: false,
      error: 'Le montant minimum pour un paiement par carte est de 0.50 EUR.',
      code: 'AMOUNT_TOO_LOW'
    });
  }

  let createdPaymentIntentId = '';
  let reservationApplied = false;
  try {
    // Persist checkoutState in MongoDB (avoids Stripe metadata size limits)
    const intent = new StripeCheckoutIntent({
      checkoutState,
      userId,
      clientIp
    });
    await intent.save();

    const paymentIntentMetadata = buildPaymentIntentCheckoutMetadata({
      intentId: intent._id?.toString() || '',
      userId: String(userId || '').trim(),
      checkoutState
    });

    // Create PaymentIntent — standard stable Stripe API
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: paymentIntentMetadata
    });
    createdPaymentIntentId = String(paymentIntent?.id || '').trim();

    let persistedAppliedGiftCards = Array.isArray(checkoutState?.appliedGiftCards)
      ? checkoutState.appliedGiftCards
      : [];
    if (Array.isArray(checkoutState?.appliedGiftCards) && checkoutState.appliedGiftCards.length) {
      const reservationResult = await reserveGiftCardAmountsForPaymentIntent({
        paymentIntentId: createdPaymentIntentId,
        appliedGiftCards: checkoutState.appliedGiftCards
      });
      persistedAppliedGiftCards = reservationResult.reserved.map(entry => ({
        giftCardId: String(entry?.giftCardId || '').trim(),
        code: String(entry?.code || '').trim().toUpperCase(),
        amount: Number(entry?.amount || 0)
      }));
      reservationApplied = true;
    }

    const persistedCheckoutState = {
      ...checkoutState,
      appliedGiftCards: persistedAppliedGiftCards
    };

    // Store PaymentIntent ID and normalized applied gift-card refs for webhook lookup
    await StripeCheckoutIntent.findByIdAndUpdate(intent._id, {
      stripeSessionId: paymentIntent.id,
      checkoutState: persistedCheckoutState
    });

    const returnUrl = `https://${ngrokDomain}/vitrine.html?slug=payment`;

    return res.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      returnUrl
    });
  } catch (error) {
    if (reservationApplied && createdPaymentIntentId) {
      await releaseGiftCardReservationsForPaymentIntent(createdPaymentIntentId, {
        reason: 'checkout_session_creation_failed'
      }).catch(releaseError => {
        console.error('[Stripe] Echec liberation reservation carte cadeau', releaseError);
      });
    }
    if (createdPaymentIntentId) {
      await stripe.paymentIntents.cancel(createdPaymentIntentId).catch(cancelError => {
        console.error('[Stripe] Echec annulation PaymentIntent apres erreur checkout', cancelError);
      });
    }
    if (error?.code === 'GIFT_CARD_RESERVED_BALANCE_INSUFFICIENT') {
      return res.status(400).json({
        ok: false,
        error: 'Solde carte cadeau insuffisant',
        code: error.code
      });
    }
    const errorStatus = Number(error?.status || 0);
    if (errorStatus >= 400 && errorStatus < 500) {
      return res.status(errorStatus).json({
        ok: false,
        error: error?.message || 'Contexte checkout invalide.',
        code: error?.code || null
      });
    }
    console.error('[Stripe] Erreur creation PaymentIntent', error);
    return res.status(500).json({
      ok: false,
      error: 'Impossible de creer la session de paiement.',
      code: error?.code || null
    });
  }
}

/**
 * POST /api/stripe/webhook  (raw body)
 * Listens to payment_intent.succeeded — sole trigger for sale creation.
 */
// Phase 1B-1: a concurrent/duplicate webhook racing to create the same sale hits
// the unique partial index on Sale.stripePaymentIntentId → MongoDB E11000. We treat
// that as "already processed" (idempotent), not a critical failure.
function isDuplicateStripePaymentSaleError(error) {
  if (!error || Number(error.code) !== 11000) return false;
  if (error.keyPattern && error.keyPattern.stripePaymentIntentId) return true;
  return String(error.message || '').includes('stripePaymentIntentId');
}

export async function handleWebhook(req, res) {
  const stripe = await getStripe();
  const sig = req.headers['stripe-signature'];
  let webhookSecret = '';
  try {
    webhookSecret = await getCredential('stripe-institut', { role: 'webhook_secret' });
  } catch (_err) {
    webhookSecret = '';
  }

  if (!webhookSecret) {
    console.error('[Stripe Webhook] webhook_secret indisponible (coffre/.env)');
    // A6 — panne de configuration : trace persistante safe (best-effort).
    await recordWebhookFailure({
      provider: 'stripe',
      webhookType: 'institut',
      failureStage: 'config',
      errorCode: 'WEBHOOK_SECRET_UNAVAILABLE',
      errorMessageSafe: 'webhook_secret indisponible (coffre/.env)',
      retryable: false
    });
    return res.status(500).send('Configuration webhook manquante.');
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.warn('[Stripe Webhook] Signature invalide:', err.message);
    // A6 — signature invalide : trace minimale safe (non rejouable).
    await recordWebhookFailure({
      provider: 'stripe',
      webhookType: 'institut',
      failureStage: 'signature',
      errorCode: 'SIGNATURE_INVALID',
      errorMessageSafe: 'Signature webhook invalide',
      retryable: false
    });
    return res.status(400).send(`Webhook signature invalide: ${err.message}`);
  }

  if (event.type === 'charge.refund.updated') {
    await handleRefundUpdatedEvent(event).catch(err =>
      console.error('[Stripe Webhook] Erreur traitement charge.refund.updated', err)
    );
    return res.status(200).json({ received: true });
  }

  if (event.type === 'payment_intent.payment_failed') {
    const failedPaymentIntent = event?.data?.object;
    const failedPaymentIntentId = normalizeStripeId(failedPaymentIntent?.id);
    if (!failedPaymentIntentId) {
      return res.status(200).json({ received: true });
    }
    try {
      const releaseResult = await releaseGiftCardReservationsForPaymentIntent(failedPaymentIntentId, {
        reason: 'payment_failed'
      });
      console.log('[Stripe Webhook] Reservation carte cadeau liberee (payment_failed)', {
        paymentIntentId: failedPaymentIntentId,
        matchedCards: releaseResult.matchedCards,
        modifiedCards: releaseResult.modifiedCards
      });
      return res.status(200).json({ received: true });
    } catch (error) {
      console.error('[Stripe Webhook] Erreur liberation reservation carte cadeau (payment_failed)', {
        paymentIntentId: failedPaymentIntentId
      });
      console.error('[Stripe Webhook] Erreur complete:', error);
      console.error('[Stripe Webhook] Stack:', error?.stack || '(stack indisponible)');
      return res.status(500).send('Erreur liberation reservation carte cadeau.');
    }
  }

  if (event.type !== 'payment_intent.succeeded') {
    return res.status(200).json({ received: true });
  }

  const paymentIntent = event.data.object;
  const stripeSessionId = paymentIntent.id; // PI ID used as idempotence key
  const intentId = paymentIntent.metadata?.intentId;

  // Idempotence: sale already exists for this PaymentIntent ID?
  const existingSale = await Sale.findOne({
    $or: [{ stripeSessionId }, { stripePaymentIntentId: stripeSessionId }]
  }).lean();
  if (existingSale) {
    console.log('[Stripe Webhook] Vente deja traitee pour PI', stripeSessionId);
    return res.status(200).json({ received: true, idempotent: true });
  }

  // Primary source: StripeCheckoutIntent in DB. Fallback: PaymentIntent metadata.
  let intent = null;
  if (intentId) {
    intent = await StripeCheckoutIntent.findById(intentId).lean();
  }
  if (!intent) {
    intent = await StripeCheckoutIntent.findOne({ stripeSessionId }).lean();
  }

  let userId = null;
  let itemType = '';
  let itemId = '';
  let sessionId = null;
  let selectedOptions = [];
  let appliedGiftCards = [];
  let clientIp = '';
  let waiverText = null;
  let checkoutState = null;

  if (intent?.checkoutState && intent?.userId) {
    checkoutState = intent.checkoutState;
    const item = checkoutState?.item || {};
    userId = intent.userId;
    itemType = item.type;
    itemId = item.id;
    sessionId = item.sessionId || null;
    selectedOptions = Array.isArray(item.selectedOptions) ? item.selectedOptions : [];
    appliedGiftCards = Array.isArray(checkoutState.appliedGiftCards) ? checkoutState.appliedGiftCards : [];
    clientIp = intent.clientIp || '0.0.0.0';
    waiverText = checkoutState?.legal?.waiverText || null;
  } else {
    const fallbackPayload = buildWebhookFallbackPayload(paymentIntent);
    if (!fallbackPayload) {
      console.error('[Stripe Webhook] Contexte achat introuvable (DB + metadata) pour PI', stripeSessionId, {
        hasIntentId: Boolean(intentId)
      });
      await recordWebhookFailure({
        provider: 'stripe',
        webhookType: 'institut',
        eventType: event.type,
        failureStage: 'processing',
        errorCode: 'CHECKOUT_CONTEXT_NOT_FOUND',
        errorMessageSafe: 'Contexte achat introuvable (DB + metadata)',
        stripeEventId: event.id,
        paymentIntentId: stripeSessionId,
        retryable: true
      });
      return res.status(500).send('Contexte achat introuvable pour ce paiement.');
    }
    userId = fallbackPayload.userId;
    itemType = fallbackPayload.itemType;
    itemId = fallbackPayload.itemId;
    sessionId = fallbackPayload.sessionId;
    selectedOptions = fallbackPayload.selectedOptions;
    appliedGiftCards = fallbackPayload.appliedGiftCards;
    checkoutState = fallbackPayload.checkoutState || null;
    clientIp = '0.0.0.0';
    waiverText = checkoutState?.legal?.waiverText || null;
    console.warn('[Stripe Webhook] Fallback metadata utilise pour finaliser la vente', {
      stripeSessionId,
      itemType
    });
  }

  const paymentIntentId = String(paymentIntent?.id || '').trim() || null;

  try {
    let purchaseResult = null;
    let processingError = null;
    const maxLocalAttempts = 3;
    for (let attempt = 1; attempt <= maxLocalAttempts; attempt += 1) {
      try {
        purchaseResult = await processCheckoutStatePurchase({
          userId,
          itemType,
          itemId,
          sessionId,
          selectedOptions,
          appliedGiftCards,
          waiverText: waiverText || null,
          clientIp: clientIp || '0.0.0.0',
          stripeSessionId,
          stripePaymentIntentId: paymentIntentId,
          checkoutState
        });
        processingError = null;
        break;
      } catch (error) {
        // Concurrent/duplicate webhook lost the race to insert the sale → idempotent.
        if (isDuplicateStripePaymentSaleError(error)) {
          console.log(
            '[Stripe Webhook] Vente deja creee par un webhook concurrent (E11000), idempotent',
            stripeSessionId
          );
          return res.status(200).json({ received: true, idempotent: true });
        }
        processingError = error;
        const retryable = isRetryablePurchaseProcessingError(error);
        console.error(
          '[Stripe Webhook] Echec traitement vente (tentative locale)',
          {
            stripeSessionId,
            attempt,
            maxLocalAttempts,
            retryable,
            status: error?.status || null,
            code: error?.code || null,
            message: error?.message || null
          },
          error
        );
        if (!retryable || attempt >= maxLocalAttempts) break;
        await sleep(1200 * attempt);
      }
    }
    if (processingError) {
      throw processingError;
    }

    if (paymentIntentId) {
      try {
        const stripeFees = await recoverStripeFeesAndUpdateSale({
          paymentIntentId,
          saleId: purchaseResult?.saleId,
          attempts: 3,
          retryDelayMs: 3000
        });
        if (stripeFees.updated) {
          console.log('[Stripe Webhook] Frais Stripe stockes pour PI', paymentIntentId);
        } else {
          console.log(
            '[Stripe Webhook] Frais Stripe indisponibles apres 3 tentatives, recuperation differree pour PI',
            paymentIntentId
          );
          notifyPendingStripeFeeCreated(purchaseResult?.saleId);
        }
      } catch (feesError) {
        console.error('[Stripe Webhook] Echec recuperation frais Stripe post-vente', feesError);
        notifyPendingStripeFeeCreated(purchaseResult?.saleId);
      }
    }

    console.log('[Stripe Webhook] Vente creee avec succes pour PI', stripeSessionId);
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Erreur traitement vente pour PI', stripeSessionId, error);
    console.error('[Stripe Webhook] Contexte erreur:', {
      stripeSessionId,
      status: error?.status || null,
      code: error?.code || null,
      message: error?.message || null
    });
    console.error('[Stripe Webhook] Erreur complete:', error);
    console.error('[Stripe Webhook] Stack:', error?.stack || '(stack indisponible)');
    // A6 — échec de traitement : trace persistante safe. Rejouable (Stripe retente),
    // donc retryable=true. On ne logge que des identifiants techniques + un code/message
    // neutre — jamais le payload Stripe ni de donnée sensible.
    await recordWebhookFailure({
      provider: 'stripe',
      webhookType: 'institut',
      eventType: event.type,
      failureStage: 'processing',
      errorCode: error?.code ? String(error.code) : 'PROCESSING_ERROR',
      errorMessageSafe: 'Echec traitement vente webhook',
      stripeEventId: event.id,
      paymentIntentId: stripeSessionId,
      retryable: true
    });
    // Return 500 so Stripe retries
    return res.status(500).send('Erreur interne lors du traitement de la vente.');
  }
}

/**
 * GET /api/stripe/transaction-fees?paymentIntentId=pi_xxx
 * Admin/dev only: reads Stripe fee/net in real time from BalanceTransaction.
 */
export async function getTransactionFees(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const role = String(req?.sessionUser?.role || '').trim().toLowerCase();
  if (!['admin', 'dev'].includes(role)) {
    return res.status(403).json({ ok: false, error: 'Acces refuse.' });
  }

  const paymentIntentId = String(req.query.paymentIntentId || '').trim();
  if (!paymentIntentId) {
    return res.status(400).json({ ok: false, error: 'paymentIntentId manquant.' });
  }

  try {
    const stripeFees = await recoverStripeFeesAndUpdateSale({
      paymentIntentId,
      attempts: 1,
      retryDelayMs: 0
    });

    return res.json({
      ok: true,
      fee: stripeFees.fee,
      net: stripeFees.net,
      amount: stripeFees.amount,
      currency: stripeFees.currency,
      updated: Boolean(stripeFees.updated)
    });
  } catch (error) {
    if (error?.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ ok: false, error: 'PaymentIntent introuvable.' });
    }
    console.error('[Stripe] Erreur lecture transaction fees', error);
    return res.status(500).json({ ok: false, error: 'Impossible de recuperer les frais Stripe.' });
  }
}

/**
 * GET /api/stripe/pending-fees-count
 * Admin/dev only: count sales waiting for Stripe fee/net persistence.
 */
export async function getPendingFeesCount(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }
  const role = String(req?.sessionUser?.role || '').trim().toLowerCase();
  if (!['admin', 'dev'].includes(role)) {
    return res.status(403).json({ ok: false, error: 'Acces refuse.' });
  }

  try {
    const count = await countPendingStripeFeesSales();
    return res.json({ ok: true, count });
  } catch (error) {
    console.error('[Stripe] Erreur calcul pending-fees-count', error);
    return res.status(500).json({ ok: false, error: 'Impossible de recuperer le compteur Stripe.' });
  }
}

/**
 * GET /api/stripe/session-status?payment_intent_id=pi_xxx
 * Returns payment status + origin/item for post-redirect frontend flow.
 */
export async function getSessionStatus(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }

  const paymentIntentId = String(req.query.payment_intent_id || req.query.session_id || '').trim();
  if (!paymentIntentId) {
    return res.status(400).json({ ok: false, error: 'payment_intent_id manquant.' });
  }

  try {
    const stripe = await getStripe();
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Look up our intent for origin + item
    const intent = await StripeCheckoutIntent.findOne({ stripeSessionId: paymentIntentId }).lean();

    // Security: verify this PI belongs to the requesting user
    if (intent && intent.userId.toString() !== String(userId)) {
      return res.status(403).json({ ok: false, error: 'Acces refuse.' });
    }

    // Map PaymentIntent status → 'complete' | 'open'
    const status = pi.status === 'succeeded' ? 'complete' : 'open';

    return res.json({
      ok: true,
      status,
      payment_status: pi.status,
      origin: intent?.checkoutState?.origin || null,
      item: intent?.checkoutState?.item
        ? {
            type: intent.checkoutState.item.type,
            id: intent.checkoutState.item.id,
            name: intent.checkoutState.item.name
          }
        : null
    });
  } catch (error) {
    console.error('[Stripe] Erreur lecture statut PaymentIntent', error);
    return res.status(500).json({ ok: false, error: 'Impossible de recuperer le statut du paiement.' });
  }
}

function buildPaymentFailureMessage(paymentIntent) {
  const message = String(paymentIntent?.last_payment_error?.message || '').trim();
  if (message) return message;
  const status = String(paymentIntent?.status || '').trim().toLowerCase();
  if (status === 'canceled') return 'Le paiement a ete annule.';
  return 'Le paiement a ete refuse. Veuillez reessayer avec une autre carte.';
}

function buildPurchasePayload({ sale, fallbackCheckoutState, paymentIntentId }) {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  const formationItem = items.find(item => String(item?.type || '').trim().toLowerCase() === 'formation');
  const firstItem = items[0] || null;
  const fallbackItem = fallbackCheckoutState?.item || {};
  const itemType = String(formationItem?.type || firstItem?.type || fallbackItem?.type || '')
    .trim()
    .toLowerCase();
  const itemName = String(formationItem?.name || firstItem?.name || fallbackItem?.name || '')
    .trim();
  const sessionDate =
    sale?.date_session ||
    sale?.date_formation ||
    fallbackCheckoutState?.legal?.dateFormation ||
    null;
  return {
    saleId: sale?.saleId || '',
    paymentIntentId,
    formationTitle: itemType === 'formation' ? itemName : '',
    itemTitle: itemName,
    type: itemType || 'purchase',
    sessionDate,
    totalAmount: Number(sale?.totalAmount || 0),
    purchasedAt: sale?.createdAt || sale?.date_achat || null
  };
}

function getRetryOrigin(intentDoc = null) {
  const origin = intentDoc?.checkoutState?.origin;
  if (!origin || typeof origin !== 'object') return null;
  const slug = String(origin.slug || '').trim().toLowerCase();
  const query = origin.query && typeof origin.query === 'object' ? origin.query : {};
  if (!slug) return null;
  return { slug, query };
}

/**
 * GET /api/stripe/payment-result?payment_intent_id=pi_xxx
 * Secure payment result: never trust URL redirect_status, always verify Stripe + DB ownership.
 */
export async function getPaymentResult(req, res) {
  const userId = getSessionUserId(req);
  if (!userId) {
    return res.status(401).json({ ok: false, error: 'Authentification requise.' });
  }

  const paymentIntentId = String(req.query.payment_intent_id || '').trim();
  if (!paymentIntentId) {
    return res.status(400).json({ ok: false, error: 'payment_intent_id manquant.' });
  }

  try {
    const stripe = await getStripe();
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    const sale = await Sale.findOne({
      $or: [{ stripePaymentIntentId: paymentIntentId }, { stripeSessionId: paymentIntentId }]
    }).lean();
    if (sale) {
      if (String(sale.userId || '') !== String(userId)) {
        return res.status(403).json({ ok: false, error: 'Acces refuse.' });
      }
      const fallbackIntent = await StripeCheckoutIntent.findOne({ stripeSessionId: paymentIntentId }).lean();
      return res.json({
        ok: true,
        status: 'succeeded',
        purchase: buildPurchasePayload({
          sale,
          fallbackCheckoutState: fallbackIntent?.checkoutState || null,
          paymentIntentId
        }),
        origin: getRetryOrigin(fallbackIntent)
      });
    }

    const metadataIntentId = String(paymentIntent?.metadata?.intentId || '').trim();
    let fallbackIntent = null;
    if (metadataIntentId) {
      fallbackIntent = await StripeCheckoutIntent.findById(metadataIntentId).lean();
    }
    if (!fallbackIntent) {
      fallbackIntent = await StripeCheckoutIntent.findOne({ stripeSessionId: paymentIntentId }).lean();
    }
    if (fallbackIntent && String(fallbackIntent.userId || '') !== String(userId)) {
      return res.status(403).json({ ok: false, error: 'Acces refuse.' });
    }

    const piStatus = String(paymentIntent?.status || '').trim().toLowerCase();
    if (piStatus === 'succeeded') {
      return res.json({
        ok: true,
        status: 'pending',
        origin: getRetryOrigin(fallbackIntent)
      });
    }
    if (piStatus === 'requires_payment_method' || piStatus === 'canceled') {
      return res.json({
        ok: true,
        status: 'failed',
        errorMessage: buildPaymentFailureMessage(paymentIntent),
        origin: getRetryOrigin(fallbackIntent)
      });
    }
    return res.json({
      ok: true,
      status: 'pending',
      origin: getRetryOrigin(fallbackIntent)
    });
  } catch (error) {
    if (error?.type === 'StripeInvalidRequestError') {
      return res.status(400).json({ ok: false, error: 'PaymentIntent introuvable.' });
    }
    console.error('[Stripe] Erreur lecture resultat paiement', error);
    return res.status(500).json({ ok: false, error: 'Impossible de verifier le resultat du paiement.' });
  }
}

async function handleRefundUpdatedEvent(event) {
  const stripeRefundObj = event.data.object;
  const stripeRefundId = String(stripeRefundObj.id || '').trim();
  if (!stripeRefundId) return;

  let refundDoc = await RefundRequest.findOne({ stripeRefundId });
  if (!refundDoc) {
    console.warn('[Stripe Webhook] RefundRequest introuvable pour stripeRefundId', stripeRefundId);
    return;
  }

  const refundStatus = String(stripeRefundObj.status || '').trim().toLowerCase();
  const stripeFailureReason = String(stripeRefundObj.failure_reason || '').trim();
  const giftCardAmount = Number.isFinite(Number(refundDoc.giftCardRefundAmount))
    ? Number(refundDoc.giftCardRefundAmount)
    : 0;
  const sale = refundDoc.saleId ? await Sale.findOne({ saleId: refundDoc.saleId }).lean() : null;

  const tryCreateCreditNote = async () => {
    if (!sale?.saleId) return;
    if (String(refundDoc.creditNoteId || '').trim()) return;
    const invoice = await Invoice.findOne({ saleId: sale.saleId }).lean();
    const stripeRefundAmount = Number.isFinite(Number(refundDoc.stripeRefundAmount))
      ? Number(refundDoc.stripeRefundAmount)
      : 0;
    if (!invoice?.stripeInvoiceId || stripeRefundAmount <= 0) return;
    try {
      const stripe = await getStripe();
      const creditNote = await stripe.creditNotes.create({
        invoice: invoice.stripeInvoiceId,
        amount: Math.round(stripeRefundAmount * 100),
        out_of_band_amount: Math.round(stripeRefundAmount * 100),
        reason: 'order_change',
        memo: `Remboursement vente ${sale.saleId}`
      }, {
        idempotencyKey: buildCreditNoteIdempotencyKey(refundDoc)
      });
      await RefundRequest.findByIdAndUpdate(refundDoc._id, {
        creditNoteId: creditNote.id,
        creditNotePdfUrl: creditNote.pdf
      });
      refundDoc.creditNoteId = creditNote.id;
      refundDoc.creditNotePdfUrl = creditNote.pdf;
    } catch (err) {
      console.error('[CreditNote] Echec creation credit note Stripe:', err);
    }
  };

  if (refundStatus === 'succeeded') {
    const alreadyFinalized =
      String(refundDoc.status || '').trim() === 'succeeded' &&
      normalizeStripeRefundStatus(refundDoc.stripeRefundStatus) === 'succeeded' &&
      ['succeeded', 'not_applicable'].includes(normalizeGiftCardRefundStatus(refundDoc.giftCardRefundStatus));
    if (alreadyFinalized) {
      await tryCreateCreditNote();
      return;
    }

    refundDoc.stripeRefundStatus = 'succeeded';
    const confirmedAt = stripeRefundObj.updated
      ? new Date(stripeRefundObj.updated * 1000)
      : (stripeRefundObj.created ? new Date(stripeRefundObj.created * 1000) : new Date());
    refundDoc.stripeRefundConfirmedAt = Number.isNaN(confirmedAt.getTime()) ? new Date() : confirmedAt;

    if (giftCardAmount > 0) {
      const claim = await claimGiftCardRecredit(refundDoc._id);
      if (!claim.claimed) {
        const latestRefund = claim.refundRequest;
        const latestGiftStatus = normalizeGiftCardRefundStatus(latestRefund?.giftCardRefundStatus);
        if (latestRefund?.giftCardRecredited || latestGiftStatus === 'succeeded') {
          refundDoc = latestRefund;
        } else {
          console.info('[Stripe Webhook] Duplicate refund webhook skipped while gift-card recredit is in progress', {
            stripeRefundId,
            refundId: refundDoc.refundId
          });
          return;
        }
      } else {
        refundDoc = claim.refundRequest || refundDoc;
        try {
          if (!sale) {
            throw new Error('Sale not found for mixed refund gift card recredit.');
          }
          await recreditGiftCardPortion(sale, giftCardAmount);
          refundDoc.giftCardRefundStatus = 'succeeded';
          refundDoc.giftCardRecredited = true;
          refundDoc.giftCardRecreditInProgress = false;
          refundDoc.giftCardRecreditAmount = giftCardAmount;
        } catch (giftError) {
          console.error('[Stripe Webhook] Echec recredit carte cadeau apres succes Stripe', {
            stripeRefundId,
            refundId: refundDoc.refundId,
            error: giftError
          });
          refundDoc.giftCardRefundStatus = 'rollback_needed';
          refundDoc.status = 'pending';
          refundDoc.processedAt = new Date();
          refundDoc.giftCardRecredited = false;
          refundDoc.giftCardRecreditInProgress = false;
          refundDoc.giftCardRecreditAmount = null;
          const existingNotes = String(refundDoc?.meta?.notes || '').trim();
          const alertNote = 'Echec Stripe - intervention requise';
          refundDoc.meta = refundDoc.meta || {};
          refundDoc.meta.notes = existingNotes.includes(alertNote)
            ? existingNotes
            : [existingNotes, alertNote].filter(Boolean).join(' | ');
          await refundDoc.save();
          return;
        }
      }
    } else {
      refundDoc.giftCardRefundStatus = 'not_applicable';
      refundDoc.giftCardRecreditInProgress = false;
    }

    const giftCardStatus = normalizeGiftCardRefundStatus(refundDoc.giftCardRefundStatus);
    const canFinalize = giftCardStatus === 'succeeded' || giftCardStatus === 'not_applicable';
    refundDoc.status = canFinalize ? 'succeeded' : 'pending';
    refundDoc.refundedAt = canFinalize ? new Date() : null;
    refundDoc.processedAt = new Date();
    await refundDoc.save();

    if (!canFinalize) {
      return;
    }

    await tryCreateCreditNote();

    console.log('[Stripe Webhook] Remboursement confirme', { stripeRefundId, refundId: refundDoc.refundId });

    try {
      await sendRefundConfirmedEmailInternal(refundDoc);
    } catch (emailErr) {
      console.error('[Stripe Webhook] Erreur envoi email confirmation remboursement', emailErr);
    }

    // Notification remboursement confirmé
    try {
      const refundUser = refundDoc.userId
        ? await User.findById(refundDoc.userId).select('firstName lastName email').lean()
        : null;
      const clientName = [refundUser?.firstName, refundUser?.lastName].filter(Boolean).join(' ')
        || refundUser?.email || '—';
      void triggerNotification('refund_requested', {
        clientName,
        amount: typeof refundDoc.amount === 'number' ? refundDoc.amount.toFixed(2) : '—',
        link: '/gestion.html?page=ventes',
        linkLabel: 'Voir les ventes'
      });
    } catch {}

    return;
  }

  if (refundStatus === 'failed') {
    refundDoc.stripeRefundStatus = 'failed';
    refundDoc.giftCardRecreditInProgress = false;
    if (giftCardAmount > 0) {
      const currentGiftStatus = normalizeGiftCardRefundStatus(refundDoc.giftCardRefundStatus);
      refundDoc.giftCardRefundStatus = currentGiftStatus === 'succeeded' ? 'succeeded' : 'pending';
    } else {
      refundDoc.giftCardRefundStatus = 'not_applicable';
    }
    refundDoc.status = 'failed';
    refundDoc.processedAt = new Date();
    refundDoc.refundedAt = null;
    const existingNotes = String(refundDoc?.meta?.notes || '').trim();
    const alertNote = 'Echec Stripe - intervention requise';
    refundDoc.meta = refundDoc.meta || {};
    refundDoc.meta.notes = existingNotes.includes(alertNote)
      ? existingNotes
      : [existingNotes, alertNote].filter(Boolean).join(' | ');
    await refundDoc.save();
    await ensureRefundCommissionReversal(refundDoc).catch(error =>
      console.error('[Stripe Webhook] Impossible de compenser la commission apres echec refund', error)
    );
    console.error('[Stripe Webhook] Remboursement echoue', {
      stripeRefundId,
      refundId: refundDoc.refundId,
      failureReason: stripeFailureReason || 'unknown'
    });
    return;
  }

  refundDoc.stripeRefundStatus = normalizeStripeRefundStatus(refundStatus === 'pending' ? 'pending' : refundDoc.stripeRefundStatus);
  await refundDoc.save();
}

/**
 * GET /api/stripe/config  (public)
 * Returns publishable key only. Never exposes STRIPE_SECRET_KEY.
 */
export async function getConfig(req, res) {
  let publishableKey = '';
  try {
    publishableKey = await getCredential('stripe-institut', { role: 'publishable_key' });
  } catch (_err) {
    publishableKey = '';
  }
  if (!publishableKey) {
    return res.status(500).json({ ok: false, error: 'Clé Stripe publishable indisponible (coffre/.env).' });
  }
  return res.json({ publishableKey });
}
