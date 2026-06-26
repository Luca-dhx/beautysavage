import crypto from 'node:crypto';
import EmailTemplate from '../models/EmailTemplate.js';

import Theme from '../models/Theme.js';

import Sale from '../models/Sale.js';

import { sanitizeEditorialHtml } from './editableContentService.js';

import { getAppBaseUrl } from '../utils/invoiceUrl.js';
import { getCredential } from './integratedApiCredentialService.js';
import { createQueuedSendLog, markSendLogSent, markSendLogFailed } from './sendLogService.js';



const MAIL_THEME = Object.freeze({
  surfaceHeader: '#201535',
  accent: '#7c3aed',
  accentStrong: '#f24692',
  surface: '#ffffff',
  text: '#0f172a',
  muted: '#5b6475',
  border: '#e7def8',
  soft: '#faf7ff',
  softAlt: '#fff4fb',
  white: '#ffffff',
  dark: '#140d24'
});

function joinHtml(parts = []) {
  return parts.filter(Boolean).join('');
}

function buildThemeStyle(property, fallback, token, cssVarName = '') {
  void cssVarName;
  return `${property}:${fallback};${property}:{{${token}}};`;
}

function buildTextParagraphs(paragraphs = []) {
  return paragraphs
    .filter(Boolean)
    .map(paragraph => `<p>${paragraph}</p>`)
    .join('');
}

function buildTextDetailLines(items = []) {
  return items
    .filter(item => item?.label && item?.value !== undefined && item?.value !== null && item?.value !== '')
    .map(item => `<p><strong>${item.label} :</strong> ${item.value}</p>`)
    .join('');
}

function buildPremiumParagraphs(paragraphs = []) {
  return paragraphs
    .filter(Boolean)
    .map(
      paragraph => `<p style="margin:0 0 16px;font-size:16px;line-height:1.72;color:${MAIL_THEME.text};${buildThemeStyle('color', MAIL_THEME.text, 'colortext', 'color-text')}">${paragraph}</p>`
    )
    .join('');
}

