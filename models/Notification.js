import crypto from 'node:crypto';
import mongoose from 'mongoose';

function buildNotificationId() {
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase();
  return `NOTIF-${suffix}`;
}

const notificationSchema = new mongoose.Schema({
  notificationId: {
    type: String,
    unique: true,
    default: buildNotificationId
  },

  // Contenu
  title: { type: String, required: true },
  message: { type: String, required: true },
  category: {
    type: String,
    enum: ['prestations', 'formations', 'ventes', 'système', 'remboursements', 'clients'],
    default: 'système'
  },

  // Destinataires
  targetType: {
    type: String,
    enum: ['all', 'role', 'user'],
    default: 'all'
  },
  targetRole: { type: String, default: null },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Lien cliquable
  link: { type: String, default: null },
  linkLabel: { type: String, default: null },

  // Métadonnées
  eventType: { type: String, default: null },
  variables: { type: mongoose.Schema.Types.Mixed, default: {} },

  // Statuts de lecture
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  // Expiration
  expiresAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now }
});

notificationSchema.index({ targetType: 1, targetRole: 1, targetUserId: 1, createdAt: -1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ expiresAt: 1 }, { sparse: true, expireAfterSeconds: 0 });

const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
