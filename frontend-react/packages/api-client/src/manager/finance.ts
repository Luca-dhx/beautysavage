// RX2 — Espace Finance (manager, admin/dev). Le backend agrège et fait autorité ;
// aucun calcul métier côté client.
import { apiGet, apiPost } from '../apiFetch';

export type FinanceRange = 'today' | '7d' | '30d';

export interface FinanceBreakdown {
  prestations: number;
  formations: number;
  giftCards: number;
  products: number;
}

export interface FinanceActionMetric {
  count: number;
  total: number;
}

export interface FinanceDashboard {
  range: FinanceRange;
  rangeLabel: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  today: {
    salesCount: number;
    revenue: number;
    breakdown: FinanceBreakdown;
    giftCardConsumption: number;
  };
  actions: {
    balancesToCollect: FinanceActionMetric;
    refundsToProcess: FinanceActionMetric;
    unpaidInvoices: FinanceActionMetric;
  };
}

/** GET /api/gestion/finance/dashboard — instantané financier (today/actions). */
export async function getFinanceDashboard(range: FinanceRange = 'today'): Promise<FinanceDashboard> {
  const res = await apiGet<{ ok: boolean } & FinanceDashboard>('/api/gestion/finance/dashboard', { range });
  return res;
}

export type RefundDecisionStatus = 'succeeded' | 'failed' | 'canceled' | 'pending' | 'requested';

export interface RefundDecisionResult {
  ok: boolean;
  stripeInitiated?: boolean;
  refund?: Record<string, unknown>;
}

/**
 * POST /api/gestion/refunds/:refundId/status — décision admin sur un remboursement (B1).
 * Le backend orchestre l'exécution (Stripe + recredit carte cadeau) et l'audit EventLog.
 */
export async function updateRefundStatus(
  refundId: string,
  status: RefundDecisionStatus,
  reason?: string,
): Promise<RefundDecisionResult> {
  return apiPost<RefundDecisionResult>(
    `/api/gestion/refunds/${encodeURIComponent(refundId)}/status`,
    { status, ...(reason ? { reason } : {}) },
  );
}
