// RX2 — Hook Finance Dashboard (TanStack Query). Lecture seule ; le backend agrège et fait autorité.
import { useQuery } from '@tanstack/react-query';
import { getFinanceDashboard, type FinanceDashboard, type FinanceRange } from '@bs/api-client';

export function useFinanceDashboard(range: FinanceRange) {
  return useQuery<FinanceDashboard>({
    queryKey: ['finance', 'dashboard', range],
    queryFn: () => getFinanceDashboard(range),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
