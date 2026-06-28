import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRouter from './routers/authRouter.js';
import modeRouter from './routers/modeRouter.js';
import vitrineRouter from './routers/vitrineRouter.js';
import vitrineGestionRouter from './routers/vitrineGestionRouter.js';
import clientRouter from './routers/clientRouter.js';
import businessGestionRouter from './routers/businessGestionRouter.js';
import devRouter from './routers/devRouter.js';
import gestionUsersRouter from './routers/gestionUsersRouter.js';
import adminsRouter from './routers/adminsRouter.js';
import themeRouter from './routers/themeRouter.js';
import themePublicRouter from './routers/themePublicRouter.js';
import uiConfigRouter from './routers/uiConfigRouter.js';
import formationRouter from './routers/formationRouter.js';
import formationModuleRouter from './routers/formationModuleRouter.js';
import formationSessionRouter from './routers/formationSessionRouter.js';
import planningRouter from './routers/planningRouter.js';
import salesRouter from './routers/salesRouter.js';
import commissionRouter from './routers/commissionRouter.js';
import commissionPaymentRouter from './routers/commissionPaymentRouter.js';
import vitrineFormationSessionRouter from './routers/vitrineFormationSessionRouter.js';
import giftCardRouter from './routers/giftCardRouter.js';
import giftCardGestionRouter from './routers/gestionGiftCardRouter.js';
import promotionRouter from './routers/promotionRouter.js';
import boostRouter from './routers/boostRouter.js';
import clientManagementRouter from './routers/clientManagementRouter.js';
import socialRouter from './routers/socialRouter.js';
import mailTemplateRouter from './routers/mailTemplateRouter.js';
import passwordResetRouter from './routers/passwordResetRouter.js';
import invoiceRouter from './routers/invoiceRouter.js';
import notificationRouter from './routers/notificationRouter.js';
import { startCommissionReminderJob } from './automatisme/commissionReminderJob.js';
import { runBookingRemindersJob } from './automatisme/bookingRemindersJob.js';
import { runEmailTemplateCategoryMigration } from './automatisme/emailTemplateCategoryMigration.js';
import { runServicePagesMigration } from './automatisme/servicePagesMigration.js';
import { migrateRefundRequestedTemplate } from './automatisme/refundRequestedTemplateMigration.js';
import { runNotificationConfigMigration } from './automatisme/notificationConfigMigration.js';
import { validateCredentialVaultKey } from './utils/credentialVault.js';
import { seedIntegratedApisFromEnv } from './seeders/seedIntegratedApisFromEnv.js';
import brevoWebhookRouter from './routers/brevoWebhookRouter.js';
import communicationIdentityDevRouter from './routers/communicationIdentityDevRouter.js';
import communicationIdentityRouter from './routers/communicationIdentityRouter.js';
import devDiagnosticRouter from './routers/devDiagnosticRouter.js';
import { registerNotificationSubscribers, getSubscriberMode } from './subscribers/notificationEventSubscriber.js';
import { registerMailEventSubscribers } from './subscribers/mailEventSubscriber.js';
import { migrateEmailTemplatesToVersioning } from './scripts/migrateEmailTemplatesToVersioning.js';
import siteIdentityRouter from './routers/siteIdentityRouter.js';
import contractRouter from './routers/contractRouter.js';
import serviceRouter from './routers/serviceRouter.js';
import practitionerRouter from './routers/practitionerRouter.js';
import availabilityRouter from './routers/availabilityRouter.js';
import gestionBookingRouter from './routers/gestionBookingRouter.js';
import serviceSettingsRouter from './routers/serviceSettingsRouter.js';
import vitrineServiceRouter, { vitrineAvailabilityRouter } from './routers/vitrineServiceRouter.js';
import { handleDevWebhook } from './controllers/devWebhookController.js';
import { contractGuard } from './middlewares/contractGuard.js';
import gestionPagesRouter from './routers/gestionPagesRouter.js';
import homeSettingsRouter from './routers/homeSettingsRouter.js';
import {
  siteStatusPublicRouter,
  siteStatusGestionRouter
} from './routers/siteStatusRouter.js';
import { ensurePurchaseIndexes } from './models/Purchase.js';
import Invoice from './models/Invoice.js';
import ContractCheckoutIntent from './models/ContractCheckoutIntent.js';
import Contract from './models/Contract.js';
import CommissionPayment from './models/CommissionPayment.js';
import Service from './models/Service.js';
import ScheduleException from './models/ScheduleException.js';
import Sale from './models/Sale.js';
import RefundRequest from './models/RefundRequest.js';
import { REFUND_REQUEST_ACTIVE_UNIQUE_INDEX_NAME } from './constants/refundRequest.js';

