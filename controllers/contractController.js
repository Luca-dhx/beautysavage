import fs from 'node:fs/promises';
import path from 'node:path';

import mongoose from 'mongoose';

import Contract from '../models/Contract.js';
import ContractCheckoutIntent from '../models/ContractCheckoutIntent.js';
import { getStripeDevClient } from '../utils/stripeDevClient.js';
import { invalidateContractCache } from '../middlewares/contractGuard.js';
import { getCredential } from '../services/integratedApiCredentialService.js';
import { getActiveCommissionConfig } from '../services/commissionService.js';

const CONTRACT_UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads', 'contracts');
const CONTRACT_TEMP_DIR = path.resolve(process.cwd(), 'uploads', 'contracts', 'temp');
const CONTRACT_UPLOAD_PUBLIC_PREFIX = '/uploads/contracts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function contractAmountTtcCents(amount, taxRate) {
  const amountNum = Number(amount || 0);
  const taxNum = Number(taxRate || 0);
  return Math.round(amountNum * (1 + taxNum) * 100);
}

function resolveAbsolutePath(storagePath) {
  const normalized = String(storagePath || '').replace(/\\/g, '/');
  if (!normalized.startsWith(`${CONTRACT_UPLOAD_PUBLIC_PREFIX}/`)) {
    throw new Error('Chemin de fichier contrat invalide.');
  }
  const relative = normalized.replace(/^\/+/, '');
  const absolutePath = path.resolve(process.cwd(), relative);
  const normalizedRoot = `${CONTRACT_UPLOAD_ROOT}${path.sep}`;
  if (absolutePath !== CONTRACT_UPLOAD_ROOT && !absolutePath.startsWith(normalizedRoot)) {
    throw new Error('Chemin de fichier contrat non autorisé.');
  }
  return absolutePath;
}

function toResponseContract(contract) {
  if (!contract) return null;
  const c = contract.toObject ? contract.toObject() : { ...contract };
  return {
    _id: c._id,
    status: c.status,
    file: c.file,
    fileOriginalName: c.fileOriginalName,
    fileMimeType: c.fileMimeType,
    fileDownloadedAt: c.fileDownloadedAt,
    lockedAt: c.lockedAt,
    launchFee: c.launchFee,
    monthlyFee: {
      amount: c.monthlyFee?.amount,
      taxRate: c.monthlyFee?.taxRate,
      active: c.monthlyFee?.active,
      currentPeriodEnd: c.monthlyFee?.currentPeriodEnd,
      gracePeriodDays: c.monthlyFee?.gracePeriodDays,
      stripeSubscriptionId: c.monthlyFee?.stripeSubscriptionId,
      stripeCustomerId: c.monthlyFee?.stripeCustomerId
      // pendingClientSecret intentionnellement omis de la réponse par défaut
    },
    commissions: c.commissions || null,
    cancellationPolicy: c.cancellationPolicy,
    pendingMessage: c.pendingMessage,
    activatedAt: c.activatedAt,
    activatedBy: c.activatedBy,
    cancelledAt: c.cancelledAt,
    cancelledBy: c.cancelledBy,
    createdBy: c.createdBy,
    updatedBy: c.updatedBy,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  };
}

async function ensureNoActiveOrPending() {
  const existing = await Contract.findOne({ status: { $in: ['active', 'pending'] } }).lean();
  if (existing) {
    const err = new Error('Un contrat pending ou actif existe déjà.');
    err.status = 409;
    err.code = 'CONTRACT_ALREADY_EXISTS';
    throw err;
  }
}

async function computeResumeSlide(contract) {
  await syncStripeStatuses(contract);
  if (contract.status === 'active') return 8;
  if (contract.monthlyFee?.active) return 8;
  if (contract.launchFee?.paid && Number(contract.monthlyFee?.amount || 0) > 0) return 6;
  if (contract.launchFee?.paid && Number(contract.monthlyFee?.amount || 0) === 0) return 8;
  // Fichier téléchargé (= contrat accepté) → sauter slides 1-2
  if (contract.fileDownloadedAt) {
    if (Number(contract.launchFee?.amount || 0) > 0) return 3;
    if (Number(contract.monthlyFee?.amount || 0) > 0) return 6;
    return 8;
  }
  return 1;
}

function respondError(res, error, context) {
  console.error(`[ContractController:${context}]`, error);
  const status = error?.status || 500;
  return res.status(status).json({
    ok: false,
    code: error?.code || 'CONTRACT_ERROR',
    error: error?.message || 'Erreur interne.'
  });
}

