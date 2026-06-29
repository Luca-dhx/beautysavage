import { Link, Outlet } from 'react-router-dom';
import { AppShell, Button } from '@bs/ui';
import { useAuth, roleLabel } from '@bs/auth';
import { NotificationBell, NotificationMotionProvider } from '../features/notifications';

const MANAGER_NAV = [
  { to: '/', label: 'Tableau de bord' },
  { to: '/clients', label: 'Clients' },
  { to: '/planning', label: 'Planning' },
  { to: '/reservations', label: 'Réservations' },
  { to: '/prestations', label: 'Prestations' },
  { to: '/formations', label: 'Formations' },
  { to: '/produits', label: 'Produits' },
  { to: '/cartes-cadeaux', label: 'Cartes cadeaux' },
  { to: '/ventes', label: 'Ventes' },
  { to: '/remboursements', label: 'Remboursements' },
  { to: '/commissions', label: 'Commissions' },
  { to: '/communication', label: 'Communication' },
  { to: '/parametres', label: 'Paramètres' },
];

export function ManagerLayout() {
  const { user, signOut } = useAuth();
  const isDev = user?.role === 'dev';
  return (
    <AppShell
      header={
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <strong style={{ marginRight: 'auto' }}>Beauty Savage — Espace {roleLabel(user?.role) || 'Manager'}</strong>
          <span style={{ opacity: 0.6 }}>{user?.email}</span>
          <NotificationMotionProvider>
            <NotificationBell scope="admin" />
          </NotificationMotionProvider>
          <Button variant="secondary" onClick={() => void signOut()}>
            Déconnexion
          </Button>
        </div>
      }
      footer={<span>Espace de gestion (placeholders R0)</span>}
    >
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 180 }}>
          {MANAGER_NAV.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
          {isDev ? (
            <Link to="/dev" style={{ marginTop: 12, fontWeight: 600 }}>
              Développeur
            </Link>
          ) : null}
        </nav>
        <div style={{ flex: 1 }}>
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