import { startSessionCancellationAutoRefundScheduler } from './automatisme/sessionCancellationAutoRefundJob.js';
import { startRefundRecoveryScheduler } from './automatisme/refundRecoveryJob.js';
import { startContractPaymentSyncJob } from './automatisme/contractPaymentSyncJob.js';
import { startPendingPaymentCleanupJob } from './automatisme/pendingPaymentCleanupJob.js';
import { startGiftCardRecreditRecoveryScheduler } from './automatisme/giftCardRecreditRecoveryJob.js';
import {
  gestionRouter as editableContentGestionRouter,
  vitrineRouter as editableContentVitrineRouter
} from './routers/editableContentRouter.js';
import { requireAuth, getSessionSecret } from './utils/session.js';
import { requireMode } from './middlewares/modeGuard.js';
import { maintenanceGuard } from './middlewares/maintenanceGuard.js';
import { requireGestionRole } from './middlewares/gestionRoleGuard.js';
import stripeRouter from './routers/stripeRouter.js';
import {
  countPendingStripeFeesSales,
  listPendingStripeFeesSales,
  recoverStripeFeesAndUpdateSale,
  registerPendingStripeFeeCreatedListener
} from './services/stripe/stripeFeeService.js';
import { cleanupExpiredGiftCardReservations } from './services/giftCardReservationService.js';
import { getRefundByTrackingToken } from './controllers/salesController.js';
import { assertBusinessTimezone } from './constants/timezone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Sprint pré-React A2 — Garde fuseau métier. Logge le fuseau métier (Europe/Paris)
// vs le fuseau serveur détecté et avertit en cas de divergence. Hors test, force
// process.env.TZ=Europe/Paris dès le démarrage pour que les créneaux calendrier
// (construits en heure murale locale) soient toujours interprétés en Europe/Paris.
// En test, on NE force PAS (l'app est importée par supertest — voir constants/timezone.js).
assertBusinessTimezone({ force: process.env.NODE_ENV !== 'test' });

const app = express();
app.set('trust proxy', 1);
const STRIPE_FEES_RECOVERY_INTERVAL_MS = 10 * 60 * 1000;
const GIFT_CARD_RESERVATION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;
const GIFT_CARD_RESERVATION_MAX_AGE_MS = 2 * 60 * 60 * 1000;
let stripeFeesRecoveryInterval = null;
let stripeFeesRecoveryRunning = false;
let giftCardReservationCleanupInterval = null;
let giftCardReservationCleanupRunning = false;

function stopStripeFeesRecoveryScheduler(logMessage = '') {
  if (!stripeFeesRecoveryInterval) return;
  clearInterval(stripeFeesRecoveryInterval);
  stripeFeesRecoveryInterval = null;
  if (logMessage) {
    console.log(logMessage);
  }
}

