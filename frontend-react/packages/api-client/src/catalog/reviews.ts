// C1 — Avis publics des formations (vitrine). Lecture seule, anonymisée côté backend.
// Endpoints : GET /api/vitrine/formations/:id/reviews/stats et /reviews?page&sort.
import { apiFetch } from '../apiFetch';

export interface TrainingReviewStats {
  averageRating: number;
  reviewCount: number;
}

export interface TrainingReview {
  rating: number;
  comment: string;
  createdAt: string | null;
}

export interface TrainingReviewsPage {
  reviews: TrainingReview[];
  page: number;
  hasMore: boolean;
  total: number;
}

export type ReviewSort = 'recent' | 'best';

export async function getTrainingReviewStats(
  trainingId: string,
  signal?: AbortSignal,
): Promise<TrainingReviewStats> {
  const res = await apiFetch<{ ok?: boolean; averageRating?: number; reviewCount?: number }>(
    `/api/vitrine/formations/${encodeURIComponent(trainingId)}/reviews/stats`,
    { signal },
  );
  return { averageRating: Number(res.averageRating) || 0, reviewCount: Number(res.reviewCount) || 0 };
}

export async function getTrainingReviews(
  trainingId: string,
  page = 1,
  sort: ReviewSort = 'recent',
  signal?: AbortSignal,
): Promise<TrainingReviewsPage> {
  const res = await apiFetch<{
    ok?: boolean;
    reviews?: TrainingReview[];
    page?: number;
    hasMore?: boolean;
    total?: number;
  }>(`/api/vitrine/formations/${encodeURIComponent(trainingId)}/reviews`, {
    params: { page, sort },
    signal,
  });
  return {
    reviews: res.reviews ?? [],
    page: res.page ?? page,
    hasMore: Boolean(res.hasMore),
    total: res.total ?? (res.reviews?.length ?? 0),
  };
}
