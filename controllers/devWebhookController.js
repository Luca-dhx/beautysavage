import Stripe from 'stripe';

import Contract from '../models/Contract.js';
import ContractCheckoutIntent from '../models/ContractCheckoutIntent.js';
import stripeDevClient from '../utils/stripeDevClient.js';
import { invalidateContractCache } from '../middlewares/contractGuard.js';

const STRIPE_DEV_WEBHOOK_SECRET = process.env.STRIPE_DEV_WEBHOOK_SECRET;

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handlePaymentIntentSucceeded(paymentIntent) {
  const piId = paymentIntent.id;

  const intent = await ContractCheckoutIntent.findOne({
    stripePaymentIntentId: piId,
    type: 'launch',
    processed: false
  });

  if (!intent) {
    console.log(`[DevWebhook] payment_intent.succeeded: intent introuvable ou déjà traité (${piId})`);
    return;
  }

  const contract = await Contract.findById(intent.contractId);
  if (!contract) {
    console.warn(`[DevWebhook] Contrat introuvable pour intent ${piId}`);
    return;
  }

  contract.launchFee.paid = true;

  await contract.save();
  intent.processed = true;
  await intent.save();
}

async function handleSetupIntentSucceeded(setupIntent) {
  const siId = setupIntent.id;
  const customerId = setupIntent.customer;
  const paymentMethodId = setupIntent.payment_method;

  const intent = await ContractCheckoutIntent.findOne({
    stripeSetupIntentId: siId,
    type: 'monthly',
    processed: false
  });

  if (!intent) {
    console.log(`[DevWebhook] setup_intent.succeeded: intent introuvable ou déjà traité (${siId})`);
    return;
  }

  const contract = await Contract.findById(intent.contractId);
  if (!contract) {
    console.warn(`[DevWebhook] Contrat introuvable pour setup intent ${siId}`);
    return;
  }

  if (!stripeDevClient) {
    console.error('[DevWebhook] stripeDevClient non disponible.');
    return;
  }

  // Build subscription with immediate first invoice
  const amountCents = Math.round(
    Number(contract.monthlyFee?.amount || 0) *
    (1 + Number(contract.monthlyFee?.taxRate || 0)) *
    100
  );

  try {
    // Attach payment method to customer
    await stripeDevClient.paymentMethods.attach(paymentMethodId, {
      customer: customerId
    });
    await stripeDevClient.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId }
    });

    // Étape 1 — Créer un Price inline (price_data.product_data non supporté dans subscriptions.create)
    const price = await stripeDevClient.prices.create({
      currency: 'eur',
      unit_amount: Math.round(
        contract.monthlyFee.amount * (1 + contract.monthlyFee.taxRate) * 100
      ),
      recurring: { interval: 'month' },
      product_data: {
        name: 'Maintenance Beauty Savage'
      }
    });

    // Étape 2 — Créer la Subscription avec le Price créé
    const subscription = await stripeDevClient.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      default_payment_method: paymentMethodId,
      expand: ['latest_invoice.payment_intent'],
      metadata: { contractId: String(contract._id) }
    });

    contract.monthlyFee.stripeSubscriptionId = subscription.id;
    contract.monthlyFee.stripeCustomerId = customerId;

    const latestInvoice = subscription.latest_invoice;
    if (latestInvoice?.payment_intent) {
      contract.monthlyFee.pendingPaymentIntentId = latestInvoice.payment_intent.id;
      contract.monthlyFee.pendingClientSecret = latestInvoice.payment_intent.client_secret;
    }

    if (subscription.current_period_end) {
      contract.monthlyFee.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    }

    await contract.save();
    intent.processed = true;
    await intent.save();

    console.log(`[DevWebhook] Abonnement ${subscription.id} créé pour contrat ${contract._id}.`);
  } catch (error) {
    console.error('[DevWebhook] Erreur création abonnement', error);
  }
}

async function handleInvoicePaymentSucceeded(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const contract = await Contract.findOne({
    'monthlyFee.stripeSubscriptionId': subscriptionId
  });

  if (!contract) {
    console.log(`[DevWebhook] invoice.payment_succeeded: contrat introuvable pour sub ${subscriptionId}`);
    return;
  }

  if (contract.status === 'cancelled') {
    console.log(`[DevWebhook] invoice.payment_succeeded: contrat ${contract._id} annulé, invoice ignorée.`);
    return;
  }

  contract.monthlyFee.active = true;
  contract.monthlyFee.stripeSubscriptionId = subscriptionId;
  contract.monthlyFee.pendingPaymentIntentId = null;
  contract.monthlyFee.pendingClientSecret = null;

  if (invoice.period_end) {
    contract.monthlyFee.currentPeriodEnd = new Date(invoice.period_end * 1000);
  }

  await contract.save();
}

async function handleInvoicePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  console.warn(`[DevWebhook] invoice.payment_failed pour abonnement ${subscriptionId || 'inconnu'}`);
}

async function handleSubscriptionUpdated(subscription) {
  const contract = await Contract.findOne({
    'monthlyFee.stripeSubscriptionId': subscription.id
  });

  if (!contract) return;

  if (subscription.current_period_end) {
    contract.monthlyFee.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
    await contract.save();
    console.log(`[DevWebhook] currentPeriodEnd mis à jour pour contrat ${contract._id}.`);
  }
}

async function handleSubscriptionDeleted(subscription) {
  const contract = await Contract.findOne({
    'monthlyFee.stripeSubscriptionId': subscription.id
  });

  if (!contract) return;

  contract.status = 'cancelled';
  contract.cancelledAt = new Date();
  contract.monthlyFee.active = false;
  await contract.save();

  invalidateContractCache();
  console.log(`[DevWebhook] Contrat ${contract._id} annulé via customer.subscription.deleted.`);
}

// ---------------------------------------------------------------------------
// Main webhook handler
// ---------------------------------------------------------------------------
export async function handleDevWebhook(req, res) {
  const sig = req.headers['stripe-signature'];

  if (!STRIPE_DEV_WEBHOOK_SECRET) {
    console.error('[DevWebhook] STRIPE_DEV_WEBHOOK_SECRET manquant.');
    return res.status(500).json({ ok: false, error: 'Webhook secret manquant.' });
  }

  if (!stripeDevClient) {
    console.error('[DevWebhook] stripeDevClient non disponible.');
    return res.status(500).json({ ok: false, error: 'Client Stripe Developer non configuré.' });
  }

  let event;
  try {
    event = stripeDevClient.webhooks.constructEvent(req.body, sig, STRIPE_DEV_WEBHOOK_SECRET);
  } catch (error) {
    console.error('[DevWebhook] Signature invalide', error.message);
    return res.status(400).json({ ok: false, error: `Webhook signature invalide: ${error.message}` });
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(event.data.object);
        break;
      case 'setup_intent.succeeded':
        await handleSetupIntentSucceeded(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      default:
        // Ignore unhandled events
        break;
    }
    return res.json({ received: true });
  } catch (error) {
    console.error('[DevWebhook] Erreur traitement event', event?.type, error);
    return res.status(500).json({ ok: false, error: 'Erreur traitement webhook.' });
  }
}
