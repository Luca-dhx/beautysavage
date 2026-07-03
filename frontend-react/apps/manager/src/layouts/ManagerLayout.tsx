// RX-BLOCKER — Layout manager. Desktop : sidebar persistante. Mobile (<720px) : la sidebar ne devient PLUS
// une top-bar dégradée ; un burger ouvre un DRAWER slide-in (overlay + Escape + fermeture au clic/lien +
// verrou de scroll). Zones tactiles ≥44px, reduced-motion.
import { useCallback, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { AppShell, Button, IconButton } from '@bs/ui';
import { useAuth, roleLabel } from '@bs/auth';
import { NotificationBell, NotificationMotionProvider } from '../features/notifications';
import './managerLayout.css';

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
  { to: '/finance/commissions', label: 'Commissions' },
  { to: '/communication', label: 'Communication' },
  { to: '/parametres', label: 'Paramètres' },
];

function NavItems({ isDev, onNavigate }: { isDev: boolean; onNavigate?: () => void }) {
  return (
    <>
      {MANAGER_NAV.map((item) => (
        <NavLink key={item.to} to={item.to} end={item.to === '/'} className="bs-nav-link" onClick={onNavigate}>
          {item.label}
        </NavLink>
      ))}
      {isDev ? (
        <>
          {/* RX-BLOCKER-2 — gestion des comptes manager, dev-only */}
          <NavLink to="/users" className="bs-nav-link" onClick={onNavigate}>
            Utilisateurs
          </NavLink>
          <NavLink to="/dev" className="bs-nav-link" style={{ fontWeight: 600 }} onClick={onNavigate}>
            Développeur
          </NavLink>
        </>
      ) : null}
    </>
  );
}

export function ManagerLayout() {
  const { user, signOut } = useAuth();
  const isDev = user?.role === 'dev';
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const close = useCallback(() => setOpen(false), []);

  // Fermer le drawer à chaque changement de route.
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Escape + verrou de scroll quand le drawer est ouvert.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <AppShell
      header={
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <IconButton label="Ouvrir le menu" className="bs-sidebar-burger" aria-expanded={open} onClick={() => setOpen(true)}>
            <i className="bi bi-list" aria-hidden="true" />
          </IconButton>
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
      footer={<span>Espace de gestion</span>}
    >
      <a href="#manager-main" className="bs-skip-link">
        Aller au contenu
      </a>
      <div className="bs-sidebar-layout">
        {/* Sidebar persistante (desktop) — masquée en mobile (cf. polish.css) au profit du drawer. */}
        <nav className="bs-sidebar bs-sidebar--primary" aria-label="Navigation principale">
          <NavItems isDev={isDev} />
        </nav>
        <div className="bs-sidebar-layout__main" id="manager-main">
          <Outlet />
        </div>
      </div>

      {/* Drawer de navigation mobile (burger). */}
      {open ? (
        <div className="bs-msidebar-root">
          <div className="bs-msidebar-scrim" onClick={close} aria-hidden="true" />
          <nav className="bs-msidebar" role="dialog" aria-modal="true" aria-label="Menu de navigation">
            <div className="bs-msidebar__head">
              <strong>Navigation</strong>
              <IconButton label="Fermer le menu" onClick={close}>
                <i className="bi bi-x-lg" aria-hidden="true" />
              </IconButton>
            </div>
            <NavItems isDev={isDev} onNavigate={close} />
          </nav>
        </div>
      ) : null}
    </AppShell>
  );
}
