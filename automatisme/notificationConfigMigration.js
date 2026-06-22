import NotificationConfig from '../models/NotificationConfig.js';
import Page from '../models/Page.js';

const DEFAULT_CATEGORIES = [
  { id: 'prestations',    label: 'Prestations',    icon: 'bi-scissors',          color: '#e4b690' },
  { id: 'formations',     label: 'Formations',     icon: 'bi-mortarboard',       color: '#a8876b' },
  { id: 'ventes',         label: 'Ventes',         icon: 'bi-cash-stack',        color: '#22c55e' },
  { id: 'système',        label: 'Système',        icon: 'bi-gear',              color: '#6b7280' },
  { id: 'remboursements', label: 'Remboursements', icon: 'bi-arrow-return-left', color: '#ef4444' },
  { id: 'clients',        label: 'Clients',        icon: 'bi-people',            color: '#3b82f6' }
];

const DEFAULT_EVENTS = [
  {
    eventType: 'booking_created',
    label: 'Nouvelle réservation prestation',
    isActive: true,
    category: 'prestations',
    targetType: 'user_concerned',
    targetRole: null,
    titleTemplate: 'Nouvelle réservation — {{serviceName}}',
    messageTemplate: '{{clientName}} a réservé le {{bookingDate}} à {{bookingTime}}',
    availableVariables: ['clientName', 'serviceName', 'bookingDate', 'bookingTime', 'userId']
  },
  {
    eventType: 'booking_cancelled_client',
    label: 'Annulation réservation par le client',
    isActive: true,
    category: 'prestations',
    targetType: 'user_concerned',
    targetRole: null,
    titleTemplate: 'Réservation annulée — {{serviceName}}',
    messageTemplate: '{{clientName}} a annulé sa réservation du {{bookingDate}}',
    availableVariables: ['clientName', 'serviceName', 'bookingDate']
  },
  {
    eventType: 'booking_rescheduled_client',
    label: 'Réservation/session décalée par le client',
    isActive: true,
    category: 'prestations',
    targetType: 'user_concerned',
    targetRole: null,
    titleTemplate: 'Réservation décalée — {{serviceName}}',
    messageTemplate: '{{clientName}} a décalé sa réservation au {{newBookingDate}}',
    availableVariables: ['clientName', 'serviceName', 'newBookingDate']
  },
  {
    eventType: 'no_show_recorded',
    label: 'No-show enregistré',
    isActive: true,
    category: 'prestations',
    targetType: 'role',
    targetRole: 'admin',
    titleTemplate: 'No-show — {{serviceName}}',
    messageTemplate: '{{clientName}} ne s\'est pas présenté(e) le {{bookingDate}}',
    availableVariables: ['clientName', 'serviceName', 'bookingDate']
  },
  {
    eventType: 'new_sale',
    label: 'Nouvelle vente',
    isActive: true,
    category: 'ventes',
    targetType: 'role',
    targetRole: 'admin',
    titleTemplate: 'Nouvelle vente — {{amount}} €',
    messageTemplate: 'Vente {{saleId}} enregistrée',
    availableVariables: ['saleId', 'amount']
  },
  {
    eventType: 'refund_requested',
    label: 'Remboursement demandé',
    isActive: true,
    category: 'remboursements',
    targetType: 'role',
    targetRole: 'admin',
    titleTemplate: 'Remboursement — {{amount}} €',
    messageTemplate: '{{clientName}} a demandé un remboursement de {{amount}} €',
    availableVariables: ['clientName', 'amount']
  },
  {
    eventType: 'new_client',
    label: 'Nouveau client inscrit',
    isActive: true,
    category: 'clients',
    targetType: 'role',
    targetRole: 'admin',
    titleTemplate: 'Nouveau client inscrit',
    messageTemplate: '{{clientName}} ({{clientEmail}}) vient de s\'inscrire',
    availableVariables: ['clientName', 'clientEmail']
  },
  {
    eventType: 'formation_session_cancelled',
    label: 'Session de formation annulée',
    isActive: true,
    category: 'formations',
    targetType: 'role',
    targetRole: 'admin',
    titleTemplate: 'Session annulée — {{formationName}}',
    messageTemplate: 'La session du {{sessionDate}} a été annulée',
    availableVariables: ['formationName', 'sessionDate']
  },
  {
    eventType: 'formation_distancielle_purchased',
    label: 'Achat formation distancielle',
    isActive: true,
    category: 'formations',
    targetType: 'role',
    targetRole: 'admin',
    titleTemplate: 'Formation achetée — {{formationName}}',
    messageTemplate: '{{clientName}} a acheté "{{formationName}}"',
    availableVariables: ['clientName', 'formationName', 'saleId', 'amount']
  },
  {
    eventType: 'formation_presentielle_purchased',
    label: 'Achat formation présentielle',
    isActive: true,
    category: 'formations',
    targetType: 'role',
    targetRole: 'admin',
    titleTemplate: 'Formation présentielle — {{formationName}}',
    messageTemplate: '{{clientName}} · Session {{sessionDate}} {{sessionTime}} · {{optionsCount}} option(s)',
    availableVariables: ['clientName', 'formationName', 'sessionDate', 'sessionTime', 'optionsCount', 'saleId']
  },
  {
    eventType: 'formation_participation_cancelled',
    label: 'Annulation participation formation par le client',
    isActive: true,
    category: 'formations',
    targetType: 'role',
    targetRole: 'admin',
    titleTemplate: 'Annulation formation — {{formationName}}',
    messageTemplate: '{{clientName}} a annulé sa participation à "{{formationName}}" (session du {{sessionDate}})',
    availableVariables: ['clientName', 'formationName', 'sessionDate', 'saleId']
  }
];

