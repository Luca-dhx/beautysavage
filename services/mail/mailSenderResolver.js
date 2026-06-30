import { resolveSender } from '../communicationRoleResolver.js';

// S1B — Résolution de l'expéditeur des envois e-mail legacy directs.
// Source officielle = CommunicationIdentity (identité 'commerciale' active et vérifiée).
// MAIL_FROM/MAIL_FROM_NAME ne sont qu'un fallback STRICTEMENT dev/local (jamais en prod).
//
// Extrait de mailDomainDispatchers.js (module dédié → testable isolément).
export async function buildSender() {
  try {
    const sender = await resolveSender('commerciale');
    const email = String(sender?.email || '').trim();
    if (email) {
      const name = String(sender?.name || '').trim();
      return { email, name: name || undefined };
    }
  } catch (_err) {
    // Identité non configurée → fallback dev-only ci-dessous.
  }

  // Fallback .env : dev/local uniquement (interdit en production).
  if (String(process.env.NODE_ENV || '').trim().toLowerCase() !== 'production') {
    const email = String(process.env.MAIL_FROM || '').trim();
    if (email) {
      const name = String(process.env.MAIL_FROM_NAME || '').trim();
      return { email, name: name || undefined };
    }
  }

  return null;
}
