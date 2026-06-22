import Notification from '../models/Notification.js';
import NotificationConfig from '../models/NotificationConfig.js';
import PractitionerProfile from '../models/PractitionerProfile.js';

function interpolateTemplate(template, variables) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return variables[key] !== undefined ? String(variables[key]) : match;
  });
}

/**
 * Déclenche une notification à partir d'un eventType et de variables.
 * Non bloquant — toujours appelé avec void, erreurs silencieuses.
 */
export async function triggerNotification(eventType, variables = {}) {
  try {
    const config = await NotificationConfig.findOne().lean();
    if (!config) return;

    const eventConfig = config.events?.find(e => e.eventType === eventType && e.isActive);
    if (!eventConfig) return;

    const title = interpolateTemplate(eventConfig.titleTemplate, variables);
    const message = interpolateTemplate(eventConfig.messageTemplate, variables);

    let targetType = eventConfig.targetType;
    let targetRole = eventConfig.targetRole || null;
    let targetUserId = null;

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
      expiresAt
    });
  } catch (err) {
    console.error('[notificationService] triggerNotification error:', eventType, err?.message || err);
  }
}
