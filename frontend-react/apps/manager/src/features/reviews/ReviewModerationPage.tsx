import { useEffect, useMemo, useState } from 'react';
import { Badge, ErrorState, PawInput, PawRating, TextArea } from '@bs/ui';
import type { ManualReviewInput, ModerationReview, ReviewStatus, ReviewTargetType } from '@bs/api-client';
import {
  useCreateManualReview,
  useModerateReview,
  useReviewCatalog,
  useReviews,
} from './useReviewModeration';
import { CatalogueSkeleton } from '../catalogue/components';
import './reviews.css';

const STATUS_FILTERS: { key: ReviewStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'Tous' },
  { key: 'pending', label: 'En attente' },
  { key: 'published', label: 'Publiés' },
  { key: 'rejected', label: 'Refusés' },
];

const TYPE_FILTERS: { key: ReviewTargetType | 'all'; label: string }[] = [
  { key: 'all', label: 'Tous les types' },
  { key: 'service', label: 'Prestations' },
  { key: 'formation', label: 'Formations' },
];

function StatusBadge({ status }: { status: ReviewStatus }) {
  if (status === 'published') return <Badge tone="success">Publié</Badge>;
  if (status === 'rejected') return <Badge tone="danger">Refusé</Badge>;
  return <Badge tone="warning">En attente</Badge>;
}

function TypeBadge({ type }: { type: ReviewTargetType }) {
  return <Badge tone="neutral">{type === 'service' ? 'Prestation' : 'Formation'}</Badge>;
}

function ReviewCard({
  review,
  onModerate,
  busy,
}: {
  review: ModerationReview;
  onModerate: (status: ReviewStatus) => void;
  busy: boolean;
}) {
  return (
    <article className="rvm-card" data-testid="rvm-card">
      <div className="rvm-card__head">
        <div className="rvm-card__identity">
          <span className="rvm-card__author">{review.authorName}</span>
          <span className="rvm-card__meta">
            <TypeBadge type={review.targetType} />
            {review.isManual ? <Badge tone="accent">Manuel</Badge> : null}
            <StatusBadge status={review.status} />
          </span>
        </div>
        <PawRating value={review.rating} compact />
      </div>
      <span className="rvm-card__target">{review.targetName}</span>
      <span className="rvm-card__source">{review.sourceLabel}</span>
      {review.comment ? (
        <p className="rvm-card__comment">{review.comment}</p>
      ) : (
        <p className="rvm-card__comment rvm-card__comment--empty">(sans commentaire)</p>
      )}
      <div className="rvm-card__actions">
        <button
          type="button"
          className="cat-btn cat-btn--ghost"
          disabled={busy || review.status === 'published'}
          onClick={() => onModerate('published')}
        >
          <i className="bi bi-check-lg" aria-hidden="true" /> Publier
        </button>
        <button
          type="button"
          className="cat-btn cat-btn--ghost"
          disabled={busy || review.status === 'rejected'}
          onClick={() => onModerate('rejected')}
        >
          <i className="bi bi-eye-slash" aria-hidden="true" /> Refuser
        </button>
        <button
          type="button"
          className="cat-btn cat-btn--ghost"
          disabled={busy || review.status === 'pending'}
          onClick={() => onModerate('pending')}
        >
          <i className="bi bi-hourglass-split" aria-hidden="true" /> Remettre en attente
        </button>
      </div>
    </article>
  );
}

const INITIAL_MANUAL_REVIEW: ManualReviewInput = {
  targetType: 'service',
  targetId: '',
  displayName: '',
  rating: 0,
  comment: '',
  status: 'published',
};

