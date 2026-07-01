import { Link } from 'react-router-dom';
import { SectionHeader, Card, Button, EmptyState } from '@bs/ui';
import { formatPrice } from '@bs/api-client';
import { useCart } from '../features/cart/CartProvider';
import { formatSlotLabel } from '../features/booking/dateUtils';
import { isFormationItem, type ServiceCartItem } from '../features/cart/cartTypes';

export function CartPage() {
  const { items, summary, removeItem } = useCart();

  if (items.length === 0) {
    return (
      <section>
        <SectionHeader title="Panier" />
        <EmptyState label="Votre panier est vide." />
        <p><Link to="/prestations">Découvrir les prestations →</Link></p>
      </section>
    );
  }

  return (
    <section>
      <SectionHeader title="Panier" subtitle="Récapitulatif (indicatif — le montant final est calculé au paiement)." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bs-space-3)' }}>
        {items.map((it) => {
          const slot = (it as ServiceCartItem).selectedSlot;
          return (
            <Card key={it.lineId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--bs-space-3)', alignItems: 'flex-start' }}>
                <div>
                  <strong>{it.name}</strong>
                  {slot ? <div className="bs-note">{formatSlotLabel(slot.slotStart)}</div> : null}
                  {isFormationItem(it) ? (
                    <div className="bs-note">
                      {it.formationType === 'distanciel'
                        ? 'Formation en ligne — accès à vie'
                        : it.sessionStartAt
                          ? `Session du ${new Date(it.sessionStartAt).toLocaleDateString('fr-FR')}`
                          : 'Formation présentielle'}
                    </div>
                  ) : null}
                  {it.indicativePrice !== undefined ? <div className="bs-note">{formatPrice(it.indicativePrice)} (indicatif)</div> : null}
                </div>
                <Button variant="secondary" type="button" onClick={() => removeItem(it.lineId)}>Retirer</Button>
              </div>
            </Card>
          );
        })}
      </div>
      <p className="bs-note" style={{ marginTop: 'var(--bs-space-3)' }}>
        Total indicatif : {formatPrice(summary.indicativeTotal)} — {summary.count} article(s).
      </p>
      <Link className="bs-btn" to="/checkout">Continuer</Link>
    </section>
  );
}