// ---------------------------------------------------------------------------
// GET /api/contract/stripe-dev-config — public
// Retourne la clé publique Stripe Developer
// ---------------------------------------------------------------------------
export async function getStripeDevConfig(_req, res) {
  let publishableKey = '';
  try {
    publishableKey = await getCredential('stripe-dev', { role: 'publishable_key' });
  } catch (_err) {
    publishableKey = '';
  }
  if (!publishableKey) {
    return res.status(500).json({ ok: false, error: 'Clé Stripe Developer non configurée.' });
  }
  return res.json({ ok: true, publishableKey });
}

// ---------------------------------------------------------------------------
// GET /api/contract/status — public, used by polling
// ---------------------------------------------------------------------------
export async function getContractStatus(req, res) {
  try {
    const contract = await Contract.findOne({ status: { $in: ['active', 'pending'] } })
      .select({ status: 1, pendingMessage: 1 })
      .lean();

    if (!contract) {
      return res.json({ ok: true, status: 'none' });
    }
    return res.json({
      ok: true,
      status: contract.status,
      pendingMessage: contract.pendingMessage || null
    });
  } catch (error) {
    return respondError(res, error, 'GetStatus');
  }
}

// ---------------------------------------------------------------------------
// GET /api/contract/pending-info — admin + dev
// Met à jour lockedAt à la première consultation, retourne fileDownloaded
// ---------------------------------------------------------------------------
export async function getPendingInfo(req, res) {
  try {
    const contract = await Contract.findOne({ status: { $in: ['active', 'pending'] } })
      .populate('activatedBy', 'email')
      .populate('createdBy', 'email role')
      .populate('updatedBy', 'email role');

    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Aucun contrat actif ou en attente.' });
    }

    // Lock on first consult
    if (!contract.lockedAt) {
      contract.lockedAt = new Date();
      contract.updatedBy = req.sessionUser?._id || contract.updatedBy;
      await contract.save();
    }

    const resp = toResponseContract(contract);
    resp.fileDownloaded = Boolean(contract.fileDownloadedAt);

    return res.json({
      ok: true,
      fileDownloaded: Boolean(contract.fileDownloadedAt),
      resumeSlide: await computeResumeSlide(contract),
      contract: resp
    });
  } catch (error) {
    return respondError(res, error, 'GetPendingInfo');
  }
}

// ---------------------------------------------------------------------------
// POST /api/contract/download-file — admin + dev
// Enregistre fileDownloadedAt, stream le fichier
// ---------------------------------------------------------------------------
export async function downloadContractFile(req, res) {
  try {
    const contract = await Contract.findOne({ status: { $in: ['active', 'pending'] } });

    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Aucun contrat à télécharger.' });
    }

    if (!contract.file) {
      return res.status(404).json({ ok: false, error: 'Fichier contrat introuvable.' });
    }

    const absolutePath = resolveAbsolutePath(contract.file);
    try {
      await fs.access(absolutePath);
    } catch (_e) {
      return res.status(404).json({ ok: false, error: 'Fichier contrat introuvable sur le serveur.' });
    }

    // Record download date
    if (!contract.fileDownloadedAt) {
      contract.fileDownloadedAt = new Date();
      contract.updatedBy = req.sessionUser?._id || contract.updatedBy;
      await contract.save();
    }

    const safeFileName = String(contract.fileOriginalName || 'contrat.pdf');
    return res.download(absolutePath, safeFileName);
  } catch (error) {
    return respondError(res, error, 'DownloadFile');
  }
}

// ---------------------------------------------------------------------------
// POST /api/contract/create-launch-intent — admin + dev
// Crée un PaymentIntent Stripe Developer pour les frais de lancement
// ---------------------------------------------------------------------------
export async function createLaunchIntent(req, res) {
  const stripeDevClient = await getStripeDevClient();
  try {
    if (!stripeDevClient) {
      return res.status(500).json({ ok: false, error: 'Client Stripe Developer non configuré.' });
    }

    const contract = await Contract.findOne({ status: 'pending' });
    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Aucun contrat en attente.' });
    }

    if (contract.launchFee?.paid) {
      return res.status(409).json({ ok: false, error: 'Frais de lancement déjà réglés.' });
    }

    const amountCents = contractAmountTtcCents(
      contract.launchFee?.amount,
      contract.launchFee?.taxRate
    );
    if (amountCents <= 0) {
      return res.status(400).json({ ok: false, error: 'Montant des frais de lancement invalide.' });
    }

    // Idempotence — check existing unprocessed intent and verify its Stripe status
    const existingLaunch = await ContractCheckoutIntent.findOne({
      contractId: contract._id,
      type: 'launch',
      processed: false,
      stripePaymentIntentId: { $ne: null }
    }).lean();
    if (existingLaunch?.stripePaymentIntentId) {
      const pi = await stripeDevClient.paymentIntents.retrieve(existingLaunch.stripePaymentIntentId);
      switch (pi.status) {
        case 'succeeded':
          await ContractCheckoutIntent.findByIdAndUpdate(existingLaunch._id, { processed: true });
          return res.json({ ok: true, alreadyProcessed: true });
        case 'canceled':
        case 'requires_payment_method':
          await ContractCheckoutIntent.findByIdAndDelete(existingLaunch._id);
          break; // fall through to create a new PaymentIntent
        case 'requires_confirmation':
        case 'requires_action':
        case 'processing':
          return res.json({ ok: true, clientSecret: pi.client_secret, paymentIntentId: pi.id, amountCents });
        default:
          await ContractCheckoutIntent.findByIdAndDelete(existingLaunch._id);
          break;
      }
    }

    // Nettoyer TOUS les anciens intents launch — processed ou non
    await ContractCheckoutIntent.deleteMany({
      contractId: contract._id,
      type: 'launch'
    });

    const paymentIntent = await stripeDevClient.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: {
        contractId: String(contract._id),
        type: 'launch_fee'
      }
    });

    await ContractCheckoutIntent.create({
      stripePaymentIntentId: paymentIntent.id,
      contractId: contract._id,
      adminId: req.sessionUser._id,
      type: 'launch',
      processed: false
    });

    return res.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents
    });
  } catch (error) {
    return respondError(res, error, 'CreateLaunchIntent');
  }
}

