import mongoose from 'mongoose';
import Notification from '../models/Notification.js';
import NotificationConfig from '../models/NotificationConfig.js';
import { getSessionUserId } from '../utils/session.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildUserFilter(userId, userRole) {
  const now = new Date();
  return {
    $or: [
      { targetType: 'all' },
      { targetType: 'role', targetRole: userRole },
      { targetType: 'user', targetUserId: new mongoose.Types.ObjectId(String(userId)) }
    ],
    $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
  };
}

function buildAccessFilter(userId, userRole) {
  const now = new Date();
  return {
    $and: [
      {
        $or: [
          { targetType: 'all' },
          { targetType: 'role', targetRole: userRole },
          { targetType: 'user', targetUserId: new mongoose.Types.ObjectId(String(userId)) }
        ]
      },
      {
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }]
      }
    ]
  };
}

// ─── GET /api/gestion/notifications ───────────────────────────────────────────

export async function listNotifications(req, res) {
  const userId = getSessionUserId(req);
  const userRole = req.sessionUser?.role || 'admin';

  try {
    const limit = Math.min(parseInt(req.query.limit || '50', 10), 200);
    const unreadOnly = req.query.unreadOnly === 'true';

    const filter = buildAccessFilter(userId, userRole);
    if (unreadOnly) {
      filter.$and.push({ readBy: { $ne: new mongoose.Types.ObjectId(String(userId)) } });
    }

    const notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const unreadCount = await Notification.countDocuments({
      ...buildAccessFilter(userId, userRole),
      readBy: { $ne: new mongoose.Types.ObjectId(String(userId)) }
    });

    const serialized = notifications.map(n => ({
      id: n._id?.toString(),
      notificationId: n.notificationId,
      title: n.title,
      message: n.message,
      category: n.category,
      link: n.link,
      linkLabel: n.linkLabel,
      eventType: n.eventType,
      isRead: n.readBy?.some(id => String(id) === String(userId)) || false,
      createdAt: n.createdAt
    }));

    return res.json({ ok: true, notifications: serialized, unreadCount });
  } catch (err) {
    console.error('[notificationController] listNotifications error:', err.message);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── PATCH /api/gestion/notifications/:notificationId/read ────────────────────

export async function markAsRead(req, res) {
  const userId = getSessionUserId(req);
  const userRole = req.sessionUser?.role || 'admin';

  try {
    const { notificationId } = req.params;
    const filter = {
      notificationId,
      ...buildAccessFilter(userId, userRole)
    };

    const notif = await Notification.findOne(filter);
    if (!notif) return res.status(404).json({ ok: false, error: 'Notification introuvable.' });

    const oid = new mongoose.Types.ObjectId(String(userId));
    if (!notif.readBy.some(id => String(id) === String(userId))) {
      notif.readBy.push(oid);
      await notif.save();
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[notificationController] markAsRead error:', err.message);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── PATCH /api/gestion/notifications/read-all ────────────────────────────────

export async function markAllAsRead(req, res) {
  const userId = getSessionUserId(req);
  const userRole = req.sessionUser?.role || 'admin';

  try {
    const oid = new mongoose.Types.ObjectId(String(userId));
    await Notification.updateMany(
      {
        ...buildAccessFilter(userId, userRole),
        readBy: { $ne: oid }
      },
      { $push: { readBy: oid } }
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[notificationController] markAllAsRead error:', err.message);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── DELETE /api/gestion/notifications/:notificationId ────────────────────────

export async function deleteNotification(req, res) {
  const userId = getSessionUserId(req);
  const userRole = req.sessionUser?.role || 'admin';

  try {
    const { notificationId } = req.params;
    const result = await Notification.deleteOne({
      notificationId,
      ...buildAccessFilter(userId, userRole)
    });

    if (!result.deletedCount) {
      return res.status(404).json({ ok: false, error: 'Notification introuvable.' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[notificationController] deleteNotification error:', err.message);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── GET /api/gestion/notifications/config ────────────────────────────────────

export async function getConfig(req, res) {
  try {
    let config = await NotificationConfig.findOne().lean();
    if (!config) {
      return res.json({ ok: true, config: null });
    }
    return res.json({ ok: true, config });
  } catch (err) {
    console.error('[notificationController] getConfig error:', err.message);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── PUT /api/gestion/notifications/config ────────────────────────────────────

export async function updateConfig(req, res) {
  try {
    const { widgetPosition, pollingIntervalSeconds, notificationLifetimeDays, events, categories } = req.body || {};

    const update = {};
    if (typeof widgetPosition === 'string') update.widgetPosition = widgetPosition;
    if (typeof pollingIntervalSeconds === 'number') update.pollingIntervalSeconds = pollingIntervalSeconds;
    if (typeof notificationLifetimeDays === 'number') update.notificationLifetimeDays = notificationLifetimeDays;
    if (Array.isArray(events)) update.events = events;
    if (Array.isArray(categories)) update.categories = categories;

    const config = await NotificationConfig.findOneAndUpdate(
      {},
      { $set: update },
      { new: true, upsert: true, runValidators: true }
    );

    return res.json({ ok: true, config });
  } catch (err) {
    console.error('[notificationController] updateConfig error:', err.message);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}

// ─── DELETE /api/gestion/notifications/config/categories/:categoryId ──────────

export async function deleteCategory(req, res) {
  try {
    const { categoryId } = req.params;
    const config = await NotificationConfig.findOne();
    if (!config) return res.status(404).json({ ok: false, error: 'Config introuvable.' });

    const cat = config.categories.find(c => c.id === categoryId);
    if (!cat) return res.status(404).json({ ok: false, error: 'Catégorie introuvable.' });
    const affectedCount = config.events.filter(e => e.category === categoryId).length;

    config.categories = config.categories.filter(c => c.id !== categoryId);
    config.events = config.events.map(e => {
      if (e.category === categoryId) {
        const plain = e.toObject ? e.toObject() : { ...e };
        plain.category = null;
        return plain;
      }
      return e;
    });
    await config.save();

    return res.json({ ok: true, affectedEvents: affectedCount, config });
  } catch (err) {
    console.error('[notificationController] deleteCategory error:', err.message);
    return res.status(500).json({ ok: false, error: 'Erreur serveur.' });
  }
}
