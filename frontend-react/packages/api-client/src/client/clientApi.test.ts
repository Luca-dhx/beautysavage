// RX4 — Espace client : endpoints + normalisation (le serveur fait foi).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { listMyBookings, bookingInvoiceUrl } from './bookings';
import { listMyGiftCards, getMyGiftCard } from './giftCards';
import { listMySales, saleInvoiceUrl } from './sales';
import { updateMyProfile, requestPasswordReset } from './profile';

function json(payload: unknown) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
const calls: { url: string; init?: RequestInit }[] = [];
function installFetch(payload: unknown) {
  calls.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => { calls.push({ url: String(url), init }); return json(payload); }));
}
afterEach(() => vi.unstubAllGlobals());

describe('client api — bookings', () => {
  it('listMyBookings cible /api/client/bookings et tolère une réponse vide', async () => {
    installFetch({ ok: true });
    const res = await listMyBookings();
    expect(res).toEqual([]);
    expect(calls[0].url).toContain('/api/client/bookings');
  });
  it('bookingInvoiceUrl encode l\'identifiant', () => {
    expect(bookingInvoiceUrl('b 1')).toContain('/api/client/bookings/b%201/invoice');
  });
});

describe('client api — gift cards', () => {
  it('listMyGiftCards renvoie les cartes', async () => {
    installFetch({ ok: true, cards: [{ id: 'g1', code: 'ABCD1234', availableBalance: 20 }] });
    const res = await listMyGiftCards();
    expect(res.length).toBe(1);
    expect(res[0].code).toBe('ABCD1234');
    expect(calls[0].url).toContain('/api/client/gift-cards/my');
  });
  it('getMyGiftCard renvoie carte + transactions (défaut [])', async () => {
    installFetch({ ok: true, card: { id: 'g1', code: 'X' } });
    const res = await getMyGiftCard('g1');
    expect(res.card.id).toBe('g1');
    expect(res.transactions).toEqual([]);
    expect(calls[0].url).toContain('/api/client/gift-cards/g1');
  });
});

describe('client api — sales', () => {
  it('normalise date_achat, giftCardTotal et items', async () => {
    installFetch({
      ok: true,
      sales: [{
        id: 's1', date_achat: '2026-02-01T10:00:00Z', totalAmount: 100,
        items: [{ type: 'formation', name: 'Cours', price: 100 }],
        giftCardUsage: [{ amountUsed: 30 }, { amountUsed: 10 }],
        accepted_cgv: true, invoice: null,
      }],
    });
    const res = await listMySales();
    expect(res[0].dateAchat).toBe('2026-02-01T10:00:00Z');
    expect(res[0].giftCardTotal).toBe(40);
    expect(res[0].itemCount).toBe(1);
    expect(res[0].acceptedCgv).toBe(true);
    expect(calls[0].url).toContain('/api/client/sales');
  });
  it('saleInvoiceUrl construit le lien de téléchargement', () => {
    expect(saleInvoiceUrl('s1')).toContain('/api/client/sales/s1/invoice');
  });
});

describe('client api — profile', () => {
  it('updateMyProfile envoie un PUT et normalise la réponse', async () => {
    installFetch({ ok: true, user: { firstName: 'Julie', lastName: 'Martin', email: 'j@test.fr' } });
    const res = await updateMyProfile({ firstName: 'Julie' });
    expect(res.firstName).toBe('Julie');
    expect(calls[0].url).toContain('/api/client/profile');
    expect(calls[0].init?.method).toBe('PUT');
  });
  it('requestPasswordReset poste l\'e-mail', async () => {
    installFetch({ ok: true });
    await requestPasswordReset('j@test.fr');
    expect(calls[0].url).toContain('/auth/password-reset/request');
    expect(calls[0].init?.method).toBe('POST');
  });
});
