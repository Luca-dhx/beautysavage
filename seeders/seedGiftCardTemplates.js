import GiftCardTemplate from '../models/GiftCardTemplate.js';

/**
 * M13 — Seed du template carte cadeau par défaut.
 *
 * Idempotent, safe à appeler à chaque boot :
 *  - si un template ACTIF existe déjà → no-op (on ne touche à rien) ;
 *  - sinon : crée (ou réutilise) le template système publié et l'active.
 *
 * Garantit la règle "impossible d'avoir zéro template actif" dès le premier démarrage.
 */

export const DEFAULT_GIFT_CARD_TEMPLATE_SLUG = 'classique';

const DEFAULT_HTML = `
<div class="bsgc-card">
  <div class="bsgc-card__head">
    <span class="bsgc-card__brand">{{instituteName}}</span>
    <span class="bsgc-card__pill">{{paymentLabel}}</span>
  </div>
  <div class="bsgc-card__amount">{{amount}}</div>
  <div class="bsgc-card__names">
    <p class="bsgc-card__to">Pour <strong>{{recipientName}}</strong></p>
    <p class="bsgc-card__from">De la part de {{purchaserName}}</p>
  </div>
  <p class="bsgc-card__message">{{message}}</p>
  <div class="bsgc-card__codes">
    <div class="bsgc-card__field"><span>Code</span><strong>{{code}}</strong></div>
    <div class="bsgc-card__field"><span>Mot de passe</span><strong>{{pin}}</strong></div>
  </div>
  <div class="bsgc-card__qr">{{qrCode}}</div>
  <div class="bsgc-card__foot">Émise le {{createdAt}}</div>
</div>
`.trim();

const DEFAULT_CSS = `
.bsgc-card {
  box-sizing: border-box;
  width: 420px;
  padding: 28px;
  border-radius: 18px;
  color: #ffffff;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  background: linear-gradient(135deg, #5f4ff7 0%, #f24692 100%);
}
.bsgc-card__head { display: flex; justify-content: space-between; align-items: center; }
.bsgc-card__brand { font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; font-size: 14px; }
.bsgc-card__pill { font-size: 11px; padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,0.22); }
.bsgc-card__amount { font-size: 46px; font-weight: 800; margin: 22px 0 6px; }
.bsgc-card__names p { margin: 2px 0; font-size: 14px; }
.bsgc-card__message { margin: 14px 0; font-size: 13px; opacity: 0.92; font-style: italic; min-height: 16px; }
.bsgc-card__codes { display: flex; gap: 14px; margin-top: 12px; }
.bsgc-card__field { background: rgba(255,255,255,0.16); border-radius: 10px; padding: 8px 12px; flex: 1; }
.bsgc-card__field span { display: block; font-size: 10px; text-transform: uppercase; opacity: 0.8; }
.bsgc-card__field strong { font-size: 16px; letter-spacing: 0.08em; }
.bsgc-card__qr { display: flex; justify-content: center; margin-top: 18px; }
.bsgc-card__qr img { background: #fff; padding: 8px; border-radius: 10px; width: 120px; height: 120px; }
.bsgc-card__foot { margin-top: 16px; font-size: 11px; opacity: 0.8; text-align: center; }
`.trim();

const DEFAULT_PREVIEW_DATA = {
  recipientName: 'Camille Martin',
  purchaserName: 'Léa Dubois',
  amount: '80,00 €',
  code: 'A3F2B9E1',
  pin: 'K7M2P9QXTV',
  message: 'Joyeux anniversaire ! Profite bien de ton moment beauté.',
  createdAt: '30/06/2026',
  paymentLabel: 'Paiement sur place',
  instituteName: 'Beauty Savage'
};

/**
 * @returns {Promise<{ seeded: boolean, activated: boolean, slug: string, reason?: string }>}
 */
export async function seedGiftCardTemplates() {
  // Idempotence : un actif existe déjà → rien à faire.
  const activeExists = await GiftCardTemplate.exists({ active: true });
  if (activeExists) {
    return { seeded: false, activated: false, slug: DEFAULT_GIFT_CARD_TEMPLATE_SLUG, reason: 'active_exists' };
  }

  // Réutilise le template système publié s'il existe (créé à un boot précédent), sinon crée-le.
  let template = await GiftCardTemplate.findOne({
    slug: DEFAULT_GIFT_CARD_TEMPLATE_SLUG,
    status: 'published'
  });
  let seeded = false;
  if (!template) {
    template = await GiftCardTemplate.create({
      name: 'Carte cadeau — Classique',
      slug: DEFAULT_GIFT_CARD_TEMPLATE_SLUG,
      html: DEFAULT_HTML,
      css: DEFAULT_CSS,
      previewData: DEFAULT_PREVIEW_DATA,
      visible: true,
      active: false,
      version: 1,
      status: 'published',
      publishedAt: new Date(),
      isSystemDefault: true,
      createdBy: 'system-seed',
      updatedBy: 'system-seed'
    });
    seeded = true;
  }

  // Active-le (aucun autre actif possible ici, le contrôle d'unicité passera).
  template.active = true;
  await template.save();

  return { seeded, activated: true, slug: DEFAULT_GIFT_CARD_TEMPLATE_SLUG };
}

export default seedGiftCardTemplates;