async function runStripeFeesRecoveryCycle(trigger = 'interval') {
  if (stripeFeesRecoveryRunning) return;
  stripeFeesRecoveryRunning = true;
  try {
    const pendingSales = await listPendingStripeFeesSales(500);
    if (!pendingSales.length) {
      stopStripeFeesRecoveryScheduler('[Stripe Fees Job] Aucune vente en attente. Arret automatique.');
      return;
    }

    console.log(
      `[Stripe Fees Job] (${trigger}) Traitement de ${pendingSales.length} vente(s) en attente de frais Stripe.`
    );
    for (const sale of pendingSales) {
      const saleId = String(sale?.saleId || '').trim() || 'N/A';
      const paymentIntentId = String(sale?.stripePaymentIntentId || '').trim();
      if (!paymentIntentId) {
        console.log(`[Stripe Fees Job] ${saleId}: PaymentIntent absent, skip.`);
        continue;
      }
      try {
        const result = await recoverStripeFeesAndUpdateSale({
          paymentIntentId,
          saleId,
          attempts: 1,
          retryDelayMs: 0
        });
        if (result.updated) {
          console.log(
            `[Stripe Fees Job] ${saleId}: frais recuperes (fee=${result.fee}, net=${result.net}, currency=${result.currency}).`
          );
        } else {
          console.log(`[Stripe Fees Job] ${saleId}: donnees Stripe encore indisponibles.`);
        }
      } catch (error) {
        console.error(`[Stripe Fees Job] ${saleId}: echec recuperation frais Stripe`, error);
      }
    }

    const remaining = await countPendingStripeFeesSales();
    if (!remaining) {
      stopStripeFeesRecoveryScheduler('[Stripe Fees Job] Toutes les ventes en attente ont ete traitees.');
      return;
    }
    console.log(`[Stripe Fees Job] ${remaining} vente(s) toujours en attente.`);
  } catch (error) {
    console.error('[Stripe Fees Job] Erreur cycle de recuperation', error);
  } finally {
    stripeFeesRecoveryRunning = false;
  }
}

function startStripeFeesRecoveryScheduler(trigger = 'startup') {
  if (stripeFeesRecoveryInterval) {
    void runStripeFeesRecoveryCycle(trigger);
    return;
  }
  console.log(`[Stripe Fees Job] Demarrage scheduler (intervalle 10 min, trigger=${trigger}).`);
  stripeFeesRecoveryInterval = setInterval(() => {
    void runStripeFeesRecoveryCycle('interval');
  }, STRIPE_FEES_RECOVERY_INTERVAL_MS);
  void runStripeFeesRecoveryCycle(trigger);
}

async function runGiftCardReservationCleanupCycle(trigger = 'interval') {
  if (giftCardReservationCleanupRunning) return;
  giftCardReservationCleanupRunning = true;
  try {
    const result = await cleanupExpiredGiftCardReservations({
      olderThanMs: GIFT_CARD_RESERVATION_MAX_AGE_MS
    });
    if (result.modifiedCards > 0) {
      console.log(
        `[GiftCard Reservations Job] (${trigger}) ${result.modifiedCards} carte(s) nettoyee(s), cutoff=${result.cutoff?.toISOString?.() || 'n/a'}.`
      );
      return;
    }
    if (result.matchedCards > 0) {
      console.log(
        `[GiftCard Reservations Job] (${trigger}) ${result.matchedCards} carte(s) ciblees, aucune modif appliquee.`
      );
      return;
    }
    console.log(`[GiftCard Reservations Job] (${trigger}) Aucune reservation expiree.`);
  } catch (error) {
    console.error('[GiftCard Reservations Job] Erreur nettoyage reservations expirees', error);
  } finally {
    giftCardReservationCleanupRunning = false;
  }
}

function startGiftCardReservationCleanupScheduler(trigger = 'startup') {
  if (giftCardReservationCleanupInterval) {
    void runGiftCardReservationCleanupCycle(trigger);
    return;
  }
  console.log(
    `[GiftCard Reservations Job] Demarrage scheduler (intervalle 60 min, trigger=${trigger}).`
  );
  giftCardReservationCleanupInterval = setInterval(() => {
    void runGiftCardReservationCleanupCycle('interval');
  }, GIFT_CARD_RESERVATION_CLEANUP_INTERVAL_MS);
  void runGiftCardReservationCleanupCycle(trigger);
}

registerPendingStripeFeeCreatedListener(() => {
  startStripeFeesRecoveryScheduler('new-pending-sale');
});

const cspOptions = {
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", 'https://cdn.tailwindcss.com', 'https://js.stripe.com', 'https://cdn.jsdelivr.net'],
    styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    fontSrc: ["'self'", 'https:', 'data:'],
    connectSrc: ["'self'", 'https:', 'https://api.stripe.com'],
    frameAncestors: ["'self'"],
    frameSrc: ["'self'", 'https://www.youtube.com', 'https://youtube.com', 'https://youtu.be', 'https://js.stripe.com']
  }
};

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: cspOptions
}));
app.use(morgan('dev'));

