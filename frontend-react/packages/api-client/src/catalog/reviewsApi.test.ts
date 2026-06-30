// C1 — Avis formation (vitrine) : endpoints + normalisation.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { getTrainingReviewStats, getTrainingReviews } from './reviews';

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
const calls: string[] = [];
function installFetch(payload: unknown) {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(String(url)); return json(payload); }));
}
afterEach(() => vi.unstubAllGlobals());

describe('reviews api-client (C1)', () => {
  it('getTrainingReviewStats cible /reviews/stats et normalise', async () => {
    installFetch({ ok: true, averageRating: 4.5, reviewCount: 12 });
    const res = await getTrainingReviewStats('f1');
    expect(res.averageRating).toBe(4.5);
    expect(res.reviewCount).toBe(12);
    expect(calls[0]).toContain('/api/vitrine/formations/f1/reviews/stats');
  });

  it('getTrainingReviews passe page + sort', async () => {
    installFetch({ ok: true, reviews: [{ rating: 5, comment: 'Top', createdAt: null }], page: 1, hasMore: true, total: 9 });
    const res = await getTrainingReviews('f1', 1, 'best');
    expect(res.reviews.length).toBe(1);
    expect(res.hasMore).toBe(true);
    expect(calls[0]).toContain('/api/vitrine/formations/f1/reviews');
    expect(calls[0]).toContain('sort=best');
  });

  it('getTrainingReviewStats tolère une réponse vide', async () => {
    installFetch({ ok: true });
    const res = await getTrainingReviewStats('f1');
    expect(res.averageRating).toBe(0);
    expect(res.reviewCount).toBe(0);
  });
});
