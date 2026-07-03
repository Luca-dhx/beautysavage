// RX-BLOCKER — Sidebar mobile manager : burger → drawer slide-in (overlay + fermeture), pas de <table>.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@bs/auth';
import type { AuthUser } from '@bs/api-client';
import { ManagerLayout } from './ManagerLayout';

function stub() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
}
function renderLayout(user: AuthUser) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AuthProvider loader={async () => user}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<ManagerLayout />}>
              <Route index element={<div>CONTENU</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
const dev: AuthUser = { id: '1', email: 'dev@b.c', role: 'dev', currentMode: 'gestion' };

afterEach(() => vi.unstubAllGlobals());

describe('ManagerLayout — sidebar mobile (RX-BLOCKER)', () => {
  it('burger présent ; drawer fermé par défaut', () => {
    stub();
    renderLayout(dev);
    expect(screen.getByRole('button', { name: 'Ouvrir le menu' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Menu de navigation' })).toBeNull();
  });

  it('clic burger → drawer ouvert (nav) ; fermeture → drawer fermé', () => {
    stub();
    const { container } = renderLayout(dev);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    const drawer = screen.getByRole('dialog', { name: 'Menu de navigation' });
    expect(drawer).toBeInTheDocument();
    // Les liens de nav sont présents dans le drawer (statiques, indépendants de l'auth).
    expect(within(drawer).getByRole('link', { name: 'Clients' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fermer le menu' }));
    expect(screen.queryByRole('dialog', { name: 'Menu de navigation' })).toBeNull();
    // Zéro tableau.
    expect(container.querySelector('table')).toBeNull();
  });

  it('Escape ferme le drawer', () => {
    stub();
    renderLayout(dev);
    fireEvent.click(screen.getByRole('button', { name: 'Ouvrir le menu' }));
    expect(screen.getByRole('dialog', { name: 'Menu de navigation' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Menu de navigation' })).toBeNull();
  });
});
