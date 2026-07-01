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

// C1 — Notation « patte de chien » (identité Beauty Savage). Icône premium retravaillée, rendue
// via currentColor + token --bs-color-secondary pour les pattes actives. Accessible (aria-label).
function Paw({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`bs-paw${filled ? ' bs-paw--on' : ''}`} aria-hidden="true" focusable="false">
      <circle cx="5" cy="6" r="2.6" />
      <circle cx="9.2" cy="4.4" r="2.4" />
      <circle cx="14.8" cy="4.4" r="2.4" />
      <circle cx="19" cy="6" r="2.6" />
      <path d="M12 14c-2.6 0-4.7 1.8-4.7 4.4 0 1.2 1 2 2.4 2h4.6c1.4 0 2.4-.8 2.4-2C16.7 15.8 14.6 14 12 14z" />
    </svg>
  );
}

export interface PawRatingProps {
  /** Note moyenne 0–5. */
  value: number;
  /** Nombre d'avis (affiché à côté si fourni). */
  count?: number;
  /** Compact = pas de texte, juste les pattes (pour les cartes). */
  compact?: boolean;
}

export interface PawInputProps {
  /** Note sélectionnée (0 = aucune). */
  value: number;
  onChange: (value: number) => void;
  /** Libellé accessible du groupe. */
  label?: string;
}

/** Sélecteur de note interactif (1..5 pattes). RX4 — parcours avis. Clavier + aria. */
export function PawInput({ value, onChange, label = 'Votre note' }: PawInputProps) {
  return (
    <span className="bs-paw-input" role="radiogroup" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={`bs-paw-input__btn${n <= value ? ' bs-paw-input__btn--on' : ''}`}
          role="radio"
          aria-checked={n === value}
          aria-label={`${n} sur 5`}
          onClick={() => onChange(n)}
        >
          <Paw filled={n <= value} />
        </button>
      ))}
    </span>
  );
}

export function PawRating({ value, count, compact = false }: PawRatingProps) {
  const rounded = Math.round(value);
  const label = `${value.toFixed(1)} sur 5${count !== undefined ? `, ${count} avis` : ''}`;
  return (
    <span className={`bs-paws${compact ? ' bs-paws--compact' : ''}`} role="img" aria-label={label}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Paw key={i} filled={i < rounded} />
      ))}
      {!compact ? (
        <span className="bs-paws__text" aria-hidden="true">
          {value.toFixed(1)}{count !== undefined ? ` · ${count} avis` : ''}
        </span>
      ) : null}
    </span>
  );
}