// ---------------------------------------------------------------------------
// POST /api/contract/create-monthly-setup — admin + dev
// Crée un SetupIntent Stripe Developer pour la souscription mensuelle
// ---------------------------------------------------------------------------
export async function createMonthlySetup(req, res) {
  const stripeDevClient = await getStripeDevClient();
  try {
    if (!stripeDevClient) {
      return res.status(500).json({ ok: false, error: 'Client Stripe Developer non configuré.' });
    }

    const contract = await Contract.findOne({ status: 'pending' });
    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Aucun contrat en attente.' });
    }

    // If launch fee exists, it must be paid first
    if ((contract.launchFee?.amount || 0) > 0 && !contract.launchFee?.paid) {
      return res.status(409).json({
        ok: false,
        error: 'Les frais de lancement doivent être réglés avant la souscription mensuelle.'
      });
    }

    if (contract.monthlyFee?.active) {
      return res.status(409).json({ ok: false, error: 'Mensualité déjà active.' });
    }

    // Create or reuse Stripe customer
    let customerId = contract.monthlyFee?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripeDevClient.customers.create({
        metadata: { contractId: String(contract._id) }
      });
      customerId = customer.id;
      contract.monthlyFee.stripeCustomerId = customerId;
      await contract.save();
    }

    // Idempotence — check existing unprocessed intent and verify its Stripe status
    const existingMonthly = await ContractCheckoutIntent.findOne({
      contractId: contract._id,
      type: 'monthly',
      processed: false,
      stripeSetupIntentId: { $ne: null }
    }).lean();
    if (existingMonthly?.stripeSetupIntentId) {
      const si = await stripeDevClient.setupIntents.retrieve(existingMonthly.stripeSetupIntentId);
      switch (si.status) {
        case 'succeeded':
          await ContractCheckoutIntent.findByIdAndUpdate(existingMonthly._id, { processed: true });
          return res.json({ ok: true, alreadyProcessed: true });
        case 'canceled':
          await ContractCheckoutIntent.findByIdAndDelete(existingMonthly._id);
          break; // fall through to create a new SetupIntent
        case 'requires_confirmation':
        case 'requires_action':
          return res.json({ ok: true, clientSecret: si.client_secret, setupIntentId: si.id, customerId });
        default:
          await ContractCheckoutIntent.findByIdAndDelete(existingMonthly._id);
          break;
      }
    }

    // Nettoyer TOUS les anciens intents monthly — processed ou non
    await ContractCheckoutIntent.deleteMany({
      contractId: contract._id,
      type: 'monthly'
    });

    const setupIntent = await stripeDevClient.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      metadata: {
        contractId: String(contract._id),
        type: 'monthly_setup'
      }
    });

    await ContractCheckoutIntent.create({
      stripeSetupIntentId: setupIntent.id,
      contractId: contract._id,
      adminId: req.sessionUser._id,
      type: 'monthly',
      processed: false
    });

    // Store pending client secret
    contract.monthlyFee.pendingClientSecret = setupIntent.client_secret;
    contract.updatedBy = req.sessionUser._id;
    await contract.save();

    return res.json({
      ok: true,
      clientSecret: setupIntent.client_secret,
      setupIntentId: setupIntent.id,
      customerId
    });
  } catch (error) {
    return respondError(res, error, 'CreateMonthlySetup');
  }
}

