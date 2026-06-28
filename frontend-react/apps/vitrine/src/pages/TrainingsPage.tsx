import { Link } from 'react-router-dom';
import {
  SectionHeader,
  CatalogueGrid,
  CatalogueCard,
  MediaImage,
  PriceLabel,
  LoadingState,
  ErrorState,
  EmptyState,
} from '@bs/ui';
import { resolveMediaUrl } from '@bs/api-client';
import { usePublicTrainings } from '../features/catalog/hooks/usePublicTrainings';
import { trainingPriceProps } from '../features/catalog/priceProps';

const TYPE_LABEL: Record<string, string> = {
  distanciel: 'En ligne — accès à vie',
  presentiel: 'Présentiel',
};

export function TrainingsPage() {
  const { data, isPending, isError } = usePublicTrainings();

  return (
    <section>
      <SectionHeader title="Formations" subtitle="Formations en ligne et en présentiel." />
      {isPending ? <LoadingState label="Chargement des formations…" /> : null}
      {isError ? <ErrorState title="Impossible de charger les formations." /> : null}
      {!isPending && !isError && (data?.length ? (
        <CatalogueGrid>
          {data.map((t) => (
            <CatalogueCard
              key={t.id}
              media={<MediaImage src={resolveMediaUrl(t.coverImage)} alt={t.name} />}
              badge={t.activePromotion ? t.activePromotion.label ?? 'Promo' : undefined}
              title={t.name}
              meta={t.type ? (TYPE_LABEL[t.type] ?? t.type) : undefined}
              price={<PriceLabel {...trainingPriceProps(t)} />}
              action={<Link className="bs-btn bs-btn--secondary" to={`/formations/${t.id}`}>Détail</Link>}
            />
          ))}
        </CatalogueGrid>
      ) : (
        <EmptyState label="Aucune formation disponible pour le moment." />
      ))}
    </section>
  );
}
