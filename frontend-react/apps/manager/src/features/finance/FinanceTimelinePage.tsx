// RX2.2 — Financial Timeline : la colonne vertébrale narrative. Résumé sticky + chips + cards.
// On lit, on comprend. Cards/drawer, jamais de table. Mobile = desktop.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FinanceTimelinePeriod, FinanceTimelineTypeFilter, FinanceTimelineItem } from '@bs/api-client';
import { useFinanceTimeline } from './useFinance';
import { FinanceSkeleton, FinanceError } from './components';
import {
  FinanceTimelineSummary, FinanceTimelineFilters, FinanceTimelineList,
  FinanceTimelineEmpty,
} from './timeline';
import { FinanceMovementDrawer } from './movementDrawer';
import './finance.css';
import './timeline.css';

export function FinanceTimelinePage() {
  const [period, setPeriod] = useState<FinanceTimelinePeriod>('month');
  const [type, setType] = useState<FinanceTimelineTypeFilter>('all');
  const [selected, setSelected] = useState<FinanceTimelineItem | null>(null);
  const { data, isLoading, isError, refetch } = useFinanceTimeline({ period, type, limit: 100 });

  return (
    <div className="fin-tl-page" data-testid="finance-timeline">
      <div className="fin-head">
        <h1 className="fin-head__title">Timeline financière</h1>
        <Link to="/finance" className="fin-tl-iconbtn" aria-label="Retour au tableau de bord finance">
          <i className="bi-grid-1x2" aria-hidden="true" />
        </Link>
      </div>

      {data ? <FinanceTimelineSummary summary={data.summary} /> : null}

      <FinanceTimelineFilters period={period} type={type} onPeriod={setPeriod} onType={setType} />

      {isLoading ? <FinanceSkeleton /> : null}
      {isError ? <FinanceError onRetry={() => void refetch()} /> : null}
      {data && data.items.length === 0 ? <FinanceTimelineEmpty /> : null}
      {data && data.items.length > 0 ? <FinanceTimelineList items={data.items} onSelect={setSelected} /> : null}

      <FinanceMovementDrawer item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
