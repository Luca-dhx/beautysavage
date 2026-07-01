// RX4 — Réservations de prestations (client). Lecture seule en S1 (annulation/report = S2).
import { API_BASE_URL } from '@bs/config';
import { apiGet } from '../apiFetch';
import type { ClientBooking } from './types';

const BASE = '/api/client';

/** GET /api/client/bookings → liste des réservations, triées par date décroissante (backend). */
export async function listMyBookings(signal?: AbortSignal): Promise<ClientBooking[]> {
  const res = await apiGet<{ ok: boolean; bookings: ClientBooking[] }>(`${BASE}/bookings`, undefined);
  void signal;
  return res.bookings ?? [];
}

/** URL de téléchargement de la facture d'une réservation (authentifiée par cookie same-origin). */
export function bookingInvoiceUrl(bookingId: string): string {
  return `${API_BASE_URL || ''}${BASE}/bookings/${encodeURIComponent(bookingId)}/invoice`;
}
