// RX1 — Espace compte client (React officiel). Comble le gap RC1 (#1 : ni logout ni compte en React).
// Hub mobile-first : carte profil + actions en cartes (pas de formulaire mur), déconnexion. « Faire
// mieux que Vanilla » : moins de clics, cartes, actions contextuelles. Réutilise @bs/ui.
import { useNavigate } from 'react-router-dom';
import { Card, Button, LoadingState } from '@bs/ui';
import { useAuth } from '@bs/auth';
import './myAccount.css';

interface HubItem {
  to: string;
  icon: string;
  label: string;
  desc: string;
  soon?: boolean;
}

const HUB: HubItem[] = [
  { to: '/mes-formations', icon: 'bi-mortarboard', label: 'Mes formations', desc: 'Cours, progression, attestations.' },
  { to: '/formations', icon: 'bi-bag-heart', label: 'Mes réservations', desc: 'Vos rendez-vous à venir.', soon: true },
  { to: '/cartes-cadeaux', icon: 'bi-gift', label: 'Mes cartes cadeaux', desc: 'Solde et utilisation.', soon: true },
  { to: '/mon-compte', icon: 'bi-receipt', label: 'Mes factures', desc: 'Reçus et documents.', soon: true },
];

export function MyAccountPage() {
  const { user, status, signOut } = useAuth();
  const navigate = useNavigate();

  if (status === 'loading') return <LoadingState label="Chargement de votre compte…" />;

  if (status !== 'authenticated' || !user) {
    return (
      <section className="bs-acc">
        <h1 className="bs-acc__title">Mon compte</h1>
        <Card>
          <p>Connectez-vous pour accéder à votre espace.</p>
          <Button onClick={() => navigate('/connexion?redirect=/mon-compte')}>Se connecter</Button>
        </Card>
      </section>
    );
  }

  const initials = (user.email || '?').slice(0, 2).toUpperCase();

  async function onLogout() {
    await signOut();
    navigate('/');
  }

  return (
    <section className="bs-acc">
      <h1 className="bs-acc__title">Mon compte</h1>

      <article className="bs-acc__profile">
        <span className="bs-acc__avatar" aria-hidden="true">{initials}</span>
        <div className="bs-acc__id">
          <strong className="bs-acc__name">Bonjour</strong>
          <span className="bs-acc__email">{user.email}</span>
        </div>
        <button type="button" className="bs-acc__logout" onClick={onLogout}>
          <i className="bi bi-box-arrow-right" aria-hidden="true" /> Déconnexion
        </button>
      </article>

      <div className="bs-acc__grid">
        {HUB.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`bs-acc__card${item.soon ? ' bs-acc__card--soon' : ''}`}
            onClick={() => { if (!item.soon) navigate(item.to); }}
            aria-disabled={item.soon || undefined}
          >
            <i className={`bi ${item.icon} bs-acc__icon`} aria-hidden="true" />
            <span className="bs-acc__label">{item.label}</span>
            <span className="bs-acc__desc">{item.desc}</span>
            {item.soon ? <span className="bs-acc__soon">Bientôt</span> : <i className="bi bi-chevron-right bs-acc__chev" aria-hidden="true" />}
          </button>
        ))}
      </div>
    </section>
  );
}
