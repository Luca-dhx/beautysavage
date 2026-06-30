// RX1 — Espace compte client : profil + hub + déconnexion (zéro table, mobile-first).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyAccountPage } from './MyAccountPage';

const authState: { user: unknown; status: string; signOut: ReturnType<typeof vi.fn> } = {
  user: { id: '1', email: 'cliente@test.fr', role: 'client' },
  status: 'authenticated',
  signOut: vi.fn(async () => {}),
};

vi.mock('@bs/auth', () => ({
  useAuth: () => ({ ...authState, refresh: async () => {} }),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/mon-compte']}>
      <MyAccountPage />
    </MemoryRouter>,
  );
}

describe('MyAccountPage (RX1)', () => {
  beforeEach(() => {
    authState.user = { id: '1', email: 'cliente@test.fr', role: 'client' };
    authState.status = 'authenticated';
    authState.signOut = vi.fn(async () => {});
  });

  it('authentifié : profil + hub + déconnexion (pas de table)', () => {
    const { container } = renderPage();
    expect(screen.getByText('cliente@test.fr')).toBeInTheDocument();
    expect(screen.getByText('Mes formations')).toBeInTheDocument();
    expect(screen.getByText('Déconnexion')).toBeInTheDocument();
    expect(container.querySelector('table')).toBeNull();
  });

  it('déconnexion appelle signOut', async () => {
    renderPage();
    fireEvent.click(screen.getByText('Déconnexion'));
    await waitFor(() => expect(authState.signOut).toHaveBeenCalled());
  });

  it('non authentifié : invite à se connecter', () => {
    authState.user = null;
    authState.status = 'unauthenticated';
    renderPage();
    expect(screen.getByText('Se connecter')).toBeInTheDocument();
  });
});
