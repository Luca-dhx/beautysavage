import { Link } from 'react-router-dom';

// RX3 — Pied de page vitrine réel (remplace le placeholder R0). Colonnes marque / navigation /
// légal / réseaux. Les routes légales existent désormais (LegalPage). Tokens --bs-* only.

const NAV_LINKS = [
  { to: '/', label: 'Accueil' },
  { to: '/prestations', label: 'Prestations' },
  { to: '/formations', label: 'Formations' },
  { to: '/cartes-cadeaux', label: 'Cartes cadeaux' },
];

const LEGAL_LINKS = [
  { to: '/mentions-legales', label: 'Mentions légales' },
  { to: '/cgv', label: 'CGV' },
  { to: '/confidentialite', label: 'Confidentialité' },
];

export function VitrineFooter() {
  const year = new Date().getFullYear();
  return (
    <div className="vf">
      <div className="vf__brand">
        <strong className="vf__name">Beauty Savage</strong>
        <p className="vf__tagline">Prestations, formations & cartes cadeaux.</p>
      </div>
      <nav className="vf__col" aria-label="Navigation pied de page">
        <span className="vf__col-title">Explorer</span>
        {NAV_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="vf__link">
            {l.label}
          </Link>
        ))}
      </nav>
      <nav className="vf__col" aria-label="Informations légales">
        <span className="vf__col-title">Légal</span>
        {LEGAL_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className="vf__link">
            {l.label}
          </Link>
        ))}
      </nav>
      <p className="vf__copy">© {year} Beauty Savage. Tous droits réservés.</p>
    </div>
  );
}