// ---------------------------------------------------------------------------
// POST /api/contract/activate-free — dev only
// Active immédiatement si launchFee = 0 et monthlyFee = 0
// ---------------------------------------------------------------------------
export async function activateFreeContract(req, res) {
  try {
    const contract = await Contract.findOne({ status: 'pending' });
    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Aucun contrat en attente.' });
    }

    const launchAmount = Number(contract.launchFee?.amount || 0);
    const monthlyAmount = Number(contract.monthlyFee?.amount || 0);

    if (launchAmount > 0 || monthlyAmount > 0) {
      return res.status(400).json({
        ok: false,
        error: 'Ce contrat a des montants non nuls. Utilisez le parcours de paiement.'
      });
    }

    // Activation centralisee uniquement via POST /api/contract/activate
    return activateContract(req, res);
  } catch (error) {
    return respondError(res, error, 'ActivateFree');
  }
}

// ---------------------------------------------------------------------------
// POST /api/contract — dev only
// Crée un contrat (upload fichier obligatoire)
// ---------------------------------------------------------------------------
export async function createContract(req, res) {
  try {
    await ensureNoActiveOrPending();

    // Accepte soit un fichier multer direct, soit un tempFileId pré-uploadé
    let fileData;
    if (req.body?.tempFileId) {
      const tempId = String(req.body.tempFileId);
      if (/[/\\]|\.\./.test(tempId)) {
        return res.status(400).json({ ok: false, error: 'tempFileId invalide.' });
      }
      const tempPath = path.join(CONTRACT_TEMP_DIR, tempId);
      const destPath = path.join(CONTRACT_UPLOAD_ROOT, tempId);
      try {
        await fs.rename(tempPath, destPath);
      } catch (_) {
        try {
          await fs.copyFile(tempPath, destPath);
          await fs.unlink(tempPath).catch(() => {});
        } catch {
          return res.status(400).json({ ok: false, error: 'Fichier temporaire introuvable.' });
        }
      }
      const originalName = String(req.body.originalName || tempId);
      const ext = path.extname(tempId).toLowerCase();
      const mimeByExt = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };
      fileData = { filename: tempId, originalname: originalName, mimetype: mimeByExt[ext] || 'application/octet-stream' };
    } else if (req.file) {
      fileData = req.file;
    } else {
      return res.status(400).json({ ok: false, error: 'Fichier contrat requis.' });
    }

    const {
      launchFeeAmount = 0,
      launchFeeTaxRate = 0.2,
      monthlyFeeAmount = 0,
      monthlyFeeTaxRate = 0.2,
      gracePeriodDays = 3,
      cancellationPolicyType = 'anytime',
      cancellationPolicyLockedMonths = null,
      pendingMessage = 'Site en cours de configuration. Revenez bientôt.',
      commissionsType = null,
      commissionsValue = null
    } = req.body || {};

    // Auto-fill commissions depuis la config active si non fournie
    let resolvedCommissionsType = commissionsType || null;
    let resolvedCommissionsValue = commissionsValue != null ? Number(commissionsValue) : null;
    if (!resolvedCommissionsType) {
      const activeConfig = await getActiveCommissionConfig();
      if (activeConfig) {
        resolvedCommissionsType = activeConfig.type;
        resolvedCommissionsValue = activeConfig.value;
      }
    }

    const fileName = path.basename(fileData.filename || fileData.path || '');
    const storagePath = `${CONTRACT_UPLOAD_PUBLIC_PREFIX}/${fileName}`;

    const contract = await Contract.create({
      status: 'pending',
      file: storagePath,
      fileOriginalName: String(fileData.originalname || 'contrat.pdf'),
      fileMimeType: String(fileData.mimetype || 'application/pdf'),
      launchFee: {
        amount: Number(launchFeeAmount) || 0,
        taxRate: Number(launchFeeTaxRate) || 0.2,
        paid: false
      },
      monthlyFee: {
        amount: Number(monthlyFeeAmount) || 0,
        taxRate: Number(monthlyFeeTaxRate) || 0.2,
        active: false,
        gracePeriodDays: Number(gracePeriodDays) || 3
      },
      cancellationPolicy: {
        type: String(cancellationPolicyType) === 'locked' ? 'locked' : 'anytime',
        lockedMonths: cancellationPolicyType === 'locked' ? (Number(cancellationPolicyLockedMonths) || null) : null
      },
      commissions: resolvedCommissionsType
        ? { type: resolvedCommissionsType, value: resolvedCommissionsValue }
        : { type: null, value: null },
      pendingMessage: String(pendingMessage).trim() || 'Site en cours de configuration. Revenez bientôt.',
      createdBy: req.sessionUser._id,
      updatedBy: req.sessionUser._id
    });

    invalidateContractCache();

    const populated = await Contract.findById(contract._id)
      .populate('createdBy', 'email role')
      .populate('updatedBy', 'email role');

    return res.status(201).json({ ok: true, contract: toResponseContract(populated) });
  } catch (error) {
    // Clean up uploaded file if contract creation failed
    if (req.file?.path) {
      fs.unlink(req.file.path).catch(() => {});
    }
    return respondError(res, error, 'Create');
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/contract/:id — dev only
// Règles de verrouillage :
//   1. fileDownloadedAt présent → 2 confirmations requises (handled client-side, backend exige force=true)
//   2. lockedAt présent → 2 confirmations requises (force=true)
//   3. ni l'un ni l'autre → 1 confirmation suffit
// ---------------------------------------------------------------------------
export async function deleteContract(req, res) {
  try {
    const contract = await Contract.findById(req.params.id);
    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Contrat introuvable.' });
    }

    if (contract.status === 'active') {
      return res.status(409).json({
        ok: false,
        error: 'Un contrat actif ne peut pas être supprimé. Annulez-le d\'abord.'
      });
    }

    const requiresDoubleConfirm =
      Boolean(contract.fileDownloadedAt) || Boolean(contract.lockedAt);

    const force = String(req.query?.force || req.body?.force || '').trim() === 'true';

    if (requiresDoubleConfirm && !force) {
      return res.status(409).json({
        ok: false,
        code: 'DOUBLE_CONFIRM_REQUIRED',
        error: 'Ce contrat a été consulté ou verrouillé. Envoyez force=true pour confirmer la suppression.',
        requiresDoubleConfirm: true
      });
    }

    // Delete physical file
    if (contract.file) {
      try {
        const absPath = resolveAbsolutePath(contract.file);
        await fs.unlink(absPath);
      } catch (_e) {
        // File may already be gone
      }
    }

    // Delete associated checkout intents
    await ContractCheckoutIntent.deleteMany({ contractId: contract._id });

    await Contract.deleteOne({ _id: contract._id });

    invalidateContractCache();

    return res.json({ ok: true });
  } catch (error) {
    return respondError(res, error, 'Delete');
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/contract/:id/grace-period — dev only
// ---------------------------------------------------------------------------
export async function updateGracePeriod(req, res) {
  try {
    const { gracePeriodDays } = req.body || {};
    const days = Number(gracePeriodDays);
    if (!Number.isFinite(days) || days < 0) {
      return res.status(400).json({ ok: false, error: 'gracePeriodDays invalide.' });
    }

    const contract = await Contract.findByIdAndUpdate(
      req.params.id,
      { 'monthlyFee.gracePeriodDays': days, updatedBy: req.sessionUser._id },
      { new: true }
    );
    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Contrat introuvable.' });
    }

    return res.json({ ok: true, contract: toResponseContract(contract) });
  } catch (error) {
    return respondError(res, error, 'UpdateGracePeriod');
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/contract/:id/pending-message — dev only
// ---------------------------------------------------------------------------
export async function updatePendingMessage(req, res) {
  try {
    const { pendingMessage } = req.body || {};
    const message = String(pendingMessage || '').trim();

    const contract = await Contract.findByIdAndUpdate(
      req.params.id,
      { pendingMessage: message || 'Site en cours de configuration. Revenez bientôt.', updatedBy: req.sessionUser._id },
      { new: true }
    );
    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Contrat introuvable.' });
    }

    invalidateContractCache();

    return res.json({ ok: true, contract: toResponseContract(contract) });
  } catch (error) {
    return respondError(res, error, 'UpdatePendingMessage');
  }
}

// ---------------------------------------------------------------------------
// GET /api/contract/history — dev only
// Liste les contrats cancelled
// ---------------------------------------------------------------------------
export async function getContractHistory(req, res) {
  try {
    const contracts = await Contract.find({ status: 'cancelled' })
      .sort({ cancelledAt: -1 })
      .populate('createdBy', 'email role')
      .populate('cancelledBy', 'email role')
      .populate('activatedBy', 'email role');

    return res.json({
      ok: true,
      contracts: contracts.map(toResponseContract)
    });
  } catch (error) {
    return respondError(res, error, 'GetHistory');
  }
}

// ---------------------------------------------------------------------------
// syncStripeStatuses — partagée, importée par le job de sync
// Vérifie les statuts Stripe et auto-active si tout est ok
// ---------------------------------------------------------------------------
export async function syncStripeStatuses(contract) {
  const stripeDevClient = await getStripeDevClient();
  if (!stripeDevClient) return;

  // Vérifier PaymentIntent launch
  if (!contract.launchFee?.paid && Number(contract.launchFee?.amount || 0) > 0) {
    const intent = await ContractCheckoutIntent.findOne({
      contractId: contract._id,
      type: 'launch'
    });
    if (intent?.stripePaymentIntentId) {
      try {
        const pi = await stripeDevClient.paymentIntents.retrieve(intent.stripePaymentIntentId);
        if (pi.status === 'succeeded') {
          contract.launchFee.paid = true;
          intent.processed = true;
          await intent.save();
        }
      } catch (_) {}
    }
  }

  // Vérifier SetupIntent + Subscription monthly
  if (!contract.monthlyFee?.active && Number(contract.monthlyFee?.amount || 0) > 0) {
    if (contract.monthlyFee?.stripeSubscriptionId) {
      try {
        const sub = await stripeDevClient.subscriptions.retrieve(contract.monthlyFee.stripeSubscriptionId);
        if (sub.status === 'active') {
          contract.monthlyFee.active = true;
          await ContractCheckoutIntent.findOneAndUpdate(
            { contractId: contract._id, type: 'monthly', processed: false },
            { processed: true }
          );
        }
      } catch (_) {}
    }
  }

  // Pas d'auto-activation ici: activation manuelle via POST /api/contract/activate
  await contract.save();
}

// ---------------------------------------------------------------------------
// GET /api/contract/check-payment-status — admin + dev
// ---------------------------------------------------------------------------
export async function checkPaymentStatus(req, res) {
  try {
    const contract = await Contract.findOne({ status: { $in: ['pending', 'active'] } });
    if (!contract) return res.json({ ok: true, steps: {}, contractStatus: 'none' });

    await syncStripeStatuses(contract);

    const steps = {
      adminConnected: true,
      fileDownloaded: !!contract.fileDownloadedAt,
      contractAccepted: !!contract.fileDownloadedAt,
      launchFeePaid: contract.launchFee?.paid || false,
      launchFeeRequired: Number(contract.launchFee?.amount || 0) > 0,
      monthlyActive: contract.monthlyFee?.active || false,
      monthlyRequired: Number(contract.monthlyFee?.amount || 0) > 0,
      contractActive: contract.status === 'active'
    };

    return res.json({ ok: true, steps, contractStatus: contract.status });
  } catch (error) {
    return respondError(res, error, 'CheckPaymentStatus');
  }
}

// ---------------------------------------------------------------------------
// POST /api/contract/verify-launch-payment — admin + dev
// Vérifie côté serveur le statut du dernier PaymentIntent launch
// ---------------------------------------------------------------------------
export async function verifyLaunchPayment(req, res) {
  const stripeDevClient = await getStripeDevClient();
  try {
    if (!stripeDevClient) {
      return res.status(500).json({ ok: false, error: 'Client Stripe Developer non configuré.' });
    }

    const contract = await Contract.findOne({ status: 'pending' });
    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Aucun contrat en attente.' });
    }

    const intent = await ContractCheckoutIntent.findOne({
      contractId: contract._id,
      type: 'launch',
      stripePaymentIntentId: { $ne: null }
    })
      .sort({ createdAt: -1 });

    if (!intent?.stripePaymentIntentId) {
      return res.status(404).json({ ok: false, error: 'Aucun intent launch trouvé.' });
    }

    const pi = await stripeDevClient.paymentIntents.retrieve(intent.stripePaymentIntentId);
    if (pi.status === 'succeeded') {
      contract.launchFee.paid = true;
      contract.updatedBy = req.sessionUser?._id || contract.updatedBy;
      await contract.save();
      if (!intent.processed) {
        intent.processed = true;
        await intent.save();
      }
      return res.json({ ok: true });
    }

    return res.json({ ok: false, status: pi.status });
  } catch (error) {
    return respondError(res, error, 'VerifyLaunchPayment');
  }
}

// ---------------------------------------------------------------------------
// POST /api/contract/verify-monthly-setup — admin + dev
// Vérifie côté serveur le statut du dernier SetupIntent monthly
// ---------------------------------------------------------------------------
export async function verifyMonthlySetup(req, res) {
  const stripeDevClient = await getStripeDevClient();
  try {
    if (!stripeDevClient) {
      return res.status(500).json({ ok: false, error: 'Client Stripe Developer non configuré.' });
    }

    const contract = await Contract.findOne({ status: 'pending' });
    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Aucun contrat en attente.' });
    }

    const intent = await ContractCheckoutIntent.findOne({
      contractId: contract._id,
      type: 'monthly',
      stripeSetupIntentId: { $ne: null }
    })
      .sort({ createdAt: -1 });

    if (!intent?.stripeSetupIntentId) {
      return res.status(404).json({ ok: false, error: 'Aucun intent monthly trouvé.' });
    }

    const si = await stripeDevClient.setupIntents.retrieve(intent.stripeSetupIntentId);
    if (si.status === 'succeeded') {
      contract.monthlyFee.active = true;
      contract.updatedBy = req.sessionUser?._id || contract.updatedBy;
      await contract.save();
      if (!intent.processed) {
        intent.processed = true;
        await intent.save();
      }
      return res.json({ ok: true });
    }

    return res.json({ ok: false, status: si.status });
  } catch (error) {
    return respondError(res, error, 'VerifyMonthlySetup');
  }
}

