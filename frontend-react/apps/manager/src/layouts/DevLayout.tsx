import { Link, Outlet } from 'react-router-dom';

const DEV_NAV = [
  { to: '/dev', label: 'Vue dev', end: true },
  { to: '/dev/contrats', label: 'Contrats' },
  { to: '/dev/commissions', label: 'Commissions' },
  { to: '/dev/integrated-api', label: 'API intégrée' },
  { to: '/dev/email-templates', label: 'Templates email' },
  { to: '/dev/send-logs', label: 'Logs d’envoi' },
  { to: '/dev/event-logs', label: 'Logs d’événements' },
  { to: '/dev/webhook-failures', label: 'Échecs webhook' },
];

export function DevLayout() {
  return (
    <section>
      <nav style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        {DEV_NAV.map((item) => (
          <Link key={item.to} to={item.to}>
            {item.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </section>
  );
}
