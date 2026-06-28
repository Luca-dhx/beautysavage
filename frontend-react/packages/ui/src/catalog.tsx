import type { ReactNode } from 'react';

// Composants catalogue (présentation pure — props préformatées, aucune dépendance data).

export interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="bs-section-header">
      <div>
        <h2 className="bs-section-header__title">{title}</h2>
        {subtitle ? <p className="bs-section-header__subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="bs-section-header__action">{action}</div> : null}
    </div>
  );
}

export function EmptyState({ label = 'Rien à afficher pour le moment.' }: { label?: string }) {
  return (
    <div className="bs-state bs-empty" role="status">
      {label}
    </div>
  );
}

export interface MediaImageProps {
  /** URL déjà résolue (ou null → placeholder). */
  src?: string | null;
  alt?: string;
  ratio?: string; // ex. '4 / 3'
}

export function MediaImage({ src, alt = '', ratio = '4 / 3' }: MediaImageProps) {
  return (
    <div className="bs-media" style={{ aspectRatio: ratio }}>
      {src ? (
        <img className="bs-media__img" src={src} alt={alt} loading="lazy" />
      ) : (
        <div className="bs-media__placeholder" aria-hidden="true" />
      )}
    </div>
  );
}

export interface PriceLabelProps {
  /** Prix courant déjà formaté (ex. "150,00 €"). */
  current: string;
  /** Prix barré si promotion (déjà formaté). */
  original?: string;
  /** Libellé promo (ex. "-25%"). */
  promoLabel?: string;
}

export function PriceLabel({ current, original, promoLabel }: PriceLabelProps) {
  const hasOriginal = Boolean(original) && original !== current;
  return (
    <span className="bs-price">
      <span className="bs-price__current">{current}</span>
      {hasOriginal ? <span className="bs-price__original">{original}</span> : null}
      {promoLabel ? <span className="bs-price__promo">{promoLabel}</span> : null}
    </span>
  );
}

export interface CatalogueGridProps {
  children: ReactNode;
}

export function CatalogueGrid({ children }: CatalogueGridProps) {
  return <div className="bs-grid">{children}</div>;
}

export interface CatalogueCardProps {
  title: string;
  media?: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode; // ex. durée / type
  price?: ReactNode;
  description?: string;
  action?: ReactNode;
}

export function CatalogueCard({ title, media, badge, meta, price, description, action }: CatalogueCardProps) {
  return (
    <article className="bs-card bs-cat-card">
      {media ? <div className="bs-cat-card__media">{media}{badge ? <span className="bs-cat-card__badge">{badge}</span> : null}</div> : null}
      <div className="bs-cat-card__body">
        <h3 className="bs-cat-card__title">{title}</h3>
        {meta ? <div className="bs-cat-card__meta">{meta}</div> : null}
        {description ? <p className="bs-cat-card__desc">{description}</p> : null}
        <div className="bs-cat-card__footer">
          {price ? <div className="bs-cat-card__price">{price}</div> : <span />}
          {action ? <div className="bs-cat-card__action">{action}</div> : null}
        </div>
      </div>
    </article>
  );
}
