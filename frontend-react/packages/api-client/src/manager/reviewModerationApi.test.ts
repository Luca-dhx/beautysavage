// C3 — api-client modération avis + URLs attestation.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { listReviewsForModeration, moderateReview, managerAttestationUrl } from './learning';
import { attestationDownloadUrl } from '../catalog/learning';

function json(p: unknown) { return new Response(JSON.stringify(p), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
const calls: { url: string; method: string }[] = [];
function installFetch(p: unknown) {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url: String(url), method: init?.method || 'GET' }); return json(p); }));
}
afterEach(() => vi.unstubAllGlobals());

describe('review moderation api-client (C3)', () => {
  it('listReviewsForModeration unwrappe { reviews, counts } + filtre status', async () => {
    installFetch({ ok: true, reviews: [{ id: 'r1', status: 'pending' }], counts: { pending: 1, published: 0, rejected: 0 } });
    const res = await listReviewsForModeration({ status: 'pending' });
    expect(res.reviews.length).toBe(1);
    expect(res.counts.pending).toBe(1);
    expect(calls[0].url).toContain('/api/gestion/learning/reviews');
    expect(calls[0].url).toContain('status=pending');
  });

  it('moderateReview PATCH', async () => {
    installFetch({ ok: true, review: { id: 'r1', status: 'rejected' } });
    await moderateReview('r1', 'rejected');
    expect(calls[0].method).toBe('PATCH');
    expect(calls[0].url).toContain('/reviews/r1');
  });

  it('URLs attestation client + manager', () => {
    expect(attestationDownloadUrl('f1')).toContain('/api/client/learning/formations/f1/attestation');
    expect(managerAttestationUrl('c1', 'f1')).toContain('/api/gestion/learning/customers/c1/formations/f1/attestation');
  });
});
