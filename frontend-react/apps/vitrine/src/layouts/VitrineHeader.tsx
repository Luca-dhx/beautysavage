import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Drawer, IconButton, Badge } from '@bs/ui';
import { useAuth } from '@bs/auth';
import { useCart } from '../features/cart';

// RX3 — En-tête vitrine premium : marque, navigation active (NavLink), panier avec badge,
// et menu burger → Drawer partagé sur mobile. Mobile-first, cibles ≥44px, tokens --bs-* only.

interface NavEntry {
  to: string;
  label: string;
  end?: boolean;
}

const PRIMARY_NAV: NavEntry[] = [
  { to: '/', label: 'Accueil', end: true },
  { to: '/prestations', label: 'Prestations' },
  { to: '/formations', label: 'Formations' },
  { to: '/produits', label: 'Produits' },
  { to: '/cartes-cadeaux', label: 'Cartes cadeaux' },
];

function CartLink({ count }: { count: number }) {
  return (
    <NavLink to="/panier" className="bs-nav-link vh-cart" aria-label={`Panier${count > 0 ? `, ${count} article${count > 1 ? 's' : ''}` : ''}`}>
      <i className="bi bi-bag" aria-hidden="true" />
      <span className="vh-cart__text">Panier</span>
      {count > 0 ? (
        <span className="vh-cart__badge">
          <Badge tone="accent">{count}</Badge>
        </span>
      ) : null}
    </NavLink>
  );
}

export function VitrineHeader() {
  const { status, user } = useAuth();
  const { summary } = useCart();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Ferme le menu mobile à chaque changement de route.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const accountEntry: NavEntry =
    status === 'authenticated' ? { to: '/mon-compte', label: 'Mon compte' } : { to: '/connexion', label: 'Connexion' };

  return (
    <div className="vh">
      <Link to="/" className="vh__brand" aria-label="Beauty Savage — accueil">
        Beauty Savage
      </Link>

      {/* Navigation principale (desktop) */}
      <nav className="vh__nav" aria-label="Navigation principale">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="bs-nav-link">
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Actions (toujours visibles) */}
      <div className="vh__actions">
        <CartLink count={summary.count} />
        <NavLink to={accountEntry.to} className="bs-nav-link vh__account" title={user?.email ?? accountEntry.label}>
          <i className="bi bi-person-circle" aria-hidden="true" />
          <span className="vh__account-text">{accountEntry.label}</span>
        </NavLink>
        <span className="vh__burger">
          <IconButton label="Ouvrir le menu" onClick={() => setMenuOpen(true)}>
            <i className="bi bi-list" aria-hidden="true" />
          </IconButton>
        </span>
      </div>

      {/* Menu mobile (Drawer partagé) */}
      <Drawer open={menuOpen} title="Menu" side="left" onClose={() => setMenuOpen(false)} closeLabel="Fermer le menu">
        <nav className="vh-menu" aria-label="Navigation">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="bs-nav-link vh-menu__link">
              {item.label}
            </NavLink>
          ))}
          <hr className="vh-menu__sep" />
          <NavLink to="/mes-formations" className="bs-nav-link vh-menu__link">
            Mes formations
          </NavLink>
          <NavLink to={accountEntry.to} className="bs-nav-link vh-menu__link">
            {accountEntry.label}
          </NavLink>
        </nav>
      </Drawer>
    </div>
  );
}