function buildPremiumDetailRows(items = []) {
  const rows = items
    .filter(item => item?.label && item?.value !== undefined && item?.value !== null && item?.value !== '')
    .map(
      item => `<tr>
        <td style="padding:0 0 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
            <tr>
              <td style="padding:18px 20px;border:1px solid ${MAIL_THEME.border};border-radius:18px;background:${MAIL_THEME.soft};">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${MAIL_THEME.accentStrong};${buildThemeStyle('color', MAIL_THEME.accentStrong, 'themeaccentstrong', 'theme-accent-strong')}font-weight:700;">${item.label}</p>
                <p style="margin:0;font-size:16px;line-height:1.55;color:${MAIL_THEME.text};${buildThemeStyle('color', MAIL_THEME.text, 'colortext', 'color-text')}font-weight:600;">${item.value}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    )
    .join('');

  if (!rows) return '';

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 24px;">${rows}</table>`;
}

function buildPremiumCallout({ label = '', content = '', tone = 'default' } = {}) {
  if (!content) return '';

  const tones = {
    default: {
      background: MAIL_THEME.soft,
      border: MAIL_THEME.accent,
      label: MAIL_THEME.accentStrong
    },
    accent: {
      background: MAIL_THEME.softAlt,
      border: MAIL_THEME.accent,
      label: MAIL_THEME.accentStrong
    },
    warning: {
      background: '#fff7ed',
      border: '#f59e0b',
      label: '#b45309'
    },
    danger: {
      background: '#fff1f2',
      border: '#e11d48',
      label: '#be123c'
    },
    success: {
      background: '#ecfdf3',
      border: '#16a34a',
      label: '#15803d'
    }
  };

  const palette = tones[tone] || tones.default;

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 24px;">
    <tr>
      <td style="padding:18px 20px;border:1px solid ${palette.border};border-radius:20px;background:${palette.background};">
        ${label
          ? `<p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:${palette.label};font-weight:700;">${label}</p>`
          : ''}
        <div style="font-size:15px;line-height:1.7;color:${MAIL_THEME.text};${buildThemeStyle('color', MAIL_THEME.text, 'colortext', 'color-text')}">${content}</div>
      </td>
    </tr>
  </table>`;
}

function buildPremiumButton({ label = '', url = '' } = {}) {
  if (!label || !url) return '';

  return `<table role="presentation" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:0 0 28px;">
    <tr>
      <td align="center" style="border-radius:999px;background:${MAIL_THEME.accent};${buildThemeStyle('background', MAIL_THEME.accent, 'themeaccent', 'theme-accent')}">
        <a href="${url}" style="display:inline-block;padding:15px 28px;border-radius:999px;background:${MAIL_THEME.accent};${buildThemeStyle('background', MAIL_THEME.accent, 'themeaccent', 'theme-accent')}color:${MAIL_THEME.white};${buildThemeStyle('color', MAIL_THEME.white, 'colorsurface', 'color-surface')}text-decoration:none;font-size:15px;font-weight:700;letter-spacing:0.02em;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`;
}

function buildPremiumMailTemplate({
  siteName = 'Beauty Savage',
  eyebrow = '',
  title = '',
  intro = '',
  paragraphs = [],
  detailItems = [],
  callout = null,
  cta = null,
  footnote = '',
  signature = ''
} = {}) {
  const currentYear = new Date().getFullYear();

  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:0;${buildThemeStyle('background', MAIL_THEME.surface, 'colorsurface', 'color-surface')}font-family:Inter,Segoe UI,Arial,sans-serif;color:${MAIL_THEME.text};${buildThemeStyle('color', MAIL_THEME.text, 'colortext', 'color-text')}">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${title}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;${buildThemeStyle('background', MAIL_THEME.surface, 'colorsurface', 'color-surface')}">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;max-width:680px;">
            <tr>
              <td style="padding:0 0 16px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="height:8px;border-radius:999px 0 0 999px;background:${MAIL_THEME.accentStrong};${buildThemeStyle('background', MAIL_THEME.accentStrong, 'themeaccentstrong', 'theme-accent-strong')}font-size:0;line-height:0;">&nbsp;</td>
                    <td style="width:28%;height:8px;border-radius:0 999px 999px 0;background:${MAIL_THEME.accent};${buildThemeStyle('background', MAIL_THEME.accent, 'themeaccent', 'theme-accent')}font-size:0;line-height:0;">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="border-radius:28px;border:1px solid ${MAIL_THEME.border};background:${MAIL_THEME.surface};${buildThemeStyle('background', MAIL_THEME.surface, 'colorsurface', 'color-surface')}box-shadow:0 24px 50px rgba(15,23,42,0.08);overflow:hidden;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:28px 28px 18px;background:${MAIL_THEME.surfaceHeader};${buildThemeStyle('background', MAIL_THEME.surfaceHeader, 'themesurfaceheader', 'theme-surface-header')}color:${MAIL_THEME.text};${buildThemeStyle('color', MAIL_THEME.text, 'colortext', 'color-text')}">
                      <p style="margin:0 0 10px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:${MAIL_THEME.text};${buildThemeStyle('color', MAIL_THEME.text, 'colortext', 'color-text')}opacity:0.74;">${siteName}</p>
                      ${eyebrow
                        ? `<p style="margin:0 0 10px;font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:${MAIL_THEME.accent};${buildThemeStyle('color', MAIL_THEME.accent, 'themeaccent', 'theme-accent')}font-weight:700;">${eyebrow}</p>`
                        : ''}
                      <h1 style="margin:0;font-size:31px;line-height:1.14;color:${MAIL_THEME.accentStrong};${buildThemeStyle('color', MAIL_THEME.accentStrong, 'themeaccentstrong', 'theme-accent-strong')}font-weight:700;">${title}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:30px 28px 28px;">
                      ${intro
                        ? `<p style="margin:0 0 18px;font-size:17px;line-height:1.7;color:${MAIL_THEME.text};${buildThemeStyle('color', MAIL_THEME.text, 'colortext', 'color-text')}font-weight:600;">${intro}</p>`
                        : ''}
                      ${buildPremiumParagraphs(paragraphs)}
                      ${buildPremiumDetailRows(detailItems)}
                      ${callout ? buildPremiumCallout(callout) : ''}
                      ${cta ? buildPremiumButton(cta) : ''}
                      ${footnote
                        ? `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:${MAIL_THEME.muted};">${footnote}</p>`
                        : ''}
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:12px;">
                        <tr>
                          <td style="padding-top:18px;border-top:1px solid ${MAIL_THEME.border};font-size:13px;line-height:1.7;color:${MAIL_THEME.muted};">
                            ${signature || siteName}<br />
                            ${currentYear}
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function createMailTemplateDefinition({
  subject,
  siteName = 'Beauty Savage',
  eyebrow = '',
  title = '',
  intro = '',
  paragraphs = [],
  detailItems = [],
  callout = null,
  cta = null,
  footnote = '',
  signature = ''
} = {}) {
  return {
    subject,
    bodyHtml: joinHtml([
      intro ? `<p>${intro}</p>` : '',
      buildTextParagraphs(paragraphs),
      buildTextDetailLines(detailItems),
      cta?.url ? `<p><a href="${cta.url}">${cta.label || 'Ouvrir le lien'}</a></p>` : '',
      footnote ? `<p>${footnote}</p>` : '',
      `<p>${signature || siteName}</p>`
    ]),
    fullHtml: buildPremiumMailTemplate({
      siteName,
      eyebrow,
      title,
      intro,
      paragraphs,
      detailItems,
      callout,
      cta,
      footnote,
      signature
    }),
    mode: 'html'
  };
}

// Guardrail: keep HTML/mail templates in template literals (`...`) only.
const TEMPLATE_FUNCTIONS = {
  vente: createMailTemplateDefinition({
    subject: 'Confirmation de votre achat chez Beauty Savage',
    siteName: 'Beauty Savage',
    eyebrow: 'Commande confirmée',
    title: 'Votre achat est validé',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      `Merci pour votre confiance. Votre commande <strong>{{saleId}}</strong> a bien été enregistrée pour un montant de <strong>{{amount}} EUR</strong>.`,
      'Votre facture reste disponible à tout moment depuis le bouton ci-dessous.'
    ],
    detailItems: [
      { label: 'ID vente', value: '{{saleId}}' },
      { label: 'Montant payé', value: '{{amount}} EUR' }
    ],
    callout: {
      label: 'Facture',
      content: "Le document téléchargé constitue votre justificatif d'achat."
    },
    cta: {
      label: 'Télécharger la facture',
      url: '{{invoiceDownloadUrl}}'
    },
    footnote: "Si vous avez besoin d'un accompagnement complémentaire, notre équipe reste disponible.",
    signature: "L'équipe Beauty Savage"
  }),
  password_reset: createMailTemplateDefinition({
    subject: 'Réinitialisez votre mot de passe Beauty Savage',
    siteName: 'Beauty Savage',
    eyebrow: 'Sécurité du compte',
    title: 'Réinitialisez votre mot de passe',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      'Nous avons reçu une demande de réinitialisation pour votre compte Beauty Savage.',
      'Utilisez le lien sécurisé ci-dessous pour définir un nouveau mot de passe.'
    ],
    callout: {
      label: 'Important',
      content: "Le lien expire dans 30 minutes. Si vous n'avez pas demandé cette action, ignorez simplement cet email.",
      tone: 'warning'
    },
    cta: {
      label: 'Réinitialiser le mot de passe',
      url: '{{link}}'
    },
    signature: "L'équipe Beauty Savage"
  }),
  commission_available: createMailTemplateDefinition({
    subject: 'Commissions {{period}} — paiement disponible',
    siteName: 'Beauty Savage',
    eyebrow: 'Commissions',
    title: 'Les commissions {{period}} sont disponibles',
    intro: 'Bonjour,',
    paragraphs: [
      'Les commissions du mois de <strong>{{period}}</strong> sont maintenant disponibles au règlement sur la plateforme.',
      'Vous disposez de <strong>{{daysTotal}} jours</strong> pour effectuer le paiement.'
    ],
    detailItems: [
      { label: 'Période', value: '{{period}}' },
      { label: 'Montant à régler', value: '{{amount}} EUR' },
      { label: 'Délai de paiement', value: '{{daysTotal}} jours' }
    ],
    cta: {
      label: 'Régler les commissions',
      url: '{{platformUrl}}'
    },
    footnote: 'Passé ce délai, le paiement sera considéré en retard.',
    signature: "L'équipe Beauty Savage"
  }),
  commission_reminder: createMailTemplateDefinition({
    subject: 'Rappel — commissions {{period}} : {{daysLeft}} jour(s) restant(s)',
    siteName: 'Beauty Savage',
    eyebrow: 'Rappel de paiement',
    title: 'Rappel : commissions {{period}} en attente',
    intro: 'Bonjour,',
    paragraphs: [
      'Les commissions du mois de <strong>{{period}}</strong> n\'ont pas encore été réglées.',
      'Il vous reste <strong>{{daysLeft}} jour(s)</strong> pour effectuer le paiement avant qu\'il soit considéré en retard.'
    ],
    detailItems: [
      { label: 'Période', value: '{{period}}' },
      { label: 'Montant à régler', value: '{{amount}} EUR' },
      { label: 'Jours restants', value: '{{daysLeft}} jour(s)' }
    ],
    callout: {
      label: 'Action requise',
      content: 'Connectez-vous à la plateforme de gestion pour procéder au règlement.',
      tone: 'warning'
    },
    cta: {
      label: 'Régler maintenant',
      url: '{{platformUrl}}'
    },
    signature: "L'équipe Beauty Savage"
  }),
  commission_last_day: createMailTemplateDefinition({
    subject: '⚠ Dernier jour — commissions {{period}} à régler aujourd\'hui',
    siteName: 'Beauty Savage',
    eyebrow: 'Dernier rappel',
    title: 'Dernier jour pour régler les commissions {{period}}',
    intro: 'Bonjour,',
    paragraphs: [
      'C\'est le <strong>dernier jour</strong> pour régler les commissions du mois de <strong>{{period}}</strong>.',
      'Passé aujourd\'hui, le paiement sera automatiquement marqué en retard.'
    ],
    detailItems: [
      { label: 'Période', value: '{{period}}' },
      { label: 'Montant à régler', value: '{{amount}} EUR' }
    ],
    callout: {
      label: 'Urgent',
      content: 'Le paiement doit être effectué avant minuit ce soir.',
      tone: 'danger'
    },
    cta: {
      label: 'Régler immédiatement',
      url: '{{platformUrl}}'
    },
    signature: "L'équipe Beauty Savage"
  }),
  site_suspended: createMailTemplateDefinition({
    subject: 'Site suspendu temporairement',
    siteName: 'Beauty Savage',
    eyebrow: 'Statut plateforme',
    title: 'Le site est temporairement suspendu',
    intro: 'Bonjour,',
    paragraphs: [
      'Le site a été suspendu temporairement par le développeur.',
      'Une nouvelle notification vous sera envoyée dès que la plateforme sera réactivée.'
    ],
    detailItems: [
      { label: 'Motif', value: '{{reason}}' },
      { label: 'Date', value: '{{date}}' }
    ],
    callout: {
      label: 'Information',
      content: 'Les parcours clients et achats restent indisponibles tant que la suspension est active.',
      tone: 'danger'
    }
  }),
  site_reactivated: createMailTemplateDefinition({
    subject: 'Site réactivé',
    siteName: 'Beauty Savage',
    eyebrow: 'Statut plateforme',
    title: 'Le site est de nouveau actif',
    intro: 'Bonjour,',
    paragraphs: [
      'La plateforme a été réactivée et les achats sont de nouveau disponibles.'
    ],
    detailItems: [{ label: 'Date', value: '{{date}}' }],
    callout: {
      label: 'Reprise',
      content: "Vous pouvez reprendre l'activité habituelle sur la vitrine et la gestion.",
      tone: 'success'
    }
  }),
  site_maintenance_start: createMailTemplateDefinition({
    subject: 'Maintenance du site démarrée',
    siteName: 'Beauty Savage',
    eyebrow: 'Maintenance',
    title: 'La maintenance a commencé',
    intro: 'Bonjour,',
    paragraphs: [
      "Le site est actuellement en maintenance. Les équipes techniques sont en cours d'intervention."
    ],
    detailItems: [
      { label: 'Motif', value: '{{reason}}' },
      { label: 'Durée estimée', value: '{{eta}}' },
      { label: 'Début', value: '{{startedAt}}' },
      { label: 'Notification', value: '{{date}}' }
    ],
    callout: {
      label: 'Suivi',
      content: "Une notification vous sera envoyée à la fin de l'intervention.",
      tone: 'warning'
    }
  }),
  site_maintenance_end: createMailTemplateDefinition({
    subject: 'Maintenance du site terminée',
    siteName: 'Beauty Savage',
    eyebrow: 'Maintenance',
    title: 'La maintenance est terminée',
    intro: 'Bonjour,',
    paragraphs: [
      'La maintenance est finalisée et le site est de nouveau disponible.'
    ],
    detailItems: [
      { label: 'Motif', value: '{{reason}}' },
      { label: 'Durée estimée', value: '{{eta}}' },
      { label: 'Début', value: '{{startedAt}}' },
      { label: 'Date de fin', value: '{{date}}' }
    ],
    callout: {
      label: 'Disponibilité',
      content: 'Les accès clients et administrateurs peuvent reprendre normalement.',
      tone: 'success'
    }
  }),
  email_confirmation_code: createMailTemplateDefinition({
    subject: 'Confirmez votre email Beauty Savage',
    siteName: 'Beauty Savage',
    eyebrow: 'Vérification email',
    title: 'Confirmez votre adresse email',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      "Utilisez le code ci-dessous pour confirmer l'adresse email associée à votre compte."
    ],
    detailItems: [
      { label: 'Code', value: '{{code}}' },
      { label: 'Email', value: '{{email}}' }
    ],
    callout: {
      label: 'Validité',
      content: "Ce code reste valable pendant {{expiresMinutes}} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email."
    },
    signature: "L'équipe Beauty Savage"
  }),
  session_cancelled_choice: createMailTemplateDefinition({
    subject: '{{siteName}} | Votre session a été annulée',
    siteName: '{{siteName}}',
    eyebrow: 'Session présentielle',
    title: 'Votre session a été annulée',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      `L'institut a annulé votre session pour <strong>{{formationTitle}}</strong>.`,
      'Vous pouvez choisir une nouvelle session ou demander un remboursement depuis le lien sécurisé ci-dessous.'
    ],
    detailItems: [
      { label: 'Formation', value: '{{formationTitle}}' },
      { label: 'Date session', value: '{{sessionDateLabel}}' },
      { label: 'Horaires', value: '{{sessionTimeLabel}}' }
    ],
    callout: {
      label: 'Délai de réponse',
      content: 'Le lien reste actif pendant 7 jours. Passé ce délai, il devient invalide.',
      tone: 'accent'
    },
    cta: {
      label: 'Choisir une option',
      url: '{{actionUrl}}'
    },
    footnote: '{{reason}}',
    signature: '{{siteName}}'
  }),
  formation_deleted_choice: createMailTemplateDefinition({
    subject: '{{siteName}} | Formation supprimée : choisissez votre option',
    siteName: '{{siteName}}',
    eyebrow: 'Formation présentielle',
    title: 'La formation a été supprimée',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      `L'institut a supprimé la formation <strong>{{formationTitle}}</strong>.`,
      'Vous pouvez choisir entre un remboursement et une carte cadeau du montant payé.'
    ],
    detailItems: [
      { label: 'Formation', value: '{{formationTitle}}' },
      { label: 'Montant payé', value: '{{amountPaid}} EUR' },
      { label: 'ID vente', value: '{{saleId}}' }
    ],
    callout: {
      label: 'Délai de réponse',
      content: 'Le lien reste actif 7 jours. Sans action de votre part, un remboursement sera lancé automatiquement.',
      tone: 'accent'
    },
    cta: {
      label: 'Choisir remboursement ou carte cadeau',
      url: '{{actionUrl}}'
    },
    footnote: '{{reason}}',
    signature: '{{siteName}}'
  }),
  session_updated_choice: createMailTemplateDefinition({
    subject: '{{siteName}} | Votre session a été modifiée',
    siteName: '{{siteName}}',
    eyebrow: 'Session présentielle',
    title: 'Votre session a été modifiée',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      `L'institut a modifié votre session pour <strong>{{formationTitle}}</strong>.`,
      'Vous pouvez confirmer votre présence, décaler votre réservation ou demander un remboursement.'
    ],
    detailItems: [
      { label: 'Formation', value: '{{formationTitle}}' },
      { label: 'Nouvelle date', value: '{{sessionDateLabel}}' },
      { label: 'Nouveaux horaires', value: '{{sessionTimeLabel}}' },
      { label: 'ID vente', value: '{{saleId}}' }
    ],
    callout: {
      label: 'Délai de réponse',
      content: 'Sans réponse sous 7 jours, un remboursement sera lancé automatiquement et le lien deviendra invalide.',
      tone: 'warning'
    },
    cta: {
      label: 'Choisir une option',
      url: '{{actionUrl}}'
    },
    footnote: '{{reason}}',
    signature: '{{siteName}}'
  }),
  service_booking_cancelled_choice: createMailTemplateDefinition({
    subject: '{{siteName}} | Votre réservation a été annulée — {{serviceName}}',
    siteName: '{{siteName}}',
    eyebrow: 'Prestation annulée',
    title: 'Votre réservation a été annulée',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      `L'institut a annulé votre réservation pour <strong>{{serviceName}}</strong> prévue le <strong>{{bookingDate}}</strong> à <strong>{{bookingTime}}</strong>.`,
      'Vous pouvez choisir un nouveau créneau ou demander un remboursement via le lien sécurisé ci-dessous.'
    ],
    detailItems: [
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Date', value: '{{bookingDate}}' },
      { label: 'Horaire', value: '{{bookingTime}}' }
    ],
    callout: {
      label: 'Délai de réponse',
      content: 'Le lien reste actif pendant {{autoRefundDays}} jours. Sans action de votre part, un remboursement sera lancé automatiquement.',
      tone: 'accent'
    },
    cta: {
      label: 'Choisir une option',
      url: '{{actionUrl}}'
    },
    signature: '{{siteName}}'
  }),
  service_booking_rescheduled_admin: createMailTemplateDefinition({
    subject: 'Report de réservation — {{serviceName}}',
    siteName: '{{siteName}}',
    eyebrow: 'Report de réservation',
    title: 'Un client a reporté sa réservation',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      `Le client <strong>{{clientName}}</strong> ({{clientEmail}}) a choisi un nouveau créneau pour <strong>{{serviceName}}</strong>.`
    ],
    detailItems: [
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Ancien créneau', value: '{{oldBookingDate}} à {{oldBookingTime}}' },
      { label: 'Nouveau créneau', value: '{{newBookingDate}} à {{newBookingTime}}' },
      { label: 'Client', value: '{{clientName}} — {{clientEmail}}' }
    ],
    callout: {
      label: 'Information',
      content: 'Le nouveau créneau a été automatiquement confirmé.',
      tone: 'accent'
    },
    signature: '{{siteName}}'
  }),
  session_rescheduled: createMailTemplateDefinition({
    subject: 'Nouvelle session confirmée - {{formationTitle}}',
    siteName: '{{siteName}}',
    eyebrow: 'Confirmation',
    title: 'Votre nouvelle session est confirmée',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      `Votre nouvelle session pour <strong>{{formationTitle}}</strong> est maintenant confirmée.`
    ],
    detailItems: [
      { label: 'Formation', value: '{{formationTitle}}' },
      { label: 'Date session', value: '{{sessionDateLabel}}' },
      { label: 'Horaires', value: '{{sessionTimeLabel}}' },
      { label: 'ID vente', value: '{{saleId}}' }
    ],
    callout: {
      label: 'Présence',
      content: 'Conservez cet email comme récapitulatif de votre réservation mise à jour.',
      tone: 'success'
    },
    signature: '{{siteName}}'
  }),
  session_client_cancelled_refund: createMailTemplateDefinition({
    subject: 'Annulation de session prise en compte - remboursement en cours',
    siteName: '{{siteName}}',
    eyebrow: 'Annulation client',
    title: 'Votre annulation est prise en compte',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      `Votre annulation pour <strong>{{formationTitle}}</strong> a bien été enregistrée.`,
      'Votre remboursement suit maintenant son circuit habituel de traitement.'
    ],
    detailItems: [
      { label: 'Session', value: '{{sessionDateLabel}} - {{sessionTimeLabel}}' },
      { label: 'Montant payé', value: '{{amountPaid}} EUR' },
      { label: 'Montant remboursé', value: '{{refundAmount}} EUR' },
      { label: 'Statut remboursement', value: '{{refundStatus}}' },
      { label: 'ID vente', value: '{{saleId}}' }
    ],
    cta: { label: 'Suivre mon remboursement', url: '{{trackingUrl}}' },
    callout: {
      label: 'CGV',
      content: 'Cette annulation reste éligible au remboursement selon les conditions en vigueur.',
      tone: 'success'
    },
    footnote: 'Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur : <a href="{{trackingUrl}}">{{trackingUrl}}</a>',
    signature: '{{siteName}}'
  }),
  session_client_cancelled_no_refund: createMailTemplateDefinition({
    subject: 'Annulation de session prise en compte - sans remboursement',
    siteName: '{{siteName}}',
    eyebrow: 'Annulation client',
    title: 'Votre annulation est prise en compte',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      `Votre annulation pour <strong>{{formationTitle}}</strong> a bien été enregistrée.`,
      "Conformément aux CGV, aucun remboursement ne s'applique sur cette annulation."
    ],
    detailItems: [
      { label: 'Session', value: '{{sessionDateLabel}} - {{sessionTimeLabel}}' },
      { label: 'Montant payé', value: '{{amountPaid}} EUR' },
      { label: 'ID vente', value: '{{saleId}}' }
    ],
    callout: {
      label: 'CGV',
      content: 'Le dossier reste enregistré comme annulation client hors conditions de remboursement.',
      tone: 'warning'
    },
    signature: '{{siteName}}'
  }),
  institute_client_cancelled_notice: createMailTemplateDefinition({
    subject: 'Client {{customerName}} a annulé la session {{formationTitle}}',
    siteName: 'Beauty Savage',
    eyebrow: 'Back-office institut',
    title: 'Annulation client à traiter',
    intro: 'Bonjour,',
    paragraphs: [
      'Un client a annulé une session présentielle. Vous trouverez ci-dessous le récapitulatif de la vente et du statut de remboursement.'
    ],
    detailItems: [
      { label: 'Client', value: '{{customerName}}' },
      { label: 'Email client', value: '{{clientEmail}}' },
      { label: 'Formation', value: '{{formationTitle}}' },
      { label: 'Session', value: '{{sessionDateLabel}} - {{sessionTimeLabel}}' },
      { label: 'ID vente', value: '{{saleId}}' },
      { label: 'Montant payé', value: '{{amountPaid}} EUR' },
      { label: 'Éligibilité remboursement', value: '{{refundStatus}}' }
    ],
    callout: {
      label: 'Motif',
      content: '{{reason}}',
      tone: 'accent'
    },
    signature: 'Beauty Savage'
  }),
  refund_requested: createMailTemplateDefinition({
    subject: 'Votre demande de remboursement est enregistrée',
    siteName: '{{siteName}}',
    eyebrow: 'Remboursement',
    title: 'Votre demande de remboursement est enregistrée',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      'Votre demande a bien été créée et va suivre le circuit de validation habituel. Le remboursement sera traité sous 5 à 10 jours ouvrés.'
    ],
    detailItems: [
      { label: 'Produit / formation', value: '{{productName}}{{formationTitle}}' },
      { label: 'Montant remboursement', value: '{{refundAmount}} EUR' },
      { label: 'Date / heure', value: '{{refundDateTime}}' },
      { label: 'ID vente', value: '{{saleId}}' },
      { label: 'Référence remboursement', value: '{{refundId}}' }
    ],
    cta: { label: 'Suivre mon remboursement', url: '{{trackingUrl}}' },
    callout: {
      label: 'Suivi de votre remboursement',
      content: "Suivez l'état de votre remboursement en temps réel : {{trackingUrl}}",
      tone: 'accent'
    },
    signature: '{{siteName}}'
  }),
  refund_auto_initiated: createMailTemplateDefinition({
    subject: 'Remboursement lancé automatiquement - {{formationTitle}}',
    siteName: '{{siteName}}',
    eyebrow: 'Remboursement automatique',
    title: 'Votre remboursement a été lancé automatiquement',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      `Le remboursement lié à <strong>{{formationTitle}}</strong> a été déclenché automatiquement à l'issue du délai de réponse. Il sera traité sous 5 à 10 jours ouvrés.`
    ],
    detailItems: [
      { label: 'Montant remboursement', value: '{{refundAmount}} EUR' },
      { label: 'Date / heure', value: '{{refundDateTime}}' },
      { label: 'ID vente', value: '{{saleId}}' },
      { label: 'Référence remboursement', value: '{{refundId}}' }
    ],
    cta: { label: 'Suivre mon remboursement', url: '{{trackingUrl}}' },
    callout: {
      label: 'Information',
      content: "Le lien de décision n'est plus actif après le déclenchement automatique du remboursement.",
      tone: 'warning'
    },
    signature: '{{siteName}}'
  }),
  refund_confirmed: createMailTemplateDefinition({
    subject: 'Votre remboursement a été effectué',
    siteName: '{{siteName}}',
    eyebrow: 'Remboursement confirmé',
    title: 'Votre remboursement a été traité',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      `Le remboursement de <strong>{{refundAmount}} EUR</strong> pour <strong>{{itemDetail}}</strong> a bien été effectué.`,
      'Selon votre banque, les fonds peuvent mettre 2 à 5 jours ouvrés supplémentaires pour apparaître sur votre compte.'
    ],
    detailItems: [
      { label: 'Montant remboursé', value: '{{refundAmount}} EUR' },
      { label: 'Prestation / Formation', value: '{{itemDetail}}' },
      { label: "Date d'exécution", value: '{{refundedAtFormatted}}' },
      { label: 'Référence remboursement', value: '{{refundId}}' }
    ],
    cta: { label: 'Voir le détail', url: '{{trackingUrl}}' },
    footnote: '{{giftcardbalance}}',
    signature: '{{siteName}}'
  }),
  refund_confirmed_service: createMailTemplateDefinition({
    subject: 'Remboursement confirmé — {{serviceName}}',
    siteName: '{{siteName}}',
    eyebrow: 'Remboursement confirmé',
    title: 'Votre remboursement a été effectué',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      'Votre remboursement pour la prestation <strong>{{serviceName}}</strong> a bien été traité.'
    ],
    detailItems: [
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Date RDV', value: '{{bookingDate}}' },
      { label: 'Heure', value: '{{bookingTime}}' },
      { label: 'Praticienne', value: '{{practitionerName}}' },
      { label: 'Montant remboursé', value: '{{refundAmount}}' },
      { label: 'Remboursé le', value: '{{refundDateTime}}' }
    ],
    signature: '{{siteName}}'
  }),
  gift_card_compensation: createMailTemplateDefinition({
    subject: 'Votre carte cadeau est disponible - {{formationTitle}}',
    siteName: '{{siteName}}',
    eyebrow: 'Carte cadeau',
    title: 'Votre carte cadeau de compensation est prête',
    intro: 'Bonjour {{firstName}} {{lastName}},',
    paragraphs: [
      `Votre carte cadeau de compensation pour <strong>{{formationTitle}}</strong> a été créée.`,
      'Vous pouvez aussi la retrouver dans la rubrique « Mes cartes cadeaux ».'
    ],
    detailItems: [
      { label: 'Code carte', value: '{{giftCardCode}}' },
      { label: 'Mot de passe', value: '{{giftCardPassword}}' },
      { label: 'Solde disponible', value: '{{giftCardBalance}} EUR' },
      { label: 'Montant initial payé', value: '{{amountPaid}} EUR' },
      { label: 'ID vente', value: '{{saleId}}' }
    ],
    callout: {
      label: 'Accès',
      content: 'Conservez ces informations. Elles seront nécessaires pour consulter ou utiliser la carte cadeau.',
      tone: 'accent'
    },
    signature: '{{siteName}}'
  }),
  booking_reminder: createMailTemplateDefinition({
    subject: 'Rappel — Votre rendez-vous {{timeLabel}}',
    siteName: '{{siteName}}',
    eyebrow: 'Rappel de rendez-vous',
    title: 'Votre rendez-vous {{timeLabel}}',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      'Nous vous rappelons votre prochain rendez-vous <strong>{{serviceName}}</strong> prévu le <strong>{{bookingDate}}</strong> à <strong>{{bookingTime}}</strong>.'
    ],
    detailItems: [
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Date', value: '{{bookingDate}}' },
      { label: 'Heure', value: '{{bookingTime}}' },
      { label: 'Praticienne', value: '{{practitionerName}}' },
      { label: 'Paiement', value: '{{paymentType}}' }
    ],
    callout: {
      label: 'Annulation',
      content: 'En cas d\'empêchement, pensez à annuler depuis votre espace personnel au moins {{cancellationDays}} jours avant.',
      tone: 'default'
    },
    signature: '{{siteName}}'
  }),
  booking_confirmed: createMailTemplateDefinition({
    subject: 'Confirmation de votre réservation — {{serviceName}}',
    siteName: '{{siteName}}',
    eyebrow: 'Réservation confirmée',
    title: 'Votre réservation est confirmée !',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      'Votre réservation pour <strong>{{serviceName}}</strong> le <strong>{{bookingDate}}</strong> à <strong>{{bookingTime}}</strong> a bien été enregistrée.'
    ],
    detailItems: [
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Date', value: '{{bookingDate}}' },
      { label: 'Heure', value: '{{bookingTime}}' },
      { label: 'Praticienne', value: '{{practitionerName}}' },
      { label: 'Paiement', value: '{{paymentType}}' }
    ],
    callout: {
      label: 'Annulation',
      content: 'Vous pouvez annuler gratuitement jusqu\'à {{cancellationDays}} jours avant votre rendez-vous depuis votre espace personnel.',
      tone: 'default'
    },
    signature: '{{siteName}}'
  }),
  booking_cancelled_client: createMailTemplateDefinition({
    subject: 'Annulation de votre réservation — {{serviceName}}',
    siteName: '{{siteName}}',
    eyebrow: 'Réservation annulée',
    title: 'Votre réservation a été annulée',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      'Votre réservation pour <strong>{{serviceName}}</strong> le <strong>{{bookingDate}}</strong> à <strong>{{bookingTime}}</strong> a bien été annulée.',
      '{{refundSection}}'
    ],
    detailItems: [
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Date', value: '{{bookingDate}}' },
      { label: 'Heure', value: '{{bookingTime}}' },
      { label: 'Praticienne', value: '{{practitionerName}}' },
      { label: 'Remboursement', value: '{{refundAmount}}' }
    ],
    signature: '{{siteName}}'
  }),
  booking_cancelled_refundable: createMailTemplateDefinition({
    subject: 'Annulation confirmée — Remboursement de {{refundAmount}} en cours',
    siteName: '{{siteName}}',
    eyebrow: 'Réservation annulée',
    title: 'Votre réservation a été annulée',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      'Votre réservation pour <strong>{{serviceName}}</strong> le <strong>{{bookingDate}}</strong> à <strong>{{bookingTime}}</strong> a bien été annulée.',
      '<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin:8px 0"><p style="color:#166534;margin:0;font-weight:600">✅ Remboursement de {{refundAmount}} en cours de traitement</p><p style="color:#166534;margin:8px 0 0;font-size:0.9em">Vous recevrez vos fonds sous 5 à 10 jours ouvrés.</p></div>',
      '{{trackingUrl}}'
    ],
    detailItems: [
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Date', value: '{{bookingDate}}' },
      { label: 'Heure', value: '{{bookingTime}}' }
    ],
    signature: '{{siteName}}'
  }),
  booking_cancelled_not_refundable_delay: createMailTemplateDefinition({
    subject: 'Annulation confirmée — {{serviceName}}',
    siteName: '{{siteName}}',
    eyebrow: 'Réservation annulée',
    title: 'Votre réservation a été annulée',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      'Votre réservation pour <strong>{{serviceName}}</strong> le <strong>{{bookingDate}}</strong> à <strong>{{bookingTime}}</strong> a bien été annulée.',
      `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin:8px 0"><p style="color:#991b1b;margin:0;font-weight:600">❌ Cette annulation ne donne pas lieu à un remboursement</p><p style="color:#991b1b;margin:8px 0 0;font-size:0.9em">Le délai d'annulation gratuit de {{cancellationDays}} jour(s) est dépassé.</p></div>`
    ],
    detailItems: [
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Date', value: '{{bookingDate}}' },
      { label: 'Heure', value: '{{bookingTime}}' }
    ],
    signature: '{{siteName}}'
  }),
  booking_cancelled_not_refundable_waiver: createMailTemplateDefinition({
    subject: 'Annulation confirmée — {{serviceName}}',
    siteName: '{{siteName}}',
    eyebrow: 'Réservation annulée',
    title: 'Votre réservation a été annulée',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      'Votre réservation pour <strong>{{serviceName}}</strong> le <strong>{{bookingDate}}</strong> à <strong>{{bookingTime}}</strong> a bien été annulée.',
      `<div style="background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:16px;margin:8px 0"><p style="color:#991b1b;margin:0;font-weight:600">❌ Cette annulation ne donne pas lieu à un remboursement</p><p style="color:#991b1b;margin:8px 0 0;font-size:0.9em">Vous avez renoncé à votre droit d'annulation lors de la réservation.</p></div>`
    ],
    detailItems: [
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Date', value: '{{bookingDate}}' },
      { label: 'Heure', value: '{{bookingTime}}' }
    ],
    signature: '{{siteName}}'
  }),
  booking_cancelled_notify_admin: createMailTemplateDefinition({
    subject: 'Annulation client — {{serviceName}} du {{bookingDate}}',
    siteName: '{{siteName}}',
    eyebrow: 'Annulation de réservation',
    title: 'Un client a annulé sa réservation',
    intro: 'Bonjour,',
    paragraphs: [
      'Le client <strong>{{customerName}}</strong> a annulé sa réservation <strong>{{serviceName}}</strong> du <strong>{{bookingDate}}</strong> à <strong>{{bookingTime}}</strong>.',
      '{{refundSection}}'
    ],
    detailItems: [
      { label: 'Client', value: '{{customerName}}' },
      { label: 'Email client', value: '{{clientEmail}}' },
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Date', value: '{{bookingDate}}' },
      { label: 'Heure', value: '{{bookingTime}}' },
      { label: 'Remboursement', value: '{{refundAmount}}' }
    ],
    signature: '{{siteName}}'
  }),
  booking_cancelled_admin: createMailTemplateDefinition({
    subject: 'Votre réservation a été annulée — {{serviceName}}',
    siteName: '{{siteName}}',
    eyebrow: 'Annulation par l\'institut',
    title: 'Votre rendez-vous a été annulé',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      'Votre réservation pour <strong>{{serviceName}}</strong> le <strong>{{bookingDate}}</strong> à <strong>{{bookingTime}}</strong> a été annulée par notre équipe. {{refundReason}}'
    ],
    detailItems: [
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Date', value: '{{bookingDate}}' },
      { label: 'Heure', value: '{{bookingTime}}' },
      { label: 'Praticienne', value: '{{practitionerName}}' },
      { label: 'Remboursement', value: '{{refundAmount}}' }
    ],
    callout: {
      label: 'Suivi',
      content: 'Retrouvez le suivi de votre remboursement à l\'adresse : <a href="{{trackingUrl}}">{{trackingUrl}}</a>',
      tone: 'default'
    },
    signature: '{{siteName}}'
  }),
  booking_no_show: createMailTemplateDefinition({
    subject: 'Absence constatée — {{serviceName}}',
    siteName: '{{siteName}}',
    eyebrow: 'Absence non signalée',
    title: 'Absence constatée à votre rendez-vous',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      'Nous avons constaté votre absence à votre rendez-vous <strong>{{serviceName}}</strong> du <strong>{{bookingDate}}</strong> à <strong>{{bookingTime}}</strong> sans annulation préalable.',
      'Si vous aviez réglé un acompte, celui-ci a été conservé conformément à nos conditions.'
    ],
    detailItems: [
      { label: 'Prestation', value: '{{serviceName}}' },
      { label: 'Date', value: '{{bookingDate}}' },
      { label: 'Heure', value: '{{bookingTime}}' }
    ],
    callout: {
      label: 'Information',
      content: 'En cas d\'absences répétées, votre compte peut être suspendu.',
      tone: 'warning'
    },
    signature: '{{siteName}}'
  }),
  booking_suspended: createMailTemplateDefinition({
    subject: 'Votre compte a été suspendu',
    siteName: '{{siteName}}',
    eyebrow: 'Compte suspendu',
    title: 'Accès aux réservations suspendu',
    intro: 'Bonjour {{firstName}},',
    paragraphs: [
      'Suite à {{noShowCount}} absence(s) non signalée(s), votre accès aux réservations a été temporairement suspendu.',
      'Contactez-nous pour régulariser votre situation et réactiver votre compte.'
    ],
    detailItems: [
      { label: 'Institut', value: '{{instituteName}}' }
    ],
    callout: {
      label: 'Réactivation',
      content: 'Contactez-nous directement pour réactiver votre compte.',
      tone: 'warning'
    },
    signature: '{{siteName}}'
  })
};

