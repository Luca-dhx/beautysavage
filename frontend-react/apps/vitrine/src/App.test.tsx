import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@bs/auth';
import { App } from './App';

describe('Vitrine App', () => {
  it("affiche la page d'accueil", async () => {
    render(
      <AuthProvider loader={async () => null}>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Accueil' })).toBeInTheDocument());
  });
});