// Cookie parser must run before protected Stripe routes (requireAuth)
// and Stripe router must stay before express.json() for webhook raw body.
const sessionSecret = getSessionSecret();
app.use(cookieParser(sessionSecret));

// Developer webhook must be mounted before stripeRouter AND express.json() (raw body required for signature verification)
app.post(
  '/api/stripe/dev-webhook',
  express.raw({ type: 'application/json' }),
  handleDevWebhook
);

app.use('/api/stripe', stripeRouter);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

function isStaticNavigation(req) {
  const path = req.path || '';
  return (
    req.method === 'GET' &&
    (path === '/' ||
      path === '/vitrine.html' ||
      path.startsWith('/js/') ||
      path.startsWith('/css/') ||
      path.startsWith('/images/') ||
      path.startsWith('/fonts/'))
  );
}

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  skip: isStaticNavigation,
  handler(req, res) {
    const info = req.rateLimit || {};
    const sessionId = req.sessionUserId || (req.cookies?.beautysavage_session || 'anonymous');
    console.warn('[RATE LIMIT] 429', {
      route: `${req.method} ${req.originalUrl}`,
      limiter: 'global',
      ip: req.ip,
      session: sessionId,
      current: info.current,
      limit: info.limit,
      resetAt: info.resetTime
    });
    return res.status(429).json({ ok: false, error: 'Trop de requêtes. Merci de réessayer plus tard.' });
  }
});
app.use(limiter);
app.use(maintenanceGuard());
app.post('/admin-login', (_req, res) => res.redirect(303, '/admin-login'));
app.use(contractGuard());

const mongoURI = process.env.MONGODB_URI;
if (!mongoURI) {
  console.error('MONGODB_URI manquant dans .env');
  process.exit(1);
}
mongoose.set('strictQuery', true);
// Credential vault key check (blocks boot in production if absent/invalid).
validateCredentialVaultKey();
await mongoose.connect(mongoURI, { dbName: 'beautysavage-database' });
await ensurePurchaseIndexes();
await runEmailTemplateCategoryMigration();
await runServicePagesMigration();
await migrateRefundRequestedTemplate();
await runNotificationConfigMigration();
await Invoice.syncIndexes();
// Drop legacy non-sparse indexes on ContractCheckoutIntent before syncIndexes
for (const idx of ['stripePaymentIntentId_1', 'stripeSetupIntentId_1']) {
  try { await ContractCheckoutIntent.collection.dropIndex(idx); } catch (_) {}
}
await ContractCheckoutIntent.syncIndexes();
console.log('[DB] ContractCheckoutIntent indexes synchronized');
// Sync Contract indexes (drops any stale legacy indexes)
try { await Contract.collection.dropIndex('contractId_1'); } catch (_) {}
await Contract.syncIndexes();
console.log('[DB] Contract indexes synchronized');
await CommissionPayment.syncIndexes();
console.log('[DB] CommissionPayment indexes synchronized');
await Service.syncIndexes();
console.log('[DB] Service indexes synchronized');
// Phase 1B-1: deterministically ensure the unique partial index on
// Sale.stripePaymentIntentId (one sale per Stripe PaymentIntent). Targeted
// createIndex (not syncIndexes) to avoid touching unrelated legacy index defs.
// Guarded: if legacy data already contains duplicate PaymentIntent ids, log a
// remediation message instead of crashing the boot (the runtime findOne guard +
// webhook E11000 handling still apply; the unique index activates once resolved).
try {
  await Sale.collection.createIndex(
    { stripePaymentIntentId: 1 },
    {
      unique: true,
      name: 'uniq_stripe_payment_intent',
      partialFilterExpression: { stripePaymentIntentId: { $type: 'string' } }
    }
  );
  console.log('[DB] Sale.stripePaymentIntentId unique partial index ensured');
} catch (saleIndexError) {
  console.error(
    '[DB] Could not build the unique stripePaymentIntentId index — likely pre-existing ' +
      'duplicate PaymentIntent ids. Resolve duplicate sales then restart to enforce it.',
    saleIndexError?.message || saleIndexError
  );
}
try {
  await RefundRequest.collection.createIndex(
    { saleId: 1, itemId: 1, itemType: 1 },
    {
      unique: true,
      name: REFUND_REQUEST_ACTIVE_UNIQUE_INDEX_NAME,
      partialFilterExpression: {
        status: { $in: ['requested', 'pending', 'succeeded'] }
      }
    }
  );
  console.log('[DB] RefundRequest active sale+item unique partial index ensured');
} catch (refundIndexError) {
  console.error(
    '[DB] Could not build the unique active RefundRequest index - likely pre-existing ' +
      'duplicate active refunds. Resolve legacy duplicates then restart to enforce it.',
    refundIndexError?.message || refundIndexError
  );
}
// Drop non-unique legacy index on ScheduleException before adding unique one
try { await ScheduleException.collection.dropIndex('practitionerId_1_date_1'); } catch (_) {}
await ScheduleException.syncIndexes();
console.log('[DB] ScheduleException indexes synchronized');
console.log('MongoDB connectee');

