// M12 — Customer 360 (Client Hub). Page fiche client : Hero → KPIs → Quick Actions → onglets
// (Activité / Détails / Finances) avec timeline + sections repliables. Mobile-first, Motion Guideline.
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorState } from '@bs/ui';
import type { TimelineItem, CustomerBooking, CustomerSale } from '@bs/api-client';
import { useCustomer360 } from './useCustomer360';
import {
  CustomerHeader, CustomerHeroCard, CustomerSummaryCards, QuickActions, MobileBottomActions,
  CustomerFinancialCard, CustomerTimeline, Accordion, BookingSection, SaleSection, FormationSection,
  ProductSection, GiftCardSection, RefundSection, DocumentsSection, CommunicationsSection,
  NotificationSection, CustomerTabs, CustomerDrawer, CustomerSkeleton, fmtDateTime, fmtDate, money,
  type C3Tab, type QuickAction,
} from './components';
import './customer360.css';

type DrawerState = { title: string; rows: { label: string; value: string }[] } | null;

export function Customer360Page() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useCustomer360(id);
  const [tab, setTab] = useState<C3Tab>('activite');
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const quickActions: QuickAction[] = useMemo(() => [
    { key: 'booking', icon: 'bi-calendar-plus', label: 'Réservation', onClick: () => navigate('/planning') },
    { key: 'sale', icon: 'bi-bag-plus', label: 'Vente', onClick: () => navigate('/ventes') },
    { key: 'giftcard', icon: 'bi-gift', label: 'Carte cadeau', onClick: () => navigate('/cartes-cadeaux') },
    { key: 'planning', icon: 'bi-calendar3', label: 'Planning', onClick: () => navigate('/planning') },
    { key: 'refund', icon: 'bi-arrow-counterclockwise', label: 'Remboursement', onClick: () => navigate('/remboursements') },
    { key: 'docs', icon: 'bi-folder2-open', label: 'Documents', onClick: () => setTab('details') },
    { key: 'email', icon: 'bi-envelope', label: 'E-mail', onClick: () => navigate('/communication') },
  ], [navigate]);

  if (isLoading) return <section className="c3-page"><CustomerSkeleton /></section>;
  if (isError || !data) {
    return (
      <section className="c3-page">
        <ErrorState title="Fiche client indisponible." detail="Impossible de charger les données." />
        <button type="button" className="c3-quickbtn" onClick={() => void refetch()} style={{ marginTop: 'var(--bs-space-3)' }}>Réessayer</button>
      </section>
    );
  }

  const onTimelineSelect = (it: TimelineItem) => {
    setDrawer({
      title: it.title,
      rows: [
        { label: 'Type', value: it.type },
        { label: 'Date', value: fmtDateTime(it.date) },
        ...(it.subtitle ? [{ label: 'Détail', value: it.subtitle }] : []),
        ...(it.refId ? [{ label: 'Référence', value: it.refId }] : []),
      ],
    });
  };
  const onBookingSelect = (b: CustomerBooking) => setDrawer({
    title: b.serviceName,
    rows: [
      { label: 'Quand', value: fmtDateTime(b.startAt) },
      { label: 'Statut', value: b.status },
      { label: 'Total', value: money(b.totalPrice) },
      { label: 'Acompte', value: money(b.depositAmount) },
      { label: 'Solde sur place', value: money(b.balanceDueAmount) },
    ],
  });
  const onSaleSelect = (s: CustomerSale) => setDrawer({
    title: `Achat ${s.saleId}`,
    rows: [
      { label: 'Date', value: fmtDate(s.createdAt) },
      { label: 'Montant', value: money(s.totalAmount) },
      { label: 'Articles', value: s.items.map((i) => i.name).join(', ') || '—' },
    ],
  });

  return (
    <section className="c3-page" data-testid="c3-page">
      <CustomerHeader summary={data.summary} onBack={() => navigate('/clients')} />
      <CustomerHeroCard summary={data.summary} />
      <CustomerSummaryCards summary={data.summary} />
      <QuickActions actions={quickActions} />

      <CustomerTabs value={tab} onChange={setTab} />

      {tab === 'activite' ? (
        <CustomerTimeline items={data.timeline} onSelect={onTimelineSelect} />
      ) : null}

      {tab === 'finances' ? (
        <CustomerFinancialCard financial={data.financial} />
      ) : null}

      {tab === 'details' ? (
        <div className="c3-sections">
          <Accordion title="Réservations" icon="bi-calendar-check" count={data.bookings.length} defaultOpen testid="c3-acc-bookings">
            <BookingSection bookings={data.bookings} onSelect={onBookingSelect} />
          </Accordion>
          <Accordion title="Achats" icon="bi-bag-check" count={data.sales.length} testid="c3-acc-sales">
            <SaleSection sales={data.sales} onSelect={onSaleSelect} />
          </Accordion>
          <Accordion title="Formations" icon="bi-mortarboard" count={data.formations.length} testid="c3-acc-formations">
            <FormationSection formations={data.formations} />
          </Accordion>
          <Accordion title="Produits" icon="bi-box-seam" count={data.products.length} testid="c3-acc-products">
            <ProductSection products={data.products} />
          </Accordion>
          <Accordion title="Cartes cadeaux" icon="bi-gift" count={data.giftCards.length} testid="c3-acc-giftcards">
            <GiftCardSection giftCards={data.giftCards} />
          </Accordion>
          <Accordion title="Remboursements" icon="bi-arrow-counterclockwise" count={data.refunds.length} testid="c3-acc-refunds">
            <RefundSection refunds={data.refunds} />
          </Accordion>
          <Accordion title="Documents" icon="bi-folder2-open" count={data.documents.length} testid="c3-acc-documents">
            <DocumentsSection documents={data.documents} />
          </Accordion>
          <Accordion title="Communications" icon="bi-envelope" count={data.communications.length} testid="c3-acc-comms">
            <CommunicationsSection communications={data.communications} />
          </Accordion>
          <Accordion title="Notifications" icon="bi-bell" count={data.notifications.length} testid="c3-acc-notifs">
            <NotificationSection notifications={data.notifications} />
          </Accordion>
        </div>
      ) : null}

      <MobileBottomActions actions={quickActions} />

      <CustomerDrawer open={Boolean(drawer)} title={drawer?.title || ''} onClose={() => setDrawer(null)}>
        {drawer ? (
          <div className="c3-detail">
            {drawer.rows.map((r) => (
              <div className="c3-row" key={r.label}><span>{r.label}</span><strong>{r.value}</strong></div>
            ))}
          </div>
        ) : null}
      </CustomerDrawer>
    </section>
  );
}
