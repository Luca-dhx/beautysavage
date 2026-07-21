import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader, MediaImage, PriceLabel } from '@bs/ui';
import type { PriceLabelProps } from '@bs/ui';

// RX-HOME — Carrousel 3D horizontal (prestations / formations). Cartes compactes en « coverflow » :
// chaque cellule se replie en profondeur selon sa distance au centre (rotateY + scale + opacity),
// recalculé au scroll via rAF. Mobile-first, scroll tactile + snap, flèches sur desktop, CTA direct.
// Respecte prefers-reduced-motion (désactive l'effet 3D, garde le scroll simple).

export interface CarouselItem {
  id: string;
  to: string;
  title: string;
  media?: string | null;
  mediaAlt?: string;
  badge?: string | null;
  meta?: string | null;
  price?: PriceLabelProps;
  ctaLabel?: string;
}

export interface HomeCarouselProps {
  title: string;
  subtitle?: string;
  viewAllTo?: string;
  viewAllLabel?: string;
  items: CarouselItem[];
  emptyLabel?: string;
  ariaLabel: string;
}

const REDUCED = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-reduced-motion: reduce)')
  : null;

export function HomeCarousel({ title, subtitle, viewAllTo, viewAllLabel = 'Voir tout →', items, emptyLabel = 'Découvrez bientôt notre sélection.', ariaLabel }: HomeCarouselProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const frame = useRef<number>(0);

  // Applique la transformation « coverflow » à chaque cellule selon sa distance au centre du track.
  const paint = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const reduced = REDUCED?.matches ?? false;
    const trackRect = track.getBoundingClientRect();
    const center = trackRect.left + trackRect.width / 2;
    const cells = track.querySelectorAll<HTMLElement>('.home-cf__cell');
    cells.forEach((cell) => {
      if (reduced) {
        cell.style.transform = '';
        cell.style.opacity = '';
        cell.style.zIndex = '';
        return;
      }
      const rect = cell.getBoundingClientRect();
      const cellCenter = rect.left + rect.width / 2;
      const dist = (cellCenter - center) / trackRect.width; // -0.5 .. 0.5 environ
      const clamped = Math.max(-1, Math.min(1, dist * 2));
      const rotate = clamped * -22; // degrés
      const scale = 1 - Math.min(Math.abs(clamped) * 0.16, 0.28);
      const translateZ = -Math.abs(clamped) * 120;
      const opacity = 1 - Math.min(Math.abs(clamped) * 0.5, 0.5);
      cell.style.transform = `translateZ(${translateZ}px) rotateY(${rotate}deg) scale(${scale})`;
      cell.style.opacity = String(opacity);
      cell.style.zIndex = String(100 - Math.round(Math.abs(clamped) * 100));
    });
  }, []);

  const onScroll = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(paint);
  }, [paint]);

  useEffect(() => {
    paint();
    const onResize = () => onScroll();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(frame.current);
    };
  }, [paint, onScroll, items.length]);

  const scrollBy = (dir: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const cell = track.querySelector<HTMLElement>('.home-cf__cell');
    const step = cell ? cell.getBoundingClientRect().width + 16 : track.clientWidth * 0.8;
    track.scrollBy({ left: dir * step, behavior: 'smooth' });
  };

  return (
    <section className="home-section home-cf-section" aria-label={ariaLabel}>
      <SectionHeader title={title} subtitle={subtitle} action={viewAllTo ? <Link to={viewAllTo}>{viewAllLabel}</Link> : undefined} />
      {items.length ? (
        <div className="home-cf">
          <button type="button" className="home-cf__nav home-cf__nav--prev" aria-label="Précédent" onClick={() => scrollBy(-1)}>
            <i className="bi bi-chevron-left" aria-hidden="true" />
          </button>
          <div className="home-cf__track" ref={trackRef} onScroll={onScroll}>
            {items.map((item) => (
              <div className="home-cf__cell" key={item.id}>
                <CarouselCard item={item} />
              </div>
            ))}
          </div>
          <button type="button" className="home-cf__nav home-cf__nav--next" aria-label="Suivant" onClick={() => scrollBy(1)}>
            <i className="bi bi-chevron-right" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <p className="bs-note">{emptyLabel}</p>
      )}
    </section>
  );
}

function CarouselCard({ item }: { item: CarouselItem }): ReactNode {
  return (
    <article className="bs-card home-card">
      <Link to={item.to} className="home-card__media" aria-label={item.title}>
        <MediaImage src={item.media} alt={item.mediaAlt ?? item.title} ratio="3 / 4" />
        {item.badge ? <span className="home-card__badge">{item.badge}</span> : null}
      </Link>
      <div className="home-card__body">
        <h3 className="home-card__title">{item.title}</h3>
        {item.meta ? <div className="home-card__meta">{item.meta}</div> : null}
        {item.price ? <div className="home-card__price"><PriceLabel {...item.price} /></div> : null}
        <Link className="bs-btn home-card__cta" to={item.to}>
          <i className="bi bi-calendar-heart" aria-hidden="true" /> {item.ctaLabel ?? 'Réserver'}
        </Link>
      </div>
    </article>
  );
}
