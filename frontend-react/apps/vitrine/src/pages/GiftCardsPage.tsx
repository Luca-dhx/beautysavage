import { Card, MediaImage, SectionHeader, LoadingState, ErrorState } from '@bs/ui';
import { resolveMediaUrl, formatPrice } from '@bs/api-client';
import { usePublicGiftCards } from '../features/catalog/hooks/usePublicGiftCards';

// Carte cadeau : l'API publique ne fournit qu'une config (montant min, description, image).
// Pas de liste/détail (cf. rapport 158). Achat = R2.
export function GiftCardsPage() {
  const { data, isPending, isError } = usePublicGiftCards();

  return (
    <section>
      <SectionHeader title="Cartes cadeaux" subtitle="Offrez une carte cadeau Beauty Savage." />
      {isPending ? <LoadingState label="Chargement…" /> : null}
      {isError ? <ErrorState title="Impossible de charger les cartes cadeaux." /> : null}
      {!isPending && !isError && data ? (
        <Card>
          {data.image ? <MediaImage src={resolveMediaUrl(data.image)} alt="Carte cadeau" ratio="16 / 9" /> : null}
          <p>Montant minimum : {formatPrice(data.minAmount)}</p>
          {data.description ? <p>{data.description}</p> : null}
          <p>
            <span className="bs-btn" aria-disabled="true" style={{ pointerEvents: 'none', opacity: 0.6 }}>
              Achat bientôt disponible
            </span>
          </p>
        </Card>
      ) : null}
    </section>
  );
}
