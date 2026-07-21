import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { MediaImage, Card } from '@bs/ui';
import { resolveMediaUrl, formatDuration, getBoostedServices } from '@bs/api-client';
import { usePublicServices } from '../features/catalog/hooks/usePublicServices';
import { usePublicShop } from '../features/catalog/hooks/usePublicShop';
import { usePublicGiftCards } from '../features/catalog/hooks/usePublicGiftCards';
import { servicePriceProps, trainingPriceProps } from '../features/catalog/priceProps';
import { HomeHero } from '../features/home/HomeHero';
import { HomeCarousel, type CarouselItem } from '../features/home/HomeCarousel';
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

  const prestations = (boosted.data?.length ? boosted.data : services.data ?? []).slice(0, 10);
  const formations = (shop.data?.formations ?? []).slice(0, 10);
  const featuredFormationId = shop.data?.formations?.[0]?.id;

  const prestationItems: CarouselItem[] = prestations.map((s) => ({
    id: s.id,
    to: `/prestations/${s.slug}`,
    title: s.name,
    media: resolveMediaUrl(s.photos?.[0]),
    mediaAlt: s.name,
    badge: s.hasPromo ? s.promotionLabel ?? 'Promo' : null,
    meta: formatDuration(s.duration) || null,
    price: servicePriceProps(s),
    ctaLabel: 'Réserver',
  }));

  const formationItems: CarouselItem[] = formations.map((t) => ({
    id: t.id,
    to: `/formations/${t.id}`,
    title: t.name,
    media: resolveMediaUrl(t.coverImage),
    mediaAlt: t.name,
    badge: t.activePromotion ? t.activePromotion.label ?? 'Promo' : null,
    meta: t.type ? TYPE_LABEL[t.type] ?? t.type : null,
    price: trainingPriceProps(t),
    ctaLabel: 'Réserver',
  }));

  return (
    <div className="home">
      <HomeHero />

      <HomeCarousel
        ariaLabel="Prestations"
        title="Nos prestations"
        subtitle="Réservez votre moment beauté."
        viewAllTo="/prestations"
        items={prestationItems}
        emptyLabel="Découvrez bientôt nos prestations."
      />

      <HomeCarousel
        ariaLabel="Formations"
        title="Nos formations"
        subtitle="En ligne ou en présentiel."
        viewAllTo="/formations"
        items={formationItems}
        emptyLabel="Découvrez bientôt nos formations."
      />

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
