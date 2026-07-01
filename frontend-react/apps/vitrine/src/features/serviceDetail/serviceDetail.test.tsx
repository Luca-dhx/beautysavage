// RX3 S2 — Fiche prestation premium : options (impact prix), booking drawer, FAQ, pas d'avis (inexistant backend).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders, stubFetch, jsonResponse } from '../../test/utils';
import { ServiceDetailPage } from '../../pages/ServiceDetailPage';

afterEach(() => vi.unstubAllGlobals());

const SERVICE = {
  id: 's1',
  slug: 'soin',
  name: 'Soin visage',
  price: 50,
  duration: 30,
  paymentType: 'deposit',
  isBookable: true,
  photos: ['/uploads/a.jpg', '/uploads/b.jpg'],
  options: [{ id: 'o1', name: 'Masque', description: 'Masque hydratant', price: 10 }],
};

function stubDetail() {
  stubFetch((url) => {
    const u = new URL(url, 'http://x');
    if (u.pathname.endsWith('/api/vitrine/services/soin')) return jsonResponse({ ok: true, service: SERVICE });
    if (u.pathname.endsWith('/api/vitrine/services')) {
      return jsonResponse({ ok: true, services: [SERVICE, { id: 's2', slug: 'autre', name: 'Autre soin', price: 40 }] });
    }
    if (u.pathname.endsWith('/availability/days')) {
      const y = u.searchParams.get('year');
      const m = String(u.searchParams.get('month')).padStart(2, '0');
      return jsonResponse({ ok: true, availableDays: [`${y}-${m}-15`] });
    }
    if (u.pathname.endsWith('/availability/slots')) return jsonResponse({ ok: true, slots: [] });
    return jsonResponse({ ok: true }, 404);
  });
}

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/prestations/:slug" element={<ServiceDetailPage />} />
    </Routes>,
    '/prestations/soin',
  );
}

describe('ServiceDetailPage premium', () => {
  it('affiche titre, galerie (2 photos), options, FAQ et prestations similaires', async () => {
    stubDetail();
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Soin visage', level: 1 })).toBeInTheDocument());
    // galerie : image principale + vignettes
    expect(screen.getByRole('listitem', { name: 'Photo 2 sur 2' })).toBeInTheDocument();
    // option présente
    expect(screen.getByRole('checkbox', { name: /Masque/ })).toBeInTheDocument();
    // FAQ (dérivée de données réelles)
    expect(screen.getByRole('heading', { name: 'Questions fréquentes' })).toBeInTheDocument();
    // similaires (autre prestation)
    await waitFor(() => expect(screen.getByText('Autre soin')).toBeInTheDocument());
  });

  it('cocher une option augmente le prix total (50 → 60)', async () => {
    stubDetail();
    renderPage();
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Masque/ })).toBeInTheDocument());
    expect(screen.getAllByText(/50,00/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('checkbox', { name: /Masque/ }));
    await waitFor(() => expect(screen.getAllByText(/60,00/).length).toBeGreaterThan(0));
  });

  it('le CTA Réserver ouvre le drawer de réservation', async () => {
    stubDetail();
    renderPage();
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Réserver' }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole('button', { name: 'Réserver' })[0]);
    expect(screen.getByRole('dialog', { name: /Réserver — Soin visage/ })).toBeInTheDocument();
  });

  it("n'affiche PAS de section avis (inexistante pour les prestations)", async () => {
    stubDetail();
    renderPage();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Soin visage', level: 1 })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Avis' })).toBeNull();
  });
});