export async function runNotificationConfigMigration() {
  try {
    let config = await NotificationConfig.findOne();

    if (!config) {
      await NotificationConfig.create({
        widgetPosition: 'bottom-right',
        pollingIntervalSeconds: 30,
        notificationLifetimeDays: 30,
        categories: DEFAULT_CATEGORIES,
        events: DEFAULT_EVENTS
      });
      console.log('[NotificationConfig] Config par défaut créée avec', DEFAULT_EVENTS.length, 'événements et', DEFAULT_CATEGORIES.length, 'catégories');
    } else {
      let changed = false;

      // Migrate categories if missing
      if (!config.categories || config.categories.length === 0) {
        config.categories = DEFAULT_CATEGORIES;
        changed = true;
        console.log('[NotificationConfig] Catégories par défaut ajoutées');
      }

      // Add missing events
      const existingTypes = new Set(config.events.map(e => e.eventType));
      const newEvents = DEFAULT_EVENTS.filter(e => !existingTypes.has(e.eventType));
      if (newEvents.length > 0) {
        config.events.push(...newEvents);
        changed = true;
        console.log('[NotificationConfig]', newEvents.length, 'événement(s) ajouté(s):', newEvents.map(e => e.eventType).join(', '));
      }

      if (changed) await config.save();
    }
  } catch (err) {
    console.error('[NotificationConfig] Erreur migration:', err?.message || err);
  }

  // Upsert gestion page
  try {
    const slug = 'notifications';
    const existing = await Page.findOne({ slug }).lean();
    if (!existing) {
      await Page.create({
        slug,
        moduleFile: 'notificationManager',
        type: 'gestion',
        order: 90,
        navigationPlacement: null,
        allowedRolesGestion: ['admin', 'dev'],
        access: { public: false, requiresAuth: true, requiresPurchase: false }
      });
      console.log('[NotificationConfig] Page gestion "notifications" créée.');
    }
  } catch (err) {
    console.error('[NotificationConfig] Erreur création page gestion:', err?.message || err);
  }
}
