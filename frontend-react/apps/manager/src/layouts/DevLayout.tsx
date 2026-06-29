import { Link, Outlet } from 'react-router-dom';
import { NotificationBell, NotificationMotionProvider } from '../features/notifications';

const DEV_NAV = [
  { to: '/dev', label: 'Vue dev', end: true },
  { to: '/dev/contrats', label: 'Contrats' },
  { to: '/dev/commissions', label: 'Commissions' },
  { to: '/dev/integrated-api', label: 'API intégrée' },
  { to: '/dev/communication', label: 'Communication' },
  { to: '/dev/theme-studio', label: 'Theme Studio' },
  { to: '/dev/email-templates', label: 'Templates email' },
  { to: '/dev/notification-templates', label: 'Notifications' },
  { to: '/dev/send-logs', label: 'Logs d’envoi' },
  { to: '/dev/event-logs', label: 'Logs d’événements' },
  { to: '/dev/webhook-failures', label: 'Échecs webhook' },
];

export function DevLayout() {
  return (
    <section>
      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, alignItems: 'center' }}>
        {DEV_NAV.map((item) => (
          <Link key={item.to} to={item.to}>
            {item.label}
          </Link>
        ))}
        {/* M9 — cloche scope dev (montée uniquement dans l'espace dev : audience dev stricte). */}
        <span style={{ marginLeft: 'auto' }}>
          <NotificationMotionProvider>
            <NotificationBell scope="dev" />
          </NotificationMotionProvider>
        </span>
      </nav>
      <Outlet />
    </section>
  );
}
