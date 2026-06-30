// RX2.1 — Finance Dashboard : la page d'accueil financière. On ouvre, on comprend tout.
// « Aujourd'hui : +2 480 € · 32 ventes · X soldes à encaisser · Y remboursements · Z factures. »
// Cards + KPIs + actions. Jamais de tableau. Mobile = desktop.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FinanceRange } from '@bs/api-client';
import { useFinanceDashboard } from './useFinance';
import {
  RangeSwitch, FinanceHero, BreakdownChips, ActionCard,
  FinanceSkeleton, FinanceError,
} from './components';
import './finance.css';

export function FinanceDashboardPage() {
  const navigate = useNavigate();
  const [range, setRange] = useState<FinanceRange>('today');
  const { data, isLoading, isError, refetch } = useFinanceDashboard(range);

  return (
    <div className="fin-page" data-testid="finance-dashboard">
      <div className="fin-head">
        <h1 className="fin-head__title">Finance</h1>
        <RangeSwitch value={range} onChange={setRange} />
      </div>

      {isLoading ? <FinanceSkeleton /> : null}
      {isError ? <FinanceError onRetry={() => void refetch()} /> : null}

      {data ? (
        <>
          <FinanceHero label={data.rangeLabel} revenue={data.today.revenue} salesCount={data.today.salesCount} />

          <Link to="/finance/timeline" className="fin-card fin-actioncard" data-testid="fin-timeline-link">
            <span className="fin-actioncard__icon"><i className="bi-list-ul" aria-hidden="true" /></span>
            <span className="fin-actioncard__body">
              <span className="fin-actioncard__value">Timeline financière</span>
              <span className="fin-actioncard__label">Tous les mouvements, ordonnés</span>
            </span>
            <i className="bi-chevron-right fin-actioncard__chev" aria-hidden="true" />
          </Link>

          <section className="fin-section" aria-label="Ventilation des ventes">
            <BreakdownChips breakdown={data.today.breakdown} giftCardConsumption={data.today.giftCardConsumption} />
          </section>

          <section className="fin-section" aria-label="À traiter">
            <h2 className="fin-section__title"><i className="bi-list-check" aria-hidden="true" /> À traiter</h2>
            <div className="fin-actions">
              <ActionCard
                icon="bi-cash-coin"
                label="À encaisser sur place"
                unit="solde"
                metric={data.actions.balancesToCollect}
                onClick={() => navigate('/reservations')}
              />
              <ActionCard
                icon="bi-arrow-counterclockwise"
                label="Remboursements à traiter"
                unit="remboursement"
                warn
                metric={data.actions.refundsToProcess}
                onClick={() => navigate('/remboursements')}
              />
              <ActionCard
                icon="bi-file-earmark-text"
                label="Factures impayées"
                unit="facture"
                warn
                metric={data.actions.unpaidInvoices}
                onClick={() => navigate('/ventes')}
              />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
