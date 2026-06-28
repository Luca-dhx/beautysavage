// services/checkout/unified/unifiedCheckoutConfig.js
// Sprint U2 — Feature flag du checkout Stripe HÉBERGÉ. Lu à l'exécution (jamais caché) pour
// permettre un rollback immédiat. `false` (défaut) ⇒ Stripe Elements actuel inchangé.

export function isCheckoutHostedEnabled() {
  return String(process.env.CHECKOUT_HOSTED || '').trim().toLowerCase() === 'true';
}
