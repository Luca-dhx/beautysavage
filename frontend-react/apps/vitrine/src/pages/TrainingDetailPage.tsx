import { Link, useParams } from 'react-router-dom';
import { Card, MediaImage, PriceLabel, LoadingState, ErrorState } from '@bs/ui';
import { resolveMediaUrl } from '@bs/api-client';
import { usePublicTraining } from '../features/catalog/hooks/usePublicTrainings';
import { trainingPriceProps } from '../features/catalog/priceProps';
import { TrainingReviews } from '../features/catalog/components/TrainingReviews';

export function TrainingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, isError } = usePublicTraining(id);

  if (isPending) return <LoadingState label="Chargement de la formation…" />;
  if (isError || !data) return <ErrorState title="Formation introuvable." />;

  const lifetime = data.type === 'distanciel';

  return (
    <article>
      <p>
        <Link to="/formations">← Formations</Link>
      </p>
      <Card>
        <MediaImage src={resolveMediaUrl(data.coverImage)} alt={data.name} ratio="16 / 9" />
        <h1>{data.name}</h1>
        {data.type ? <p className="bs-cat-card__meta">{lifetime ? 'En ligne — accès à vie' : 'Présentiel'}</p> : null}
        <PriceLabel {...trainingPriceProps(data)} />
        {data.description ? <p>{data.description}</p> : null}
        {data.editorialHtml ? (
          <div dangerouslySetInnerHTML={{ __html: data.editorialHtml }} />
        ) : null}
      </Card>
      {id ? <TrainingReviews trainingId={id} /> : null}
    </article>
  );
}
