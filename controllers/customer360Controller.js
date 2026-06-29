// controllers/customer360Controller.js
// M12 — Customer 360 (Client Hub). Endpoints admin/dev (lecture seule, agrégation). Aucune écriture.
import { buildCustomer360, searchCustomers } from '../services/customer360/customer360Service.js';

// ─── GET /api/gestion/customers?search= ───────────────────────────────────────
export async function listCustomers(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const customers = await searchCustomers({ search: req.query.search, limit: req.query.limit });
    return res.json({ ok: true, customers });
  } catch (error) {
    console.error('[customer360] listCustomers error', error?.message || error);
    return res.status(500).json({ ok: false, error: 'Impossible de rechercher les clients.' });
  }
}

// ─── GET /api/gestion/customers/:customerId/360 ───────────────────────────────
export async function getCustomer360(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    const data = await buildCustomer360(req.params.customerId);
    return res.json({ ok: true, ...data });
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({ ok: false, code: error.code || null, error: error.message });
    }
    console.error('[customer360] getCustomer360 error', error?.message || error);
    return res.status(500).json({ ok: false, error: 'Impossible de charger la fiche client.' });
  }
}

export default { listCustomers, getCustomer360 };
