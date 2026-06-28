// Lecture du résultat de paiement. GET /api/stripe/payment-result?payment_intent_id=pi_...
import { apiFetch } from '../apiFetch';
import type { PaymentResultResponse } from './types';

export async function getPaymentResult(
  paymentIntentId: string,
  signal?: AbortSignal,
): Promise<PaymentResultResponse> {
  return apiFetch<PaymentResultResponse>('/api/stripe/payment-result', {
    params: { payment_intent_id: paymentIntentId },
    signal,
  });
}