export function ReviewModerationPage() {
  const [statusFilter, setStatusFilter] = useState<ReviewStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<ReviewTargetType | 'all'>('all');
  const [manual, setManual] = useState<ManualReviewInput>(INITIAL_MANUAL_REVIEW);

  const query = useReviews({
    status: statusFilter === 'all' ? undefined : statusFilter,
    type: typeFilter === 'all' ? undefined : typeFilter,
  });
  const catalog = useReviewCatalog();
  const moderate = useModerateReview();
  const createManual = useCreateManualReview();

  const currentOptions = useMemo(
    () => (manual.targetType === 'service' ? catalog.data?.services ?? [] : catalog.data?.formations ?? []),
    [catalog.data, manual.targetType],
  );

  useEffect(() => {
    if (!currentOptions.length) {
      if (manual.targetId) {
        setManual((prev) => ({ ...prev, targetId: '' }));
      }
      return;
    }
    const exists = currentOptions.some((entry) => entry.id === manual.targetId);
    if (!exists) {
      setManual((prev) => ({ ...prev, targetId: currentOptions[0]?.id ?? '' }));
    }
  }, [currentOptions, manual.targetId]);

  function updateManual<K extends keyof ManualReviewInput>(key: K, value: ManualReviewInput[K]) {
    setManual((prev) => ({ ...prev, [key]: value }));
  }

  function submitManualReview() {
    createManual.mutate(manual, {
      onSuccess: () => {
        setManual((prev) => ({
          ...INITIAL_MANUAL_REVIEW,
          targetType: prev.targetType,
          targetId: '',
        }));
      },
    });
  }

  return (
    <section className="cat-page">
      <div className="cat-head">
        <h1 className="cat-head__title">Modération des avis</h1>
        <p className="cat-head__subtitle">
          Tous les avis formation et prestation, avec création manuelle côté institut.
        </p>
      </div>

      <section className="rvm-panel" data-testid="rvm-manual-form">
        <div className="rvm-panel__head">
          <div>
            <h2 className="rvm-panel__title">Ajouter un avis manuel</h2>
            <p className="rvm-panel__subtitle">Aucun faux client: le nom affiché est saisi par l’institut.</p>
          </div>
          {createManual.isSuccess ? <Badge tone="success">Avis ajouté</Badge> : null}
        </div>

        <div className="rvm-grid">
          <label className="rvm-field">
            <span>Type</span>
            <select
              value={manual.targetType}
              onChange={(event) => updateManual('targetType', event.target.value as ReviewTargetType)}
            >
              <option value="service">Prestation</option>
              <option value="formation">Formation</option>
            </select>
          </label>
          <label className="rvm-field">
            <span>Élément concerné</span>
            <select
              value={manual.targetId}
              onChange={(event) => updateManual('targetId', event.target.value)}
              disabled={catalog.isPending || currentOptions.length === 0}
            >
              {currentOptions.length === 0 ? <option value="">Aucun élément disponible</option> : null}
              {currentOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </select>
          </label>
          <label className="rvm-field">
            <span>Nom affiché</span>
            <input
              value={manual.displayName}
              onChange={(event) => updateManual('displayName', event.target.value)}
              placeholder="Ex. Camille M."
            />
          </label>
          <label className="rvm-field">
            <span>Statut initial</span>
            <select
              value={manual.status}
              onChange={(event) => updateManual('status', event.target.value as ManualReviewInput['status'])}
            >
              <option value="published">Publié</option>
              <option value="pending">En attente</option>
            </select>
          </label>
          <div className="rvm-field rvm-field--full">
            <span>Note</span>
            <PawInput value={manual.rating} onChange={(value) => updateManual('rating', value)} />
          </div>
          <label className="rvm-field rvm-field--full">
            <span>Commentaire</span>
            <TextArea
              rows={4}
              maxLength={1000}
              value={manual.comment ?? ''}
              onChange={(event) => updateManual('comment', event.target.value)}
              placeholder="Retour client, détail de prestation, expérience formation…"
            />
          </label>
        </div>

        <div className="rvm-panel__actions">
          <button
            type="button"
            className="cat-btn"
            onClick={submitManualReview}
            disabled={
              createManual.isPending ||
              !manual.targetId ||
              !manual.displayName.trim() ||
              manual.rating < 1
            }
          >
            {createManual.isPending ? 'Création…' : 'Créer l’avis'}
          </button>
          {createManual.isError ? (
            <span className="rvm-error">
              {(createManual.error as { message?: string })?.message || 'Création impossible.'}
            </span>
          ) : null}
        </div>
      </section>

      <div className="rvm-filters" role="tablist" aria-label="Filtrer les avis par statut">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            role="tab"
            aria-selected={statusFilter === filter.key}
            className={`lrn-filter${statusFilter === filter.key ? ' lrn-filter--active' : ''}`}
            onClick={() => setStatusFilter(filter.key)}
          >
            {filter.label}
            {filter.key !== 'all' && query.data ? <span className="rvm-count"> {query.data.counts[filter.key]}</span> : null}
          </button>
        ))}
      </div>

      <div className="rvm-filters" role="tablist" aria-label="Filtrer les avis par type">
        {TYPE_FILTERS.map((filter) => (
          <button
            key={filter.key}
            type="button"
            role="tab"
            aria-selected={typeFilter === filter.key}
            className={`lrn-filter${typeFilter === filter.key ? ' lrn-filter--active' : ''}`}
            onClick={() => setTypeFilter(filter.key)}
          >
            {filter.label}
            {filter.key !== 'all' && query.data ? (
              <span className="rvm-count"> {query.data.countsByType[filter.key]}</span>
            ) : null}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <CatalogueSkeleton rows={4} />
      ) : query.isError ? (
        <ErrorState title="Impossible de charger les avis." detail="Réessayez plus tard." />
      ) : query.data && query.data.reviews.length > 0 ? (
        <div className="rvm-list">
          {query.data.reviews.map((review) => (
            <ReviewCard
              key={review.id}
              review={review}
              busy={moderate.isPending}
              onModerate={(status) => moderate.mutate({ id: review.id, status })}
            />
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
