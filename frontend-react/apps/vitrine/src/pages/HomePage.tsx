import { Link } from 'react-router-dom';
import {
  SectionHeader,
  CatalogueGrid,
  CatalogueCard,
  MediaImage,
  PriceLabel,
  LoadingState,
} from '@bs/ui';
import { resolveMediaUrl } from '@bs/api-client';
import { usePublicShop } from '../features/catalog/hooks/usePublicShop';
import { usePublicServices } from '../features/catalog/hooks/usePublicServices';
import { trainingPriceProps, productPriceProps, servicePriceProps } from '../features/catalog/priceProps';

const PREVIEW = 3;

export function HomePage() {
  const shop = usePublicShop();
  const services = usePublicServices();

  const formations = (shop.data?.formations ?? []).slice(0, PREVIEW);
  const products = (shop.data?.products ?? []).slice(0, PREVIEW);
  const prestations = (services.data ?? []).slice(0, PREVIEW);

  return (
    <div>
      <header className="bs-hero">
        <h1>Beauty Savage</h1>
        <p>Prestations en institut, formations en ligne et présentielles, produits et cartes cadeaux.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link className="bs-btn" to="/prestations">Découvrir les prestations</Link>
          <Link className="bs-btn bs-btn--secondary" to="/formations">Voir les formations</Link>
        </div>
      </header>

      {/* Prestations */}
      <SectionHeader title="Prestations" action={<Link to="/prestations">Tout voir →</Link>} />
      {services.isPending ? (
        <LoadingState label="Chargement…" />
      ) : prestations.length ? (
        <CatalogueGrid>
          {prestations.map((s) => (
            <CatalogueCard
              key={s.id}
              media={<MediaImage src={resolveMediaUrl(s.photos?.[0])} alt={s.name} />}
              title={s.name}
              price={<PriceLabel {...servicePriceProps(s)} />}
              action={<Link className="bs-btn bs-btn--secondary" to={`/prestations/${s.slug}`}>Voir</Link>}
            />
          ))}
        </CatalogueGrid>
      ) : (
        <p className="bs-cat-card__meta">Catalogue prestations bientôt disponible.</p>
      )}

      {/* Formations */}
      <SectionHeader title="Formations" action={<Link to="/formations">Tout voir →</Link>} />
      {shop.isPending ? (
        <LoadingState label="Chargement…" />
      ) : formations.length ? (
        <CatalogueGrid>
          {formations.map((t) => (
            <CatalogueCard
              key={t.id}
              media={<MediaImage src={resolveMediaUrl(t.coverImage)} alt={t.name} />}
              title={t.name}
              price={<PriceLabel {...trainingPriceProps(t)} />}
              action={<Link className="bs-btn bs-btn--secondary" to={`/formations/${t.id}`}>Détail</Link>}
            />
          ))}
        </CatalogueGrid>
      ) : (
        <p className="bs-cat-card__meta">Catalogue formations bientôt disponible.</p>
      )}

      {/* Produits */}
      <SectionHeader title="Produits" action={<Link to="/produits">Tout voir →</Link>} />
      {shop.isPending ? (
        <LoadingState label="Chargement…" />
      ) : products.length ? (
        <CatalogueGrid>
          {products.map((p) => (
            <CatalogueCard
              key={p.id}
              media={<MediaImage src={resolveMediaUrl(p.coverImage)} alt={p.name} />}
              title={p.name}
              price={<PriceLabel {...productPriceProps(p)} />}
              action={<Link className="bs-btn bs-btn--secondary" to={`/produits/${p.id}`}>Détail</Link>}
            />
          ))}
        </CatalogueGrid>
      ) : (
        <p className="bs-cat-card__meta">Catalogue produits bientôt disponible.</p>
      )}

      {/* Cartes cadeaux */}
      <SectionHeader title="Cartes cadeaux" action={<Link to="/cartes-cadeaux">En savoir plus →</Link>} />
      <p className="bs-cat-card__meta">Offrez une carte cadeau Beauty Savage.</p>
    </div>
  );
}
