/**
 * commissionPaymentService.js
 * Calcule les commissions dues pour une période et gère les documents CommissionPayment.
 *
 * Logique de calcul :
 *  - Ventes de la période : Sale.commissionAmount > 0 et createdAt dans [periodStart, periodEnd)
 *  - Remboursements : RefundRequest.stripeRefundStatus === 'succeeded' et
 *    stripeRefundConfirmedAt dans [periodStart, periodEnd)
 *    → commission déduite proportionnellement au montant remboursé / totalAmount de la vente
 */

import mongoose from 'mongoose';

import Sale from '../models/Sale.js';
import RefundRequest from '../models/RefundRequest.js';
import CommissionPayment from '../models/CommissionPayment.js';
import CommissionSettings from '../models/CommissionSettings.js';

function roundToCents(v) {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// getCommissionSettings — récupère (ou crée) le singleton settings
// ---------------------------------------------------------------------------
export async function getCommissionSettings() {
  let settings = await CommissionSettings.findOne().lean();
  if (!settings) {
    const doc = await CommissionSettings.create({ latePaymentDays: 15 });
    settings = doc.toObject();
  }
  return settings;
}

// ---------------------------------------------------------------------------
// computeCommissionsForPeriod
// ---------------------------------------------------------------------------
export async function computeCommissionsForPeriod(periodStart, periodEnd) {
  // 1. Ventes avec commission dans la période
  const sales = await Sale.find({
    createdAt: { $gte: periodStart, $lt: periodEnd },
    commissionAmount: { $gt: 0 }
  }).lean();

  const saleEntries = sales.map(s => {
    // Déduire le formationType depuis items
    const formationItem = (s.items || []).find(i => i.type === 'formation');
    const formationType = formationItem?.name || '';

    return {
      saleId: s._id,
      formationType,
      saleDate: s.createdAt || s.date_achat || null,
      commissionType: s.commissionRate != null ? 'percentage' : 'fixed',
      commissionRate: s.commissionRate ?? null,
      commissionAmount: roundToCents(s.commissionAmount || 0)
    };
  });

  // 2. Remboursements confirmés dans la période — on les lie aux ventes correspondantes
  const refundRequests = await RefundRequest.find({
    stripeRefundStatus: 'succeeded',
    stripeRefundConfirmedAt: { $gte: periodStart, $lt: periodEnd }
  }).lean();

  // Construire un map saleId (string) → sale pour les calculs proportionnels
  const saleMap = {};
  for (const s of sales) {
    saleMap[s.saleId] = s;
  }

  // Pour les remboursements sur des ventes hors période, charger les sales manquantes
  const missingSaleIds = [];
  for (const r of refundRequests) {
    if (!saleMap[r.saleId]) missingSaleIds.push(r.saleId);
  }
  if (missingSaleIds.length > 0) {
    const extra = await Sale.find({ saleId: { $in: missingSaleIds } }).lean();
    for (const s of extra) saleMap[s.saleId] = s;
  }

  const refundEntries = [];
  for (const r of refundRequests) {
    const sale = saleMap[r.saleId];
    if (!sale || !sale.commissionAmount || sale.commissionAmount <= 0) continue;

    // Déduction proportionnelle : refundAmount / totalAmount * commissionAmount
    const ratio = sale.totalAmount > 0
      ? Math.min(1, (r.amount || 0) / sale.totalAmount)
      : 0;
    const deducted = roundToCents(ratio * sale.commissionAmount);
    if (deducted <= 0) continue;

    refundEntries.push({
      refundId: r._id,
      saleId: sale._id,
      refundedAt: r.stripeRefundConfirmedAt || r.refundedAt || r.processedAt || null,
      commissionType: sale.commissionRate != null ? 'percentage' : 'fixed',
      commissionRate: sale.commissionRate ?? null,
      commissionAmount: deducted
    });
  }

  // 3. Totaux
  const totalSales = saleEntries.reduce((sum, e) => sum + e.commissionAmount, 0);
  const totalRefunds = refundEntries.reduce((sum, e) => sum + e.commissionAmount, 0);
  const total = roundToCents(Math.max(0, totalSales - totalRefunds));

  return { saleEntries, refundEntries, total };
}

// ---------------------------------------------------------------------------
// getOrComputeCommissionPayment
// Retourne le CommissionPayment existant pour mois/année ou en crée un (pending).
// ---------------------------------------------------------------------------
export async function getOrComputeCommissionPayment(month, year) {
  // Chercher un document existant
  const existing = await CommissionPayment.findOne({ month, year });

  if (existing) {
    // Corriger les docs créés avant le correctif "montant nul"
    if (existing.amount === 0 && existing.status !== 'succeeded') {
      existing.status = 'succeeded';
      existing.paidAt = existing.periodStart;
      existing.availableMailSentAt = existing.availableMailSentAt || new Date();
      await existing.save();
    }
    return existing;
  }

  // Calculer la période
  const periodStart = new Date(year, month, 1);
  const periodEnd = new Date(year, month + 1, 1);

  const { saleEntries, refundEntries, total } = await computeCommissionsForPeriod(
    periodStart,
    periodEnd
  );

  // Créer le document (upsert pour éviter les race conditions)
  // Si le total est 0 : aucune commission à encaisser, on marque directement succeeded
  const status = total === 0 ? 'succeeded' : 'pending';
  const paidAt = total === 0 ? periodStart : null;
  const availableMailSentAt = total === 0 ? new Date() : null;

  try {
    const doc = await CommissionPayment.create({
      month,
      year,
      periodStart,
      periodEnd,
      amount: total,
      status,
      paidAt,
      availableMailSentAt,
      sales: saleEntries,
      refunds: refundEntries
    });
    return doc.toObject();
  } catch (err) {
    // Duplicate key — un autre process l'a déjà créé
    if (err.code === 11000) {
      return CommissionPayment.findOne({ month, year }).lean();
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// refreshCommissionPayment
// Recalcule et met à jour un CommissionPayment pending (non payé).
// ---------------------------------------------------------------------------
export async function refreshCommissionPayment(paymentId) {
  const payment = await CommissionPayment.findById(paymentId);
  if (!payment || payment.status === 'succeeded') return payment;

  const { saleEntries, refundEntries, total } = await computeCommissionsForPeriod(
    payment.periodStart,
    payment.periodEnd
  );

  payment.sales = saleEntries;
  payment.refunds = refundEntries;
  payment.amount = total;
  await payment.save();
  return payment.toObject();
}

// ---------------------------------------------------------------------------
// getMonthsFromContractStart
// Retourne la liste de { month, year } depuis activatedAt jusqu'au mois courant (inclus).
// Accepte un paramètre `now` optionnel pour la simulation de date.
// ---------------------------------------------------------------------------
export function getMonthsFromContractStart(activatedAt, now = new Date()) {
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const months = [];

  let cursor = new Date(new Date(activatedAt).getFullYear(), new Date(activatedAt).getMonth(), 1);

  while (cursor <= currentMonth) {
    months.push({ month: cursor.getMonth(), year: cursor.getFullYear() });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}
