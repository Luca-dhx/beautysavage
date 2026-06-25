// controllers/brevoWebhookController.js
// Receives Brevo transactional webhooks (delivered / opened / hard_bounce /
// soft_bounce) and updates the matching SendLog by providerMessageId.
//
// SECURITY: Brevo does NOT sign webhooks with HMAC. Protection here is an OPTIONAL
// shared secret (header `x-brevo-secret` or `?secret=`), resolved from the vault
// (brevo/webhook_secret) or env BREVO_WEBHOOK_SECRET. If none is configured the
// endpoint accepts events but logs a one-time warning (documented V1 limitation;
// add the secret + an IP allowlist for production).
//
// PRIVACY: never logs the recipient email or any secret.

import crypto from 'node:crypto';
import { applyBrevoEvent } from '../services/sendLogService.js';
import { getCredential } from '../services/integratedApiCredentialService.js';

let warnedNoSecret = false;

async function resolveBrevoWebhookSecret() {
  try {
    const fromVault = await getCredential('brevo', { role: 'webhook_secret' });
    if (fromVault) return String(fromVault).trim();
  } catch (_err) {
    // no vault credential — fall through to env
  }
  const fromEnv = String(process.env.BREVO_WEBHOOK_SECRET || '').trim();
  return fromEnv || null;
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a || ''));
  const bufB = Buffer.from(String(b || ''));
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function extractMessageId(e) {
  return String(e?.['message-id'] || e?.messageId || e?.message_id || '').trim();
}

export async function handleBrevoWebhook(req, res) {
  const expected = await resolveBrevoWebhookSecret();
  if (expected) {
    const provided = String(req.get?.('x-brevo-secret') || req.headers?.['x-brevo-secret'] || req.query?.secret || '').trim();
    if (!safeEqual(provided, expected)) {
      return res.status(401).json({ ok: false, error: 'Webhook secret invalide.' });
    }
  } else if (!warnedNoSecret) {
    warnedNoSecret = true;
    console.warn('[brevoWebhook] No BREVO_WEBHOOK_SECRET configured — endpoint is unauthenticated (V1). Configure a secret + IP allowlist for production.');
  }

  const body = req.body;
  const events = Array.isArray(body) ? body : [body];
  let processed = 0;

  for (const e of events) {
    if (!e || typeof e !== 'object') continue;
    const event = String(e.event || '').trim();
    const messageId = extractMessageId(e);
    let result = { matched: false };
    try {
      result = await applyBrevoEvent({ event, messageId });
    } catch (err) {
      console.error('[brevoWebhook] apply event failed:', err?.message || err);
    }
    if (result.matched) processed += 1;
    // Never log the email — only the event name and whether it matched a SendLog.
    console.log(`[brevoWebhook] event=${event || 'unknown'} matched=${Boolean(result.matched)}`);
  }

  // Always 200 for accepted requests (avoid provider retry storms).
  return res.status(200).json({ ok: true, received: events.length, processed });
}

export default handleBrevoWebhook;
