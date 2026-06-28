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
import { usePublicProducts } from '../features/catalog/hooks/usePublicProducts';
import { productPriceProps } from '../features/catalog/priceProps';

export function ProductsPage() {
  const { data, isPending, isError } = usePublicProducts();

  return (
    <section>
      <SectionHeader title="Produits" subtitle="Nos produits à la vente." />
      {isPending ? <LoadingState label="Chargement des produits…" /> : null}
      {isError ? <ErrorState title="Impossible de charger les produits." /> : null}
      {!isPending && !isError && (data?.length ? (
        <CatalogueGrid>
          {data.map((p) => (
            <CatalogueCard
              key={p.id}
              media={<MediaImage src={resolveMediaUrl(p.coverImage)} alt={p.name} />}
              badge={p.activePromotion ? p.activePromotion.label ?? 'Promo' : undefined}
              title={p.name}
              price={<PriceLabel {...productPriceProps(p)} />}
              action={<Link className="bs-btn bs-btn--secondary" to={`/produits/${p.id}`}>Détail</Link>}
            />
          ))}
        </CatalogueGrid>
      ) : (
        <EmptyState label="Aucun produit disponible pour le moment." />
      ))}
    </section>
  );
}
