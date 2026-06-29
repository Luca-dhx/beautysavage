import Notification from '../models/Notification.js';
import NotificationConfig from '../models/NotificationConfig.js';
import PractitionerProfile from '../models/PractitionerProfile.js';
import {
  resolveNotificationTargetRole,
  normalizeNotificationTargetRole
} from './notificationTargetService.js';

function interpolateTemplate(template, variables) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : match;
  });
}

/**
 * Déclenche une notification à partir d'un eventType et de variables.
 * Non bloquant — toujours appelé avec void, erreurs silencieuses.
 *
 * M3A — `targetRole` (audience admin|dev) est désormais TOUJOURS persisté.
 * Résolution (priorité décroissante) :
 *   1. `options.targetRole` explicite ;
 *   2. `variables.targetRole` / `variables.__targetRole` ;
 *   3. `eventConfig.targetRole` (config) ;
 *   4. mapping par type via `resolveNotificationTargetRole`.
 * Anciens appelants `triggerNotification(type, vars)` non impactés (3e arg optionnel).
 *
 * M3B — `options.event` (corrélation event→notification) : { eventId, eventName,
 * contextType, contextId } persistés (champs SAFE). Aucun e-mail/secret.
 *
 * @param {string} eventType
 * @param {object} [variables]
 * @param {{targetRole?: 'admin'|'dev', event?: {eventId?: any, eventName?: string, contextType?: string, contextId?: any}}} [options]
 */
export async function triggerNotification(eventType, variables = {}, options = {}) {
  try {
    const config = await NotificationConfig.findOne().lean();
    if (!config) return;

    const eventConfig = config.events?.find(e => e.eventType === eventType && e.isActive);
    if (!eventConfig) return;

    const title = interpolateTemplate(eventConfig.titleTemplate, variables);
    const message = interpolateTemplate(eventConfig.messageTemplate, variables);

    let targetType = eventConfig.targetType;
    let targetUserId = null;

    // M3A — audience (panel) : admin | dev. Jamais null.
    const targetRole =
      normalizeNotificationTargetRole(
        options?.targetRole ?? variables?.targetRole ?? variables?.__targetRole ?? eventConfig.targetRole
      ) || resolveNotificationTargetRole(eventType, variables);

    if (targetType === 'user_concerned') {
      const practitionerProfileId = variables.userId;
      if (practitionerProfileId) {
        const profile = await PractitionerProfile.findById(practitionerProfileId)
          .select('userId').lean();
        targetUserId = profile?.userId || null;
      }
      targetType = targetUserId ? 'user' : 'all';
    }

    const expiresAt =
      config.notificationLifetimeDays > 0
        ? new Date(Date.now() + config.notificationLifetimeDays * 24 * 60 * 60 * 1000)
        : null;

    // M3B — corrélation event→notification (champs SAFE uniquement).
    const ev = options?.event || {};
    const eventId = ev.eventId ?? null;
    const eventName = ev.eventName != null ? String(ev.eventName) : null;
    const contextType = ev.contextType != null ? String(ev.contextType) : null;
    const contextId = ev.contextId != null ? String(ev.contextId) : null;

    await Notification.create({
      title,
      message,
      category: eventConfig.category,
      targetType,
      targetRole,
      targetUserId: targetUserId || null,
      link: variables.link || null,
      linkLabel: variables.linkLabel || null,
      eventType,
      variables,
      eventId,
      eventName,
      contextType,
      contextId,
      expiresAt
    });
  } catch (err) {
    console.error('[notificationService] triggerNotification error:', eventType, err?.message || err);
  }
}
