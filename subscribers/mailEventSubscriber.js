// subscribers/mailEventSubscriber.js
// M2 — Écoute les events listés dans mailDispatchRules et délègue au moteur de dispatch par rôles.
// flag MAIL_ROLE_RESOLVER_ENABLED=false → no-op. Best-effort : ne casse JAMAIS l'action métier.
import { subscribe } from '../services/eventBusService.js';
import { listDispatchableEventNames, isMailRoleResolverEnabled } from '../constants/mailDispatchRules.js';
import { dispatchMailForEvent } from '../services/mail/mailEventDispatchService.js';

export async function handleMailEvent(eventLog) {
  try {
    if (!isMailRoleResolverEnabled()) return; // flag off → no-op (envois existants inchangés)
    await dispatchMailForEvent({
      eventName: eventLog?.eventName,
      contextType: eventLog?.contextType,
      contextId: eventLog?.contextId,
      payloadSafe: eventLog?.payloadSafe
    });
  } catch (err) {
    // Best-effort : on n'interrompt jamais l'émetteur d'event.
    console.error('[mailEventSubscriber] handler error:', err?.message || err);
  }
}

// Register (Set dedup côté bus ⇒ idempotent à l'appel).
export function registerMailEventSubscribers() {
  for (const eventName of listDispatchableEventNames()) {
    subscribe(eventName, handleMailEvent);
  }
}

export default registerMailEventSubscribers;
