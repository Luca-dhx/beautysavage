// M8 — Type runtime d'une notification (objet créé par le moteur `triggerNotification`).
// Le moteur consomme désormais les NotificationTemplate publiés (M7) : la notification
// porte une catégorie (snapshot icône/couleur), une priorité, un flag persistent et une
// action MÉTIER. La cible (`targetRole` admin|dev) reste choisie par le moteur (M3A),
// JAMAIS par le template.
//
// NB : il n'existe pas encore d'endpoint « centre de notifications » React (refonte = M9).
// Ce module est volontairement TYPES-ONLY pour préparer ce consommateur sans casser le
// studio M7.
import type { NotificationPriority } from './notificationTemplates';

export type NotificationTargetRole = 'admin' | 'dev';
export type NotificationTargetType = 'all' | 'role' | 'user';

// Provenance « template runtime » (cf. backend Notification.templateRuntimeStatus).
export type NotificationRuntimeStatus =
  | 'template'
  | 'fallback_template_missing'
  | 'legacy_runtime_disabled'
  | null;

// Snapshot SAFE de la catégorie au moment de l'envoi (source des icône/couleur du centre).
export interface NotificationCategorySnapshot {
  name: string | null;
  slug: string | null;
  icon: string | null;
  color: string | null;
}

export interface RuntimeNotification {
  notificationId: string;
  title: string;
  message: string;

  // Audience (M3A) — choisie par le moteur.
  targetRole: NotificationTargetRole;
  targetType: NotificationTargetType;

  // M8 — provenance template + métadonnées de présentation.
  templateKey: string | null;
  templateVersion: number | null;
  categoryId: string | null;
  categorySnapshot: NotificationCategorySnapshot | null;
  priority: NotificationPriority;
  persistent: boolean;
  action: string | null;
  templateRuntimeStatus: NotificationRuntimeStatus;

  link: string | null;
  linkLabel: string | null;
  eventType: string | null;
  createdAt: string | null;
  expiresAt: string | null;
}

/**
 * Couleur d'affichage d'une notification : la couleur de la catégorie (snapshot) est la
 * SOURCE unique. Renvoie `null` si absente → le composant applique son token `--bs-*`.
 */
export function notificationDisplayColor(n: Pick<RuntimeNotification, 'categorySnapshot'>): string | null {
  const color = n.categorySnapshot?.color;
  return color && color.trim() ? color : null;
}

/**
 * Icône d'affichage d'une notification : icône de la catégorie (snapshot), défaut `bi-bell`.
 */
export function notificationDisplayIcon(n: Pick<RuntimeNotification, 'categorySnapshot'>): string {
  const icon = n.categorySnapshot?.icon;
  return icon && icon.trim() ? icon : 'bi-bell';
}
