import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, ErrorState } from '@bs/ui';
import { useAuth } from '@bs/auth';
import { login, ApiError } from '@bs/api-client';
import { useCart } from '../features/cart/CartProvider';

// N'accepte qu'une cible interne (anti open-redirect) : commence par "/" mais pas "//".
function safeRedirect(raw: string | null, fallback: string): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return fallback;
}

// Login client léger (R2C). Pas d'inscription / reset password (hors périmètre).
export function LoginPage() {
  const { refresh } = useAuth();
  const { items } = useCart();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fallback = items.length > 0 ? '/checkout' : '/';
  const redirectTo = safeRedirect(params.get('redirect'), fallback);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await login(email.trim(), password);
      await refresh(); // recharge /auth/me dans l'AuthProvider
      navigate(redirectTo);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Connexion impossible. Réessayez.');
      setSubmitting(false);
    }
  };

  return (
    <section style={{ maxWidth: 420 }}>
      <Card>
        <h1>Connexion</h1>
        <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bs-space-3)' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bs-space-1)' }}>
            <span>E-mail</span>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 'var(--bs-space-1)' }}>
            <span>Mot de passe</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(ev) => setPassword(ev.target.value)}
            />
          </label>
          {error ? <ErrorState title="Échec de la connexion." detail={error} /> : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Connexion…' : 'Se connecter'}
          </Button>
        </form>
        <p className="bs-note" style={{ marginTop: 'var(--bs-space-3)' }}>
          <Link to="/">← Retour à l’accueil</Link>
        </p>
      </Card>
    </section>
  );
}
