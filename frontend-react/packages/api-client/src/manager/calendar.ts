// M10 — Client API du calendrier GLOBAL de l'institut (manager). Une seule entité = l'institut :
// aucun notion de prestataire. Le backend reste l'autorité (admin/dev, jamais client).
import { apiGet, apiPost } from '../apiFetch';

export type CalendarItemType = 'service_booking' | 'formation_session' | 'blocked_slot';
export type CalendarItemStatus =
  | 'confirmed' | 'completed' | 'no_show' | 'cancelled' | 'pending_payment'
  | 'active' | 'canceled' | 'canceled_by_institute' | 'blocked' | string;

export interface CalendarItemActionLinks {
  detail: boolean;
  cancel: boolean;
  markBalancePaid: boolean;
  reschedule: boolean;
}

export interface CalendarItem {
  id: string;
  type: CalendarItemType;
  title: string;
  startAt: string;
  endAt: string;
  status: CalendarItemStatus;
  client: { name: string | null } | null;
  participant: { reservedCount: number; maxClients: number; placesLeft: number } | null;
  paymentStatus: string | null;
  paymentType: string | null;
  refundStatus: string | null;
  totalAmount: number | null;
  depositAmount: number | null;
  amountPaidOnline: number | null;
  balanceDueAmount: number | null;
  balanceSettlementMode: string | null;
  actionLinks: CalendarItemActionLinks;
  sourceModel: string;
  sourceId: string;
}

export interface CalendarFilters {
  startDate: string; // ISO
  endDate: string; // ISO
  type?: CalendarItemType | null;
  status?: string | null;
}

const BASE = '/api/gestion/calendar';
const BOOKINGS = '/api/gestion/bookings';

// Le report/décalage admin n'a pas d'endpoint backend (cf. rapport 197) : UI préparée seulement.
export const RESCHEDULE_SUPPORTED = false;

export async function listCalendarItems(filters: CalendarFilters): Promise<CalendarItem[]> {
  const res = await apiGet<{ ok: boolean; items: CalendarItem[] }>(`${BASE}/items`, {
    startDate: filters.startDate,
    endDate: filters.endDate,
    type: filters.type ?? undefined,
    status: filters.status ?? undefined,
  });
  return res.items ?? [];
}

export interface BookingDetailResponse {
  ok: boolean;
  booking: Record<string, unknown> | null;
  refundEligibility?: { eligibleRefund?: boolean; reason?: string; waiverSigned?: boolean } | null;
}

export async function getBookingDetail(bookingId: string): Promise<BookingDetailResponse> {
  return apiGet<BookingDetailResponse>(`${BOOKINGS}/${encodeURIComponent(bookingId)}/detail`);
}

/** Annulation admin — déclenche le flow de remboursement tokenisé côté backend. */
export async function cancelBooking(bookingId: string, reason?: string): Promise<{ ok: boolean; flowCreated?: boolean }> {
  return apiPost(`${BOOKINGS}/${encodeURIComponent(bookingId)}/cancel`, reason ? { reason } : {});
}

/** Marque le solde d'acompte réglé sur place (paymentType deposit + pay_on_site uniquement). */
export async function markBalancePaid(bookingId: string): Promise<{ ok: boolean; balanceDueAmount?: number }> {
  return apiPost(`${BOOKINGS}/${encodeURIComponent(bookingId)}/balance-paid`, {});
}

/**
 * Report/décalage d'un créneau. AUCUN endpoint admin direct (cf. rapport 197) — le décalage
 * passe aujourd'hui par le flow client. Exposé pour l'UI (désactivée) ; lève si appelé.
 */
export async function rescheduleBooking(): Promise<never> {
  throw Object.assign(new Error('Report non disponible : aucun endpoint admin (cf. M10).'), {
    code: 'RESCHEDULE_NOT_SUPPORTED',
  });
}
