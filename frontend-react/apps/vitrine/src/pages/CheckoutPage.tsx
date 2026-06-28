import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SectionHeader, Card, Button, EmptyState } from '@bs/ui';
import {
  EMPTY_LEGAL_CONSENT,
  isLegalConsentComplete,
  buildCheckoutPreparationPayload,
  formatPrice,
  type LegalConsentState,
  type CheckoutLine,
  type CheckoutPreparationPayload,
} from '@bs/api-client';
import { useCart } from '../features/cart/CartProvider';
import { LegalConsentChecklist } from '../features/legal/LegalConsentChecklist';
import { formatSlotLabel } from '../features/booking/dateUtils';
import type { ServiceCartItem } from '../features/cart/cartTypes';

function toLines(items: ReturnType<typeof useCart>['items']): CheckoutLine[] {
  return items.map((it) => {
    const slot = (it as ServiceCartItem).selectedSlot;
    return {
      kind: it.kind,
      refId: it.refId,
      slug: it.slug,
      name: it.name,
      indicativePrice: it.indicativePrice,
      service:
        it.kind === 'service' && slot
          ? {
              serviceId: it.refId,
              slotStart: slot.slotStart,
              slotEnd: slot.slotEnd,
              practitionerId: slot.practitionerId,
              selectedOptions: (it as ServiceCartItem).selectedOptions ?? [],
            }
          : undefined,
    };
  });
}

export function CheckoutPage() {
  const { items, summary } = useCart();
  const [consent, setConsent] = useState<LegalConsentState>(EMPTY_LEGAL_CONSENT);
  const [prepared, setPrepared] = useState<CheckoutPreparationPayload | null>(null);

  const hasDatedService = useMemo(
    () => items.some((it) => it.kind === 'service' && (it as ServiceCartItem).selectedSlot),
    [items],
  );
  const complete = isLegalConsentComplete(consent, { datedService: hasDatedService, retractation: false });

  if (items.length === 0) {
    return (
      <section>
        <SectionHeader title="Checkout" />
        <EmptyState label="Votre panier est vide." />
        <p><Link to="/prestations">Découvrir les prestations →</Link></p>
      </section>
    );
  }

  const onPrepare = () => {
    if (!complete) return;
    // R2A : on PRÉPARE uniquement le payload. AUCUN appel Stripe / create-checkout-session.
    const payload = buildCheckoutPreparationPayload({
      lines: toLines(items),
      legal: {
        ...consent,
        waiverAccepted: consent.acknowledgedDatedService || consent.acknowledgedRetractation,
        waiverType: consent.acknowledgedDatedService ? 'service-dated' : 'none',
        acceptedAt: new Date().toISOString(),
      },
      preparedAt: new Date().toISOString(),
    });
    setPrepared(payload);
  };

  return (
    <section>
      <SectionHeader title="Checkout" subtitle="Préparation de la commande — le paiement sera activé au sprint R2B." />

      <Card>
        <h3>Récapitulatif</h3>
        {items.map((it) => {
          const slot = (it as ServiceCartItem).selectedSlot;
          return (
            <div key={it.lineId} style={{ padding: 'var(--bs-space-1) 0' }}>
              <strong>{it.name}</strong>
              {slot ? <span className="bs-note"> — {formatSlotLabel(slot.slotStart)}</span> : null}
            </div>
          );
        })}
        <p className="bs-note">Total indicatif : {formatPrice(summary.indicativeTotal)} (le serveur fait foi).</p>
      </Card>

      <div style={{ marginTop: 'var(--bs-space-3)' }}>
        <h3>Consentements</h3>
        <LegalConsentChecklist value={consent} onChange={setConsent} showDatedService={hasDatedService} />
      </div>

      <div style={{ marginTop: 'var(--bs-space-3)' }}>
        <Button type="button" onClick={onPrepare} disabled={!complete}>Préparer le paiement</Button>
        {!complete ? <p className="bs-note">Cochez les consentements requis pour continuer.</p> : null}
        <p className="bs-note">Le paiement (Stripe Checkout hébergé) sera activé au sprint R2B.</p>
      </div>

      {prepared ? (
        <details style={{ marginTop: 'var(--bs-space-3)' }}>
          <summary>Payload préparé (debug)</summary>
          <pre className="bs-debug">{JSON.stringify(prepared, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}
