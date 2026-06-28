import { Link, useParams } from 'react-router-dom';
import { Card, MediaImage, PriceLabel, LoadingState, ErrorState } from '@bs/ui';
import { resolveMediaUrl, formatDuration } from '@bs/api-client';
import { usePublicService } from '../features/catalog/hooks/usePublicServices';
import { servicePriceProps } from '../features/catalog/priceProps';

export function ServiceDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data, isPending, isError } = usePublicService(slug);

  if (isPending) return <LoadingState label="Chargement de la prestation…" />;
  if (isError || !data) return <ErrorState title="Prestation introuvable." />;

  return (
    <article>
      <p>
        <Link to="/prestations">← Prestations</Link>
      </p>
      <Card>
        <MediaImage src={resolveMediaUrl(data.photos?.[0])} alt={data.name} ratio="16 / 9" />
        <h1>{data.name}</h1>
        {data.duration ? <p className="bs-cat-card__meta">Durée : {formatDuration(data.duration)}</p> : null}
        <PriceLabel {...servicePriceProps(data)} />
        {data.shortDescription ? <p>{data.shortDescription}</p> : null}
        {data.description ? <p>{data.description}</p> : null}
        <p>
          <span className="bs-btn" aria-disabled="true" style={{ pointerEvents: 'none', opacity: 0.6 }}>
            Réservation bientôt disponible
          </span>
        </p>
      </Card>
    </article>
  );
}
