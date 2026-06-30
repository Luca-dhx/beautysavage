// M13 — Drawers d'actions Customer 360 : créer carte cadeau, débit manuel (code → preview → confirm
// + fallback QR), réservation manuelle (hold + confirm), note interne. Mobile-first, aucune table.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Customer360Page } from './index';

const C360 = {
  ok: true,
  customer: { id: 'c1', firstName: 'Jane', lastName: 'Doe', displayName: 'Jane Doe', email: 'jane@test.local', phone: '0102030405', photo: null, createdAt: '2026-01-01', lastLogin: null, isActive: true, bookingSuspended: false },
  summary: { customerId: 'c1', displayName: 'Jane Doe', firstName: 'Jane', lastName: 'Doe', email: 'jane@test.local', phone: '0102030405', photo: null, createdAt: '2026-01-01', status: 'active', kpis: { salesCount: 0, totalSpent: 0, totalHT: 0, servicesCount: 0, formationsCount: 0, productsCount: 0, giftCardsCount: 0, refundsCount: 0, upcomingBookingsCount: 0 }, nextBooking: null, lastActivity: null },
  timeline: [], sales: [], bookings: [], formations: [], products: [], giftCards: [], refunds: [], documents: [], communications: [], notifications: [],
  financial: { totalSpent: 0, depositsPaid: 0, balanceDue: 0, pendingBalances: [], giftCardsBalance: 0, giftCardsCount: 0, refundsTotal: 0, refundsCount: 0, lastInvoice: null, unpaidInvoicesCount: 0, unpaidInvoices: [] },
};

