import { Link, Outlet } from 'react-router-dom';
import { AppShell } from '@bs/ui';
import { useAuth } from '@bs/auth';
import { SiteStatusBanner } from '../features/catalog/components/SiteStatusBanner';

const NAV = [
  { to: '/', label: 'Accueil' },
  { to: '/prestations', label: 'Prestations' },
  { to: '/formations', label: 'Formations' },
  { to: '/produits', label: 'Produits' },
  { to: '/cartes-cadeaux', label: 'Cartes cadeaux' },
  { to: '/mes-formations', label: 'Mes formations' },
  { to: '/panier', label: 'Panier' },
];

export function PublicLayout() {
  const { status, user } = useAuth();
  return (
    <AppShell
      header={
        <nav style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <strong style={{ marginRight: 'auto' }}>Beauty Savage</strong>
          {NAV.map((item) => (
            <Link key={item.to} to={item.to}>
              {item.label}
            </Link>
          ))}
          <span style={{ opacity: 0.6 }}>
            {status === 'authenticated' ? (user?.email ?? 'Connecté') : <Link to="/connexion">Connexion</Link>}
          </span>
        </nav>
      }
      footer={<span>Beauty Savage — mentions légales · CGV · confidentialité (placeholders R0)</span>}
    >
      <SiteStatusBanner />
      <Outlet />
    </AppShell>
  );
}
