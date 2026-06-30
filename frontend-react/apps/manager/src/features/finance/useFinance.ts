// RX2 — Hooks Finance (TanStack Query). Lecture seule ; le backend agrège et fait autorité.
import { useQuery } from '@tanstack/react-query';
import {
  getFinanceDashboard, getFinanceTimeline,
  type FinanceDashboard, type FinanceRange,
  type FinanceTimeline, type FinanceTimelineFilters,
} from '@bs/api-client';

export function useFinanceDashboard(range: FinanceRange) {
  return useQuery<FinanceDashboard>({
    queryKey: ['finance', 'dashboard', range],
    queryFn: () => getFinanceDashboard(range),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

// RX2.2 — Financial Timeline.
export function useFinanceTimeline(filters: FinanceTimelineFilters) {
  return useQuery<FinanceTimeline>({
    queryKey: ['finance', 'timeline', filters.period ?? 'all', filters.type ?? 'all', filters.status ?? '', filters.limit ?? 50],
    queryFn: () => getFinanceTimeline(filters),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
