/**
 * commissionPaymentController.js
 * Gestion des paiements de commissions mensuels via Stripe Developer.
 *
 * Endpoints :
 *   GET  /api/commissions/payments               — liste + mois manquants (admin + dev)
 *   POST /api/commissions/payments/:id/create-intent — crée PaymentIntent (admin + dev)
 *   GET  /api/commissions/payments/:id/check-status  — vérifie + met à jour status (admin + dev)
 *   GET  /api/commissions/settings               — délai retard (dev only)
 *   PATCH /api/commissions/settings              — met à jour délai retard (dev only)
 */

import Contract from '../models/Contract.js';
import CommissionPayment from '../models/CommissionPayment.js';
import CommissionSettings from '../models/CommissionSettings.js';
import Sale from '../models/Sale.js';
import RefundRequest from '../models/RefundRequest.js';
import { getStripeDevClient } from '../utils/stripeDevClient.js';
import { emitCommissionEvent } from '../services/businessEventService.js';
import {
  getOrComputeCommissionPayment,
  getMonthsFromContractStart,
  getCommissionSettings
} from '../services/commissionPaymentService.js';
import { executeJob } from '../automatisme/commissionReminderJob.js';
import { getNow } from '../utils/simulatedDate.js';

// Noms de mois en français pour les labels
const MONTH_NAMES_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

function respondError(res, error, context) {
  console.error(`[CommissionPaymentController:${context}]`, error);
  const status = error?.status || 500;
  return res.status(status).json({
    ok: false,
    code: error?.code || 'COMMISSION_ERROR',
    error: error?.message || 'Erreur interne.'
  });
}

// ---------------------------------------------------------------------------
// Génère la facture Stripe Invoice pour un CommissionPayment succeeded
// ---------------------------------------------------------------------------
async function generateCommissionInvoice(commissionPayment) {
  const stripeDevClient = await getStripeDevClient();
  if (!stripeDevClient) return;

  const monthLabel = `${MONTH_NAMES_FR[commissionPayment.month]} ${commissionPayment.year}`;

  // Récupérer le customerId depuis le contrat actif
  const contract = await Contract.findOne({ status: 'active' }).lean();
  let customerId = contract?.monthlyFee?.stripeCustomerId;

  if (!customerId) {
    // Créer un customer de secours
    const customer = await stripeDevClient.customers.create({
      metadata: { context: 'commissions', month: String(commissionPayment.month), year: String(commissionPayment.year) }
    });
    customerId = customer.id;
  }

  // Créer la facture
  const invoice = await stripeDevClient.invoices.create({
    customer: customerId,
    auto_advance: false,
    currency: 'eur',
    description: `Commissions Beauty Savage — ${monthLabel}`,
    metadata: {
      commissionPaymentId: String(commissionPayment._id),
      month: String(commissionPayment.month),
      year: String(commissionPayment.year)
    }
  });

  // Résoudre les IDs custom (SALE-xxx, REF-xxx) depuis les _id MongoDB
  const saleMongoIds = (commissionPayment.sales || []).map(s => s.saleId).filter(Boolean);
  const refundMongoIds = (commissionPayment.refunds || []).map(r => r.refundId).filter(Boolean);

  const [populatedSales, populatedRefunds] = await Promise.all([
    saleMongoIds.length
      ? Sale.find({ _id: { $in: saleMongoIds } }).select({ saleId: 1 }).lean()
      : Promise.resolve([]),
    refundMongoIds.length
      ? RefundRequest.find({ _id: { $in: refundMongoIds } }).select({ refundId: 1 }).lean()
      : Promise.resolve([])
  ]);

  const saleIdMap = {};
  populatedSales.forEach(s => { saleIdMap[s._id.toString()] = s.saleId; });

  const refundIdMap = {};
  populatedRefunds.forEach(r => { refundIdMap[r._id.toString()] = r.refundId; });

  // Line items — ventes
  for (const sale of (commissionPayment.sales || [])) {
    const saleDateStr = sale.saleDate
      ? new Date(sale.saleDate).toLocaleDateString('fr-FR')
      : '—';
    const commissionLabel = sale.commissionType === 'percentage'
      ? `${sale.commissionRate}%`
      : `${sale.commissionRate} € fixe`;
    const customSaleId = saleIdMap[sale.saleId?.toString()] || sale.saleId;
    const desc = `${customSaleId} · ${sale.formationType || 'Formation'} · ${saleDateStr} · Commission ${commissionLabel}`;

    await stripeDevClient.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      description: desc,
      amount: Math.round((sale.commissionAmount || 0) * 100),
      currency: 'eur'
    });
  }

  // Line items — remboursements (négatifs)
  for (const refund of (commissionPayment.refunds || [])) {
    const refundDateStr = refund.refundedAt
      ? new Date(refund.refundedAt).toLocaleDateString('fr-FR')
      : '—';
    const commissionLabel = refund.commissionType === 'percentage'
      ? `${refund.commissionRate}%`
      : `${refund.commissionRate} € fixe`;
    const customRefundId = refundIdMap[refund.refundId?.toString()] || refund.refundId;
    const customSaleId = saleIdMap[refund.saleId?.toString()] || refund.saleId;
    const desc = `${customRefundId} → ${customSaleId} · ${refundDateStr} · Commission ${commissionLabel}`;

    await stripeDevClient.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      description: desc,
      amount: -Math.round((refund.commissionAmount || 0) * 100),
      currency: 'eur'
    });
  }

  // Finaliser et marquer payé hors-bande
  const finalized = await stripeDevClient.invoices.finalizeInvoice(invoice.id);
  await stripeDevClient.invoices.pay(invoice.id, { paid_out_of_band: true });

  // Persister les références
  await CommissionPayment.findByIdAndUpdate(commissionPayment._id, {
    stripeInvoiceId: finalized.id,
    stripeInvoicePdfUrl: finalized.invoice_pdf || null
  });
}

