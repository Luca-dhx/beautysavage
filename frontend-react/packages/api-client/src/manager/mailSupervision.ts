// M3E — Client API supervision mail (Manager). Lecture seule, aucun écran ici.
// Cible les endpoints ADMIN (/api/gestion/...) : le backend impose roleView=admin
// (institut/client uniquement). Aucun e-mail/secret n'est exposé par le backend.
import { apiGet } from '../apiFetch';

export interface MailSupervisionFilters {
  status?: string;
  eventName?: string;
  templateKey?: string;
  fromRole?: string;
  toRole?: string;
  contextType?: string;
  contextId?: string;
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
}

export interface MailDeliverySummary {
  id: string;
  eventName: string | null;
  templateKey: string | null;
  mode: string | null;
  status: string | null;
  fromRole: string | null;
  toRole: string | null;
  contextType: string | null;
  contextId: string | null;
  targetAudience: 'admin' | 'dev';
  attempts: number;
  lastErrorCode: string | null;
  lastErrorMessageSafe: string;
  createdAt: string | null;
  updatedAt: string | null;
  sendLogId: string | null;
  provider: string | null;
  providerMessageId: string | null;
  recipientHash: string | null;
  senderRole: string | null;
  recipientRole: string | null;
}

export interface SendLogSummary {
  id: string;
  channel: string;
  provider: string | null;
  templateKey: string | null;
  status: string | null;
  providerMessageId: string;
  recipientHash: string;
  subject: string;
  contextType: string | null;
  contextId: string | null;
  senderRole: string | null;
  recipientRole: string | null;
  tags: string[];
  queuedAt: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  openedAt: string | null;
  bouncedAt: string | null;
  errorCode: string;
  lastErrorMessageSafe: string;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface MailDeliveryStats {
  roleView: 'admin' | 'dev';
  total: number;
  byStatus: Record<string, number>;
  byTemplate: Record<string, number>;
  byEvent: Record<string, number>;
  last24h: number;
  failuresLast24h: number;
  shadowCount: number;
  activeCount: number;
}

export interface SendLogStats {
  roleView: 'admin' | 'dev';
  total: number;
  byStatus: Record<string, number>;
  byTemplate: Record<string, number>;
  last24h: number;
  failuresLast24h: number;
}

interface ListResponse<T> {
  ok: boolean;
  roleView: string;
  count: number;
  limit: number;
  items: T[];
}

function toParams(f: MailSupervisionFilters = {}): Record<string, string | number> {
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined && v !== null && v !== '') p[k] = v as string | number;
  }
  return p;
}

const BASE = '/api/gestion';

export async function listMailDeliveries(filters: MailSupervisionFilters = {}): Promise<MailDeliverySummary[]> {
  const res = await apiGet<ListResponse<MailDeliverySummary>>(`${BASE}/mail-deliveries`, toParams(filters));
  return res.items ?? [];
}

export async function getMailDeliveryDetail(id: string): Promise<MailDeliverySummary | null> {
  const res = await apiGet<{ ok: boolean; delivery: MailDeliverySummary }>(`${BASE}/mail-deliveries/${encodeURIComponent(id)}`);
  return res.delivery ?? null;
}

export async function getMailDeliveryStats(
  range: { dateFrom?: string; dateTo?: string } = {},
): Promise<MailDeliveryStats> {
  const res = await apiGet<{ ok: boolean; stats: MailDeliveryStats }>(`${BASE}/mail-deliveries/stats`, toParams(range));
  return res.stats;
}

export async function listSendLogs(filters: MailSupervisionFilters = {}): Promise<SendLogSummary[]> {
  const res = await apiGet<ListResponse<SendLogSummary>>(`${BASE}/send-logs`, toParams(filters));
  return res.items ?? [];
}

export async function getSendLogStats(
  range: { dateFrom?: string; dateTo?: string } = {},
): Promise<SendLogStats> {
  const res = await apiGet<{ ok: boolean; stats: SendLogStats }>(`${BASE}/send-logs/stats`, toParams(range));
  return res.stats;
}
