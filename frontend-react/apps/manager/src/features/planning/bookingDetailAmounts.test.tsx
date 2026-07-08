import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CalendarItem } from '@bs/api-client';
import { CalendarItemDetailDrawer } from './components';

const ITEM: CalendarItem = {
  id: 'BKG-1',
  type: 'service_booking',
  title: 'Soin visage',
  startAt: '2026-07-08T10:00:00',
  endAt: '2026-07-08T11:00:00',
  status: 'confirmed',
  client: { name: 'Jane D.' },
  participant: null,
  paymentStatus: 'deposit_paid',
  paymentType: 'deposit',
  refundStatus: null,
  totalAmount: 100,
  depositAmount: 30,
  amountPaidOnline: 30,
  balanceDueAmount: 70,
  balanceSettlementMode: 'pay_on_site',
  actionLinks: { detail: true, cancel: true, markBalancePaid: true, reschedule: true },
  sourceModel: 'ServiceBooking',
  sourceId: 'x',
};

describe('booking detail amounts', () => {
  it('renders the three amount cards at the top of the drawer', () => {
    render(
      <CalendarItemDetailDrawer
        item={ITEM}
        onClose={() => {}}
        onCancel={() => {}}
        onMarkPaid={() => {}}
        onReschedule={async () => {}}
      />,
    );

    expect(screen.getByTestId('pl-amount-total')).toHaveTextContent('100,00 €');
    expect(screen.getByTestId('pl-amount-deposit')).toHaveTextContent('30,00 €');
    expect(screen.getByTestId('pl-amount-balance')).toHaveTextContent('70,00 €');
    expect(screen.getByText(/Reste à payer sur place/i)).toBeInTheDocument();
  });
});
