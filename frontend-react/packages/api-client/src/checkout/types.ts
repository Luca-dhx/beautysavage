// Types paiement (R2B). AUCUNE logique Stripe ; le backend reste source de vérité.
import type { MoneyAmount, DateIso } from '../types';
import type { SelectedServiceOption } from '../booking/types';

/** checkoutState envoyé DIRECTEMENT à create-checkout-session (mirroir du Vanilla). */
export interface ServiceCheckoutState {
  item: { type: 'service'; id: string; name?: string };
  service: {
    serviceId: string;
    practitionerId: string | null;
    slotStart: string;
    slotEnd: string;
    selectedOptions?: SelectedServiceOption[];
  };
  legal: {
    acceptedCgv: boolean;
    waiverAccepted?: boolean;
    waiverText?: string;
  };
  origin?: { slug: string; query?: Record<string, unknown> };
}

/** Réponse create-checkout-session selon le flag backend CHECKOUT_HOSTED. */
export type CreateCheckoutSessionResponse =
  | { ok: true; mode: 'hosted'; url: string; checkoutId?: string }
  | { ok: true; mode: 'free'; checkoutId?: string; requiresPayment: false }
  // flag OFF (Elements) — non consommé par React (pas de Stripe.js) ; détecté pour message clair.
  | { ok: true; mode: 'elements'; clientSecret: string; returnUrl?: string };

export interface FinalizeFreeResponse {
  ok: true;
  saleId: string;
  idempotent?: boolean;
}

export type PaymentResultStatus = 'succeeded' | 'pending' | 'failed';

export interface PaymentResultPurchase {
  saleId?: string;
  paymentIntentId?: string;
  itemTitle?: string;
  type?: string;
  totalAmount?: MoneyAmount;
  purchasedAt?: DateIso | null;
}

export interface PaymentResultResponse {
  ok: true;
  status: PaymentResultStatus;
  purchase?: PaymentResultPurchase;
  errorMessage?: string;
  origin?: { slug: string; query?: Record<string, unknown> } | null;
}

/** Réponse brute de session-status (backend) + statut paiement dérivé pour l'UI. */
export interface CheckoutSessionStatus {
  /** Statut normalisé pour l'UI (dérivé de payment_status). */
  status: PaymentResultStatus | 'unknown';
  /** Statut Stripe PaymentIntent brut (succeeded/processing/canceled/...). */
  paymentStatus: string;
}