app.use('/auth', authRouter);
app.use('/auth/password-reset', passwordResetRouter);
app.use('/api/mode', modeRouter);
app.use('/api/vitrine', vitrineRouter);
app.get('/api/refund-tracking/:token', getRefundByTrackingToken);
app.use('/api/webhooks/brevo', brevoWebhookRouter);
app.use('/api/gestion/pages-gestion', gestionPagesRouter);
app.use('/api/gestion', requireGestionRole());
// M1 — Identités de communication (mont AVANT le routeur /dev générique pour la spécificité du chemin).
app.use('/api/gestion/dev/communication-identities', communicationIdentityDevRouter);
app.use('/api/gestion/communication-identities', communicationIdentityRouter);
app.use('/api/gestion/dev', devDiagnosticRouter);
app.use('/api/gestion/vitrine', vitrineGestionRouter);
app.use('/api/gestion/business', businessGestionRouter);
app.use('/api/client', clientRouter);
app.use('/api/dev', devRouter);
app.use('/api/gestion/users', gestionUsersRouter);
app.use('/api/gestion/admins', adminsRouter);
app.use('/api/gestion/themes', themeRouter);
app.use('/api/gestion/ui-config', uiConfigRouter);
app.use('/api/gestion/formations', formationRouter);
app.use('/api/gestion', formationModuleRouter);
app.use('/api/gestion', formationSessionRouter);
app.use('/api/gestion', planningRouter);
app.use('/api/gestion', salesRouter);
app.use('/api/gestion', commissionRouter);
app.use('/api/gestion/promotions', promotionRouter);
app.use('/api/vitrine/formations', vitrineFormationSessionRouter);
app.use('/api/client/gift-cards', giftCardRouter);
app.use('/api/gestion/gift-cards', giftCardGestionRouter);
app.use('/api/gestion/boosts', boostRouter);
app.use('/api/gestion/clients', clientManagementRouter);
app.use('/api/gestion/social-links', socialRouter);
app.use('/api/gestion/mails', mailTemplateRouter);
app.use('/api/gestion/site-identity', siteIdentityRouter);
app.use('/api/gestion/home-settings', homeSettingsRouter);
app.use('/api/contract', contractRouter);
app.use('/api/commissions', commissionPaymentRouter);
app.use('/api/site-status', siteStatusPublicRouter);
app.use('/api/theme', themePublicRouter);
app.use('/api/gestion/site-status', siteStatusGestionRouter);
app.use('/api/gestion/editable-content', editableContentGestionRouter);
app.use('/api/vitrine/editable-content', editableContentVitrineRouter);
app.use('/api/gestion/services', serviceRouter);
app.use('/api/gestion/practitioners', practitionerRouter);
app.use('/api/gestion/availability', availabilityRouter);
app.use('/api/gestion', gestionBookingRouter);
app.use('/api/gestion/service-settings', serviceSettingsRouter);
app.use('/api/gestion/notifications', notificationRouter);
app.use('/api/vitrine/availability', vitrineAvailabilityRouter);
app.use('/api/vitrine/services', vitrineServiceRouter);

