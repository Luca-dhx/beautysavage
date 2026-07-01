import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { SectionHeader, CatalogueGrid, CatalogueCard, MediaImage, PriceLabel, Card } from '@bs/ui';
import { resolveMediaUrl, formatDuration, getBoostedServices } from '@bs/api-client';
import { usePublicServices } from '../features/catalog/hooks/usePublicServices';
import { usePublicShop } from '../features/catalog/hooks/usePublicShop';
import { usePublicGiftCards } from '../features/catalog/hooks/usePublicGiftCards';
import { servicePriceProps, trainingPriceProps } from '../features/catalog/priceProps';
import { HomeHero } from '../features/home/HomeHero';
import { HomeWhy } from '../features/home/HomeWhy';
import { HomeReviews } from '../features/home/HomeReviews';
import { HomeFaq } from '../features/home/HomeFaq';
import '../features/home/home.css';

const TYPE_LABEL: Record<string, string> = { distanciel: 'En ligne', presentiel: 'Présentiel' };

export function HomePage() {
  const boosted = useQuery({ queryKey: ['home', 'boosted-services'], queryFn: ({ signal }) => getBoostedServices(signal), staleTime: 120_000 });
  const services = usePublicServices();
  const shop = usePublicShop();
  const giftCard = usePublicGiftCards();

  const prestations = (boosted.data?.length ? boosted.data : services.data ?? []).slice(0, 3);
  const formations = (shop.data?.formations ?? []).slice(0, 3);
  const featuredFormationId = shop.data?.formations?.[0]?.id;

  return (
    <div className="home">
      <HomeHero />

      {/* Prestations */}
      <section className="home-section" aria-label="Prestations">
        <SectionHeader title="Nos prestations" subtitle="Réservez votre moment beauté." action={<Link to="/prestations">Voir tout →</Link>} />
        {prestations.length ? (
          <CatalogueGrid>
            {prestations.map((s) => (
              <CatalogueCard
                key={s.id}
                media={<MediaImage src={resolveMediaUrl(s.photos?.[0])} alt={s.name} />}
                badge={s.hasPromo ? s.promotionLabel ?? 'Promo' : undefined}
                title={s.name}
                meta={formatDuration(s.duration) || undefined}
                price={<PriceLabel {...servicePriceProps(s)} />}
                action={<Link className="bs-btn bs-btn--secondary" to={`/prestations/${s.slug}`}>Réserver</Link>}
              />
            ))}
          </CatalogueGrid>
        ) : (
          <p className="bs-note">Découvrez bientôt nos prestations.</p>
        )}
      </section>

      {/* Formations */}
      <section className="home-section" aria-label="Formations">
        <SectionHeader title="Nos formations" subtitle="En ligne ou en présentiel." action={<Link to="/formations">Voir tout →</Link>} />
        {formations.length ? (
          <CatalogueGrid>
            {formations.map((t) => (
              <CatalogueCard
                key={t.id}
                media={<MediaImage src={resolveMediaUrl(t.coverImage)} alt={t.name} />}
                badge={t.activePromotion ? t.activePromotion.label ?? 'Promo' : undefined}
                title={t.name}
                meta={t.type ? TYPE_LABEL[t.type] ?? t.type : undefined}
                price={<PriceLabel {...trainingPriceProps(t)} />}
                action={<Link className="bs-btn bs-btn--secondary" to={`/formations/${t.id}`}>Détail</Link>}
              />
            ))}
          </CatalogueGrid>
        ) : (
          <p className="bs-note">Découvrez bientôt nos formations.</p>
        )}
      </section>

      {/* Cartes cadeaux */}
      <section className="home-section" aria-label="Cartes cadeaux">
        <Card className="home-gift">
          <div className="home-gift__media">
            <MediaImage src={resolveMediaUrl(giftCard.data?.image)} alt="Carte cadeau Beauty Savage" ratio="4 / 3" />
          </div>
          <div className="home-gift__body">
            <h2 className="home-gift__title">Offrez la beauté</h2>
            <p className="home-gift__text">
              Une carte cadeau utilisable sur l’ensemble de nos prestations et formations. Le cadeau qui fait toujours plaisir.
            </p>
            <Link className="bs-btn" to="/cartes-cadeaux">Offrir une carte cadeau</Link>
          </div>
        </Card>
      </section>

      <HomeWhy />
      <HomeReviews formationId={featuredFormationId} />
      <HomeFaq />

      {/* CTA final */}
      <section className="home-cta" aria-label="Commencer">
        <h2 className="home-cta__title">Prête à commencer ?</h2>
        <div className="home-cta__actions">
          <Link className="bs-btn" to="/prestations">Réserver</Link>
          <Link className="bs-btn bs-btn--secondary" to="/formations">Se former</Link>
          <Link className="bs-btn bs-btn--secondary" to="/cartes-cadeaux">Offrir</Link>
        </div>
      </section>
    </div>
  );
}
