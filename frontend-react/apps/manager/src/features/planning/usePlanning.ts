// M10 — Hook du planning global institut. TanStack Query (lecture du calendrier global) +
// mutations annulation / solde payé. Aucune notion de prestataire (entité institut unique).
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  listCalendarItems,
  cancelBooking,
  markBalancePaid,
  rescheduleBooking,
  type CalendarItem,
  type CalendarItemType,
  type RescheduleBookingPayload,
} from '@bs/api-client';

export type PlanningView = 'day' | 'week';

export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
/** Lundi de la semaine contenant `d`. */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay(); // 0=dim
  const diff = (dow + 6) % 7; // jours depuis lundi
  return addDays(x, -diff);
}

export function planningRange(date: Date, view: PlanningView): { start: Date; end: Date } {
  if (view === 'week') {
    const start = startOfWeek(date);
    return { start, end: addDays(start, 7) };
  }
  const start = startOfDay(date);
  return { start, end: addDays(start, 1) };
}

export function groupItemsByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const it of items) {
    const d = new Date(it.startAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(it);
  }
  return map;
}

export interface UsePlanningResult {
  items: CalendarItem[];
  isLoading: boolean;
  isError: boolean;
  cancel: (bookingId: string, reason?: string) => Promise<unknown>;
  markPaid: (bookingId: string) => Promise<unknown>;
  reschedule: (bookingId: string, payload: RescheduleBookingPayload) => Promise<unknown>;
  refetch: () => void;
}

export function usePlanning(params: {
  date: Date;
  view: PlanningView;
  type?: CalendarItemType | null;
}): UsePlanningResult {
  const qc = useQueryClient();
  const { start, end } = planningRange(params.date, params.view);
  const startIso = start.toISOString();
  const endIso = end.toISOString();
  const type = params.type ?? null;

  const queryKey = ['planning', startIso, endIso, type] as const;
  const query = useQuery({
    queryKey,
    queryFn: () => listCalendarItems({ startDate: startIso, endDate: endIso, type }),
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['planning'] });
  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => cancelBooking(id, reason),
    onSuccess: invalidate,
  });
  const paidMut = useMutation({
    mutationFn: (id: string) => markBalancePaid(id),
    onSuccess: invalidate,
  });
  const rescheduleMut = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: RescheduleBookingPayload }) => rescheduleBooking(id, payload),
    onSuccess: invalidate,
  });

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    cancel: (id, reason) => cancelMut.mutateAsync({ id, reason }),
    markPaid: (id) => paidMut.mutateAsync(id),
    reschedule: (id, payload) => rescheduleMut.mutateAsync({ id, payload }),
    refetch: () => void query.refetch(),
  };
}
