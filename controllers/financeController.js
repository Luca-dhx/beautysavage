// RX2.1 — Finance Dashboard (espace finance React, admin/dev). Le backend agrège et fait autorité.
import { buildFinanceDashboard } from '../services/financeService.js';

const VALID_RANGES = new Set(['today', '7d', '30d']);

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
