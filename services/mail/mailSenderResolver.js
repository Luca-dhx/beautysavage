import { resolveSender } from '../communicationRoleResolver.js';

// S1B — Résolution de l'expéditeur des envois e-mail legacy directs.
// Source officielle = CommunicationIdentity (identité 'commerciale' active et vérifiée).
// MAIL_FROM/MAIL_FROM_NAME ne sont qu'un fallback STRICTEMENT dev/local (jamais en prod).
//
// Extrait de mailDomainDispatchers.js (module dédié → testable isolément).
//
// P1-1 — `buildSenderForRole(role)` honore le rôle d'expéditeur déclaré par les règles de dispatch
// (`mailDispatchRules.fromRole`) : les communications plateforme/technique (commission, incident de
// site) partent de `support`, les communications institut→client de `commerciale`. Avant ce correctif,
// TOUS les envois directs utilisaient `commerciale`, ignorant le `fromRole:'support'` des règles.
export async function buildSenderForRole(role = 'commerciale') {
  const normalizedRole = role === 'support' ? 'support' : 'commerciale';
  try {
    const sender = await resolveSender(normalizedRole);
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

// Rétro-compat : l'expéditeur commerciale (institut → client) reste le défaut historique.
export async function buildSender() {
  return buildSenderForRole('commerciale');
}