// ---------------------------------------------------------------------------
// GET /api/commissions/payments
// ---------------------------------------------------------------------------
export async function getCommissionPayments(req, res) {
  try {
    // Récupérer le contrat actif pour connaître la date de départ
    const contract = await Contract.findOne({ status: 'active' }).lean();
    if (!contract) {
      return res.status(404).json({ ok: false, error: 'Aucun contrat actif.' });
    }

    const activatedAt = contract.activatedAt;
    if (!activatedAt) {
      return res.status(400).json({ ok: false, error: 'Date d\'activation du contrat introuvable.' });
    }

    const settings = await getCommissionSettings();
    const now = await getNow();
    const months = getMonthsFromContractStart(activatedAt, now);

    // Pour chaque mois, récupérer ou créer le document CommissionPayment
    const payments = await Promise.all(
      months.map(({ month, year }) => getOrComputeCommissionPayment(month, year))
    );

    return res.json({
      ok: true,
      payments,
      settings: { latePaymentDays: settings.latePaymentDays },
      contractActivatedAt: activatedAt
    });
  } catch (error) {
    return respondError(res, error, 'GetPayments');
  }
}

// ---------------------------------------------------------------------------
// POST /api/commissions/payments/:id/create-intent
// ---------------------------------------------------------------------------
export async function createCommissionIntent(req, res) {
  const stripeDevClient = await getStripeDevClient();
  try {
    if (!stripeDevClient) {
      return res.status(500).json({ ok: false, error: 'Client Stripe Developer non configuré.' });
    }

    const payment = await CommissionPayment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ ok: false, error: 'Paiement introuvable.' });
    }

    if (payment.status === 'succeeded') {
      return res.status(409).json({ ok: false, error: 'Ce mois a déjà été réglé.' });
    }

    const amountCents = Math.round((payment.amount || 0) * 100);
    if (amountCents <= 0) {
      return res.status(400).json({ ok: false, error: 'Montant de commission invalide ou nul.' });
    }

    // Idempotence — réutiliser un intent pending si possible
    if (payment.stripePaymentIntentId) {
      try {
        const pi = await stripeDevClient.paymentIntents.retrieve(payment.stripePaymentIntentId);
        switch (pi.status) {
          case 'succeeded':
            // Mettre à jour en base si pas encore reflété
            payment.status = 'succeeded';
            payment.paidAt = new Date();
            await payment.save();
            await emitCommissionEvent('commission.paid', payment);
            await generateCommissionInvoice(payment.toObject());
            return res.json({ ok: true, alreadySucceeded: true });
          case 'canceled':
          case 'requires_payment_method':
            payment.stripePaymentIntentId = null;
            await payment.save();
            break;
          case 'requires_confirmation':
          case 'requires_action':
          case 'processing':
            return res.json({
              ok: true,
              clientSecret: pi.client_secret,
              paymentIntentId: pi.id,
              amountCents
            });
          default:
            payment.stripePaymentIntentId = null;
            await payment.save();
        }
      } catch (_) {
        payment.stripePaymentIntentId = null;
        await payment.save();
      }
    }

    const monthLabel = `${MONTH_NAMES_FR[payment.month]} ${payment.year}`;
    const paymentIntent = await stripeDevClient.paymentIntents.create({
      amount: amountCents,
      currency: 'eur',
      automatic_payment_methods: { enabled: true },
      metadata: {
        commissionPaymentId: String(payment._id),
        month: String(payment.month),
        year: String(payment.year),
        label: `Commissions ${monthLabel}`
      }
    });

    payment.stripePaymentIntentId = paymentIntent.id;
    await payment.save();

    return res.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amountCents
    });
  } catch (error) {
    return respondError(res, error, 'CreateIntent');
  }
}

