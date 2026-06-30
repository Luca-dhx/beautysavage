// C3 — Modération des avis (manager) : hooks données (TanStack).
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listReviewsForModeration, moderateReview, type ReviewStatus } from '@bs/api-client';

export function useReviews(status?: ReviewStatus) {
  return useQuery({
    queryKey: ['reviews', 'moderation', status ?? 'all'],
    queryFn: () => listReviewsForModeration(status ? { status } : undefined),
    staleTime: 15_000,
  });
}

export function useModerateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ReviewStatus }) => moderateReview(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reviews', 'moderation'] }),
  });
}
