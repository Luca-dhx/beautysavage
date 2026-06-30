import { NavLink, Outlet } from 'react-router-dom';
import { AppShell, Button } from '@bs/ui';
import { useAuth, roleLabel } from '@bs/auth';
import { NotificationBell, NotificationMotionProvider } from '../features/notifications';

const MANAGER_NAV = [
  { to: '/', label: 'Tableau de bord' },
  { to: '/clients', label: 'Clients' },
  { to: '/planning', label: 'Planning' },
  { to: '/reservations', label: 'Réservations' },
  { to: '/catalogue', label: 'Catalogue' },
  { to: '/avis', label: 'Avis' },
  { to: '/cartes-cadeaux/templates', label: 'Modèles carte cadeau' },
  { to: '/finance', label: 'Finance' },
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
      <a href="#manager-main" className="bs-skip-link">
        Aller au contenu
      </a>
      <div className="bs-sidebar-layout">
        <nav className="bs-sidebar" aria-label="Navigation principale">
          {MANAGER_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/'} className="bs-nav-link">
              {item.label}
            </NavLink>
          ))}
          {isDev ? (
            <NavLink to="/dev" className="bs-nav-link" style={{ fontWeight: 600 }}>
              Développeur
            </NavLink>
          ) : null}
        </nav>
        <div className="bs-sidebar-layout__main" id="manager-main">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