// ---------------------------------------------------------------------------
// GET /api/commissions/payments/:id/check-status
// ---------------------------------------------------------------------------
export async function checkCommissionStatus(req, res) {
  const stripeDevClient = await getStripeDevClient();
  try {
    if (!stripeDevClient) {
      return res.status(500).json({ ok: false, error: 'Client Stripe Developer non configuré.' });
    }

    const payment = await CommissionPayment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ ok: false, error: 'Paiement introuvable.' });
    }

    if (payment.status === 'succeeded') {
      return res.json({ ok: true, status: 'succeeded', paidAt: payment.paidAt });
    }

    if (!payment.stripePaymentIntentId) {
      return res.json({ ok: true, status: payment.status });
    }

    const pi = await stripeDevClient.paymentIntents.retrieve(payment.stripePaymentIntentId);

    if (pi.status === 'succeeded' && payment.status !== 'succeeded') {
      payment.status = 'succeeded';
      payment.paidAt = new Date();
      await payment.save();
      await emitCommissionEvent('commission.paid', payment);

      // Générer la facture (non-bloquant)
      generateCommissionInvoice(payment.toObject()).catch(err =>
        console.error('[CommissionPayment] Erreur génération facture:', err)
      );

      // Recharger pour avoir les données à jour (incl. invoice url si rapide)
      const updated = await CommissionPayment.findById(payment._id).lean();
      return res.json({ ok: true, status: 'succeeded', paidAt: updated.paidAt });
    }

    if (pi.status === 'canceled' || pi.status === 'requires_payment_method') {
      payment.status = 'failed';
      await payment.save();
      return res.json({ ok: true, status: 'failed' });
    }

    return res.json({ ok: true, status: payment.status, stripeStatus: pi.status });
  } catch (error) {
    return respondError(res, error, 'CheckStatus');
  }
}

// ---------------------------------------------------------------------------
// POST /api/commissions/payments/:id/reset — dev only, non-production
// Remet un paiement succeeded à l'état pending pour tests
// ---------------------------------------------------------------------------
export async function resetCommissionPayment(req, res) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'Interdit en production.' });
    }

    const payment = await CommissionPayment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ ok: false, error: 'Paiement introuvable.' });
    }

    payment.status = 'pending';
    payment.stripePaymentIntentId = null;
    payment.stripeInvoiceId = null;
    payment.stripeInvoicePdfUrl = null;
    payment.paidAt = null;
    await payment.save();

    return res.json({ ok: true, message: 'Paiement remis à pending.' });
  } catch (error) {
    return respondError(res, error, 'ResetPayment');
  }
}

// ---------------------------------------------------------------------------
// GET /api/commissions/settings — dev only
// ---------------------------------------------------------------------------
export async function getCommissionSettingsHandler(req, res) {
  try {
    const settings = await getCommissionSettings();
    return res.json({
      ok: true,
      settings: {
        latePaymentDays: settings.latePaymentDays,
        reminders: (settings.reminders || []).map(r => ({ daysBeforeDue: r.daysBeforeDue })),
        simulatedDate: settings.simulatedDate ? settings.simulatedDate.toISOString().slice(0, 10) : null
      }
    });
  } catch (error) {
    return respondError(res, error, 'GetSettings');
  }
}