// ---------------------------------------------------------------------------
// POST /api/contract/activate — admin + dev
// Active le contrat si toutes les conditions sont remplies
// ---------------------------------------------------------------------------
export async function activateContract(req, res) {
  try {
    const contract = await Contract.findOne({ status: 'pending' });
    if (!contract) return res.status(404).json({ ok: false, error: 'Aucun contrat en attente.' });

    const launchRequired = (contract.launchFee?.amount || 0) > 0;
    const monthlyRequired = (contract.monthlyFee?.amount || 0) > 0;

    if (launchRequired && !contract.launchFee?.paid) {
      return res.status(409).json({ ok: false, error: 'Frais de lancement non réglés.' });
    }
    if (monthlyRequired && !contract.monthlyFee?.active) {
      return res.status(409).json({ ok: false, error: 'Mensualité non souscrite.' });
    }

    await syncStripeStatuses(contract);

    const launchOk = Number(contract.launchFee?.amount || 0) === 0 || contract.launchFee?.paid;
    const monthlyOk = Number(contract.monthlyFee?.amount || 0) === 0 || contract.monthlyFee?.active;

    if (!launchOk) return res.status(400).json({ ok: false, error: 'Les frais de lancement ne sont pas encore confirmés.' });
    if (!monthlyOk) return res.status(400).json({ ok: false, error: 'La souscription à la maintenance n\'est pas encore confirmée.' });

    if (contract.status !== 'active') {
      contract.status = 'active';
      contract.activatedAt = new Date();
      contract.activatedBy = req.sessionUser?._id;
      contract.updatedBy = req.sessionUser?._id;
      await contract.save();
      invalidateContractCache();
    }

    let lockedUntil = null;
    if (contract.cancellationPolicy?.type === 'locked' && contract.cancellationPolicy?.lockedMonths) {
      const d = new Date(contract.activatedAt);
      d.setMonth(d.getMonth() + contract.cancellationPolicy.lockedMonths);
      lockedUntil = d.toISOString();
    }

    return res.json({ ok: true, activatedAt: contract.activatedAt, lockedUntil });
  } catch (error) {
    return respondError(res, error, 'Activate');
  }
}