const AVAILABLE_FUNCTIONS = new Set(Object.keys(TEMPLATE_FUNCTIONS));

const VARIABLE_KEYS = new Set([
  'saleid',
  'firstname',
  'lastname',
  'amount',
  'link',
  'invoicedownloadurl',
  'invoicepageurl',
  'period',
  'reason',
  'eta',
  'date',
  'startedat',
  'endedat',
  'email',
  'customername',
  'clientemail',
  'code',
  'expiresminutes',
  'sitename',
  'institutename',
  'formationtitle',
  'formationname',
  'productname',
  'sessiondatelabel',
  'sessiontimelabel',
  'sessiondate',
  'sessiontime',
  'sessiondatetime',
  'actionurl',
  'autorefunddays',
  'amountpaid',
  'refundamount',
  'refundstatus',
  'refunddatetime',
  'refundid',
  'giftcardcode',
  'giftcardpassword',
  'giftcardbalance',
  'refundedatformatted',
  'trackingurl',
  'year',
  'daysleft',
  'daystotal',
  'platformurl',
  'themesurfaceheader',
  'themeaccent',
  'themeaccentstrong',
  'colortext',
  'colorsurface',
  'themeprimary',
  'themesecondary',
  'themebackground',
  'themesurface',
  'themetext',
  'servicename',
  'bookingdate',
  'bookingtime',
  'bookingdatetime',
  'practitionername',
  'cancellationdays',
  'timelabel',
  'bookingid',
  'depositamount',
  'remainingamount',
  'paymenttype',
  'eligiblerefund',
  'noshowcount',
  'suspensionthreshold',
  'refundreason',
  'refundsection',
  'itemdetail',
  'oldbookingdate',
  'oldbookingtime',
  'newbookingdate',
  'newbookingtime',
  'clientname'
]);

