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
import { resolveMediaUrl, formatDuration, type PublicService } from '@bs/api-client';
import { usePublicServices } from '../features/catalog/hooks/usePublicServices';
import { servicePriceProps } from '../features/catalog/priceProps';
import { useCatalogueQuery, type CatalogueAccessors } from '../features/catalog/catalogueQuery';
import { CatalogueToolbar } from '../features/catalog/components/CatalogueToolbar';

const ACCESSORS: CatalogueAccessors<PublicService> = {
  text: (s) => `${s.name} ${s.shortDescription ?? ''}`,
  price: (s) => s.effectivePrice ?? s.price,
};

export function ServicesPage() {
  const { data, isPending, isError } = usePublicServices();
  const { query, results, setQ, setSort } = useCatalogueQuery(data, ACCESSORS);

  return (
    <section className="vitrine-page">
      <SectionHeader title="Prestations" subtitle="Nos prestations en institut." />
      {isPending ? <LoadingState label="Chargement des prestations…" /> : null}
      {isError ? <ErrorState title="Impossible de charger les prestations." /> : null}
      {!isPending && !isError ? (
        data?.length ? (
          <>
            <CatalogueToolbar
              query={query}
              onQ={setQ}
              onSort={setSort}
              sortOptions={['featured', 'price-asc', 'price-desc']}
              resultCount={results.length}
              searchPlaceholder="Rechercher une prestation…"
            />
            {results.length ? (
              <CatalogueGrid>
                {results.map((s) => (
                  <CatalogueCard
                    key={s.id}
                    media={<MediaImage src={resolveMediaUrl(s.photos?.[0])} alt={s.name} />}
                    badge={s.hasPromo ? s.promotionLabel ?? 'Promo' : undefined}
                    title={s.name}
                    meta={formatDuration(s.duration) || undefined}
                    description={s.shortDescription}
                    price={<PriceLabel {...servicePriceProps(s)} />}
                    action={
                      <Link className="bs-btn bs-btn--secondary" to={`/prestations/${s.slug}`}>
                        Voir
                      </Link>
                    }
                  />
                ))}
              </CatalogueGrid>
            ) : (
              <EmptyState label="Aucune prestation ne correspond à votre recherche." />
            )}
          </>
        ) : (
          <EmptyState label="Aucune prestation disponible pour le moment." />
        )
      ) : null}
    </section>
  );
}
