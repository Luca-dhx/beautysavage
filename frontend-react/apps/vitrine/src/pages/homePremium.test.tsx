// RX3 S4 — Accueil premium : hero CMS, sections prestations/formations, teaser carte cadeau, pourquoi, FAQ, CTA final.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders, stubFetch, jsonResponse } from '../test/utils';
import { HomePage } from './HomePage';

afterEach(() => vi.unstubAllGlobals());

function stubHome() {
  stubFetch((url) => {
    if (url.includes('/api/vitrine/site-identity')) return jsonResponse({ siteName: 'Institut Test', logoUrlResolved: '' });
    if (url.includes('/api/vitrine/home-settings')) return jsonResponse({ ok: true, settings: { slogan: 'La beauté autrement', banner: {} } });
    if (url.includes('/api/vitrine/services/boosted')) return jsonResponse({ ok: true, services: [{ id: 's1', slug: 'soin', name: 'Soin phare', price: 50, duration: 60 }] });
    if (url.includes('/api/vitrine/services')) return jsonResponse({ ok: true, services: [] });
    if (url.includes('/api/vitrine/shop')) return jsonResponse({ ok: true, formations: [{ id: 'f1', name: 'Formation A', price: 100 }], products: [] });
    if (url.includes('/api/vitrine/gift-cards')) return jsonResponse({ ok: true, config: { minAmount: 20, image: '' } });
    if (url.includes('/reviews')) return jsonResponse({ ok: true, averageRating: 0, reviewCount: 0, reviews: [], hasMore: false, total: 0 });
    return jsonResponse({ ok: true }, 404);
  });
}

describe('HomePage premium', () => {
  it('affiche le hero CMS, les sections et le CTA final', async () => {
    stubHome();
    renderWithProviders(<HomePage />);
    // Hero piloté par le CMS
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Institut Test', level: 1 })).toBeInTheDocument());
    expect(screen.getByText('La beauté autrement')).toBeInTheDocument();
    // Sections
    expect(screen.getByRole('heading', { name: 'Nos prestations' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nos formations' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Soin phare')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByText('Formation A')).toBeInTheDocument());
    // Teaser carte cadeau + pourquoi + FAQ + CTA final
    expect(screen.getByRole('heading', { name: 'Offrez la beauté' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pourquoi Beauty Savage' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Questions fréquentes' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Prête à commencer ?' })).toBeInTheDocument();
  });

  it('hero retombe sur le nom par défaut si le CMS est vide', async () => {
    stubFetch(() => jsonResponse({ ok: true }, 404));
    renderWithProviders(<HomePage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Beauty Savage', level: 1 })).toBeInTheDocument());
  });
});
