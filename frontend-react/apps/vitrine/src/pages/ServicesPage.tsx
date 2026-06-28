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
import { resolveMediaUrl, formatDuration } from '@bs/api-client';
import { usePublicServices } from '../features/catalog/hooks/usePublicServices';
import { servicePriceProps } from '../features/catalog/priceProps';

export function ServicesPage() {
  const { data, isPending, isError } = usePublicServices();

  return (
    <section>
      <SectionHeader title="Prestations" subtitle="Nos prestations en institut." />
      {isPending ? <LoadingState label="Chargement des prestations…" /> : null}
      {isError ? <ErrorState title="Impossible de charger les prestations." /> : null}
      {!isPending && !isError && (data?.length ? (
        <CatalogueGrid>
          {data.map((s) => (
            <CatalogueCard
              key={s.id}
              media={<MediaImage src={resolveMediaUrl(s.photos?.[0])} alt={s.name} />}
              badge={s.hasPromo ? s.promotionLabel ?? 'Promo' : undefined}
              title={s.name}
              meta={formatDuration(s.duration) || undefined}
              description={s.shortDescription}
              price={<PriceLabel {...servicePriceProps(s)} />}
              action={<Link className="bs-btn bs-btn--secondary" to={`/prestations/${s.slug}`}>Voir</Link>}
            />
          ))}
        </CatalogueGrid>
      ) : (
        <EmptyState label="Aucune prestation disponible pour le moment." />
      ))}
    </section>
  );
}
