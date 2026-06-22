import { showToast } from '../helpers/toastService.js';
import { requestVitrineNavigation } from './vitrineNavigationHelper.js';
import {
  ACQUISITION_PAGES,
  incrementAcquisitionNotifications
} from './acquisitionNotificationService.js';
import { PAW_ICON_SVG } from '../ui/pawIcon.js';

const PAYMENT_RESULT_ENDPOINT = '/api/stripe/payment-result';
const POLL_INTERVAL_MS = 2000;
const MAX_PENDING_POLLS = 10;
const PROCESSED_INTENTS_KEY = 'beautysavage_payment_result_processed';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0,00 EUR';
  return `${amount.toFixed(2).replace('.', ',')} EUR`;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function readProcessedIntents() {
  try {
    const raw = window.sessionStorage.getItem(PROCESSED_INTENTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_error) {
    return {};
  }
}

function saveProcessedIntent(paymentIntentId) {
  if (!paymentIntentId) return;
  const snapshot = readProcessedIntents();
  snapshot[paymentIntentId] = true;
  try {
    window.sessionStorage.setItem(PROCESSED_INTENTS_KEY, JSON.stringify(snapshot));
  } catch (_error) {
    // no-op
  }
}

function isIntentAlreadyProcessed(paymentIntentId) {
  if (!paymentIntentId) return false;
  return Boolean(readProcessedIntents()[paymentIntentId]);
}

function incrementNotificationFromPurchase(purchase = {}, paymentIntentId = '') {
  if (!paymentIntentId || isIntentAlreadyProcessed(paymentIntentId)) return;
  const normalizedType = String(purchase?.type || '').trim().toLowerCase();
  if (normalizedType === 'formation') {
    incrementAcquisitionNotifications(ACQUISITION_PAGES.MY_FORMATIONS, 1);
  } else if (normalizedType === 'gift-card' || normalizedType === 'giftcard') {
    incrementAcquisitionNotifications(ACQUISITION_PAGES.MY_GIFT_CARDS, 1);
  }
  saveProcessedIntent(paymentIntentId);
}

async function fetchPaymentResult(paymentIntentId) {
  const response = await fetch(
    `${PAYMENT_RESULT_ENDPOINT}?payment_intent_id=${encodeURIComponent(paymentIntentId)}`,
    { credentials: 'include' }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error || 'Impossible de verifier le paiement.');
    error.status = response.status;
    throw error;
  }
  return payload;
}

function launchConfetti(root) {
  if (!root) return;
  const layer = root.querySelector('[data-payment-result-confetti]');
  if (!layer) return;
  layer.innerHTML = '';
  const colors = [
    'var(--color-primary)',
    'var(--color-secondary)',
    'var(--theme-accent)',
    'var(--theme-accent-strong)',
    'var(--color-text)'
  ];
  for (let i = 0; i < 36; i += 1) {
    const piece = document.createElement('span');
    piece.className = 'payment-result__confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 0.28}s`;
    piece.style.setProperty('--pr-rotate', `${Math.floor(Math.random() * 380 - 190)}deg`);
    piece.style.setProperty('--pr-drift', `${Math.floor(Math.random() * 220 - 110)}px`);
    layer.appendChild(piece);
  }
  window.setTimeout(() => {
    if (layer.isConnected) {
      layer.innerHTML = '';
    }
  }, 2600);
}

function renderLoading(container, attempt = 0) {
  container.innerHTML = `
    <section class="payment-result payment-result--pending" data-payment-result-root>
      <article class="payment-result__panel">
        <div class="payment-result__icon-wrap" aria-hidden="true">
          <div class="gcg-inline-loader checkoutp-inline-loader payment-result__loader">
            <div class="gcg-inline-loader__paws">
              <span class="gcg-inline-loader__paw">${PAW_ICON_SVG}</span>
              <span class="gcg-inline-loader__paw gcg-inline-loader__paw--delay">${PAW_ICON_SVG}</span>
              <span class="gcg-inline-loader__paw gcg-inline-loader__paw--delay-2">${PAW_ICON_SVG}</span>
            </div>
          </div>
        </div>
        <h2 class="payment-result__title">Verification du paiement</h2>
        <p class="payment-result__text">
          Nous confirmons votre achat de facon securisee...
        </p>
        <p class="payment-result__hint">Tentative ${attempt + 1} / ${MAX_PENDING_POLLS + 1}</p>
      </article>
    </section>
  `;
}

