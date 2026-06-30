// C3 — Modération des avis (manager). Cards (zéro table), filtres par statut, actions
// publier/rejeter/en attente. Mobile-first, tokens --bs-* only.
import { useState } from 'react';
import { Badge } from '@bs/ui';
import type { ModerationReview, ReviewStatus } from '@bs/api-client';
import { useReviews, useModerateReview } from './useReviewModeration';
import './reviews.css';

const FILTERS: { key: ReviewStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'pending', label: 'En attente' },
  { key: 'published', label: 'Publiés' },
  { key: 'rejected', label: 'Rejetés' },
];

function StatusBadge({ status }: { status: ReviewStatus }) {
  if (status === 'published') return <Badge tone="success">Publié</Badge>;
  if (status === 'rejected') return <Badge tone="danger">Rejeté</Badge>;
  return <Badge tone="warning">En attente</Badge>;
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="rvm-stars" aria-label={`${rating} sur 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={`bi ${i <= rating ? 'bi-star-fill' : 'bi-star'}`} aria-hidden="true" />
      ))}
    </span>
  );
}

function ReviewCard({ review, onModerate, busy }: { review: ModerationReview; onModerate: (s: ReviewStatus) => void; busy: boolean }) {
  return (
    <article className="rvm-card" data-testid="rvm-card">
      <div className="rvm-card__head">
        <span className="rvm-card__author">{review.authorName}</span>
        <StatusBadge status={review.status} />
      </div>
      <span className="rvm-card__formation">{review.formationName}</span>
      <Stars rating={review.rating} />
      {review.comment ? <p className="rvm-card__comment">{review.comment}</p> : <p className="rvm-card__comment rvm-card__comment--empty">(sans commentaire)</p>}
      <div className="rvm-card__actions">
        <button type="button" className="cat-btn cat-btn--ghost" disabled={busy || review.status === 'published'} onClick={() => onModerate('published')}>
          <i className="bi bi-check-lg" aria-hidden="true" /> Publier
        </button>
        <button type="button" className="cat-btn cat-btn--ghost" disabled={busy || review.status === 'rejected'} onClick={() => onModerate('rejected')}>
          <i className="bi bi-eye-slash" aria-hidden="true" /> Masquer
        </button>
        <button type="button" className="cat-btn cat-btn--ghost" disabled={busy || review.status === 'pending'} onClick={() => onModerate('pending')}>
          <i className="bi bi-hourglass-split" aria-hidden="true" /> En attente
        </button>
      </div>
    </article>
  );
}

export function ReviewModerationPage() {
  const [filter, setFilter] = useState<ReviewStatus | 'all'>('all');
  const query = useReviews(filter === 'all' ? undefined : filter);
  const moderate = useModerateReview();

  return (
    <section className="cat-page">
      <div className="cat-head">
        <h1 className="cat-head__title">Modération des avis</h1>
        <p className="cat-head__subtitle">La vitrine n'affiche que les avis publiés.</p>
      </div>

      <div className="rvm-filters" role="tablist" aria-label="Filtrer les avis">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key}
            className={`lrn-filter${filter === f.key ? ' lrn-filter--active' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
            {f.key !== 'all' && query.data ? <span className="rvm-count"> {query.data.counts[f.key]}</span> : null}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <p className="cat-note">Chargement…</p>
      ) : query.data && query.data.reviews.length > 0 ? (
        <div className="rvm-list">
          {query.data.reviews.map((r) => (
            <ReviewCard key={r.id} review={r} busy={moderate.isPending} onModerate={(s) => moderate.mutate({ id: r.id, status: s })} />
          ))}
        </div>
      ) : (
        <div className="cat-empty">
          <i className="bi bi-chat-square-text cat-empty__icon" aria-hidden="true" />
          <p className="cat-empty__title">Aucun avis</p>
        </div>
      )}
    </section>
  );
}
