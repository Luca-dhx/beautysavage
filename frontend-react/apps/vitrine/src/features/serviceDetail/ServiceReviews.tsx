import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PawRating, LoadingState, EmptyState } from '@bs/ui';
import { getServiceReviewStats, getServiceReviews, type ReviewSort } from '@bs/api-client';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

export function ServiceReviews({ serviceId }: { serviceId: string }) {
  const [sort, setSort] = useState<ReviewSort>('recent');

  const stats = useQuery({
    queryKey: ['reviews', 'stats', 'service', serviceId],
    queryFn: ({ signal }) => getServiceReviewStats(serviceId, signal),
    staleTime: 60_000,
  });
  const list = useQuery({
    queryKey: ['reviews', 'list', 'service', serviceId, sort],
    queryFn: ({ signal }) => getServiceReviews(serviceId, 1, sort, signal),
    staleTime: 60_000,
  });

  if (stats.isPending) return <LoadingState label="Chargement des avis…" />;
  const count = stats.data?.reviewCount ?? 0;

  return (
    <section className="bs-reviews" aria-label="Avis clients">
      <div className="bs-reviews__head">
        <h2 className="bs-reviews__title">Avis</h2>
        {count > 0 ? <PawRating value={stats.data?.averageRating ?? 0} count={count} /> : null}
      </div>

      {count === 0 ? (
        <EmptyState label="Aucun avis pour le moment." />
      ) : (
        <>
          <div className="bs-reviews__sort" role="tablist" aria-label="Trier les avis">
            <button
              type="button"
              role="tab"
              aria-selected={sort === 'recent'}
              className={`bs-reviews__tab${sort === 'recent' ? ' bs-reviews__tab--active' : ''}`}
              onClick={() => setSort('recent')}
            >
              Plus récents
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={sort === 'best'}
              className={`bs-reviews__tab${sort === 'best' ? ' bs-reviews__tab--active' : ''}`}
              onClick={() => setSort('best')}
            >
              Mieux notés
            </button>
          </div>
          {list.isPending ? (
            <LoadingState label="Chargement…" />
          ) : (
            <ul className="bs-reviews__list">
              {(list.data?.reviews ?? []).map((review, index) => (
                <li key={index} className="bs-review">
                  <PawRating value={review.rating} compact />
                  <p className="bs-review__comment">{review.comment || '—'}</p>
                  <span className="bs-review__date">{fmtDate(review.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {list.data?.hasMore ? (
            <p className="bs-reviews__more">Affichage des avis les plus pertinents.</p>
          ) : null}
        </>
      )}
    </section>
  );
}