// ---------------------------------------------------------------------------
// GET /api/contract/current — admin + dev
// Vue synthétique du contrat actif ou en attente pour l'interface admin
// ---------------------------------------------------------------------------
export async function getCurrentContract(req, res) {
  try {
    const contract = await Contract.findOne({ status: { $in: ['active', 'pending'] } });

    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Aucun contrat actif.' });
    }

    return res.json({
      ok: true,
      contract: {
        status: contract.status,
        startDate: contract.activatedAt,
        launchFee: {
          amount: contract.launchFee?.amount,
          taxRate: contract.launchFee?.taxRate,
          paid: contract.launchFee?.paid
        },
        monthlyFee: {
          amount: contract.monthlyFee?.amount,
          taxRate: contract.monthlyFee?.taxRate,
          active: contract.monthlyFee?.active,
          stripeSubscriptionId: contract.monthlyFee?.stripeSubscriptionId,
          currentPeriodEnd: contract.monthlyFee?.currentPeriodEnd,
          cancelAtPeriodEnd: contract.monthlyFee?.cancelAtPeriodEnd || false
        },
        cancelAtPeriodEnd: contract.monthlyFee?.cancelAtPeriodEnd || false,
        commissions: contract.commissions
          ? { type: contract.commissions.type, value: contract.commissions.value }
          : null
      }
    });
  } catch (error) {
    return respondError(res, error, 'GetCurrentContract');
  }
}