app.get(
  '/gestion.html',
  requireAuth({ redirectToLogin: true }),
  requireMode('gestion'),
  (req, res, next) => {
    const role = String(req.sessionUser?.role || '').trim().toLowerCase();
    if (role !== 'admin' && role !== 'dev') {
      return res.redirect('/vitrine.html');
    }
    return next();
  },
  (_req, _res, next) => next()
);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/reset-password', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'reset-password.html'))
);

app.get('/login', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/admin-login', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'admin-login.html'))
);
app.get('/maintenance', (_req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'maintenance.html'))
);

app.use('/', invoiceRouter);
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => res.redirect('/vitrine.html'));

// Test harness: in NODE_ENV==='test' (vitest), skip background schedulers and the
// HTTP listener so the Express app can be imported by supertest with no open
// handles or side effects. Business logic is unchanged — only startup side
// effects are gated behind this flag. The app instance is exported below.
if (process.env.NODE_ENV !== 'test') {
  // Pre-seed the credential vault from .env (idempotent). On failure, the app
  // keeps working via the temporary .env fallback (ALLOW_ENV_CREDENTIAL_FALLBACK).
  try {
    await seedIntegratedApisFromEnv();
  } catch (seedError) {
    console.error('[seed] IntegratedApi vault seed failed (continuing with .env fallback):', seedError?.message || seedError);
  }
  // Phase 5A: normalise EmailTemplate docs to the versioned model (idempotent,
  // content untouched). loadTemplate also tolerates un-migrated docs.
  try {
    const tplMigration = await migrateEmailTemplatesToVersioning({ apply: true });
    console.log('[boot] EmailTemplate versioning migration:', JSON.stringify(tplMigration));
  } catch (tplError) {
    console.error('[boot] EmailTemplate versioning migration failed:', tplError?.message || tplError);
  }
  // Phase 4D/4E: EventBus -> Notification subscribers. Mode off|shadow|active via
  // EVENT_NOTIFICATION_SUBSCRIBER_MODE (default off; legacy alias
  // ENABLE_EVENT_NOTIFICATION_SUBSCRIBERS=true => active). In-app only; the direct
  // triggerNotification() calls remain during the transition.
  const subscriberMode = getSubscriberMode();
  if (subscriberMode !== 'off') {
    registerNotificationSubscribers();
    console.log(`[boot] Notification event subscribers registered (mode=${subscriberMode}).`);
  }
  // M2 — Mail event dispatch (no-op tant que MAIL_ROLE_RESOLVER_ENABLED=false ; shadow ensuite).
  registerMailEventSubscribers();
  await startSessionCancellationAutoRefundScheduler();
startCommissionReminderJob();
// Booking reminders — check every hour
setInterval(() => { void runBookingRemindersJob(); }, 3600000);
void runBookingRemindersJob();
startRefundRecoveryScheduler('startup');
startStripeFeesRecoveryScheduler('startup');
startGiftCardReservationCleanupScheduler('startup');
startContractPaymentSyncJob();
startPendingPaymentCleanupJob();
startGiftCardRecreditRecoveryScheduler();

const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Serveur demarre http://localhost:${PORT}`);
  const ngrokDomain = process.env.NGROK_DOMAIN;
  if (ngrokDomain) {
    console.log(`\u{1F517} Stripe Institut webhook : https://${ngrokDomain}/api/stripe/webhook`);
    console.log('\u{1F449} Colle cette URL dans ton dashboard Stripe Institut');
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  STRIPE DEV WEBHOOK — Evenements a configurer');
    console.log(`  URL : https://${ngrokDomain}/api/stripe/dev-webhook`);
    console.log('═══════════════════════════════════════════════════════');
    console.log('  payment_intent.succeeded       -> Frais lancement payes');
    console.log('  setup_intent.succeeded         -> Souscription mensualite');
    console.log('  invoice.payment_succeeded      -> Mensualite payee -> contrat actif');
    console.log('  invoice.payment_failed         -> Echec paiement mensuel');
    console.log('  customer.subscription.updated  -> Mise a jour periode');
    console.log('  customer.subscription.deleted  -> Resiliation -> contrat annule');
    console.log('═══════════════════════════════════════════════════════');
  } else {
      console.warn('[Stripe] NGROK_DOMAIN non defini dans .env — webhooks Stripe non configures');
    }
  });
}

export default app;