function buildSummaryMarkup(purchase = {}) {
  const title = String(purchase?.formationTitle || purchase?.itemTitle || 'Votre achat').trim();
  const type = String(purchase?.type || '').trim().toLowerCase();
  const typeLabel = type === 'formation' ? 'Formation' : type === 'gift-card' ? 'Carte cadeau' : 'Achat';
  const sessionDate = formatDate(purchase?.sessionDate);
  return `
    <div class="payment-result__summary">
      <p><strong>${escapeHtml(typeLabel)}</strong> : ${escapeHtml(title || 'Article')}</p>
      ${
        sessionDate
          ? `<p><strong>Date</strong> : ${escapeHtml(sessionDate)}</p>`
          : ''
      }
      <p><strong>Montant</strong> : ${escapeHtml(formatPrice(purchase?.totalAmount || 0))}</p>
    </div>
  `;
}

function renderSuccess(container, payload = {}, paymentIntentId = '') {
  const purchase = payload?.purchase || {};
  const purchaseType = String(purchase?.type || '').trim().toLowerCase();
  const primaryTarget = purchaseType === 'gift-card' ? 'my-gift-cards' : 'myformations';
  const successText =
    purchaseType === 'gift-card'
      ? 'Votre carte cadeau est creee et disponible dans votre espace.'
      : 'Votre achat est valide. Tout est pret.';
  container.innerHTML = `
    <section class="payment-result payment-result--success" data-payment-result-root>
      <div class="payment-result__confetti" data-payment-result-confetti aria-hidden="true"></div>
      <article class="payment-result__panel payment-result__panel--fade-in">
        <div class="payment-result__icon-wrap" aria-hidden="true">
          <svg viewBox="0 0 80 80" class="payment-result__icon payment-result__icon--success">
            <circle cx="40" cy="40" r="34" class="payment-result__circle"></circle>
            <path d="M23 42 L35 54 L58 30" class="payment-result__check"></path>
          </svg>
        </div>
        <h2 class="payment-result__title">Paiement confirme</h2>
        <p class="payment-result__text">${escapeHtml(successText)}</p>
        ${buildSummaryMarkup(purchase)}
        <div class="payment-result__actions">
          <button type="button" class="primary-button" data-payment-result-primary>
            ${primaryTarget === 'my-gift-cards' ? 'Acceder a mes cartes cadeaux' : 'Acceder a ma formation'}
          </button>
          <button type="button" class="secondary-button" data-payment-result-secondary>
            Retour a l'accueil
          </button>
        </div>
      </article>
    </section>
  `;
  incrementNotificationFromPurchase(purchase, paymentIntentId);
  launchConfetti(container.querySelector('[data-payment-result-root]'));
  const primary = container.querySelector('[data-payment-result-primary]');
  const secondary = container.querySelector('[data-payment-result-secondary]');
  primary?.addEventListener('click', () => {
    requestVitrineNavigation(primaryTarget, {
      source: 'payment-result-success-primary',
      skipThrottle: true
    });
  });
  secondary?.addEventListener('click', () => {
    requestVitrineNavigation('home', {
      source: 'payment-result-success-secondary',
      skipThrottle: true
    });
  });
}

function renderFailed(container, payload = {}, fallbackMessage = '') {
  const message = String(payload?.errorMessage || fallbackMessage || '').trim() ||
    'Le paiement n a pas pu etre finalise. Aucun debit n a ete confirme.';
  const retryOrigin = payload?.origin && typeof payload.origin === 'object' ? payload.origin : null;
  container.innerHTML = `
    <section class="payment-result payment-result--failed" data-payment-result-root>
      <article class="payment-result__panel payment-result__panel--shake">
        <div class="payment-result__icon-wrap" aria-hidden="true">
          <svg viewBox="0 0 80 80" class="payment-result__icon payment-result__icon--failed">
            <circle cx="40" cy="40" r="34" class="payment-result__circle"></circle>
            <path d="M28 28 L52 52 M52 28 L28 52" class="payment-result__cross"></path>
          </svg>
        </div>
        <h2 class="payment-result__title">Paiement refuse</h2>
        <p class="payment-result__text">${escapeHtml(message)}</p>
        <div class="payment-result__actions">
          <button type="button" class="primary-button" data-payment-result-retry>
            Reessayer le paiement
          </button>
          <button type="button" class="secondary-button" data-payment-result-support>
            Contacter le support
          </button>
        </div>
      </article>
    </section>
  `;
  container.querySelector('[data-payment-result-retry]')?.addEventListener('click', () => {
    if (retryOrigin?.slug) {
      return requestVitrineNavigation(retryOrigin.slug, {
        source: 'payment-result-failed-retry',
        skipThrottle: true,
        query: retryOrigin.query || {}
      });
    }
    return requestVitrineNavigation('checkout', {
      source: 'payment-result-failed-retry-fallback',
      skipThrottle: true
    });
  });
  container.querySelector('[data-payment-result-support]')?.addEventListener('click', () => {
    window.location.href = 'mailto:support@beautysavage.fr?subject=Assistance%20paiement';
  });
}