// ---------------------------------------------------------------------------
// POST /api/contract/cancel — admin + dev
// Avec abonnement Stripe : cancel_at_period_end=true, status inchangé
//   → La transition status='cancelled' est déléguée au webhook customer.subscription.deleted
// Sans abonnement Stripe : résiliation immédiate (status='cancelled')
// ---------------------------------------------------------------------------
export async function cancelContract(req, res) {
  const stripeDevClient = await getStripeDevClient();
  try {
    const contract = await Contract.findOne({ status: 'active' });

    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Aucun contrat actif.' });
    }

    if (contract.monthlyFee?.stripeSubscriptionId) {
      const updatedSub = await stripeDevClient.subscriptions.update(
        contract.monthlyFee.stripeSubscriptionId,
        { cancel_at_period_end: true }
      );
      // Persiste current_period_end si pas encore en base (webhook peut ne pas avoir encore tourné)
      if (!contract.monthlyFee.currentPeriodEnd && updatedSub.current_period_end) {
        contract.monthlyFee.currentPeriodEnd = new Date(updatedSub.current_period_end * 1000);
      }

      contract.monthlyFee.cancelAtPeriodEnd = true;
      contract.updatedBy = req.sessionUser?._id;
      await contract.save();

      return res.json({
        ok: true,
        cancelAtPeriodEnd: true,
        immediate: false,
        currentPeriodEnd: contract.monthlyFee.currentPeriodEnd ?? null
      });
    }

    // Pas d'abonnement Stripe — résiliation immédiate
    contract.status = 'cancelled';
    contract.cancelledAt = new Date();
    contract.cancelledBy = req.sessionUser?._id;
    contract.updatedBy = req.sessionUser?._id;
    await contract.save();
    invalidateContractCache();

    return res.json({ ok: true, cancelAtPeriodEnd: false, immediate: true });
  } catch (error) {
    return respondError(res, error, 'CancelContract');
  }
}

