import Stripe from 'stripe';
import { getCredential } from '../services/integratedApiCredentialService.js';

// Lazily-built, cached Stripe client for the Developer account (contract launch
// fees + monthly subscriptions). Distinct from the Institut client used for
// formation/product payments.
//
// The secret is sourced from the IntegratedApi vault (slug "stripe-dev",
// role "secret_key"), with the temporary .env fallback during migration. The
// Developer account is OPTIONAL: when no secret is available the getter returns
// null, preserving the historical `if (!stripeDevClient) ...` tolerance.

let cachedClient = null;
let cachedKey = null;

export async function getStripeDevClient() {
  let key = null;
  try {
    key = await getCredential('stripe-dev', { role: 'secret_key' });
  } catch (_err) {
    key = null; // no dev secret configured → optional client unavailable
  }

  if (!key) {
    cachedClient = null;
    cachedKey = null;
    return null;
  }

  if (cachedClient && cachedKey === key) return cachedClient;
  cachedClient = new Stripe(key, { apiVersion: '2024-06-20' });
  cachedKey = key;
  return cachedClient;
}

export default getStripeDevClient;
