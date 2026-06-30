// C3 — Modération avis (UI) : rendu + filtres + action modération (zéro table).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReviewModerationPage } from './ReviewModerationPage';

const calls: { url: string; method: string }[] = [];
function installFetch() {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    if (init?.method === 'PATCH') {
      return new Response(JSON.stringify({ ok: true, review: { id: 'r1', status: 'rejected' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({
      ok: true,
      reviews: [{ id: 'r1', formationId: 'f1', formationName: 'Maquillage', authorName: 'Camille M.', rating: 5, comment: 'Top', status: 'published', createdAt: null, moderatedAt: null }],
      counts: { pending: 0, published: 1, rejected: 0 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
}
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  installFetch();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><ReviewModerationPage /></QueryClientProvider>);
}

describe('ReviewModerationPage', () => {
  it('liste les avis (cards, pas de table) et masque un avis', async () => {
    const { container } = renderPage();
    expect(await screen.findByText('Camille M.')).toBeInTheDocument();
    expect(container.querySelector('table')).toBeNull();
    fireEvent.click(screen.getByText('Masquer'));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH' && c.url.includes('/reviews/r1'))).toBe(true));
  });
});