// ---------------------------------------------------------------------------
// POST /api/contract/cancel-immediate — dev only, non-production uniquement
// Résilie immédiatement le contrat actif ou en attente
// ---------------------------------------------------------------------------
export async function cancelImmediate(req, res) {
  const stripeDevClient = await getStripeDevClient();
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'Non disponible en production.' });
    }

    const contract = await Contract.findOne({ status: { $in: ['pending', 'active'] } });
    if (!contract) return res.status(404).json({ ok: false, error: 'Aucun contrat actif.' });

    // Annuler l'abonnement Stripe si existant
    if (contract.monthlyFee?.stripeSubscriptionId) {
      try {
        await stripeDevClient.subscriptions.cancel(contract.monthlyFee.stripeSubscriptionId);
      } catch (err) {
        console.warn('[DevCancel] Erreur annulation subscription Stripe:', err.message);
      }
    }

    contract.status = 'cancelled';
    contract.cancelledAt = new Date();
    contract.cancelledBy = req.sessionUser?._id;
    contract.monthlyFee.active = false;
    await contract.save();

    invalidateContractCache();

    await ContractCheckoutIntent.deleteMany({ contractId: contract._id });

    return res.json({ ok: true });
  } catch (error) {
    return respondError(res, error, 'CancelImmediate');
  }
}

// ---------------------------------------------------------------------------
// POST /api/contract/upload-temp — dev only
// Upload d'un fichier contrat temporaire avant création
// ---------------------------------------------------------------------------
export async function uploadTempFile(req, res) {
  try {
    if (!req.file) return res.status(400).json({ ok: false, error: 'Aucun fichier reçu.' });
    return res.json({ ok: true, tempFileId: req.file.filename, originalName: req.file.originalname });
  } catch (error) {
    return respondError(res, error, 'UploadTemp');
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/contract/upload-temp/:id — dev only
// Supprime un fichier temporaire
// ---------------------------------------------------------------------------
export async function deleteTempFile(req, res) {
  try {
    const { id } = req.params;
    if (!id || /[/\\]|\.\./.test(id)) {
      return res.status(400).json({ ok: false, error: 'ID de fichier invalide.' });
    }
    const filePath = path.join(CONTRACT_TEMP_DIR, id);
    await fs.unlink(filePath).catch(() => {});
    return res.json({ ok: true });
  } catch (error) {
    return respondError(res, error, 'DeleteTemp');
  }
}

// ---------------------------------------------------------------------------
// GET /api/contract/active — dev + admin (shared)
// Retourne le contrat actif avec données Stripe dev (dev only fields)
// ---------------------------------------------------------------------------
export async function getActiveContract(req, res) {
  try {
    const contract = await Contract.findOne({ status: { $in: ['active', 'pending'] } })
      .populate('createdBy', 'email role firstName lastName')
      .populate('activatedBy', 'email')
      .populate('updatedBy', 'email role');

    if (!contract) {
      return res.json({ ok: true, contract: null });
    }

    const role = String(req.sessionUser?.role || '').trim().toLowerCase();
    const resp = toResponseContract(contract);

    // Include Stripe IDs only for dev
    if (role === 'dev') {
      resp.monthlyFee = {
        ...resp.monthlyFee,
        stripeSubscriptionId: contract.monthlyFee?.stripeSubscriptionId,
        stripeCustomerId: contract.monthlyFee?.stripeCustomerId,
        pendingPaymentIntentId: contract.monthlyFee?.pendingPaymentIntentId
      };
      resp.launchFee = {
        ...resp.launchFee,
        stripePaymentIntentId: contract.launchFee?.stripePaymentIntentId
      };
      resp.isDev = process.env.NODE_ENV !== 'production';
    }

    return res.json({ ok: true, contract: resp });
  } catch (error) {
    return respondError(res, error, 'GetActive');
  }
}