// ---------------------------------------------------------------------------
// POST /api/commissions/settings/simulated-date — dev only
// Stocke une date simulée en base. { date: 'YYYY-MM-DD' } ou { date: null } pour réinitialiser.
// Déclenche ensuite le job de rappel pour propager l'effet immédiatement.
// ---------------------------------------------------------------------------
export async function setSimulatedDate(req, res) {
  try {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ ok: false, error: 'Interdit en production.' });
    }

    const rawDate = req.body?.date ?? null;
    let simulatedDate = null;
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) {
        return res.status(400).json({ ok: false, error: 'Date invalide.' });
      }
      simulatedDate = parsed;
    }

    await CommissionSettings.findOneAndUpdate(
      {},
      { $set: { simulatedDate } },
      { upsert: true }
    );

    // Réinitialisation : supprimer les CommissionPayment futurs créés pendant la simulation
    if (!simulatedDate) {
      const realNow = new Date();
      const firstDayOfCurrentMonth = new Date(realNow.getFullYear(), realNow.getMonth(), 1);
      await CommissionPayment.deleteMany({ periodStart: { $gt: firstDayOfCurrentMonth } });
    }

    // Déclencher le job de rappel avec la nouvelle date simulée
    void executeJob();

    return res.json({ ok: true, simulatedDate: simulatedDate ? simulatedDate.toISOString().slice(0, 10) : null });
  } catch (error) {
    return respondError(res, error, 'SetSimulatedDate');
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/commissions/settings — dev only
// Quand latePaymentDays diminue, supprime automatiquement les rappels hors tranche
// ---------------------------------------------------------------------------
export async function updateCommissionSettingsHandler(req, res) {
  try {
    const { latePaymentDays } = req.body || {};
    const days = Number(latePaymentDays);
    if (!Number.isFinite(days) || days < 2) {
      return res.status(400).json({ ok: false, error: 'latePaymentDays invalide (min 2).' });
    }

    let settings = await CommissionSettings.findOne();
    if (!settings) settings = new CommissionSettings();

    settings.latePaymentDays = Math.round(days);
    // Purge les rappels devenus invalides (daysBeforeDue >= nouveau latePaymentDays)
    settings.reminders = (settings.reminders || []).filter(
      r => r.daysBeforeDue >= 1 && r.daysBeforeDue < settings.latePaymentDays
    );
    settings.updatedAt = new Date();
    await settings.save();

    return res.json({
      ok: true,
      settings: {
        latePaymentDays: settings.latePaymentDays,
        reminders: settings.reminders.map(r => ({ daysBeforeDue: r.daysBeforeDue }))
      }
    });
  } catch (error) {
    return respondError(res, error, 'UpdateSettings');
  }
}

// ---------------------------------------------------------------------------
// POST /api/commissions/settings/reminders — dev only
// Ajoute un rappel. daysBeforeDue doit être 1 ≤ d < latePaymentDays
// ---------------------------------------------------------------------------
export async function addReminderHandler(req, res) {
  try {
    const { daysBeforeDue } = req.body || {};
    const days = Number(daysBeforeDue);
    if (!Number.isFinite(days) || days < 1) {
      return res.status(400).json({ ok: false, error: 'daysBeforeDue invalide.' });
    }

    let settings = await CommissionSettings.findOne();
    if (!settings) settings = new CommissionSettings();

    if (days >= settings.latePaymentDays) {
      return res.status(400).json({
        ok: false,
        error: `daysBeforeDue doit être inférieur à latePaymentDays (${settings.latePaymentDays}).`
      });
    }

    const exists = (settings.reminders || []).some(r => r.daysBeforeDue === days);
    if (exists) {
      return res.status(409).json({ ok: false, error: 'Un rappel existe déjà pour ce nombre de jours.' });
    }

    settings.reminders = [...(settings.reminders || []), { daysBeforeDue: days }]
      .sort((a, b) => b.daysBeforeDue - a.daysBeforeDue);
    settings.updatedAt = new Date();
    await settings.save();

    return res.json({
      ok: true,
      reminders: settings.reminders.map(r => ({ daysBeforeDue: r.daysBeforeDue }))
    });
  } catch (error) {
    return respondError(res, error, 'AddReminder');
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/commissions/settings/reminders/:days — dev only
// ---------------------------------------------------------------------------
export async function removeReminderHandler(req, res) {
  try {
    const days = Number(req.params.days);
    if (!Number.isFinite(days)) {
      return res.status(400).json({ ok: false, error: 'Valeur invalide.' });
    }

    let settings = await CommissionSettings.findOne();
    if (!settings) settings = new CommissionSettings();

    const before = (settings.reminders || []).length;
    settings.reminders = (settings.reminders || []).filter(r => r.daysBeforeDue !== days);
    if (settings.reminders.length === before) {
      return res.status(404).json({ ok: false, error: 'Rappel introuvable.' });
    }
    settings.updatedAt = new Date();
    await settings.save();

    return res.json({
      ok: true,
      reminders: settings.reminders.map(r => ({ daysBeforeDue: r.daysBeforeDue }))
    });
  } catch (error) {
    return respondError(res, error, 'RemoveReminder');
  }
}