const ALLOWED_MODES = new Set(['text', 'html']);



function normalizeFunctionName(value) {

  if (!value) return null;

  const candidate = String(value || '').trim().toLowerCase();

  return candidate || null;

}



function normalizeMode(value) {

  if (!value) return 'text';

  const candidate = String(value).trim().toLowerCase();

  return ALLOWED_MODES.has(candidate) ? candidate : 'text';

}



function formatAmount(value) {

  const amount = Number.isFinite(Number(value)) ? Number(value) : 0;

  return new Intl.NumberFormat('fr-FR', {

    minimumFractionDigits: 2,

    maximumFractionDigits: 2

  }).format(amount);

}

function clampColorChannel(value) {

  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));

}

function normalizeHexColor(value) {

  const candidate = String(value || '').trim();

  const shortMatch = candidate.match(/^#([0-9a-f]{3})$/i);

  if (shortMatch) {

    return `#${shortMatch[1].split('').map(char => `${char}${char}`).join('')}`.toLowerCase();

  }

  const longMatch = candidate.match(/^#([0-9a-f]{6})$/i);

  if (longMatch) {

    return `#${longMatch[1].toLowerCase()}`;

  }

  return null;

}

function hexToRgb(value) {

  const normalized = normalizeHexColor(value);

  if (!normalized) return null;

  return {

    r: parseInt(normalized.slice(1, 3), 16),

    g: parseInt(normalized.slice(3, 5), 16),

    b: parseInt(normalized.slice(5, 7), 16)

  };

}

function rgbToHex({ r = 0, g = 0, b = 0 } = {}) {

  return `#${[r, g, b]
    .map(channel => clampColorChannel(channel).toString(16).padStart(2, '0'))
    .join('')}`;

}

function mixHexColors(first, firstWeight, second, secondWeight) {

  const firstRgb = hexToRgb(first);

  const secondRgb = hexToRgb(second);

  if (!firstRgb || !secondRgb) return null;

  const total = Number(firstWeight || 0) + Number(secondWeight || 0) || 100;

  const firstRatio = Number(firstWeight || 0) / total;

  const secondRatio = Number(secondWeight || 0) / total;

  return rgbToHex({

    r: (firstRgb.r * firstRatio) + (secondRgb.r * secondRatio),

    g: (firstRgb.g * firstRatio) + (secondRgb.g * secondRatio),

    b: (firstRgb.b * firstRatio) + (secondRgb.b * secondRatio)

  });

}

function resolveThemeColorReference(value = '', colors = {}) {

  const candidate = String(value || '').trim();

  const normalizedHex = normalizeHexColor(candidate);

  if (normalizedHex) return normalizedHex;

  return normalizeHexColor(colors[candidate]) || normalizeHexColor(MAIL_THEME[candidate]) || null;

}

function resolveColorMixExpression(value = '', colors = {}) {

  const candidate = String(value || '').trim();

  const match = candidate.match(
    /^color-mix\(\s*in\s+[a-z0-9-]+\s*,\s*([^,]+?)\s+([0-9.]+)%\s*,\s*([^)]+?)\s+([0-9.]+)%\s*\)$/i
  );

  if (!match) return null;

  const first = resolveThemeColorReference(match[1], colors);

  const second = resolveThemeColorReference(match[3], colors);

  if (!first || !second) return null;

  return mixHexColors(first, Number(match[2]), second, Number(match[4]));

}

function resolveEmailColor(value = '', fallback = '', colors = {}) {

  const normalizedHex = normalizeHexColor(value);

  if (normalizedHex) return normalizedHex;

  const mixedColor = resolveColorMixExpression(value, colors);

  if (mixedColor) return mixedColor;

  const fallbackHex = normalizeHexColor(fallback);

  if (fallbackHex) return fallbackHex;

  return String(fallback || value || '').trim() || MAIL_THEME.text;

}

function resolveDefaultThemeDerivedTokens(colors = {}) {

  const primary = normalizeHexColor(colors.primary) || normalizeHexColor(MAIL_THEME.accent);

  const secondary = normalizeHexColor(colors.secondary) || normalizeHexColor(MAIL_THEME.accentStrong);

  const background = normalizeHexColor(colors.background) || normalizeHexColor(MAIL_THEME.surface);

  return {

    surfaceHeader:
      mixHexColors(primary, 26, background, 74) ||
      normalizeHexColor(MAIL_THEME.surfaceHeader) ||
      MAIL_THEME.surfaceHeader,

    accent:
      mixHexColors(primary, 70, secondary, 30) ||
      normalizeHexColor(MAIL_THEME.accent) ||
      MAIL_THEME.accent,

    accentStrong:
      mixHexColors(primary, 45, secondary, 55) ||
      normalizeHexColor(MAIL_THEME.accentStrong) ||
      MAIL_THEME.accentStrong

  };

}

async function getActiveMailThemeVars() {

  try {

    const theme = await Theme.findOne({ isActive: true }).lean();

    const colors = theme?.colors || {};

    const derivedTokens = theme?.derivedTokens || {};

    const defaultDerivedTokens = resolveDefaultThemeDerivedTokens(colors);

    const colorSurface = String(colors.surface || MAIL_THEME.surface);

    const colorText = String(colors.text || MAIL_THEME.text);

    const themeSurfaceHeader = resolveEmailColor(
      derivedTokens.surfaceHeader,
      defaultDerivedTokens.surfaceHeader,
      colors
    );

    const themeAccent = resolveEmailColor(
      derivedTokens.accent,
      defaultDerivedTokens.accent,
      colors
    );

    const themeAccentStrong = resolveEmailColor(
      derivedTokens.accentStrong,
      defaultDerivedTokens.accentStrong,
      colors
    );

    return {

      themesurfaceheader: themeSurfaceHeader,

      themeaccent: themeAccent,

      themeaccentstrong: themeAccentStrong,

      colortext: colorText,

      colorsurface: colorSurface,

      themeprimary: themeAccent,

      themesecondary: themeAccentStrong,

      themebackground: colorSurface,

      themesurface: colorSurface,

      themetext: colorText

    };

  } catch (error) {

    console.error('[mailService] Impossible de charger le theme actif pour les emails', error);

    return {

      themesurfaceheader: MAIL_THEME.surfaceHeader,

      themeaccent: MAIL_THEME.accent,

      themeaccentstrong: MAIL_THEME.accentStrong,

      colortext: MAIL_THEME.text,

      colorsurface: MAIL_THEME.surface,

      themeprimary: MAIL_THEME.accent,

      themesecondary: MAIL_THEME.accentStrong,

      themebackground: MAIL_THEME.surface,

      themesurface: MAIL_THEME.surface,

      themetext: MAIL_THEME.text

    };

  }

}

async function withMailThemeVars(values = {}) {

  const themeVars = await getActiveMailThemeVars();

  return {

    ...themeVars,

    ...(values || {})

  };

}



function sanitizeFullHtml(value) {

  if (!value) return '';

  let sanitized = String(value);

  sanitized = sanitized.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');

  sanitized = sanitized.replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '');

  sanitized = sanitized.replace(/<\s*(iframe|object|embed|link|meta|base)[\s\S]*?>[\s\S]*?<\/\1>/gi, '');

  sanitized = sanitized.replace(/<\s*(iframe|object|embed|link|meta|base)[^>]*?>/gi, '');

  sanitized = sanitized.replace(/\s(on[a-z]+)\s*=\s*(".*?"|'.*?'|[^>\s]*)/gi, '');

  sanitized = sanitized.replace(/\s(href|src)\s*=\s*(['"])\s*javascript:[^'"]*\2/gi, '');

  return sanitized.trim();

}



function stripHtml(value = '') {

  return String(value)

    .replace(/<[^>]+>/g, ' ')

    .replace(/\s+/g, ' ')

    .trim();

}



function replaceTemplateVariables(content = '', replacements = {}) {

  if (!content) return '';

  return String(content).replace(/{{\s*([a-zA-Z0-9]+)\s*}}/g, (match, key) => {

    const lowerKey = key.toLowerCase();

    if (!VARIABLE_KEYS.has(lowerKey)) {

      return match;

    }

    const raw = replacements[lowerKey];

    if (raw === undefined || raw === null) {

      return '';

    }

    return String(lowerKey === 'amount' ? formatAmount(raw) : raw);

  });

}



async function ensureTemplate(functionName) {

  const normalized = normalizeFunctionName(functionName);

  if (!normalized) return null;

  const existing = await EmailTemplate.findOne({ functionName: normalized }).lean();

  // If a real (non-metadata-only) doc exists, return it as-is
  if (existing && !existing.isMetadataOnly) {
    return existing;
  }

  const defaults = TEMPLATE_FUNCTIONS[normalized];

  if (!defaults) return null;

  const sanitizedBody = sanitizeEditorialHtml(defaults.bodyHtml);

  const payload = {
    subject: String(defaults.subject || ''),
    bodyHtml: sanitizedBody,
    fullHtml: sanitizeFullHtml(defaults.fullHtml),
    mode: normalizeMode(defaults.mode || 'text'),
    isMetadataOnly: false
  };

  if (existing) {
    // isMetadataOnly doc exists — patch it with proper defaults, preserve categoryId/recipient
    const updated = await EmailTemplate.findOneAndUpdate(
      { functionName: normalized },
      { $set: payload },
      { new: true }
    ).lean();
    return updated;
  }

  const created = await EmailTemplate.create({ functionName: normalized, ...payload });

  return created.toObject();

}

function injectSessionClientCancelledRefundFallback({
  bodyHtml = '',
  fullHtml = ''
} = {}) {
  const fallbackText =
    'Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur : <a href="{{trackingUrl}}">{{trackingUrl}}</a>';
  const fallbackBodyBlock = `<p>${fallbackText}</p>`;
  const fallbackFullBlock = `<p style="margin:0 0 18px;font-size:14px;line-height:1.7;color:${MAIL_THEME.muted};">Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur : <a href="{{trackingUrl}}" style="color:${MAIL_THEME.accent};${buildThemeStyle('color', MAIL_THEME.accent, 'themeaccent', 'theme-accent')}text-decoration:underline;">{{trackingUrl}}</a></p>`;
  const marker =
    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-top:12px;">';

  let nextBody = String(bodyHtml || '');
  let nextFull = String(fullHtml || '');
  let changed = false;

  if (!/copiez-collez ce lien dans votre navigateur/i.test(nextBody)) {
    nextBody += fallbackBodyBlock;
    changed = true;
  }
  if (!/copiez-collez ce lien dans votre navigateur/i.test(nextFull)) {
    if (nextFull.includes(marker)) {
      nextFull = nextFull.replace(marker, `${fallbackFullBlock}${marker}`);
    } else {
      nextFull += fallbackFullBlock;
    }
    changed = true;
  }

  return { bodyHtml: nextBody, fullHtml: nextFull, changed };
}

async function ensureSessionClientCancelledRefundFallback(template = null) {
  if (!template) return template;
  const { bodyHtml, fullHtml, changed } = injectSessionClientCancelledRefundFallback({
    bodyHtml: template.bodyHtml,
    fullHtml: template.fullHtml
  });
  if (!changed) {
    return { ...template, mode: normalizeMode(template.mode) };
  }
  const updated = await EmailTemplate.findOneAndUpdate(
    { functionName: 'session_client_cancelled_refund' },
    {
      $set: {
        bodyHtml: sanitizeEditorialHtml(bodyHtml),
        fullHtml: sanitizeFullHtml(fullHtml)
      }
    },
    { new: true }
  ).lean();
  if (updated) {
    updated.mode = normalizeMode(updated.mode);
    return updated;
  }
  return { ...template, bodyHtml, fullHtml, mode: normalizeMode(template.mode) };
}



export async function loadTemplate(functionName) {

  const normalized = normalizeFunctionName(functionName);

  if (!normalized || !AVAILABLE_FUNCTIONS.has(normalized)) {

    return null;

  }

  const template = await EmailTemplate.findOne({ functionName: normalized }).lean();

  if (template && !template.isMetadataOnly) {
    if (normalized === 'session_client_cancelled_refund') {
      return ensureSessionClientCancelledRefundFallback(template);
    }
    template.mode = normalizeMode(template.mode);
    return template;
  }

  const generated = await ensureTemplate(normalized);
  // Merge category metadata from the isMetadataOnly doc if present
  if (generated && template?.isMetadataOnly) {
    generated.categoryId = template.categoryId;
    generated.recipient = template.recipient;
  }
  return generated;

}



export async function saveTemplate(functionName, subject, bodyHtml, fullHtml, mode = 'text') {

  const normalized = normalizeFunctionName(functionName);

  if (!normalized || !AVAILABLE_FUNCTIONS.has(normalized)) {

    throw new Error('Fonction de template inconnue');

  }

  const sanitizedHtml = sanitizeEditorialHtml(bodyHtml || '');

  const sanitizedFullHtml = sanitizeFullHtml(fullHtml || '');

  const payload = {

    subject: String(subject || '').trim(),

    bodyHtml: sanitizedHtml,

    fullHtml: sanitizedFullHtml,

    mode: normalizeMode(mode)

  };

  const updated = await EmailTemplate.findOneAndUpdate(

    { functionName: normalized },

    {

      $set: {

        subject: payload.subject,

        bodyHtml: payload.bodyHtml,

        fullHtml: payload.fullHtml,

        mode: payload.mode,

        updatedAt: new Date()

      }

    },

    {

      new: true,

      upsert: true,

      setDefaultsOnInsert: true

    }

  ).lean();

  return updated;

}



function buildSender() {

  const email = String(process.env.MAIL_FROM || '').trim();

  const name = String(process.env.MAIL_FROM_NAME || '').trim();

  if (!email) {

    return null;

  }

  return {

    email,

    name: name || undefined

  };

}





function buildPasswordResetLink(token) {
  if (!token) {
    return getAppBaseUrl();
  }
  const base = getAppBaseUrl();
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

function buildInvoiceDownloadUrl(invoiceToken) {
  if (!invoiceToken) {
    return '';
  }
  const base = getAppBaseUrl();
  const encodedToken = encodeURIComponent(String(invoiceToken));
  return `${base}/vitrine.html?slug=invoice&token=${encodedToken}`;
}

export async function postToBrevo(payload, context = {}) {
  // Observability: create a queued SendLog, then mark sent/failed. All SendLog
  // ops are defensive (never break the email flow). `context` optionally attaches
  // a business contextType/contextId (else contextType is derived from the tag).
  const sendLog = await createQueuedSendLog(payload, context);

  let apiKey = '';
  try {
    apiKey = String((await getCredential('brevo', { role: 'api_key' })) || '').trim();
  } catch (_err) {
    apiKey = '';
  }

  if (!apiKey) {
    console.error('[mailService] Brevo api_key indisponible, envoi ignoré');
    await markSendLogFailed(sendLog, { errorCode: 'provider_not_configured', errorMessageSafe: 'Brevo API key unavailable' });
    return false;
  }

  let response;
  try {
    response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(payload)
    });
  } catch (networkError) {
    console.error('[mailService] Brevo injoignable', networkError?.message || networkError);
    await markSendLogFailed(sendLog, { errorCode: 'network_error', errorMessageSafe: 'Brevo request failed' });
    return false;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('[mailService] Brevo a refusé le mail', response.status, body);
    await markSendLogFailed(sendLog, { errorCode: `http_${response.status}`, errorMessageSafe: 'Brevo rejected the message' });
    return false;
  }

  let providerMessageId = '';
  try {
    const data = await response.json();
    providerMessageId = String(data?.messageId || '').trim();
  } catch (_err) {
    providerMessageId = '';
  }
  await markSendLogSent(sendLog, { providerMessageId });
  return true;
}



async function pickRandomSale() {

  const results = await Sale.aggregate([{ $sample: { size: 1 } }]);

  return Array.isArray(results) && results.length ? results[0] : null;

}



export async function sendSaleEmail(sale) {

  try {

    if (!sale) {

      return false;

    }

    const customer = sale.customer || {};

    const recipient = String(customer.email || '').trim();

    if (!recipient) {

      console.warn("[mailService] Pas d'email client pour la vente", sale.saleId);

      return false;

    }

    const template = await loadTemplate('vente');

    if (!template) {

      console.warn('[mailService] Template "vente" introuvable');

      return false;

    }

    const saleId = String(sale.saleId || '');

    if (!saleId) {

      console.warn('[mailService] Vente sans saleId, email ignorÃ©');

      return false;

    }
    let invoiceToken = String(sale.invoiceToken || '').trim();

    if (!invoiceToken) {

      const generatedToken = crypto.randomBytes(24).toString('hex');

      const updatedSale = await Sale.findOneAndUpdate(

        { saleId },

        { $set: { invoiceToken: generatedToken } },

        { new: true }

      ).lean();

      invoiceToken = String(updatedSale?.invoiceToken || generatedToken).trim();

    }

    const downloadUrl = buildInvoiceDownloadUrl(invoiceToken);

    if (!downloadUrl) {

      console.warn('[mailService] Lien facture indisponible pour la vente', saleId);

      return false;

    }

    const sender = buildSender();

    if (!sender) {

      console.warn('[mailService] MAIL_FROM inutilisable, email ignorÃ©');

      return;

    }

    const payloadData = await withMailThemeVars({

      saleid: saleId,

      firstname: customer.firstName || '',

      lastname: customer.lastName || '',

      amount: sale.totalAmount || 0,

      invoicepageurl: downloadUrl,

      invoicedownloadurl: downloadUrl

    });

    const subject = replaceTemplateVariables(template.subject, payloadData) || template.subject;

    const htmlTemplate = template.fullHtml || template.bodyHtml || '';

    const htmlContent = htmlTemplate ? replaceTemplateVariables(htmlTemplate, payloadData) || htmlTemplate : '';

    let textTemplate = template.bodyHtml || '';

    if (!textTemplate && template.fullHtml) {

      textTemplate = stripHtml(template.fullHtml);

    }

    const textContent = textTemplate ? replaceTemplateVariables(textTemplate, payloadData) || textTemplate : '';

    const payload = {

      sender,

      to: [{ email: recipient }],

      subject,

      tags: ['transactional', 'vente']

    };

    if (htmlContent) {

      payload.htmlContent = htmlContent;

    }

    if (textContent) {

      payload.textContent = textContent;

    }

    console.log('[MailService] payload sent to Brevo:', {
      to: payload.to,
      subject: payload.subject,
      tags: payload.tags,
      htmlContent: Boolean(payload.htmlContent),
      textContent: Boolean(payload.textContent),
      templateVars: payloadData
    });

    const success = await postToBrevo(payload, { contextType: 'sale', contextId: String(sale?.saleId || sale?._id || '') });

    if (success) {

      console.log('[mailService] Mail VENTE envoyÃ© pour', sale.saleId, 'Ã ', recipient);

    }

    return success;

  } catch (error) {

    console.error("[mailService] Impossible d'envoyer le mail VENTE", error);

    return false;

  }

}



// ---------------------------------------------------------------------------
// Helpers commissions (collecte des emails admins)
// ---------------------------------------------------------------------------

async function collectAdminAndDevEmails() {
  const { default: User } = await import('../models/user.js');
  const users = await User.find({ role: { $in: ['admin'] } }).select('email').lean();
  const seen = new Set();
  const emails = [];
  for (const u of users) {
    const email = String(u?.email || '').trim();
    const lower = email.toLowerCase();
    if (!email || seen.has(lower)) continue;
    seen.add(lower);
    emails.push(email);
  }
  return emails;
}

// ---------------------------------------------------------------------------
// commission_available — commissions du mois disponibles
// ---------------------------------------------------------------------------
export async function sendCommissionAvailableEmail({ toEmails, period, amount, daysTotal, platformUrl }) {
  try {
    const recipients = normalizeRecipientEmails(toEmails);
    if (!recipients.length) return false;
    return await sendStatusMail({
      templateKey: 'commission_available',
      toEmails: recipients,
      templateVars: {
        period: String(period || ''),
        amount: String(amount || '0'),
        daystotal: String(daysTotal || ''),
        platformurl: String(platformUrl || '')
      },
      tag: 'commission_available'
    });
  } catch (err) {
    console.error('[mailService] sendCommissionAvailableEmail error', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// commission_reminder — rappel de paiement
// ---------------------------------------------------------------------------
export async function sendCommissionReminderEmail({ toEmails, period, amount, daysLeft, platformUrl }) {
  try {
    const recipients = normalizeRecipientEmails(toEmails);
    if (!recipients.length) return false;
    return await sendStatusMail({
      templateKey: 'commission_reminder',
      toEmails: recipients,
      templateVars: {
        period: String(period || ''),
        amount: String(amount || '0'),
        daysleft: String(daysLeft ?? ''),
        platformurl: String(platformUrl || '')
      },
      tag: 'commission_reminder'
    });
  } catch (err) {
    console.error('[mailService] sendCommissionReminderEmail error', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// commission_last_day — dernier jour pour payer
// ---------------------------------------------------------------------------
export async function sendCommissionLastDayEmail({ toEmails, period, amount, platformUrl }) {
  try {
    const recipients = normalizeRecipientEmails(toEmails);
    if (!recipients.length) return false;
    return await sendStatusMail({
      templateKey: 'commission_last_day',
      toEmails: recipients,
      templateVars: {
        period: String(period || ''),
        amount: String(amount || '0'),
        platformurl: String(platformUrl || '')
      },
      tag: 'commission_last_day'
    });
  } catch (err) {
    console.error('[mailService] sendCommissionLastDayEmail error', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// (legacy — supprimé, conservé temporairement pour ne pas casser les imports)
// ---------------------------------------------------------------------------
export async function sendCommissionInvoiceEmail(invoice, invoiceDownloadUrl) {

  try {

    if (!invoice || !invoiceDownloadUrl) {

      console.warn('[mailService] Lien de téléchargement introuvable, envoi ignoré');

      return false;

    }

    console.log('[MailService] commission_invoice payload received:', {
      invoiceId: invoice._id,
      invoiceDownloadUrl,
      recipients: Array.isArray(invoice.emailRecipients) ? invoice.emailRecipients : []
    });

    const recipients = Array.isArray(invoice.emailRecipients) ? invoice.emailRecipients : [];

    const uniqueRecipients = [];

    const seen = new Set();

    for (const raw of recipients) {

      const candidate = String(raw || '').trim();

      if (!candidate) {

        continue;

      }

      const key = candidate.toLowerCase();

      if (seen.has(key)) {

        continue;

      }

      seen.add(key);

      uniqueRecipients.push(candidate);

    }

    if (!uniqueRecipients.length) {

      console.warn('[mailService] Aucune adresse destinataire pour la facture de commission', invoice.month || invoice._id);

      return false;

    }

    const template = await loadTemplate('commission_invoice');

    if (!template) {

      console.warn('[mailService] Template "commission_invoice" introuvable');

      return false;

    }

    const sender = buildSender();

    if (!sender) {

      console.warn('[mailService] MAIL_FROM inutilisable, email ignoré');

      return false;

    }

    const payloadData = await withMailThemeVars({

      period: invoice.periodLabel || '',

      amount: invoice.totalCommissionAmount || 0,

      invoiceDownloadUrl,

      invoicedownloadurl: invoiceDownloadUrl

    });

    const subject = replaceTemplateVariables(template.subject, payloadData) || template.subject;

    const htmlTemplate = template.fullHtml || template.bodyHtml || '';

    const htmlContent = htmlTemplate

      ? replaceTemplateVariables(htmlTemplate, payloadData) || htmlTemplate

      : '';

    let textTemplate = template.bodyHtml || '';

    if (!textTemplate && template.fullHtml) {

      textTemplate = stripHtml(template.fullHtml);

    }

    const textContent = textTemplate

      ? replaceTemplateVariables(textTemplate, payloadData) || textTemplate

      : '';

    const payload = {

      sender,

      to: uniqueRecipients.map(email => ({ email })),

      subject,

      tags: ['transactional', 'commission_invoice']

    };

    if (htmlContent) {

      payload.htmlContent = htmlContent;

    }

    if (textContent) {

      payload.textContent = textContent;

    }

    const success = await postToBrevo(payload);

    if (success) {

      console.log('[mailService] Mail COMMISSION_INVOICE envoyé pour', invoice.month || invoice._id);

    }

    return success;

  } catch (error) {

    console.error("[mailService] Impossible d'envoyer le mail COMMISSION_INVOICE", error);

    return false;

  }

}



export async function sendPasswordResetEmail(user, token) {

  try {

    if (!user || !token) {

      return false;

    }

    const recipient = String(user.email || '').trim();

    if (!recipient) {

      console.warn('[mailService] Aucun email utilisateur pour le reset de mot de passe', user?._id);

      return false;

    }

    const template = await loadTemplate('password_reset');

    if (!template) {

      console.warn('[mailService] Template "password_reset" introuvable');

      return false;

    }

    const sender = buildSender();

    if (!sender) {

      console.warn('[mailService] MAIL_FROM inutilisable, email ignorÃ©');

      return false;

    }

    const payloadData = await withMailThemeVars({

      firstname: user.firstName || '',

      lastname: user.lastName || '',

      link: buildPasswordResetLink(token)

    });

    const subject = replaceTemplateVariables(template.subject, payloadData) || template.subject;

    const htmlTemplate = template.fullHtml || template.bodyHtml || '';

    const htmlContent = htmlTemplate

      ? replaceTemplateVariables(htmlTemplate, payloadData) || htmlTemplate

      : '';

    let textTemplate = template.bodyHtml || '';

    if (!textTemplate && template.fullHtml) {

      textTemplate = stripHtml(template.fullHtml);

    }

    const textContent = textTemplate

      ? replaceTemplateVariables(textTemplate, payloadData) || textTemplate

      : '';

    const payload = {

      sender,

      to: [{ email: recipient }],

      subject,

      tags: ['transactional', 'password_reset']

    };

    if (htmlContent) {

      payload.htmlContent = htmlContent;

    }

    if (textContent) {

      payload.textContent = textContent;

    }

    const success = await postToBrevo(payload);

    if (success) {

      console.log('[mailService] Mail PASSWORD_RESET envoyÃ© pour', user._id, 'Ã ', recipient);

    }

    return success;

  } catch (error) {

    console.error("[mailService] Impossible d'envoyer le mail PASSWORD_RESET", error);

    return false;

  }

}

export async function sendEmailConfirmationCodeEmail({
  toEmail,
  firstName = '',
  email = '',
  code = '',
  expiresMinutes = 10
} = {}) {

  try {
    const recipient = String(toEmail || '').trim();
    const normalizedCode = String(code || '').trim();
    if (!recipient || !normalizedCode) {
      return false;
    }

    const template = await loadTemplate('email_confirmation_code');
    if (!template) {
      console.warn('[mailService] Template "email_confirmation_code" introuvable');
      return false;
    }

    const sender = buildSender();
    if (!sender) {
      console.warn('[mailService] MAIL_FROM inutilisable, email ignore');
      return false;
    }

    const payloadData = await withMailThemeVars({
      firstname: firstName || '',
      email: email || recipient,
      code: normalizedCode,
      expiresminutes: Number.isFinite(Number(expiresMinutes)) ? Number(expiresMinutes) : 10
    });

    const subject = replaceTemplateVariables(template.subject, payloadData) || template.subject;
    const htmlTemplate = template.fullHtml || template.bodyHtml || '';
    const htmlContent = htmlTemplate
      ? replaceTemplateVariables(htmlTemplate, payloadData) || htmlTemplate
      : '';
    let textTemplate = template.bodyHtml || '';
    if (!textTemplate && template.fullHtml) {
      textTemplate = stripHtml(template.fullHtml);
    }
    const textContent = textTemplate
      ? replaceTemplateVariables(textTemplate, payloadData) || textTemplate
      : '';

    const payload = {
      sender,
      to: [{ email: recipient }],
      subject,
      tags: ['transactional', 'email_confirmation_code']
    };
    if (htmlContent) payload.htmlContent = htmlContent;
    if (textContent) payload.textContent = textContent;

    const success = await postToBrevo(payload);
    if (success) {
      console.log('[mailService] Mail EMAIL_CONFIRMATION_CODE envoye a', recipient);
    }
    return success;
  } catch (error) {
    console.error('[mailService] Impossible d envoyer le mail EMAIL_CONFIRMATION_CODE', error);
    return false;
  }

}

function normalizeRecipientEmails(toEmails = []) {

  const unique = [];

  const seen = new Set();

  for (const raw of toEmails) {

    const email = String(raw || '').trim();

    const key = email.toLowerCase();

    if (!email || seen.has(key)) continue;

    seen.add(key);

    unique.push(email);

  }

  return unique;

}



async function sendStatusMail({ templateKey, toEmails, templateVars, tag }) {

  const recipients = normalizeRecipientEmails(toEmails);

  if (!recipients.length) {

    console.warn('[mailService] Aucun destinataire pour', templateKey);

    return false;

  }

  const template = await loadTemplate(templateKey);

  if (!template) {

    console.warn('[mailService] Template introuvable', templateKey);

    return false;

  }

  const sender = buildSender();

  if (!sender) {

    console.warn('[mailService] MAIL_FROM inutilisable, email ignore');

    return false;

  }

  const themedTemplateVars = await withMailThemeVars(templateVars);

  const subject = replaceTemplateVariables(template.subject, themedTemplateVars) || template.subject;

  const htmlTemplate = template.fullHtml || template.bodyHtml || '';

  const htmlContent = htmlTemplate

    ? replaceTemplateVariables(htmlTemplate, themedTemplateVars) || htmlTemplate

    : '';

  let textTemplate = template.bodyHtml || '';

  if (!textTemplate && template.fullHtml) {

    textTemplate = stripHtml(template.fullHtml);

  }

  const textContent = textTemplate

    ? replaceTemplateVariables(textTemplate, themedTemplateVars) || textTemplate

    : '';

  const payload = {

    sender,

    to: recipients.map(email => ({ email })),

    subject,

    tags: ['transactional', String(tag || templateKey).trim().toLowerCase()]

  };

  if (htmlContent) payload.htmlContent = htmlContent;

  if (textContent) payload.textContent = textContent;

  return postToBrevo(payload);

}



export async function sendSiteSuspendedEmail({ toEmails = [], reason = '', date = '' } = {}) {

  try {

    return await sendStatusMail({

      templateKey: 'site_suspended',

      toEmails,

      templateVars: { reason, date },

      tag: 'site_suspended'

    });

  } catch (error) {

    console.error('[mailService] Impossible d envoyer le mail SITE_SUSPENDED', error);

    return false;

  }

}



export async function sendSiteReactivatedEmail({ toEmails = [], date = '' } = {}) {

  try {

    return await sendStatusMail({

      templateKey: 'site_reactivated',

      toEmails,

      templateVars: { date },

      tag: 'site_reactivated'

    });

  } catch (error) {

    console.error('[mailService] Impossible d envoyer le mail SITE_REACTIVATED', error);

    return false;

  }

}

export async function sendSiteMaintenanceStartEmail({
  toEmails = [],
  reason = '',
  eta = '',
  date = '',
  startedAt = ''
} = {}) {

  try {

    return await sendStatusMail({

      templateKey: 'site_maintenance_start',

      toEmails,

      templateVars: { reason, eta, date, startedat: startedAt },

      tag: 'site_maintenance_start'

    });

  } catch (error) {

    console.error('[mailService] Impossible d envoyer le mail SITE_MAINTENANCE_START', error);

    return false;

  }

}

export async function sendSiteMaintenanceEndEmail({
  toEmails = [],
  reason = '',
  eta = '',
  date = '',
  startedAt = ''
} = {}) {

  try {

    return await sendStatusMail({

      templateKey: 'site_maintenance_end',

      toEmails,

      templateVars: { reason, eta, date, startedat: startedAt },

      tag: 'site_maintenance_end'

    });

  } catch (error) {

    console.error('[mailService] Impossible d envoyer le mail SITE_MAINTENANCE_END', error);

    return false;

  }

}



function isValidActionUrl(value) {

  const candidate = String(value || '').trim();

  if (!candidate) return false;

  try {

    const parsed = new URL(candidate);

    return parsed.protocol === 'http:' || parsed.protocol === 'https:';

  } catch (_error) {

    return false;

  }

}

export async function sendSessionCancelledChoiceEmail({
  toEmail,
  siteName = 'Beauty Savage',
  firstName = '',
  lastName = '',
  formationTitle = '',
  sessionDateLabel = '',
  sessionTimeLabel = '',
  actionUrl = '',
  reason = '',
  year = new Date().getFullYear()
} = {}) {

  const recipient = String(toEmail || '').trim();
  if (!recipient) {
    return false;
  }

  if (!isValidActionUrl(actionUrl)) {
    console.warn('[mailService][DEV] session_cancelled_choice actionUrl invalide', {
      recipient,
      actionUrl
    });
    return false;
  }

  try {

    return await sendStatusMail({

      templateKey: 'session_cancelled_choice',

      toEmails: [recipient],

      templateVars: {
        sitename: siteName,
        firstname: firstName,
        lastname: lastName,
        formationtitle: formationTitle,
        sessiondatelabel: sessionDateLabel,
        sessiontimelabel: sessionTimeLabel,
        actionurl: actionUrl,
        reason,
        year
      },

      tag: 'session_cancelled_choice'

    });

  } catch (error) {

    console.error('[mailService] Impossible d envoyer le mail SESSION_CANCELLED_CHOICE', error);

    return false;

  }

}

async function sendSingleTemplateMail({
  templateKey,
  toEmail,
  templateVars = {},
  tag = ''
} = {}) {
  const recipient = String(toEmail || '').trim();
  if (!recipient) return false;
  const actionUrl = String(templateVars?.actionurl || '').trim();
  if (actionUrl && !isValidActionUrl(actionUrl)) {
    console.warn('[mailService] actionUrl invalide', { templateKey, recipient, actionUrl });
    return false;
  }
  try {
    return await sendStatusMail({
      templateKey,
      toEmails: [recipient],
      templateVars,
      tag: tag || templateKey
    });
  } catch (error) {
    console.error('[mailService] Impossible d envoyer le mail', templateKey, error);
    return false;
  }
}

function buildCommonMailVars({
  siteName = 'Beauty Savage',
  instituteName = '',
  firstName = '',
  lastName = '',
  customerName = '',
  clientEmail = '',
  formationTitle = '',
  formationName = '',
  productName = '',
  sessionDateLabel = '',
  sessionTimeLabel = '',
  actionUrl = '',
  saleId = '',
  amountPaid = 0,
  refundAmount = 0,
  refundStatus = '',
  refundDateTime = '',
  refundId = '',
  reason = '',
  year = new Date().getFullYear(),
  giftCardCode = '',
  giftCardPassword = '',
  giftCardBalance = 0,
  trackingUrl = '',
  refundedAtFormatted = '',
  itemDetail = '',
  serviceName = '',
  bookingDate = '',
  bookingTime = '',
  practitionerName = ''
} = {}) {
  const fullNameFromParts = `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim();
  const normalizedCustomerName =
    String(customerName || '').trim() ||
    fullNameFromParts ||
    String(clientEmail || '').trim();
  return {
    sitename: siteName,
    institutename: instituteName || siteName,
    firstname: firstName,
    lastname: lastName,
    customername: normalizedCustomerName,
    clientemail: clientEmail,
    formationtitle: formationTitle || formationName,
    formationname: formationName || formationTitle,
    productname: productName,
    sessiondatelabel: sessionDateLabel,
    sessiontimelabel: sessionTimeLabel,
    actionurl: actionUrl,
    saleid: saleId,
    amountpaid: amountPaid,
    refundamount: refundAmount,
    refundstatus: refundStatus,
    refunddatetime: refundDateTime,
    refundid: refundId,
    reason,
    year,
    giftcardcode: giftCardCode,
    giftcardpassword: giftCardPassword,
    giftcardbalance: giftCardBalance,
    trackingurl: trackingUrl,
    refundedatformatted: refundedAtFormatted,
    itemdetail: itemDetail || formationTitle || formationName || serviceName || '',
    servicename: serviceName,
    bookingdate: bookingDate,
    bookingtime: bookingTime,
    practitionername: practitionerName
  };
}

export async function sendFormationDeletedChoiceEmail({
  toEmail,
  siteName = 'Beauty Savage',
  firstName = '',
  lastName = '',
  clientEmail = '',
  formationTitle = '',
  amountPaid = 0,
  saleId = '',
  actionUrl = '',
  reason = ''
} = {}) {
  return sendSingleTemplateMail({
    templateKey: 'formation_deleted_choice',
    toEmail,
    tag: 'formation_deleted_choice',
    templateVars: buildCommonMailVars({
      siteName,
      firstName,
      lastName,
      clientEmail,
      formationTitle,
      amountPaid,
      saleId,
      actionUrl,
      reason
    })
  });
}

export async function sendSessionUpdatedChoiceEmail({
  toEmail,
  siteName = 'Beauty Savage',
  firstName = '',
  lastName = '',
  clientEmail = '',
  formationTitle = '',
  sessionDateLabel = '',
  sessionTimeLabel = '',
  saleId = '',
  actionUrl = '',
  reason = ''
} = {}) {
  return sendSingleTemplateMail({
    templateKey: 'session_updated_choice',
    toEmail,
    tag: 'session_updated_choice',
    templateVars: buildCommonMailVars({
      siteName,
      firstName,
      lastName,
      clientEmail,
      formationTitle,
      sessionDateLabel,
      sessionTimeLabel,
      saleId,
      actionUrl,
      reason
    })
  });
}

export async function sendRefundRequestedEmail({
  toEmail,
  siteName = 'Beauty Savage',
  firstName = '',
  lastName = '',
  clientEmail = '',
  formationName = '',
  productName = '',
  amount = 0,
  refundId = '',
  refundStatus = 'requested',
  refundDateTime = '',
  saleId = '',
  trackingUrl = ''
} = {}) {
  return sendSingleTemplateMail({
    templateKey: 'refund_requested',
    toEmail,
    tag: 'refund_requested',
    templateVars: buildCommonMailVars({
      siteName,
      firstName,
      lastName,
      clientEmail,
      formationName,
      productName,
      refundAmount: amount,
      refundStatus,
      refundDateTime,
      refundId,
      saleId,
      trackingUrl
    })
  });
}

export async function sendRefundAutoInitiatedEmail({
  toEmail,
  siteName = 'Beauty Savage',
  firstName = '',
  lastName = '',
  clientEmail = '',
  formationName = '',
  amount = 0,
  refundId = '',
  refundStatus = 'requested',
  refundDateTime = '',
  saleId = '',
  trackingUrl = ''
} = {}) {
  return sendSingleTemplateMail({
    templateKey: 'refund_auto_initiated',
    toEmail,
    tag: 'refund_auto_initiated',
    templateVars: buildCommonMailVars({
      siteName,
      firstName,
      lastName,
      clientEmail,
      formationName,
      refundAmount: amount,
      refundStatus,
      refundDateTime,
      refundId,
      saleId,
      trackingUrl
    })
  });
}

export async function sendRefundConfirmedEmail({
  toEmail,
  siteName = 'Beauty Savage',
  firstName = '',
  lastName = '',
  formationName = '',
  itemDetail = '',
  isService = false,
  serviceName = '',
  bookingDate = '',
  bookingTime = '',
  practitionerName = '',
  amount = 0,
  refundId = '',
  refundedAt = '',
  giftCardRecredited = false,
  giftCardRecreditAmount = 0,
  trackingUrl = ''
} = {}) {
  if (!toEmail) return false;
  const giftCardNote = giftCardRecredited && giftCardRecreditAmount > 0
    ? `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(giftCardRecreditAmount)} EUR ont également été recrédités sur votre carte cadeau.`
    : '';

  const templateKey = isService ? 'refund_confirmed_service' : 'refund_confirmed';
  const tag = isService ? 'refund_confirmed_service' : 'refund_confirmed';

  if (isService) {
    const refundAmountStr = amount > 0
      ? `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)} €`
      : '';
    return sendSingleTemplateMail({
      templateKey,
      toEmail,
      tag,
      templateVars: buildCommonMailVars({
        siteName,
        firstName,
        lastName,
        serviceName,
        bookingDate,
        bookingTime,
        practitionerName,
        refundAmount: refundAmountStr,
        refundDateTime: refundedAt,
        refundId,
        trackingUrl
      })
    });
  }

  return sendSingleTemplateMail({
    templateKey,
    toEmail,
    tag,
    templateVars: buildCommonMailVars({
      siteName,
      firstName,
      lastName,
      formationName: isService ? '' : formationName,
      refundAmount: amount,
      refundId,
      refundedAtFormatted: refundedAt,
      giftCardBalance: giftCardNote,
      trackingUrl,
      itemDetail: itemDetail || formationName,
      serviceName: '',
      bookingDate: '',
      bookingTime: ''
    })
  });
}

export async function sendSessionRescheduledEmail({
  toEmail,
  siteName = 'Beauty Savage',
  firstName = '',
  lastName = '',
  clientEmail = '',
  formationName = '',
  sessionDateLabel = '',
  sessionTimeLabel = '',
  saleId = ''
} = {}) {
  return sendSingleTemplateMail({
    templateKey: 'session_rescheduled',
    toEmail,
    tag: 'session_rescheduled',
    templateVars: buildCommonMailVars({
      siteName,
      firstName,
      lastName,
      clientEmail,
      formationName,
      sessionDateLabel,
      sessionTimeLabel,
      saleId
    })
  });

}

export async function sendClientSessionCancellationEmail({
  toEmail,
  siteName = 'Beauty Savage',
  firstName = '',
  lastName = '',
  clientEmail = '',
  formationTitle = '',
  sessionDateLabel = '',
  sessionTimeLabel = '',
  saleId = '',
  amountPaid = 0,
  refundAmount = 0,
  refundStatus = '',
  trackingUrl = '',
  eligibleRefund = false
} = {}) {
  return sendSingleTemplateMail({
    templateKey: eligibleRefund
      ? 'session_client_cancelled_refund'
      : 'session_client_cancelled_no_refund',
    toEmail,
    tag: eligibleRefund ? 'session_client_cancelled_refund' : 'session_client_cancelled_no_refund',
    templateVars: buildCommonMailVars({
      siteName,
      firstName,
      lastName,
      clientEmail,
      formationTitle,
      sessionDateLabel,
      sessionTimeLabel,
      saleId,
      amountPaid,
      refundAmount,
      refundStatus: refundStatus || (eligibleRefund ? 'eligible' : 'non_eligible'),
      trackingUrl
    })
  });
}

export async function sendInstituteClientCancelledNoticeEmail({
  toEmails = [],
  siteName = 'Beauty Savage',
  customerName = '',
  clientEmail = '',
  formationTitle = '',
  sessionDateLabel = '',
  sessionTimeLabel = '',
  saleId = '',
  amountPaid = 0,
  eligibleRefund = false,
  reason = ''
} = {}) {
  const recipients = normalizeRecipientEmails(toEmails);
  if (!recipients.length) return false;
  try {
    return await sendStatusMail({
      templateKey: 'institute_client_cancelled_notice',
      toEmails: recipients,
      tag: 'institute_client_cancelled_notice',
      templateVars: buildCommonMailVars({
        siteName,
        customerName,
        clientEmail,
        formationTitle,
        sessionDateLabel,
        sessionTimeLabel,
        saleId,
        amountPaid,
        refundStatus: eligibleRefund ? 'eligible' : 'non_eligible',
        reason
      })
    });
  } catch (error) {
    console.error('[mailService] Impossible d envoyer le mail INSTITUTE_CLIENT_CANCELLED_NOTICE', error);
    return false;
  }
}

export async function sendGiftCardCompensationEmail({
  toEmail,
  siteName = 'Beauty Savage',
  firstName = '',
  lastName = '',
  clientEmail = '',
  formationTitle = '',
  saleId = '',
  amountPaid = 0,
  giftCardCode = '',
  giftCardPassword = '',
  giftCardBalance = 0
} = {}) {
  return sendSingleTemplateMail({
    templateKey: 'gift_card_compensation',
    toEmail,
    tag: 'gift_card_compensation',
    templateVars: buildCommonMailVars({
      siteName,
      firstName,
      lastName,
      clientEmail,
      formationTitle,
      saleId,
      amountPaid,
      giftCardCode,
      giftCardPassword,
      giftCardBalance
    })
  });
}

// ─── Booking emails ────────────────────────────────────────────────────────

function escapeBookingHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendPremiumHtmlEmail({ toEmail, subject, htmlContent, tag = 'booking' }) {
  const recipient = String(toEmail || '').trim();
  if (!recipient) return false;
  const sender = buildSender();
  if (!sender) return false;
  const payload = {
    sender,
    to: [{ email: recipient }],
    subject,
    htmlContent,
    tags: ['transactional', tag]
  };
  return postToBrevo(payload);
}

export async function sendBookingConfirmedEmail({ booking } = {}) {
  const toEmail = booking?.clientId?.email;
  if (!toEmail) return false;
  try {
    const service = booking.serviceId;
    const practitioner = booking.practitionerId;
    const client = booking.clientId;
    const startAt = booking.startAt ? new Date(booking.startAt) : null;

    const bookingDate = startAt
      ? startAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const bookingTime = startAt
      ? startAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';

    const isDeposit = booking.paymentType === 'deposit';
    const paymentType = isDeposit ? 'Acompte' : 'Paiement complet';
    const depositAmount = isDeposit && booking.depositAmount != null
      ? `${Number(booking.depositAmount).toFixed(2)} €`
      : '';
    const remainingAmount = isDeposit && booking.totalPrice != null && booking.depositAmount != null
      ? `${(Number(booking.totalPrice) - Number(booking.depositAmount)).toFixed(2)} €`
      : '';

    const template = await loadTemplate('booking_confirmed');

    if (!template) {
      console.warn('[mailService] Template "booking_confirmed" introuvable');
      return false;
    }

    const sender = buildSender();
    if (!sender) {
      console.warn('[mailService] MAIL_FROM inutilisable, email ignoré');
      return false;
    }

    const variables = await withMailThemeVars({
      firstname: client?.firstName || '',
      lastname: client?.lastName || '',
      sitename: 'Beauty Savage',
      servicename: service?.name || 'Prestation',
      bookingdate: bookingDate,
      bookingtime: bookingTime,
      bookingdatetime: bookingDate && bookingTime ? `${bookingDate} à ${bookingTime}` : '',
      practitionername: practitioner?.displayName || '',
      cancellationdays: String(booking.cancellationPolicySnapshot?.cancellationDays ?? 7),
      timelabel: '',
      bookingid: booking.bookingId || '',
      paymenttype: paymentType,
      depositamount: depositAmount,
      remainingamount: remainingAmount
    });

    const subject = replaceTemplateVariables(template.subject, variables) || template.subject;
    const htmlTemplate = template.fullHtml || template.bodyHtml || '';
    const htmlContent = htmlTemplate ? replaceTemplateVariables(htmlTemplate, variables) || htmlTemplate : '';
    let textTemplate = template.bodyHtml || '';
    if (!textTemplate && template.fullHtml) {
      textTemplate = stripHtml(template.fullHtml);
    }
    const textContent = textTemplate ? replaceTemplateVariables(textTemplate, variables) || textTemplate : '';

    const payload = {
      sender,
      to: [{ email: String(toEmail).trim() }],
      subject,
      tags: ['transactional', 'booking_confirmed']
    };
    if (htmlContent) payload.htmlContent = htmlContent;
    if (textContent) payload.textContent = textContent;

    const success = await postToBrevo(payload, { contextType: 'service_booking', contextId: String(booking?._id || '') });
    if (success) {
      console.log('[mailService] Mail BOOKING_CONFIRMED envoyé à', toEmail);
    }
    return success;
  } catch (err) {
    console.error('[mailService] sendBookingConfirmedEmail error', err);
    return false;
  }
}

export async function sendServiceCancellationChoiceEmail({
  toEmail,
  siteName = 'Beauty Savage',
  firstName = '',
  serviceName = '',
  bookingDate = '',
  bookingTime = '',
  actionUrl = '',
  autoRefundDays = 7
} = {}) {
  const recipient = String(toEmail || '').trim();
  if (!recipient) return false;
  if (!isValidActionUrl(actionUrl)) {
    console.warn('[mailService] sendServiceCancellationChoiceEmail actionUrl invalide', {
      recipient,
      actionUrl
    });
    return false;
  }
  try {
    return await sendStatusMail({
      templateKey: 'service_booking_cancelled_choice',
      toEmails: [recipient],
      templateVars: {
        sitename: siteName,
        firstname: firstName,
        servicename: serviceName,
        bookingdate: bookingDate,
        bookingtime: bookingTime,
        actionurl: actionUrl,
        autorefunddays: String(autoRefundDays)
      },
      tag: 'service_booking_cancelled_choice'
    });
  } catch (error) {
    console.error('[mailService] sendServiceCancellationChoiceEmail error', error);
    return false;
  }
}

export async function sendServiceRescheduledAdminEmail({
  practitionerEmail,
  practitionerFirstName = '',
  clientName = '',
  clientEmail = '',
  serviceName = '',
  oldBookingDate = '',
  oldBookingTime = '',
  newBookingDate = '',
  newBookingTime = ''
} = {}) {
  const recipient = String(practitionerEmail || '').trim();
  if (!recipient) return false;
  try {
    return await sendStatusMail({
      templateKey: 'service_booking_rescheduled_admin',
      toEmails: [recipient],
      templateVars: {
        firstname: practitionerFirstName,
        clientname: clientName,
        clientemail: clientEmail,
        servicename: serviceName,
        oldbookingdate: oldBookingDate,
        oldbookingtime: oldBookingTime,
        newbookingdate: newBookingDate,
        newbookingtime: newBookingTime
      },
      tag: 'service_booking_rescheduled_admin'
    });
  } catch (error) {
    console.error('[mailService] sendServiceRescheduledAdminEmail error', error);
    return false;
  }
}

export async function sendBookingCancelledEmail({
  booking,
  eligibleRefund = false,
  refundAmount = 0,
  refundRequest = null,
  waiverSigned = false
} = {}) {
  const toEmail = booking?.clientId?.email || (typeof booking?.clientId === 'string' ? null : null);
  if (!toEmail) return false;
  try {
    const service = booking.serviceId;
    const practitioner = booking.practitionerId;
    const client = booking.clientId;
    const startAt = booking.startAt ? new Date(booking.startAt) : null;

    const bookingDate = startAt
      ? startAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const bookingTime = startAt
      ? startAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';

    const refundAmountStr = refundAmount > 0 ? `${formatAmount(refundAmount)} €` : '';

    const trackingLinkHtml = refundRequest?.trackingToken
      ? `<p style="margin:8px 0 0"><a href="${getAppBaseUrl()}/vitrine.html?page=refund-tracking&token=${refundRequest.trackingToken}" style="color:#166534">Suivre mon remboursement →</a></p>`
      : '';

    let templateName;
    if (eligibleRefund) {
      templateName = 'booking_cancelled_refundable';
    } else if (waiverSigned) {
      templateName = 'booking_cancelled_not_refundable_waiver';
    } else {
      templateName = 'booking_cancelled_not_refundable_delay';
    }

    const template = await loadTemplate(templateName);
    if (!template) {
      console.warn(`[mailService] Template "${templateName}" introuvable`);
      return false;
    }

    const sender = buildSender();
    if (!sender) {
      console.warn('[mailService] MAIL_FROM inutilisable, email ignoré');
      return false;
    }

    const variables = await withMailThemeVars({
      firstname: client?.firstName || '',
      lastname: client?.lastName || '',
      sitename: 'Beauty Savage',
      servicename: service?.name || 'Prestation',
      bookingdate: bookingDate,
      bookingtime: bookingTime,
      practitionername: practitioner?.displayName || '',
      refundamount: refundAmountStr,
      trackingurl: trackingLinkHtml,
      cancellationdays: String(booking.consumerWaiverSnapshot?.refundDays ?? 7),
      bookingid: booking.bookingId || ''
    });

    const subject = replaceTemplateVariables(template.subject, variables) || template.subject;
    const htmlTemplate = template.fullHtml || template.bodyHtml || '';
    const htmlContent = htmlTemplate ? replaceTemplateVariables(htmlTemplate, variables) || htmlTemplate : '';
    let textTemplate = template.bodyHtml || '';
    if (!textTemplate && template.fullHtml) {
      textTemplate = stripHtml(template.fullHtml);
    }
    const textContent = textTemplate ? replaceTemplateVariables(textTemplate, variables) || textTemplate : '';

    const payload = {
      sender,
      to: [{ email: String(toEmail).trim() }],
      subject,
      tags: ['transactional', templateName]
    };
    if (htmlContent) payload.htmlContent = htmlContent;
    if (textContent) payload.textContent = textContent;

    const success = await postToBrevo(payload);
    if (success) {
      console.log(`[mailService] Mail ${templateName.toUpperCase()} envoyé à`, toEmail);
    }
    return success;
  } catch (err) {
    console.error('[mailService] sendBookingCancelledEmail error', err);
    return false;
  }
}

export async function sendBookingCancelledNotifyAdminEmail({
  booking,
  eligibleRefund = false,
  refundAmount = 0,
  refundRequest = null
} = {}) {
  try {
    // Récupérer l'email de la praticienne de la réservation
    const { default: PractitionerProfile } = await import('../models/PractitionerProfile.js');
    const profile = await PractitionerProfile.findById(booking.practitionerId)
      .populate('userId', 'email firstName lastName').lean();
    const practitionerEmail = profile?.userId?.email;
    if (!practitionerEmail) {
      console.warn('[mailService] sendBookingCancelledNotifyAdminEmail: praticienne sans email, email ignoré');
      return false;
    }

    // Récupérer le client depuis la DB pour avoir nom + email exacts
    const { default: User } = await import('../models/user.js');
    const client = await User.findById(booking.clientId).select('email firstName lastName').lean();
    const clientFullName = client
      ? `${client.firstName || ''} ${client.lastName || ''}`.trim()
      : '';
    const customerName = clientFullName || client?.email || 'Client inconnu';
    const clientEmail = client?.email || '';

    const service = booking.serviceId;
    const practitioner = booking.practitionerId;
    const startAt = booking.startAt ? new Date(booking.startAt) : null;

    const bookingDate = startAt
      ? startAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const bookingTime = startAt
      ? startAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';

    const refundAmountStr = eligibleRefund && refundAmount > 0 ? `${formatAmount(refundAmount)} €` : '';

    const refundSection = eligibleRefund && refundAmount > 0
      ? `Un remboursement de <strong>${formatAmount(refundAmount)} €</strong> sera traité dans les prochains jours ouvrés.`
      : eligibleRefund
        ? 'Un remboursement sera traité dans les prochains jours ouvrés.'
        : 'Cette annulation ne donne pas lieu à un remboursement.';

    // practitionerName depuis le profil populé ou le champ displayName si déjà populé
    const practitionerDisplayName = profile?.displayName || practitioner?.displayName || '';

    const template = await loadTemplate('booking_cancelled_notify_admin');
    if (!template) {
      console.warn('[mailService] Template "booking_cancelled_notify_admin" introuvable');
      return false;
    }

    const sender = buildSender();
    if (!sender) {
      console.warn('[mailService] MAIL_FROM inutilisable, email ignoré');
      return false;
    }

    const variables = await withMailThemeVars({
      customername: customerName,
      clientemail: clientEmail,
      sitename: 'Beauty Savage',
      servicename: service?.name || 'Prestation',
      bookingdate: bookingDate,
      bookingtime: bookingTime,
      practitionername: practitionerDisplayName,
      refundsection: refundSection,
      refundamount: refundAmountStr
    });

    const subject = replaceTemplateVariables(template.subject, variables) || template.subject;
    const htmlTemplate = template.fullHtml || template.bodyHtml || '';
    const htmlContent = htmlTemplate ? replaceTemplateVariables(htmlTemplate, variables) || htmlTemplate : '';
    let textTemplate = template.bodyHtml || '';
    if (!textTemplate && template.fullHtml) {
      textTemplate = stripHtml(template.fullHtml);
    }
    const textContent = textTemplate ? replaceTemplateVariables(textTemplate, variables) || textTemplate : '';

    const payload = {
      sender,
      to: [{ email: practitionerEmail }],
      subject,
      tags: ['transactional', 'booking_cancelled_notify_admin']
    };
    if (htmlContent) payload.htmlContent = htmlContent;
    if (textContent) payload.textContent = textContent;
    const ok = await postToBrevo(payload);
    if (ok) {
      console.log('[mailService] Mail BOOKING_CANCELLED_NOTIFY_ADMIN envoyé à praticienne', practitionerEmail);
    }
    return ok;
  } catch (err) {
    console.error('[mailService] sendBookingCancelledNotifyAdminEmail error', err);
    return false;
  }
}

export async function sendBookingCancelledByAdminEmail({
  booking,
  eligibleRefund = false,
  refundAmount = 0,
  refundRequest = null,
  refundReason = ''
} = {}) {
  const toEmail = booking?.clientId?.email;
  if (!toEmail) return false;
  try {
    const service = booking.serviceId;
    const practitioner = booking.practitionerId;
    const client = booking.clientId;
    const startAt = booking.startAt ? new Date(booking.startAt) : null;

    const bookingDate = startAt
      ? startAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const bookingTime = startAt
      ? startAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';

    const refundAmountStr = refundAmount > 0 ? `${formatAmount(refundAmount)} €` : '';

    const trackingUrl = refundRequest?.trackingToken
      ? `${getAppBaseUrl()}/vitrine.html?page=refund-tracking&token=${refundRequest.trackingToken}`
      : '';

    const template = await loadTemplate('booking_cancelled_admin');
    if (!template) {
      console.warn('[mailService] Template "booking_cancelled_admin" introuvable');
      return false;
    }

    const sender = buildSender();
    if (!sender) {
      console.warn('[mailService] MAIL_FROM inutilisable, email ignoré');
      return false;
    }

    const variables = await withMailThemeVars({
      firstname: client?.firstName || '',
      lastname: client?.lastName || '',
      sitename: 'Beauty Savage',
      servicename: service?.name || 'Prestation',
      bookingdate: bookingDate,
      bookingtime: bookingTime,
      practitionername: practitioner?.displayName || '',
      refundamount: refundAmountStr,
      refundreason: refundReason,
      trackingurl: trackingUrl
    });

    const subject = replaceTemplateVariables(template.subject, variables) || template.subject;
    const htmlTemplate = template.fullHtml || template.bodyHtml || '';
    const htmlContent = htmlTemplate ? replaceTemplateVariables(htmlTemplate, variables) || htmlTemplate : '';
    let textTemplate = template.bodyHtml || '';
    if (!textTemplate && template.fullHtml) {
      textTemplate = stripHtml(template.fullHtml);
    }
    const textContent = textTemplate ? replaceTemplateVariables(textTemplate, variables) || textTemplate : '';

    const payload = {
      sender,
      to: [{ email: String(toEmail).trim() }],
      subject,
      tags: ['transactional', 'booking_cancelled_admin']
    };
    if (htmlContent) payload.htmlContent = htmlContent;
    if (textContent) payload.textContent = textContent;

    const success = await postToBrevo(payload);
    if (success) {
      console.log('[mailService] Mail BOOKING_CANCELLED_ADMIN envoyé à', toEmail);
    }
    return success;
  } catch (err) {
    console.error('[mailService] sendBookingCancelledByAdminEmail error', err);
    return false;
  }
}

export async function sendNoShowEmail({ booking } = {}) {
  const toEmail = booking?.clientId?.email;
  if (!toEmail) return false;
  try {
    const service = booking.serviceId;
    const client = booking.clientId;
    const startAt = booking.startAt ? new Date(booking.startAt) : null;

    const bookingDate = startAt
      ? startAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const bookingTime = startAt
      ? startAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';

    const template = await loadTemplate('booking_no_show');
    if (!template) {
      console.warn('[mailService] Template "booking_no_show" introuvable');
      return false;
    }

    const sender = buildSender();
    if (!sender) {
      console.warn('[mailService] MAIL_FROM inutilisable, email ignoré');
      return false;
    }

    const variables = await withMailThemeVars({
      firstname: client?.firstName || '',
      sitename: 'Beauty Savage',
      servicename: service?.name || 'Prestation',
      bookingdate: bookingDate,
      bookingtime: bookingTime
    });

    const subject = replaceTemplateVariables(template.subject, variables) || template.subject;
    const htmlTemplate = template.fullHtml || template.bodyHtml || '';
    const htmlContent = htmlTemplate ? replaceTemplateVariables(htmlTemplate, variables) || htmlTemplate : '';
    let textTemplate = template.bodyHtml || '';
    if (!textTemplate && template.fullHtml) {
      textTemplate = stripHtml(template.fullHtml);
    }
    const textContent = textTemplate ? replaceTemplateVariables(textTemplate, variables) || textTemplate : '';

    const payload = {
      sender,
      to: [{ email: String(toEmail).trim() }],
      subject,
      tags: ['transactional', 'booking_no_show']
    };
    if (htmlContent) payload.htmlContent = htmlContent;
    if (textContent) payload.textContent = textContent;

    const success = await postToBrevo(payload);
    if (success) {
      console.log('[mailService] Mail BOOKING_NO_SHOW envoyé à', toEmail);
    }
    return success;
  } catch (err) {
    console.error('[mailService] sendNoShowEmail error', err);
    return false;
  }
}

export async function sendBookingSuspendedEmail({
  toEmail,
  firstName = '',
  noShowCount = 0,
  suspensionThreshold = 0,
  instituteName = 'Beauty Savage'
} = {}) {
  if (!toEmail) return false;
  try {
    const template = await loadTemplate('booking_suspended');
    if (!template) {
      console.warn('[mailService] Template "booking_suspended" introuvable');
      return false;
    }

    const sender = buildSender();
    if (!sender) {
      console.warn('[mailService] MAIL_FROM inutilisable, email ignoré');
      return false;
    }

    const variables = await withMailThemeVars({
      firstname: firstName,
      sitename: 'Beauty Savage',
      institutename: instituteName,
      noshowcount: String(noShowCount),
      suspensionthreshold: String(suspensionThreshold)
    });

    const subject = replaceTemplateVariables(template.subject, variables) || template.subject;
    const htmlTemplate = template.fullHtml || template.bodyHtml || '';
    const htmlContent = htmlTemplate ? replaceTemplateVariables(htmlTemplate, variables) || htmlTemplate : '';
    let textTemplate = template.bodyHtml || '';
    if (!textTemplate && template.fullHtml) {
      textTemplate = stripHtml(template.fullHtml);
    }
    const textContent = textTemplate ? replaceTemplateVariables(textTemplate, variables) || textTemplate : '';

    const payload = {
      sender,
      to: [{ email: String(toEmail).trim() }],
      subject,
      tags: ['transactional', 'booking_suspended']
    };
    if (htmlContent) payload.htmlContent = htmlContent;
    if (textContent) payload.textContent = textContent;

    const success = await postToBrevo(payload);
    if (success) {
      console.log('[mailService] Mail BOOKING_SUSPENDED envoyé à', toEmail);
    }
    return success;
  } catch (err) {
    console.error('[mailService] sendBookingSuspendedEmail error', err);
    return false;
  }
}

export async function sendBookingReminderEmail({ booking, hoursAhead = 24 } = {}) {
  const toEmail = booking?.clientId?.email;
  if (!toEmail) return false;
  try {
    const service = booking.serviceId;
    const practitioner = booking.practitionerId;
    const client = booking.clientId;
    const startAt = booking.startAt ? new Date(booking.startAt) : null;

    const timeLabel = hoursAhead <= 24
      ? 'demain'
      : hoursAhead >= 48
        ? `dans ${Math.round(hoursAhead / 24)} jours`
        : `dans ${hoursAhead} heure${hoursAhead > 1 ? 's' : ''}`;

    const bookingDate = startAt
      ? startAt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : '';
    const bookingTime = startAt
      ? startAt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      : '';

    const isDeposit = booking.paymentType === 'deposit';
    const paymentType = isDeposit ? 'Acompte' : 'Paiement complet';
    const depositAmount = isDeposit && booking.depositAmount != null
      ? `${Number(booking.depositAmount).toFixed(2)} €`
      : '';
    const remainingAmount = isDeposit && booking.totalPrice != null && booking.depositAmount != null
      ? `${(Number(booking.totalPrice) - Number(booking.depositAmount)).toFixed(2)} €`
      : '';

    const template = await loadTemplate('booking_reminder');

    if (!template) {
      console.warn('[mailService] Template "booking_reminder" introuvable');
      return false;
    }

    const sender = buildSender();
    if (!sender) {
      console.warn('[mailService] MAIL_FROM inutilisable, email ignoré');
      return false;
    }

    const variables = await withMailThemeVars({
      firstname: client?.firstName || '',
      lastname: client?.lastName || '',
      sitename: 'Beauty Savage',
      servicename: service?.name || 'Prestation',
      bookingdate: bookingDate,
      bookingtime: bookingTime,
      bookingdatetime: bookingDate && bookingTime ? `${bookingDate} à ${bookingTime}` : '',
      practitionername: practitioner?.displayName || '',
      cancellationdays: String(booking.cancellationPolicySnapshot?.cancellationDays ?? 7),
      timelabel: timeLabel,
      bookingid: booking.bookingId || '',
      paymenttype: paymentType,
      depositamount: depositAmount,
      remainingamount: remainingAmount
    });

    const subject = replaceTemplateVariables(template.subject, variables) || template.subject;
    const htmlTemplate = template.fullHtml || template.bodyHtml || '';
    const htmlContent = htmlTemplate ? replaceTemplateVariables(htmlTemplate, variables) || htmlTemplate : '';
    let textTemplate = template.bodyHtml || '';
    if (!textTemplate && template.fullHtml) {
      textTemplate = stripHtml(template.fullHtml);
    }
    const textContent = textTemplate ? replaceTemplateVariables(textTemplate, variables) || textTemplate : '';

    const payload = {
      sender,
      to: [{ email: String(toEmail).trim() }],
      subject,
      tags: ['transactional', 'booking_reminder']
    };
    if (htmlContent) payload.htmlContent = htmlContent;
    if (textContent) payload.textContent = textContent;

    const success = await postToBrevo(payload);
    if (success) {
      console.log('[mailService] Mail BOOKING_REMINDER envoyé à', toEmail);
    }
    return success;
  } catch (err) {
    console.error('[mailService] sendBookingReminderEmail error', err);
    return false;
  }
}

export async function simulateSaleEmail() {

  const sale = await pickRandomSale();

  if (!sale) {

    console.warn('[mailService] Aucune vente existante pour la simulation VENTE.');

    return { sale: null, success: false };

  }

  const success = await sendSaleEmail(sale);

  return { sale, success };

}



export const mailTemplateDefaults = TEMPLATE_FUNCTIONS;

export const mailFunctions = Array.from(AVAILABLE_FUNCTIONS);

