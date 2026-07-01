// RX4 — Mes rendez-vous (P3). Réservations de prestations en cards (jamais de tableau). Lecture seule en
// S1 : date, heure, prestation, statut, paiement, reste à payer, facture. Annulation/report = S2.
import { Link } from 'react-router-dom';
import { Badge, EmptyState, ErrorState, Skeleton } from '@bs/ui';
import { formatPrice, bookingInvoiceUrl, type ClientBooking } from '@bs/api-client';
import {
  AccountShell,
  useMyBookings,
  formatLongDate,
  formatTimeRange,
  bookingBalanceDue,
  bookingStatusLabel,
  bookingStatusTone,
  isUpcomingBooking,
} from '../features/account';

function BookingCard({ b }: { b: ClientBooking }) {
  const balance = bookingBalanceDue(b);
  return (
    <article className="bs-hl bs-hl--plain">
      <div className="bs-hl__row">
        <h2 className="bs-hl__title">{b.serviceName || 'Prestation'}</h2>
        <Badge tone={bookingStatusTone(b.status, b.startAt)}>{bookingStatusLabel(b.status)}</Badge>
      </div>
      <div className="bs-hl__meta">
        <span><i className="bi bi-calendar3" aria-hidden="true" /> {formatLongDate(b.startAt) || '—'}</span>
        <span><i className="bi bi-clock" aria-hidden="true" /> {formatTimeRange(b.startAt, b.endAt) || '—'}</span>
        <span><i className="bi bi-cash-coin" aria-hidden="true" /> {formatPrice(b.totalPrice)}</span>
        {balance > 0 ? <span><i className="bi bi-wallet2" aria-hidden="true" /> Reste {formatPrice(balance)}</span> : null}
      </div>
      {b.saleId ? (
        <a className="bs-btn bs-btn--secondary bs-hl__cta" href={bookingInvoiceUrl(b.bookingId)} target="_blank" rel="noopener noreferrer">
          <i className="bi bi-download" aria-hidden="true" /> Facture
        </a>
      ) : null}
    </article>
  );
}

export function MyAppointmentsPage() {
  const query = useMyBookings();

  return (
    <AccountShell title="Mes rendez-vous">
      {query.isPending ? (
        <Skeleton variant="block" height="120px" count={2} />
      ) : query.isError ? (
        <ErrorState title="Impossible de charger vos rendez-vous." />
      ) : (query.data ?? []).length === 0 ? (
        <>
          <EmptyState label="Vous n'avez pas encore de rendez-vous." />
          <Link className="bs-btn" to="/prestations" style={{ marginTop: 'var(--bs-space-2)' }}>Découvrir les prestations</Link>
        </>
      ) : (
        <RenderBookings bookings={query.data ?? []} />
      )}
    </AccountShell>
  );
}

function RenderBookings({ bookings }: { bookings: ClientBooking[] }) {
  const upcoming = bookings.filter((b) => isUpcomingBooking(b));
  const past = bookings.filter((b) => !isUpcomingBooking(b));
  return (
    <>
      {upcoming.length > 0 ? (
        <div className="bs-hub__section">
          <div className="bs-hub__section-head"><h2 className="bs-hub__section-title">À venir</h2></div>
          <div className="bs-hub__list">{upcoming.map((b) => <BookingCard key={b.id} b={b} />)}</div>
        </div>
      ) : null}
      {past.length > 0 ? (
        <div className="bs-hub__section">
          <div className="bs-hub__section-head"><h2 className="bs-hub__section-title">Passés</h2></div>
          <div className="bs-hub__list">{past.map((b) => <BookingCard key={b.id} b={b} />)}</div>
        </div>
      ) : null}
    </>
  );
}
