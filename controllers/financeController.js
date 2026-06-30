// RX2.1/RX2.2 — Espace Finance (React, admin/dev). Le backend agrège et fait autorité.
import { buildFinanceDashboard } from '../services/financeService.js';
import { buildFinanceTimeline, resolveTimelineWindow } from '../services/finance/financeTimelineService.js';

const VALID_RANGES = new Set(['today', '7d', '30d']);
const VALID_PERIODS = new Set(['today', 'week', 'month', 'all']);
const VALID_TYPES = new Set(['all', 'sale', 'deposit', 'balance', 'gift_card', 'refund', 'commission', 'invoice']);
const VALID_STATUSES = new Set(['paid', 'pending', 'refunded', 'balance_due', 'failed', 'cancelled']);

export async function getFinanceDashboard(req, res) {
  try {
    const requested = String(req.query.range || 'today').toLowerCase();
    const range = VALID_RANGES.has(requested) ? requested : 'today';
    const referenceDate = req.query.referenceDate ? new Date(req.query.referenceDate) : null;
    const snapshot = await buildFinanceDashboard({
      range,
      referenceDate: referenceDate && !Number.isNaN(referenceDate.getTime()) ? referenceDate : null,
    });
    return res.json({ ok: true, ...snapshot });
  } catch (error) {
    console.error('Erreur Finance Dashboard', error);
    return res.status(500).json({ ok: false, error: 'Impossible de charger le tableau de bord financier.' });
  }
}

// RX2.2 — Financial Timeline : mouvements financiers narratifs + résumé filtrable.
export async function getFinanceTimeline(req, res) {
  try {
    const periodRaw = String(req.query.period || 'all').toLowerCase();
    const period = VALID_PERIODS.has(periodRaw) ? periodRaw : 'all';
    const typeRaw = String(req.query.type || 'all').toLowerCase();
    const type = VALID_TYPES.has(typeRaw) ? typeRaw : 'all';
    const statusRaw = String(req.query.status || '').toLowerCase();
    const status = VALID_STATUSES.has(statusRaw) ? statusRaw : '';
    const limit = Number(req.query.limit) || 50;

    const { dateFrom, dateTo } = resolveTimelineWindow(period);
    const { summary, items } = await buildFinanceTimeline({ dateFrom, dateTo, type, status, limit });
    return res.json({ ok: true, period, type, status: status || null, summary, items });
  } catch (error) {
    console.error('Erreur Finance Timeline', error);
    return res.status(500).json({ ok: false, error: 'Impossible de charger la timeline financière.' });
  }
}
