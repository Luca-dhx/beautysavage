import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { SectionHeader, Card, Button, EmptyState, ErrorState, LoadingState } from '@bs/ui';
import {
  EMPTY_LEGAL_CONSENT,
  isLegalConsentComplete,
  buildServiceCheckoutState,
  buildIdempotencyKey,
  createCheckoutSession,
  finalizeFreeCheckout,
  formatPrice,
  ApiError,
  type LegalConsentState,
  type CheckoutLine,
} from '@bs/api-client';
import { resolveErrorUx } from '@bs/config';
import { useCart } from '../features/cart/CartProvider';
import { LegalConsentChecklist } from '../features/legal/LegalConsentChecklist';
import { formatSlotLabel } from '../features/booking/dateUtils';
import type { ServiceCartItem } from '../features/cart/cartTypes';

type Phase = 'idle' | 'submitting' | 'redirecting' | 'error' | 'login_required';

function toServiceLine(items: ReturnType<typeof useCart>['items']): CheckoutLine | null {
  const it = items.find((x) => x.kind === 'service' && (x as ServiceCartItem).selectedSlot) as
    | ServiceCartItem
    | undefined;
  if (!it || !it.selectedSlot) return null;
  return {
    kind: 'service',
    refId: it.refId,
    slug: it.slug,
    name: it.name,
    indicativePrice: it.indicativePrice,
    service: {
      serviceId: it.refId,
      slotStart: it.selectedSlot.slotStart,
      slotEnd: it.selectedSlot.slotEnd,
      practitionerId: it.selectedSlot.practitionerId,
      selectedOptions: it.selectedOptions ?? [],
    },
  };
}

export function CheckoutPage() {
  const { items, summary } = useCart();
  const navigate = useNavigate();
  const [consent, setConsent] = useState<LegalConsentState>(EMPTY_LEGAL_CONSENT);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorMsg, setErrorMsg] = useState<string>('');

  const hasDatedService = useMemo(
    () => items.some((it) => it.kind === 'service' && (it as ServiceCartItem).selectedSlot),
    [items],
  );
  const serviceLine = useMemo(() => toServiceLine(items), [items]);
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

  const onPay = async () => {
    if (!complete || !serviceLine) return;
    const checkoutState = buildServiceCheckoutState(serviceLine, consent);
    if (!checkoutState) {
      setPhase('error');
      setErrorMsg('Article non payable.');
      return;
    }
    setPhase('submitting');
    setErrorMsg('');
    try {
      const res = await createCheckoutSession(checkoutState);
      if (res.mode === 'hosted') {
        // Redirection vers Stripe Checkout hébergé (backend). AUCUN Stripe.js côté React.
        setPhase('redirecting');
        window.location.assign(res.url);
        return;
      }
      if (res.mode === 'free') {
        const idempotencyKey = buildIdempotencyKey(`${serviceLine.refId}${serviceLine.service?.slotStart ?? ''}`);
        const free = await finalizeFreeCheckout(checkoutState, idempotencyKey);
        navigate(`/paiement/succes?free=1&checkoutId=${encodeURIComponent(free.saleId)}`);
        return;
      }
      // mode 'elements' : le backend est en CHECKOUT_HOSTED=false → React ne gère pas Elements.
      setPhase('error');
      setErrorMsg('Le paiement hébergé n’est pas activé. Réessayez plus tard.');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setPhase('login_required');
        return;
      }
      const ux = err instanceof ApiError ? resolveErrorUx(err.code) : null;
      setPhase('error');
      setErrorMsg(ux?.message || (err instanceof ApiError ? err.message : 'Le paiement a échoué.'));
    }
  };

  return (
    <section>
      <SectionHeader title="Checkout" subtitle="Validez vos consentements puis procédez au paiement sécurisé." />

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

      {phase === 'login_required' ? (
        <div style={{ marginTop: 'var(--bs-space-3)' }}>
          <ErrorState title="Connexion requise pour payer." detail="Votre panier est conservé." />
          <Link className="bs-btn" to="/connexion?redirect=/checkout">Se connecter</Link>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div style={{ marginTop: 'var(--bs-space-3)' }}>
          <ErrorState title="Le paiement n’a pas pu démarrer." detail={errorMsg} />
        </div>
      ) : null}

      {phase === 'redirecting' ? <LoadingState label="Redirection vers le paiement sécurisé…" /> : null}

      <div style={{ marginTop: 'var(--bs-space-3)' }}>
        <Button
          type="button"
          onClick={() => void onPay()}
          disabled={!complete || !serviceLine || phase === 'submitting' || phase === 'redirecting'}
        >
          {phase === 'submitting' ? 'Préparation…' : 'Payer / Confirmer'}
        </Button>
        {!complete ? <p className="bs-note">Cochez les consentements requis pour continuer.</p> : null}
        {!serviceLine ? <p className="bs-note">Aucune prestation avec créneau dans le panier.</p> : null}
        <p className="bs-note">Paiement sécurisé via Stripe (page hébergée). Aucune donnée bancaire ne transite par ce site.</p>
      </div>
    </section>
  );
}
