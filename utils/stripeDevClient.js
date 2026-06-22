import Stripe from 'stripe';

const key = process.env.STRIPE_DEV_SECRET_KEY;
if (!key) {
  console.warn(
    '[stripeDevClient] STRIPE_DEV_SECRET_KEY manquant dans .env — le client Stripe Developer ne pourra pas etre utilise.'
  );
}

// Client Stripe dédié au compte Developer (frais de lancement + mensualités).
// Distinct du client Stripe Institut utilisé pour les paiements formations/produits.
const stripeDevClient = key ? new Stripe(key, { apiVersion: '2024-06-20' }) : null;

export default stripeDevClient;
