// M10 — Planning React : vue jour mobile, semaine desktop, cartes, drawer, solde, actions,
// filtres, pas de table.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CalendarItem } from '@bs/api-client';
import { PlanningPage } from './PlanningPage';

function todayAt(h: number): string {
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toISOString();
}

const BOOKING: CalendarItem = {
  id: 'BKG-1', type: 'service_booking', title: 'Soin visage', startAt: todayAt(10), endAt: todayAt(11),
  status: 'confirmed', client: { name: 'Jane D.' }, participant: null,
  paymentStatus: 'deposit_paid', paymentType: 'deposit', refundStatus: null,
  totalAmount: 100, depositAmount: 30, amountPaidOnline: 30, balanceDueAmount: 70,
  balanceSettlementMode: 'pay_on_site',
  actionLinks: { detail: true, cancel: true, markBalancePaid: true, reschedule: true },
  sourceModel: 'ServiceBooking', sourceId: 'x',
};
const FORMATION: CalendarItem = {
  id: 'F-1-d1', type: 'formation_session', title: 'Formation : CILS', startAt: todayAt(14), endAt: todayAt(17),
  status: 'active', client: null, participant: { reservedCount: 2, maxClients: 5, placesLeft: 3 },
  paymentStatus: null, paymentType: null, refundStatus: null, totalAmount: null, depositAmount: null,
  amountPaidOnline: null, balanceDueAmount: null, balanceSettlementMode: null,
  actionLinks: { detail: false, cancel: false, markBalancePaid: false, reschedule: false },
  sourceModel: 'FormationSession', sourceId: 'F-1',
};

const calls: { url: string; method: string }[] = [];
function installFetch() {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    const u = String(url);
    if (u.includes('/calendar/items')) {
      return new Response(JSON.stringify({ ok: true, items: [BOOKING, FORMATION] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
}
afterEach(() => vi.unstubAllGlobals());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/planning']}>
        <PlanningPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Planning global (M10)', () => {
  it('vue jour (mobile) rend les cartes + pas de table', async () => {
    installFetch();
    renderPage();
    await waitFor(() => expect(screen.getByTestId('pl-agenda')).toBeInTheDocument());
    expect(screen.getByText('Soin visage')).toBeInTheDocument();
    expect(screen.getByTestId('pl-formation-card')).toBeInTheDocument();
    expect(document.querySelector('table')).toBeNull();
  });

  it('bascule en vue semaine (desktop)', async () => {
    installFetch();
    renderPage();
    await screen.findByTestId('pl-agenda');
    fireEvent.click(screen.getByRole('button', { name: 'Semaine' }));
    await waitFor(() => expect(screen.getByTestId('pl-week')).toBeInTheDocument());
  });

  it('ouvre le drawer détail et affiche le solde restant', async () => {
    installFetch();
    renderPage();
    fireEvent.click(await screen.findByText('Soin visage'));
    await waitFor(() => expect(screen.getByTestId('pl-drawer')).toBeInTheDocument());
    expect(screen.getByTestId('pl-balance-due')).toHaveTextContent('70,00 €');
    expect(screen.getByTestId('pl-paid-online')).toHaveTextContent('30,00 €');
  });

  it('action « Marquer le solde payé » appelle l\'API', async () => {
    installFetch();
    renderPage();
    fireEvent.click(await screen.findByText('Soin visage'));
    const btn = await screen.findByRole('button', { name: /Marquer le solde payé/i });
    fireEvent.click(btn);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url.includes('/BKG-1/balance-paid'))).toBe(true));
  });

  it('filtre par type recharge avec le bon paramètre', async () => {
    installFetch();
    renderPage();
    await screen.findByTestId('pl-agenda');
    fireEvent.click(screen.getByRole('tab', { name: 'Formations' }));
    await waitFor(() => expect(calls.some((c) => c.url.includes('type=formation_session'))).toBe(true));
  });

  it('action report ACTIVE (M11B) : ouvre le formulaire de report', async () => {
    installFetch();
    renderPage();
    fireEvent.click(await screen.findByText('Soin visage'));
    const reportBtn = await screen.findByTestId('pl-reschedule-open');
    expect(reportBtn).toBeEnabled();
    fireEvent.click(reportBtn);
    expect(await screen.findByTestId('pl-reschedule-form')).toBeInTheDocument();
  });
});
