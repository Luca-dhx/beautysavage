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

// ── RX2.2 — Financial Timeline ───────────────────────────────────────────────────
export type FinanceMovementType =
  | 'sale' | 'deposit' | 'balance_due' | 'balance_paid'
  | 'refund' | 'gift_card_issue' | 'gift_card_usage' | 'gift_card_manual_debit'
  | 'invoice' | 'commission';

export type FinanceMovementDirection = 'in' | 'out' | 'neutral';
export type FinanceMovementStatus = 'paid' | 'pending' | 'refunded' | 'balance_due' | 'failed' | 'cancelled';

export type FinanceTimelinePeriod = 'today' | 'week' | 'month' | 'all';
export type FinanceTimelineTypeFilter =
  | 'all' | 'sale' | 'deposit' | 'balance' | 'gift_card' | 'refund' | 'commission' | 'invoice';

export interface FinanceMovementBadge { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger'; }
export interface FinanceMovementAction {
  kind: 'customer_view' | 'invoice_view' | 'sale_view' | 'refund_process' | 'balance_collect' | 'commission_view';
  enabled: boolean;
  to?: string | null;
  url?: string | null;
}
export interface FinanceMovementCustomer { id: string; name: string; }
export interface FinanceMovementSource { model: string; id: string; }

export interface FinanceTimelineItem {
  id: string;
  type: FinanceMovementType;
  direction: FinanceMovementDirection;
  amount: number;
  currency: string;
  title: string;
  subtitle: string;
  status: FinanceMovementStatus;
  occurredAt: string | null;
  customer: FinanceMovementCustomer | null;
  source: FinanceMovementSource;
  badges: FinanceMovementBadge[];
  actions: FinanceMovementAction[];
}

export interface FinanceTimelineSummary {
  netAmount: number;
  grossIn: number;
  grossOut: number;
  count: number;
  refundCount: number;
  balanceDueAmount: number;
}

export interface FinanceTimelineFilters {
  period?: FinanceTimelinePeriod;
  type?: FinanceTimelineTypeFilter;
  status?: FinanceMovementStatus | '';
  limit?: number;
}

export interface FinanceTimeline {
  period: FinanceTimelinePeriod;
  type: FinanceTimelineTypeFilter;
  status: FinanceMovementStatus | null;
  summary: FinanceTimelineSummary;
  items: FinanceTimelineItem[];
}

/** GET /api/gestion/finance/timeline — mouvements financiers narratifs + résumé filtrable. */
export async function getFinanceTimeline(filters: FinanceTimelineFilters = {}): Promise<FinanceTimeline> {
  const params: Record<string, string | number> = {
    period: filters.period ?? 'all',
    type: filters.type ?? 'all',
  };
  if (filters.status) params.status = filters.status;
  if (filters.limit) params.limit = filters.limit;
  const res = await apiGet<{ ok: boolean } & FinanceTimeline>('/api/gestion/finance/timeline', params);
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