function renderDelayedConfirmation(container) {
  const delayedMessage =
    "La confirmation de votre paiement prend plus de temps que prevu. Verifiez dans quelques minutes dans 'Mes formations' si votre achat apparait. Si vous avez ete debite sans recevoir votre formation, contactez le support.";
  container.innerHTML = `
    <section class="payment-result payment-result--pending" data-payment-result-root>
      <article class="payment-result__panel payment-result__panel--fade-in">
        <div class="payment-result__icon-wrap" aria-hidden="true">
          <div class="gcg-inline-loader checkoutp-inline-loader payment-result__loader">
            <div class="gcg-inline-loader__paws">
              <span class="gcg-inline-loader__paw">${PAW_ICON_SVG}</span>
              <span class="gcg-inline-loader__paw gcg-inline-loader__paw--delay">${PAW_ICON_SVG}</span>
              <span class="gcg-inline-loader__paw gcg-inline-loader__paw--delay-2">${PAW_ICON_SVG}</span>
            </div>
          </div>
        </div>
        <h2 class="payment-result__title">Confirmation en attente</h2>
        <p class="payment-result__text">${escapeHtml(delayedMessage)}</p>
        <div class="payment-result__actions">
          <button type="button" class="primary-button" data-payment-result-myformations>Mes formations</button>
          <button type="button" class="secondary-button" data-payment-result-support-delay>Contacter le support</button>
          <button type="button" class="secondary-button" data-payment-result-home-delay>Retour a l'accueil</button>
        </div>
      </article>
    </section>
  `;
  container.querySelector('[data-payment-result-myformations]')?.addEventListener('click', () => {
    requestVitrineNavigation('myformations', {
      source: 'payment-result-delayed-myformations',
      skipThrottle: true
    });
  });
  container.querySelector('[data-payment-result-support-delay]')?.addEventListener('click', () => {
    window.location.href = 'mailto:support@beautysavage.fr?subject=Assistance%20paiement';
  });
  container.querySelector('[data-payment-result-home-delay]')?.addEventListener('click', () => {
    requestVitrineNavigation('home', {
      source: 'payment-result-delayed-home',
      skipThrottle: true
    });
  });
}

function renderMissingIntent(container) {
  container.innerHTML = `
    <section class="payment-result payment-result--failed">
      <article class="payment-result__panel">
        <h2 class="payment-result__title">Paiement introuvable</h2>
        <p class="payment-result__text">Aucun identifiant de paiement n a ete detecte.</p>
        <div class="payment-result__actions">
          <button type="button" class="primary-button" data-payment-result-home>Retour a l'accueil</button>
        </div>
      </article>
    </section>
  `;
  container.querySelector('[data-payment-result-home]')?.addEventListener('click', () => {
    requestVitrineNavigation('home', {
      source: 'payment-result-missing-home',
      skipThrottle: true
    });
  });
}

export async function renderPage(container, context = {}) {
  if (!container) return;
  const params = new URLSearchParams(window.location.search);
  const contextQuery = context?.query || {};
  const paymentIntentId = String(
    contextQuery.payment_intent || params.get('payment_intent') || ''
  ).trim();
  const redirectStatus = String(
    contextQuery.redirect_status || params.get('redirect_status') || ''
  )
    .trim()
    .toLowerCase();
  if (!paymentIntentId) {
    renderMissingIntent(container);
    return;
  }
  const hasExplicitRedirectFailure = redirectStatus === 'failed';

  if (hasExplicitRedirectFailure) {
    let failurePayload = {};
    try {
      failurePayload = await fetchPaymentResult(paymentIntentId);
    } catch (error) {
      console.error('[PaymentResultModule] Erreur verification echec redirect_status=failed', error);
      failurePayload = {};
    }
    renderFailed(container, failurePayload);
    showToast({ type: 'error', message: 'Paiement refuse', durationMs: 1200 });
    return;
  }

  let latestPayload = null;
  for (let attempt = 0; attempt <= MAX_PENDING_POLLS; attempt += 1) {
    renderLoading(container, attempt);
    try {
      latestPayload = await fetchPaymentResult(paymentIntentId);
    } catch (error) {
      console.error('[PaymentResultModule] Erreur verification paiement', error);
      renderDelayedConfirmation(container);
      showToast({ type: 'info', message: 'Confirmation en attente', durationMs: 1200 });
      return;
    }

    if (latestPayload?.status === 'succeeded') {
      renderSuccess(container, latestPayload, paymentIntentId);
      showToast({ type: 'success', message: 'Paiement confirme', durationMs: 1200 });
      return;
    }
    if (latestPayload?.status === 'failed') {
      renderDelayedConfirmation(container);
      showToast({ type: 'info', message: 'Confirmation en attente', durationMs: 1200 });
      return;
    }
    if (attempt < MAX_PENDING_POLLS) {
      await wait(POLL_INTERVAL_MS);
    }
  }

  renderDelayedConfirmation(container);
  showToast({ type: 'info', message: 'Confirmation en attente', durationMs: 1200 });
}
