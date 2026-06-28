import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card, LoadingState } from '@bs/ui';
import { getPaymentResult, type PaymentResultResponse } from '@bs/api-client';

// Page de retour succès. Wording PRUDENT : ne jamais prétendre une finalisation si le webhook est
// encore en attente. Lit les query params : free=1 (flow gratuit React) | payment_intent_id (hosted).
export function PaymentSuccessPage() {
  const [params] = useSearchParams();
  const isFree = params.get('free') === '1';
  const paymentIntentId = params.get('payment_intent_id') || params.get('payment_intent') || '';
  const [result, setResult] = useState<PaymentResultResponse | null>(null);
  const [loading, setLoading] = useState(Boolean(paymentIntentId));
  const [failedLookup, setFailedLookup] = useState(false);

  useEffect(() => {
    if (!paymentIntentId) return;
    let active = true;
    setLoading(true);
    getPaymentResult(paymentIntentId)
      .then((r) => { if (active) setResult(r); })
      .catch(() => { if (active) setFailedLookup(true); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [paymentIntentId]);

  let title = 'Paiement reçu, confirmation en cours.';
  let detail = 'Vous recevrez la confirmation par e-mail dès que votre paiement sera validé.';

  if (isFree) {
    title = 'Commande confirmée.';
    detail = 'Votre commande (gratuite) a été finalisée.';
  } else if (result?.status === 'succeeded') {
    title = 'Paiement confirmé.';
    detail = result.purchase?.itemTitle ? `Merci pour votre achat : ${result.purchase.itemTitle}.` : 'Merci pour votre achat.';
  } else if (result?.status === 'failed') {
    title = 'Le paiement a échoué.';
    detail = result.errorMessage || 'Aucun montant n’a été débité. Vous pouvez réessayer.';
  } else if (result?.status === 'pending') {
    title = 'Paiement reçu, confirmation en cours.';
    detail = 'La validation finale est en cours (webhook). Cela peut prendre quelques instants.';
  } else if (failedLookup) {
    title = 'Paiement reçu, confirmation en cours.';
    detail = 'Nous n’avons pas pu vérifier le statut immédiatement ; la confirmation suivra par e-mail.';
  }

  return (
    <section>
      {loading ? (
        <LoadingState label="Vérification du paiement…" />
      ) : (
        <Card>
          <h1>{title}</h1>
          <p>{detail}</p>
          <p style={{ display: 'flex', gap: 'var(--bs-space-2)', flexWrap: 'wrap' }}>
            <Link className="bs-btn" to="/">Retour à l’accueil</Link>
            <Link className="bs-btn bs-btn--secondary" to="/prestations">Voir les prestations</Link>
          </p>
        </Card>
      )}
    </section>
  );
}
