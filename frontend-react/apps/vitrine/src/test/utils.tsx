import type { ReactNode } from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@bs/auth';

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Stub global.fetch : le handler reçoit l'URL et renvoie une Response (ou throw pour erreur réseau). */
export function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      return handler(url);
    }),
  );
}

/** Rend un composant avec QueryClient (retry off), AuthProvider (anonyme) et MemoryRouter. */
export function renderWithProviders(ui: ReactNode, initialPath = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider loader={async () => null}>
        <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