const calls: { url: string; method: string; body: unknown }[] = [];
function json(p: unknown, s = 200) { return new Response(JSON.stringify(p), { status: s, headers: { 'Content-Type': 'application/json' } }); }
function installFetch() {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method || 'GET';
    calls.push({ url: u, method, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (u.includes('/360')) return json(C360);
    if (u.includes('/gift-cards/templates')) return json({ ok: true, templates: [{ id: 't1', name: 'Default', slug: 'default', html: '', css: '', variables: [], previewData: null, visible: true, active: true, version: 1, status: 'published', isSystemDefault: true, createdBy: '', updatedBy: '' }] });
    if (u.includes('/gift-cards/manual')) return json({ ok: true, giftCard: { id: 'g1', code: 'GC-NEW', password: 'PIN9', amount: 50, balance: 50, status: 'active', purchasedAt: null, createdAt: null, creationMode: 'manual_institute', paymentMode: 'on_site', paymentLabel: 'Paiement sur place', cardVisualUrl: null, generatedPdfUrl: null } }, 201);
    if (u.includes('/gift-cards/lookup')) return json({ ok: true, card: { id: 'g1', code: 'GC-1', amount: 100, balance: 80, availableBalance: 80, status: 'active', purchasedAt: null, createdAt: null } });
    if (u.includes('/manual-debit')) {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.preview) return json({ ok: true, preview: true, amount: 20, balanceBefore: 80, balanceAfter: 60 });
      return json({ ok: true, card: { id: 'g1', code: 'GC-1', amount: 100, balance: 60, status: 'active', purchasedAt: null, createdAt: null }, transaction: { id: 'tx', amount: 20, balanceBefore: 80, balanceAfter: 60, saleId: '', createdAt: null, transactionType: 'manual_debit', note: 'x' } });
    }
    if (u.includes('/gestion/services')) return json({ ok: true, services: [{ id: 's1', name: 'Soin', duration: 60, price: 80, effectivePrice: 80, isBookable: true, options: [] }] });
    if (u.includes('/availability/slots')) return json({ ok: true, slots: [{ start: '2026-07-01T10:00', end: '2026-07-01T11:00' }] });
    if (u.includes('/bookings/hold/release')) return json({ ok: true, released: 1 });
    if (u.includes('/bookings/hold')) return json({ ok: true, hold: { holdToken: 'HOLD-1', expiresAt: '2026-07-01T10:05', slotStartAt: '2026-07-01T10:00', slotEndAt: '2026-07-01T11:00' } }, 201);
    if (u.includes('/bookings/manual')) return json({ ok: true, booking: { bookingId: 'BKG-1', startAt: '2026-07-01T10:00' }, paymentMode: 'on_site', balanceDueAmount: 80 }, 201);
    if (u.includes('/notes')) {
      if (method === 'POST') return json({ ok: true, note: { id: 'n1', body: 'Allergie connue', authorRole: 'admin', authorLabel: 'admin@b.c', createdAt: '2026-06-01' } }, 201);
      return json({ ok: true, notes: [] });
    }
    return json({ ok: true });
  }));
}
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/clients/c1']}>
        <Routes><Route path="/clients/:id" element={<Customer360Page />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Customer 360 — drawers M13', () => {
  it('aucune <table> dans la fiche', async () => {
    installFetch();
    const { container } = renderPage();
    await screen.findByTestId('c3-hero');
    expect(container.querySelector('table')).toBeNull();
  });

  it('créer carte cadeau : formulaire → soumission → succès avec code', async () => {
    installFetch();
    renderPage();
    await screen.findByTestId('c3-hero');
    fireEvent.click(screen.getAllByRole('button', { name: /Créer carte cadeau/i })[0]);
    fireEvent.change(await screen.findByPlaceholderText('Nom du bénéficiaire'), { target: { value: 'Marie' } });
    fireEvent.change(screen.getByPlaceholderText('50'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: /Créer la carte cadeau/i }));
    expect(await screen.findByTestId('gc-create-success')).toBeInTheDocument();
    expect(screen.getByText('GC-NEW')).toBeInTheDocument();
    expect(screen.getByText('Paiement sur place')).toBeInTheDocument();
  });

  it('débit manuel : lookup code → preview → confirmation', async () => {
    installFetch();
    renderPage();
    await screen.findByTestId('c3-hero');
    fireEvent.click(screen.getByRole('button', { name: /Débit carte cadeau/i }));
    fireEvent.change(await screen.findByPlaceholderText('GC-XXXX'), { target: { value: 'GC-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Rechercher la carte/i }));
    expect(await screen.findByTestId('gc-debit-card')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '20' } });
    fireEvent.change(screen.getByPlaceholderText('Motif du débit'), { target: { value: 'erreur de saisie' } });
    fireEvent.click(screen.getByRole('button', { name: /Aperçu du solde restant/i }));
    expect(await screen.findByTestId('gc-debit-preview')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Confirmer le débit/i }));
    expect(await screen.findByTestId('gc-debit-success')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/manual-debit') && c.body && (c.body as { preview?: boolean }).preview === true)).toBe(true);
    expect(calls.some((c) => c.url.includes('/manual-debit') && c.body && !(c.body as { preview?: boolean }).preview)).toBe(true);
  });

  it('débit manuel : fallback QR (coller le payload)', async () => {
    installFetch();
    renderPage();
    await screen.findByTestId('c3-hero');
    fireEvent.click(screen.getByRole('button', { name: /Débit carte cadeau/i }));
    fireEvent.change(await screen.findByTestId('gc-debit-qr'), { target: { value: 'QR-PAYLOAD-XYZ' } });
    fireEvent.click(screen.getByRole('button', { name: /Rechercher la carte/i }));
    expect(await screen.findByTestId('gc-debit-card')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/lookup-qr') && c.method === 'POST')).toBe(true);
  });

  it('réservation manuelle : service → date → créneau (hold) → confirmation', async () => {
    installFetch();
    renderPage();
    await screen.findByTestId('c3-hero');
    fireEvent.click(screen.getAllByRole('button', { name: /Réserver/i })[0]);
    const serviceSelect = await screen.findByTestId('mb-service');
    // attendre que l'option du service soit chargée avant de la sélectionner
    await within(serviceSelect).findByRole('option', { name: /Soin/i });
    fireEvent.change(serviceSelect, { target: { value: 's1' } });
    // un slot apparaît après chargement (bouton dans la grille de créneaux)
    const slotsWrap = await screen.findByTestId('mb-slots');
    const slotBtn = await within(slotsWrap).findByRole('button');
    fireEvent.click(slotBtn);
    expect(await screen.findByTestId('mb-hold')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/bookings/hold') && c.method === 'POST')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Confirmer la réservation/i }));
    expect(await screen.findByTestId('mb-success')).toBeInTheDocument();
    const manualCall = calls.find((c) => c.url.includes('/bookings/manual'));
    expect(manualCall).toBeTruthy();
    expect((manualCall?.body as { holdToken?: string }).holdToken).toBe('HOLD-1');
  });

  it('note interne : textarea → ajout → succès', async () => {
    installFetch();
    renderPage();
    await screen.findByTestId('c3-hero');
    fireEvent.click(screen.getAllByRole('button', { name: /Ajouter une note/i })[0]);
    fireEvent.change(await screen.findByTestId('note-body'), { target: { value: 'Allergie connue' } });
    fireEvent.click(screen.getByRole('button', { name: /Ajouter la note/i }));
    expect(await screen.findByTestId('note-success')).toBeInTheDocument();
    expect(calls.some((c) => c.url.includes('/notes') && c.method === 'POST')).toBe(true);
  });

  it('appeler le client : action présente (téléphone renseigné)', async () => {
    installFetch();
    renderPage();
    await screen.findByTestId('c3-hero');
    const callBtns = screen.getAllByRole('button', { name: /Appeler le client/i });
    expect(callBtns.length).toBeGreaterThan(0);
    expect(callBtns[0]).not.toBeDisabled();
  });
});
